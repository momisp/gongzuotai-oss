"""ECS 云监控实况采集 + 简报/钉钉文案/Excel JSON。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from inspection.aliyun_cms import _client, fetch_ecs_metric_percent
from inspection.config import AccountCfg, AppConfig
from inspection.models import Finding, Level

REGION_ZH: dict[str, str] = {
    "cn-hangzhou": "华东 1（杭州）",
    "cn-shanghai": "华东 2（上海）",
    "cn-beijing": "华北 2（北京）",
    "cn-shenzhen": "华南 1（深圳）",
}


def _zh_region(region_id: str) -> str:
    return REGION_ZH.get(region_id, region_id)


def _zh_status(api_status: str | None) -> str:
    s = (api_status or "").lower()
    return "运行中" if s == "running" else (api_status or "—")


def _probe_disk_pct(region: str, iid: str, client: Any) -> float | None:
    candidates = [
        ("diskusage_utilization", {"device": "/"}),
        ("diskusage_utilization", {"device": "\\"}),
        ("diskusage_usedutilization", {"device": "/"}),
        ("diskusage_utilization", {}),
    ]
    for mn, xd in candidates:
        ex = xd if xd else None
        v = fetch_ecs_metric_percent(client, region, iid, mn, ex)
        if v is not None:
            return v
    return None


def _probe_memory_pct(region: str, iid: str, client: Any) -> float | None:
    for mn in ("memory_usedutilization", "MemoryUsedUtilization", "memory_utilization"):
        v = fetch_ecs_metric_percent(client, region, iid, mn, None)
        if v is not None:
            return v
    return None


def _live_row_level(
    cpu: float | None,
    mem: float | None,
    disk: float | None,
    cfg: AppConfig,
) -> Level:
    if cpu is None and mem is None and disk is None:
        return Level.INFO
    bad_c = cpu is not None and cpu >= cfg.cpu_critical
    bad_m = mem is not None and mem >= cfg.memory_critical
    if bad_c or bad_m:
        return Level.CRITICAL
    if (
        (cpu is not None and cpu >= cfg.cpu_warn)
        or (mem is not None and mem >= cfg.memory_warn)
        or (disk is not None and disk >= cfg.disk_warn)
    ):
        return Level.WARN
    return Level.OK


def _risk_tag_zh(
    cpu: float | None,
    mem: float | None,
    disk: float | None,
    cfg: AppConfig,
) -> str:
    if mem is not None and mem >= cfg.memory_critical:
        return "⚠️ 高内存风险"
    if mem is not None and mem >= cfg.memory_warn:
        return "⚠️ 高内存风险"
    if disk is not None and disk >= cfg.disk_warn:
        return "⚠️ 磁盘偏高"
    if cpu is not None and cpu >= cfg.cpu_critical:
        return "⚠️ CPU 风险"
    if cpu is not None and cpu >= cfg.cpu_warn:
        return "⚠️ CPU 偏高"
    return "✅ 正常"


def _ip_summary(inst: dict) -> str:
    ips = inst.get("PublicIpAddress", {}).get("IpAddress") or []
    raw = ""
    if ips and ips[0]:
        raw = str(ips[0])
    elif inst.get("EipAddress"):
        raw = str(inst.get("EipAddress"))
    if not raw:
        return "—"
    if len(raw) > 14:
        return raw[:13] + "…"
    return raw + "…"


def run_live_dashboard_for_account(
    account: AccountCfg,
    snapshots: list[tuple[str, dict[str, Any]]],
    cfg: AppConfig,
) -> tuple[list[Finding], dict[str, Any] | None]:
    """对实例快照逐项拉 CPU/内存/磁盘云监控最近一次点。"""
    if not snapshots:
        return [], None

    instances_out: list[dict[str, Any]] = []
    findings: list[Finding] = []
    memo_client: dict[str, Any] = {}

    def get_client(region: str) -> Any:
        key = region
        if key not in memo_client:
            memo_client[key] = _client(account, region)
        return memo_client[key]

    for region, inst in snapshots:
        iid = str(inst.get("InstanceId") or "")
        raw_name = inst.get("InstanceName") or iid or "—"

        cli = get_client(region)
        cpu_v = fetch_ecs_metric_percent(cli, region, iid, "CPUUtilization")
        mem_v = _probe_memory_pct(region, iid, cli)
        disk_v = _probe_disk_pct(region, iid, cli)

        tag = _risk_tag_zh(cpu_v, mem_v, disk_v, cfg)
        lvl_row = _live_row_level(cpu_v, mem_v, disk_v, cfg)

        parts_ann: list[str] = []
        if cpu_v is None:
            parts_ann.append("CPU 未取得")
        else:
            parts_ann.append(f"CPU≈{cpu_v:.2f}%")
        if mem_v is None:
            parts_ann.append("内存%未取得（需 agent/权限）")
        else:
            parts_ann.append(f"内存≈{mem_v:.2f}%")
        if disk_v is None:
            parts_ann.append("磁盘%未取得（盘符/agent）")
        else:
            parts_ann.append(f"磁盘≈{disk_v:.2f}%")
        annotation = "云监控最近一次采样：" + "，".join(parts_ann)

        lvl_f = Level.INFO if (cpu_v is None and mem_v is None and disk_v is None) else lvl_row

        findings.append(
            Finding(
                account=account.name,
                region=region,
                category="ecs_live",
                name=raw_name,
                resource_id=iid,
                level=lvl_f,
                summary=f"CPU:{cpu_v if cpu_v is not None else '—'}% MEM:{mem_v if mem_v is not None else '—'}% DISK:{disk_v if disk_v is not None else '—'}%",
                annotation=annotation,
                raw={"cpu": cpu_v, "memory": mem_v, "disk": disk_v, "riskTag": tag},
            )
        )

        instances_out.append(
            {
                "account": account.name,
                "name": raw_name,
                "instanceId": iid,
                "regionId": region,
                "regionLabel": _zh_region(region),
                "statusZh": _zh_status(inst.get("Status")),
                "ipSummary": _ip_summary(inst),
                "cpuPercent": cpu_v,
                "memoryPercent": mem_v,
                "diskPercent": disk_v,
                "riskTag": tag,
            }
        )

    return findings, {"account": account.name, "instances": instances_out}


def _fmt_rng(values: list[float], unit: str = "%") -> str:
    if not values:
        return "未取得"
    lo = min(values)
    hi = max(values)
    if abs(hi - lo) < 0.01:
        return f"{lo:.2f}{unit}"
    return f"{lo:.2f}%~{hi:.2f}{unit}"


def merge_ecs_dashboard(
    slices: list[dict[str, Any]],
    cfg: AppConfig,
    *,
    inspector: str,
    report_title: str,
) -> dict[str, Any]:
    merged: list[dict[str, Any]] = []
    for s in slices:
        merged.extend(s.get("instances") or [])

    n = len(merged)
    now = datetime.now(timezone.utc).astimezone()
    date_cn = now.strftime("%Y-%m-%d")
    inspector_line = inspector.strip() or "XXX"

    cpus = [x["cpuPercent"] for x in merged if x.get("cpuPercent") is not None]
    mems = [x["memoryPercent"] for x in merged if x.get("memoryPercent") is not None]
    disks = [x["diskPercent"] for x in merged if x.get("diskPercent") is not None]

    mem_risk_inst = [
        x["name"]
        for x in merged
        if x.get("memoryPercent") is not None and x["memoryPercent"] >= cfg.memory_warn
    ]

    risky_cpu_names = [
        x["name"]
        for x in merged
        if x.get("cpuPercent") is not None and x["cpuPercent"] >= cfg.cpu_warn
    ]

    risky_disk_names = [
        x["name"]
        for x in merged
        if x.get("diskPercent") is not None and x["diskPercent"] >= cfg.disk_warn
    ]

    all_running = not merged or all(x.get("statusZh") == "运行中" for x in merged)
    abnormal_count = sum(1 for x in merged if str(x.get("riskTag", "")).startswith("⚠"))

    if abnormal_count >= 2 or (
        merged and len(mem_risk_inst) + len(risky_cpu_names) + len(risky_disk_names) >= 3
    ):
        risk_lvl = "中风险"
    else:
        risk_lvl = "低风险"

    scope_line = (cfg.ecs_report_scope or "").strip()
    if not scope_line:
        hint = (cfg.ecs_application_group_hint or "").strip()
        if hint:
            scope_line = f"应用分组「{hint}」下 {n} 台 ECS 实例"
        else:
            scope_line = f"当前过滤条件下共 {n} 台 ECS 实例"

    alarm_bits: list[str] = []
    if mem_risk_inst:
        alarm_bits.append(
            f"{('、'.join(mem_risk_inst))} 内存偏高（告警参考 ≥{cfg.memory_warn:.0f}%）"
        )
    if risky_disk_names:
        alarm_bits.append(f"{('、'.join(risky_disk_names))} 磁盘偏高（≥{cfg.disk_warn:.0f}%）")
    if risky_cpu_names:
        alarm_bits.append(f"{('、'.join(risky_cpu_names))} CPU 偏高（≥{cfg.cpu_warn:.0f}%）")
    alarm_line = "；".join(alarm_bits) if alarm_bits else "无阈值级告警条目；请以明细表为准。"

    anomalies: list[dict[str, str]] = []
    for x in merged:
        if x.get("memoryPercent") is not None and x["memoryPercent"] >= cfg.memory_warn:
            pct = float(x["memoryPercent"])
            anomalies.append(
                {
                    "description": (
                        f"「{x['name']}」内存使用率当前约 {pct:.2f}%，已超过参考阈值 "
                        f"（警戒 {cfg.memory_warn:.0f}%）。"
                    ),
                    "suggestion": (
                        "持续观察内存曲线并与业务对齐高峰场景；"
                        "评估应用优化、JVM 参数或升降配。"
                    ),
                }
            )
        elif x.get("cpuPercent") is not None and x["cpuPercent"] >= cfg.cpu_warn:
            pct = float(x["cpuPercent"])
            anomalies.append(
                {
                    "description": f"「{x['name']}」CPU 利用率约 {pct:.2f}%（警戒 {cfg.cpu_warn:.0f}%）。",
                    "suggestion": "关注进程负载与瞬时洪峰；必要时限流或升配。",
                }
            )
        elif x.get("diskPercent") is not None and x["diskPercent"] >= cfg.disk_warn:
            pct = float(x["diskPercent"])
            anomalies.append(
                {
                    "description": (
                        f"「{x['name']}」磁盘使用率约 {pct:.2f}%（警戒 {cfg.disk_warn:.0f}%）。"
                    ),
                    "suggestion": "清理日志或无用大文件或在线扩容磁盘。",
                }
            )

    next_plan_para = (
        "持续跟踪异常实例的资源趋势；协同业务落地扩容或性能优化；顺带复核其余实例的云监控阈值配置。"
    )

    conclusion = (
        "各实例在云监控最近一次采样维度下未发现超阈值告警项（或未取到完备指标）；整体运行平稳。"
        if not anomalies
        else "已对超阈值关注点生成「异常」小节描述与建议；请逐项闭环。"
    )

    health_line = (
        f"合计 {n} 台 ECS，全部为「运行中」；无离线或异常关停记录。"
        if all_running and n > 0
        else ("当前列表未取到实例" if not n else "存在非「运行中」状态，请以明细表为准。")
    )

    bullets_overview = [
        health_line,
        (
            "阈值参考：内存≥%.0f%% / CPU≥%.0f%% / 磁盘≥%.0f%% → 记入异常分析。"
            % (cfg.memory_warn, cfg.cpu_warn, cfg.disk_warn)
        ),
        f"风险等级：**{risk_lvl}**（根据超阈值条目粗分）。",
        f"告警要点：{alarm_line}",
    ]

    ttl = (
        report_title.strip()
        if report_title.strip()
        else f"大派对应用分组-ECS巡检日报 {date_cn}"
    )

    rng_cpu = _fmt_rng(cpus)
    rng_mem = _fmt_rng(mems)
    rng_disk = _fmt_rng(disks)

    cpu_ok = bool(cpus) and max(cpus) < cfg.cpu_warn
    mem_ok_msg = rng_mem == "未取得" or (
        bool(mems) and max(mems) < cfg.memory_warn and not mem_risk_inst
    )
    disk_ok = bool(disks) and max(disks) < cfg.disk_warn

    ding_lines: list[str] = []
    ding_lines.append(f"【{ttl}】")
    ding_lines.append("")
    ding_lines.append(
        f"1. 实例总数：{n}台，"
        + ("全部运行正常" if all_running and n > 0 else ("无 ECS 条目" if n == 0 else "存在非 Running 条目"))
        + ""
    )

    ding_lines.append("2. 核心指标概览（最近一次云监控）：")
    cpu_tail = ""
    if rng_cpu != "未取得" and cpus:
        cpu_tail = (
            "，均低于告警阈值"
            if cpu_ok
            else f"，其中请关注：{'、'.join(risky_cpu_names)}" if risky_cpu_names else ""
        )
    ding_lines.append(f"   • CPU使用率：{rng_cpu}{cpu_tail}")

    if rng_mem != "未取得" and mems:
        if mem_risk_inst:
            worst_row = max(
                (x for x in merged if x.get("memoryPercent") is not None),
                key=lambda x: float(x["memoryPercent"]),  # type: ignore[arg-type]
            )
            mp = float(worst_row["memoryPercent"])
            ding_lines.append(
                "   • 内存使用率：" + rng_mem + f"，其中「{worst_row['name']}」约 {mp:.2f}%，存在风险"
            )
        else:
            ding_lines.append(
                f"   • 内存使用率：{rng_mem}"
                + ("，整体低于警戒线" if mem_ok_msg else "")
            )
    else:
        ding_lines.append("   • 内存使用率：未取得（请检查 Agent / RAM 权限）")

    ding_lines.append(
        f"   • 磁盘使用率：{rng_disk}"
        + (
            ""
            if rng_disk == "未取得"
            else ("，均正常" if disk_ok else f"，偏高实例：{'、'.join(risky_disk_names)}")
        )
    )

    ding_lines.append("3. 重点问题：")
    if anomalies:
        ding_lines.append(
            "   "
            + anomalies[0]["description"]
            + (
                f" （另有 {len(anomalies)-1} 条见 Excel）"
                if len(anomalies) > 1
                else "（明细见 Excel）"
            )
        )
    else:
        ding_lines.append("   未发现超阈值项（或未取全指标）；建议以 Excel 明细为准。")

    if anomalies:
        plan_text = anomalies[0]["suggestion"].replace("\n", "；")
        if len(anomalies) > 1:
            plan_text += f" （其余 {len(anomalies)-1} 条一并处理）"
    else:
        plan_text = next_plan_para

    ding_lines.append("4. 次日计划：" + plan_text)

    ding_txt = "\n".join(line for line in ding_lines if line is not None).strip()

    return {
        "meta": {
            "reportFullTitle": ttl,
            "inspectionDate": date_cn,
            "inspector": inspector_line,
            "scope": scope_line,
            "period": "当日 00:00-24:00",
            "generatedAtZh": now.strftime("%Y-%m-%d %H:%M:%S"),
        },
        "instances": merged,
        "overall": {
            "instanceTotal": n,
            "riskLevelZh": risk_lvl,
            "alarmSummaryZh": alarm_line,
            "allRunning": all_running,
        },
        "overviewBullets": bullets_overview,
        "conclusionZh": conclusion,
        "nextDayPlanZh": next_plan_para,
        "anomalies": anomalies,
        "dingTalkBriefText": ding_txt,
    }
