# -*- coding: utf-8 -*-
"""一键生成每日巡检报告：API 拉 ECS 云监控 + TLS 证书 → Markdown + Excel（原表格样式）。"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
# 独立运行默认写到本目录 reports/；工作台会传 --out data/ops_reports
DEFAULT_OUT = SCRIPT_DIR / "reports"
# 仓库内路径：…/工作控制台/integrated/…/auto-inspection → parents[4] = 工作控制台
_candidate_root = SCRIPT_DIR.parents[4] if len(SCRIPT_DIR.parents) > 4 else SCRIPT_DIR
ROOT = _candidate_root if (_candidate_root / "workbench").is_dir() else SCRIPT_DIR
CERT_SCRIPT = SCRIPT_DIR / "scripts" / "check_cert_expiry.py"
CONFIG = SCRIPT_DIR / "config.yaml"

TZ_CN = timezone(timedelta(hours=8))


def _configure_stdio_utf8() -> None:
    """Windows 下默认控制台编码常为 GBK，打印含 ✅ 等字符的 JSON 会失败。"""
    if sys.platform != "win32":
        return
    import io

    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None or not hasattr(stream, "buffer"):
            continue
        enc = (getattr(stream, "encoding", None) or "").lower()
        if enc in ("utf-8", "utf8"):
            continue
        wrapper = io.TextIOWrapper(
            stream.buffer, encoding="utf-8", errors="replace", line_buffering=True
        )
        setattr(sys, name, wrapper)


def _emit_json(obj: dict) -> None:
    """向 stdout 写入 UTF-8 JSON（避免 GBK 控制台编码错误）。"""
    payload = json.dumps(obj, ensure_ascii=False) + "\n"
    if hasattr(sys.stdout, "buffer"):
        sys.stdout.buffer.write(payload.encode("utf-8"))
        sys.stdout.buffer.flush()
    else:
        print(payload, end="", flush=True)


_configure_stdio_utf8()

# 与历史控制台截图顺序一致
INSTANCE_ORDER = {
    "大派对2-空间": 1,
    "宙包小程序": 2,
    "大派对1-空间": 3,
    "大派对": 4,
}


def _pct(v, bold: bool = False) -> str:
    if v is None:
        return "—"
    s = f"{float(v):.2f}%"
    return f"**{s}**" if bold else s


def _load_cert_rows() -> list[dict]:
    spec = importlib.util.spec_from_file_location("check_cert_expiry", CERT_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    rows = [mod.check_one(h, b) for h, b in mod.CERT_DOMAINS]
    ok = [r for r in rows if r["status"] == "ok"]
    err = [r for r in rows if r["status"] != "ok"]
    ok.sort(key=lambda x: x["days_left"])
    return ok + err


def _cert_badge(level: str) -> str:
    return {"过期": "🔴", "紧急": "🔴", "关注": "🟡", "正常": "🟢"}.get(level, "❓")


def _sort_instances(instances: list[dict]) -> list[dict]:
    return sorted(
        instances,
        key=lambda x: (INSTANCE_ORDER.get(x.get("name") or "", 99), x.get("name") or ""),
    )


def _group_peaks(instances: list[dict]) -> tuple[float | None, float | None, float | None]:
    cpus = [x["cpuPercent"] for x in instances if x.get("cpuPercent") is not None]
    mems = [x["memoryPercent"] for x in instances if x.get("memoryPercent") is not None]
    disks = [x["diskPercent"] for x in instances if x.get("diskPercent") is not None]
    return (
        max(cpus) if cpus else None,
        max(mems) if mems else None,
        max(disks) if disks else None,
    )


def _find_focus(instances: list[dict]) -> dict:
    with_mem = [x for x in instances if x.get("memoryPercent") is not None]
    if not with_mem:
        return {"name": "—", "id": "—", "mem": None, "disk": None}
    top = max(with_mem, key=lambda x: float(x["memoryPercent"]))
    return {
        "name": top.get("name") or "—",
        "id": top.get("instanceId") or "—",
        "mem": top.get("memoryPercent"),
        "disk": top.get("diskPercent"),
    }


def _build_distribution(instances: list[dict], peak_cpu, peak_mem, peak_disk) -> str:
    cpus = [x["cpuPercent"] for x in instances if x.get("cpuPercent") is not None]
    mems = [x["memoryPercent"] for x in instances if x.get("memoryPercent") is not None]
    disks = [x["diskPercent"] for x in instances if x.get("diskPercent") is not None]
    lines = []
    if cpus and peak_cpu is not None:
        who = next(x["name"] for x in instances if x.get("cpuPercent") == peak_cpu)
        lo = min(cpus)
        lines.append(
            f"- **CPU**：约 **{lo:.2f}%～{peak_cpu:.2f}%**；"
            f"**{who}** 本次为组内最高（**{peak_cpu:.2f}%**）。"
        )
    if mems and peak_mem is not None:
        who = next(x["name"] for x in instances if x.get("memoryPercent") == peak_mem)
        lo = min(mems)
        lines.append(
            f"- **内存**：约 **{lo:.2f}%～{peak_mem:.2f}%**，"
            f"**{who}** 为组内最高（**{peak_mem:.2f}%**）。"
        )
    if disks and peak_disk is not None:
        who = next(x["name"] for x in instances if x.get("diskPercent") == peak_disk)
        lo = min(disks)
        lines.append(
            f"- **磁盘**：约 **{lo:.2f}%～{peak_disk:.2f}%**，"
            f"**{who}** 亦为组内最高（**{peak_disk:.2f}%**）。"
        )
    return "\n".join(lines) if lines else "- 云监控指标未完整取得，请检查 Agent 与 RAM 权限。"


def _cert_expiry_summary(cert_rows: list[dict]) -> str:
    ok = [r for r in cert_rows if r["status"] == "ok"]
    if not ok:
        return "- 证书自动查询未获取到有效结果，请人工核对。"
    urgent = [r for r in ok if r["days_left"] <= 90]
    expired = [r for r in ok if r["days_left"] < 0]
    nearest = ok[0]
    lines = [
        f"- 本次共检 **{len(cert_rows)}** 个域名，**{len(expired)}** 张已过期，**{len(urgent)}** 张 90 天内到期。"
    ]
    if nearest["days_left"] <= 90:
        lines.append(
            f"- **{nearest['domain']}（{nearest['biz']}）** 剩余 **{nearest['days_left']}** 天，"
            f"为本次最近到期项（{nearest['expires']}）。"
        )
    for r in ok:
        if r.get("note"):
            lines.append(f"- **{r['domain']}** {r['note']}。")
    return "\n".join(lines)


def build_daily_markdown(
    dashboard: dict | None,
    cert_rows: list[dict],
    date_cn: str,
    ts_cn: str,
    excel_name: str,
) -> str:
    instances = _sort_instances((dashboard or {}).get("instances") or [])
    n = len(instances)
    focus = _find_focus(instances)
    peak_cpu, peak_mem, peak_disk = _group_peaks(instances)

    ecs_lines = [
        "| 序号 | 实例名称 | 实例 ID | 资源描述（IP 节选） | 状态 | CPU | 内存 | 磁盘 |",
        "|:----:|----------|---------|---------------------|------|-----|------|------|",
    ]
    for i, x in enumerate(instances, start=1):
        mem_bold = peak_mem is not None and x.get("memoryPercent") == peak_mem
        disk_bold = peak_disk is not None and x.get("diskPercent") == peak_disk
        ecs_lines.append(
            f"| {i} | {x.get('name', '—')} | {x.get('instanceId', '—')} | "
            f"{x.get('ipSummary', '—')} | {x.get('statusZh', '—')} | "
            f"{_pct(x.get('cpuPercent'))} | {_pct(x.get('memoryPercent'), mem_bold)} | "
            f"{_pct(x.get('diskPercent'), disk_bold)} |"
        )

    cert_lines = [
        "| 序号 | 域名 | 业务 | 到期时间 | 剩余天数 | 级别 | 说明 |",
        "|:----:|------|------|----------|----------|------|------|",
    ]
    for i, r in enumerate(cert_rows, start=1):
        if r["status"] == "ok":
            note = r.get("note") or "例行监控"
            cert_lines.append(
                f"| {i} | {r['domain']} | {r['biz']} | {r['expires']} | {r['days_left']} | "
                f"{_cert_badge(r['level'])} {r['level']} | {note} |"
            )
        else:
            cert_lines.append(
                f"| {i} | {r['domain']} | {r['biz']} | — | — | ❓ 查询失败 | {r.get('error', '')} |"
            )

    mem_s = _pct(focus["mem"]).replace("**", "") if focus["mem"] is not None else "—"
    disk_s = _pct(focus["disk"]).replace("**", "") if focus["disk"] is not None else "—"

    year, month, day = date_cn.split("-")
    date_display = f"{year} 年 {int(month)} 月 {int(day)} 日"

    return f"""# 阿里云 应用分组日常巡检报告

| 项目 | 内容 |
|------|------|
| **巡检日期** | {date_display} |
| **报告类型** | 日检 |
| **数据来源** | 云监控 OpenAPI（华东 1·杭州）+ TLS 自动证书查询（{len(cert_rows)} 个业务域名） |
| **项目** | 大派对--ffe8（244715179） |
| **生成时间** | {ts_cn} |

---

## 一、巡检范围

- **ECS**：云服务器 ECS，华东 1（杭州），**{n}** 台（与云监控列表顺序一致）
- **证书**：{len(cert_rows)} 个业务域名 HTTPS 证书（脚本自动查询）

---

## 二、实例与健康 / 资源使用

{chr(10).join(ecs_lines)}

**分布摘要**

{_build_distribution(instances, peak_cpu, peak_mem, peak_disk)}

---

## 三、证书到期巡检

{chr(10).join(cert_lines)}

**到期摘要**

{_cert_expiry_summary(cert_rows)}

---

## 四、结论

1. **ECS 可用性**：{n} 台均为 **运行中**（以 API 状态为准）。
2. **ECS 关注对象**：**{focus['name']}（{focus['id']}）** 内存约 **{mem_s}**、磁盘约 **{disk_s}**，均为组内峰值；建议继续在云监控中对照 **7 日/30 日曲线** 并评估告警阈值。
3. **证书**：见上表到期摘要；90 天内到期项请纳入续费计划。
4. **其余实例**：相较 **{focus['name']}** 未见同等级偏高者，按例行监控执行即可。

---

## 五、运维建议

1. **{focus['name']}**
   - 核对云监控 **内存、磁盘** 告警规则；内存持续偏高、磁盘超过 **60%**，建议安排业务低峰排查。
   - 排查方向：应用堆、缓存、会话、连接池；磁盘侧关注日志轮转与数据目录增长。

2. **证书**
   - 对 90 天内到期域名优先安排续费；CN 与域名不匹配项请核对 Nginx/SLB 证书绑定。

3. **其它 ECS**
   - 其余实例指标温和，纳入例行监控即可。

---

## 六、Excel 简报

已生成本次对应文件：**`{excel_name}`**（含 ECS 指标与 {len(cert_rows)} 个域名证书到期明细，与 Markdown 一致）。

---

*本报告由工作台一键巡检自动生成（云监控 API + TLS 证书查询）。*
"""


def _instances_to_rows(instances: list[dict], peak_mem, peak_disk) -> list[tuple]:
    rows = []
    for x in instances:
        mem_bold = peak_mem is not None and x.get("memoryPercent") == peak_mem
        disk_bold = peak_disk is not None and x.get("diskPercent") == peak_disk
        rows.append(
            (
                x.get("name") or "—",
                x.get("instanceId") or "—",
                x.get("ipSummary") or "—",
                _pct(x.get("cpuPercent")).replace("**", ""),
                _pct(x.get("memoryPercent"), mem_bold).replace("**", ""),
                _pct(x.get("diskPercent"), disk_bold).replace("**", ""),
                x.get("statusZh") or "—",
            )
        )
    return rows


def _cert_summary_bullet(cert_rows: list[dict]) -> str:
    ok = [r for r in cert_rows if r["status"] == "ok"]
    if not ok:
        return "• 证书：自动查询未获取到有效结果，请人工核对。"
    urgent = [r for r in ok if r["days_left"] <= 90]
    nearest = ok[0]
    parts = [f"• 证书：共检 {len(cert_rows)} 个域名，{len(urgent)} 个 90 天内到期。"]
    if nearest["days_left"] <= 90:
        parts.append(
            f"最近到期「{nearest['domain']}」（{nearest['biz']}）剩余 {nearest['days_left']} 天（{nearest['expires']}）。"
        )
    return " ".join(parts)


def write_excel(
    out_path: Path,
    instances: list[dict],
    cert_rows: list[dict],
    ts: str,
    focus: dict,
    peak_mem,
    peak_disk,
) -> None:
    try:
        import openpyxl
        from openpyxl.styles import Font
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
        import openpyxl
        from openpyxl.styles import Font

    rows = _instances_to_rows(instances, peak_mem, peak_disk)
    mem_plain = _pct(focus["mem"]).replace("**", "").replace("⚠", "").strip() if focus["mem"] is not None else "—"
    disk_plain = _pct(focus["disk"]).replace("**", "").replace("⚠", "").strip() if focus["disk"] is not None else "—"
    warn_name = focus["name"]
    warn_id = focus["id"]
    b = Font(bold=True)

    wb = openpyxl.Workbook()
    default = wb.active
    wb.remove(default)
    ws = wb.create_sheet("巡检简报（全合一）")
    r = 1

    def put_title(text: str) -> None:
        nonlocal r
        c = ws.cell(r, 1, text)
        c.font = b
        r += 1

    ws.cell(r, 1, "阿里云 ECS · 应用分组巡检简报（云监控 API）")
    ws.cell(r, 1).font = b
    r += 2

    for k, v in [
        ("巡检对象", "云服务器 ECS | 华东1（杭州）| 大派对--ffe8"),
        ("数据说明", "云监控 OpenAPI CPU/内存/磁盘 + TLS 自动证书到期查询"),
        ("报告类型", "日检"),
        ("Excel 生成时间", ts),
    ]:
        ws.cell(r, 1, k)
        ws.cell(r, 2, v)
        r += 1
    r += 1

    put_title("一、整体结论")
    for line in [
        f"• 实例数量：{len(rows)} 台，状态均为「运行中」。",
        (
            f"• 整体负载：CPU 整体偏低；"
            f"「{warn_name}」内存（{mem_plain}）与磁盘（{disk_plain}）为组内最高，建议在云监控核对趋势与告警阈值。"
        ),
        (
            f"• 需关注：「{warn_name}」（{warn_id}）内存约 {mem_plain}、磁盘约 {disk_plain}；"
            "建议业务低峰排查进程/JVM/缓存与会话占用；磁盘关注日志轮转与大目录增长。"
        ),
        f"• 结论摘要：{len(rows)} 台均为运行中；「{warn_name}」内存与磁盘组内最高，建议结合云监控跟踪趋势。",
        _cert_summary_bullet(cert_rows),
    ]:
        ws.cell(r, 1, line)
        r += 1
    r += 1

    put_title("二、组内 ECS 明细")
    headers = ["实例名称", "实例 ID", "公网/IP 摘要", "CPU", "内存", "磁盘", "状态"]
    for j, h in enumerate(headers, start=1):
        ws.cell(r, j, h)
        ws.cell(r, j).font = b
    r += 1
    for row in rows:
        for j, val in enumerate(row, start=1):
            ws.cell(r, j, val)
        r += 1
    r += 1

    put_title("三、证书到期巡检")
    cert_headers = ["域名", "业务", "到期时间", "剩余天数", "级别", "说明"]
    for j, h in enumerate(cert_headers, start=1):
        ws.cell(r, j, h)
        ws.cell(r, j).font = b
    r += 1
    for item in cert_rows:
        if item["status"] == "ok":
            ws.cell(r, 1, item["domain"])
            ws.cell(r, 2, item["biz"])
            ws.cell(r, 3, item["expires"])
            ws.cell(r, 4, item["days_left"])
            ws.cell(r, 5, item["level"])
            ws.cell(r, 6, item.get("note") or "例行监控")
        else:
            ws.cell(r, 1, item["domain"])
            ws.cell(r, 2, item["biz"])
            ws.cell(r, 3, "—")
            ws.cell(r, 4, "—")
            ws.cell(r, 5, "查询失败")
            ws.cell(r, 6, item.get("error", ""))
        r += 1
    r += 1

    put_title("四、风险与运维建议")
    ws.cell(r, 1, "1")
    ws.cell(
        r,
        2,
        (
            f"关于 {warn_id}（{warn_name}）— 内存约 {mem_plain}、磁盘约 {disk_plain}（组内最高）：\n"
            "建议在云监控配置/核对内存与磁盘告警；排查内存泄漏、缓存与会话占用；磁盘侧核对日志轮转。"
        ),
    )
    r += 1
    nearest = next((x for x in cert_rows if x["status"] == "ok"), None)
    cert_hint = (
        f"证书最近到期：{nearest['domain']}（{nearest['biz']}）剩余 {nearest['days_left']} 天。"
        if nearest
        else "证书自动查询无有效结果。"
    )
    ws.cell(r, 1, "2")
    ws.cell(r, 2, f"其余实例：相较「{warn_name}」未见同等级偏高。{cert_hint}")
    r += 2

    put_title("五、按清单逐项备注")
    for j, h in enumerate(["资源/检查项", "结果", "运维建议"], start=1):
        ws.cell(r, j, h)
        ws.cell(r, j).font = b
    r += 1
    for name, iid, ip, cpu, mem, disk, st in rows:
        if name == warn_name:
            result = f"内存约 {mem}、磁盘约 {disk}（组内最高）"
            advice = "云监控对齐告警；排查占用；评估升配与磁盘清理"
        else:
            result = f"CPU {cpu}；内存 {mem}；磁盘 {disk}；{st}"
            advice = "持续纳入例行监控即可"
        ws.cell(r, 1, name)
        ws.cell(r, 2, result)
        ws.cell(r, 3, advice)
        r += 1

    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 22
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 10
    ws.column_dimensions["E"].width = 10
    ws.column_dimensions["F"].width = 36

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)


def run(out_dir: Path) -> dict:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from inspection.config import load_config
    from inspection.report import build_markdown, save_markdown
    from inspection.runner import run_inspection

    out_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(TZ_CN)
    date_cn = now.strftime("%Y-%m-%d")
    ts_cn = now.strftime("%Y-%m-%d %H:%M:%S")
    ts_file = now.strftime("%Y%m%d_%H%M")

    cfg = load_config(CONFIG)
    summary, _ = run_inspection(cfg)
    dashboard = summary.dashboard
    cert_rows = _load_cert_rows()

    instances = _sort_instances((dashboard or {}).get("instances") or [])
    focus = _find_focus(instances)
    _, peak_mem, peak_disk = _group_peaks(instances)

    md_name = f"巡检报告_{date_cn}_{now.strftime('%H%M')}.md"
    xlsx_name = f"ECS_应用分组巡检简报_全合一_{ts_file}.xlsx"
    md_path = out_dir / md_name
    xlsx_path = out_dir / xlsx_name

    md = build_daily_markdown(dashboard, cert_rows, date_cn, ts_cn, xlsx_name)
    md_path.write_text(md, encoding="utf-8")
    write_excel(xlsx_path, instances, cert_rows, ts_cn, focus, peak_mem, peak_disk)

    api_log = Path(__file__).resolve().parent / "logs"
    api_log.mkdir(exist_ok=True)
    api_md = api_log / f"report_{now.strftime('%Y%m%d_%H%M%S')}.md"
    title = f"API巡检_{now.strftime('%Y%m%d_%H%M')}"
    save_markdown(str(api_md), build_markdown(summary, title))

    return {
        "ok": True,
        "date": date_cn,
        "generated_at": ts_cn,
        "report_path": str(md_path),
        "report_rel": str(md_path.relative_to(ROOT)) if str(md_path).startswith(str(ROOT)) else str(md_path),
        "excel_path": str(xlsx_path),
        "excel_rel": str(xlsx_path.relative_to(ROOT)) if str(xlsx_path).startswith(str(ROOT)) else str(xlsx_path),
        "api_report_path": str(api_md),
        "instance_count": len(instances),
        "cert_count": len(cert_rows),
        "has_risk": summary.has_risk,
        "instances": instances,
        "certs": cert_rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="生成每日运维巡检 Markdown + Excel 报告")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="报告输出目录")
    parser.add_argument("--json", action="store_true", help="输出 JSON 结果")
    args = parser.parse_args()

    if not CONFIG.is_file():
        msg = f"找不到 {CONFIG.name}，请先复制 config.example.yaml 为 config.yaml"
        if args.json:
            _emit_json({"ok": False, "error": msg})
        else:
            print(f"生成失败: {msg}", flush=True)
        return 2

    try:
        result = run(args.out.resolve())
        if args.json:
            _emit_json(result)
        else:
            print(f"Markdown: {result['report_path']}", flush=True)
            print(f"Excel:    {result['excel_path']}", flush=True)
            print(f"实例: {result['instance_count']} 台 | 证书: {result['cert_count']} 个", flush=True)
        return 0
    except Exception as exc:
        err = {"ok": False, "error": str(exc)}
        if args.json:
            _emit_json(err)
        else:
            print(f"生成失败: {exc}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
