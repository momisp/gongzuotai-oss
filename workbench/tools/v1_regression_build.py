# -*- coding: utf-8 -*-
"""v1 全量回归资产构建器（幂等 · 只新增 · 不覆盖已有指标）。

运行： python tools/v1_regression_build.py

数据源前提（用户 2026-11-10 明确 + 实测确认）：
  Go「新新商务」的数据是**直查 game_lx / game_yq / game_hw 三库原始业务表**，
  跨库 UNION ALL 聚合；sw9 只是 Go 业务配置库（sys_* / pay_orders），
  sw8/sw6 的 tab_sw_report_day 是旧版预聚合日报，口径不同，不可用作 L1。

产出：
  1) data/data_assert/catalogs/v1_full_regression.yaml      独立数据源
  2) data/data_assert/scenes/v1_full_regression/meta.yaml    独立场景（挂 87 项）
  3) data/data_assert/scenes/v1_full_regression/biz-note.md  能力边界说明
  4) data/data_assert/metrics/v1reg_*.yaml                   87 项页面可见指标
  5) ../data/auto_control_pipelines.json                      追加 12 条占位业务流水线
  6) tools/v1_regression_datasource.py                        数据源诊断 + 三库 SQL 模板
  7) tools/v1_regression_sniff.py                             可选：只读抓接口响应钉 jsonPath
  8) 归档：测试过程产出/v1回归-接入说明.md / -核对视图.html / -三库直查SQL模板.md

原则：
  - 不修改 metrics/ 下任何已有的 go_* / today_* 指标；
  - 不修改 catalogs/xinshangwu_go.yaml 与 scenes/xinshangwu_go/meta.yaml；
  - 流水线以 placeholder:true + steps.wiring=stub 追加，调度器会跳过，绝不误跑写操作；
  - 未确证的接口字段一律写 TODO，不猜；有实测模板的才写 liveSql，并标 anchor。
"""
from __future__ import annotations

import csv
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

WB = Path(__file__).resolve().parent.parent
ASSERT = WB / "data" / "data_assert"
METRICS = ASSERT / "metrics"
CATALOGS = ASSERT / "catalogs"
SCENES = ASSERT / "scenes"
PIPELINES = WB.parent / "data" / "auto_control_pipelines.json"

WORKSPACE = Path(os.environ.get("V1REG_WORKSPACE", str(WB.parent / "data" / "v1reg_workspace")))
ARCHIVE = Path(os.environ.get("V1REG_ARCHIVE", str(WB.parent / "data" / "v1reg_archive")))
CSV_PATH = WORKSPACE / "v1回归-数据准确性指标清单.csv"

SCENE_ID = "v1_full_regression"
PREFIX = "v1reg_"
API_BASE = os.environ.get("SW_API_BASE", "http://sw2.example.com/api")
SITE = os.environ.get("SW_SITE_BASE", "http://sw2.example.com/")
APIFOX = os.environ.get("SW_APIFOX_URL", "")
STAMP = datetime.now().strftime("%Y-%m-%d %H:%M")

# ── 三库直查（实测通过）────────────────────────────────────────────────
GAMES = [("game_lx", "lx"), ("game_yq", "yq"), ("game_hw", "hw")]
ANCHOR = "2026-11-03"          # 实测锚点日：三库与旧日报都有完整数据，可复现


def epoch(d: str) -> int:
    return int(datetime.strptime(d, "%Y-%m-%d").timestamp())


T0, T1 = epoch("2026-11-03"), epoch("2026-11-04")
Y0, Y1 = epoch("2026-11-02"), T0
M0 = epoch("2026-11-01")


def union(table: str, cols: str, with_src: bool = False) -> str:
    parts = []
    for db, tag in GAMES:
        sel = (f"'{tag}' AS src, {cols}" if with_src else cols)
        parts.append(f"SELECT {sel} FROM {db}.{table}")
    return "\n      UNION ALL\n      ".join(parts)


def sql_sum_pay(lo: int, hi: int) -> str:
    u = union("tab_spend", "user_id, pay_amount, pay_time, pay_status")
    return (f"SELECT COALESCE(SUM(pay_amount),0) AS v\n    FROM (\n      {u}\n    ) t\n"
            f"    WHERE pay_status=1 AND pay_time >= {lo} AND pay_time < {hi}")


def sql_count(table: str, time_col: str, lo: int, hi: int, where: str = "1=1") -> str:
    u = union(table, f"id, {time_col}")
    return (f"SELECT COUNT(*) AS v\n    FROM (\n      {u}\n    ) t\n"
            f"    WHERE {where} AND {time_col} >= {lo} AND {time_col} < {hi}")


def sql_distinct(table: str, time_col: str, lo: int, hi: int,
                 value_col: str, where: str = "1=1") -> str:
    u = union(table, f"user_id, {time_col}" if value_col == "user_id" else f"id, {time_col}",
              with_src=True)
    return (f"SELECT COUNT(DISTINCT CONCAT(src, ':', {value_col})) AS v\n    FROM (\n      {u}\n    ) t\n"
            f"    WHERE {where} AND {time_col} >= {lo} AND {time_col} < {hi}")


# 实测可跑的 L1 模板（锚点 T=2026-11-03；层级/去重/游戏过滤待与开发对齐）
LIVE_SQL = {
    "WB-01": sql_count("tab_user", "register_time", T0, T1),
    "WB-02": sql_count("tab_user", "register_time", Y0, Y1),
    "WB-04": sql_distinct("tab_user_day_login", "login_time", T0, T1, "user_id"),
    "WB-05": sql_distinct("tab_user_day_login", "login_time", Y0, Y1, "user_id"),
    "WB-07": sql_sum_pay(T0, T1),
    "WB-08": sql_sum_pay(Y0, Y1),
    "WB-10": sql_sum_pay(M0, T1),
    "WB-13": (f"SELECT COUNT(DISTINCT CONCAT(src, ':', promote_id)) AS v\n    FROM (\n      "
              + union("tab_spend", "promote_id, pay_time, pay_status", with_src=True)
              + f"\n    ) t\n    WHERE pay_status=1 AND pay_time >= {T0} AND pay_time < {T1}"),
    "WB-16": sql_count("tab_promote", "create_time", T0, T1),
    "WB-17": sql_count("tab_promote", "create_time", Y0, Y1),
    "CDS-02": sql_count("tab_user", "register_time", T0, T1),
    "CDS-03": sql_sum_pay(T0, T1),
    "CDS-10": sql_distinct("tab_user_day_login", "login_time", T0, T1, "user_id"),
    "CDS-12": (f"SELECT COUNT(DISTINCT CONCAT(src, ':', user_id)) AS v\n    FROM (\n      "
               + union("tab_spend", "user_id, pay_time, pay_status", with_src=True)
               + f"\n    ) t\n    WHERE pay_status=1 AND pay_time >= {T0} AND pay_time < {T1}"),
    "PAY-13": sql_sum_pay(T0, T1),
}

# 有实测 SQL 的指标：四层链 L1 显示真实三库表字段（CSV 里的 tab_sw_report_day 是旧日报口径，另存对照）
LIVE_SOURCE = {
    "WB-01": ("tab_user", "id / register_time"),
    "WB-02": ("tab_user", "id / register_time"),
    "CDS-02": ("tab_user", "id / register_time"),
    "WB-04": ("tab_user_day_login", "user_id / login_time"),
    "WB-05": ("tab_user_day_login", "user_id / login_time"),
    "CDS-10": ("tab_user_day_login", "user_id / login_time"),
    "WB-07": ("tab_spend", "pay_amount / pay_time / pay_status"),
    "WB-08": ("tab_spend", "pay_amount / pay_time / pay_status"),
    "WB-10": ("tab_spend", "pay_amount / pay_time / pay_status"),
    "CDS-03": ("tab_spend", "pay_amount / pay_time / pay_status"),
    "PAY-13": ("tab_spend", "pay_amount / pay_time / pay_status"),
    "WB-13": ("tab_spend", "promote_id / pay_time / pay_status"),
    "CDS-12": ("tab_spend", "user_id / pay_time / pay_status"),
    "WB-16": ("tab_promote", "id / create_time"),
    "WB-17": ("tab_promote", "id / create_time"),
}

# 面板现有指标里已验证过的 jsonPath（复用，不猜新字段）
KNOWN_JSONPATH = {
    "WB-01": ("/sw/workbench/summary", "$.data.todayRegister.value"),
    "WB-03": ("/sw/workbench/summary", "$.data.todayRegister.changeRate"),
    "WB-04": ("/sw/workbench/summary", "$.data.todayActive.value"),
    "WB-06": ("/sw/workbench/summary", "$.data.todayActive.changeRate"),
    "WB-07": ("/sw/workbench/summary", "$.data.todayPay.value"),
    "WB-09": ("/sw/workbench/summary", "$.data.todayPay.changeRate"),
    "WB-10": ("/sw/workbench/summary", "$.data.monthPay.value"),
    "WB-12": ("/sw/workbench/summary", "$.data.monthPay.changeRate"),
    "WB-13": ("/sw/workbench/summary", "$.data.activePromote.value"),
    "WB-16": ("/sw/workbench/summary", "$.data.newPromote.value"),
    "CDS-01": ("/sw/channelData/list", "$.data.channelCount"),
    "CDS-02": ("/sw/channelData/list", "$.data.totalRegisterCount"),
    "CDS-03": ("/sw/channelData/list", "$.data.totalPayAmount"),
    "CDS-04": ("/sw/channelData/list", "$.data.avgPayRate"),
    "PAY-13": ("/sw/spend/list", "$.data.totalPayAmount"),
    "OTH-01": ("/sw/gameData/list", "$.data.summary.totalPay"),
    "OTH-02": ("/sw/serverAnalysis/list", "$.data.summary.totalPay"),
    # 2026-11-12 只读实测；V2-01 的 overview 须带 query sourceDbList，否则 code=7，生成后需在 yaml 补 query
    "V2-01": ("/sw/workbench/overview", "$.data.cards.newPromote.value"),
    "V2-03": ("/sw/performance", "$.data.matrixTotal.open"),
    "V2-05": ("/sw/alertExemption/list", "$.data.total"),
    "V2-06": ("/sw/settings/effectiveness", "$.data.amount"),
    "V2-07": ("/sw/promoteActivePool/bindList", "$.data.total"),
    "V2-08": ("/sw/promoteActivePool/pool", "$.data.total"),
}

PATH_FIX = {
    "/sw/${spend}/list": "/sw/spend/list",
    "/sw/${register}/list": "/sw/register/list",
    "/sw/${gameData}/list": "/sw/gameData/list",
    "/sw/workbench/${e}": "/sw/workbench/summary",
    "/sw/rank/${type}": "/sw/rank/{type}",
}


def q(v) -> str:
    """JSON 双引号字符串是合法的 YAML 标量，规避中文/冒号/#/引号转义。"""
    return json.dumps("" if v is None else str(v), ensure_ascii=False)


def slug(reg_id: str) -> str:
    return PREFIX + reg_id.lower().replace("-", "_")


# ── 流水线：来自 v1回归-业务流水线用例集.yaml（12 条）──────────────────
def P(i, n, g, r, deps, apis, cleanup, asserts):
    return dict(id=i, name=n, group=g, role=r, depends=deps, apis=apis,
                cleanup=cleanup, assertions=asserts)


PIPELINE_SPECS = [
    P("oa_create_l1", "OA 新增一级商务", "层级建立", "超管/OA", [],
      ["/user/admin_register", "/sw/business"], True,
      [("DB", "一级商务账号落库，层级 level=1，平台绑定正确"),
       ("API", "创建返回 code=0，列表可查到新账号"),
       ("PAGE", "商务列表（须先选所属平台）可见该一级商务")]),
    P("bus_l1_create_l2", "一级商务创建二级商务", "层级建立",
      "一级商务 smoke_l1_24747708", ["oa_create_l1"],
      ["/sw/business", "/sw/business/management"], True,
      [("DB", "新账号 parent_id 指向该一级商务，level=2"),
       ("API", "创建成功；上级 promotes 接口可见下级"),
       ("PAGE", "商务列表按所属平台筛选后可见；层级展示正确"),
       ("PERM", "三级商务不可再创建下级，有明确提示（冒烟 S04）")]),
    P("bus_l2_create_l3", "二级商务新增三级商务", "层级建立",
      "二级商务 smoke_l2_24789858", ["bus_l1_create_l2"],
      ["/sw/business", "/sw/business/management"], True,
      [("DB", "parent_id 指向该二级商务，level=3"),
       ("API", "创建成功；上级 promotes 接口可见"),
       ("PAGE", "商务列表可见；绑定列表 Tab 对三级可见、对非三级不可见")]),
    P("bus_l1_view_data", "一级商务查看数据（含下级汇总）", "层级建立",
      "一级商务", ["bus_l2_create_l3"],
      ["/sw/workbench/summary", "/sw/channelData/list"], False,
      [("CHECK", "顶栏「包含下级渠道数据」关闭=仅一级；开启=含二三级，数值应增加"),
       ("CHECK", "「身份证去重」开启后人数类指标应减少或相等"),
       ("CHECK", "四层链：DB 期望 = 接口值 = 页面值（见 WB 组指标）")]),
    P("bus_l2_view_data", "二级商务查看数据（层级范围）", "层级建立",
      "二级商务", ["bus_l2_create_l3"],
      ["/sw/workbench/summary", "/sw/channelData/list"], False,
      [("CHECK", "可见本层级及下级数据，不可见上级/平级数据"),
       ("CHECK", "与一级商务同日同口径对比，范围不相串")]),
    P("bus_l3_bind_oa", "三级商务绑定旧 OA（SDK）商务", "绑定与审核",
      "三级商务 smoke_l3_24874175", ["bus_l2_create_l3"],
      ["/sw/promote/bindOptions", "/sw/business/bindPlatform", "/sw/business/${id}/bindPlatform"], True,
      [("DB", "绑定关系落库，状态=待审核，绑定账号与旧 OA 商务一致"),
       ("API", "绑定列表返回该记录，状态徽章为待审核，无审核详情入口"),
       ("PAGE", "绑定列表 Tab 可见；待审核仅展示状态徽章")]),
    P("oa_audit_bind_pass", "OA 审核通过 → 三级可查看 SDK 商务数据", "绑定与审核",
      "超管/OA", ["bus_l3_bind_oa"],
      ["/sw/promoteActivePool/apply", "/sw/promoteActivePool/bindList"], False,
      [("DB", "绑定状态改为通过"),
       ("API", "三级商务侧可查到该旧商务的渠道/注册/充值数据"),
       ("PAGE", "工作台与数据分析页出现对应数据，数值与 DB 一致")]),
    P("oa_audit_bind_reject", "OA 审核驳回 → 三级无法查看 SDK 商务数据", "绑定与审核",
      "超管/OA", ["bus_l3_bind_oa"],
      ["/sw/promoteActivePool/apply", "/sw/promoteActivePool/bindList"], False,
      [("DB", "绑定状态改为驳回"),
       ("API", "三级商务侧查不到该旧商务数据（空态或 0）"),
       ("PAGE", "工作台与数据分析页不出现对应数据")]),
    P("bus_l3_unbind_oa", "三级商务解绑 SDK 商务", "绑定与审核",
      "三级商务", ["oa_audit_bind_pass"],
      ["/sw/business/${id}/bindPlatform", "/sw/promoteActivePool/bindList"], True,
      [("DB", "绑定关系解除或标记失效"),
       ("API", "绑定列表不再返回该记录"),
       ("PAGE", "相关数据从工作台/数据页消失")]),
    P("bus_l3_create_channel", "三级商务新增渠道", "渠道与收尾",
      "三级商务", ["bus_l2_create_l3"],
      ["/sw/promote", "/sw/promote/list", "/sw/promote/portrait"], True,
      [("DB", "渠道落库，归属该三级商务，create_time=当日"),
       ("API", "渠道列表可查到；工作台「新增渠道数」+1"),
       ("PAGE", "渠道列表可见，状态与所属平台正确"),
       ("PERM", "三态（正常/锁定/解除合作）筛选语义不混（冒烟 S06）")]),
    P("channel_activation_apply", "渠道激活申请与页内 Tab", "渠道与收尾",
      "三级商务", ["bus_l3_create_channel"],
      ["/sw/promoteActivePool/apply", "/sw/promoteActivePool/bindList"], False,
      [("PAGE", "激活列表页内 Tab 可切；切 Tab 不丢整页（冒烟 S07）"),
       ("PAGE", "申请弹窗可开、可关，提交后状态正确")]),
    P("bus_hierarchy_cleanup", "层级链路回收（保证可重放）", "渠道与收尾",
      "超管", ["bus_l3_unbind_oa", "bus_l3_create_channel", "channel_activation_apply"], [], False,
      [("DB", "本轮创建的 L1/L2/L3、绑定关系、渠道全部清除"),
       ("DB", "造数基线数据（wb_top_01..11 / 一级会长）保持不变"),
       ("CHECK", "输出本轮 evidence 索引，供差异单引用")]),
]

ENGINE_BY_PREFIX = {"DB": "sql_assert", "API": "http", "PAGE": "pw_admin",
                    "PERM": "pw_admin", "CHECK": "manual"}


def build_pipeline_entry(spec: dict) -> dict:
    steps = [{"id": "P0", "title": "前置清理 / 幂等校验", "engine": "sql_assert",
              "wiring": "stub", "profiles": [], "note": "重复执行不产生脏数据"}]
    for i, (prefix, text) in enumerate(spec["assertions"], start=1):
        step = {"id": f"P{i}", "title": f"[{prefix}] {text[:38]}",
                "engine": ENGINE_BY_PREFIX[prefix], "wiring": "stub",
                "profiles": [], "note": text}
        if spec["apis"]:
            p = spec["apis"][(i - 1) % len(spec["apis"])]
            step["apis"] = [{"method": "TBD", "path": p,
                             "note": "只读占位；实际 method/入参待开发确认，禁止执行写操作"}]
        steps.append(step)
    if spec["cleanup"]:
        steps.append({"id": f"P{len(spec['assertions']) + 1}",
                      "title": "后置回收 / 恢复造数基线", "engine": "sql_assert",
                      "wiring": "stub", "profiles": [],
                      "note": "清理本轮创建数据，保证可重放"})
    return {
        "id": PREFIX + spec["id"], "name": spec["name"],
        "doc": "workbench/docs/v1回归-接入说明.md",
        "group": "v1全量回归 · " + spec["group"], "placeholder": True,
        "note": ("depends=" + (",".join(spec["depends"]) or "-") + " | role=" + spec["role"]
                 + " | 接口待接线 | 三层断言 DB→API→PAGE | 可重放"),
        "createdAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"), "steps": steps,
    }


# ── 指标：从 87 项 CSV 生成 ────────────────────────────────────────────
def infer_format(assert_type: str, visible: str) -> str:
    if "金额" in assert_type or "¥" in visible:
        return "yuan"
    if "比率" in assert_type or "率" in visible:
        return "percent"
    if any(k in assert_type for k in ("整数", "条数", "名次", "顺序", "差值")):
        return "number"
    return "text"


def first_api(raw: str) -> str:
    m = re.search(r"(/[\w${}/.\-]+)", str(raw or ""))
    return m.group(1) if m else "/sw/workbench/summary"


def metric_yaml(row: dict) -> tuple[str, dict]:
    reg_id = row["编号"].strip()
    mid = slug(reg_id)
    visible, module, region = row["可见指标"].strip(), row["模块"].strip(), row["页面区域"].strip()
    src_raw, cond, formula = row["数据来源_库表字段"].strip(), row["筛选条件"].strip(), row["计算公式"].strip()
    route, locator = row["页面路由"].strip(), row["页面定位建议"].strip()
    expect, assert_type, tol = row["期望口径"].strip(), row["断言类型"].strip(), row["容差"].strip()
    role, switches, prio = row["角色"].strip(), row["开关组合"].strip(), row["优先级"].strip()
    confirm, v1ref = row["确认状态"].strip(), row["接口_v1抓包参考"].strip()
    fmt = infer_format(assert_type, visible)

    raw_path = first_api(row["接口_当前sw2"])
    path = PATH_FIX.get(raw_path, raw_path)
    jp_known = reg_id in KNOWN_JSONPATH
    if jp_known:
        path, jp = KNOWN_JSONPATH[reg_id]          # 以面板已验证路径为准
    else:
        jp = "$.data.TODO"
    has_live = reg_id in LIVE_SQL
    wiring = "wired" if (jp_known and has_live) else ("partial" if (jp_known or has_live) else "unwired")
    page = SITE + "#" + route if route.startswith("/") else SITE + "#/layout/dashboard"

    lines = [
        f"# v1 全量回归 · 页面可见指标 {reg_id}（由 tools/v1_regression_build.py 生成，勿手改）",
        f"# 接线状态 {wiring}：L3={'已确证' if jp_known else '待抓包'} / L1={'三库直查实测模板' if has_live else '口径待钉'}",
        f"# 数据来源：Go 新新商务直查 game_lx + game_yq + game_hw 三库原始表（非 sw9 / 非 sw8 日报）",
        f"id: {mid}", f"name: {q(visible)}", f"scene: {SCENE_ID}",
        "mode: passthrough", f"format: {fmt}", f"regId: {q(reg_id)}",
        f"group: {q(module)}", f"priority: {q(prio)}", f"role: {q(role)}",
        f"switches: {q(switches)}", f"assertType: {q(assert_type)}", f"tolerance: {q(tol)}",
        f"wiring: {wiring}", f"confirm: {q(confirm)}",
        "source:",
        "  db: game_lx+game_yq+game_hw",
        "  liveDatabase: game_lx",
        f"  table: {q('game_lx/game_yq/game_hw · ' + LIVE_SOURCE[reg_id][0]) if has_live else q(src_raw)}",
        f"  field: {q(LIVE_SOURCE[reg_id][1]) if has_live else q(src_raw)}",
        f"  csvSourceRef: {q(src_raw)}",
        f"  conditionSummary: {q(cond + ' ｜三库直查 UNION ALL；旧日报 tab_sw_report_day 在 sw6/sw8，口径不同勿用')}",
        "  fixtureValueYuan: 0.00",
    ]
    if has_live:
        lines += [f"  # 锚点 T={ANCHOR}（epoch {T0}~{T1}）；层级/去重/游戏过滤待与开发对齐",
                  "  liveSql: |"]
        lines += ["    " + ln for ln in LIVE_SQL[reg_id].splitlines()]
        lines += ["  liveSqlValueKey: v", f"  liveSqlAnchor: {ANCHOR}"]
    else:
        lines += [f"  # liveSql 待钉：口径（层级范围 / 身份证去重 / 游戏过滤 / 统计日 T）未与开发确认，不写以免造假差异单"]
    lines += [
        "formula:", f"  text: {q(formula)}", f"  expr: {q('GET ' + path + ' → ' + jp)}",
        f"  note: {q('期望口径：' + expect + '；容差 ' + tol + '；断言 ' + assert_type)}",
        "api:", "  method: GET", f"  path: {q(path)}", f"  baseUrl: {API_BASE}",
        f"  jsonPath: {q(jp)}",
        "  headers:", "    Accept: application/json", '    x-token: "***"',
        f"  doc: {APIFOX}", f"  v1CaptureRef: {q(v1ref)}",
        f"  csvRawPath: {q(raw_path)}", f"  jsonPathConfirmed: {'true' if jp_known else 'false'}",
        "ui:", f"  page: {q(page)}",
        f"  region: {q(module + ' · ' + region + ' · ' + visible)}",
        f"  locator: {q(locator)}", '  fixtureText: "-"', "  capture: dom", "",
    ]
    return mid, {"yaml": "\n".join(lines), "row": row, "path": path, "jsonPath": jp,
                 "jsonPathConfirmed": jp_known, "hasLive": has_live, "wiring": wiring}


def main() -> int:
    if not CSV_PATH.is_file():
        print("!! 找不到清单 CSV:", CSV_PATH)
        return 1
    for d in (METRICS, CATALOGS, SCENES / SCENE_ID):
        d.mkdir(parents=True, exist_ok=True)

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    print(f"CSV 读入 {len(rows)} 项指标")

    built = []
    for row in rows:
        mid, info = metric_yaml(row)
        (METRICS / f"{mid}.yaml").write_text(info["yaml"], encoding="utf-8")
        built.append(info)
    n_live = sum(1 for i in built if i["hasLive"])
    n_jp = sum(1 for i in built if i["jsonPathConfirmed"])
    print(f"生成指标 YAML {len(built)} 个：L1 实测模板 {n_live} 项 / L3 字段已确证 {n_jp} 项")

    # catalog
    (CATALOGS / f"{SCENE_ID}.yaml").write_text("\n".join([
        f"id: {SCENE_ID}", "name: 新商务 v1 全量回归（页面可见指标 87 项）",
        "summary: 测试窗口前对 v1 做全量回归；L1 直查 game_lx/game_yq/game_hw 三库原始表",
        "sort: 20", f"kind: {SCENE_ID}", "scenes:", f"  - {SCENE_ID}",
        f"loginUrl: {SITE.rstrip('/')}/#/login",
        f"pageUrl: {SITE.rstrip('/')}/#/layout/dashboard",
        f"apifoxUrl: {APIFOX}", f"apiBaseUrl: {API_BASE}",
        "# 用户 2026-11-10 明确：新新商务数据直查三库，不是 sw9，也不是 sw8 日报",
        "gameDbs:", "  - game_lx", "  - game_yq", "  - game_hw",
        "sourceDbMap:", "  lx: game_lx", "  yq: game_yq", "  hw: game_hw",
        f"anchorDate: {ANCHOR}", "username: admin",
        "sourceFile: docs/v1回归-接入说明.md", f"generatedAt: {q(STAMP)}", "",
    ]), encoding="utf-8")

    # scene meta
    meta = [f"id: {SCENE_ID}", "name: 新商务 v1 · 全量回归", f"catalog: {SCENE_ID}",
            "bizDoc: biz-note.md", f"previewUrl: {SITE.rstrip('/')}/#/layout/dashboard",
            "# 顺序与 v1回归-数据准确性指标清单.csv 一致；接线状态见各指标 wiring 字段", "metrics:"]
    meta += [f"  - {slug(i['row']['编号'].strip())}" for i in built]
    (SCENES / SCENE_ID / "meta.yaml").write_text("\n".join(meta) + "\n", encoding="utf-8")

    # biz-note
    (SCENES / SCENE_ID / "biz-note.md").write_text(build_biznote(n_live, n_jp), encoding="utf-8")

    # pipelines（备份 + 幂等）
    entries = [build_pipeline_entry(s) for s in PIPELINE_SPECS]
    original = json.loads(PIPELINES.read_text(encoding="utf-8")) if PIPELINES.is_file() else []
    if isinstance(original, dict):
        original = [original]
    keep = [x for x in original if not str(x.get("id") or "").startswith(PREFIX)]
    original_count = len(keep)
    existing = {str(x.get("id")) for x in original if isinstance(x, dict)}
    added = [e for e in entries if e["id"] not in existing]
    if added:
        bak = PIPELINES.with_suffix(".json.bak." + datetime.now().strftime("%Y%m%d_%H%M%S"))
        shutil.copy2(PIPELINES, bak)
        PIPELINES.write_text(json.dumps(original + added, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
        print(f"流水线追加 {len(added)} 条，备份 {bak.name}")
    else:
        print("流水线已存在，跳过追加")
    cur_list = json.loads(PIPELINES.read_text(encoding="utf-8"))
    n_new = sum(1 for x in cur_list if str(x.get("id") or "").startswith(PREFIX))

    (WB / "tools" / "v1_regression_datasource.py").write_text(DIAG_SCRIPT, encoding="utf-8")
    (WB / "tools" / "v1_regression_sniff.py").write_text(SNIFF_SCRIPT, encoding="utf-8")
    print("生成可选脚本：tools/v1_regression_datasource.py、tools/v1_regression_sniff.py（均默认不执行）")

    ARCHIVE.mkdir(parents=True, exist_ok=True)
    deliverables = {
        "v1回归-接入说明.md": build_readme(rows, built, n_new, original_count, n_live, n_jp),
        "v1回归-核对视图.html": build_html(rows, built, n_new, original_count, n_live, n_jp),
        "v1回归-三库直查SQL模板.md": build_sql_doc(),
    }
    for name, content in deliverables.items():
        (ARCHIVE / name).write_text(content, encoding="utf-8")
        (WORKSPACE / name).write_text(content, encoding="utf-8")
    print("归档 3 份：接入说明 / 核对视图 / 三库直查SQL模板")
    print("完成。")
    return 0


def build_biznote(n_live: int, n_jp: int) -> str:
    return f"""# 新商务 v1 全量回归 · 场景说明

生成时间：{STAMP}　｜　构建器：`workbench/tools/v1_regression_build.py`（幂等，可重跑）

## 这个场景是什么
用户诉求：**测试窗口之前，对 v1 版本做全量回归**，页面上所有能看见的指标数据都做进
控制面板「数据准确性」；业务链路（一级建二级 / 二级建三级 / 三级绑定旧 OA 商务 /
OA 审核 / 解绑 / 新增渠道）做进「流水线」。

- v1 / v2 **都是 Go**。当前 `sw2` 测试环境已含 v1 内容与部分 v2，不是整站重写。
- 本场景是**独立新增**，不改动 `xinshangwu_go`（原有 39 个已调好的指标）。
- 87 项指标 = 工作台 32 / 渠道统计 17 / 充值明细 13 / 注册明细 9 / 其它数据页 8 / V2 增量 8。

## 数据来源（用户 2026-11-10 明确，已实测确认）
**Go「新新商务」直查 `game_lx` / `game_yq` / `game_hw` 三库原始业务表，跨库 UNION ALL 聚合。**

- 三库有：`tab_spend`（充值，54 字段）、`tab_user`（注册，71 字段）、
  `tab_promote`（渠道，89 字段）、`tab_promote_apply`、`tab_user_day_login`（活跃）。
- 三库**没有** `tab_sw_report_day`，也没有 `source_db` 字段 —— 跨库时需自行标注来源
  （`'lx' AS src` / `'yq'` / `'hw'`），与 `sourceDbMap` 对齐。
- 时间字段全部是 **Unix 时间戳 int**（`pay_time` / `register_time` / `create_time` / `login_time`）；
  `pay_amount` 单位是**元**；`pay_status=1` 为成功。
- `sw9` 是 Go 业务配置库（只有 `sys_*` / `pay_orders`），**不是业务数据源**。
- `sw8` / `sw6` 的 `tab_sw_report_day` 是**旧版预聚合日报**，口径与三库直查不同。

### 同日 2026-11-03 实测对比（这就是为什么不能用旧日报做 L1）
| 指标 | 三库直查（Go 口径） | sw8 日报（旧口径） | 差 |
|---|---:|---:|---:|
| 充值金额 | ¥305,489.30 | ¥220,947.00 | +¥84,542.30 |
| 注册人数 | 2,528 | 679 | +1,849 |
| 活跃玩家 | 8,790 | 6,599 | +2,191 |
| 付费玩家 | 920 | 653（pay_cnt） | +267 |
| 新增渠道 | 11 | — | — |

拿旧日报做 L1 去对 Go 接口，会**必然生成假差异单**。

## 四层链现状（诚实边界）
| 层 | 状态 |
|---|---|
| L1 数据来源 | **{n_live} 项已写实测跑通的 `liveSql`**（三库直查，锚点 T={ANCHOR}）；其余口径待与开发对齐，不写以免造假差异单 |
| L2 公式 / 算法 | 87 项全部填写 |
| L3 接口数据 | **{n_jp} 项 jsonPath 已确证**（复用面板现有指标已验证字段）；其余 `$.data.TODO` 待抓包 |
| L4 页面数据 | 页面路由 + 定位建议全部填写，capture=dom |

`wiring: wired` = L1+L3 都齐；`partial` = 只有一层；`unwired` = 两层都待钉。
引擎对「无 `liveSql`」的指标走「L1 对齐接口」模式，fixture/演示态可正常展示四层结构；
未接线项跑 live 会明确暴露空值，**不会偷偷给假数**。

## 三类指标的执行模型不同（不能都塞成单值四层链）
1. **单值指标**（工作台卡片、渠道顶卡、合计行）→ 本场景 metric，走四层链。
2. **行级 / 列表列 / TOP10 榜单 / UI 高亮 / 开关闭合**（CDS-05~17、PAY-01~12、
   REG-01~09、TOP-01~10、WB-19~22、OTH-*）→ 四层链只作登记与证据挂载点，
   真正断言应由「流水线」页面步骤或后续新增的「行级对账」专项承担。
3. **V2 增量 8 项**（V2-01~08）→ 口径待开发确认、需首轮人工建基线，暂不跑 live。

## 还差什么（三件，都需你/开发确认）
1. **口径对齐**：层级范围（含下级 / 仅本级）、身份证去重、`game_id` 过滤、统计日 T 锚定。
   现在的 `liveSql` 是三库全量参考值，未加商务层级过滤。
2. **接口响应结构**：跑一次 `tools/v1_regression_sniff.py`（只发 GET），把 TODO 的 jsonPath 钉实。
3. **写操作授权**：12 条业务流水线目前全部 `placeholder:true` + `stub`，只进时间线不入队。
   要真正接线跑通，需确认允许在 `sw2` 建/绑/解绑测试账号。

## 现有 39 个 go_* 指标的数据源错配
它们的 `liveDatabase: sw9` 且 SQL 查 `tab_sw_report_day` / `tab_spend` —— sw9 里没有这些表，
live 必报 `Table doesn't exist`。**不能简单把 sw9 改成 sw8**：那会换成旧日报口径，数值对不上。
正确修法是按 `tools/v1_regression_datasource.py` 给的三库 UNION 模板重写 SQL。
该脚本默认只出诊断报告，**不自动改你已在用的配置**。

## 不做的事
未登录测试环境、未执行任何写操作；对 DB 只做 `SHOW/DESCRIBE/SELECT`。
"""


DIAG_SCRIPT = '''# -*- coding: utf-8 -*-
"""数据源诊断 + 三库直查 SQL 模板（默认只诊断，不改任何已有配置）。

背景：现有 go_* 指标写 liveDatabase: sw9 且查 tab_sw_report_day / tab_spend，
但 sw9 是 Go 业务配置库（仅 sys_* / pay_orders），没有这些表，live 必失败。
用户明确：Go 新新商务的数据是直查 game_lx / game_yq / game_hw 三库原始表。
sw8/sw6 的 tab_sw_report_day 是旧版预聚合日报，口径不同，不能拿来做 L1。

用法：
  python tools/v1_regression_datasource.py            # 诊断现有指标 + 打印实测模板
  python tools/v1_regression_datasource.py --verify  # 连库实跑模板，输出锚点日数值
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METRICS = ROOT / "data" / "data_assert" / "metrics"
CFG = ROOT.parent / "data" / "smoke_db_config.json"
GAMES = [("game_lx", "lx"), ("game_yq", "yq"), ("game_hw", "hw")]
T0, T1 = 1793635200, 1793721600        # 2026-11-03 00:00 ~ 2026-11-04 00:00 (UTC+8)


def union(table, cols, src=False):
    parts = []
    for db, tag in GAMES:
        sel = (f"'{tag}' AS src, {cols}" if src else cols)
        parts.append(f"SELECT {sel} FROM {db}.{table}")
    return "\\n      UNION ALL\\n      ".join(parts)


TEMPLATES = {
    "充值金额 SUM(pay_amount)": (
        f"SELECT COALESCE(SUM(pay_amount),0) AS v\\n    FROM (\\n      "
        + union("tab_spend", "user_id, pay_amount, pay_time, pay_status")
        + f"\\n    ) t\\n    WHERE pay_status=1 AND pay_time >= {{LO}} AND pay_time < {{HI}}"),
    "注册人数 COUNT(tab_user)": (
        f"SELECT COUNT(*) AS v\\n    FROM (\\n      "
        + union("tab_user", "id, register_time")
        + f"\\n    ) t\\n    WHERE register_time >= {{LO}} AND register_time < {{HI}}"),
    "活跃玩家 COUNT(DISTINCT user_id)": (
        f"SELECT COUNT(DISTINCT CONCAT(src, ':', user_id)) AS v\\n    FROM (\\n      "
        + union("tab_user_day_login", "user_id, login_time", src=True)
        + f"\\n    ) t\\n    WHERE login_time >= {{LO}} AND login_time < {{HI}}"),
    "付费玩家 COUNT(DISTINCT user_id)": (
        f"SELECT COUNT(DISTINCT CONCAT(src, ':', user_id)) AS v\\n    FROM (\\n      "
        + union("tab_spend", "user_id, pay_time, pay_status", src=True)
        + f"\\n    ) t\\n    WHERE pay_status=1 AND pay_time >= {{LO}} AND pay_time < {{HI}}"),
    "新增渠道 COUNT(tab_promote)": (
        f"SELECT COUNT(*) AS v\\n    FROM (\\n      "
        + union("tab_promote", "id, create_time")
        + f"\\n    ) t\\n    WHERE create_time >= {{LO}} AND create_time < {{HI}}"),
}


def diagnose():
    bad = []
    for p in sorted(METRICS.glob("*.yaml")):
        if p.name.startswith("v1reg_"):
            continue
        t = p.read_text(encoding="utf-8")
        if "liveSql" not in t:
            continue
        if "liveDatabase: sw9" in t or re.search(r"^  db: sw9", t, re.M):
            tabs = [x for x in ("tab_sw_report_day", "tab_spend", "tab_user", "tab_promote") if x in t]
            bad.append((p.name, tabs))
    print(f"[诊断] 现有指标中 liveDatabase/db = sw9 且带 liveSql 的：{len(bad)} 个")
    for n, tabs in bad:
        print(f"  - {n:42s} 查表 {','.join(tabs) or '?'}")
    print("\\n[结论] sw9 里没有这些表；不能改成 sw8（旧日报口径），应按下述三库 UNION 模板重写 SQL。")
    return bad


def show_templates():
    print("\\n[三库直查 SQL 模板] 把 {LO}/{HI} 换成统计日的 epoch 秒；锚点示例 2026-11-03 =", T0, T1)
    for k, v in TEMPLATES.items():
        print(f"\\n--- {k} ---\\n" + v.format(LO=T0, HI=T1))


def verify():
    import pymysql
    cfg = json.loads(CFG.read_text(encoding="utf-8"))
    c = pymysql.connect(host=cfg["host"], port=int(cfg.get("port", 3306)), user=cfg["user"],
                        password=cfg["password"], charset="utf8mb4", connect_timeout=15,
                        cursorclass=pymysql.cursors.DictCursor, autocommit=True)
    print("\\n[实跑] 锚点日 2026-11-03")
    with c.cursor() as cur:
        for k, v in TEMPLATES.items():
            cur.execute(v.format(LO=T0, HI=T1))
            print(f"  {k:34s} -> {cur.fetchone()}")
        cur.execute("SELECT COALESCE(SUM(total_pay),0) v FROM sw8.tab_sw_report_day "
                    "WHERE dedup_mode=0 AND source_db IN ('lx','hw','yq') AND stat_date='2026-11-03'")
        print(f"  {'[对照] sw8 旧日报 total_pay':34s} -> {cur.fetchone()}")
    c.close()


if __name__ == "__main__":
    diagnose()
    show_templates()
    if "--verify" in sys.argv:
        verify()
'''

SNIFF_SCRIPT = '''# -*- coding: utf-8 -*-
"""可选：只读抓取 /sw/* 接口真实响应，用来把 jsonPath 从 TODO 钉成真实字段。

只发 GET + 一次登录 POST /base/login；不执行任何业务写操作。
产出：data/data_assert/fixtures/v1reg_<接口>.json（响应结构，不是业务数据副本）

用法： python tools/v1_regression_sniff.py
"""
from __future__ import annotations
import csv, json, re, sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
CSV = Path(os.environ.get("V1REG_CSV", str(CSV_PATH)))
OUT = ROOT / "data" / "data_assert" / "fixtures"
BASE = os.environ.get("SW_API_BASE", API_BASE)
USER = os.environ.get("SW_ADMIN_USER", "admin")
PWD = os.environ.get("SW_ADMIN_PASSWORD", "CHANGE_ME")


def call(path, token="", body=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["x-token"] = token
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode()
        headers["Content-Type"] = "application/json"
    req = Request(BASE.rstrip("/") + path, data=data, headers=headers,
                  method="POST" if body is not None else "GET")
    with urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main():
    login = call("/base/login", body={"username": USER, "password": PWD})
    d = login.get("data") if isinstance(login, dict) else None
    token = str((d or {}).get("token") or (d or {}).get("access_token")
                or (d or {}).get("x-token") or "") if isinstance(d, dict) else ""
    if not token:
        print("登录未取到 token：", json.dumps(login, ensure_ascii=False)[:400])
        return 1
    paths = []
    with CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            for p in re.findall(r"(/sw/[\\w${}/.\\-]+)", row.get("接口_当前sw2") or ""):
                if "${" not in p and p not in paths:
                    paths.append(p)
    paths += ["/sw/workbench/summary", "/sw/spend/list", "/sw/register/list"]
    paths = list(dict.fromkeys(paths))
    OUT.mkdir(parents=True, exist_ok=True)
    ok = 0
    for p in paths:
        try:
            res = call(p, token=token)
            name = re.sub(r"[^\\w]+", "_", p).strip("_")
            (OUT / f"v1reg_{name}.json").write_text(
                json.dumps({"path": p, "response": res}, ensure_ascii=False, indent=2),
                encoding="utf-8")
            ok += 1
            print("OK ", p)
        except Exception as e:
            print("ERR", p, str(e)[:120])
    print(f"完成 {ok}/{len(paths)}，输出 {OUT}")
    print("下一步：按响应结构把 metrics/v1reg_*.yaml 的 api.jsonPath 从 $.data.TODO 改为真实路径。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
'''


def build_sql_doc() -> str:
    out = [f"""# 新商务 v1 回归 · 三库直查 SQL 模板（实测通过）

生成时间：{STAMP}　｜　锚点日 T = **{ANCHOR}**（epoch {T0} ~ {T1}）

## 数据源
Go「新新商务」直查 `game_lx` / `game_yq` / `game_hw` 三库原始业务表，跨库 `UNION ALL` 聚合。
- 三库**无** `tab_sw_report_day`、**无** `source_db` 字段 → 用 `'lx'/'yq'/'hw' AS src` 自行标注来源。
- 时间字段是 Unix 时间戳 int；`pay_amount` 单位元；`pay_status=1` 成功。
- `sw9` 只是 Go 配置库；`sw8`/`sw6` 的 `tab_sw_report_day` 是**旧版预聚合日报，口径不同**。

## 实测数值对比（同日 {ANCHOR}）

| 指标 | 三库直查（Go 口径） | sw8 日报（旧口径） | 差 |
|---|---:|---:|---:|
| 充值金额 | ¥305,489.30 | ¥220,947.00 | +¥84,542.30 |
| 注册人数 | 2,528 | 679 | +1,849 |
| 活跃玩家 | 8,790 | 6,599 | +2,191 |
| 付费玩家 | 920 | 653（pay_cnt） | +267 |
| 新增渠道 | 11 | — | — |

> 结论：**不能用旧日报做 L1**，否则对 Go 接口必然生成假差异单。

## 模板（把 LO / HI 换成统计日 epoch 秒）
"""]
    samples = [
        ("充值金额 SUM(pay_amount)", sql_sum_pay(T0, T1)),
        ("注册人数 COUNT(tab_user)", sql_count("tab_user", "register_time", T0, T1)),
        ("活跃玩家 COUNT(DISTINCT user_id)", sql_distinct("tab_user_day_login", "login_time", T0, T1, "user_id")),
        ("付费玩家 COUNT(DISTINCT user_id)", sql_distinct("tab_spend", "pay_time", T0, T1, "user_id", "pay_status=1")),
        ("新增渠道 COUNT(tab_promote)", sql_count("tab_promote", "create_time", T0, T1)),
        ("活跃渠道数 COUNT(DISTINCT promote_id)", LIVE_SQL["WB-13"]),
    ]
    for title, sql in samples:
        out.append(f"\n### {title}\n```sql\n{sql}\n```\n")
    out.append(f"""
## 使用注意
1. 上述 SQL 是**三库全量参考值**，未加商务层级过滤（`busier_id` / `parent_id` / `promote_level`）、
   身份证去重（`tab_user.idcard`）、`game_id` 过滤。这些口径需与开发确认后再补 `WHERE`。
2. 锚点 {ANCHOR} 是固定的可复现日；换日需同步替换 `LO/HI`，建议由 catalog 的 `anchorDate` 统一注入。
3. 全部 SQL 只读；已写入 `metrics/v1reg_*.yaml` 的 `source.liveSql` 共 {len(LIVE_SQL)} 项，
   `liveDatabase: game_lx`（SQL 内用完全限定表名，连哪个库都能跑）。
4. 复现实测：`python workbench/tools/v1_regression_datasource.py --verify`
""")
    return "".join(out)


def build_readme(rows, built, n_new, original_count, n_live, n_jp) -> str:
    groups = {}
    for r in rows:
        groups[r["模块"]] = groups.get(r["模块"], 0) + 1
    wired = sum(1 for i in built if i["wiring"] == "wired")
    return f"""# 新商务 v1 全量回归 · 接入说明

生成时间：{STAMP}　｜　构建器：`workbench/tools/v1_regression_build.py`（幂等可重跑）

## 一、这次实际落了什么（不是方案，是文件）

| 位置 | 内容 |
|---|---|
| `workbench/data/data_assert/catalogs/v1_full_regression.yaml` | 独立数据源，声明三库 + 锚点日 |
| `workbench/data/data_assert/scenes/v1_full_regression/` | 独立场景：`meta.yaml`（挂 87 项）+ `biz-note.md` |
| `workbench/data/data_assert/metrics/v1reg_*.yaml` | **87 个指标文件**，四层结构齐全，按面板现有 schema |
| `工作控制台/data/auto_control_pipelines.json` | **追加 12 条业务流水线**（原 {original_count} 条不变，本次新增 {n_new} 条） |
| `workbench/tools/v1_regression_datasource.py` | 数据源诊断 + 三库 UNION SQL 模板（默认只诊断） |
| `workbench/tools/v1_regression_sniff.py` | 可选：只读抓接口响应、钉 jsonPath |
| 本目录 `v1回归-核对视图.html` / `-三库直查SQL模板.md` | 逐条核对视图 + 实测 SQL |

面板的指标 / 场景 / catalog 都是**按目录自动扫描**的，新文件放进去即可见，
**没改你已有的 39 个 `go_*` 指标、也没改 `xinshangwu_go` 场景/catalog**。
流水线是 `placeholder: true` + 所有步骤 `wiring: stub`，调度器 `tick_schedule` 会主动跳过，
**只进时间线、不入队、不会误跑建商务/绑定/解绑等写操作**。

## 二、按你说的「直查三个游戏库」重做了 L1

你补的这句是关键，它推翻了我原本要做的修复方向。已实测确认：

- 三库 `game_lx` / `game_yq` / `game_hw` 有 `tab_spend`（54 字段）、`tab_user`（71）、
  `tab_promote`（89）、`tab_promote_apply`、`tab_user_day_login`；
  **没有** `tab_sw_report_day`，也**没有** `source_db` 字段（跨库要自己标 `'lx'/'yq'/'hw' AS src`）。
- `sw9` 是 Go 业务配置库（只有 `sys_*` / `pay_orders`），不是业务数据源。
- `sw8` / `sw6` 的 `tab_sw_report_day` 是**旧版预聚合日报**，口径不一样：

| 指标（{ANCHOR}） | 三库直查 | sw8 日报 | 差 |
|---|---:|---:|---:|
| 充值金额 | ¥305,489.30 | ¥220,947.00 | +¥84,542.30 |
| 注册人数 | 2,528 | 679 | +1,849 |
| 活跃玩家 | 8,790 | 6,599 | +2,191 |
| 付费玩家 | 920 | 653 | +267 |

**所以现有 39 个 `go_*` 指标的问题不是「库名写错」，是「SQL 口径整个不对」**：
它们写 `liveDatabase: sw9` 且查 `tab_sw_report_day` / `tab_spend`。改成 sw8 只会换成旧口径、
数值照样对不上；正确做法是按 `-三库直查SQL模板.md` 重写成三库 UNION。
`v1_regression_datasource.py` 默认只出诊断报告，**我没有替你改你在用的配置**。

## 三、能做到啥程度（你问的那句，直接答）

| 能力 | 状态 |
|---|---|
| 12 条业务链路进「流水线」 | ✅ 已建条，带依赖 / 角色 / 接口线索 / 三层断言 / 前后清理；⚠️ 未接线，不执行写操作 |
| 87 项页面指标进「数据准确性」 | ✅ 全部建档，四层结构齐全，面板可见、可录备注、可挂证据、可跑 fixture |
| L1 有实测跑通的 `liveSql` | **{n_live} 项**（三库 UNION，锚点 T={ANCHOR}） |
| L3 jsonPath 已确证 | **{n_jp} 项**（复用你面板现有指标里已验证的字段，没猜新的） |
| 两层都齐、可完整 live 对拍 | **{wired} 项** |
| 执行的写操作 | **0** |

分组：{" / ".join(f"{k} {v}" for k, v in groups.items())}。

**没做的事我不装作做了**：没登录测试环境、没抓真实接口响应、没猜 jsonPath、
没执行任何写操作。行级对账 / 列表列 / TOP10 榜单 / UI 高亮 / 开关闭合
（CDS-05~17、PAY-01~12、REG-01~09、TOP-01~10、WB-19~22、OTH-*）不是单值四层链能表达的，
在本场景里是**登记与证据挂载点**，硬凑成"能跑的 metric"是自欺欺人；
`V2-01~08` 口径未定，需首轮人工建基线。

## 四、还差三件（都需要你或开发确认）

1. **口径对齐**：现在的 `liveSql` 是三库全量参考值，未加商务层级过滤
   （`busier_id` / `parent_id` / `promote_level`）、身份证去重、`game_id` 过滤、统计日 T 锚定。
2. **接口响应结构**：跑一次 `python workbench/tools/v1_regression_sniff.py`
   （只发 GET + 一次登录，不写库），把 TODO 的 jsonPath 钉实并生成 fixture。
3. **写操作授权**：12 条流水线要真接线跑通，需明确允许在 `sw2` 建 / 绑 / 解绑测试账号。

## 五、请你拍板两件事

1. 现有 39 个 `go_*` 指标要不要按三库 UNION 模板重写 SQL？（有备份、可回滚，但改动你在用的配置）
2. 要不要允许我登录 `sw2` 抓一次接口响应（只读 GET）来钉 jsonPath？
   业务流水线的写操作接线，是现在做还是等测试窗口前再开？
"""


def esc(s) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def build_html(rows, built, n_new, original_count, n_live, n_jp) -> str:
    groups = {}
    for r in rows:
        groups.setdefault(r["模块"], []).append(r)
    by_id = {i["row"]["编号"]: i for i in built}
    wired = sum(1 for i in built if i["wiring"] == "wired")

    trs = []
    for r in rows:
        info = by_id[r["编号"]]
        w = info["wiring"]
        wlabel = {"wired": '<span class="ok">可 live</span>',
                  "partial": '<span class="part">半接线</span>',
                  "unwired": '<span class="todo">待接线</span>'}[w]
        l1 = '<span class="ok">三库SQL</span>' if info["hasLive"] else '<span class="todo">待钉口径</span>'
        l3 = '<span class="ok">已确证</span>' if info["jsonPathConfirmed"] else '<span class="todo">待抓包</span>'
        prio = r["优先级"]
        pcls = "p0" if prio == "P0" else ("p1" if prio == "P1" else "p2")
        trs.append(
            "<tr><td class='mono'>%s</td><td>%s</td><td>%s</td>"
            "<td class='mono small'>%s</td><td class='mono small'>%s</td>"
            "<td>%s</td><td>%s</td><td>%s</td><td class='%s'>%s</td></tr>"
            % (esc(r["编号"]), esc(r["模块"]), esc(r["可见指标"]), esc(info["path"]),
               esc(info["jsonPath"]), l1, l3, wlabel, pcls, esc(prio)))

    ptrs = []
    for s in PIPELINE_SPECS:
        ptrs.append(
            "<tr><td class='mono'>%s</td><td>%s</td><td>%s</td><td>%s</td>"
            "<td class='mono small'>%s</td><td>%d</td><td><span class='todo'>占位·未接线</span></td></tr>"
            % (esc(PREFIX + s["id"]), esc(s["name"]), esc(s["group"]), esc(s["role"]),
               esc(",".join(s["depends"]) or "—"), len(s["assertions"])))

    chips = "".join("<span class='chip'>%s %d</span>" % (esc(k), len(v)) for k, v in groups.items())
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>新商务 v1 全量回归 · 核对视图</title>
<style>
:root{{--bg:#0f1218;--card:#171c25;--line:#2a3240;--fg:#e8edf5;--mut:#8d9aad;
--ok:#3ddc97;--part:#5b9dff;--todo:#f5a524;--red:#ff6b6b}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);
font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:32px}}
.wrap{{max-width:1560px;margin:0 auto}}
h1{{font-size:26px;margin:0 0 6px}}h2{{font-size:18px;margin:34px 0 12px;
padding-left:10px;border-left:3px solid var(--part)}}
.sub{{color:var(--mut);margin-bottom:20px}}
.kpis{{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:18px}}
.kpi{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}}
.kpi b{{display:block;font-size:27px;line-height:1.2}}.kpi span{{color:var(--mut);font-size:12px}}
.chips{{margin:10px 0 4px}}.chip{{display:inline-block;background:#202838;border:1px solid var(--line);
border-radius:20px;padding:3px 11px;margin:0 6px 6px 0;color:var(--mut);font-size:12px}}
.warn{{background:#2a1b18;border:1px solid #6b3a2f;border-left:4px solid var(--red);
border-radius:8px;padding:14px 16px;margin:18px 0}}
.warn b{{color:var(--red)}}
.cmp{{width:auto;min-width:560px;margin:10px 0 4px}}
table{{width:100%;border-collapse:collapse;background:var(--card);
border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}}
th{{background:#1e2530;text-align:left;padding:10px 12px;color:var(--mut);
font-weight:600;white-space:nowrap;border-bottom:1px solid var(--line)}}
td{{padding:9px 12px;border-bottom:1px solid #222a36;vertical-align:top}}
tr:last-child td{{border-bottom:none}}tr:hover td{{background:#1b2230}}
.mono{{font-family:Consolas,Monaco,monospace}}.small{{font-size:12px;color:var(--mut)}}
.ok{{color:var(--ok);white-space:nowrap}}.part{{color:var(--part);white-space:nowrap}}
.todo{{color:var(--todo);white-space:nowrap}}
.p0{{color:var(--red);font-weight:700}}.p1{{color:var(--todo)}}.p2{{color:var(--mut)}}
footer{{color:var(--mut);font-size:12px;margin-top:32px;border-top:1px solid var(--line);padding-top:14px}}
</style></head><body><div class="wrap">
<h1>新商务 v1 全量回归 · 落地核对视图</h1>
<div class="sub">目标环境 {SITE.rstrip('/')} ｜ v1 / v2 均为 Go ｜ 生成于 {STAMP} ｜ 独立场景 v1_full_regression</div>
<div class="kpis">
<div class="kpi"><b>87</b><span>页面可见指标已建档</span></div>
<div class="kpi"><b>12</b><span>业务流水线已建条</span></div>
<div class="kpi"><b>{n_live}</b><span>L1 三库直查 SQL 实测</span></div>
<div class="kpi"><b>{n_jp}</b><span>L3 jsonPath 已确证</span></div>
<div class="kpi"><b>{wired}</b><span>两层齐·可 live 对拍</span></div>
<div class="kpi"><b>0</b><span>执行的写操作</span></div>
</div>
<div class="chips">{chips}</div>
<div class="warn"><b>数据源已按你 11-10 的纠正重做：</b>Go 新新商务<b>直查 game_lx / game_yq / game_hw 三库原始表</b>
（跨库 UNION ALL），不是 sw9（Go 配置库，只有 sys_*），也不是 sw8 日报（旧版预聚合口径）。
三库<b>没有</b> tab_sw_report_day。现有 39 个 <code>go_*</code> 指标写 <code>liveDatabase: sw9</code> +
查 tab_*，live 必报 <code>Table doesn't exist</code>；<b>改成 sw8 也不对</b>（口径不同，见下表），
正确修法是重写成三库 UNION。诊断脚本默认只出报告，未改你的配置。</div>

<h2>口径实测对比（锚点 {ANCHOR}）</h2>
<table class="cmp"><thead><tr><th>指标</th><th>三库直查（Go 口径）</th><th>sw8 日报（旧口径）</th><th>差</th></tr></thead><tbody>
<tr><td>充值金额</td><td class="mono">¥305,489.30</td><td class="mono">¥220,947.00</td><td class="mono">+¥84,542.30</td></tr>
<tr><td>注册人数</td><td class="mono">2,528</td><td class="mono">679</td><td class="mono">+1,849</td></tr>
<tr><td>活跃玩家</td><td class="mono">8,790</td><td class="mono">6,599</td><td class="mono">+2,191</td></tr>
<tr><td>付费玩家</td><td class="mono">920</td><td class="mono">653</td><td class="mono">+267</td></tr>
<tr><td>新增渠道</td><td class="mono">11</td><td class="mono">—</td><td class="mono">—</td></tr>
</tbody></table>
<div class="sub">拿旧日报做 L1 去对 Go 接口，必然生成假差异单。</div>

<h2>一、业务流水线（控制面板「流水线」）</h2>
<table><thead><tr><th>ID</th><th>名称</th><th>分组</th><th>角色</th><th>依赖</th><th>断言数</th><th>状态</th></tr></thead>
<tbody>{''.join(ptrs)}</tbody></table>
<div class="sub" style="margin-top:10px">全部 <code>placeholder:true</code> + 步骤 <code>stub</code>：调度器主动跳过，只进时间线，不入队、不执行建商务/绑定/解绑等写操作。原 {original_count} 条流水线保留，本次追加 {n_new} 条，原文件已备份。</div>

<h2>二、数据准确性 87 项（控制面板「数据准确性」）</h2>
<table><thead><tr><th>编号</th><th>模块</th><th>可见指标</th><th>接口路径</th><th>jsonPath</th><th>L1</th><th>L3</th><th>接线</th><th>优先级</th></tr></thead>
<tbody>{''.join(trs)}</tbody></table>
<div class="sub" style="margin-top:10px">「待抓包」= 接口路径已从 Apifox「新新商务接口」/ 前端 chunk 提取，响应字段名未确证，一律 <code>$.data.TODO</code> 不猜；
「待钉口径」= 层级范围 / 身份证去重 / game_id 过滤 / 统计日 T 未与开发确认，不写 liveSql 以免造假差异单。
已写的 {n_live} 条 liveSql 均为三库 UNION 实测模板，锚点 T={ANCHOR}。</div>

<footer>构建器 workbench/tools/v1_regression_build.py（幂等可重跑）｜ 归档 测试过程产出/ ｜
四层链：数据来源 → 公式/算法 → 接口数据 → 页面数据 ｜ 本页仅作核对，不替代面板运行</footer>
</div></body></html>
"""


if __name__ == "__main__":
    sys.exit(main())
