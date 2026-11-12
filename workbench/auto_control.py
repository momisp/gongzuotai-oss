# -*- coding: utf-8 -*-
"""自动化控制面板：pipeline 定义、单槽排队、档 A（money_flow）执行、档 B stub。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RUNS_FILE = DATA_DIR / "auto_control_runs.json"
RUNS_DIR = DATA_DIR / "auto_control_runs"
PIPELINES_FILE = DATA_DIR / "auto_control_pipelines.json"
SCHEDULE_FILE = DATA_DIR / "auto_control_schedule.json"
SETTINGS_FILE = DATA_DIR / "auto_control_settings.json"
WEBHOOK_DEDUPE_FILE = DATA_DIR / "auto_control_webhook_dedupe.json"
APIFOX_BRIDGE_FILE = DATA_DIR / "apifox_bridge_vars.json"
AUTO_RETRY_MAX = 3
ZOMBIE_RUNNING_MINUTES = 45
DINGTALK_IMAGE_JSON_MAX = 19000
EVIDENCE_LAYOUT = (
    "run.log + report.html + exchanges.json(可选) + shots/<stepId>/*.png + trace/<stepId>.zip"
)

_lock = threading.RLock()
_worker: threading.Thread | None = None
_cancel_flag = threading.Event()

PIPELINE_ID = "money_recharge_to_withdraw"

DEFAULT_STEPS: list[dict[str, Any]] = [
    {"id": "S0", "title": "种子会长就绪", "engine": "sql", "wiring": "wired", "profiles": ["A", "B"]},
    {"id": "S4", "title": "玩家注册～下单", "engine": "sdk", "wiring": "wired", "profiles": ["A", "B"]},
    {"id": "S5", "title": "模拟支付回调", "engine": "callback", "wiring": "wired", "profiles": ["A", "B"]},
    {"id": "S6", "title": "分佣断言", "engine": "sql_assert", "wiring": "wired", "profiles": ["A", "B"]},
    {"id": "S7", "title": "渠道结算", "engine": "pw_admin", "wiring": "wired", "profiles": ["B"]},
    {"id": "S8", "title": "会长确认→可提现", "engine": "form_guild", "wiring": "wired", "profiles": ["B"]},
    {"id": "S9", "title": "会长提现", "engine": "form_guild", "wiring": "wired", "profiles": ["B"]},
    {"id": "S10", "title": "收益提现-通过", "engine": "pw_admin", "wiring": "wired", "profiles": ["B"]},
    {
        "id": "S11",
        "title": "收益提现-打款",
        "engine": "pw_admin",
        "wiring": "wired",
        "profiles": ["B"],
        "requiresPayout": True,
    },
]


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)


def lookup_game_name(game_id: int | str, *, source_db: str = "lx") -> str:
    """查 tab_game.game_name，失败返回空串。"""
    try:
        from smoke_db import execute_select, load_db_config, resolve_database

        cfg = dict(load_db_config())
        cfg["database"] = resolve_database(source_db, cfg)
        rows = execute_select(
            "SELECT game_name FROM tab_game WHERE id=%s LIMIT 1",
            cfg=cfg,
            params=(int(game_id),),
        )
        if rows:
            return str(rows[0].get("game_name") or "").strip()
    except Exception:  # noqa: BLE001
        pass
    return ""


def _pick_var(*sources: dict, keys: tuple[str, ...], default: Any = None) -> Any:
    for src in sources:
        if not isinstance(src, dict):
            continue
        for k in keys:
            if k not in src:
                continue
            v = src.get(k)
            if v is None:
                continue
            if isinstance(v, str) and not v.strip():
                continue
            return v
    return default


def build_run_display_vars(run: dict | None) -> list[dict[str, str]]:
    """面板/报告用的业务参数（中文标签 + 展示值；密码不落明文）。"""
    run = run or {}
    opts = run.get("options") if isinstance(run.get("options"), dict) else {}
    m = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}

    game_id = _pick_var(m, opts, keys=("gameId",), default="")
    game_name = _pick_var(m, opts, keys=("gameName",), default="")
    if game_id and not game_name:
        game_name = lookup_game_name(game_id, source_db=str(run.get("target") or "lx"))

    promo_id = _pick_var(m, opts, keys=("promoteId",), default="")
    promo_acc = _pick_var(m, opts, keys=("promoteAccount", "guildAccount"), default="")
    pay_amt = _pick_var(m, opts, keys=("payAmount",), default="")
    wd_amt = _pick_var(m, opts, keys=("withdrawAmount", "withdrawAmountPlan"), default="")
    account = _pick_var(m, opts, keys=("account",), default="")
    user_id = _pick_var(m, opts, keys=("userId",), default="")
    pay_order = _pick_var(m, opts, keys=("payOrder",), default="")
    ratio = _pick_var(m, opts, keys=("promoteRatio",), default="")
    expected = _pick_var(m, opts, keys=("expectedCommission",), default="")
    sum_money = _pick_var(m, opts, keys=("sumMoney",), default="")
    period_id = _pick_var(m, opts, keys=("periodId",), default="")
    withdraw_id = _pick_var(m, opts, keys=("withdrawId",), default="")
    sett_row = _pick_var(m, opts, keys=("settlementRowId",), default="")
    admin_user = _pick_var(m, opts, keys=("adminUser",), default="")
    if not admin_user:
        try:
            from money_settlement_pw import load_settlement_config

            admin_user = str(load_settlement_config().get("adminUser") or "")
        except Exception:  # noqa: BLE001
            admin_user = ""

    game_disp = "—"
    if game_name and game_id:
        game_disp = f"{game_name}（id={game_id}）"
    elif game_name:
        game_disp = str(game_name)
    elif game_id:
        game_disp = f"id={game_id}"

    promo_disp = "—"
    if promo_acc and promo_id:
        promo_disp = f"{promo_acc}（id={promo_id}）"
    elif promo_acc:
        promo_disp = str(promo_acc)
    elif promo_id:
        promo_disp = f"id={promo_id}"

    def _money(v: Any) -> str:
        if v is None or v == "":
            return "—"
        try:
            return f"¥{float(v):g}"
        except (TypeError, ValueError):
            return str(v)

    if str(run.get("pipelineId") or "") == "oa_inner_tab_keep_filter":
        page = str(opts.get("page") or m.get("page") or "全部有内部分页的入口")
        return [
            {"key": "page", "label": "页面", "value": page},
            {"key": "enter", "label": "前置", "value": "点击进入该页面"},
        ]

    rows = [
        {"key": "game", "label": "游戏", "value": game_disp},
        {"key": "promote", "label": "会长", "value": promo_disp},
        {"key": "payAmount", "label": "充值金额", "value": _money(pay_amt) if pay_amt != "" else "—（跑完回调后回填）"},
        {"key": "withdrawAmount", "label": "提现金额", "value": _money(wd_amt) if wd_amt != "" else ("—（档 B 提现后回填）" if str(run.get("profile")) == "B" else "—（档 A 不提现）")},
        {"key": "account", "label": "玩家账号", "value": str(account or "—（注册后回填）")},
        {"key": "userId", "label": "玩家 userId", "value": str(user_id or "—")},
        {"key": "payOrder", "label": "充值订单号", "value": str(pay_order or "—")},
        {"key": "promoteRatio", "label": "分佣比例", "value": f"{ratio}%" if ratio not in ("", None) else "—"},
        {"key": "commission", "label": "分成（期望/实际）", "value": f"{expected if expected not in ('', None) else '—'} / {sum_money if sum_money not in ('', None) else '—'}"},
        {"key": "guildLogin", "label": "会长登录账号", "value": str(promo_acc or "—")},
        {"key": "guildLoginPwd", "label": "会长登录密码", "value": "已配置（不展示明文）" if promo_acc else "—"},
        {"key": "adminLogin", "label": "总后台登录", "value": str(admin_user or "admin") + "（密码不展示）"},
        {"key": "settlementRowId", "label": "结算行 ID", "value": str(sett_row or "—")},
        {"key": "periodId", "label": "确认期 ID", "value": str(period_id or "—")},
        {"key": "withdrawId", "label": "提现单 ID", "value": str(withdraw_id or "—")},
    ]
    return rows


def attach_display_vars(run: dict | None) -> dict | None:
    if not run:
        return None
    out = dict(run)
    out["displayVars"] = build_run_display_vars(out)
    return out


def _load_runs() -> list[dict]:
    _ensure_dirs()
    if not RUNS_FILE.is_file():
        return []
    try:
        raw = json.loads(RUNS_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_runs(runs: list[dict]) -> None:
    _ensure_dirs()
    RUNS_FILE.write_text(
        json.dumps(runs[:200], ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )


def _write_run_log(run_id: str, line: str) -> None:
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "run.log"
    with path.open("a", encoding="utf-8") as f:
        f.write(f"[{_now()}] {line}\n")


def _stub_step(title: str) -> dict:
    return {
        "id": "PH1",
        "title": title,
        "engine": "manual",
        "wiring": "stub",
        "profiles": ["A", "B"],
    }


# 金额相关占位。接口稍后接；到点不入队。绑币充值不放开已写进代码的支付方式。
_PLACEHOLDER_PIPES: list[dict] = [
    {
        "id": "coin_platform_recycle",
        "name": "充值平台币 · 平台币回收",
        "group": "金额相关",
        "placeholder": True,
        "note": "占位，接口稍后接入",
        "createdAt": "2026-10-27T09:01:00",
        "doc": "",
        "steps": [_stub_step("占位，接口稍后接入")],
    },
    {
        "id": "coin_platform_pay",
        "name": "充值平台币 · 平台币支付",
        "group": "金额相关",
        "placeholder": True,
        "note": "占位，接口稍后接入",
        "createdAt": "2026-10-27T09:02:00",
        "doc": "",
        "steps": [_stub_step("占位，接口稍后接入")],
    },
    {
        "id": "coin_bind_recycle",
        "name": "充值绑币 · 绑币回收",
        "group": "金额相关",
        "placeholder": True,
        "note": "占位，接口稍后接入",
        "createdAt": "2026-10-27T09:03:00",
        "doc": "",
        "steps": [_stub_step("占位，接口稍后接入")],
    },
    {
        "id": "coin_bind_recharge",
        "name": "充值绑币 · 绑币充值",
        "group": "金额相关",
        "placeholder": True,
        "note": "占位。代码里已有的支付方式先不放开",
        "createdAt": "2026-10-27T09:04:00",
        "doc": "",
        "steps": [_stub_step("占位。支付方式先不放开")],
    },
    {
        "id": "coin_lx_pay",
        "name": "龙翔币 · 龙翔币支付",
        "group": "金额相关",
        "placeholder": True,
        "note": "占位，先做支付；回收还没做",
        "createdAt": "2026-10-27T09:05:00",
        "doc": "",
        "steps": [_stub_step("占位，接口稍后接入")],
    },
    {
        "id": "coin_lx_recycle",
        "name": "龙翔币 · 龙翔币回收",
        "group": "金额相关",
        "placeholder": True,
        "note": "还没做，先做支付",
        "createdAt": "2026-10-27T09:06:00",
        "doc": "",
        "steps": [_stub_step("还没做")],
    },
    {
        "id": "oa_inner_tab_keep_filter",
        "name": "OA · 页面内分页筛选保留",
        "group": "OA图形",
        "placeholder": False,
        "note": "点某一行的执行只跑这一页，并先点击进入该页面。跑一次会逐页做。流水核验的核验汇总另跑画面、昨天、龙翔、检测结果、查看明细、点 × 关闭和分页是否被挡；明细列表、异常处置、操作日志另对照原型核对下拉和异常单号。执行前把 OA 窗口放在前台并最大化。",
        "createdAt": "2026-10-28T16:40:00",
        "doc": "",
        "steps": [
            {
                "id": "OA1",
                "title": "打开有内部分页的入口",
                "engine": "airtest",
                "wiring": "stub",
                "profiles": ["A"],
            },
            {
                "id": "OA2",
                "title": "所属平台勾龙翔，并勾角色名，点搜索",
                "engine": "airtest",
                "wiring": "stub",
                "profiles": ["A"],
            },
            {
                "id": "OA3",
                "title": "切到另一个分页，再切回来",
                "engine": "airtest",
                "wiring": "stub",
                "profiles": ["A"],
            },
            {
                "id": "OA4",
                "title": "断言筛选区和列表还在",
                "engine": "airtest",
                "wiring": "stub",
                "profiles": ["A"],
            },
        ],
    },
]


def _load_pipeline_defs() -> list[dict]:
    default = [
        {
            "id": PIPELINE_ID,
            "name": "玩家充值 → 会长提现",
            "doc": "workbench/docs/接口自动化步骤-充值到提现-框架.md",
            "createdAt": "2026-10-22T09:00:00",
            "placeholder": False,
            "note": "",
            "group": "主链",
            "steps": [dict(s) for s in DEFAULT_STEPS],
        }
    ]

    def with_placeholders(items: list[dict]) -> list[dict]:
        have = {str(d.get("id")) for d in items}
        merged = list(items)
        for stub in _PLACEHOLDER_PIPES:
            if stub["id"] not in have:
                merged.append(dict(stub))
        return merged

    if not PIPELINES_FILE.is_file():
        return with_placeholders(default)
    try:
        raw = json.loads(PIPELINES_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return with_placeholders(default)
    if isinstance(raw, list) and raw:
        out = [d for d in raw if isinstance(d, dict) and d.get("id") and isinstance(d.get("steps"), list)]
        return with_placeholders(out or default)
    if isinstance(raw, dict) and isinstance(raw.get("steps"), list) and raw.get("steps"):
        return with_placeholders([{
            "id": str(raw.get("id") or PIPELINE_ID),
            "name": str(raw.get("name") or "玩家充值 → 会长提现"),
            "doc": str(raw.get("doc") or ""),
            "createdAt": str(raw.get("createdAt") or "2026-10-22T09:00:00"),
            "placeholder": bool(raw.get("placeholder")),
            "note": str(raw.get("note") or ""),
            "group": str(raw.get("group") or ""),
            "steps": raw["steps"],
        }])
    return with_placeholders(default)


_OA_KEEP_LOG = Path(
    r"F:\yzdpd_uiauto_test\code_test\script\pcoa图形自动化专用.air\shots\tab切换\内部分页.txt"
)
# (分组, 入口, 页面内 tab)。游戏列表放在 OA1，和详情里举的例子一致。
_OA_PAGES: list[tuple[str, str, list[str]]] = [
    ("游戏管理", "游戏列表", ["手游", "已下架游戏", "游戏名称修改记录"]),
    ("联运管理", "联运游戏", ["H5", "手游"]),
    ("推广平台", "扶持发放", ["扶持发放", "自动发放session", "自动发放日志"]),
    ("推广平台", "扶持预支", ["预支记录", "额度互通"]),
    ("推广平台", "签约列表", ["签约列表", "签约设置"]),
    ("推广平台", "渠道激活", ["渠道激活", "规则配置", "绑定设置", "批次记录", "绑定渠道"]),
    ("推广平台", "游戏分包", ["安卓分包", "苹果分包", "H5分包"]),
    ("财务管理", "平台币充值", ["玩家充值", "渠道充值"]),
    ("财务管理", "平台币收回", ["玩家收回", "渠道收回"]),
    ("财务管理", "流水核验", ["核验汇总", "明细列表", "异常处置", "操作日志"]),
    ("财务管理", "渠道结算", ["未结算订单", "已结算订单", "不参与结算订单"]),
    ("运营管理", "会长代充", ["代充折扣", "代充记录"]),
    ("运营管理", "预支管理", ["预支管理", "还款记录", "白名单", "开放游戏"]),
    ("组织管理", "IM管理", ["客服管理", "会话记录", "自动回复", "群组管理"]),
    ("组织管理", "组织架构", ["账号管理", "公司管理"]),
    ("组织管理", "公司架构", ["账号管理", "职位管理", "部门管理"]),
    ("其他", "换绑", ["各平台发行用户", "换绑记录"]),
    ("其他", "自动发礼包", ["礼包配置", "发放记录"]),
    ("其他", "版本管理", ["PC", "安卓", "苹果"]),
    ("其他", "信息安全", ["安全总览", "设备白名单", "操作日志", "敏感操作设置", "冻结账号管理", "截图溯源"]),
]


def _oa_keep_status() -> dict[str, str]:
    shown = {"通过": "通过", "不通过": "未通过", "跳过": "跳过", "失败": "没跑成"}
    out: dict[str, str] = {}
    if not _OA_KEEP_LOG.is_file():
        return out
    try:
        lines = _OA_KEEP_LOG.read_text(encoding="utf-8").splitlines()
    except OSError:
        return out
    for line in lines:
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0]:
            out[parts[0]] = shown.get(parts[1], parts[1] or "未跑")
    return out


def _oa_keep_steps() -> list[dict]:
    status = _oa_keep_status()
    steps = []
    for index, (group, name, labels) in enumerate(_OA_PAGES, 1):
        apis: list[dict] = []
        for tab_index, label in enumerate(labels):
            other = labels[tab_index + 1] if tab_index + 1 < len(labels) else labels[0]
            result = status.get(f"{group}-{name}-{label}", "未跑")
            if name == "流水核验" and label == "核验汇总":
                if tab_index == 0:
                    apis.append({"method": "前置", "name": "点击进入该页面", "path": ""})
                apis.extend(
                    [
                        {"method": "页面tab", "name": "核验汇总", "path": ""},
                        {"method": "操作", "name": "核对四Tab、四张卡、搜索区和表头，且没有手动核验", "path": ""},
                        {"method": "操作", "name": "日期选昨天并搜索，列表日期都是昨天", "path": ""},
                        {"method": "操作", "name": "所属平台选龙翔并搜索，列表只剩龙翔", "path": ""},
                        {"method": "操作", "name": "检测结果下拉只有一致、异常", "path": ""},
                        {"method": "操作", "name": "打开有数据行的查看明细", "path": ""},
                        {"method": "操作", "name": "点击标题栏 ×，抽屉关闭", "path": ""},
                        {"method": "操作", "name": "查看明细里分页底部不被挡住", "path": ""},
                        {"method": "断言", "name": "核验汇总这几步都通过", "path": result},
                    ]
                )
                continue
            if tab_index == 0:
                apis.append({"method": "前置", "name": "点击进入该页面", "path": ""})
            screen_ops = []
            if name == "流水核验" and label == "明细列表":
                screen_ops = [{"method": "操作", "name": "比对结果下拉与原型一致", "path": ""}]
            elif name == "流水核验" and label == "异常处置":
                screen_ops = [
                    {"method": "操作", "name": "异常单号中间要有日期", "path": ""},
                    {"method": "操作", "name": "异常类型下拉与原型一致", "path": ""},
                    {"method": "操作", "name": "详情弹窗的比对结果下拉与原型一致", "path": ""},
                ]
            elif name == "流水核验" and label == "操作日志":
                screen_ops = [{"method": "操作", "name": "操作类型下拉与原型一致", "path": ""}]
            apis.extend(
                [
                    {"method": "页面tab", "name": label, "path": ""},
                    *screen_ops,
                    {"method": "操作", "name": "点击所属平台搜索框", "path": ""},
                    {"method": "操作", "name": "勾选龙翔项", "path": ""},
                    {"method": "操作", "name": "点击搜索", "path": ""},
                    {"method": "操作", "name": f"切换到{other}tab", "path": ""},
                    {"method": "操作", "name": "再次切换回来", "path": ""},
                    {"method": "断言", "name": "切换回来的页面列表数据有保留", "path": result},
                ]
            )
        steps.append(
            {
                "id": f"OA{index}",
                "title": name,
                "engine": "airtest",
                "wiring": "wired",
                "profiles": ["A"],
                "apis": apis,
            }
        )
    return steps


def _oa_task_steps(step_id: str = "") -> list[dict]:
    """任务里每个页面两步：先点击进入，再做这一页的筛选保留。"""
    pages = _oa_keep_steps()
    wanted = str(step_id or "").strip()
    if wanted:
        pages = [page for page in pages if page["id"] == wanted]
    out = []
    for page in pages:
        title = str(page.get("title") or page["id"])
        blank = {
            "engine": "airtest",
            "wiring": "wired",
            "requiresPayout": False,
            "status": "pending",
            "detail": "",
            "error": "",
            "startedAt": "",
            "finishedAt": "",
        }
        out.append({"id": f"{page['id']}-in", "title": f"点击进入{title}", **blank})
        out.append({"id": page["id"], "title": title, **blank})
    return out


def get_pipeline(pipeline_id: str | None = None) -> dict:
    pid = str(pipeline_id or PIPELINE_ID).strip() or PIPELINE_ID
    defs = _load_pipeline_defs()
    raw = next((d for d in defs if str(d.get("id")) == pid), None) or defs[0]
    if pid == "oa_inner_tab_keep_filter":
        steps = _oa_keep_steps()
    else:
        steps = [dict(s) for s in (raw.get("steps") or [])]
    stub_n = sum(1 for s in steps if s.get("wiring") == "stub")
    return {
        "id": str(raw.get("id") or pid),
        "name": str(raw.get("name") or pid),
        "doc": str(raw.get("doc") or ""),
        "steps": steps,
        "stubCount": stub_n,
        "placeholder": bool(raw.get("placeholder")),
        "note": str(raw.get("note") or ""),
        "group": str(raw.get("group") or ""),
        "createdAt": str(raw.get("createdAt") or ""),
        "profiles": {
            "A": {"label": "档 A · 至分佣", "desc": "种子 → 注册下单 → 回调 → 分佣 SQL"},
            "B": {"label": "档 B · 至提现", "desc": "A + 结算/确认/提现/审核；一键主链另开 enablePayout 含打款"},
            "main": {"label": "一键主链", "desc": "等同档 B 且 enablePayout=true"},
        },
    }


def list_pipelines() -> list[dict]:
    out = []
    for raw in _load_pipeline_defs():
        if raw.get("hidden"):
            continue   # 归入聚合流水线的子场景，不在列表单独展示（仍可经聚合/API 执行）
        pipe = get_pipeline(str(raw.get("id")))
        steps = []
        for s in pipe.get("steps") or []:
            item = dict(s)
            item["apis"] = step_apis(item)
            steps.append(item)
        pipe["steps"] = steps
        pipe["stepCount"] = len(steps)
        out.append(pipe)
    return out



def _prev_run_diff(run: dict) -> tuple[str, list[dict]]:
    """同流水线最近一次历史 run，对比步骤状态：返回 (prevRunId, 新坏步骤列表)。"""
    pipe_id = str(run.get("pipelineId") or "")
    rid = str(run.get("id") or "")
    if not pipe_id:
        return "", []
    prev = None
    for r in _load_runs():
        if str(r.get("id") or "") == rid:
            continue
        if str(r.get("pipelineId") or "") != pipe_id:
            continue
        if str(r.get("status") or "") in {"queued", "running"}:
            continue
        prev = r
        break
    if not prev:
        return "", []
    prev_by = {str(s.get("id") or ""): s for s in (prev.get("steps") or [])}
    bad = []
    for s in run.get("steps") or []:
        sid = str(s.get("id") or "")
        cur_st = str(s.get("engineState") or s.get("status") or "")
        old = prev_by.get(sid) or {}
        old_st = str(old.get("engineState") or old.get("status") or "")
        cur_bad = cur_st.upper() in {"FAIL", "BLOCKED", "FAILED", "STUB"} or cur_st == "failed"
        old_ok = old_st.upper() in {"PASS", "SKIP", "PASSED", "SKIPPED"} or old_st in {"passed", "skipped"}
        if cur_bad and (old_ok or not old_st):
            bad.append({"id": sid, "title": s.get("title") or sid, "from": old_st or "—", "to": cur_st})
    return str(prev.get("id") or ""), bad


def get_run(run_id: str) -> dict | None:
    with _lock:
        for r in _load_runs():
            if r.get("id") == run_id:
                out = _with_step_apis(attach_display_vars(dict(r)))
                prev_id, diff = _prev_run_diff(out)
                out["prevRunId"] = prev_id
                out["prevDiff"] = diff
                return out
    return None


def list_runs(
    *,
    status: str = "",
    q: str = "",
    day: str = "",
    step_id: str = "",
    stop_reason: str = "",
    exclude_stop_reason: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict:
    runs = _load_runs()
    status = str(status or "").strip().lower()
    q = str(q or "").strip().lower()
    day = str(day or "").strip()
    step_id = str(step_id or "").strip()
    stop_reason = str(stop_reason or "").strip()
    exclude_stop_reason = str(exclude_stop_reason or "").strip()

    def match(r: dict) -> bool:
        if stop_reason and str(r.get("stopReason") or "") != stop_reason:
            return False
        if exclude_stop_reason and str(r.get("stopReason") or "") == exclude_stop_reason:
            return False
        if status and str(r.get("status") or "").lower() != status:
            return False
        if day:
            stamp = str(r.get("finishedAt") or r.get("startedAt") or r.get("queuedAt") or "")
            if not stamp.startswith(day):
                return False
        if step_id:
            hit = any(
                str(s.get("id") or "") == step_id
                and str(s.get("status") or "") in {"failed", "stub"}
                for s in (r.get("steps") or [])
            )
            if not hit:
                return False
        if q:
            blob = json.dumps(r, ensure_ascii=False, default=str).lower()
            if q not in blob:
                return False
        return True

    filtered = [r for r in runs if match(r)]
    total = len(filtered)
    page = [attach_display_vars(dict(r)) for r in filtered[offset : offset + max(1, min(limit, 100))]]
    return {"ok": True, "total": total, "runs": page, "offset": offset, "limit": limit}


def _update_run(run_id: str, **fields: Any) -> dict | None:
    with _lock:
        runs = _load_runs()
        for i, r in enumerate(runs):
            if r.get("id") == run_id:
                r.update(fields)
                r["updatedAt"] = _now()
                runs[i] = r
                _save_runs(runs)
                return dict(r)
    return None


def _set_step(run_id: str, step_id: str, **fields: Any) -> None:
    with _lock:
        runs = _load_runs()
        for i, r in enumerate(runs):
            if r.get("id") != run_id:
                continue
            steps = list(r.get("steps") or [])
            for j, s in enumerate(steps):
                if s.get("id") == step_id:
                    steps[j] = {**s, **fields}
                    break
            r["steps"] = steps
            r["currentStepId"] = step_id
            r["updatedAt"] = _now()
            runs[i] = r
            _save_runs(runs)
            return


def _normalize_step_ids(raw: Any) -> list[str] | None:
    """options.stepIds → 去重后的步骤 id 列表；未传则 None（跑 profile 全量）。"""
    if raw is None:
        return None
    if isinstance(raw, str):
        items = [x.strip() for x in raw.replace(";", ",").split(",") if x.strip()]
    elif isinstance(raw, (list, tuple, set)):
        items = [str(x).strip() for x in raw if str(x).strip()]
    else:
        return None
    if not items:
        return None
    seen: set[str] = set()
    out: list[str] = []
    for sid in items:
        if sid in seen:
            continue
        seen.add(sid)
        out.append(sid)
    return out


def _failed_step_id(run: dict | None) -> str:
    """取失败跑次应续跑的步骤 id。"""
    if not isinstance(run, dict):
        return ""
    for s in run.get("steps") or []:
        if not isinstance(s, dict):
            continue
        if str(s.get("status") or "") == "failed":
            return str(s.get("id") or "")
    cur = str(run.get("currentStepId") or "").strip()
    return cur


def _pipeline_step_order(pipeline_id: str | None = None, profile: str = "B") -> list[str]:
    pipe = get_pipeline(pipeline_id)
    profile = str(profile or "B").upper()
    out: list[str] = []
    for s in pipe.get("steps") or []:
        if not isinstance(s, dict):
            continue
        if profile not in (s.get("profiles") or ["A", "B"]):
            continue
        sid = str(s.get("id") or "")
        if sid:
            out.append(sid)
    return out


def _step_rank(step_id: str, order: list[str]) -> int:
    try:
        return order.index(str(step_id))
    except ValueError:
        return -1


def _init_steps(
    profile: str,
    pipeline_id: str | None = None,
    step_ids: list[str] | None = None,
) -> list[dict]:
    pipe = get_pipeline(pipeline_id)
    want = set(step_ids) if step_ids else None
    out = []
    for s in pipe["steps"]:
        sid = str(s.get("id") or "")
        if profile not in (s.get("profiles") or ["A", "B"]):
            continue
        selected = want is None or sid in want
        out.append(
            {
                "id": s["id"],
                "title": s["title"],
                "engine": s.get("engine"),
                "wiring": s.get("wiring"),
                "apis": s.get("apis") or [],
                "requiresPayout": bool(s.get("requiresPayout")),
                "selected": selected,
                "status": "pending" if selected else "skipped",
                "detail": "" if selected else "未勾选，跳过",
                "error": "",
                "startedAt": "",
                "finishedAt": "" if selected else _now(),
            }
        )
    return out


def enqueue_run(
    *,
    profile: str = "A",
    target: str = "lx",
    pipeline_id: str = PIPELINE_ID,
    options: dict | None = None,
    source: str = "manual",
) -> dict:
    profile = str(profile or "A").upper()
    if profile not in {"A", "B"}:
        return {"ok": False, "error": "profile 仅支持 A 或 B"}
    known = {str(p.get("id")) for p in _load_pipeline_defs()}
    if pipeline_id not in known:
        return {"ok": False, "error": f"未知 pipeline: {pipeline_id}"}
    options = dict(options) if isinstance(options, dict) else {}
    target = str(target or "lx").strip() or "lx"
    auto_retry_count = int(options.pop("_autoRetryCount", 0) or 0)
    auto_retry_of = str(options.pop("_autoRetryOf", "") or "")
    seed_metrics = options.pop("_seedMetrics", None)
    seed_metrics = dict(seed_metrics) if isinstance(seed_metrics, dict) else {}
    from_step_id = str(options.get("fromStepId") or "").strip()
    pipe = get_pipeline(pipeline_id)
    if pipe.get("placeholder"):
        return {"ok": False, "error": "这条流水线还是占位，先不跑"}

    with _lock:
        runs = _load_runs()
        active = [r for r in runs if r.get("status") in {"queued", "running"}]
        if len(active) >= 1:
            return {
                "ok": False,
                "error": "已有任务在排队或执行（单槽），请等待完成或取消后再跑",
                "active": active[0].get("id"),
            }

        run_id = f"acr_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        if pipe["id"] == "oa_inner_tab_keep_filter":
            step_id = str(options.get("stepId") or "").strip()
            task_steps = _oa_task_steps(step_id)
            if step_id and not task_steps:
                return {"ok": False, "error": f"没有这个步骤: {step_id}"}
            page_name = task_steps[-1]["title"] if step_id and task_steps else "全部有内部分页的入口"
            run_options = {"page": page_name, "stepId": step_id}
            run_metrics = {"page": page_name}
            run_steps = task_steps
        else:
            from money_settlement_pw import default_game_id, default_promote, load_settlement_config

            _def_pid, _def_acc = default_promote(target)
            gid = int(options.get("gameId") or default_game_id(target))
            pid = int(options.get("promoteId") or _def_pid)
            promo_acc = str(options.get("promoteAccount") or _def_acc)
            if not pid or not promo_acc:
                return {
                    "ok": False,
                    "error": f"平台 {target} 未配置默认会长（promoteId/guildAccount），请在 money_settlement_config.byTarget 补齐",
                }
            if not gid:
                return {
                    "ok": False,
                    "error": f"平台 {target} 未配置默认 gameId，请在 money_settlement_config.byTarget 补齐",
                }
            wd_plan = options.get("withdrawAmount")
            if wd_plan is None or str(wd_plan).strip() == "":
                wd_plan = 1
            game_name = str(options.get("gameName") or "").strip() or lookup_game_name(gid, source_db=target)
            try:
                admin_user = str(load_settlement_config(target=target).get("adminUser") or "admin")
            except Exception:  # noqa: BLE001
                admin_user = "admin"
            tamper_wd = options.get("tamperWithdrawSumMoney")
            if tamper_wd in (None, ""):
                tamper_wd = options.get("tamper_sum_money")
            run_options = {
                "promoteId": pid,
                "promoteAccount": promo_acc,
                "gameId": gid,
                "gameName": game_name,
                "withdrawAmount": wd_plan,
                "enablePayout": bool(options.get("enablePayout")),
            }
            if tamper_wd not in (None, False, "", 0, "0"):
                # True → 2；数字原样保留，供 S9 提现后改 tab_promote_withdraw.sum_money
                run_options["tamperWithdrawSumMoney"] = (
                    2 if tamper_wd is True or str(tamper_wd).strip().lower() in {"1", "true", "yes", "on"} else tamper_wd
                )
            run_metrics = {
                "promoteId": pid,
                "promoteAccount": promo_acc,
                "gameId": gid,
                "gameName": game_name,
                "withdrawAmountPlan": wd_plan,
                "adminUser": admin_user,
            }
            # 续跑时带上前次 metrics（订单号/提现单等），避免从失败步重跑时丢上下文
            if seed_metrics:
                run_metrics = {**run_metrics, **seed_metrics}
            step_ids = _normalize_step_ids(options.get("stepIds") or options.get("steps"))
            run_steps = _init_steps(profile, pipeline_id=pipe["id"], step_ids=step_ids)
            selected_steps = [s for s in run_steps if s.get("selected", True)]
            if step_ids is not None and not selected_steps:
                return {
                    "ok": False,
                    "error": f"勾选的步骤在档 {profile} 下均不可跑（或 id 无效）：{', '.join(step_ids)}",
                }
            if step_ids is not None:
                run_options["stepIds"] = [str(s.get("id")) for s in selected_steps]
            if from_step_id:
                run_options["fromStepId"] = from_step_id
                # 续跑起点之前的已选步骤标为跳过（不重跑整链）
                order = _pipeline_step_order(pipe["id"], profile)
                start_rank = _step_rank(from_step_id, order)
                if start_rank >= 0:
                    for s in run_steps:
                        if not s.get("selected", True):
                            continue
                        if _step_rank(str(s.get("id")), order) < start_rank:
                            s["status"] = "skipped"
                            s["detail"] = f"续跑自 {from_step_id}，本步跳过"
                            s["finishedAt"] = _now()
        run = {
            "id": run_id,
            "pipelineId": pipe["id"],
            "pipelineName": pipe["name"],
            "profile": profile,
            "target": target,
            "status": "queued",
            "source": source,
            "queuedAt": _now(),
            "startedAt": "",
            "finishedAt": "",
            "currentStepId": "",
            "error": "",
            "autoRetryCount": auto_retry_count,
            "autoRetryOf": auto_retry_of,
            "retryMax": AUTO_RETRY_MAX,
            "options": run_options,
            "metrics": run_metrics,
            "steps": run_steps,
        }
        runs.insert(0, run)
        _save_runs(runs)
        _write_run_log(
            run_id,
            f"入队 pipeline={pipe['id']} profile={profile} target={target}"
            + (f" autoRetry={auto_retry_count}/{AUTO_RETRY_MAX}" if auto_retry_count else "")
            + (f" fromStep={from_step_id}" if from_step_id else "")
            + (
                f" stepIds={','.join(run_options.get('stepIds') or [])}"
                if run_options.get("stepIds")
                else ""
            ),
        )

    try:
        write_apifox_bridge(run_id)
    except Exception:  # noqa: BLE001
        pass
    _ensure_worker()
    return {"ok": True, "run": get_run(run_id)}


def cancel_run(run_id: str) -> dict:
    run = get_run(run_id)
    if not run:
        return {"ok": False, "error": "运行不存在"}
    if run.get("status") not in {"queued", "running"}:
        return {"ok": False, "error": f"当前状态不可取消: {run.get('status')}"}
    _cancel_flag.set()
    _update_run(run_id, status="cancelled", finishedAt=_now(), error="用户取消")
    _write_run_log(run_id, "已请求取消")
    return {"ok": True, "run": get_run(run_id)}


def _ensure_worker() -> None:
    global _worker
    with _lock:
        if _worker and _worker.is_alive():
            return
        _worker = threading.Thread(target=_worker_loop, name="auto-control-worker", daemon=True)
        _worker.start()


def _worker_loop() -> None:
    while True:
        run = None
        with _lock:
            for r in _load_runs():
                if r.get("status") == "queued":
                    run = r
                    break
        if not run:
            time.sleep(0.4)
            # 无排队则退出线程，下次 enqueue 再起
            return
        _cancel_flag.clear()
        _execute_run(str(run["id"]))


_OA_PYTHON = Path(r"F:\yzdpd_uiauto_test\.venv\Scripts\python.exe")
_OA_SCRIPT = Path(r"F:\yzdpd_uiauto_test\code_test\script\pcoa图形自动化专用.air\pcoa图形自动化专用.py")
_OA_NOTICE = _OA_SCRIPT.parent / "oa_run_notice.py"
_OA_RUNNER = r"""
import importlib.util, sys
path, group, name = sys.argv[1], sys.argv[2], sys.argv[3]
spec = importlib.util.spec_from_file_location("pcoa_oa", path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
raise SystemExit(mod.run_one_entry(group, name))
"""


def _oa_page_of(step_id: str) -> tuple[str, str] | None:
    token = str(step_id or "").split("-", 1)[0]
    if not token.startswith("OA"):
        return None
    try:
        index = int(token[2:]) - 1
    except ValueError:
        return None
    if index < 0 or index >= len(_OA_PAGES):
        return None
    group, name, _labels = _OA_PAGES[index]
    return group, name


def _oa_copy_shots(run_id: str, step_id: str, group: str, name: str) -> list[dict]:
    src_dir = _OA_KEEP_LOG.parent
    dest_dir = RUNS_DIR / run_id / "shots" / step_id
    shots: list[dict] = []
    if not src_dir.is_dir():
        return shots
    dest_dir.mkdir(parents=True, exist_ok=True)
    prefix = f"{group}-{name}-"
    for src in sorted(src_dir.glob(prefix + "*.png")):
        dest = dest_dir / src.name
        shutil.copy2(src, dest)
        shots.append({"name": src.stem, "file": f"{step_id}/{src.name}", "path": str(dest)})
    return shots


def _oa_notice_open():
    """主屏左上角小窗：倒计时和执行状态。打不开时不拦住自动化。"""
    if not _OA_PYTHON.is_file() or not _OA_NOTICE.is_file():
        return None
    try:
        spec_name = "oa_run_notice"
        import importlib.util
        spec = importlib.util.spec_from_file_location(spec_name, _OA_NOTICE)
        if spec is None or spec.loader is None:
            return None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.Client(python=str(_OA_PYTHON))
    except Exception:
        return None


def _oa_use_child_session() -> bool:
    return bool(_load_panel_settings().get("oaUseChildSession", True))


def _oa_child_preflight(run_id: str) -> tuple[bool, str, int | None]:
    """开了「走桌面分身」时，只要分身会话还在即可（预览窗可关，不影响真跑）。"""
    if not _oa_use_child_session():
        return True, "", None
    try:
        from child_session import get_child_session_id, host_status
        from child_session import status as child_status
    except Exception as exc:  # noqa: BLE001
        return False, f"桌面分身模块不可用：{exc}", None

    st = child_status()
    sid = get_child_session_id()
    if sid is None:
        # 会话没了再尝试拉起 Host；平时不强制弹预览窗
        try:
            from child_session import ensure_host_visible

            _write_run_log(run_id, "分身会话不在，尝试启动分身…")
            opened = ensure_host_visible(wait_seconds=35)
            sid = get_child_session_id()
            if not opened.get("ok") or sid is None:
                return (
                    False,
                    "桌面分身还没连上。请到自动化面板点「启动分身」，或确认 3389 已开。"
                    "若暂时要在主桌面跑（会抢鼠标），到设置里关掉「图形自动化走桌面分身」。",
                    None,
                )
            _write_run_log(run_id, f"分身已启动：会话 {sid}")
        except Exception as exc:  # noqa: BLE001
            return False, f"桌面分身未连接，且自动启动失败：{exc}", None

    hs = host_status()
    preview = "预览窗开着" if hs.get("hostRunning") else "预览窗已关（不影响，脚本仍在分身会话里跑）"
    _write_run_log(
        run_id,
        f"图形自动化将在桌面分身会话 {sid} 里执行（{preview}，功能启用={st.get('enabled')}）",
    )
    return True, "", sid


def _oa_start_page_proc(argv: list[str], env: dict, child_sid: int | None):
    """主桌面用 Popen；分身用任务计划 RunEx。返回 (kind, handle)。"""
    if child_sid is None:
        proc = subprocess.Popen(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
        return "local", proc
    from child_session import launch_in_child_session

    job = launch_in_child_session(argv, env=env, session_id=child_sid)
    return "child", job


def _oa_iter_proc_lines(kind: str, handle, run_id: str):
    if kind == "local":
        assert handle.stdout is not None
        for raw in handle.stdout:
            line = raw.strip()
            if line:
                yield line
            if _check_cancelled(run_id):
                try:
                    handle.kill()
                except OSError:
                    pass
                return
        handle.wait()
        return
    # child job：轮询共享 stdout
    while True:
        for line in handle.read_new_lines():
            text = line.strip()
            if text:
                yield text
        if handle.poll() is not None:
            for line in handle.read_new_lines():
                text = line.strip()
                if text:
                    yield text
            return
        if _check_cancelled(run_id):
            return
        time.sleep(0.2)


def _run_oa_graph(run_id: str) -> tuple[bool, str]:
    """按任务步骤逐页：先点进页面，再做这一页各 tab 的筛选保留。"""
    if not _OA_PYTHON.is_file() or not _OA_SCRIPT.is_file():
        return False, "找不到 OA 图形自动化脚本或解释器"
    ok_pre, pre_err, child_sid = _oa_child_preflight(run_id)
    if not ok_pre:
        return False, pre_err
    run = get_run(run_id) or {}
    steps = [s for s in (run.get("steps") or []) if isinstance(s, dict)]
    page_steps = [s for s in steps if not str(s.get("id") or "").endswith("-in")]
    if not page_steps:
        return False, "没有要执行的页面"
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["OA_NOTICE"] = "panel"
    env["OA_CDP_PORT"] = str(env.get("OA_CDP_PORT") or "9333")
    notice = _oa_notice_open()
    noticed = False
    started = time.time()
    passed_pages: list[str] = []
    failed_pages: list[str] = []

    def finish_notice(lines: list[str]) -> None:
        nonlocal noticed
        if notice and not noticed:
            noticed = True
            notice.done(lines)

    if notice:
        _write_run_log(run_id, "左上角提示倒计时 5 秒，随后开始图形自动化")
        if not notice.countdown():
            notice.close()
            noticed = True
            _write_run_log(run_id, "倒计时里取消了")
            return False, "已取消"
        if not getattr(notice, "shown", False):
            _write_run_log(run_id, "倒计时窗口没有出现，直接开始")
    else:
        _write_run_log(run_id, "提示窗口没有打开，直接开始图形自动化")

    if child_sid is not None:
        _write_run_log(run_id, f"分身前置：清启动项 + 打开/登录 OA（会话 {child_sid}）")
        try:
            from child_session import prepare_child_oa

            prep = prepare_child_oa(force_login=False, timeout=180)
            for line in prep.get("lines") or []:
                _write_run_log(run_id, f"[prep] {line}")
            if not prep.get("ok"):
                finish_notice(["图形自动化已结束", "分身前置失败", str(prep.get("error") or "")])
                return False, f"分身前置失败：{prep.get('error') or '未知错误'}"
            _write_run_log(run_id, "分身前置完成")
        except Exception as exc:  # noqa: BLE001
            finish_notice(["图形自动化已结束", "分身前置异常", str(exc)])
            return False, f"分身前置异常：{exc}"

    failures: list[str] = []
    try:
        return _run_oa_graph_pages(
            run_id, page_steps, env, notice, passed_pages, failed_pages, failures,
            child_sid=child_sid,
        )
    finally:
        if notice and not noticed:
            if _check_cancelled(run_id):
                finish_notice(["图形自动化已结束", "这次被取消了"])
            else:
                elapsed = max(0, int(time.time() - started))
                mins, secs = divmod(elapsed, 60)
                lines = [
                    "图形自动化已结束",
                    f"共 {len(page_steps)} 个页面 · 通过 {len(passed_pages)} · 失败 {len(failed_pages)}",
                    f"用时 {mins} 分 {secs} 秒",
                ]
                if failed_pages:
                    lines.append("失败：" + "、".join(failed_pages[:6]))
                finish_notice(lines)


def _run_oa_graph_pages(run_id, page_steps, env, notice, passed_pages, failed_pages, failures, child_sid=None):
    for index, page in enumerate(page_steps, start=1):
        if _check_cancelled(run_id):
            return False, "已取消"
        step_id = str(page.get("id") or "")
        found = _oa_page_of(step_id)
        if not found:
            return False, f"对不上页面: {step_id}"
        group, name = found
        if notice:
            notice.running(f"正在执行：{name}（{index}/{len(page_steps)}）")
        enter_id = f"{step_id}-in"
        _set_step(run_id, enter_id, status="running", startedAt=_now(), error="", detail="正在点击进入页面")
        where = f"分身会话 {child_sid}" if child_sid is not None else "主桌面"
        _write_run_log(run_id, f"→ {enter_id} 点击进入{name}（{where}）")
        argv = [_OA_PYTHON, "-u", "-c", _OA_RUNNER, str(_OA_SCRIPT), group, name]
        kind, handle = _oa_start_page_proc(argv, env, child_sid)
        entered = False
        enter_error = ""
        rows: list[tuple[str, str, str]] = []
        cancelled = False
        for line in _oa_iter_proc_lines(kind, handle, run_id):
            _write_run_log(run_id, line)
            parts = line.split("\t")
            kind_line = parts[0]
            if kind_line == "ENTER":
                state = parts[1] if len(parts) > 1 else ""
                detail = parts[2] if len(parts) > 2 else ""
                if state == "通过":
                    entered = True
                    _set_step(run_id, enter_id, status="passed", finishedAt=_now(), detail=detail or f"已进入{name}", error="")
                    _set_step(run_id, step_id, status="running", startedAt=_now(), error="", detail="页面内分页筛选保留")
                else:
                    enter_error = detail or "没有进入页面"
                    _set_step(run_id, enter_id, status="failed", finishedAt=_now(), error=enter_error, detail="没有进入页面")
            elif kind_line == "TAB" and len(parts) >= 3:
                rows.append((parts[1], parts[2], "\t".join(parts[3:])))
            if _check_cancelled(run_id):
                cancelled = True
                break
        if _check_cancelled(run_id):
            cancelled = True
        if kind == "local":
            code = handle.returncode if handle.returncode is not None else handle.wait()
        else:
            code = handle.poll()
            if code is None:
                try:
                    code = handle.wait(timeout=5)
                except TimeoutError:
                    code = 1
            handle.cleanup()
        if cancelled:
            return False, "已取消"
        if not entered:
            if not enter_error:
                enter_error = f"进入{name}失败（退出码 {code}）"
            _set_step(run_id, enter_id, status="failed", finishedAt=_now(), error=enter_error, detail="没有进入页面")
            _set_step(run_id, step_id, status="failed", finishedAt=_now(), error="前置步骤没有进入页面", detail="")
            failures.append(f"{name}：{enter_error}")
            failed_pages.append(name)
            continue
        bad = [row for row in rows if row[1] in {"失败", "不通过"}]
        passed_n = sum(1 for row in rows if row[1] == "通过")
        skipped_n = sum(1 for row in rows if row[1] == "跳过")
        detail = f"通过 {passed_n}，跳过 {skipped_n}"
        if bad:
            detail = "；".join(f"{label} {state} {note}".strip() for label, state, note in bad[:4])
        shots = _oa_copy_shots(run_id, step_id, group, name)
        assertions = [
            {
                "name": f"{name}-{label}",
                "passed": state in {"通过", "跳过"},
                "expected": (
                    "核验汇总测点"
                    if str(label).startswith("核验汇总-")
                    else "画面与原型一致"
                    if str(label).startswith(("明细列表-", "异常处置-", "操作日志-"))
                    else "筛选保留"
                ),
                "actual": note or state,
            }
            for label, state, note in rows
        ]
        if bad or code not in {0, None}:
            err = detail or f"{name} 未通过"
            failures.append(f"{name}：{err}")
            failed_pages.append(name)
            _set_step(
                run_id,
                step_id,
                status="failed",
                finishedAt=_now(),
                error=err,
                detail=detail,
                assertions=assertions,
                screenshots=shots,
            )
        else:
            passed_pages.append(name)
            _set_step(
                run_id,
                step_id,
                status="passed",
                finishedAt=_now(),
                error="",
                detail=detail or "ok",
                assertions=assertions,
                screenshots=shots,
            )
        if assertions:
            cur = get_run(run_id) or {}
            _update_run(run_id, assertions=list(cur.get("assertions") or []) + assertions)
    if failures:
        return False, "；".join(failures[:8])
    return True, ""


# 可默认落到资金链路（充值→提现）的流水线；未知 id 且无 runner 时禁止误入该链
MONEY_CHAIN_PIPE_IDS = {
    PIPELINE_ID,
    "money_recharge_to_withdraw",
    "guild_seed_ready",
}
_RUNNER_ALLOW_PREFIXES = ("v1_regression_biz", "money_flow", "money_settlement_pw", "auto_control")


def _call_declared_runner(runner: str, run_id: str, pipe_id: str, opts: dict) -> tuple[bool, str]:
    """流水线 JSON 的 runner=模块.函数；仅允许 workbench 下白名单模块。"""
    runner = str(runner or "").strip()
    if "." not in runner:
        return False, f"runner 格式错误：{runner}（应为 模块.函数）"
    mod_name, fn_name = runner.rsplit(".", 1)
    if not any(mod_name == p or mod_name.startswith(p + ".") for p in _RUNNER_ALLOW_PREFIXES):
        return False, f"runner 模块不在白名单：{mod_name}"
    try:
        mod = __import__(mod_name, fromlist=[fn_name])
        fn = getattr(mod, fn_name)
    except Exception as exc:  # noqa: BLE001
        return False, f"导入 runner 失败：{runner}: {exc}"
    try:
        return fn(run_id, pipe_id, opts)
    except TypeError:
        # 兼容只收 (run_id, opts) 的旧签名
        return fn(run_id, opts)


def _execute_run(run_id: str) -> None:
    run = get_run(run_id)
    if not run:
        return
    profile = str(run.get("profile") or "A")
    target = str(run.get("target") or "lx")
    opts = run.get("options") if isinstance(run.get("options"), dict) else {}
    _update_run(run_id, status="running", startedAt=_now(), error="")
    _write_run_log(run_id, f"开始执行 profile={profile}")

    try:
        pipe_id = str(run.get("pipelineId") or PIPELINE_ID)
        pipe_def = get_pipeline(pipe_id) or {}
        runner = str(pipe_def.get("runner") or "").strip()
        if runner:
            ok, err = _call_declared_runner(runner, run_id, pipe_id, opts)
        elif pipe_id == "oa_inner_tab_keep_filter":
            ok, err = _run_oa_graph(run_id)
        elif pipe_id == "guild_seed_ready":
            ok, err = _run_profile_seed(run_id, target, opts)
        elif pipe_id.startswith("v1reg_"):
            # 兼容：旧数据可能缺 runner 字段
            from v1_regression_biz import run_pipeline as _v1_biz_run

            ok, err = _v1_biz_run(run_id, pipe_id, opts)
        elif pipe_id in MONEY_CHAIN_PIPE_IDS:
            if profile == "A":
                ok, err = _run_profile_a(run_id, target, opts)
            else:
                ok, err = _run_profile_b(run_id, target, opts)
        else:
            ok, err = False, (
                f"未配置 runner：流水线 {pipe_id} 不能默认跑充值→提现链；"
                "请在 auto_control_pipelines.json 填写 runner，或改用已知资金链路 id"
            )
        cur = get_run(run_id) or {}
        if _cancel_flag.is_set() or cur.get("status") == "cancelled" or err == "已取消":
            _update_run(run_id, status="cancelled", finishedAt=_now(), error="用户取消")
            _write_run_log(run_id, "执行已取消")
            return
        if ok:
            _update_run(run_id, status="passed", finishedAt=_now(), currentStepId="")
            _write_run_log(run_id, "全部通过")
        else:
            st = "stub_stop" if "stub" in str(err).lower() or "未接线" in str(err) else "failed"
            _update_run(
                run_id,
                status="failed",
                finishedAt=_now(),
                error=err or "失败",
                stopReason=st,
            )
            _write_run_log(run_id, f"失败: {err}")
        try:
            write_apifox_bridge(run_id)
        except Exception:  # noqa: BLE001
            pass
        _write_report_html(run_id)
        try:
            maybe_notify_run(run_id)
        except Exception as notify_exc:  # noqa: BLE001
            _write_run_log(run_id, f"Webhook 通知跳过: {notify_exc}")
        if not ok:
            try:
                maybe_auto_retry(run_id)
            except Exception as retry_exc:  # noqa: BLE001
                _write_run_log(run_id, f"自动重试跳过: {retry_exc}")
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        _write_run_log(run_id, tb)
        _update_run(run_id, status="failed", finishedAt=_now(), error=str(exc))
        try:
            _write_report_html(run_id)
        except Exception:  # noqa: BLE001
            pass
        try:
            maybe_notify_run(run_id)
        except Exception:  # noqa: BLE001
            pass
        try:
            maybe_auto_retry(run_id)
        except Exception:  # noqa: BLE001
            pass


def _check_cancelled(run_id: str) -> bool:
    if _cancel_flag.is_set():
        return True
    r = get_run(run_id)
    return bool(r and r.get("status") == "cancelled")


def _run_step(
    run_id: str,
    step_id: str,
    fn: Callable[[], dict],
) -> tuple[bool, str]:
    if _check_cancelled(run_id):
        return False, "已取消"
    run = get_run(run_id) or {}
    steps = list(run.get("steps") or [])
    step = next((s for s in steps if str(s.get("id")) == step_id), None)
    # 本档未包含该步（例如档 A 没有 S7+）
    if steps and step is None:
        _write_run_log(run_id, f"→ {step_id} 跳过（不在本跑次档位）")
        return True, ""
    # 未勾选 / 续跑跳过：只记 skipped，不算失败
    if step is not None and (
        step.get("selected") is False or str(step.get("status") or "") == "skipped"
    ):
        reason = str(step.get("detail") or "").strip() or (
            "未勾选，跳过" if step.get("selected") is False else "跳过"
        )
        if str(step.get("status") or "") != "skipped":
            _set_step(
                run_id,
                step_id,
                status="skipped",
                finishedAt=_now(),
                detail=reason,
                error="",
            )
        _write_run_log(run_id, f"→ {step_id} 跳过（{reason}）")
        return True, ""
    opts = run.get("options") if isinstance(run.get("options"), dict) else {}
    from_step = str((opts or {}).get("fromStepId") or "").strip()
    if from_step:
        order = _pipeline_step_order(str(run.get("pipelineId") or PIPELINE_ID), str(run.get("profile") or "B"))
        if _step_rank(step_id, order) >= 0 and _step_rank(from_step, order) >= 0:
            if _step_rank(step_id, order) < _step_rank(from_step, order):
                _set_step(
                    run_id,
                    step_id,
                    status="skipped",
                    finishedAt=_now(),
                    detail=f"续跑自 {from_step}，本步跳过",
                    error="",
                )
                _write_run_log(run_id, f"→ {step_id} 跳过（续跑自 {from_step}）")
                return True, ""
    _set_step(run_id, step_id, status="running", startedAt=_now(), error="", detail="执行中…")
    _write_run_log(run_id, f"→ {step_id} 开始")
    try:
        result = fn()
    except Exception as exc:  # noqa: BLE001
        _set_step(
            run_id,
            step_id,
            status="failed",
            finishedAt=_now(),
            error=str(exc),
            detail="异常",
        )
        _write_run_log(run_id, f"← {step_id} 异常 {exc}")
        return False, str(exc)

    raw_shots = result.get("screenshots") if isinstance(result.get("screenshots"), list) else []
    shots: list[dict] = []
    for sh in raw_shots:
        if not isinstance(sh, dict):
            continue
        file_name = str(sh.get("file") or "").replace("\\", "/").lstrip("/")
        # 允许 S7/foo.png 相对 shots 根
        rel = file_name
        abs_path = str(sh.get("path") or "").replace("\\", "/")
        if abs_path and "shots/" in abs_path:
            rel = abs_path.split("shots/", 1)[-1]
        elif file_name and "/" not in file_name:
            # 仅文件名时从 path 父目录猜步骤子目录
            parent = Path(abs_path).parent.name if abs_path else step_id
            rel = f"{parent}/{file_name}"
        shots.append(
            {
                "name": str(sh.get("name") or rel),
                "file": rel,
                "url": f"/api/auto-control/runs/{run_id}/shots/{rel}",
            }
        )
    calls = result.get("calls") if isinstance(result.get("calls"), list) else None
    if calls:
        _store_exchanges(run_id, calls)

    raw_traces = result.get("traces") if isinstance(result.get("traces"), list) else []
    traces: list[dict] = []
    for tr in raw_traces:
        if not isinstance(tr, dict):
            continue
        file_name = str(tr.get("file") or "").replace("\\", "/").lstrip("/")
        rel = file_name
        abs_path = str(tr.get("path") or "").replace("\\", "/")
        if abs_path and "trace/" in abs_path:
            rel = abs_path.split("trace/", 1)[-1]
        traces.append(
            {
                "name": str(tr.get("name") or rel),
                "file": rel,
                "url": f"/api/auto-control/runs/{run_id}/traces/{rel}",
            }
        )

    if result.get("stub"):
        msg = str(result.get("missing") or result.get("error") or "步骤未接线（stub）")
        _set_step(
            run_id,
            step_id,
            status="stub",
            finishedAt=_now(),
            error=msg,
            detail="遇 stub 停止",
            screenshots=shots,
            traces=traces,
            **({"calls": calls} if calls is not None else {}),
        )
        _write_run_log(run_id, f"← {step_id} stub: {msg}")
        return False, msg

    if not result.get("ok"):
        err = str(result.get("error") or "步骤失败")
        assertions = result.get("assertions") if isinstance(result.get("assertions"), list) else []
        _set_step(
            run_id,
            step_id,
            status="failed",
            finishedAt=_now(),
            error=err,
            detail=str(result.get("detail") or ""),
            assertions=assertions,
            screenshots=shots,
            traces=traces,
            **({"calls": calls} if calls is not None else {}),
        )
        if assertions:
            run = get_run(run_id) or {}
            all_as = list(run.get("assertions") or [])
            all_as.extend(assertions)
            _update_run(run_id, assertions=all_as)
        _write_run_log(run_id, f"← {step_id} 失败: {err}")
        return False, err

    assertions = result.get("assertions") if isinstance(result.get("assertions"), list) else []
    _set_step(
        run_id,
        step_id,
        status="passed",
        finishedAt=_now(),
        detail=str(result.get("detail") or "ok"),
        error="",
        assertions=assertions,
        screenshots=shots,
            traces=traces,
        **({"calls": calls} if calls is not None else {}),
    )
    metrics = result.get("metrics")
    patch: dict[str, Any] = {}
    if isinstance(metrics, dict) and metrics:
        run = get_run(run_id) or {}
        patch["metrics"] = {**(run.get("metrics") or {}), **metrics}
    if assertions:
        run = get_run(run_id) or {}
        all_as = list(run.get("assertions") or [])
        all_as.extend(assertions)
        patch["assertions"] = all_as
    if patch:
        _update_run(run_id, **patch)
    _write_run_log(run_id, f"← {step_id} 通过")
    return True, ""


def _run_profile_a(run_id: str, target: str, opts: dict) -> tuple[bool, str]:
    from money_flow import (
        assert_commission,
        ensure_recharge_callback,
        load_apply_ratio,
        lookup_spend,
        simulate_recharge,
    )
    from game_sdk_api import run_player_flow

    from money_settlement_pw import default_game_id, default_promote, load_settlement_config
    from platform_env import with_platform_host

    sett = load_settlement_config(target=target)
    _def_pid, _def_acc = default_promote(target)
    pid = int(opts.get("promoteId") or _def_pid)
    gid = int(opts.get("gameId") or default_game_id(target))
    promo_acc = str(opts.get("promoteAccount") or _def_acc)
    guild_pwd = str(opts.get("guildLoginPassword") or sett.get("guildLoginPassword") or "")
    ctx: dict[str, Any] = {"account": "", "userId": ""}

    def s0() -> dict:
        from money_flow import ensure_guild_game_ready

        ready = ensure_guild_game_ready(
            promote_id=pid,
            game_id=gid,
            guild_account=promo_acc,
            guild_password=guild_pwd or None,
            source_db=target,
        )
        apply_row = ready.get("apply") or load_apply_ratio(pid, gid, source_db=target)
        if not ready.get("ok"):
            return {
                "ok": False,
                "error": ready.get("error") or "会长未申请/未通过该游戏",
                "detail": str(ready),
                "assertions": [
                    {
                        "name": "会长申请游戏就绪",
                        "expected": "status=1 且有比例",
                        "actual": str(apply_row or ready.get("error")),
                        "passed": False,
                    }
                ],
            }
        if float((apply_row or {}).get("promote_ratio") or 0) <= 0:
            return {"ok": False, "error": "promote_ratio 无效", "detail": str(apply_row)}
        ratio = apply_row.get("promote_ratio")
        branched = bool(ready.get("branched"))
        detail = ready.get("detail") or f"promote={pid} ratio={ratio}"
        if branched:
            detail = f"自动补申请 · {detail} · branch={ready.get('branch')}"
        return {
            "ok": True,
            "detail": detail,
            "metrics": {
                "promoteId": pid,
                "gameId": gid,
                "promoteAccount": promo_acc,
                "promoteRatio": ratio,
                "applyBranched": branched,
            },
            "assertions": [
                {
                    "name": "会长申请通过",
                    "expected": "status=1",
                    "actual": f"status={apply_row.get('status')}"
                    + ("（本跑次自动申请）" if branched else ""),
                    "passed": True,
                },
                {"name": "分佣比例可读", "expected": ">0", "actual": str(ratio), "passed": True},
            ],
        }

    ok, err = _run_step(run_id, "S0", s0)
    if not ok:
        return False, err

    def s4() -> dict:
        ok_cb, cb_status = ensure_recharge_callback()
        if not ok_cb:
            return {"ok": False, "error": f"3780 未就绪: {cb_status}"}
        from game_sdk_api import load_game_sdk_config
        from platform_env import player_account_prefix

        sdk_cfg = with_platform_host(load_game_sdk_config(), target)
        sdk_cfg["gameId"] = str(gid)
        # 优先结算配置里的 playerAccountPrefix，否则按平台约定 yqautotest / lxautotest
        sdk_cfg["accountPrefix"] = str(
            sett.get("playerAccountPrefix") or player_account_prefix(target)
        ).strip() or player_account_prefix(target)
        if sett.get("serverId"):
            sdk_cfg["serverId"] = str(sett.get("serverId"))
        if sett.get("serverName"):
            sdk_cfg["serverName"] = str(sett.get("serverName"))
        flow = run_player_flow(promote_id=pid, game_id=str(gid), cfg=sdk_cfg, source_db=target)
        calls = _player_flow_calls(flow)
        if not flow.get("ok"):
            return {
                "ok": False,
                "error": flow.get("error") or "玩家流失败",
                "detail": str(flow.get("step") or ""),
                "calls": calls,
            }
        ctx["account"] = str(flow.get("account") or "")
        ctx["userId"] = str(flow.get("userId") or "")
        return {
            "ok": True,
            "detail": f"account={ctx['account']}",
            "metrics": {"account": ctx["account"], "userId": ctx["userId"]},
            "calls": calls,
            "assertions": [
                {"name": "注册拿到账号", "expected": "非空 account", "actual": ctx["account"], "passed": bool(ctx["account"])},
                {"name": "注册拿到 userId", "expected": "非空 userId", "actual": ctx["userId"], "passed": bool(ctx["userId"])},
            ],
        }

    ok, err = _run_step(run_id, "S4", s4)
    if not ok:
        return False, err

    def s5() -> dict:
        account = ctx.get("account") or ""
        if not account:
            return {"ok": False, "error": "无玩家账号"}
        try:
            cb = simulate_recharge(account, source_db=target)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}
        if not cb.get("ok"):
            return {"ok": False, "error": "simulate-recharge 失败", "detail": str(cb)}
        spend = {}
        for _ in range(24):
            if _check_cancelled(run_id):
                return {"ok": False, "error": "已取消"}
            spend = lookup_spend(account, source_db=target)
            if spend and int(spend.get("pay_status") or 0) == 1:
                break
            time.sleep(0.5)
        if not spend or int(spend.get("pay_status") or 0) != 1:
            return {"ok": False, "error": "回调后订单未成功", "detail": str(spend)}
        pay_ok = int(spend.get("pay_status") or 0) == 1
        promo_ok = int(spend.get("promote_id") or 0) == pid
        return {
            "ok": True,
            "detail": f"order={spend.get('pay_order_number')}",
            "metrics": {
                "payOrder": spend.get("pay_order_number"),
                "payAmount": spend.get("pay_amount"),
                "settlementRowId": "",
            },
            "assertions": [
                {
                    "name": "订单支付成功",
                    "expected": "pay_status=1",
                    "actual": f"pay_status={spend.get('pay_status')}",
                    "passed": pay_ok,
                },
                {
                    "name": "订单归属会长",
                    "expected": f"promote_id={pid}",
                    "actual": f"promote_id={spend.get('promote_id')}",
                    "passed": promo_ok,
                },
                {
                    "name": "订单金额",
                    "expected": "有 pay_amount",
                    "actual": str(spend.get("pay_amount")),
                    "passed": spend.get("pay_amount") is not None,
                },
            ],
        }

    ok, err = _run_step(run_id, "S5", s5)
    if not ok:
        return False, err

    def s6() -> dict:
        account = ctx.get("account") or ""
        check = assert_commission(account=account, promote_id=pid, game_id=gid, source_db=target)
        sett = check.get("settlement") or {}
        checks = check.get("checks") if isinstance(check.get("checks"), dict) else {}
        expected = check.get("expectedCommission")
        assertions = [
            {
                "name": "用户归属",
                "expected": f"promote_id={pid}",
                "actual": str((check.get("user") or {}).get("promote_id")),
                "passed": bool(checks.get("归属")),
            },
            {
                "name": "订单成功",
                "expected": "pay_status=1",
                "actual": str((check.get("spend") or {}).get("pay_status")),
                "passed": bool(checks.get("订单成功")),
            },
            {
                "name": "分佣流水 promote",
                "expected": f"promote_id={pid}",
                "actual": str(sett.get("promote_id")),
                "passed": bool(checks.get("流水promote")),
            },
            {
                "name": "分佣比例对齐",
                "expected": "settlement.ratio ≈ apply.promote_ratio",
                "actual": f"ratio={sett.get('ratio')}",
                "passed": bool(checks.get("比例对齐")),
            },
            {
                "name": "分成金额 sum_money",
                "expected": str(expected),
                "actual": str(sett.get("sum_money")),
                "passed": bool(checks.get("sum_money对齐")),
            },
        ]
        if not check.get("ok"):
            return {
                "ok": False,
                "error": check.get("error") or "分佣断言失败",
                "assertions": assertions,
            }
        return {
            "ok": True,
            "detail": f"sum_money={sett.get('sum_money')} expected={expected} ratio={sett.get('ratio')}",
            "metrics": {
                "settlementRowId": sett.get("id"),
                "sumMoney": sett.get("sum_money"),
                "expectedCommission": expected,
                "payOrder": sett.get("pay_order_number") or (check.get("spend") or {}).get("pay_order_number"),
            },
            "assertions": assertions,
        }

    return _run_step(run_id, "S6", s6)


_SECRET_KEYS = {
    "password",
    "repassword",
    "token",
    "pwd",
    "sms_code",
    "idcard",
    "md5_sign",
    "sign",
    "access_key",
    "accesskey",
}
_EXCHANGE_CHARS = 3500


def _redact_tree(obj: Any, depth: int = 0) -> Any:
    if depth > 5:
        return "…"
    if isinstance(obj, dict):
        out = {}
        for i, (key, val) in enumerate(obj.items()):
            if i >= 40:
                out["…"] = f"另有 {len(obj) - 40} 个字段"
                break
            out[str(key)] = "***" if str(key).lower() in _SECRET_KEYS else _redact_tree(val, depth + 1)
        return out
    if isinstance(obj, list):
        return [_redact_tree(x, depth + 1) for x in obj[:20]]
    if isinstance(obj, str) and len(obj) > 400:
        return obj[:400] + "…"
    return obj


def pretty_json_text(text: Any) -> str:
    """把已存的 JSON 字符串排成缩进，方便报告和详情查看。截断后缀保留。"""
    raw = "" if text is None else str(text)
    body = raw
    suffix = ""
    mark = "…(已截断)"
    if raw.endswith(mark):
        body = raw[: -len(mark)].rstrip()
        suffix = "\n…(已截断)"
    try:
        parsed = json.loads(body)
    except (json.JSONDecodeError, TypeError, ValueError):
        return raw
    try:
        return json.dumps(parsed, ensure_ascii=False, indent=2, default=str) + suffix
    except TypeError:
        return raw


def _clip_text(obj: Any) -> str:
    try:
        text = json.dumps(_redact_tree(obj), ensure_ascii=False, default=str)
    except TypeError:
        text = str(obj)
    if len(text) > _EXCHANGE_CHARS:
        return text[:_EXCHANGE_CHARS] + "…(已截断)"
    return text


def _exchange_from_result(result: dict) -> dict | None:
    if not isinstance(result, dict):
        return None
    req = result.get("request")
    resp = result.get("response")
    if req is None and resp is None:
        return None
    return {"request": _clip_text(req), "response": _clip_text(resp)}


def _store_exchanges(run_id: str, calls: list[dict]) -> None:
    """报文落到该跑次目录，不写进总表，避免每次加载任务列表都把正文读进内存。"""
    rows = []
    for call in calls:
        if not isinstance(call, dict):
            continue
        ex = call.pop("exchange", None)
        if not isinstance(ex, dict):
            continue
        rows.append(
            {
                "name": call.get("name") or "",
                "path": call.get("path") or "",
                "method": call.get("method") or "",
                "request": ex.get("request") or "",
                "response": ex.get("response") or "",
            }
        )
    if not rows:
        return
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "exchanges.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _load_exchanges(run_id: str) -> list[dict]:
    path = RUNS_DIR / str(run_id or "") / "exchanges.json"
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return raw if isinstance(raw, list) else []


def _merge_exchanges(run_id: str, apis: list[dict]) -> list[dict]:
    saved = {
        (str(x.get("name") or ""), str(x.get("path") or "")): x
        for x in _load_exchanges(run_id)
        if isinstance(x, dict)
    }
    if not saved:
        return apis
    for api in apis:
        hit = saved.get((str(api.get("name") or ""), str(api.get("path") or "")))
        if not hit:
            continue
        api["request"] = str(hit.get("request") or "")
        api["response"] = str(hit.get("response") or "")
    return apis


def _call_brief(result: dict) -> str:
    if not isinstance(result, dict):
        return ""
    resp = result.get("response")
    msg = str(resp.get("msg") or "") if isinstance(resp, dict) else ""
    err = str(result.get("error") or "")
    http = result.get("httpStatus")
    bits = []
    if http:
        bits.append(f"HTTP {http}")
    if msg:
        bits.append(msg[:80])
    elif err:
        bits.append(err[:80])
    return " · ".join(bits)


def _player_flow_calls(flow: dict) -> list[dict]:
    """把玩家注册～下单拆成报告里能看的接口行。登录若注册已带回 token，标成未单独请求。"""
    flow = flow if isinstance(flow, dict) else {}
    reg = flow.get("register") if isinstance(flow.get("register"), dict) else {}
    idc = flow.get("idcard") if isinstance(flow.get("idcard"), dict) else {}
    role = flow.get("role") if isinstance(flow.get("role"), dict) else {}
    pay = flow.get("pay") if isinstance(flow.get("pay"), dict) else {}
    meta = reg.get("meta") if isinstance(reg.get("meta"), dict) else {}
    rows: list[dict] = []
    if meta:
        rows.append(
            {
                "method": "SQL",
                "path": "tab_game / 本地配置",
                "name": "取游戏 access_key",
                "kind": "工作台",
                "ok": bool(meta.get("ok", True)),
                "note": f"来源 {meta.get('source') or '配置'} · gameId={meta.get('gameId') or ''}",
            }
        )
    if reg:
        rows.append(
            {
                "method": "POST",
                "path": str(reg.get("path") or "/sdk/User/register"),
                "name": "游戏注册",
                "kind": "SDK 接口",
                "ok": bool(reg.get("ok")),
                "httpStatus": reg.get("httpStatus") or "",
                "note": _call_brief(reg),
                "exchange": _exchange_from_result(reg),
            }
        )
        if reg.get("token"):
            rows.append(
                {
                    "method": "POST",
                    "path": "/sdk/User/user_login",
                    "name": "账号登录",
                    "kind": "SDK 接口",
                    "ok": True,
                    "skipped": True,
                    "note": "注册响应已带登录 token，本跑次未再单独请求登录",
                }
            )
        else:
            rows.append(
                {
                    "method": "POST",
                    "path": "/sdk/User/user_login",
                    "name": "账号登录",
                    "kind": "SDK 接口",
                    "ok": False,
                    "note": "注册未返回 token，本跑次也没有补打登录",
                }
            )
    if idc:
        rows.append(
            {
                "method": "POST",
                "path": str(idc.get("path") or "/sdk/user/idcard_change"),
                "name": "实名",
                "kind": "SDK 接口",
                "ok": bool(idc.get("ok")),
                "httpStatus": idc.get("httpStatus") or "",
                "note": _call_brief(idc),
                "exchange": _exchange_from_result(idc),
            }
        )
    if role:
        rows.append(
            {
                "method": "POST",
                "path": str(role.get("path") or "/sdk/User/save_user_play_info"),
                "name": "上传角色",
                "kind": "SDK 接口",
                "ok": bool(role.get("ok")),
                "httpStatus": role.get("httpStatus") or "",
                "note": _call_brief(role),
                "exchange": _exchange_from_result(role),
            }
        )
    if pay:
        rows.append(
            {
                "method": "POST",
                "path": "/sdk/pay/get_pay_server",
                "name": "获取支付方式",
                "kind": "SDK 接口",
                "ok": True,
                "skipped": True,
                "note": "本跑次直接提交支付订单，未再单独请求支付方式列表",
            }
        )
        rows.append(
            {
                "method": "POST",
                "path": str(pay.get("path") or "/sdk/pay/and_alipay_pay"),
                "name": "提交支付订单",
                "kind": "SDK 接口",
                "ok": bool(pay.get("ok")),
                "httpStatus": pay.get("httpStatus") or "",
                "note": _call_brief(pay),
                "exchange": _exchange_from_result(pay),
            }
        )
    return rows


# 步骤 ↔ 接口附录（对齐框架文档；报告 UI 参考 Allure / pytest-xhtml）
STEP_API_CATALOG: dict[str, list[dict[str, str]]] = {
    "S0": [
        {
            "method": "SQL",
            "path": "tab_promote_apply（缺则自动 F5 申请游戏）",
            "name": "会长申请 / promote_ratio",
            "kind": "SQL",
            "note": "校验 status=1 且分佣比例可读",
        }
    ],
    "S4": [
        {
            "method": "GET",
            "path": "/api/game-sdk/access-key",
            "name": "取游戏 access_key",
            "kind": "工作台",
            "note": "按 game_id + source_db",
        },
        {
            "method": "POST",
            "path": "/sdk/User/register",
            "name": "游戏注册",
            "kind": "SDK 接口",
            "note": "md5_sign；写出 account / user_id",
        },
        {
            "method": "POST",
            "path": "/sdk/User/user_login",
            "name": "账号登录",
            "kind": "SDK 接口",
        },
        {
            "method": "POST",
            "path": "/sdk/user/idcard_change",
            "name": "实名",
            "kind": "SDK 接口",
        },
        {
            "method": "POST",
            "path": "/sdk/User/save_user_play_info",
            "name": "上传角色",
            "kind": "SDK 接口",
        },
        {
            "method": "POST",
            "path": "/sdk/pay/get_pay_server",
            "name": "获取支付方式",
            "kind": "SDK 接口",
        },
        {
            "method": "POST",
            "path": "/sdk/pay/and_alipay_pay",
            "name": "提交支付订单",
            "kind": "SDK 接口",
            "note": "写 tab_spend（未支付）",
        },
    ],
    "S5": [
        {
            "method": "POST",
            "path": "http://127.0.0.1:3780/api/simulate-recharge",
            "name": "模拟支付回调",
            "kind": "回调服务",
            "note": "JSON: account / database / callbackType=game",
        },
        {
            "method": "SQL",
            "path": "tab_spend",
            "name": "核对订单到账",
            "kind": "SQL",
            "note": "pay_status=1 且归属会长",
        },
    ],
    "S6": [
        {
            "method": "SQL",
            "path": "tab_user / tab_spend / settlement",
            "name": "分佣断言",
            "kind": "SQL",
            "note": "归属、比例、sum_money 对齐",
        }
    ],
    "S7": [
        {
            "method": "GET",
            "path": "/promote/settlement/generatesettlementall.html",
            "name": "渠道结算",
            "kind": "HTTP·表单",
            "note": "id=settlementRowId&is_bind=1",
        }
    ],
    "S8": [
        {
            "method": "POST",
            "path": "/channelsite/settlement/do_confirm.html",
            "name": "会长确认→可提现",
            "kind": "HTTP·表单",
            "note": "id=periodId",
        }
    ],
    "S9": [
        {
            "method": "POST",
            "path": "/channelsite/settlement/withdrawal.html",
            "name": "会长提现",
            "kind": "HTTP·表单",
            "note": "balance_type=balance_profit",
        }
    ],
    "S10": [
        {
            "method": "POST",
            "path": "/promote/settlement/changestatus/status/1.html",
            "name": "收益提现-通过",
            "kind": "HTTP·表单",
            "note": "ids[]=withdrawId",
        }
    ],
    "S11": [
        {
            "method": "POST",
            "path": "/promote/settlement/paid.html",
            "name": "收益提现-打款",
            "kind": "HTTP·表单",
            "note": "需 options.enablePayout=true",
        }
    ],
}


def _normalize_api(step_id: str, raw: dict) -> dict:
    raw_method = str(raw.get("method") or "HTTP").strip() or "HTTP"
    method = raw_method.upper()
    known = {"GET", "POST", "PUT", "DELETE", "PATCH", "SQL", "HTTP"}
    if method not in known:
        method = raw_method
    method_class = method if method in {"GET", "POST", "PUT", "DELETE", "SQL"} else "HTTP"
    out = {
        "stepId": step_id,
        "method": method,
        "method_class": method_class,
        "path": str(raw.get("path") or ""),
        "name": str(raw.get("name") or ""),
        "kind": str(raw.get("kind") or ""),
        "note": str(raw.get("note") or ""),
        "skipped": bool(raw.get("skipped")),
    }
    if "ok" in raw:
        out["ok"] = bool(raw.get("ok"))
    if raw.get("httpStatus"):
        out["httpStatus"] = raw.get("httpStatus")
    return out


def step_apis(step: dict) -> list[dict]:
    """有本次调用记录就用记录，否则用步骤自带明细，再否则用接口清单。"""
    sid = str((step or {}).get("id") or "")
    calls = step.get("calls") if isinstance(step, dict) and isinstance(step.get("calls"), list) else []
    embedded = step.get("apis") if isinstance(step, dict) and isinstance(step.get("apis"), list) else []
    source = calls or embedded or STEP_API_CATALOG.get(sid, [])
    return [_normalize_api(sid, x) for x in source if isinstance(x, dict)]


def _with_step_apis(run: dict | None) -> dict | None:
    if not run:
        return None
    steps = []
    for s in run.get("steps") or []:
        if not isinstance(s, dict):
            continue
        item = dict(s)
        item["apis"] = _merge_exchanges(str(run.get("id") or ""), step_apis(item))
        steps.append(item)
    run["steps"] = steps
    return run


# 报告展示用中文（值本身如 runId / Method / Path / 账号 保持原样）
_STATUS_ZH = {
    "passed": "通过",
    "failed": "失败",
    "cancelled": "已取消",
    "running": "执行中",
    "queued": "排队中",
    "pending": "待执行",
    "skipped": "已跳过",
    "stub": "占位停止",
    "unknown": "未知",
}
_TARGET_ZH = {"lx": "龙翔", "yq": "游趣", "hw": "汇玩"}
_SOURCE_ZH = {
    "manual": "手动",
    "retry": "重试",
    "auto_retry": "自动重试",
    "batch_retry": "批量重试",
    "schedule": "定时",
    "api": "接口触发",
}
_EVENT_ZH = {"passed": "通过", "failed": "失败", "stub": "未接线停止"}

_ENGINE_ZH = {
    "sql": "数据库查询",
    "sdk": "SDK 接口",
    "callback": "支付回调",
    "sql_assert": "数据库断言",
    "form_admin": "总后台表单",
    "form_guild": "会长端表单",
    "pw_admin": "Playwright·总后台",
    "pw_guild": "Playwright·会长端",
}
_WIRING_ZH = {"wired": "已接线", "stub": "未接线（占位）"}


def _zh_status(code: str) -> str:
    c = str(code or "").strip().lower()
    return _STATUS_ZH.get(c, str(code or "—") or "—")


def _zh_target(code: str) -> str:
    c = str(code or "").strip().lower()
    return _TARGET_ZH.get(c, str(code or "—") or "—")


def _zh_source(code: str) -> str:
    c = str(code or "").strip().lower()
    return _SOURCE_ZH.get(c, str(code or "—") or "—")


def _zh_engine(code: str) -> str:
    c = str(code or "").strip()
    return _ENGINE_ZH.get(c, c or "—")


def _zh_wiring(code: str) -> str:
    c = str(code or "").strip().lower()
    return _WIRING_ZH.get(c, str(code or "—") or "—")


def _parse_duration(started: str, finished: str) -> str:
    a, b = _parse_ts(started), _parse_ts(finished)
    if not a or not b:
        return "—"
    sec = max(0, int((b - a).total_seconds()))
    if sec < 60:
        return f"{sec} 秒"
    return f"{sec // 60} 分 {sec % 60} 秒"


def _write_report_html(run_id: str) -> str:
    """生成 Allure/pytest-xhtml 风格自包含报告（含接口附录），返回相对路径。"""
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    run = get_run(run_id)
    if not run:
        return ""
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    assertions: list[dict] = []
    for s in run.get("steps") or []:
        for a in s.get("assertions") or []:
            assertions.append(
                {
                    "stepId": str(s.get("id") or ""),
                    "stepTitle": str(s.get("title") or ""),
                    "name": str(a.get("name") or ""),
                    "expected": str(a.get("expected") if a.get("expected") is not None else ""),
                    "actual": str(a.get("actual") if a.get("actual") is not None else ""),
                    "passed": bool(a.get("passed")),
                }
            )
    if not assertions and isinstance(run.get("assertions"), list):
        for a in run.get("assertions") or []:
            assertions.append(
                {
                    "stepId": str(a.get("stepId") or ""),
                    "stepTitle": str(a.get("stepTitle") or ""),
                    "name": str(a.get("name") or ""),
                    "expected": str(a.get("expected") if a.get("expected") is not None else ""),
                    "actual": str(a.get("actual") if a.get("actual") is not None else ""),
                    "passed": bool(a.get("passed")),
                }
            )
    # 旧跑次：用 metrics 兜底几条关键断言，避免附录空
    m = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
    if not assertions and m:
        if m.get("account"):
            assertions.append(
                {
                    "stepId": "S4",
                    "stepTitle": "玩家注册～下单",
                    "name": "玩家账号",
                    "expected": "非空",
                    "actual": str(m.get("account")),
                    "passed": True,
                }
            )
        if m.get("payOrder"):
            assertions.append(
                {
                    "stepId": "S5",
                    "stepTitle": "模拟支付回调",
                    "name": "订单号",
                    "expected": "有订单",
                    "actual": str(m.get("payOrder")),
                    "passed": True,
                }
            )
        if m.get("expectedCommission") is not None or m.get("sumMoney") is not None:
            assertions.append(
                {
                    "stepId": "S6",
                    "stepTitle": "分佣断言",
                    "name": "分成金额 sum_money（旧跑次摘要）",
                    "expected": str(m.get("expectedCommission", "—")),
                    "actual": str(m.get("sumMoney", "—")),
                    "passed": str(run.get("status")) == "passed",
                }
            )

    pipe = get_pipeline(str(run.get("pipelineId") or PIPELINE_ID))
    step_defs = {str(s.get("id")): s for s in (pipe.get("steps") or [])}
    steps_out: list[dict] = []
    all_apis: list[dict] = []
    for s in run.get("steps") or []:
        sid = str(s.get("id") or "")
        apis = _merge_exchanges(run_id, step_apis(s))
        all_apis.extend(apis)
        defn = step_defs.get(sid) or {}
        st = str(s.get("status") or "unknown")
        eng = str(s.get("engine") or defn.get("engine") or "")
        wir = str(s.get("wiring") or defn.get("wiring") or "")
        step_shots = []
        for sh in s.get("screenshots") or []:
            if not isinstance(sh, dict):
                continue
            url = str(sh.get("url") or "")
            if not url and sh.get("file"):
                url = f"/api/auto-control/runs/{run_id}/shots/{sh.get('file')}"
            step_shots.append({"name": str(sh.get("name") or ""), "url": url})
        steps_out.append(
            {
                "id": sid,
                "title": str(s.get("title") or defn.get("title") or ""),
                "status": st,
                "status_zh": _zh_status(st),
                "detail": str(s.get("detail") or ""),
                "error": str(s.get("error") or ""),
                "engine": eng,
                "engine_zh": _zh_engine(eng),
                "wiring": wir,
                "wiring_zh": _zh_wiring(wir),
                "apis": apis,
                "screenshots": step_shots,
            }
        )

    assert_pass = sum(1 for a in assertions if a.get("passed"))
    assert_fail = len(assertions) - assert_pass
    assert_total = len(assertions)
    pass_rate = int(round(100 * assert_pass / assert_total)) if assert_total else (
        100 if str(run.get("status")) == "passed" else 0
    )
    status = str(run.get("status") or "unknown")
    donut_color = "#16a34a" if status == "passed" else ("#dc2626" if status == "failed" else "#0f766e")

    tpl_dir = Path(__file__).resolve().parent / "templates"
    env = Environment(
        loader=FileSystemLoader(str(tpl_dir)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    env.filters["pretty_json"] = pretty_json_text
    display_vars = build_run_display_vars(run)
    html = env.get_template("auto_control_report.html").render(
        title=f"测试报告 {run_id}",
        run_id=run_id,
        pipeline_name=str(run.get("pipelineName") or pipe.get("name") or "玩家充值 → 会长提现"),
        pipeline_id=str(run.get("pipelineId") or PIPELINE_ID),
        status=status,
        status_zh=_zh_status(status),
        profile=str(run.get("profile") or ""),
        target=str(run.get("target") or ""),
        target_zh=_zh_target(str(run.get("target") or "")),
        source=str(run.get("source") or ""),
        source_zh=_zh_source(str(run.get("source") or "")),
        started_at=str(run.get("startedAt") or "—"),
        finished_at=str(run.get("finishedAt") or "—"),
        duration=_parse_duration(str(run.get("startedAt") or ""), str(run.get("finishedAt") or "")),
        error=str(run.get("error") or ""),
        account=str(m.get("account") or ""),
        pay_order=str(m.get("payOrder") or ""),
        expected_commission=m.get("expectedCommission"),
        sum_money=m.get("sumMoney"),
        display_vars=display_vars,
        pass_rate=pass_rate,
        donut_color=donut_color,
        assert_total=assert_total,
        assert_pass=assert_pass,
        assert_fail=assert_fail,
        step_total=len(steps_out),
        steps=steps_out,
        assertions=assertions,
        all_apis=all_apis,
        generated_at=_now(),
    )

    path = run_dir / "report.html"
    path.write_text(html, encoding="utf-8")
    rel = str(path.relative_to(ROOT)).replace("\\", "/")
    _update_run(run_id, reportPath=rel)
    _write_run_log(run_id, f"报告已生成 {rel}")
    return rel


def _stub_result(step_id: str) -> dict:
    hints = {
        "S7": (
            "未标已接线：总后台有图形验证，无头不能空登。"
            "请先 python workbench/money_settlement_pw.py --save-admin 保存登录态后再验收"
        ),
        "S8": "待接线：POST /channelsite/settlement/do_confirm.html + periodId",
        "S9": "待接线：POST /channelsite/settlement/withdrawal.html",
        "S10": "未标已接线：依赖总后台登录态（--save-admin）及实机验收",
        "S11": "未标已接线：需 enablePayout=true + 总后台登录态实机验收",

    }
    return {"ok": False, "stub": True, "missing": hints.get(step_id, "步骤未接线")}


def _step_wiring(step_id: str) -> str:
    for s in get_pipeline().get("steps") or []:
        if str(s.get("id")) == step_id:
            return str(s.get("wiring") or "stub")
    return "stub"


def _run_profile_b(run_id: str, target: str, opts: dict) -> tuple[bool, str]:
    ok, err = _run_profile_a(run_id, target, opts)
    if not ok:
        return False, err

    run = get_run(run_id) or {}
    metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
    from money_settlement_pw import default_promote, load_settlement_config

    sett = load_settlement_config(target=target)
    _def_pid, _def_acc = default_promote(target)
    pid = int(opts.get("promoteId") or metrics.get("promoteId") or _def_pid)
    promo_acc = str(opts.get("promoteAccount") or metrics.get("promoteAccount") or _def_acc)
    guild_pwd = str(opts.get("guildLoginPassword") or sett.get("guildLoginPassword") or "")
    settlement_row_id = metrics.get("settlementRowId") or ""
    enable_payout = bool(opts.get("enablePayout"))
    shot_root = RUNS_DIR / run_id / "shots"

    def s7() -> dict:
        from money_settlement_pw import s7_generate_settlement

        if not settlement_row_id:
            return {"ok": False, "error": "S6 未产出 settlementRowId，无法结算"}
        out = s7_generate_settlement(
            settlement_row_id=settlement_row_id,
            promote_id=pid,
            cfg=sett,
            source_db=target,
            shot_dir=shot_root / "S7",
            trace_path=RUNS_DIR / run_id / "trace" / "S7.zip",
        )
        if out.get("ok") and out.get("metrics"):
            _update_run(run_id, metrics={**metrics, **(out.get("metrics") or {})})
        return out

    def s8() -> dict:
        from money_settlement_pw import s8_confirm_period

        cur = get_run(run_id) or {}
        m = cur.get("metrics") if isinstance(cur.get("metrics"), dict) else {}
        out = s8_confirm_period(
            promote_id=pid,
            period_id=m.get("periodId") or opts.get("periodId"),
            guild_account=promo_acc,
            guild_password=guild_pwd or None,
            cfg=sett,
            source_db=target,
        )
        if out.get("ok") and out.get("metrics"):
            _update_run(run_id, metrics={**m, **(out.get("metrics") or {})})
        return out

    def s9() -> dict:
        from money_settlement_pw import s9_guild_withdraw

        cur = get_run(run_id) or {}
        m = cur.get("metrics") if isinstance(cur.get("metrics"), dict) else {}
        tamper = opts.get("tamperWithdrawSumMoney")
        if tamper in (None, ""):
            tamper = opts.get("tamper_sum_money")
        out = s9_guild_withdraw(
            promote_id=pid,
            guild_account=promo_acc,
            guild_login_password=guild_pwd or None,
            amount=opts.get("withdrawAmount"),
            cfg=sett,
            source_db=target,
            tamper_sum_money=tamper,
        )
        if out.get("ok") and out.get("metrics"):
            _update_run(run_id, metrics={**m, **(out.get("metrics") or {})})
        if tamper not in (None, False, "", 0, "0"):
            tampered = (out.get("metrics") or {}).get("withdrawAmountTampered")
            err = (out.get("metrics") or {}).get("withdrawTamperError")
            if tampered is not None:
                _write_run_log(run_id, f"S9 执行后已立刻改库 sum_money → {tampered}")
            elif err:
                _write_run_log(run_id, f"S9 执行后改库失败: {err}")
        return out

    def s10() -> dict:
        from money_settlement_pw import s10_approve_withdraw

        cur = get_run(run_id) or {}
        m = cur.get("metrics") if isinstance(cur.get("metrics"), dict) else {}
        wid = m.get("withdrawId") or opts.get("withdrawId")
        return s10_approve_withdraw(
            withdraw_id=wid,
            cfg=sett,
            shot_dir=shot_root / "S10",
            trace_path=RUNS_DIR / run_id / "trace" / "S10.zip",
        )

    def s11() -> dict:
        from money_settlement_pw import s11_paid_withdraw

        cur = get_run(run_id) or {}
        m = cur.get("metrics") if isinstance(cur.get("metrics"), dict) else {}
        wid = m.get("withdrawId") or opts.get("withdrawId")
        return s11_paid_withdraw(
            withdraw_id=wid,
            promote_id=pid,
            cfg=sett,
            source_db=target,
            shot_dir=shot_root / "S11",
            trace_path=RUNS_DIR / run_id / "trace" / "S11.zip",
        )

    handlers = {"S7": s7, "S8": s8, "S9": s9, "S10": s10, "S11": s11}

    for step_id in ("S7", "S8", "S9", "S10", "S11"):
        if step_id == "S11" and not enable_payout:
            # 未开启打款：跳过即可，不要把整次跑失败
            cur = get_run(run_id) or {}
            step = next(
                (s for s in (cur.get("steps") or []) if str(s.get("id")) == "S11"),
                None,
            )
            if step is not None and str(step.get("status") or "") != "skipped":
                _set_step(
                    run_id,
                    "S11",
                    status="skipped",
                    finishedAt=_now(),
                    detail="未开启打款（enablePayout=false），跳过",
                    error="",
                )
                _write_run_log(run_id, "→ S11 跳过（未开启打款）")
            continue

        wiring = _step_wiring(step_id)
        if wiring != "wired":
            # 未验收步骤：仍可试跑真实代码，失败则带 stub 说明（便于看到环境阻断原因）
            def _try_or_stub(sid=step_id):
                try:
                    real = handlers[sid]()
                except Exception as exc:  # noqa: BLE001
                    real = {"ok": False, "error": str(exc)}
                if real.get("ok"):
                    return real
                stub = _stub_result(sid)
                detail = real.get("error") or stub.get("missing")
                return {
                    "ok": False,
                    "stub": True,
                    "missing": f"{stub.get('missing')}；实机试跑：{detail}",
                    "assertions": real.get("assertions") or [],
                }

            ok, err = _run_step(run_id, step_id, _try_or_stub)
        else:
            ok, err = _run_step(run_id, step_id, handlers[step_id])
        if not ok:
            return False, err
    return True, ""


def log_tail(run_id: str, lines: int = 200) -> dict:
    path = RUNS_DIR / run_id / "run.log"
    if not path.is_file():
        return {"ok": True, "lines": [], "path": ""}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return {"ok": False, "error": str(exc)}
    parts = text.splitlines()
    return {
        "ok": True,
        "lines": parts[-max(1, min(lines, 500)) :],
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
    }


def _apifox_token_paths() -> list[Path]:
    return [
        Path(__file__).resolve().parent / ".apifox_token",
        DATA_DIR / "apifox_token.txt",
    ]


def resolve_apifox_token() -> str:
    """优先环境变量，其次本机私密文件（勿提交仓库）。"""
    token = (os.environ.get("APIFOX_TOKEN") or os.environ.get("APIFOX_ACCESS_TOKEN") or "").strip()
    if token:
        return token
    for path in _apifox_token_paths():
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if not text:
            continue
        first = text.splitlines()[0].strip()
        if first.startswith("afxp_") or (" " not in first and len(first) > 8):
            return first
        for part in text.replace("=", " ").split():
            if part.startswith("afxp_"):
                return part.strip()
    return ""


def mask_apifox_token(token: str) -> str:
    t = (token or "").strip()
    if not t:
        return ""
    if len(t) <= 10:
        return t[:2] + "***"
    return t[:6] + "…" + t[-4:]


def get_settings() -> dict:
    env_set = bool(
        (os.environ.get("APIFOX_TOKEN") or os.environ.get("APIFOX_ACCESS_TOKEN") or "").strip()
    )
    token = resolve_apifox_token()
    panel = _load_panel_settings()
    webhook = str(panel.get("webhookUrl") or "").strip()
    secret = str(panel.get("webhookSecret") or "").strip()
    return {
        "ok": True,
        "apifoxTokenConfigured": bool(token),
        "apifoxTokenMasked": mask_apifox_token(token),
        "apifoxTokenFromEnv": env_set,
        "apifoxTokenFile": str(_apifox_token_paths()[0].relative_to(ROOT)).replace("\\", "/"),
        "note": "访问令牌仅用于 Apifox CLI 一键（玩家侧）。主链不依赖它；结算～打款已走 Playwright。",
        "webhookConfigured": bool(webhook),
        "webhookUrlMasked": (webhook[:28] + "…") if len(webhook) > 32 else webhook,
        "webhookSecretConfigured": bool(secret),
        "webhookSecretMasked": ("SEC***" + secret[-4:]) if len(secret) > 8 else ("***" if secret else ""),
        "webhookIsDingTalk": _is_dingtalk_webhook(webhook),
        "webhookKeyword": str(panel.get("webhookKeyword") or ""),
        "webhookNotifyFailed": bool(panel.get("notifyFailed", True)),
        "webhookNotifyStub": bool(panel.get("notifyStub", True)),
        "webhookNotifyPassed": bool(panel.get("notifyPassed", False)),
        "webhookDedupeMinutes": int(panel.get("dedupeMinutes") or 15),
        "oaUseChildSession": bool(panel.get("oaUseChildSession", True)),
        "childSession": get_child_session_info(),
        "evidenceLayout": EVIDENCE_LAYOUT,
        "apifoxBridgePath": str(APIFOX_BRIDGE_FILE.relative_to(ROOT)).replace(chr(92), "/"),
        "autoRetryMax": AUTO_RETRY_MAX,
    }


def save_apifox_token(token: str) -> dict:
    """写入 workbench/.apifox_token；空字符串表示清除文件（环境变量不受影响）。"""
    path = _apifox_token_paths()[0]
    text = (token or "").strip()
    if not text:
        try:
            if path.is_file():
                path.unlink()
        except OSError as exc:
            return {"ok": False, "error": f"清除失败: {exc}"}
        return {**get_settings(), "ok": True, "cleared": True}
    # 只取第一行，去掉常见粘贴前缀
    first = text.splitlines()[0].strip()
    for prefix in ("APIFOX_TOKEN=", "token=", "Bearer "):
        if first.lower().startswith(prefix.lower()):
            first = first[len(prefix) :].strip()
    if len(first) < 8:
        return {"ok": False, "error": "Token 太短，请粘贴完整 Access Token"}
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(first + "\n", encoding="utf-8")
    except OSError as exc:
        return {"ok": False, "error": f"写入失败: {exc}"}
    return {**get_settings(), "ok": True, "saved": True}


def _blank_schedule() -> dict:
    return {
        "enabled": False,
        "time": "09:00",
        "profile": "B",
        "target": "lx",
        "enablePayout": True,
        "lastFiredOn": "",
        "lastError": "",
    }


def _normalize_schedule_item(raw: dict | None) -> dict:
    base = _blank_schedule()
    raw = raw if isinstance(raw, dict) else {}
    base.update({k: raw.get(k, base[k]) for k in base})
    base["enabled"] = bool(base.get("enabled"))
    base["enablePayout"] = bool(base.get("enablePayout"))
    base["time"] = _normalize_hhmm(str(base.get("time") or "09:00")) or "09:00"
    if str(base.get("profile") or "").upper() not in {"A", "B"}:
        base["profile"] = "B"
    else:
        base["profile"] = str(base["profile"]).upper()
    if str(base.get("target") or "") not in {"lx", "yq", "hw"}:
        base["target"] = "lx"
    base["lastFiredOn"] = str(base.get("lastFiredOn") or "")
    base["lastError"] = str(base.get("lastError") or "")
    return base


def _read_schedule_map() -> dict:
    if not SCHEDULE_FILE.is_file():
        return {}
    try:
        raw = json.loads(SCHEDULE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    by = raw.get("byPipeline")
    if isinstance(by, dict):
        return {str(k): v for k, v in by.items() if isinstance(v, dict)}
    if "time" in raw or "enabled" in raw:
        return {PIPELINE_ID: raw}
    return {}


def _write_schedule_map(store: dict) -> None:
    SCHEDULE_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCHEDULE_FILE.write_text(
        json.dumps({"byPipeline": store}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_schedule(pipeline_id: str | None = None) -> dict:
    pid = str(pipeline_id or PIPELINE_ID).strip() or PIPELINE_ID
    item = _normalize_schedule_item(_read_schedule_map().get(pid))
    return {"ok": True, "pipelineId": pid, **item}


def schedule_payload() -> dict:
    main = get_schedule(PIPELINE_ID)
    stored = _read_schedule_map()
    items = []
    for raw in _load_pipeline_defs():
        pid = str(raw.get("id") or "")
        if not pid:
            continue
        sch = get_schedule(pid)
        items.append(
            {
                **sch,
                "configured": pid in stored,
                "name": str(raw.get("name") or pid),
                "placeholder": bool(raw.get("placeholder")),
                "note": str(raw.get("note") or ""),
                "createdAt": str(raw.get("createdAt") or ""),
                "group": str(raw.get("group") or ""),
            }
        )
    return {**main, "items": items}


def _normalize_hhmm(text: str) -> str:
    parts = str(text or "").strip().split(":")
    if len(parts) < 2:
        return ""
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        return ""
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return ""
    return f"{hour:02d}:{minute:02d}"


def save_schedule(body: dict) -> dict:
    body = body if isinstance(body, dict) else {}
    pid = str(body.get("pipelineId") or PIPELINE_ID).strip() or PIPELINE_ID
    known = {str(p.get("id")) for p in _load_pipeline_defs()}
    if pid not in known:
        return {"ok": False, "error": f"未知流水线: {pid}"}
    hhmm = _normalize_hhmm(str(body.get("time") or ""))
    if not hhmm:
        return {"ok": False, "error": "时间格式应为 HH:MM，例如 09:00"}
    profile = str(body.get("profile") or "B").upper()
    if profile not in {"A", "B"}:
        return {"ok": False, "error": "范围只支持整条主链、仅充值或结算"}
    target = str(body.get("target") or "lx").strip() or "lx"
    if target not in {"lx", "yq", "hw"}:
        return {"ok": False, "error": "平台只支持龙翔 / 游趣 / 汇玩"}
    pipe = get_pipeline(pid)
    if pipe.get("placeholder"):
        profile = "A"
        enable_payout = False
    else:
        enable_payout = bool(body.get("enablePayout")) if profile == "B" else False
    prev = get_schedule(pid)
    store = _read_schedule_map()
    store[pid] = {
        "enabled": bool(body.get("enabled")),
        "time": hhmm,
        "profile": profile,
        "target": target,
        "enablePayout": enable_payout,
        "lastFiredOn": str(prev.get("lastFiredOn") or ""),
        "lastError": str(prev.get("lastError") or ""),
    }
    try:
        _write_schedule_map(store)
    except OSError as exc:
        return {"ok": False, "error": f"写入失败: {exc}"}
    return schedule_payload()


def tick_schedule() -> dict:
    """每条已启用、且不是占位的流水线，到点后入队一次。占位只出现在时间线上。"""
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    store = _read_schedule_map()
    fired_id = ""
    for pid, raw in sorted(store.items(), key=lambda kv: _normalize_hhmm(str((kv[1] or {}).get("time") or "")) or "99:99"):
        sch = _normalize_schedule_item(raw if isinstance(raw, dict) else {})
        if not sch.get("enabled"):
            continue
        pipe = get_pipeline(pid)
        if str(pipe.get("id")) != pid or pipe.get("placeholder"):
            continue
        if str(sch.get("lastFiredOn") or "") == today:
            continue
        hour, minute = (int(x) for x in str(sch.get("time") or "09:00").split(":"))
        due = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if now < due:
            continue
        if (now - due).total_seconds() > 6 * 3600:
            continue
        out = enqueue_run(
            profile=str(sch.get("profile") or "B"),
            target=str(sch.get("target") or "lx"),
            pipeline_id=pid,
            options={"enablePayout": bool(sch.get("enablePayout"))},
            source="schedule",
        )
        err = str(out.get("error") or "")
        if not out.get("ok") and "单槽" in err:
            return {"ok": True, "fired": False, "busy": True}
        data = {k: sch[k] for k in ("enabled", "time", "profile", "target", "enablePayout", "lastFiredOn", "lastError")}
        if out.get("ok"):
            data["lastFiredOn"] = today
            data["lastError"] = ""
            fired_id = pid
        else:
            data["lastError"] = err or "入队失败"
        store[pid] = data
        try:
            _write_schedule_map(store)
        except OSError:
            pass
        if out.get("ok"):
            return {**out, "fired": True, "pipelineId": fired_id}
    return {"ok": True, "fired": False}


def health() -> dict:
    alerts: list[str] = []
    cb_ok = False
    cb_msg = ""
    try:
        from money_flow import ensure_recharge_callback

        cb_ok, cb_msg = ensure_recharge_callback()
        if not cb_ok:
            alerts.append(f"3780 回调未就绪: {cb_msg}")
    except Exception as exc:  # noqa: BLE001
        alerts.append(f"回调检查异常: {exc}")

    token = resolve_apifox_token()
    if not token:
        alerts.append(
            "Apifox 访问令牌未配置（可选：仅 Apifox CLI 一键需要；可在面板「设置」里填写，环境变量名 APIFOX_TOKEN）"
        )

    v1reg_info: dict[str, Any] = {"writeEnabled": False, "alerts": []}
    try:
        from v1_regression_biz import preflight as _v1_preflight

        v1reg_info = _v1_preflight()
        for a in v1reg_info.get("alerts") or []:
            alerts.append(f"新商务：{a}")
    except Exception as exc:  # noqa: BLE001
        alerts.append(f"新商务预检异常: {exc}")

    pipe = get_pipeline()
    with _lock:
        runs = _load_runs()
        current = next((r for r in runs if r.get("status") == "running"), None)
        queued = [r for r in runs if r.get("status") == "queued"]

    return {
        "ok": True,
        "service": "ok",
        "time": _now(),
        "callback": {"ok": cb_ok, "detail": cb_msg},
        "apifoxTokenConfigured": bool(token),
        "stubCount": pipe.get("stubCount"),
        "currentRunId": (current or {}).get("id") or "",
        "queueLength": len(queued),
        "alerts": alerts,
        "v1reg": v1reg_info,
    }


def _day_bounds() -> tuple[datetime, datetime, datetime]:
    now = datetime.now()
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week0 = today0 - timedelta(days=today0.weekday())
    month0 = today0.replace(day=1)
    return today0, week0, month0


def _parse_ts(s: str) -> datetime | None:
    s = str(s or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", ""))
    except ValueError:
        return None


def _count_stats(runs: list[dict]) -> dict:
    today0, week0, month0 = _day_bounds()

    def bucket(since: datetime) -> dict:
        success = failed = active = queued = 0
        for r in runs:
            st = str(r.get("status") or "")
            ts = _parse_ts(str(r.get("finishedAt") or r.get("startedAt") or r.get("queuedAt") or ""))
            if ts is None or ts < since:
                continue
            if st == "passed":
                success += 1
            elif st == "failed":
                failed += 1
            elif st == "running":
                active += 1
            elif st == "queued":
                queued += 1
        total = success + failed
        rate = round(100.0 * success / total, 1) if total else 0.0
        return {
            "success": success,
            "failed": failed,
            "active": active,
            "queued": queued,
            "successRate": rate,
        }

    return {
        "today": bucket(today0),
        "week": bucket(week0),
        "month": bucket(month0),
    }


def _throughput_24h(runs: list[dict]) -> list[dict]:
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    hours = []
    for i in range(23, -1, -1):
        h = now - timedelta(hours=i)
        label = h.strftime("%H:00")
        success = failed = 0
        for r in runs:
            ts = _parse_ts(str(r.get("finishedAt") or ""))
            if ts is None:
                continue
            if ts.year == h.year and ts.month == h.month and ts.day == h.day and ts.hour == h.hour:
                if r.get("status") == "passed":
                    success += 1
                elif r.get("status") == "failed":
                    failed += 1
        hours.append({"hour": label, "success": success, "failed": failed})
    return hours


def _risk_7d(runs: list[dict]) -> list[dict]:
    today0 = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    out = []
    for i in range(6, -1, -1):
        d = today0 - timedelta(days=i)
        key = d.strftime("%Y-%m-%d")
        failed = 0
        for r in runs:
            if r.get("status") != "failed":
                continue
            ts = _parse_ts(str(r.get("finishedAt") or r.get("startedAt") or ""))
            if ts and ts.strftime("%Y-%m-%d") == key:
                failed += 1
        out.append({"day": key, "failed": failed})
    return out


def overview() -> dict:
    with _lock:
        runs = _load_runs()
        current = next((r for r in runs if r.get("status") == "running"), None)
        queued = [r for r in runs if r.get("status") == "queued"]

    h = health()
    pipe = get_pipeline()
    stats = _count_stats(runs)
    hot = compute_hotspots(days=7, limit=8)
    panel = _load_panel_settings()
    if not str(panel.get("webhookUrl") or "").strip():
        alerts = list(h.get("alerts") or [])
        if "Webhook 未配置（失败不会推钉钉）" not in alerts:
            alerts.append("Webhook 未配置（失败不会推钉钉）")
        h = {**h, "alerts": alerts}
    latest = next((r for r in runs if str(r.get("status") or "") not in {"queued"}), None)
    latest_by = {}
    for r in runs:
        pid = str(r.get("pipelineId") or "")
        if not pid or pid in latest_by:
            continue
        if str(r.get("status") or "") == "queued":
            continue
        latest_by[pid] = {
            "id": r.get("id"),
            "status": r.get("status"),
            "pipelineId": pid,
            "displayVars": build_run_display_vars(r),
        }
    catalog = []
    day_plan = []
    for raw in _load_pipeline_defs():
        pipe = get_pipeline(str(raw.get("id") or ""))
        catalog.append(
            {
                "id": pipe["id"],
                "name": pipe["name"],
                "placeholder": pipe.get("placeholder"),
                "note": pipe.get("note") or "",
                "group": pipe.get("group") or "",
                "createdAt": pipe.get("createdAt") or "",
                "stubCount": pipe.get("stubCount") or 0,
                "steps": [
                    {
                        "id": s.get("id"),
                        "title": s.get("title"),
                        "engine": s.get("engine"),
                        "wiring": s.get("wiring"),
                        "status": "stub" if s.get("wiring") == "stub" else "pending",
                    }
                    for s in (pipe.get("steps") or [])
                ],
            }
        )
        sch = get_schedule(pipe["id"])
        if sch.get("enabled"):
            day_plan.append(
                {
                    "id": pipe["id"],
                    "name": pipe["name"],
                    "time": sch.get("time") or "",
                    "placeholder": bool(pipe.get("placeholder")),
                    "note": pipe.get("note") or "",
                    "target": sch.get("target") or "lx",
                }
            )
    day_plan.sort(key=lambda item: item.get("time") or "99:99")
    return {
        "ok": True,
        "time": _now(),
        "health": h,
        "hotspots": hot.get("items") if isinstance(hot, dict) else [],
        "latestRun": attach_display_vars(dict(latest)) if latest else None,
        "pipeline": {
            "id": pipe["id"],
            "name": pipe["name"],
            "stubCount": pipe["stubCount"],
            "steps": [{**s, "apis": step_apis(s)} for s in pipe["steps"]],
            "profiles": pipe["profiles"],
        },
        "queue": [
            {
                "id": r.get("id"),
                "profile": r.get("profile"),
                "target": r.get("target"),
                "queuedAt": r.get("queuedAt"),
                "displayVars": build_run_display_vars(r),
            }
            for r in queued
        ],
        "current": attach_display_vars(dict(current)) if current else None,
        "stats": stats,
        "throughput": _throughput_24h(runs),
        "risk7d": _risk_7d(runs),
        "latestRun": attach_display_vars(dict(runs[0])) if runs else None,
        "catalog": catalog,
        "dayPlan": day_plan,
        "latestByPipeline": latest_by,
    }

# ===== restored addon: panel settings / webhook / ticket / retry / bridge =====

def _load_panel_settings() -> dict:
    base = {
        "webhookUrl": "",
        "webhookSecret": "",
        "webhookKeyword": "",
        "notifyFailed": True,
        "notifyStub": True,
        "notifyPassed": False,
        "dedupeMinutes": 15,
        "oaUseChildSession": True,
    }
    if not SETTINGS_FILE.is_file():
        return base
    try:
        raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return base
    if not isinstance(raw, dict):
        return base
    out = dict(base)
    for k in base:
        if k in raw:
            out[k] = raw[k]
    out["notifyFailed"] = bool(out.get("notifyFailed", True))
    out["notifyStub"] = bool(out.get("notifyStub", True))
    out["notifyPassed"] = bool(out.get("notifyPassed", False))
    out["oaUseChildSession"] = bool(out.get("oaUseChildSession", True))
    try:
        out["dedupeMinutes"] = max(0, int(out.get("dedupeMinutes") or 15))
    except (TypeError, ValueError):
        out["dedupeMinutes"] = 15
    return out


def save_panel_settings(body: dict) -> dict:
    body = body if isinstance(body, dict) else {}
    cur = _load_panel_settings()
    if "webhookUrl" in body:
        cur["webhookUrl"] = str(body.get("webhookUrl") or "").strip()
    if "webhookSecret" in body:
        sec = str(body.get("webhookSecret") or "").strip()
        if sec:
            cur["webhookSecret"] = sec
        elif body.get("webhookUrl") == "":
            cur["webhookSecret"] = ""
    if "webhookKeyword" in body:
        cur["webhookKeyword"] = str(body.get("webhookKeyword") or "").strip()
    if "notifyFailed" in body:
        cur["notifyFailed"] = bool(body.get("notifyFailed"))
    if "notifyStub" in body:
        cur["notifyStub"] = bool(body.get("notifyStub"))
    if "notifyPassed" in body:
        cur["notifyPassed"] = bool(body.get("notifyPassed"))
    if "oaUseChildSession" in body:
        cur["oaUseChildSession"] = bool(body.get("oaUseChildSession"))
    if "dedupeMinutes" in body:
        try:
            cur["dedupeMinutes"] = max(0, int(body.get("dedupeMinutes") or 15))
        except (TypeError, ValueError):
            pass
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(cur, ensure_ascii=False, indent=2), encoding="utf-8")
    return get_settings()


def get_child_session_info() -> dict:
    """面板用：桌面分身是否已连接、工作台窗口是否在跑。"""
    try:
        from child_session import host_status

        st = host_status()
        return {
            "ok": True,
            "enabled": bool(st.get("enabled")),
            "sessionId": st.get("sessionId"),
            "ready": bool(st.get("ready")),
            "oaUseChildSession": _oa_use_child_session(),
            "hostRunning": bool(st.get("hostRunning")),
            "hostState": st.get("hostState"),
            "hostDetail": st.get("hostDetail") or "",
            "ownedByWorkbench": bool(st.get("ownedByWorkbench")),
            "doorOpen": bool(st.get("doorOpen")),
            "hostExeExists": bool(st.get("hostExeExists")),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": str(exc),
            "enabled": False,
            "sessionId": None,
            "ready": False,
            "oaUseChildSession": _oa_use_child_session(),
            "hostRunning": False,
            "doorOpen": False,
            "hostExeExists": False,
        }


def start_child_session_host() -> dict:
    try:
        from child_session import start_host

        out = start_host()
        info = get_child_session_info()
        merged = {**info, **out, "ok": bool(out.get("ok"))}
        return merged
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), **get_child_session_info()}


def stop_child_session_host() -> dict:
    try:
        from child_session import stop_host

        out = stop_host()
        info = get_child_session_info()
        return {**info, **out, "ok": bool(out.get("ok", True))}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), **get_child_session_info()}


def _is_dingtalk_webhook(url: str) -> bool:
    u = str(url or "").lower()
    return "oapi.dingtalk.com" in u or "dingtalk.com/robot" in u


def sign_dingtalk_webhook_url(webhook: str, secret: str | None) -> str:
    url = str(webhook or "").strip()
    sec = str(secret or "").strip()
    if not url or not sec or not _is_dingtalk_webhook(url):
        return url
    ts = str(round(time.time() * 1000))
    string_to_sign = f"{ts}\n{sec}"
    dig = hmac.new(sec.encode("utf-8"), string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
    sign = urllib.parse.quote_plus(base64.b64encode(dig))
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}timestamp={ts}&sign={sign}"


def _parse_robot_body(body: str) -> dict:
    try:
        raw = json.loads(body or "{}")
        return raw if isinstance(raw, dict) else {"raw": body}
    except json.JSONDecodeError:
        return {"raw": body}


def _webhook_dedupe_load() -> dict:
    if not WEBHOOK_DEDUPE_FILE.is_file():
        return {}
    try:
        raw = json.loads(WEBHOOK_DEDUPE_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _webhook_dedupe_should_skip(key: str, minutes: int) -> bool:
    if minutes <= 0:
        return False
    data = _webhook_dedupe_load()
    ts = _parse_ts(str(data.get(key) or ""))
    if not ts:
        return False
    return (datetime.now() - ts).total_seconds() < minutes * 60


def _webhook_dedupe_mark(key: str, minutes: int) -> None:
    if minutes <= 0:
        return
    data = _webhook_dedupe_load()
    data[key] = _now()
    # prune
    keep = {}
    cutoff = datetime.now() - timedelta(days=2)
    for k, v in data.items():
        ts = _parse_ts(str(v))
        if ts and ts >= cutoff:
            keep[k] = v
    WEBHOOK_DEDUPE_FILE.parent.mkdir(parents=True, exist_ok=True)
    WEBHOOK_DEDUPE_FILE.write_text(json.dumps(keep, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_error_text(err: str) -> str:
    s = str(err or "").strip()
    if not s:
        return ""
    s = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "<UUID>",
        s,
        flags=re.I,
    )
    s = re.sub(r"\b\d{6,}\b", "<ID>", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:240]


def error_fingerprint(step_id: str, err: str) -> str:
    skeleton = normalize_error_text(err)
    raw = f"{step_id}|{skeleton}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:12]


def brief_error_for_notify(err: str) -> str:
    s = str(err or "").strip()
    if not s:
        return ""
    m = re.search(r"['\"]msg['\"]\s*:\s*['\"]([^'\"]+)['\"]", s)
    if m:
        return m.group(1).strip()[:100]
    if "{" in s and ":" in s:
        head = s.split(":", 1)[0].strip()
        if head and len(head) <= 40:
            return head[:100]
    return re.sub(r"\s+", " ", s).strip()[:100]


def _biz_bits_brief(run: dict) -> list[str]:
    bits: list[str] = []
    dv = build_run_display_vars(run)
    for row in dv or []:
        if not isinstance(row, dict):
            continue
        key = row.get("key")
        if key not in {"game", "promote", "withdrawId", "account"}:
            continue
        val = str(row.get("value") or "").strip()
        if not val or val == "—" or "回填" in val:
            continue
        if key == "withdrawId":
            bits.append(f"提现{val}")
        elif key == "account":
            bits.append(f"玩家{val}")
        else:
            bits.append(val.split("(")[0].strip() or val)
        if len(bits) >= 3:
            break
    if bits:
        return bits
    m = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
    if m.get("gameName"):
        bits.append(str(m.get("gameName")))
    if m.get("promoteAccount"):
        bits.append(str(m.get("promoteAccount")))
    if m.get("withdrawId"):
        bits.append(f"提现{m.get('withdrawId')}")
    return bits[:3]


def build_webhook_brief(run: dict, event: str, *, keyword: str = "") -> str:
    """钉钉简报：全中文短行，去掉 FAILED/B/lx/runId/报告路径。"""
    event_zh = _EVENT_ZH.get(event, event)
    target = _zh_target(str(run.get("target") or ""))
    pipe = str(run.get("pipelineName") or run.get("pipelineId") or "自动化").strip()
    fail_step = next(
        (s for s in (run.get("steps") or []) if str(s.get("status") or "") in {"failed", "stub"}),
        None,
    )
    step_bit = ""
    if fail_step:
        sid = str(fail_step.get("id") or "")
        title = str(fail_step.get("title") or "").strip()
        step_bit = f" · {sid} {title}".rstrip() if sid else ""
    head = f"【自动化】{event_zh} · {target}"
    kw = str(keyword or "").strip()
    if kw and kw not in head:
        head = f"{kw} {head}"
    lines = [head, f"{pipe}{step_bit}"]
    if event != "passed":
        err = brief_error_for_notify(str((fail_step or {}).get("error") or run.get("error") or ""))
        if err:
            lines.append(err)
    biz = _biz_bits_brief(run)
    if biz:
        lines.append(" · ".join(biz))
    retry_n = int(run.get("autoRetryCount") or 0)
    if retry_n:
        lines.append(f"自动重试 {retry_n}/{int(run.get('retryMax') or AUTO_RETRY_MAX)}")
    return "\n".join(lines)


def _find_fail_screenshot(run_id: str, run: dict) -> Path | None:
    rid = str(run_id or "").strip()
    shots_root = RUNS_DIR / rid / "shots"
    if not shots_root.is_dir():
        return None
    prefer: list[str] = []
    for s in run.get("steps") or []:
        if str(s.get("status") or "") not in {"failed", "stub"}:
            continue
        for sh in s.get("screenshots") or []:
            if isinstance(sh, dict) and sh.get("file"):
                prefer.append(str(sh["file"]).replace("\\", "/"))
        prefer.append(str(s.get("id") or ""))
    for rel in prefer:
        if not rel:
            continue
        cand = shots_root / rel
        if cand.is_file():
            return cand
        if cand.is_dir():
            pngs = sorted(cand.glob("*.png"))
            if pngs:
                return pngs[0]
    for p in sorted(shots_root.rglob("*.png")):
        if p.is_file():
            return p
    return None


def _fit_dingtalk_image_bytes(data: bytes) -> bytes:
    b64 = base64.b64encode(data).decode("ascii")
    md5_hex = hashlib.md5(data).hexdigest()
    plen = len(
        json.dumps(
            {"msgtype": "image", "image": {"base64": b64, "md5": md5_hex}},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    if plen <= DINGTALK_IMAGE_JSON_MAX:
        return data
    try:
        from io import BytesIO
        from PIL import Image
    except ImportError:
        return b""
    im = Image.open(BytesIO(data)).convert("RGB")
    quality, max_side = 72, 720
    last = data
    for _ in range(40):
        w, h = im.size
        if max(w, h) > max_side:
            r = max_side / max(w, h)
            im = im.resize((max(1, int(w * r)), max(1, int(h * r))), Image.Resampling.LANCZOS)
        buf = BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        last = buf.getvalue()
        b64 = base64.b64encode(last).decode("ascii")
        md5_hex = hashlib.md5(last).hexdigest()
        plen = len(
            json.dumps(
                {"msgtype": "image", "image": {"base64": b64, "md5": md5_hex}},
                separators=(",", ":"),
            ).encode("utf-8")
        )
        if plen <= DINGTALK_IMAGE_JSON_MAX:
            return last
        quality -= 4
        if quality < 24:
            quality = 60
            max_side = max(180, max_side - 80)
    return last


def _post_dingtalk_image(url: str, image_path: Path, *, secret: str = "") -> dict:
    if not _is_dingtalk_webhook(url):
        return {"ok": True, "skipped": True, "reason": "非钉钉"}
    try:
        raw = image_path.read_bytes()
    except OSError as exc:
        return {"ok": False, "error": str(exc)}
    fitted = _fit_dingtalk_image_bytes(raw)
    if not fitted:
        return {"ok": False, "error": "截图过大且无法压缩（需 Pillow）"}
    b64 = base64.b64encode(fitted).decode("ascii")
    md5_hex = hashlib.md5(fitted).hexdigest()
    post_url = sign_dingtalk_webhook_url(url, secret)
    payload = {"msgtype": "image", "image": {"base64": b64, "md5": md5_hex}}
    try:
        req = urllib.request.Request(
            post_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            parsed = _parse_robot_body(body)
            if parsed.get("errcode") not in (0, "0", None) and "errcode" in parsed:
                return {"ok": False, "error": str(parsed.get("errmsg") or parsed)[:200]}
            return {"ok": True, "status": resp.status}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}


def _post_webhook(url: str, text: str, *, secret: str = "") -> dict:
    post_url = sign_dingtalk_webhook_url(url, secret) if _is_dingtalk_webhook(url) else url
    payloads = [
        {"msgtype": "text", "text": {"content": text}},
        {"msg_type": "text", "content": {"text": text}},
    ]
    last_err = ""
    for payload in payloads:
        try:
            req = urllib.request.Request(
                post_url,
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                parsed = _parse_robot_body(body)
                if _is_dingtalk_webhook(url) or "errcode" in parsed:
                    errcode = parsed.get("errcode")
                    if errcode not in (0, "0", None) and "errcode" in parsed:
                        last_err = str(parsed.get("errmsg") or parsed)[:240]
                        continue
                if resp.status < 300:
                    return {"ok": True, "status": resp.status, "body": body[:300]}
                last_err = f"HTTP {resp.status}: {body[:200]}"
        except urllib.error.HTTPError as exc:
            try:
                err_body = exc.read().decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                err_body = ""
            parsed = _parse_robot_body(err_body)
            last_err = str(parsed.get("errmsg") or err_body or f"HTTP {exc.code}")[:240]
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
    hint = ""
    if _is_dingtalk_webhook(url) and not secret and "签名" in (last_err or ""):
        hint = "（钉钉机器人若开启「加签」，请在设置里填写 SEC 密钥）"
    return {"ok": False, "error": (last_err or "推送失败") + hint}


def maybe_notify_run(run_id: str) -> dict:
    panel = _load_panel_settings()
    url = str(panel.get("webhookUrl") or "").strip()
    if not url:
        return {"ok": True, "skipped": True, "reason": "未配置 Webhook"}
    run = get_run(run_id) or {}
    status = str(run.get("status") or "")
    stop = str(run.get("stopReason") or "")
    is_stub = stop == "stub_stop" or any(str(s.get("status")) == "stub" for s in (run.get("steps") or []))
    if status == "passed":
        if not panel.get("notifyPassed"):
            return {"ok": True, "skipped": True, "reason": "未开启成功通知"}
        event = "passed"
    elif status == "failed":
        if is_stub:
            if not panel.get("notifyStub", True):
                return {"ok": True, "skipped": True, "reason": "未开启 stub 通知"}
            event = "stub"
        else:
            if not panel.get("notifyFailed", True):
                return {"ok": True, "skipped": True, "reason": "未开启失败通知"}
            event = "failed"
    else:
        return {"ok": True, "skipped": True, "reason": f"状态 {status} 不通知"}

    fail_step = next(
        (s for s in (run.get("steps") or []) if str(s.get("status") or "") in {"failed", "stub"}),
        None,
    )
    step_id = str((fail_step or {}).get("id") or run.get("currentStepId") or "")
    err = str((fail_step or {}).get("error") or run.get("error") or "")
    fp = error_fingerprint(step_id or event, err or status)
    dedupe_key = f"{event}:{fp}"
    dedupe_min = int(panel.get("dedupeMinutes") or 15)
    if _webhook_dedupe_should_skip(dedupe_key, dedupe_min):
        _write_run_log(run_id, f"Webhook 跳过（降噪 {dedupe_min} 分钟内同指纹） fp={fp}")
        return {"ok": True, "skipped": True, "reason": "降噪窗口内已推过", "fingerprint": fp}

    keyword = str(panel.get("webhookKeyword") or "").strip()
    text = build_webhook_brief(run, event, keyword=keyword)
    secret = str(panel.get("webhookSecret") or "").strip()
    out = _post_webhook(url, text, secret=secret)
    if out.get("ok"):
        _webhook_dedupe_mark(dedupe_key, dedupe_min)
        _write_run_log(run_id, f"Webhook 已推送 event={event} fp={fp}")
        if event in {"failed", "stub"} and _is_dingtalk_webhook(url):
            shot = _find_fail_screenshot(run_id, run)
            if shot:
                img_out = _post_dingtalk_image(url, shot, secret=secret)
                if img_out.get("ok"):
                    _write_run_log(run_id, f"Webhook 已附截图 {shot.name}")
                else:
                    _write_run_log(run_id, f"Webhook 截图跳过: {img_out.get('error')}")
            else:
                _write_run_log(run_id, "Webhook 无步骤截图可附")
    else:
        _write_run_log(run_id, f"Webhook 失败: {out.get('error')}")
    return {**out, "event": event, "fingerprint": fp, "preview": text}


def preview_webhook_message(run_id: str = "") -> dict:
    panel = _load_panel_settings()
    keyword = str(panel.get("webhookKeyword") or "").strip()
    run = get_run(run_id) if run_id else None
    if not run:
        with _lock:
            runs = _load_runs()
        run = next((r for r in runs if str(r.get("status")) == "failed"), None) or (runs[0] if runs else None)
    if not run:
        sample = build_webhook_brief(
            {
                "target": "lx",
                "pipelineName": "玩家充值 → 会长提现",
                "error": "只允许下午14点-20点进行打款操作",
                "steps": [
                    {
                        "id": "S11",
                        "title": "收益提现-打款",
                        "status": "failed",
                        "error": "只允许下午14点-20点进行打款操作",
                    }
                ],
                "metrics": {"gameName": "宇宙直播", "promoteAccount": "demo", "withdrawId": "54795"},
            },
            "failed",
            keyword=keyword,
        )
        return {
            "ok": True,
            "preview": sample,
            "runId": "",
            "webhookConfigured": bool(panel.get("webhookUrl")),
            "imageNote": "失败时可附带 1 张步骤截图（仅钉钉）",
        }
    status = str(run.get("status") or "failed")
    event = "passed" if status == "passed" else ("stub" if str(run.get("stopReason")) == "stub_stop" else "failed")
    text = build_webhook_brief(run, event, keyword=keyword)
    shot = _find_fail_screenshot(str(run.get("id") or ""), run) if event in {"failed", "stub"} else None
    return {
        "ok": True,
        "preview": text,
        "runId": str(run.get("id") or ""),
        "webhookConfigured": bool(str(panel.get("webhookUrl") or "").strip()),
        "willAttachShot": bool(shot),
        "shotName": shot.name if shot else "",
        "imageNote": "失败时可附带 1 张步骤截图（仅钉钉机器人 image 消息）",
    }


def test_webhook(message: str = "") -> dict:
    panel = _load_panel_settings()
    url = str(panel.get("webhookUrl") or "").strip()
    if not url:
        return {"ok": False, "error": "未配置 Webhook URL"}
    keyword = str(panel.get("webhookKeyword") or "").strip()
    secret = str(panel.get("webhookSecret") or "").strip()
    text = (message or "").strip() or build_webhook_brief(
        {
            "target": "lx",
            "pipelineName": "测试推送",
            "metrics": {"gameName": "样例"},
        },
        "passed",
        keyword=keyword,
    )
    if keyword and keyword not in text:
        text = f"{keyword}\n{text}"
    return _post_webhook(url, text, secret=secret)


def compute_hotspots(*, days: int = 7, limit: int = 10) -> dict:
    days = max(1, min(int(days or 7), 90))
    limit = max(1, min(int(limit or 10), 50))
    cutoff = datetime.now() - timedelta(days=days)
    buckets: dict[str, dict] = {}
    with _lock:
        runs = _load_runs()
    for r in runs:
        if str(r.get("status") or "") != "failed":
            continue
        ts = _parse_ts(str(r.get("finishedAt") or r.get("startedAt") or ""))
        if ts and ts < cutoff:
            continue
        for s in r.get("steps") or []:
            if str(s.get("status") or "") not in {"failed", "stub"}:
                continue
            sid = str(s.get("id") or "")
            err = str(s.get("error") or r.get("error") or "")
            fp = error_fingerprint(sid, err)
            pid = str(r.get("pipelineId") or "")
            key = f"{pid}:{sid}:{fp}"
            item = buckets.get(key) or {
                "stepId": sid,
                "stepTitle": s.get("title") or sid,
                "pipelineId": pid,
                "pipelineName": str(r.get("pipelineName") or pid),
                "fingerprint": fp,
                "sampleError": brief_error_for_notify(err) or normalize_error_text(err),
                "count": 0,
                "lastAt": "",
            }
            item["count"] = int(item.get("count") or 0) + 1
            stamp = str(r.get("finishedAt") or r.get("startedAt") or "")
            if stamp > str(item.get("lastAt") or ""):
                item["lastAt"] = stamp
            buckets[key] = item
    items = sorted(
        buckets.values(),
        key=lambda x: (int(x.get("count") or 0), str(x.get("lastAt") or "")),
        reverse=True,
    )[:limit]
    return {"ok": True, "days": days, "items": items}


def inspect_evidence_pack(run_id: str) -> dict:
    rid = str(run_id or "").strip()
    run_dir = RUNS_DIR / rid
    present = {
        "runLog": (run_dir / "run.log").is_file(),
        "reportHtml": (run_dir / "report.html").is_file(),
        "exchanges": (run_dir / "exchanges.json").is_file(),
    }
    shots_root = run_dir / "shots"
    shot_files: list[str] = []
    if shots_root.is_dir():
        for p in shots_root.rglob("*"):
            if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                shot_files.append(str(p.relative_to(shots_root)).replace("\\", "/"))
    present["shots"] = bool(shot_files)
    trace_root = run_dir / "trace"
    trace_files: list[str] = []
    if trace_root.is_dir():
        for p in sorted(trace_root.glob("*.zip")):
            if p.is_file():
                trace_files.append(p.name)
    present["trace"] = bool(trace_files)
    missing: list[str] = []
    if not present["runLog"]:
        missing.append("run.log")
    if not present["reportHtml"]:
        missing.append("report.html")
    return {
        "ok": True,
        "runId": rid,
        "layout": EVIDENCE_LAYOUT,
        "present": present,
        "shotCount": len(shot_files),
        "shotFiles": shot_files[:40],
        "traceCount": len(trace_files),
        "traceFiles": [
            {"name": n, "file": n, "url": f"/api/auto-control/runs/{rid}/traces/{n}"} for n in trace_files
        ],
        "missing": missing,
    }


def _failed_step(run: dict) -> dict:
    for s in run.get("steps") or []:
        if str(s.get("status") or "") in {"failed", "stub"}:
            return s if isinstance(s, dict) else {}
    return {}


def build_ticket_draft(run_id: str) -> dict:
    run = get_run(run_id)
    if not run:
        return {"ok": False, "error": "运行不存在"}
    fail = _failed_step(run)
    step = str(fail.get("id") or run.get("currentStepId") or "")
    title_err = brief_error_for_notify(str(fail.get("error") or run.get("error") or "")) or "步骤失败"
    title = f"[自动化] {run.get('pipelineName') or PIPELINE_ID} {step} {title_err}"[:80]
    lines = [
        f"问题：{title_err}",
        f"预期：该步骤应通过",
        f"链路：{run.get('pipelineName')}",
        f"平台：{_zh_target(str(run.get('target') or ''))}",
        f"runId：{run_id}",
        f"步骤：{step} {fail.get('title') or ''}",
    ]
    try:
        from xmind_product_bugs import DEFAULT_ASSIGNEE_ACCOUNT, DEFAULT_ASSIGNEE_NAME, load_dev_assignee_map

        load_dev_assignee_map()
        assignee = DEFAULT_ASSIGNEE_ACCOUNT
        assignee_label = DEFAULT_ASSIGNEE_NAME
    except Exception:
        assignee, assignee_label = "", ""
    return {
        "ok": True,
        "title": title,
        "description": "\n".join(lines),
        "assignee": assignee,
        "assigneeLabel": assignee_label,
    }


def create_ticket(run_id: str, *, system: str = "product", dry_run: bool = False) -> dict:
    draft = build_ticket_draft(run_id)
    if not draft.get("ok"):
        return draft
    run = get_run(run_id) or {}
    fail_class = str(run.get("failClass") or "")
    if fail_class in {"env", "automation"} or str(run.get("stopReason") or "") == "stub_stop":
        return {
            **draft,
            "ok": False,
            "error": f"环境/自动化类失败不提缺陷（failClass={fail_class or '—'}, stopReason={run.get('stopReason') or '—'}）",
            "draft": True,
            "system": system,
        }
    if system == "zentao" or dry_run:
        return {**draft, "draft": True, "system": system}
    # product system: best-effort stub message if integration not available
    try:
        # Prefer existing product bug helper if present
        import product_system_bugs  # type: ignore

        out = product_system_bugs.create_from_auto_control(run_id, draft)
        return {**draft, **(out if isinstance(out, dict) else {"ok": True}), "system": "product"}
    except Exception as exc:  # noqa: BLE001
        return {
            **draft,
            "ok": False,
            "error": f"产品系统提单未接通: {exc}",
            "draft": True,
            "system": system,
        }


def _run_profile_seed(run_id: str, target: str, opts: dict) -> tuple[bool, str]:
    from money_flow import ensure_guild_game_ready

    def s0() -> dict:
        from money_settlement_pw import default_game_id, default_promote, load_settlement_config

        sett = load_settlement_config(target=target)
        _def_pid, _def_acc = default_promote(target)
        pid = int(opts.get("promoteId") or _def_pid)
        acc = str(opts.get("promoteAccount") or _def_acc)
        gid = int(opts.get("gameId") or default_game_id(target))
        return ensure_guild_game_ready(
            promote_id=pid,
            game_id=gid,
            guild_account=acc,
            guild_password=str(sett.get("guildLoginPassword") or "") or None,
            source_db=target,
        )

    return _run_step(run_id, "S0", s0)


def write_apifox_bridge(run_id: str | None = None) -> dict:
    run = get_run(run_id) if run_id else None
    m = (run or {}).get("metrics") if isinstance((run or {}).get("metrics"), dict) else {}
    opts = (run or {}).get("options") if isinstance((run or {}).get("options"), dict) else {}
    vars_map = {
        "runId": str((run or {}).get("id") or ""),
        "target": str((run or {}).get("target") or "lx"),
        "profile": str((run or {}).get("profile") or ""),
        "gameId": str(m.get("gameId") or opts.get("gameId") or ""),
        "gameName": str(m.get("gameName") or opts.get("gameName") or ""),
        "promoteId": str(m.get("promoteId") or opts.get("promoteId") or ""),
        "promoteAccount": str(m.get("promoteAccount") or opts.get("promoteAccount") or ""),
        "account": str(m.get("account") or ""),
        "userId": str(m.get("userId") or ""),
        "payOrder": str(m.get("payOrder") or ""),
        "periodId": str(m.get("periodId") or ""),
        "withdrawId": str(m.get("withdrawId") or ""),
        "settlementRowId": str(m.get("settlementRowId") or ""),
        "updatedAt": _now(),
    }
    APIFOX_BRIDGE_FILE.parent.mkdir(parents=True, exist_ok=True)
    APIFOX_BRIDGE_FILE.write_text(json.dumps(vars_map, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "ok": True,
        "path": str(APIFOX_BRIDGE_FILE.relative_to(ROOT)).replace("\\", "/"),
        "vars": vars_map,
    }


def enqueue_retry_of(
    old_run_id: str,
    *,
    source: str = "retry",
    bump_auto_retry: bool = False,
) -> dict:
    """从失败步骤续跑：不重跑已通过/跳过步，带上前次 metrics。"""
    old = get_run(old_run_id) or {}
    if not old:
        return {"ok": False, "error": "运行不存在"}
    opts = dict(old.get("options") or {}) if isinstance(old.get("options"), dict) else {}
    fail_id = _failed_step_id(old)
    if fail_id:
        opts["fromStepId"] = fail_id
    # 保留勾选子集；清掉仅内部用的字段后重新塞
    opts.pop("_autoRetryCount", None)
    opts.pop("_autoRetryOf", None)
    opts.pop("_seedMetrics", None)
    metrics = old.get("metrics") if isinstance(old.get("metrics"), dict) else {}
    if metrics:
        opts["_seedMetrics"] = dict(metrics)
        # 关键业务参数优先沿用失败跑次，避免续跑时被默认会长盖掉
        for key in ("promoteId", "promoteAccount", "gameId", "gameName", "withdrawAmount"):
            if key not in opts or opts.get(key) in (None, ""):
                if metrics.get(key) not in (None, ""):
                    opts[key] = metrics.get(key)
    if bump_auto_retry:
        n = int(old.get("autoRetryCount") or 0)
        opts["_autoRetryCount"] = n + 1
        opts["_autoRetryOf"] = old_run_id
    # 档 B 续跑时若原先开了打款则保持；未显式关闭则沿用
    if str(old.get("profile") or "") == "B" and "enablePayout" not in opts:
        opts["enablePayout"] = True
    out = enqueue_run(
        profile=str(old.get("profile") or "B"),
        target=str(old.get("target") or "lx"),
        pipeline_id=str(old.get("pipelineId") or PIPELINE_ID),
        options=opts,
        source=source,
    )
    return out


def maybe_auto_retry(run_id: str) -> dict:
    run = get_run(run_id) or {}
    if str(run.get("status") or "") != "failed":
        return {"ok": True, "skipped": True, "reason": "非失败"}
    if str(run.get("stopReason") or "") == "stub_stop":
        return {"ok": True, "skipped": True, "reason": "stub 不自动重试"}
    if str(run.get("pipelineId") or "") == "oa_inner_tab_keep_filter":
        return {"ok": True, "skipped": True, "reason": "图形自动化不自动重试"}
    n = int(run.get("autoRetryCount") or 0)
    if n >= AUTO_RETRY_MAX:
        _write_run_log(run_id, f"自动重试已达上限 {AUTO_RETRY_MAX}")
        return {"ok": True, "skipped": True, "reason": f"已达 {AUTO_RETRY_MAX} 次"}
    fail_id = _failed_step_id(run)
    out = enqueue_retry_of(run_id, source="auto_retry", bump_auto_retry=True)
    if out.get("ok"):
        new_id = (out.get("run") or {}).get("id")
        _write_run_log(
            run_id,
            f"已自动重试入队 {new_id} ({n + 1}/{AUTO_RETRY_MAX})"
            + (f" 自 {fail_id}" if fail_id else ""),
        )
        _update_run(run_id, autoRetriedAs=new_id)
    else:
        _write_run_log(run_id, f"自动重试入队失败: {out.get('error')}")
    return out


def recover_on_startup(*, zombie_minutes: int = ZOMBIE_RUNNING_MINUTES) -> dict:
    zombie_minutes = max(5, int(zombie_minutes or ZOMBIE_RUNNING_MINUTES))
    cutoff = datetime.now() - timedelta(minutes=zombie_minutes)
    zombied = []
    queued_n = 0
    with _lock:
        runs = _load_runs()
        changed = False
        for r in runs:
            st = str(r.get("status") or "")
            if st == "queued":
                queued_n += 1
            if st != "running":
                continue
            ts = _parse_ts(str(r.get("startedAt") or r.get("queuedAt") or ""))
            if ts and ts > cutoff:
                continue
            rid = str(r.get("id") or "")
            r["status"] = "failed"
            r["finishedAt"] = _now()
            r["error"] = r.get("error") or f"启动恢复：判定为僵尸 running（>{zombie_minutes} 分钟）"
            r["stopReason"] = "zombie"
            changed = True
            zombied.append(rid)
        if changed:
            _save_runs(runs)
    for rid in zombied:
        try:
            _write_run_log(rid, "启动恢复：僵尸 running 已标失败")
        except Exception:  # noqa: BLE001
            pass
    if queued_n:
        _ensure_worker()
    return {"ok": True, "zombied": zombied, "queued": queued_n}


def cleanup_runs(*, keep_days: int = 14, keep_min: int = 20) -> dict:
    keep_days = max(1, int(keep_days or 14))
    keep_min = max(5, int(keep_min or 20))
    cutoff = datetime.now() - timedelta(days=keep_days)
    removed = []
    with _lock:
        runs = _load_runs()
        keep: list[dict] = []
        for i, r in enumerate(runs):
            if i < keep_min:
                keep.append(r)
                continue
            ts = _parse_ts(str(r.get("finishedAt") or r.get("startedAt") or r.get("queuedAt") or ""))
            if ts and ts >= cutoff:
                keep.append(r)
                continue
            rid = str(r.get("id") or "")
            removed.append(rid)
            run_dir = RUNS_DIR / rid
            if run_dir.is_dir():
                import shutil

                try:
                    shutil.rmtree(run_dir, ignore_errors=True)
                except Exception:  # noqa: BLE001
                    pass
        _save_runs(keep)
    return {"ok": True, "removed": removed, "kept": len(keep)}


def batch_retry_failed(*, limit: int = 20) -> dict:
    runs = list_runs(status="failed", limit=limit).get("runs") or []
    for r in runs:
        if str(r.get("stopReason") or "") == "stub_stop":
            continue
        return enqueue_retry_of(str(r.get("id") or ""), source="batch_retry", bump_auto_retry=False)
    return {"ok": False, "error": "没有可重试的失败跑次"}

