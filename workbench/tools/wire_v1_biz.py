# -*- coding: utf-8 -*-
"""把 12 条 v1 回归业务流水线从「stub 占位」接成「真实写操作接线」。

接线来源（全部实测，不含猜测）：
  * Apifox「新新商务接口」OpenAPI：method / path
  * sw2 前端 chunk 表单模型：请求体字段名
  * Apifox「OA接口/SysUserBindPlatform」：审核接口与 body schema
  * sw9 只读实测：sys_users / sys_user_bind_platform / sys_user_preference 表字段
  * 真站只读 GET：确认接口可达与响应 code

步骤定义直接从 v1_regression_biz.py 的预演结果投影生成，保证「面板看到的」
与「实际会跑的」永远是同一份，不会再出现 P0.. 编号错位。

用法：
  python tools/wire_v1_biz.py              # 接线，但保留 placeholder 安全闸
  python tools/wire_v1_biz.py --activate   # 接线并去掉 placeholder（面板可点跑）
  python tools/wire_v1_biz.py --restore    # 恢复占位态
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORKBENCH = HERE.parent
ROOT = WORKBENCH.parent
sys.path.insert(0, str(WORKBENCH))

import v1_regression_biz as biz  # noqa: E402

PIPELINES_FILE = ROOT / "data" / "auto_control_pipelines.json"

# 依赖关系与角色（来自 v1回归-业务流水线用例集.yaml / XMind 业务流程）
META = {
    "v1reg_oa_create_l1":           {"depends": [], "role": "超管 admin · 复用 10060 龙翔一级商务", "group": "v1全量回归 · 层级建立"},
    "v1reg_bus_l1_create_l2":       {"depends": ["oa_create_l1"], "role": "一级商务 龙翔一级商务(10060)", "group": "v1全量回归 · 层级建立"},
    "v1reg_bus_l2_create_l3":       {"depends": ["bus_l1_create_l2"], "role": "二级商务 龙翔二级商务(10062)", "group": "v1全量回归 · 层级建立"},
    "v1reg_bus_l1_view_data":       {"depends": ["bus_l2_create_l3"], "role": "一级商务 龙翔一级商务(10060)", "group": "v1全量回归 · 层级建立"},
    "v1reg_bus_l2_view_data":       {"depends": ["bus_l2_create_l3"], "role": "二级商务 龙翔二级商务(10062)", "group": "v1全量回归 · 层级建立"},
    "v1reg_bus_l3_bind_oa":         {"depends": ["bus_l2_create_l3"], "role": "三级商务 龙翔三级商务(10063)", "group": "v1全量回归 · 绑定与审核"},
    "v1reg_oa_audit_bind_pass":     {"depends": ["bus_l3_bind_oa"], "role": "OA · 待补独立 token", "group": "v1全量回归 · 绑定与审核"},
    "v1reg_oa_audit_bind_reject":   {"depends": ["bus_l3_bind_oa"], "role": "OA · 待补独立 token", "group": "v1全量回归 · 绑定与审核"},
    "v1reg_bus_l3_unbind_oa":       {"depends": ["oa_audit_bind_pass"], "role": "三级商务 龙翔三级商务(10063)", "group": "v1全量回归 · 绑定与审核"},
    "v1reg_bus_l3_create_channel":  {"depends": ["bus_l2_create_l3"], "role": "三级商务 龙翔三级商务(10063)", "group": "v1全量回归 · 渠道与收尾"},
    "v1reg_channel_activation_apply": {"depends": ["bus_l3_create_channel"], "role": "三级商务 龙翔三级商务(10063)", "group": "v1全量回归 · 渠道与收尾"},
    "v1reg_bus_hierarchy_cleanup":  {"depends": ["bus_l3_unbind_oa", "bus_l3_create_channel", "channel_activation_apply"], "role": "超管 admin", "group": "v1全量回归 · 渠道与收尾"},
    "v1reg_alert_rule_crud":        {"name": "预警规则增改启停删", "depends": [], "role": "一级商务 龙翔一级商务(10060)", "group": "v1全量回归 · 预警"},
    "v1reg_alert_gap":              {"name": "预警间隔设置与恢复", "depends": [], "role": "一级商务 龙翔一级商务(10060)", "group": "v1全量回归 · 预警"},
    "v1reg_alert_settings":         {"name": "有效端参数设置与恢复", "depends": [], "role": "超管 admin（仅超管可配）", "group": "v1全量回归 · 预警"},
    "v1reg_alert_exemption":        {"name": "免预警渠道加入与移出", "depends": ["bus_l2_create_l3", "oa_audit_bind_pass"], "role": "一级商务 · 需名下有有效渠道", "group": "v1全量回归 · 预警"},
    "v1reg_alert_record_handle":    {"name": "预警记录处理链（开始处理→备注→提交审核）", "depends": [], "role": "一级商务 · 需本人名下有预警记录", "group": "v1全量回归 · 预警"},
    "v1reg_pref_matrix":            {"name": "顶栏开关四象限（含下级×去重）", "depends": [], "role": "超管 admin（测完恢复开关）", "group": "v1全量回归 · 数据口径"},
    "v1reg_scene_full":             {"name": "新商务全量回归 · BS 场景聚合", "depends": [], "role": "超管/一级/二级/三级/oa运维", "group": "v1全量回归 · 聚合", "depends_note": "S0..S9 按业务依赖顺序：BS-01 开关四象限→BS-02 建一/二/三级→BS-04 绑定审核通过→BS-05/06 渠道激活→BS-08/10/11 预警→BS-04 解绑→BS-16 数据页→BS-07 换绑(待接)；场景源 测试点/业务场景-互补版-20261112.md"},
}

LAYER_ENGINE = {
    "DB": "sql_assert", "API": "http", "PAGE": "pw_admin",
    "CHECK": "manual", "PERM": "pw_admin", "SETUP": "http", "CLEANUP": "sql_assert",
}


def _apis_from_evidence(ev: dict) -> list[dict]:
    """从预演证据里抽出 method/path/body/query，作为面板展示的接口清单。"""
    if not ev:
        return []
    if "method" in ev and "path" in ev:
        item = {"method": ev["method"], "path": ev["path"]}
        body = ev.get("body") if ev.get("body") is not None else ev.get("requestBody")
        if body is not None:
            item["requestBody"] = body
        if ev.get("query") is not None:
            item["query"] = ev["query"]
        if ev.get("base") or ev.get("baseUrl"):
            item["baseUrl"] = ev.get("base") or ev.get("baseUrl")
        if ev.get("note"):
            item["note"] = ev["note"]
        if ev.get("bodyTemplate"):
            item["requestBodyTemplate"] = ev["bodyTemplate"]
        if ev.get("apifoxDoc") or ev.get("apifox"):
            item["apifoxDoc"] = ev.get("apifoxDoc") or ev.get("apifox")
        if ev.get("sampleResponse"):
            item["sampleResponse"] = ev["sampleResponse"]
        return [item]
    if "sql" in ev:
        return [{"method": "SELECT", "path": ev.get("database", ""),
                 "sql": ev["sql"], "params": ev.get("params", [])}]
    if "locator" in ev:
        return [{"method": "DOM", "path": ev["locator"]}]
    return []


def build_step(res: dict) -> dict:
    ev0 = res.get("evidence") or {}
    if ev0.get("sub_steps") is not None:
        subs = ev0["sub_steps"]
        step = {
            "id": res["id"], "title": res["title"], "engine": "scene",
            "wiring": "stub" if res["state"] == "BLOCKED" else "wired",
            "profiles": ["A", "B"], "layer": res["layer"],
            "apis": [{"method": "子步骤", "path": f"{x.get('title')}",
                      "note": f"{x.get('state')} · {str(x.get('detail'))[:120]}"}
                     for x in subs],
            "note": res["detail"][:300],
        }
        if res["state"] == "BLOCKED":
            step["blockedBy"] = res["detail"][:300]
        return step
    layer = res["layer"]
    ev = res.get("evidence") or {}
    state = res["state"]
    # BLOCKED = 已识别但被环境/输入阻断；不算已接线，避免面板误显示「可跑」
    wiring = "stub" if state == "BLOCKED" else "wired"
    step = {
        "id": res["id"],
        "title": res["title"],
        "engine": LAYER_ENGINE.get(layer, "http"),
        "wiring": wiring,
        "profiles": ["A", "B"],
        "layer": layer,
        "apis": _apis_from_evidence(ev),
        "note": res["detail"][:300],
    }
    if "sql" in ev:
        step["dbAssert"] = {"database": ev.get("database"), "sql": ev["sql"],
                            "params": ev.get("params", [])}
    if state == "BLOCKED":
        step["blockedBy"] = res["detail"][:300]
    return step


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--activate", action="store_true", help="去掉 placeholder，使面板可点跑")
    ap.add_argument("--restore", action="store_true", help="恢复占位态（不接线）")
    a = ap.parse_args()

    raw = json.loads(PIPELINES_FILE.read_text(encoding="utf-8"))
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(PIPELINES_FILE, PIPELINES_FILE.with_suffix(f".json.bak.{ts}"))

    cfg = biz.load_config()
    shared = biz.load_state(cfg)
    by_id = {str(x.get("id")): x for x in raw}

    if a.restore:
        n = 0
        for pid in META:
            p = by_id.get(pid)
            if p:
                p["placeholder"] = True
                for s in p.get("steps", []):
                    s["wiring"] = "stub"
                n += 1
        PIPELINES_FILE.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"已恢复占位态：{n} 条")
        return 0

    summary = []
    for pid, meta in META.items():
        p = by_id.get(pid)
        if not p:
            p = {"id": pid, "name": meta.get("name") or pid, "createdAt": datetime.now().isoformat(timespec="seconds")}
            raw.append(p)
            by_id[pid] = p
            print("NEW 追加流水线:", pid)
        out = biz.run(pid, execute=False, cfg=cfg, state=shared, write_evidence=False)
        if any("验证码" in json.dumps(r, ensure_ascii=False) for r in out["results"]):
            print(f"中止：{pid} 预演时登录触发验证码，面板文件未改动；稍后重跑本命令")
            return 1
        steps = [build_step(r) for r in out["results"]]
        p["steps"] = steps
        if meta.get("name"):
            p["name"] = meta["name"]
        p["group"] = meta["group"]
        p["depends"] = meta["depends"]
        p["role"] = meta["role"]
        p["runner"] = "v1_regression_biz.run_pipeline"
        p["writeGate"] = "data/v1_regression_biz_config.json#writeEnabled"
        p["apifoxFolder"] = "新新商务接口 + OA接口/SysUserBindPlatform"
        p["wiredAt"] = datetime.now().isoformat(timespec="seconds")
        p["note"] = (f"depends={','.join(meta['depends']) or '-'} | role={meta['role']} | "
                     f"三层断言 DB→API→PAGE | 可重放 | 写闸门 writeEnabled")
        wired = sum(1 for s in steps if s["wiring"] == "wired")
        blocked = sum(1 for s in steps if s["wiring"] == "stub")
        summary.append((pid, len(steps), wired, blocked))
        if pid != "v1reg_scene_full":
            p["hidden"] = True   # 已归入聚合流水线，列表不单独展示
        if a.activate:
            p.pop("placeholder", None)
        else:
            p["placeholder"] = True
            p["activationNote"] = "接线已完成；运行 python tools/wire_v1_biz.py --activate 去掉占位闸"

    PIPELINES_FILE.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{'流水线':40} {'步骤':>4} {'wired':>6} {'stub':>6}")
    for pid, n, w, b in summary:
        print(f"{pid:40} {n:>4} {w:>6} {b:>6}")
    tot_w = sum(x[2] for x in summary)
    tot_b = sum(x[3] for x in summary)
    print(f"\n合计 {len(summary)} 条流水线，wired={tot_w}，stub={tot_b}（stub 均为环境阻断/PAGE-DOM 待接）")
    print(f"模式: {'ACTIVATE（面板可点跑）' if a.activate else '保留 placeholder 安全闸'}")
    print(f"备份: {PIPELINES_FILE.name}.bak.{ts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
