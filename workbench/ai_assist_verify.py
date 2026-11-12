# -*- coding: utf-8 -*-
"""AI 辅助验证：渠道主流程式造数 + 库统计 + L3 工作台指标对验（首期）。"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
AGILE_SIM_DIR = ROOT / "integrated" / "agile-sim-demo"
STATE_FILE = DATA_DIR / "ai_assist_verify.json"
SMOKE_PLANS_FILE = DATA_DIR / "smoke_plans.json"

DEFAULT_PROJECT_ID = "proj_xinshangwu"
DEFAULT_PROJECT_NAME = "新商务"
DEFAULT_SOURCE_DB = "lx"
DEFAULT_SDK_BIZ = "龙翔一级商务"
DEFAULT_BASE_URL = "http://sw.example.com"
DEFAULT_L3_USER = "smoke_l3_24874175"
DEFAULT_L3_PASS = "111111"
TODAY_COUNT = 10
YESTERDAY_COUNT = 20
PLAYER_PREFIX = "aiv"

# 双身份证：A=配置默认；B=第二人（第三方实名失败则库写入兜底）
ID_PROFILES = [
    {"tag": "A", "real_name": "测试实名", "idcard": "110101199001011234"},
    {"tag": "B", "real_name": "李测试", "idcard": "440301199001011234"},
]


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _uid(prefix: str = "aiv") -> str:
    return f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {"runs": [], "defaults": {}}
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"runs": [], "defaults": {}}
    if not isinstance(data, dict):
        return {"runs": [], "defaults": {}}
    data.setdefault("runs", [])
    data.setdefault("defaults", {})
    return data


def save_state(data: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _smoke_l3_defaults() -> dict:
    user, password = DEFAULT_L3_USER, DEFAULT_L3_PASS
    base_url = DEFAULT_BASE_URL
    sdk_biz = DEFAULT_SDK_BIZ
    if SMOKE_PLANS_FILE.exists():
        try:
            plans = json.loads(SMOKE_PLANS_FILE.read_text(encoding="utf-8"))
            if isinstance(plans, list):
                plan = next(
                    (p for p in plans if isinstance(p, dict) and p.get("projectId") == DEFAULT_PROJECT_ID),
                    plans[0] if plans else {},
                )
            else:
                plan = plans if isinstance(plans, dict) else {}
            if isinstance(plan, dict):
                base_url = str(plan.get("baseUrl") or base_url)
                accounts = plan.get("accounts") if isinstance(plan.get("accounts"), dict) else {}
                l3 = accounts.get("l3") if isinstance(accounts.get("l3"), dict) else {}
                sdk = accounts.get("sdk") if isinstance(accounts.get("sdk"), dict) else {}
                if l3.get("username"):
                    user = str(l3["username"])
                if l3.get("password"):
                    password = str(l3["password"])
                if sdk.get("username"):
                    sdk_biz = str(sdk["username"])
        except Exception:
            pass
    return {
        "l3User": user,
        "l3Pass": password,
        "baseUrl": base_url,
        "sdkBusinessAccount": sdk_biz,
        "sourceDb": DEFAULT_SOURCE_DB,
        "projectId": DEFAULT_PROJECT_ID,
        "projectName": DEFAULT_PROJECT_NAME,
    }


def _load_id_profiles() -> list[dict]:
    profiles = [dict(x) for x in ID_PROFILES]
    try:
        from game_sdk_api import load_game_sdk_config

        cfg = load_game_sdk_config()
        rn = cfg.get("realName") if isinstance(cfg.get("realName"), dict) else {}
        if rn.get("idcard") or rn.get("real_name"):
            profiles[0] = {
                "tag": "A",
                "real_name": str(rn.get("real_name") or profiles[0]["real_name"]),
                "idcard": str(rn.get("idcard") or profiles[0]["idcard"]),
            }
    except Exception:
        pass
    return profiles


def lookup_promote_account(promote_id: int | str, *, source_db: str = DEFAULT_SOURCE_DB) -> dict:
    from smoke_db import _connect, load_db_config, resolve_database

    try:
        pid = int(promote_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "无效 promoteId"}
    db = resolve_database(source_db)
    conn = _connect(load_db_config(), source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account, promote_level, status FROM `{db}`.tab_promote WHERE id=%s LIMIT 1",
                (pid,),
            )
            row = cur.fetchone() or {}
            if not row:
                return {"ok": False, "error": f"未找到 promote_id={pid}", "database": db}
            return {
                "ok": True,
                "database": db,
                "promoteId": int(row["id"]),
                "account": str(row.get("account") or ""),
                "promoteLevel": row.get("promote_level"),
                "status": row.get("status"),
            }
    finally:
        conn.close()


def build_verify_sqls(
    *,
    promote_id: int | str,
    source_db: str = DEFAULT_SOURCE_DB,
    today_accounts: list[str] | None = None,
    yesterday_accounts: list[str] | None = None,
    stats_promote_ids: list[int] | None = None,
) -> dict:
    """生成可直接复制到客户端执行的查验 SQL（game_* · register_time=unix varchar）。"""
    from smoke_db import resolve_database

    db = resolve_database(source_db)
    pid = int(promote_id)
    stats_pids = [int(x) for x in (stats_promote_ids or []) if int(x) > 0] or [pid]
    ph = ",".join(str(x) for x in stats_pids)
    scope_note = (
        f"口径：商户旗下 {len(stats_pids)} 个会长汇总（与 L3 工作台卡片一致）；造数会长 focus={pid}"
        if len(stats_pids) > 1
        else f"口径：promote_id={pid}"
    )
    today_acc = [str(a) for a in (today_accounts or []) if a]
    yday_acc = [str(a) for a in (yesterday_accounts or []) if a]

    def _in_list(accounts: list[str]) -> str:
        if not accounts:
            return "''"
        return ", ".join("'" + a.replace("'", "''") + "'" for a in accounts)

    return {
        "database": db,
        "promoteId": pid,
        "statsPromoteIds": stats_pids,
        "todayRegCount": f"""-- 今日渠道玩家注册数量（账号数，不去重）
-- {scope_note}
SELECT COUNT(*) AS today_reg
FROM `{db}`.tab_user
WHERE promote_id IN ({ph})
  AND DATE(FROM_UNIXTIME(register_time)) = CURDATE();""",
        "yesterdayRegCount": f"""-- 昨日渠道玩家注册数量（账号数，不去重）
-- {scope_note}
SELECT COUNT(*) AS yesterday_reg
FROM `{db}`.tab_user
WHERE promote_id IN ({ph})
  AND DATE(FROM_UNIXTIME(register_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY);""",
        "momHint": f"""-- 环比昨日 = (今日 - 昨日) / 昨日
-- {scope_note}
SELECT
  t.today_reg,
  y.yesterday_reg,
  ROUND((t.today_reg - y.yesterday_reg) / NULLIF(y.yesterday_reg, 0), 4) AS mom_ratio
FROM
  (SELECT COUNT(*) AS today_reg FROM `{db}`.tab_user
   WHERE promote_id IN ({ph}) AND DATE(FROM_UNIXTIME(register_time)) = CURDATE()) t,
  (SELECT COUNT(*) AS yesterday_reg FROM `{db}`.tab_user
   WHERE promote_id IN ({ph})
     AND DATE(FROM_UNIXTIME(register_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)) y;""",
        "todayPlayers": f"""-- 今日注册玩家明细（造数会长 {pid}）
SELECT id, account, register_time,
       FROM_UNIXTIME(register_time) AS reg_dt,
       real_name, idcard, promote_id
FROM `{db}`.tab_user
WHERE promote_id = {pid}
  AND DATE(FROM_UNIXTIME(register_time)) = CURDATE()
ORDER BY id;""",
        "yesterdayPlayers": f"""-- 昨日注册玩家明细（造数会长 {pid}）
SELECT id, account, register_time,
       FROM_UNIXTIME(register_time) AS reg_dt,
       real_name, idcard, promote_id
FROM `{db}`.tab_user
WHERE promote_id = {pid}
  AND DATE(FROM_UNIXTIME(register_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
ORDER BY id;""",
        "todayByAccounts": f"""-- 按本次造数「今日」账号核对
SELECT id, account, FROM_UNIXTIME(register_time) AS reg_dt, real_name, idcard
FROM `{db}`.tab_user
WHERE account IN ({_in_list(today_acc)})
ORDER BY id;"""
        if today_acc
        else "-- 尚无今日造数账号",
        "yesterdayByAccounts": f"""-- 按本次造数「昨日」账号核对
SELECT id, account, FROM_UNIXTIME(register_time) AS reg_dt, real_name, idcard
FROM `{db}`.tab_user
WHERE account IN ({_in_list(yday_acc)})
ORDER BY id;"""
        if yday_acc
        else "-- 尚无昨日造数账号",
        "sdkBusiness": f"""-- 游戏商户与挂靠会长
SELECT id, account, promote_ids
FROM `{db}`.tab_promote_business
WHERE account = '龙翔一级商务' OR FIND_IN_SET('{pid}', REPLACE(promote_ids,' ','')) > 0
LIMIT 5;

SELECT id, account, promote_level, status, busier_id
FROM `{db}`.tab_promote
WHERE id IN ({ph})
ORDER BY id;""",
    }


def build_seed_dossier(run: dict | None = None, *, source_db: str = DEFAULT_SOURCE_DB) -> dict:
    """图二左侧/查验区用的造数档案：商户、会长、玩家、SQL。"""
    defaults = _smoke_l3_defaults()
    run = run if isinstance(run, dict) else {}
    pid = run.get("promoteId") or (run.get("context") or {}).get("promoteId")
    sdk = (
        run.get("sdkBusinessAccount")
        or (run.get("context") or {}).get("sdkBusinessAccount")
        or defaults["sdkBusinessAccount"]
    )
    src = str(run.get("sourceDb") or source_db or defaults["sourceDb"])
    president = lookup_promote_account(pid, source_db=src) if pid else {"ok": False}
    today_users = run.get("todayUsers") if isinstance(run.get("todayUsers"), list) else []
    yday_users = run.get("yesterdayUsers") if isinstance(run.get("yesterdayUsers"), list) else []
    today_acc = [str(u.get("account") or "") for u in today_users if u.get("account")]
    if not today_acc and isinstance(run.get("todayAccounts"), list):
        today_acc = [str(a) for a in run["todayAccounts"] if a]
    yday_acc = [str(u.get("account") or "") for u in yday_users if u.get("account")]
    if not yday_acc and isinstance(run.get("yesterdayAccounts"), list):
        yday_acc = [str(a) for a in run["yesterdayAccounts"] if a]

    sqls = build_verify_sqls(
        promote_id=pid or 0,
        source_db=src,
        today_accounts=today_acc,
        yesterday_accounts=yday_acc,
        stats_promote_ids=(
            (run.get("context") or {}).get("statsPromoteIds")
            or (run.get("context") or {}).get("businessPromoteIds")
            or run.get("statsPromoteIds")
        ),
    ) if pid else {}

    return {
        "ok": bool(pid),
        "seededAt": run.get("createdAt") or "",
        "runId": run.get("id") or "",
        "metricFocus": "今日渠道玩家注册 + 环比昨日",
        "sdkBusinessAccount": sdk,
        "presidentAccount": president.get("account") or run.get("presidentAccount") or "",
        "promoteId": pid,
        "promoteLevel": president.get("promoteLevel"),
        "sourceDb": src,
        "database": sqls.get("database") or "",
        "viewerL3": run.get("l3User") or defaults["l3User"],
        "todayCount": len(today_acc) or run.get("todayCount") or 0,
        "yesterdayCount": len(yday_acc) or run.get("yesterdayCount") or 0,
        "todayAccounts": today_acc,
        "yesterdayAccounts": yday_acc,
        "todayDist": run.get("todayDist"),
        "yesterdayDist": run.get("yesterdayDist"),
        "dbStats": run.get("dbStats"),
        "verifySqls": sqls,
        "howToCheck": [
            "1. 左侧确认：游戏商户 → 会长 → 今日/昨日玩家账号列表",
            "2. 复制右侧「今日渠道玩家注册」SQL，在测试库客户端执行，看 COUNT",
            "3. 再执行「昨日注册数量」与「环比」SQL，期望约 10 / 20 / -50%",
            "4. 可用「按造数账号核对」SQL，确认列表里的账号都在库里且日期正确",
            "5. 页面仍为 0 时：先以库结果为准；工作台可能未同步到该会长口径",
        ],
    }


def latest_seed_run(project_id: str | None = None) -> dict | None:
    state = load_state()
    runs = state.get("runs") if isinstance(state.get("runs"), list) else []
    for r in runs:
        if not isinstance(r, dict) or r.get("kind") != "seed":
            continue
        if project_id and r.get("projectId") and r.get("projectId") != project_id:
            continue
        return r
    return None


def load_full_strategy_file() -> dict:
    path = DATA_DIR / "_wb_seed_full_result.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def enrich_dossier_with_full_strategy(dossier: dict | None) -> dict:
    """把全量造数结果（登录/充值/TOP10/下级）并入 dossier，供图二清单与 SQL。"""
    from smoke_db import resolve_database

    d = dict(dossier or {})
    full = load_full_strategy_file()
    if not full:
        return d

    steps = full.get("steps") if isinstance(full.get("steps"), dict) else {}
    base = full.get("baseL1") if isinstance(full.get("baseL1"), dict) else {}
    src = str(d.get("sourceDb") or DEFAULT_SOURCE_DB)
    db = resolve_database(src)
    pid = int(d.get("promoteId") or base.get("promoteId") or 0)

    login = steps.get("login") if isinstance(steps.get("login"), dict) else {}
    pay_ty = steps.get("payTodayYesterday") if isinstance(steps.get("payTodayYesterday"), dict) else {}
    month_pay = steps.get("monthPay") if isinstance(steps.get("monthPay"), dict) else {}
    active = steps.get("newAndActiveChannels") if isinstance(steps.get("newAndActiveChannels"), dict) else {}
    top10 = steps.get("top10") if isinstance(steps.get("top10"), list) else []
    sub = steps.get("subordinates") if isinstance(steps.get("subordinates"), dict) else {}

    # 登录账号优先用全量结果（比 seed 更准）
    if login.get("todayAccounts"):
        d["todayLoginAccounts"] = [str(a) for a in login["todayAccounts"] if a]
    if login.get("yesterdayAccounts"):
        d["yesterdayLoginAccounts"] = [str(a) for a in login["yesterdayAccounts"] if a]
        # 昨日登录里可能混入非 aiv，过滤展示时可保留全量供查验

    pay_today_acc = [
        str(x.get("account"))
        for x in (pay_ty.get("today") or [])
        if isinstance(x, dict) and x.get("account") and x.get("ok")
    ]
    pay_yday_acc = [
        str(x.get("account"))
        for x in (pay_ty.get("yesterday") or [])
        if isinstance(x, dict) and x.get("account") and x.get("ok")
    ]

    top_slim = []
    top_pids: list[int] = []
    for x in top10:
        if not isinstance(x, dict):
            continue
        p = int(x.get("promoteId") or 0)
        if p:
            top_pids.append(p)
        top_slim.append(
            {
                "rankHint": x.get("rankHint"),
                "account": x.get("account"),
                "promoteId": p or x.get("promoteId"),
                "todayReg": x.get("todayReg"),
                "yesterdayReg": x.get("yesterdayReg"),
                "todayPay": x.get("todayPay"),
                "yesterdayPay": x.get("yesterdayPay"),
                "lastLoginDaysAgo": x.get("lastLoginDaysAgo"),
                "todayPlayers": (x.get("todayPlayers") or [])[:5],
                "todayPlayersAll": x.get("todayPlayers") or [],
                "yesterdayPlayersAll": x.get("yesterdayPlayers") or [],
                "note": x.get("note"),
            }
        )

    new_active = {}
    for k, v in active.items():
        if not isinstance(v, dict):
            continue
        ch = v.get("channel") if isinstance(v.get("channel"), dict) else {}
        pl = v.get("player") if isinstance(v.get("player"), dict) else {}
        new_active[k] = {
            "channelAccount": ch.get("account"),
            "promoteId": ch.get("promoteId"),
            "playerAccount": pl.get("account"),
        }

    d["sdkBusinessAccount"] = full.get("sdkBusiness") or d.get("sdkBusinessAccount")
    if base.get("account"):
        d["presidentAccount"] = base.get("account")
    if base.get("promoteId"):
        d["promoteId"] = base.get("promoteId")
        pid = int(base["promoteId"])
    d["metricFocus"] = "工作台造数策略全量（注册/登录/充值/TOP10/下级）"
    d["fullStrategy"] = {
        "login": {
            "today": login.get("today"),
            "yesterday": login.get("yesterday"),
            "todayAccounts": d.get("todayLoginAccounts") or [],
            "yesterdayAccounts": d.get("yesterdayLoginAccounts") or [],
        },
        "pay": {
            "todayAccounts": pay_today_acc,
            "yesterdayAccounts": pay_yday_acc,
            "todayAmounts": pay_ty.get("today") or [],
            "yesterdayAmounts": pay_ty.get("yesterday") or [],
            "month": month_pay,
        },
        "newAndActive": new_active,
        "top10": top_slim,
        "subordinates": {
            "l2": sub.get("l2"),
            "l3": sub.get("l3"),
            "players": sub.get("players") or [],
            "hint": sub.get("hint") or "",
        },
        "resultFile": "data/_wb_seed_full_result.json",
    }

    sqls = dict(d.get("verifySqls") or {})
    if pid:
        biz_pids: list[int] = []
        try:
            ctx_sql = resolve_promote_context(
                source_db=src,
                promote_id=pid,
                sdk_business_account=str(d.get("sdkBusinessAccount") or "龙翔一级商务"),
            )
            biz_pids = [
                int(x)
                for x in (ctx_sql.get("statsPromoteIds") or ctx_sql.get("businessPromoteIds") or [])
                if int(x) > 0
            ]
        except Exception:
            biz_pids = []
        if not biz_pids:
            biz_pids = [int(pid)]
        bph = ",".join(str(x) for x in biz_pids)
        scope_note = f"口径：商户旗下 {len(biz_pids)} 个会长汇总（与 L3 卡片一致）；造数 focus={pid}"
        more = build_verify_sqls(
            promote_id=pid,
            source_db=src,
            today_accounts=d.get("todayAccounts") or [],
            yesterday_accounts=d.get("yesterdayAccounts") or [],
            stats_promote_ids=biz_pids,
        )
        sqls.update(more)
        sqls["todayLogin"] = f"""-- 今日渠道活跃玩家
-- {scope_note}
-- ① 明细去重
SELECT COUNT(DISTINCT user_id) AS today_active_detail
FROM `sw6`.tab_user_day_login
WHERE promote_id IN ({bph})
  AND source_db = 'lx'
  AND DATE(FROM_UNIXTIME(login_time)) = CURDATE();

-- ② 汇总求和（与页对齐优先）
SELECT COALESCE(SUM(active_cnt),0) AS today_active_report
FROM `sw6`.tab_sw_report_day
WHERE promote_id IN ({bph})
  AND source_db = 'lx'
  AND DATE(stat_date) = CURDATE()
  AND dedup_mode = 0;"""
        sqls["yesterdayLogin"] = f"""-- 昨日渠道活跃玩家
-- {scope_note}
SELECT COUNT(DISTINCT user_id) AS yesterday_active_detail
FROM `sw6`.tab_user_day_login
WHERE promote_id IN ({bph})
  AND source_db = 'lx'
  AND DATE(FROM_UNIXTIME(login_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY);

SELECT COALESCE(SUM(active_cnt),0) AS yesterday_active_report
FROM `sw6`.tab_sw_report_day
WHERE promote_id IN ({bph})
  AND source_db = 'lx'
  AND DATE(stat_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
  AND dedup_mode = 0;"""
        sqls["loginMomHint"] = f"""-- 活跃环比：旗下会长 active_cnt 求和
-- {scope_note}
SELECT
  t.active_cnt AS today_active,
  y.active_cnt AS yesterday_active,
  ROUND((t.active_cnt - y.active_cnt) / NULLIF(y.active_cnt, 0), 4) AS active_mom_ratio
FROM
  (SELECT COALESCE(SUM(active_cnt),0) AS active_cnt FROM `sw6`.tab_sw_report_day
   WHERE promote_id IN ({bph}) AND source_db = 'lx' AND DATE(stat_date) = CURDATE() AND dedup_mode = 0) t,
  (SELECT COALESCE(SUM(active_cnt),0) AS active_cnt FROM `sw6`.tab_sw_report_day
   WHERE promote_id IN ({bph}) AND source_db = 'lx'
     AND DATE(stat_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND dedup_mode = 0) y;"""
        sqls["todayPay"] = f"""-- 今日渠道玩家充值金额
-- {scope_note}
SELECT COALESCE(SUM(total_pay),0) AS today_pay_report
FROM `sw6`.tab_sw_report_day
WHERE promote_id IN ({bph})
  AND source_db = 'lx'
  AND DATE(stat_date) = CURDATE()
  AND dedup_mode = 0;

SELECT COALESCE(SUM(pay_amount),0) AS today_pay_detail
FROM `{db}`.tab_spend
WHERE promote_id IN ({bph}) AND pay_status = 1
  AND DATE(FROM_UNIXTIME(pay_time)) = CURDATE();"""
        sqls["yesterdayPay"] = f"""-- 昨日渠道玩家充值金额
-- {scope_note}
SELECT COALESCE(SUM(total_pay),0) AS yesterday_pay_report
FROM `sw6`.tab_sw_report_day
WHERE promote_id IN ({bph})
  AND source_db = 'lx'
  AND DATE(stat_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
  AND dedup_mode = 0;

SELECT COALESCE(SUM(pay_amount),0) AS yesterday_pay_detail
FROM `{db}`.tab_spend
WHERE promote_id IN ({bph}) AND pay_status = 1
  AND DATE(FROM_UNIXTIME(pay_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY);"""
        sqls["payMomHint"] = f"""-- 充值环比：旗下会长 total_pay 求和
-- {scope_note}
SELECT
  t.total_pay AS today_pay,
  y.total_pay AS yesterday_pay,
  ROUND((t.total_pay - y.total_pay) / NULLIF(y.total_pay, 0), 4) AS pay_mom_ratio
FROM
  (SELECT COALESCE(SUM(total_pay),0) AS total_pay FROM `sw6`.tab_sw_report_day
   WHERE promote_id IN ({bph}) AND source_db = 'lx' AND DATE(stat_date) = CURDATE() AND dedup_mode = 0) t,
  (SELECT COALESCE(SUM(total_pay),0) AS total_pay FROM `sw6`.tab_sw_report_day
   WHERE promote_id IN ({bph}) AND source_db = 'lx'
     AND DATE(stat_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND dedup_mode = 0) y;"""
        sqls["monthPay"] = f"""-- 本月充值金额（当月1号~今天）
-- {scope_note}
SELECT COALESCE(SUM(total_pay),0) AS month_pay_report
FROM `sw6`.tab_sw_report_day
WHERE promote_id IN ({bph}) AND source_db = 'lx' AND dedup_mode = 0
  AND DATE(stat_date) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  AND DATE(stat_date) <= CURDATE();

SELECT COALESCE(SUM(pay_amount),0) AS month_pay_detail
FROM `{db}`.tab_spend
WHERE promote_id IN ({bph}) AND pay_status = 1
  AND pay_time >= UNIX_TIMESTAMP(DATE_FORMAT(CURDATE(), '%Y-%m-01'));"""
        sqls["lastMonthPay"] = f"""-- 上月充值金额（上月整月，至上月末）
-- {scope_note}
SELECT COALESCE(SUM(total_pay),0) AS last_month_pay_report
FROM `sw6`.tab_sw_report_day
WHERE promote_id IN ({bph}) AND source_db = 'lx' AND dedup_mode = 0
  AND DATE(stat_date) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
  AND DATE(stat_date) < DATE_FORMAT(CURDATE(), '%Y-%m-01');

SELECT COALESCE(SUM(pay_amount),0) AS last_month_pay_detail
FROM `{db}`.tab_spend
WHERE promote_id IN ({bph}) AND pay_status = 1
  AND pay_time >= UNIX_TIMESTAMP(DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01'))
  AND pay_time < UNIX_TIMESTAMP(DATE_FORMAT(CURDATE(), '%Y-%m-01'));"""
        sqls["monthPayMomHint"] = f"""-- 环比上月 / 较上月同期
-- {scope_note}
SELECT
  t.month_pay,
  y.same_period_pay,
  CASE
    WHEN y.same_period_pay > 0 THEN ROUND((t.month_pay - y.same_period_pay) / y.same_period_pay, 4)
    ELSE 0
  END AS month_pay_mom_ratio
FROM
  (SELECT COALESCE(SUM(total_pay),0) AS month_pay FROM `sw6`.tab_sw_report_day
   WHERE promote_id IN ({bph}) AND source_db = 'lx' AND dedup_mode = 0
     AND DATE(stat_date) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
     AND DATE(stat_date) <= CURDATE()) t,
  (SELECT COALESCE(SUM(total_pay),0) AS same_period_pay FROM `sw6`.tab_sw_report_day
   WHERE promote_id IN ({bph}) AND source_db = 'lx' AND dedup_mode = 0
     AND DATE(stat_date) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
     AND DATE(stat_date) <= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) y;"""
        sqls["todayActiveChannels"] = f"""-- 今日活跃渠道数
-- {scope_note}
-- 当日「有玩家注册」或「有成功充值」则该会长+1
SELECT COUNT(*) AS today_active_channels
FROM `sw6`.tab_sw_report_day
WHERE source_db = 'lx' AND dedup_mode = 0 AND DATE(stat_date) = CURDATE()
  AND promote_id IN ({bph})
  AND (COALESCE(new_register_cnt,0) > 0 OR COALESCE(total_pay,0) > 0 OR COALESCE(pay_cnt,0) > 0);

SELECT promote_id FROM `{db}`.tab_user
WHERE promote_id IN ({bph}) AND DATE(FROM_UNIXTIME(register_time)) = CURDATE()
UNION
SELECT promote_id FROM `{db}`.tab_spend
WHERE promote_id IN ({bph}) AND pay_status = 1 AND DATE(FROM_UNIXTIME(pay_time)) = CURDATE();"""
        sqls["yesterdayActiveChannels"] = f"""-- 昨日活跃渠道数
SELECT COUNT(*) AS yesterday_active_channels
FROM `sw6`.tab_sw_report_day
WHERE source_db = 'lx' AND dedup_mode = 0
  AND DATE(stat_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
  AND promote_id IN ({bph})
  AND (COALESCE(new_register_cnt,0) > 0 OR COALESCE(total_pay,0) > 0 OR COALESCE(pay_cnt,0) > 0);"""
        sqls["activeChannelDeltaHint"] = f"""-- 活跃渠道「环比昨日」= (今 - 昨) / 昨
-- 造数：昨2 今4 → 环比 +100%（差值会是 +2，用来确认页上是%不是差值）
SELECT
  t.c AS today_active_channels,
  y.c AS yesterday_active_channels,
  CASE WHEN y.c > 0 THEN ROUND((t.c - y.c) / y.c, 4) ELSE 0 END AS active_channel_mom_ratio
FROM
  (SELECT COUNT(DISTINCT promote_id) AS c FROM `sw6`.tab_sw_report_day
   WHERE source_db='lx' AND dedup_mode=0 AND DATE(stat_date)=CURDATE()
     AND promote_id IN ({bph})
     AND (COALESCE(new_register_cnt,0)>0 OR COALESCE(total_pay,0)>0 OR COALESCE(pay_cnt,0)>0)) t,
  (SELECT COUNT(DISTINCT promote_id) AS c FROM `sw6`.tab_sw_report_day
   WHERE source_db='lx' AND dedup_mode=0 AND DATE(stat_date)=DATE_SUB(CURDATE(), INTERVAL 1 DAY)
     AND promote_id IN ({bph})
     AND (COALESCE(new_register_cnt,0)>0 OR COALESCE(total_pay,0)>0 OR COALESCE(pay_cnt,0)>0)) y;"""
        biz_id_sql = int(ctx_sql.get("businessId") or 0)
        if not biz_id_sql:
            try:
                from smoke_db import _connect as _c3, load_db_config as _l3

                _c = _c3(_l3(), source_db=src)
                try:
                    with _c.cursor() as _cu:
                        _cu.execute(
                            f"SELECT id FROM `{db}`.tab_promote_business WHERE account=%s LIMIT 1",
                            (str(d.get("sdkBusinessAccount") or "龙翔一级商务"),),
                        )
                        biz_id_sql = int((_cu.fetchone() or {}).get("id") or 0)
                finally:
                    _c.close()
            except Exception:
                biz_id_sql = 0
        sqls["todayNewChannels"] = f"""-- 今日新增渠道数
-- 口径：商务 busier_id={biz_id_sql or '…'} 下 promote_level=1，create_time 落在今天
-- 造数：INSERT 一级渠道并写 busier_id，数量 +1
SELECT COUNT(*) AS today_new_channels
FROM `{db}`.tab_promote
WHERE busier_id = {biz_id_sql or 0}
  AND promote_level = 1
  AND DATE(FROM_UNIXTIME(create_time)) = CURDATE();

SELECT id, account, FROM_UNIXTIME(create_time) AS create_dt
FROM `{db}`.tab_promote
WHERE busier_id = {biz_id_sql or 0}
  AND promote_level = 1
  AND DATE(FROM_UNIXTIME(create_time)) = CURDATE()
ORDER BY id;"""
        sqls["yesterdayNewChannels"] = f"""-- 昨日新增渠道数
-- 造数：新建一级渠道后把 create_time 改到昨天，数量 +1
SELECT COUNT(*) AS yesterday_new_channels
FROM `{db}`.tab_promote
WHERE busier_id = {biz_id_sql or 0}
  AND promote_level = 1
  AND DATE(FROM_UNIXTIME(create_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY);

SELECT id, account, FROM_UNIXTIME(create_time) AS create_dt
FROM `{db}`.tab_promote
WHERE busier_id = {biz_id_sql or 0}
  AND promote_level = 1
  AND DATE(FROM_UNIXTIME(create_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
ORDER BY id;"""
        sqls["newChannelDeltaHint"] = f"""-- 环比昨日（新增渠道）= (今日新增 - 昨日新增) / 昨日新增
-- 造数：昨2 今4 → 环比 +100%（差值会是 +2）
SELECT
  t.c AS today_new_channels,
  y.c AS yesterday_new_channels,
  CASE WHEN y.c > 0 THEN ROUND((t.c - y.c) / y.c, 4) ELSE 0 END AS new_channel_mom_ratio
FROM
  (SELECT COUNT(*) AS c FROM `{db}`.tab_promote
   WHERE busier_id={biz_id_sql or 0} AND promote_level=1
     AND DATE(FROM_UNIXTIME(create_time))=CURDATE()) t,
  (SELECT COUNT(*) AS c FROM `{db}`.tab_promote
   WHERE busier_id={biz_id_sql or 0} AND promote_level=1
     AND DATE(FROM_UNIXTIME(create_time))=DATE_SUB(CURDATE(), INTERVAL 1 DAY)) y;"""

    if top_pids:
        ph = ",".join(str(x) for x in top_pids)
        sqls["topTodayReg"] = f"""-- 渠道注册 TOP10（今日）
SELECT p.id AS promote_id, p.account, COUNT(u.id) AS today_reg
FROM `{db}`.tab_promote p
LEFT JOIN `{db}`.tab_user u
  ON u.promote_id = p.id AND DATE(FROM_UNIXTIME(u.register_time)) = CURDATE()
WHERE p.id IN ({ph})
GROUP BY p.id, p.account
ORDER BY today_reg DESC, p.id;"""
        sqls["topYesterdayReg"] = f"""-- 渠道注册 TOP10（昨日）
SELECT p.id AS promote_id, p.account, COUNT(u.id) AS yesterday_reg
FROM `{db}`.tab_promote p
LEFT JOIN `{db}`.tab_user u
  ON u.promote_id = p.id
 AND DATE(FROM_UNIXTIME(u.register_time)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
WHERE p.id IN ({ph})
GROUP BY p.id, p.account
ORDER BY yesterday_reg DESC, p.id;"""
        sqls["topTodayPay"] = f"""-- 渠道充值 TOP10（今日）
SELECT p.id AS promote_id, p.account, COALESCE(SUM(s.pay_amount),0) AS today_pay
FROM `{db}`.tab_promote p
LEFT JOIN `{db}`.tab_spend s
  ON s.promote_id = p.id AND s.pay_status = 1
 AND DATE(FROM_UNIXTIME(s.pay_time)) = CURDATE()
WHERE p.id IN ({ph})
GROUP BY p.id, p.account
ORDER BY today_pay DESC, p.id;"""
        sqls["topChannels"] = f"""-- TOP 渠道清单（wb_top_*）
SELECT id, account, promote_level, status,
       FROM_UNIXTIME(create_time) AS create_dt,
       FROM_UNIXTIME(login_time) AS last_login_dt
FROM `{db}`.tab_promote
WHERE id IN ({ph})
ORDER BY account;"""

    l2 = (sub.get("l2") or {}) if isinstance(sub.get("l2"), dict) else {}
    l3 = (sub.get("l3") or {}) if isinstance(sub.get("l3"), dict) else {}
    sub_pids = [int(x) for x in (l2.get("promoteId"), l3.get("promoteId")) if x]
    if sub_pids:
        sph = ",".join(str(x) for x in sub_pids)
        sqls["subPlayers"] = f"""-- 包含下级：L2/L3 玩家
SELECT id, account, promote_id, FROM_UNIXTIME(register_time) AS reg_dt
FROM `{db}`.tab_user
WHERE promote_id IN ({sph})
ORDER BY promote_id, id;

SELECT id, account, promote_level, parent_id FROM `{db}`.tab_promote
WHERE id IN ({sph});"""

    d["verifySqls"] = sqls
    d["database"] = db
    d["howToCheck"] = [
        "1. 左侧：商户 → 一级会长 → 今/昨注册玩家 → 登录/充值 → TOP渠道 → 下级",
        "2. 右侧复制对应 SQL（今日注册/登录/充值/TOP）到库客户端执行",
        "3. TOP 渠道账号 wb_top_01..10，今日注册应为 10→1",
        "4. 勾选「包含下级」对比不勾选，应看到 L2/L3 增量",
        "5. 完整明细见 data/_wb_seed_full_result.json",
    ]
    d["ok"] = True
    return d


def resolve_promote_context(
    *,
    source_db: str = DEFAULT_SOURCE_DB,
    promote_id: str | int | None = None,
    sdk_business_account: str | None = None,
    include_sub_channels: bool = False,
) -> dict:
    """解析造数挂靠的 promote_id，以及统计用的 promote_ids 列表。

    include_sub_channels=False（默认）：卡片期望仅一级会长（与 L3 页常见口径一致）
    include_sub_channels=True：合集含 2/3 级下级渠道
    """
    from smoke_db import _connect, load_db_config, lookup_promote_id, resolve_database

    notes: list[str] = []
    pids: list[int] = []
    seed_pid: int | None = None
    biz_account = str(sdk_business_account or DEFAULT_SDK_BIZ).strip()
    biz_row: dict = {}

    if promote_id not in (None, "", 0, "0"):
        try:
            seed_pid = int(promote_id)
            pids = [seed_pid]
            notes.append(f"使用显式 promoteId={seed_pid}")
        except (TypeError, ValueError):
            notes.append(f"无效 promoteId={promote_id}，改走自动解析")

    # 1) 最近渠道主流程 L3 会话
    if seed_pid is None:
        runs_dir = DATA_DIR / "biz_flow_runs"
        if runs_dir.is_dir():
            sessions = sorted(
                runs_dir.glob("*/game_sdk_session_l3.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for path in sessions[:5]:
                try:
                    sess = json.loads(path.read_text(encoding="utf-8"))
                    pid = int(sess.get("promoteId") or 0)
                    if pid > 0:
                        seed_pid = pid
                        pids = [pid]
                        notes.append(f"来自主流程 L3 会话 {path.parent.name} promoteId={pid}")
                        break
                except Exception:
                    continue

    # 2) 最近主流程产物：三级会长 → lookup
    if seed_pid is None:
        try:
            import biz_flow

            for run in biz_flow.list_runs(8):
                rid = str(run.get("id") or "")
                if not rid:
                    continue
                art = biz_flow._find_run_artifact(rid, role_contains="三级会长") or biz_flow._find_run_artifact(
                    rid, step_id="F16"
                )
                if not art or not art.get("account"):
                    continue
                looked = lookup_promote_id(str(art.get("account")), source_db=source_db)
                if looked.get("ok") and looked.get("promoteId"):
                    seed_pid = int(looked["promoteId"])
                    pids = [seed_pid]
                    notes.append(
                        f"来自主流程产物三级会长 {art.get('account')} → promoteId={seed_pid}"
                    )
                    break
        except Exception as exc:
            notes.append(f"扫主流程产物失败: {exc}")

    # 3) 冒烟绑定的游戏商务 promote_ids（L3 绑定 龙翔一级商务）
    db = resolve_database(source_db)
    cfg = load_db_config()
    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account, promote_ids FROM `{db}`.tab_promote_business WHERE account=%s LIMIT 1",
                (biz_account,),
            )
            biz_row = cur.fetchone() or {}
    finally:
        conn.close()

    raw_pids = str(biz_row.get("promote_ids") or "")
    biz_pids = [int(x) for x in raw_pids.split(",") if str(x).strip().isdigit()]
    biz_id = int(biz_row.get("id") or 0) if biz_row else 0
    # 后台「商务专员」看 busier_id；与 promote_ids 并集，避免只挂字符串不算归属
    if biz_id > 0:
        conn2 = _connect(cfg, source_db=source_db)
        try:
            with conn2.cursor() as cur2:
                cur2.execute(
                    f"SELECT id FROM `{db}`.tab_promote WHERE busier_id=%s",
                    (biz_id,),
                )
                for row in cur2.fetchall() or []:
                    try:
                        biz_pids.append(int(row["id"]))
                    except (TypeError, ValueError, KeyError):
                        continue
        finally:
            conn2.close()
    biz_pids = sorted({int(x) for x in biz_pids if int(x) > 0})

    # 工作台卡片统计合集：默认仅一级；勾选「包含下级」时含 L2/L3
    stats_pids: list[int] = []
    if biz_pids:
        conn_lv = _connect(cfg, source_db=source_db)
        try:
            with conn_lv.cursor() as cur_lv:
                ph_lv = ",".join(["%s"] * len(biz_pids))
                if include_sub_channels:
                    cur_lv.execute(
                        f"SELECT id FROM `{db}`.tab_promote WHERE id IN ({ph_lv})",
                        tuple(biz_pids),
                    )
                else:
                    cur_lv.execute(
                        f"SELECT id FROM `{db}`.tab_promote "
                        f"WHERE id IN ({ph_lv}) AND promote_level=1",
                        tuple(biz_pids),
                    )
                stats_pids = sorted({int(r["id"]) for r in (cur_lv.fetchall() or [])})
        finally:
            conn_lv.close()
    if not stats_pids:
        stats_pids = list(biz_pids)

    if seed_pid is None and biz_pids:
        preferred = None
        conn3 = _connect(cfg, source_db=source_db)
        try:
            with conn3.cursor() as cur3:
                cur3.execute(
                    f"SELECT id FROM `{db}`.tab_promote WHERE account=%s LIMIT 1",
                    ("一级会长",),
                )
                row = cur3.fetchone() or {}
                if row.get("id"):
                    preferred = int(row["id"])
        finally:
            conn3.close()
        seed_pid = preferred or biz_pids[-1]
        notes.append(f"回退商务 {biz_account} → seed={seed_pid}")
    elif biz_pids:
        notes.append(
            f"商务 {biz_account} 旗下渠道={len(biz_pids)}个，"
            f"卡片期望={'含下级' if include_sub_channels else '仅一级'}={len(stats_pids)}个"
        )

    if seed_pid is None:
        return {
            "ok": False,
            "error": "无可用 promote_id：请先跑渠道主流程到三级就绪，或确认游戏商务已绑定渠道",
            "notes": notes,
            "sdkBusinessAccount": biz_account,
            "business": dict(biz_row) if biz_row else {},
        }

    # 造数仍挂单个 focus promote；比对期望用商户旗下全量
    if not pids:
        pids = [int(seed_pid)]

    return {
        "ok": True,
        "promoteId": int(seed_pid),
        "promoteIds": [int(x) for x in pids],
        "businessPromoteIds": biz_pids,
        "statsPromoteIds": stats_pids if stats_pids else [int(x) for x in pids],
        "includeSubChannels": bool(include_sub_channels),
        "sdkBusinessAccount": biz_account,
        "businessId": biz_id,
        "business": {k: biz_row.get(k) for k in ("id", "account", "promote_ids")} if biz_row else {},
        "notes": notes,
        "sourceDb": source_db,
        "database": db,
    }


def ensure_l3_context(
    *,
    source_db: str = DEFAULT_SOURCE_DB,
    sdk_business_account: str | None = None,
) -> dict:
    ctx = resolve_promote_context(source_db=source_db, sdk_business_account=sdk_business_account)
    defaults = _smoke_l3_defaults()
    return {
        **ctx,
        "l3User": defaults["l3User"],
        "l3Pass": defaults["l3Pass"],
        "baseUrl": defaults["baseUrl"],
        "hint": (
            "已解析到 promote_id，可直接造数"
            if ctx.get("ok")
            else "请先在「渠道主流程」跑到三级会长/玩家就绪，或确认 L3 已绑定游戏商务"
        ),
    }


def _count_reg_for_day(cur, db: str, promote_ids: list[int], day_sql: str, day_params: tuple) -> int:
    if not promote_ids:
        return 0
    ph = ",".join(["%s"] * len(promote_ids))
    # 正式口径：register_time 为 varchar unix 秒
    cur.execute(
        f"SELECT COUNT(*) AS c FROM `{db}`.tab_user WHERE promote_id IN ({ph}) "
        f"AND DATE(FROM_UNIXTIME(register_time))={day_sql}",
        (*promote_ids, *day_params),
    )
    n = int((cur.fetchone() or {}).get("c") or 0)
    if n:
        return n
    # 兼容误写成日期字符串的脏数据
    cur.execute(
        f"SELECT COUNT(*) AS c FROM `{db}`.tab_user WHERE promote_id IN ({ph}) "
        f"AND DATE(register_time)={day_sql}",
        (*promote_ids, *day_params),
    )
    return int((cur.fetchone() or {}).get("c") or 0)


def _scalar(cur, sql: str, params: tuple = ()) -> float | int | None:
    cur.execute(sql, params)
    row = cur.fetchone() or {}
    if not row:
        return None
    val = next(iter(row.values()))
    if val is None:
        return 0
    try:
        if isinstance(val, float):
            return float(val)
        return int(val)
    except (TypeError, ValueError):
        try:
            return float(val)
        except (TypeError, ValueError):
            return None


def query_db_stats(
    *,
    source_db: str = DEFAULT_SOURCE_DB,
    promote_ids: list[int] | None = None,
    sdk_business_account: str | None = None,
    promote_id: str | int | None = None,
    include_sub_channels: bool = False,
) -> dict:
    from smoke_db import _connect, load_db_config, resolve_database

    ctx = resolve_promote_context(
        source_db=source_db,
        promote_id=promote_id,
        sdk_business_account=sdk_business_account,
        include_sub_channels=include_sub_channels,
    )
    pids = [int(x) for x in (promote_ids or ctx.get("promoteIds") or []) if int(x) > 0]
    if not pids:
        return {"ok": False, "error": ctx.get("error") or "无 promote_ids", "context": ctx}

    db = resolve_database(source_db)
    # 造数挂靠 focus；卡片期望按是否包含下级取合集
    focus_pid = int(ctx.get("promoteId") or pids[0])
    stats_pids = [
        int(x)
        for x in (ctx.get("statsPromoteIds") or ctx.get("businessPromoteIds") or pids)
        if int(x) > 0
    ]
    if not stats_pids:
        stats_pids = [focus_pid]
    sph = ",".join(["%s"] * len(stats_pids))
    include_sub = bool(include_sub_channels)
    conn = _connect(load_db_config(), source_db=source_db)
    try:
        with conn.cursor() as cur:
            today = _count_reg_for_day(cur, db, stats_pids, "CURDATE()", ())
            yesterday = _count_reg_for_day(
                cur, db, stats_pids, "DATE_SUB(CURDATE(), INTERVAL 1 DAY)", ()
            )
            today_login_detail = _scalar(
                cur,
                "SELECT COUNT(DISTINCT user_id) AS c FROM `sw6`.tab_user_day_login "
                f"WHERE promote_id IN ({sph}) AND source_db=%s AND DATE(FROM_UNIXTIME(login_time))=CURDATE() "
                "AND login_time<2000000000",
                (*stats_pids, "lx"),
            )
            yesterday_login_detail = _scalar(
                cur,
                "SELECT COUNT(DISTINCT user_id) AS c FROM `sw6`.tab_user_day_login "
                f"WHERE promote_id IN ({sph}) AND source_db=%s "
                "AND DATE(FROM_UNIXTIME(login_time))=DATE_SUB(CURDATE(), INTERVAL 1 DAY) "
                "AND login_time<2000000000",
                (*stats_pids, "lx"),
            )
            # 工作台卡片同源：日汇总 active_cnt 对旗下渠道求和
            today_active_report = _scalar(
                cur,
                "SELECT COALESCE(SUM(active_cnt),0) AS c FROM `sw6`.tab_sw_report_day "
                f"WHERE promote_id IN ({sph}) AND source_db=%s AND DATE(stat_date)=CURDATE() AND dedup_mode=0",
                (*stats_pids, "lx"),
            )
            yesterday_active_report = _scalar(
                cur,
                "SELECT COALESCE(SUM(active_cnt),0) AS c FROM `sw6`.tab_sw_report_day "
                f"WHERE promote_id IN ({sph}) AND source_db=%s "
                "AND DATE(stat_date)=DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND dedup_mode=0",
                (*stats_pids, "lx"),
            )
            today_login = (
                today_active_report
                if today_active_report is not None
                else today_login_detail
            )
            yesterday_login = (
                yesterday_active_report
                if yesterday_active_report is not None
                else yesterday_login_detail
            )
            today_pay_detail = _scalar(
                cur,
                f"SELECT COALESCE(SUM(pay_amount),0) AS s FROM `{db}`.tab_spend "
                f"WHERE promote_id IN ({sph}) AND pay_status=1 AND DATE(FROM_UNIXTIME(pay_time))=CURDATE()",
                tuple(stats_pids),
            )
            yesterday_pay_detail = _scalar(
                cur,
                f"SELECT COALESCE(SUM(pay_amount),0) AS s FROM `{db}`.tab_spend "
                f"WHERE promote_id IN ({sph}) AND pay_status=1 "
                f"AND DATE(FROM_UNIXTIME(pay_time))=DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
                tuple(stats_pids),
            )
            # 工作台卡片同源：日汇总 total_pay 求和
            today_pay_report = _scalar(
                cur,
                "SELECT COALESCE(SUM(total_pay),0) AS c FROM `sw6`.tab_sw_report_day "
                f"WHERE promote_id IN ({sph}) AND source_db=%s AND DATE(stat_date)=CURDATE() AND dedup_mode=0",
                (*stats_pids, "lx"),
            )
            yesterday_pay_report = _scalar(
                cur,
                "SELECT COALESCE(SUM(total_pay),0) AS c FROM `sw6`.tab_sw_report_day "
                f"WHERE promote_id IN ({sph}) AND source_db=%s "
                "AND DATE(stat_date)=DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND dedup_mode=0",
                (*stats_pids, "lx"),
            )
            today_pay = today_pay_report if today_pay_report is not None else today_pay_detail
            yesterday_pay = (
                yesterday_pay_report if yesterday_pay_report is not None else yesterday_pay_detail
            )
            month_pay_detail = _scalar(
                cur,
                f"SELECT COALESCE(SUM(pay_amount),0) AS s FROM `{db}`.tab_spend "
                f"WHERE promote_id IN ({sph}) AND pay_status=1 "
                f"AND pay_time >= UNIX_TIMESTAMP(DATE_FORMAT(CURDATE(), '%%Y-%%m-01'))",
                tuple(stats_pids),
            )
            last_month_pay_detail = _scalar(
                cur,
                f"SELECT COALESCE(SUM(pay_amount),0) AS s FROM `{db}`.tab_spend "
                f"WHERE promote_id IN ({sph}) AND pay_status=1 "
                f"AND pay_time >= UNIX_TIMESTAMP(DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%%Y-%%m-01')) "
                f"AND pay_time < UNIX_TIMESTAMP(DATE_FORMAT(CURDATE(), '%%Y-%%m-01'))",
                tuple(stats_pids),
            )
            # 工作台「本月充值」：日汇总 total_pay 本月1号~今天求和
            month_pay_report = _scalar(
                cur,
                "SELECT COALESCE(SUM(total_pay),0) AS s FROM `sw6`.tab_sw_report_day "
                f"WHERE promote_id IN ({sph}) AND source_db=%s AND dedup_mode=0 "
                "AND DATE(stat_date)>=DATE_FORMAT(CURDATE(), '%%Y-%%m-01') "
                "AND DATE(stat_date)<=CURDATE()",
                (*stats_pids, "lx"),
            )
            last_month_pay_report = _scalar(
                cur,
                "SELECT COALESCE(SUM(total_pay),0) AS s FROM `sw6`.tab_sw_report_day "
                f"WHERE promote_id IN ({sph}) AND source_db=%s AND dedup_mode=0 "
                "AND DATE(stat_date)>=DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%%Y-%%m-01') "
                "AND DATE(stat_date)<DATE_FORMAT(CURDATE(), '%%Y-%%m-01')",
                (*stats_pids, "lx"),
            )
            # 较上月同期：上月1号~上月同日
            last_month_same_period = _scalar(
                cur,
                "SELECT COALESCE(SUM(total_pay),0) AS s FROM `sw6`.tab_sw_report_day "
                f"WHERE promote_id IN ({sph}) AND source_db=%s AND dedup_mode=0 "
                "AND DATE(stat_date)>=DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%%Y-%%m-01') "
                "AND DATE(stat_date)<=DATE_SUB(CURDATE(), INTERVAL 1 MONTH)",
                (*stats_pids, "lx"),
            )
            month_pay = month_pay_report if month_pay_report is not None else month_pay_detail
            last_month_pay = (
                last_month_pay_report if last_month_pay_report is not None else last_month_pay_detail
            )

            # 活跃渠道数：商务旗下「当日有注册或有充值」的 distinct promote 个数
            # 页「环比昨日」=(今-昨)/昨
            channel_pids = list(stats_pids)
            cph = ",".join(["%s"] * len(channel_pids))

            def _active_channels(day_expr: str) -> int:
                cur.execute(
                    f"SELECT COUNT(DISTINCT promote_id) AS c FROM `sw6`.tab_sw_report_day "
                    f"WHERE source_db=%s AND dedup_mode=0 AND DATE(stat_date)={day_expr} "
                    f"AND promote_id IN ({cph}) "
                    f"AND (COALESCE(new_register_cnt,0)>0 OR COALESCE(total_pay,0)>0 "
                    f"OR COALESCE(pay_cnt,0)>0)",
                    ("lx", *channel_pids),
                )
                n = int((cur.fetchone() or {}).get("c") or 0)
                if n:
                    return n
                cur.execute(
                    f"SELECT COUNT(DISTINCT promote_id) AS c FROM ("
                    f" SELECT promote_id FROM `{db}`.tab_user "
                    f" WHERE promote_id IN ({cph}) AND DATE(FROM_UNIXTIME(register_time))={day_expr} "
                    f" UNION "
                    f" SELECT promote_id FROM `{db}`.tab_spend "
                    f" WHERE promote_id IN ({cph}) AND pay_status=1 "
                    f" AND DATE(FROM_UNIXTIME(pay_time))={day_expr}"
                    f") t",
                    (*channel_pids, *channel_pids),
                )
                return int((cur.fetchone() or {}).get("c") or 0)

            today_active_channels = _active_channels("CURDATE()")
            yesterday_active_channels = _active_channels("DATE_SUB(CURDATE(), INTERVAL 1 DAY)")
            _tac = int(today_active_channels)
            _yac = int(yesterday_active_channels)
            if _yac > 0:
                active_channel_delta = round((_tac - _yac) / _yac, 4)
            else:
                active_channel_delta = 0.0 if _tac == 0 else None

            # 新增渠道数：按 create_time；默认仅一级，勾选含下级时统计全部 level
            biz_id = int(ctx.get("businessId") or 0)
            level_sql = "1=1" if include_sub else "promote_level=1"

            def _new_channels(day_expr: str) -> int:
                if biz_id > 0:
                    cur.execute(
                        f"SELECT COUNT(*) AS c FROM `{db}`.tab_promote "
                        f"WHERE busier_id=%s AND ({level_sql}) "
                        f"AND DATE(FROM_UNIXTIME(create_time))={day_expr}",
                        (biz_id,),
                    )
                    return int((cur.fetchone() or {}).get("c") or 0)
                cur.execute(
                    f"SELECT COUNT(*) AS c FROM `{db}`.tab_promote "
                    f"WHERE id IN ({sph}) AND ({level_sql}) "
                    f"AND DATE(FROM_UNIXTIME(create_time))={day_expr}",
                    tuple(stats_pids),
                )
                return int((cur.fetchone() or {}).get("c") or 0)

            today_new_channels = _new_channels("CURDATE()")
            yesterday_new_channels = _new_channels("DATE_SUB(CURDATE(), INTERVAL 1 DAY)")
            _tnc = int(today_new_channels)
            _ync = int(yesterday_new_channels)
            if _ync > 0:
                new_channel_delta = round((_tnc - _ync) / _ync, 4)
            else:
                new_channel_delta = 0.0 if _tnc == 0 else None

            full = load_full_strategy_file()
            top_steps = (full.get("steps") or {}).get("top10") if isinstance(full.get("steps"), dict) else []
            top_pids = [
                int(x.get("promoteId"))
                for x in (top_steps or [])
                if isinstance(x, dict) and x.get("promoteId")
            ]
            top_today_reg = None
            top_yesterday_reg = None
            top_today_pay = None
            top_channel_n = len(top_pids) or None
            if top_pids:
                tph = ",".join(["%s"] * len(top_pids))
                top_today_reg = _scalar(
                    cur,
                    f"SELECT COUNT(*) AS c FROM `{db}`.tab_user "
                    f"WHERE promote_id IN ({tph}) AND DATE(FROM_UNIXTIME(register_time))=CURDATE()",
                    tuple(top_pids),
                )
                top_yesterday_reg = _scalar(
                    cur,
                    f"SELECT COUNT(*) AS c FROM `{db}`.tab_user "
                    f"WHERE promote_id IN ({tph}) "
                    f"AND DATE(FROM_UNIXTIME(register_time))=DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
                    tuple(top_pids),
                )
                top_today_pay = _scalar(
                    cur,
                    f"SELECT COALESCE(SUM(pay_amount),0) AS s FROM `{db}`.tab_spend "
                    f"WHERE promote_id IN ({tph}) AND pay_status=1 "
                    f"AND DATE(FROM_UNIXTIME(pay_time))=CURDATE()",
                    tuple(top_pids),
                )

            sub = ((full.get("steps") or {}).get("subordinates") or {}) if isinstance(full.get("steps"), dict) else {}
            sub_pids = []
            for key in ("l2", "l3"):
                node = sub.get(key) if isinstance(sub.get(key), dict) else {}
                if node.get("promoteId"):
                    sub_pids.append(int(node["promoteId"]))
            sub_players = None
            if sub_pids:
                sph = ",".join(["%s"] * len(sub_pids))
                sub_players = _scalar(
                    cur,
                    f"SELECT COUNT(*) AS c FROM `{db}`.tab_user WHERE promote_id IN ({sph})",
                    tuple(sub_pids),
                )
    finally:
        conn.close()

    mom = None
    if yesterday > 0:
        mom = round((today - yesterday) / yesterday, 4)
    elif today == 0:
        mom = 0.0

    login_mom = None
    try:
        tl = int(today_login or 0)
        yl = int(yesterday_login or 0)
        if yl > 0:
            login_mom = round((tl - yl) / yl, 4)
        elif tl == 0:
            login_mom = 0.0
    except (TypeError, ValueError):
        login_mom = None

    pay_mom = None
    try:
        tp = float(today_pay or 0)
        yp = float(yesterday_pay or 0)
        if yp > 0:
            pay_mom = round((tp - yp) / yp, 4)
        elif tp == 0:
            pay_mom = 0.0
    except (TypeError, ValueError):
        pay_mom = None

    month_pay_mom = None
    try:
        mp = float(month_pay or 0)
        sp = float(last_month_same_period if last_month_same_period is not None else 0)
        # 页文案「较上月同期」：分母为0时页面常见展示 0.0%
        if sp > 0:
            month_pay_mom = round((mp - sp) / sp, 4)
        else:
            month_pay_mom = 0.0
    except (TypeError, ValueError):
        month_pay_mom = None

    return {
        "ok": True,
        "sourceDb": source_db,
        "database": db,
        "promoteIds": pids,
        "promoteId": focus_pid,
        "statsPromoteIds": stats_pids,
        "metricsScope": "business",
        "includeSubChannels": include_sub,
        "metricsScopeLabel": (
            f"商户旗下 {len(stats_pids)} 个渠道汇总（含 L2/L3）"
            if include_sub
            else f"商户旗下一级会长 {len(stats_pids)} 个汇总（已排除 L2/L3）"
        ),
        "context": ctx,
        "metrics": {
            "todayReg": today,
            "yesterdayReg": yesterday,
            "momRatio": mom,
            "momPercent": None if mom is None else round(mom * 100, 2),
            "todayLogin": today_login,
            "yesterdayLogin": yesterday_login,
            "todayLoginDetail": today_login_detail,
            "yesterdayLoginDetail": yesterday_login_detail,
            "todayActiveReport": today_active_report,
            "yesterdayActiveReport": yesterday_active_report,
            "loginMomRatio": login_mom,
            "loginMomPercent": None if login_mom is None else round(login_mom * 100, 2),
            "todayPay": today_pay,
            "yesterdayPay": yesterday_pay,
            "todayPayDetail": today_pay_detail,
            "yesterdayPayDetail": yesterday_pay_detail,
            "todayPayReport": today_pay_report,
            "yesterdayPayReport": yesterday_pay_report,
            "payMomRatio": pay_mom,
            "payMomPercent": None if pay_mom is None else round(pay_mom * 100, 2),
            "monthPay": month_pay,
            "lastMonthPay": last_month_pay,
            "monthPayDetail": month_pay_detail,
            "lastMonthPayDetail": last_month_pay_detail,
            "monthPayReport": month_pay_report,
            "lastMonthPayReport": last_month_pay_report,
            "lastMonthSamePeriodPay": last_month_same_period,
            "monthPayMomRatio": month_pay_mom,
            "monthPayMomPercent": None if month_pay_mom is None else round(month_pay_mom * 100, 2),
            "todayActiveChannels": today_active_channels,
            "yesterdayActiveChannels": yesterday_active_channels,
            "activeChannelDelta": active_channel_delta,
            "todayNewChannels": today_new_channels,
            "yesterdayNewChannels": yesterday_new_channels,
            "newChannelDelta": new_channel_delta,
            "topTodayReg": top_today_reg,
            "topYesterdayReg": top_yesterday_reg,
            "topTodayPay": top_today_pay,
            "topChannels": top_channel_n,
            "subPlayers": sub_players,
            "statsPromoteCount": len(stats_pids),
        },
        "expectedSeed": {
            "todayReg": TODAY_COUNT,
            "yesterdayReg": YESTERDAY_COUNT,
            "momRatio": -0.5,
            "momPercent": -50.0,
            "todayLogin": TODAY_COUNT,
            "yesterdayLogin": YESTERDAY_COUNT,
            "loginMomRatio": -0.5,
            "loginMomPercent": -50.0,
            "note": "造数仍挂一级会长；卡片期望已改为商户旗下全会长汇总（与 L3 页一致）",
        },
    }


def _patch_register_time(user_ids: list[str], *, source_db: str, when: datetime) -> dict:
    from smoke_db import _connect, load_db_config, resolve_database

    if not user_ids:
        return {"ok": True, "updated": 0}
    db = resolve_database(source_db)
    # tab_user.register_time 实测为 varchar(11)，存 unix 秒字符串
    unix_s = str(int(when.timestamp()))[:11]
    dt_str = when.strftime("%Y-%m-%d %H:%M:%S")
    ph = ",".join(["%s"] * len(user_ids))
    conn = _connect(load_db_config(), source_db=source_db)
    updated = 0
    mode = ""
    try:
        with conn.cursor() as cur:
            updated = int(
                cur.execute(
                    f"UPDATE `{db}`.tab_user SET register_time=%s WHERE id IN ({ph})",
                    (unix_s, *user_ids),
                )
                or 0
            )
            mode = "unix_varchar"
            if updated <= 0:
                updated = int(
                    cur.execute(
                        f"UPDATE `{db}`.tab_user SET register_time=%s WHERE user_id IN ({ph})",
                        (unix_s, *user_ids),
                    )
                    or 0
                )
                mode = "unix_varchar/user_id"
        conn.commit()
    finally:
        conn.close()
    return {"ok": updated > 0, "updated": updated, "mode": mode, "registerTime": dt_str, "unix": unix_s}


def _seed_idcard_db(user_id: str, real_name: str, idcard: str, *, source_db: str) -> dict:
    """第三方实名失败时，库写入身份证字段（对齐主流程兜底思路）。"""
    from smoke_db import _connect, load_db_config, resolve_database

    db = resolve_database(source_db)
    conn = _connect(load_db_config(), source_db=source_db)
    try:
        with conn.cursor() as cur:
            n = 0
            for sql, params in (
                (
                    f"UPDATE `{db}`.tab_user SET real_name=%s, idcard=%s WHERE id=%s",
                    (real_name, idcard, user_id),
                ),
                (
                    f"UPDATE `{db}`.tab_user SET real_name=%s, id_card=%s WHERE id=%s",
                    (real_name, idcard, user_id),
                ),
                (
                    f"UPDATE `{db}`.tab_user SET real_name=%s, idcard=%s WHERE user_id=%s",
                    (real_name, idcard, user_id),
                ),
            ):
                try:
                    n = int(cur.execute(sql, params) or 0)
                    if n:
                        conn.commit()
                        return {"ok": True, "updated": n, "via": "db"}
                except Exception as exc:
                    last_err = str(exc)
                    continue
            return {"ok": False, "error": locals().get("last_err") or "无法写入身份证字段"}
    finally:
        conn.close()


def _register_one(
    *,
    promote_id: int,
    source_db: str,
    profile: dict,
    game_id: str | None = None,
) -> dict:
    from game_sdk_api import sdk_idcard, sdk_register

    reg = sdk_register(
        promote_id=promote_id,
        game_id=game_id,
        source_db=source_db,
        account_prefix=PLAYER_PREFIX,
    )
    if not reg.get("ok") or not reg.get("token"):
        return {
            "ok": False,
            "stage": "register",
            "path": "F19-1/sdk_register",
            "error": reg.get("error") or "注册失败",
            "register": reg,
            "profile": profile,
        }
    uid = str(reg.get("userId") or "")
    idc = sdk_idcard(
        user_id=uid,
        token=str(reg.get("token") or ""),
        game_id=str(reg.get("gameId") or game_id or ""),
        promote_id=promote_id,
        real_name=profile.get("real_name"),
        idcard=profile.get("idcard"),
        source_db=source_db,
    )
    idc_note = ""
    if not idc.get("ok"):
        bypass = _seed_idcard_db(
            uid,
            str(profile.get("real_name") or ""),
            str(profile.get("idcard") or ""),
            source_db=source_db,
        )
        idc_note = "sdk_idcard 失败，已库写入跳过实名" if bypass.get("ok") else f"实名失败且库写失败: {bypass.get('error')}"
        if not bypass.get("ok"):
            return {
                "ok": False,
                "stage": "idcard",
                "path": "F19-2/sdk_idcard+db",
                "error": idc_note,
                "register": {"ok": True, "account": reg.get("account"), "userId": uid},
                "idcard": idc,
                "bypass": bypass,
                "profile": profile,
            }
        idc = {**idc, "ok": True, "bypass": bypass, "note": idc_note}

    return {
        "ok": True,
        "path": "F19-1 register + F19-2 idcard",
        "account": reg.get("account"),
        "userId": uid,
        "promoteId": promote_id,
        "profileTag": profile.get("tag"),
        "realName": profile.get("real_name"),
        "idcard": profile.get("idcard"),
        "register": {"ok": True},
        "idcardResult": {
            "ok": bool(idc.get("ok")),
            "error": idc.get("error"),
            "note": idc_note or idc.get("note"),
            "bypass": idc.get("bypass"),
        },
    }


def _profile_for_index(i: int, half: int, profiles: list[dict]) -> dict:
    # 前 half 用 A，其余用 B（half 建议 (n+1)//2，保证 10→5/5、20→10/10）
    return profiles[0] if i < half else profiles[1]


def _cleanup_prior_aiv(promote_id: int, *, source_db: str) -> dict:
    """把同渠道历史 aiv* 玩家 register_time 挪到 30 天前（unix varchar）。"""
    from smoke_db import _connect, load_db_config, resolve_database

    db = resolve_database(source_db)
    when = datetime.now() - timedelta(days=30)
    unix_s = str(int(when.timestamp()))[:11]
    conn = _connect(load_db_config(), source_db=source_db)
    updated = 0
    try:
        with conn.cursor() as cur:
            updated = int(
                cur.execute(
                    f"UPDATE `{db}`.tab_user SET register_time=%s "
                    f"WHERE promote_id=%s AND account LIKE %s",
                    (unix_s, promote_id, f"{PLAYER_PREFIX}%"),
                )
                or 0
            )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "updated": updated, "mode": "unix_varchar", "registerTime": unix_s}


def seed_players(
    *,
    source_db: str = DEFAULT_SOURCE_DB,
    promote_id: str | int | None = None,
    sdk_business_account: str | None = None,
    today_n: int = TODAY_COUNT,
    yesterday_n: int = YESTERDAY_COUNT,
    project_id: str = DEFAULT_PROJECT_ID,
    project_name: str = DEFAULT_PROJECT_NAME,
    l3_user: str | None = None,
    l3_pass: str | None = None,
) -> dict:
    defaults = _smoke_l3_defaults()
    ctx = resolve_promote_context(
        source_db=source_db,
        promote_id=promote_id,
        sdk_business_account=sdk_business_account or defaults["sdkBusinessAccount"],
    )
    if not ctx.get("ok"):
        return {"ok": False, "error": ctx.get("error"), "context": ctx}

    seed_pid = int(ctx["promoteId"])
    profiles = _load_id_profiles()
    game_id = None
    try:
        from game_sdk_api import load_game_sdk_config

        game_id = str(load_game_sdk_config().get("gameId") or "") or None
    except Exception:
        pass

    run_id = _uid("aivrun")
    logs: list[str] = []
    today_users: list[dict] = []
    yesterday_users: list[dict] = []
    logs.append(f"造数路径=渠道主流程 F19 同类（sdk_register + sdk_idcard），promoteId={seed_pid}")
    cleanup = _cleanup_prior_aiv(seed_pid, source_db=source_db)
    logs.append(f"清理历史 aiv* 今昨口径: {cleanup}")

    half_today = (today_n + 1) // 2
    for i in range(today_n):
        prof = _profile_for_index(i, half_today, profiles)
        one = _register_one(promote_id=seed_pid, source_db=source_db, profile=prof, game_id=game_id)
        today_users.append(one)
        logs.append(
            f"[今日 {i + 1}/{today_n}] {one.get('path')} tag={prof.get('tag')} "
            f"account={one.get('account')} ok={one.get('ok')} {one.get('error') or ''}"
        )
        if not one.get("ok"):
            return {
                "ok": False,
                "error": f"今日造数第 {i + 1} 个失败: {one.get('error')}",
                "runId": run_id,
                "context": ctx,
                "todayUsers": today_users,
                "logs": logs,
            }
        time.sleep(0.15)

    half_y = (yesterday_n + 1) // 2
    for i in range(yesterday_n):
        prof = _profile_for_index(i, half_y, profiles)
        one = _register_one(promote_id=seed_pid, source_db=source_db, profile=prof, game_id=game_id)
        yesterday_users.append(one)
        logs.append(
            f"[昨日样本注册 {i + 1}/{yesterday_n}] {one.get('path')} tag={prof.get('tag')} "
            f"account={one.get('account')} ok={one.get('ok')} {one.get('error') or ''}"
        )
        if not one.get("ok"):
            return {
                "ok": False,
                "error": f"昨日造数第 {i + 1} 个失败: {one.get('error')}",
                "runId": run_id,
                "context": ctx,
                "todayUsers": today_users,
                "yesterdayUsers": yesterday_users,
                "logs": logs,
            }
        time.sleep(0.15)

    y_ids = [str(u.get("userId")) for u in yesterday_users if u.get("userId")]
    yday = datetime.now() - timedelta(days=1)
    # 落在昨天中午，避免时区边界
    yday = yday.replace(hour=12, minute=0, second=0, microsecond=0)
    patch = _patch_register_time(y_ids, source_db=source_db, when=yday)
    logs.append(f"改昨日 register_time: {patch}")

    def _dist(users: list[dict]) -> dict:
        out = {"A": 0, "B": 0}
        for u in users:
            tag = str(u.get("profileTag") or "")
            if tag in out:
                out[tag] += 1
        return out

    stats = query_db_stats(
        source_db=source_db,
        promote_ids=ctx.get("promoteIds"),
        sdk_business_account=ctx.get("sdkBusinessAccount"),
        promote_id=seed_pid,
    )

    president = lookup_promote_account(seed_pid, source_db=source_db)
    today_acc = [u.get("account") for u in today_users if u.get("account")]
    yday_acc = [u.get("account") for u in yesterday_users if u.get("account")]
    verify_sqls = build_verify_sqls(
        promote_id=seed_pid,
        source_db=source_db,
        today_accounts=today_acc,
        yesterday_accounts=yday_acc,
    )

    run = {
        "id": run_id,
        "kind": "seed",
        "createdAt": _now(),
        "projectId": project_id or defaults["projectId"],
        "projectName": project_name or defaults["projectName"],
        "l3User": l3_user or defaults["l3User"],
        "l3Pass": l3_pass or defaults["l3Pass"],
        "sourceDb": source_db,
        "sdkBusinessAccount": ctx.get("sdkBusinessAccount") or defaults["sdkBusinessAccount"],
        "presidentAccount": president.get("account") or "",
        "promoteId": seed_pid,
        "promoteIds": ctx.get("promoteIds"),
        "context": ctx,
        "todayCount": len(today_users),
        "yesterdayCount": len(yesterday_users),
        "todayDist": _dist(today_users),
        "yesterdayDist": _dist(yesterday_users),
        "todayUserIds": [u.get("userId") for u in today_users],
        "yesterdayUserIds": y_ids,
        "todayAccounts": today_acc,
        "yesterdayAccounts": yday_acc,
        "todayUsers": [
            {k: u.get(k) for k in ("account", "userId", "profileTag", "realName", "idcard", "ok")}
            for u in today_users
        ],
        "yesterdayUsers": [
            {k: u.get(k) for k in ("account", "userId", "profileTag", "realName", "idcard", "ok")}
            for u in yesterday_users
        ],
        "registerTimePatch": patch,
        "priorCleanup": cleanup,
        "dbStats": stats.get("metrics"),
        "verifySqls": verify_sqls,
        "logs": logs[-80:],
        "ok": bool(patch.get("ok")) and bool(stats.get("ok")),
    }
    run["dossier"] = build_seed_dossier(run, source_db=source_db)

    state = load_state()
    runs = state.get("runs") if isinstance(state.get("runs"), list) else []
    runs.insert(0, run)
    state["runs"] = runs[:40]
    state["defaults"] = {
        "l3User": run["l3User"],
        "l3Pass": run["l3Pass"],
        "sourceDb": source_db,
        "sdkBusinessAccount": run["sdkBusinessAccount"],
        "promoteId": seed_pid,
        "presidentAccount": run["presidentAccount"],
        "baseUrl": defaults["baseUrl"],
    }
    state["lastSeedRunId"] = run_id
    state["latestDossier"] = run["dossier"]
    save_state(state)

    return {"ok": run["ok"], "run": run, "dbStats": stats, "logs": logs, "dossier": run["dossier"]}


def get_state(project_id: str | None = None) -> dict:
    defaults = _smoke_l3_defaults()
    state = load_state()
    saved = state.get("defaults") if isinstance(state.get("defaults"), dict) else {}
    runs = state.get("runs") if isinstance(state.get("runs"), list) else []
    if project_id:
        runs = [r for r in runs if not r.get("projectId") or r.get("projectId") == project_id]
    ctx = resolve_promote_context(
        source_db=str(saved.get("sourceDb") or defaults["sourceDb"]),
        promote_id=saved.get("promoteId"),
        sdk_business_account=str(saved.get("sdkBusinessAccount") or defaults["sdkBusinessAccount"]),
    )
    seed = latest_seed_run(project_id)
    # 若历史 seed 缺账号列表，用落盘 _wb / 当前 promote 补 dossier
    dossier = None
    if seed:
        dossier = build_seed_dossier(seed)
    elif isinstance(state.get("latestDossier"), dict):
        dossier = state["latestDossier"]
    else:
        # 兜底：用当前 promote + 结果文件账号
        fallback = {
            "promoteId": saved.get("promoteId") or ctx.get("promoteId"),
            "sdkBusinessAccount": saved.get("sdkBusinessAccount") or defaults["sdkBusinessAccount"],
            "sourceDb": saved.get("sourceDb") or defaults["sourceDb"],
            "l3User": saved.get("l3User") or defaults["l3User"],
        }
        try:
            wb = DATA_DIR / "_wb_seed_reg_result.json"
            if wb.exists():
                extra = json.loads(wb.read_text(encoding="utf-8"))
                fallback["todayAccounts"] = extra.get("todayAccounts") or []
                fallback["yesterdayAccounts"] = extra.get("yesterdayAccounts") or []
                fallback["promoteId"] = extra.get("promoteId") or fallback["promoteId"]
                fallback["dbStats"] = extra.get("metricsUnix")
        except Exception:
            pass
        dossier = build_seed_dossier(fallback)

    dossier = enrich_dossier_with_full_strategy(dossier)
    # 刷新落盘，便于前端直接吃到全量清单
    try:
        state["latestDossier"] = dossier
        save_state(state)
    except Exception:
        pass

    return {
        "ok": True,
        "projectId": project_id or defaults["projectId"],
        "projectName": defaults["projectName"],
        "defaults": {
            "l3User": saved.get("l3User") or defaults["l3User"],
            "l3Pass": saved.get("l3Pass") or defaults["l3Pass"],
            "sourceDb": saved.get("sourceDb") or defaults["sourceDb"],
            "platform": "lx",
            "platformLabel": "龙翔",
            "baseUrl": saved.get("baseUrl") or defaults["baseUrl"],
            "sdkBusinessAccount": saved.get("sdkBusinessAccount") or defaults["sdkBusinessAccount"],
            "presidentAccount": (dossier or {}).get("presidentAccount")
            or saved.get("presidentAccount")
            or "",
            "promoteId": saved.get("promoteId") or ctx.get("promoteId"),
            "todayCount": TODAY_COUNT,
            "yesterdayCount": YESTERDAY_COUNT,
            "expectedMomPercent": -50.0,
        },
        "promoteContext": ctx,
        "dossier": dossier,
        "latestSeed": seed,
        "idProfiles": _load_id_profiles(),
        "runs": runs[:30],
        "lastSeedRunId": state.get("lastSeedRunId"),
        "bizFlowPath": "/# 工作台 → 渠道主流程（biz-flow）",
    }


def list_runs(limit: int = 30, project_id: str | None = None) -> list:
    state = load_state()
    runs = state.get("runs") if isinstance(state.get("runs"), list) else []
    if project_id:
        runs = [r for r in runs if not r.get("projectId") or r.get("projectId") == project_id]
    return runs[: max(1, min(int(limit or 30), 80))]


def _parse_metrics_from_text(body: str) -> dict:
    text = re.sub(r"[ \t]+", " ", str(body or ""))

    def _first_num(*patterns: str):
        for pat in patterns:
            m = re.search(pat, text)
            if not m:
                continue
            raw = m.group(1).replace(",", "")
            try:
                if "." in raw:
                    return float(raw)
                return int(raw)
            except ValueError:
                continue
        return None

    today = _first_num(
        r"今日渠道玩家注册\s*[：:]?\s*([\d,]+)",
        r"今日渠道玩家注册[\s\S]{0,40}?(\d[\d,]*)",
    )
    yesterday = _first_num(
        r"昨日渠道玩家注册\s*[：:]?\s*([\d,]+)",
        r"昨日渠道玩家注册[\s\S]{0,40}?(\d[\d,]*)",
    )
    today_login = _first_num(
        r"今日渠道活跃玩家\s*[：:]?\s*([\d,]+)",
        r"今日渠道玩家登录\s*[：:]?\s*([\d,]+)",
        r"今日(?:渠道)?(?:活跃)?(?:玩家)?(?:登录)?\s*[：:]?\s*([\d,]+)",
    )
    yesterday_login = _first_num(
        r"昨日渠道活跃玩家\s*[：:]?\s*([\d,]+)",
        r"昨日渠道玩家登录\s*[：:]?\s*([\d,]+)",
        r"昨日(?:渠道)?(?:活跃)?(?:玩家)?(?:登录)?\s*[：:]?\s*([\d,]+)",
    )
    login_mom = None
    m_login_mom = re.search(
        r"今日渠道活跃玩家[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)",
        text,
    )
    if not m_login_mom:
        m_login_mom = re.search(
            r"今日渠道玩家登录[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)",
            text,
        )
    if not m_login_mom:
        m_login_mom = re.search(
            r"今日(?:渠道)?(?:活跃|登录)[\s\S]{0,60}?(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)",
            text,
        )
    if m_login_mom:
        raw = m_login_mom.group(1).strip()
        num = re.sub(r"[^\d.\-+]", "", raw)
        try:
            val = float(num)
            login_mom = val / 100.0 if ("%" in raw or abs(val) > 1.5) else val
        except ValueError:
            login_mom = None

    today_pay = _first_num(
        r"今日(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
        r"今日充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
    )
    yesterday_pay = _first_num(
        r"昨日(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
        r"昨日充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
    )
    month_pay = _first_num(
        r"本月(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
        r"本月充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
    )
    last_month_pay = _first_num(
        r"上月(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
        r"上月充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)",
    )
    month_pay_mom = None
    m_month_mom = re.search(
        r"本月充值金额[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:较上月同期|环比上月|较上月)",
        text,
    )
    if not m_month_mom:
        m_month_mom = re.search(
            r"本月(?:渠道玩家)?充值(?:金额)?[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:较上月同期|环比上月|较上月)",
            text,
        )
    if not m_month_mom:
        m_month_mom = re.search(
            r"本月(?:渠道玩家)?充值(?:金额)?[\s\S]{0,60}?(?:较上月同期|环比上月|较上月)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)",
            text,
        )
    if m_month_mom:
        raw = m_month_mom.group(1).strip()
        num = re.sub(r"[^\d.\-+]", "", raw)
        try:
            val = float(num)
            month_pay_mom = val / 100.0 if ("%" in raw or abs(val) > 1.5) else val
        except ValueError:
            month_pay_mom = None
    pay_mom = None
    m_pay_mom = re.search(
        r"今日充值金额[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)",
        text,
    )
    if not m_pay_mom:
        m_pay_mom = re.search(
            r"今日(?:渠道玩家)?充值(?:金额)?[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)",
            text,
        )
    if not m_pay_mom:
        m_pay_mom = re.search(
            r"今日(?:渠道玩家)?充值(?:金额)?[\s\S]{0,60}?(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)",
            text,
        )
    if m_pay_mom:
        raw = m_pay_mom.group(1).strip()
        num = re.sub(r"[^\d.\-+]", "", raw)
        try:
            val = float(num)
            pay_mom = val / 100.0 if ("%" in raw or abs(val) > 1.5) else val
        except ValueError:
            pay_mom = None

    today_active_channels = _first_num(
        r"活跃渠道数\s*[：:]?\s*([\d,]+)",
        r"今日活跃渠道(?:数)?\s*[：:]?\s*([\d,]+)",
    )
    active_channel_delta = None
    m_ac_delta = re.search(
        r"活跃渠道数[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比昨日|较昨日|环比|较昨)",
        text,
    )
    if not m_ac_delta:
        m_ac_delta = re.search(
            r"活跃渠道数[\s\S]{0,80}?(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)",
            text,
        )
    if m_ac_delta:
        raw = m_ac_delta.group(1).strip()
        num = re.sub(r"[^\d.\-+]", "", raw)
        try:
            val = float(num)
            active_channel_delta = val / 100.0 if ("%" in raw or abs(val) > 1.5) else val
        except ValueError:
            active_channel_delta = None

    today_new_channels = _first_num(
        r"新增渠道数\s*[：:]?\s*([\d,]+)",
        r"今日新增渠道(?:数)?\s*[：:]?\s*([\d,]+)",
    )
    new_channel_delta = None
    m_nc_delta = re.search(
        r"新增渠道数[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比昨日|较昨日|环比|较昨)",
        text,
    )
    if not m_nc_delta:
        m_nc_delta = re.search(
            r"新增渠道数[\s\S]{0,80}?(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)",
            text,
        )
    if m_nc_delta:
        raw = m_nc_delta.group(1).strip()
        num = re.sub(r"[^\d.\-+]", "", raw)
        try:
            val = float(num)
            new_channel_delta = val / 100.0 if ("%" in raw or abs(val) > 1.5) else val
        except ValueError:
            new_channel_delta = None

    mom = None
    mom_raw = ""
    m2 = re.search(r"(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)", text)
    if not m2:
        m2 = re.search(r"([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比昨日|较昨日)", text)
    if not m2:
        m2 = re.search(r"(?:环比|较昨)[^\n%]{0,12}([+\-]?\d+(?:\.\d+)?\s*%)", text)
    if not m2:
        m2 = re.search(r"今日渠道玩家注册[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)", text)
    if m2:
        mom_raw = m2.group(1).strip()
        num = re.sub(r"[^\d.\-+]", "", mom_raw)
        try:
            val = float(num)
            if "%" in mom_raw or abs(val) > 1.5:
                mom = val / 100.0
            else:
                mom = val
        except ValueError:
            mom = None

    return {
        "todayReg": today,
        "yesterdayReg": yesterday,
        "momRatio": mom,
        "momRaw": mom_raw,
        "todayLogin": today_login,
        "yesterdayLogin": yesterday_login,
        "loginMomRatio": login_mom,
        "todayPay": today_pay,
        "yesterdayPay": yesterday_pay,
        "payMomRatio": pay_mom,
        "monthPay": month_pay,
        "lastMonthPay": last_month_pay,
        "monthPayMomRatio": month_pay_mom,
        "todayActiveChannels": today_active_channels,
        "activeChannelDelta": active_channel_delta,
        "todayNewChannels": today_new_channels,
        "newChannelDelta": new_channel_delta,
        "snippetOk": today is not None,
    }


COMPARE_METRIC_DEFS = [
    {
        "key": "todayReg",
        "name": "今日渠道玩家注册",
        "sqlKey": "todayRegCount",
        "format": "number",
        "pageKey": "todayReg",
        "group": "reg",
        "groupTitle": "① 工作台卡片：今日渠道玩家注册",
        "groupHint": "三合一：主值=今日注册；副文案=环比昨日。期望=商户旗下全会长汇总",
        "note": "库=账号数；卡片主数字",
    },
    {
        "key": "yesterdayReg",
        "name": "昨日渠道玩家注册",
        "sqlKey": "yesterdayRegCount",
        "format": "number",
        "pageKey": "yesterdayReg",
        "group": "reg",
        "groupTitle": "① 工作台卡片：今日渠道玩家注册",
        "groupHint": "三合一：主值=今日注册；副文案=环比昨日。期望=商户旗下全会长汇总",
        "note": "卡片通常不单独展示，用于算环比",
    },
    {
        "key": "momRatio",
        "name": "环比昨日（注册）",
        "sqlKey": "momHint",
        "format": "percent",
        "pageKey": "momRatio",
        "group": "reg",
        "groupTitle": "① 工作台卡片：今日渠道玩家注册",
        "groupHint": "三合一：主值=今日注册；副文案=环比昨日。期望=商户旗下全会长汇总",
        "note": "页上「较昨日」；与主数字同属一张卡",
    },
    {
        "key": "todayLogin",
        "name": "今日渠道活跃玩家",
        "sqlKey": "todayLogin",
        "format": "number",
        "pageKey": "todayLogin",
        "group": "login",
        "groupTitle": "② 工作台卡片：今日渠道活跃玩家",
        "groupHint": "三合一：主值=今日活跃；副文案=较昨日。期望=商户旗下全会长 active_cnt 求和",
        "note": "库=会长 promote 下去重登录；页61多为造数前缓存",
    },
    {
        "key": "yesterdayLogin",
        "name": "昨日渠道活跃玩家",
        "sqlKey": "yesterdayLogin",
        "format": "number",
        "pageKey": "yesterdayLogin",
        "group": "login",
        "groupTitle": "② 工作台卡片：今日渠道活跃玩家",
        "groupHint": "三合一：主值=今日活跃；副文案=较昨日。期望=商户旗下全会长 active_cnt 求和",
        "note": "页上通常不单独展示",
    },
    {
        "key": "loginMomRatio",
        "name": "环比昨日（活跃）",
        "sqlKey": "loginMomHint",
        "format": "percent",
        "pageKey": "loginMomRatio",
        "group": "login",
        "groupTitle": "② 工作台卡片：今日渠道活跃玩家",
        "groupHint": "三合一：主值=今日活跃；副文案=较昨日。期望=商户旗下全会长 active_cnt 求和",
        "note": "页「较昨日」；(61-21)/21=+190.5% 为旧数",
    },
    {
        "key": "todayPay",
        "name": "今日渠道玩家充值金额",
        "sqlKey": "todayPay",
        "format": "number",
        "pageKey": "todayPay",
        "group": "pay",
        "groupTitle": "③ 工作台卡片：今日充值金额",
        "groupHint": "三合一：主值=今日充值；副文案=较昨日。期望=商户旗下全会长 total_pay 求和",
        "note": "卡片主数字（¥）；期望优先读汇总 total_pay",
    },
    {
        "key": "yesterdayPay",
        "name": "昨日渠道玩家充值金额",
        "sqlKey": "yesterdayPay",
        "format": "number",
        "pageKey": "yesterdayPay",
        "group": "pay",
        "groupTitle": "③ 工作台卡片：今日充值金额",
        "groupHint": "三合一：主值=今日充值；副文案=较昨日。期望=商户旗下全会长 total_pay 求和",
        "note": "页上通常不单独展示；用于算环比",
    },
    {
        "key": "payMomRatio",
        "name": "环比昨日（充值）",
        "sqlKey": "payMomHint",
        "format": "percent",
        "pageKey": "payMomRatio",
        "group": "pay",
        "groupTitle": "③ 工作台卡片：今日充值金额",
        "groupHint": "三合一：主值=今日充值；副文案=较昨日。期望=商户旗下全会长 total_pay 求和",
        "note": "页上「较昨日」；(2090-2650)/2650≈-21.1%",
    },
    {
        "key": "monthPay",
        "name": "本月充值金额",
        "sqlKey": "monthPay",
        "format": "number",
        "pageKey": "monthPay",
        "group": "monthPay",
        "groupTitle": "④ 工作台卡片：本月充值金额",
        "groupHint": "三合一：主值=本月1号~今天；副文案=较上月同期。期望=商户旗下全会长日汇总求和",
        "note": "卡片主数字（¥）；汇总 Aug1~今天，非 spend 直加",
    },
    {
        "key": "lastMonthPay",
        "name": "上月充值金额",
        "sqlKey": "lastMonthPay",
        "format": "number",
        "pageKey": "lastMonthPay",
        "group": "monthPay",
        "groupTitle": "④ 工作台卡片：本月充值金额",
        "groupHint": "三合一：主值=本月1号~今天；副文案=较上月同期。期望=商户旗下全会长日汇总求和",
        "note": "上月整月（至上月末）；页上通常不单独展示",
    },
    {
        "key": "monthPayMomRatio",
        "name": "环比上月（较上月同期）",
        "sqlKey": "monthPayMomHint",
        "format": "percent",
        "pageKey": "monthPayMomRatio",
        "group": "monthPay",
        "groupTitle": "④ 工作台卡片：本月充值金额",
        "groupHint": "三合一：主值=本月1号~今天；副文案=较上月同期。期望=商户旗下全会长日汇总求和",
        "note": "页「较上月同期」；上月同期=0 时常显示 0.0%",
    },
    {
        "key": "todayActiveChannels",
        "name": "今日活跃渠道数",
        "sqlKey": "todayActiveChannels",
        "format": "number",
        "pageKey": "todayActiveChannels",
        "group": "activeChannel",
        "groupTitle": "⑤ 工作台卡片：活跃渠道数",
        "groupHint": "三合一：主值=今日活跃渠道；副文案=环比昨日%。同会长多笔注册/充值只计1",
        "note": "旗下渠道当日有注册或充值则+1",
    },
    {
        "key": "yesterdayActiveChannels",
        "name": "昨日活跃渠道数",
        "sqlKey": "yesterdayActiveChannels",
        "format": "number",
        "pageKey": "yesterdayActiveChannels",
        "group": "activeChannel",
        "groupTitle": "⑤ 工作台卡片：活跃渠道数",
        "groupHint": "三合一：主值=今日活跃渠道；副文案=环比昨日%。同会长多笔注册/充值只计1",
        "note": "页上通常不单独展示；用于算环比",
    },
    {
        "key": "activeChannelDelta",
        "name": "环比昨日（活跃渠道）",
        "sqlKey": "activeChannelDeltaHint",
        "format": "percent",
        "pageKey": "activeChannelDelta",
        "group": "activeChannel",
        "groupTitle": "⑤ 工作台卡片：活跃渠道数",
        "groupHint": "三合一：主值=今日活跃渠道；副文案=环比昨日%。同会长多笔注册/充值只计1",
        "note": "页「环比昨日」=(今−昨)/昨；造数昨2今4→+100%（差值会是+2）",
    },
    {
        "key": "todayNewChannels",
        "name": "今日新增渠道数",
        "sqlKey": "todayNewChannels",
        "format": "number",
        "pageKey": "todayNewChannels",
        "group": "newChannel",
        "groupTitle": "⑥ 工作台卡片：新增渠道数",
        "groupHint": "三合一：主值=今日新增；副文案=环比昨日%。造数昨2今4→+100%",
        "note": "busier_id 下一创建日=今天的一级渠道数",
    },
    {
        "key": "yesterdayNewChannels",
        "name": "昨日新增渠道数",
        "sqlKey": "yesterdayNewChannels",
        "format": "number",
        "pageKey": "yesterdayNewChannels",
        "group": "newChannel",
        "groupTitle": "⑥ 工作台卡片：新增渠道数",
        "groupHint": "三合一：主值=今日新增；副文案=环比昨日%。造数昨2今4→+100%",
        "note": "页上通常不单独展示；create_time 改到昨天后计入",
    },
    {
        "key": "newChannelDelta",
        "name": "环比昨日（新增渠道）",
        "sqlKey": "newChannelDeltaHint",
        "format": "percent",
        "pageKey": "newChannelDelta",
        "group": "newChannel",
        "groupTitle": "⑥ 工作台卡片：新增渠道数",
        "groupHint": "三合一：主值=今日新增；副文案=环比昨日%。造数昨2今4→+100%",
        "note": "页「环比昨日」=(今−昨)/昨；差值会是+2，对得上才是环比",
    },
    {
        "key": "topTodayReg",
        "name": "渠道注册 TOP（今日合计）",
        "sqlKey": "topTodayReg",
        "format": "number",
        "pageKey": "topTodayReg",
        "group": "other",
        "groupTitle": "其它指标（后续逐组对齐）",
        "groupHint": "",
        "note": "wb_top_* 今日注册合计；页侧可对 TOP 榜人工填",
    },
    {
        "key": "topYesterdayReg",
        "name": "渠道注册 TOP（昨日合计）",
        "sqlKey": "topYesterdayReg",
        "format": "number",
        "pageKey": "topYesterdayReg",
        "group": "other",
        "groupTitle": "其它指标（后续逐组对齐）",
        "groupHint": "",
        "note": "wb_top_* 昨日注册合计",
    },
    {
        "key": "topTodayPay",
        "name": "渠道充值 TOP（今日合计）",
        "sqlKey": "topTodayPay",
        "format": "number",
        "pageKey": "topTodayPay",
        "group": "other",
        "groupTitle": "其它指标（后续逐组对齐）",
        "groupHint": "",
        "note": "wb_top_* 今日充值合计",
    },
    {
        "key": "topChannels",
        "name": "TOP 渠道数",
        "sqlKey": "topChannels",
        "format": "number",
        "pageKey": "topChannels",
        "group": "other",
        "groupTitle": "其它指标（后续逐组对齐）",
        "groupHint": "",
        "note": "清单渠道个数（期望约 11）",
    },
    {
        "key": "subPlayers",
        "name": "下级 L2/L3 玩家数",
        "sqlKey": "subPlayers",
        "format": "number",
        "pageKey": "subPlayers",
        "group": "other",
        "groupTitle": "其它指标（后续逐组对齐）",
        "groupHint": "",
        "note": "下级渠道挂靠玩家总数",
    },
]


def build_compare_rows(db_metrics: dict | None, page_metrics: dict | None = None) -> list[dict]:
    db_m = db_metrics if isinstance(db_metrics, dict) else {}
    page_m = page_metrics if isinstance(page_metrics, dict) else {}

    def _row(name: str, expected, page_val, *, format_hint: str = "number", note: str = "", key: str = "", sql_key: str = "", group: str = "other", group_title: str = "", group_hint: str = "") -> dict:
        status = "pending"
        if expected is None and page_val is None:
            status = "pending"
        elif page_val is None:
            status = "page_missing"
        elif expected is None:
            status = "db_only"
        else:
            try:
                a = float(expected)
                b = float(page_val)
                if format_hint == "percent":
                    if abs(a) > 1.5:
                        a /= 100.0
                    if abs(b) > 1.5:
                        b /= 100.0
                    tol = 0.005
                else:
                    tol = 0.01 if format_hint == "number" and (abs(a) >= 1 or abs(b) >= 1) else 0.01
                status = "ok" if abs(a - b) <= tol else "mismatch"
            except (TypeError, ValueError):
                status = "mismatch"
        return {
            "key": key,
            "sqlKey": sql_key,
            "name": name,
            "expected": expected,
            "page": page_val,
            "status": status,
            "format": format_hint,
            "note": note,
            "group": group,
            "groupTitle": group_title,
            "groupHint": group_hint,
        }

    rows = []
    for d in COMPARE_METRIC_DEFS:
        rows.append(
            _row(
                d["name"],
                db_m.get(d["key"]),
                page_m.get(d["pageKey"]),
                format_hint=d["format"],
                note=d["note"],
                key=d["key"],
                sql_key=d["sqlKey"],
                group=d.get("group") or "other",
                group_title=d.get("groupTitle") or "",
                group_hint=d.get("groupHint") or "",
            )
        )
    return rows


def scrape_l3_workbench(
    *,
    l3_user: str,
    l3_pass: str,
    base_url: str = DEFAULT_BASE_URL,
    headed: bool = False,
    timeout_sec: int = 90,
) -> dict:
    """用 Playwright 登录 L3 工作台抓取指标文案（轻量 node 脚本，避免 test runner 挂起）。"""
    out_dir = DATA_DIR / "ai_assist_runtime"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"compare_{uuid.uuid4().hex[:8]}.json"
    scrape_js = AGILE_SIM_DIR / "tests" / "business-automation" / "ai_assist_scrape.mjs"
    if not scrape_js.is_file():
        return {"ok": False, "error": f"缺少抓取脚本: {scrape_js}"}

    env = os.environ.copy()
    env["SMOKE_BASE_URL"] = base_url
    env["PLAYWRIGHT_BASE_URL"] = base_url
    env["AI_ASSIST_L3_USER"] = l3_user
    env["AI_ASSIST_L3_PASS"] = l3_pass
    env["AI_ASSIST_OUT"] = str(out_file.resolve())
    if headed:
        env["AI_ASSIST_HEADED"] = "1"
    else:
        env.pop("AI_ASSIST_HEADED", None)

    node = "node.exe" if sys.platform == "win32" else "node"
    cmd = [node, str(scrape_js.resolve())]

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(AGILE_SIM_DIR.resolve()),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(45, int(timeout_sec)),
        )
    except subprocess.TimeoutExpired:
        scraped = {}
        if out_file.exists():
            try:
                scraped = json.loads(out_file.read_text(encoding="utf-8"))
            except Exception:
                scraped = {}
        return {
            "ok": bool(scraped.get("ok")),
            "page": scraped,
            "error": f"Playwright 超时（>{timeout_sec}s）",
            "outFile": str(out_file),
        }
    except FileNotFoundError:
        return {"ok": False, "error": "未找到 node，请确认 Node.js 已安装"}

    scraped = {}
    if out_file.exists():
        try:
            scraped = json.loads(out_file.read_text(encoding="utf-8"))
        except Exception as exc:
            scraped = {"ok": False, "error": f"读结果失败: {exc}"}

    ok = bool(scraped.get("ok")) and proc.returncode == 0
    return {
        "ok": ok,
        "page": scraped,
        "exitCode": proc.returncode,
        "stdoutTail": (proc.stdout or "")[-1200:],
        "stderrTail": (proc.stderr or "")[-800:],
        "outFile": str(out_file),
        "error": None if ok else (scraped.get("error") or f"exit={proc.returncode}"),
    }


def seed_login_group(
    *,
    source_db: str = DEFAULT_SOURCE_DB,
    promote_id: str | int | None = None,
    sdk_business_account: str | None = None,
    today_n: int = TODAY_COUNT,
    yesterday_n: int = YESTERDAY_COUNT,
) -> dict:
    """第二组造数：今 N 人登录（今日）、昨 M 人登录（login_time 改昨日）。

    优先用一级会长下「今日注册 / 昨日注册」的 aiv* 玩家；不足则用该会长下任意玩家补齐。
    """
    from smoke_db import _connect, load_db_config, resolve_database

    defaults = _smoke_l3_defaults()
    ctx = resolve_promote_context(
        source_db=source_db,
        promote_id=promote_id,
        sdk_business_account=sdk_business_account or defaults["sdkBusinessAccount"],
    )
    if not ctx.get("ok"):
        return {"ok": False, "error": ctx.get("error"), "context": ctx}
    pid = int(ctx["promoteId"])
    db = resolve_database(source_db)
    game_id = 659
    try:
        from game_sdk_api import load_game_sdk_config

        game_id = int(load_game_sdk_config().get("gameId") or game_id)
    except Exception:
        pass

    now_ts = int(time.time())
    yday = datetime.now() - timedelta(days=1)
    yday = yday.replace(hour=12, minute=0, second=0, microsecond=0)
    yday_ts = int(yday.timestamp())

    conn = _connect(load_db_config(), source_db=source_db)
    try:
        with conn.cursor() as cur:

            def _pick(day_sql: str, n: int) -> list[dict]:
                cur.execute(
                    f"""
                    SELECT id, account FROM `{db}`.tab_user
                    WHERE promote_id=%s AND DATE(FROM_UNIXTIME(register_time))={day_sql}
                      AND account LIKE 'aiv%%'
                    ORDER BY id
                    LIMIT %s
                    """,
                    (pid, n),
                )
                rows = list(cur.fetchall() or [])
                if len(rows) >= n:
                    return rows
                cur.execute(
                    f"""
                    SELECT id, account FROM `{db}`.tab_user
                    WHERE promote_id=%s
                    ORDER BY id DESC
                    LIMIT %s
                    """,
                    (pid, n),
                )
                return list(cur.fetchall() or [])[:n]

            today_users = _pick("CURDATE()", int(today_n))
            yday_users = _pick("DATE_SUB(CURDATE(), INTERVAL 1 DAY)", int(yesterday_n))

            # 清掉该会长今/昨全部登录，避免脏数据把卡片拉成 61/21
            for day_expr in ("CURDATE()", "DATE_SUB(CURDATE(), INTERVAL 1 DAY)"):
                try:
                    cur.execute(
                        f"DELETE FROM `{db}`.tab_user_day_login WHERE promote_id=%s "
                        f"AND DATE(FROM_UNIXTIME(login_time))={day_expr}",
                        (pid,),
                    )
                except Exception:
                    cur.execute(
                        f"DELETE FROM `{db}`.tab_user_day_login WHERE promote_id=%s "
                        f"AND DATE(login_time)={day_expr}",
                        (pid,),
                    )

            def _upsert_login(uid, ts: int) -> None:
                uid_s = str(uid)
                try:
                    cur.execute(
                        f"DELETE FROM `{db}`.tab_user_day_login WHERE user_id=%s AND promote_id=%s "
                        f"AND DATE(FROM_UNIXTIME(login_time))=DATE(FROM_UNIXTIME(%s))",
                        (uid_s, pid, ts),
                    )
                except Exception:
                    cur.execute(
                        f"DELETE FROM `{db}`.tab_user_day_login WHERE user_id=%s AND promote_id=%s "
                        f"AND DATE(login_time)=DATE(FROM_UNIXTIME(%s))",
                        (uid_s, pid, ts),
                    )
                try:
                    cur.execute(
                        f"INSERT INTO `{db}`.tab_user_day_login (user_id, promote_id, login_time, game_id) "
                        f"VALUES (%s,%s,%s,%s)",
                        (uid_s, pid, ts, game_id),
                    )
                except Exception:
                    cur.execute(
                        f"INSERT INTO `{db}`.tab_user_day_login "
                        f"(login_record_id, user_id, promote_id, game_id, is_new, equipment_num, sdk_version, login_time) "
                        f"VALUES (0,%s,%s,%s,0,'',0,%s)",
                        (uid_s, pid, game_id, ts),
                    )

            for u in today_users:
                _upsert_login(u.get("id"), now_ts)
            for u in yday_users:
                _upsert_login(u.get("id"), yday_ts)
            conn.commit()
    finally:
        conn.close()

    stats = query_db_stats(
        source_db=source_db,
        promote_id=pid,
        sdk_business_account=ctx.get("sdkBusinessAccount"),
    )
    return {
        "ok": bool(stats.get("ok")),
        "promoteId": pid,
        "todayAccounts": [str(u.get("account") or "") for u in today_users],
        "yesterdayAccounts": [str(u.get("account") or "") for u in yday_users],
        "todayCount": len(today_users),
        "yesterdayCount": len(yday_users),
        "dbStats": stats,
        "note": "登录组：今登录 + 昨登录(改时间)；期望约 10/20/-50%",
    }


def seed_new_channels(
    *,
    source_db: str = DEFAULT_SOURCE_DB,
    sdk_business_account: str | None = None,
    today_n: int = 1,
    yesterday_n: int = 1,
) -> dict:
    """造「新增渠道」组：今日新建一级渠道 +1；昨日新建后改 create_time +1。"""
    from smoke_db import _connect, load_db_config, resolve_database

    ctx = resolve_promote_context(
        source_db=source_db,
        sdk_business_account=sdk_business_account or DEFAULT_SDK_BIZ,
    )
    if not ctx.get("ok"):
        return {"ok": False, "error": ctx.get("error") or "无商务上下文", "context": ctx}
    biz_id = int(ctx.get("businessId") or 0)
    if biz_id <= 0:
        return {"ok": False, "error": "无 businessId", "context": ctx}

    db = resolve_database(source_db)
    now = datetime.now()
    stamp = now.strftime("%m%d%H%M%S")
    pwd_hash = "###f206bde5f3d9a56782a36a8dff05d851"
    created: list[dict] = []
    conn = _connect(load_db_config(), source_db=source_db)
    try:
        with conn.cursor() as cur:
            def _insert(account: str, create_ts: int) -> int:
                cur.execute(
                    f"""
                    INSERT INTO `{db}`.tab_promote
                    (account, password, mobile_phone, status, parent_id, parent_name,
                     promote_level, top_promote_id, create_time, update_time,
                     register_type, settment_type, busier_id)
                    VALUES (%s, %s, '', 1, 0, '', 1, 0, %s, %s, 0, '1', %s)
                    """,
                    (account, pwd_hash, create_ts, create_ts, biz_id),
                )
                pid_new = int(cur.lastrowid or 0)
                if not pid_new:
                    cur.execute(
                        f"SELECT id FROM `{db}`.tab_promote WHERE account=%s LIMIT 1",
                        (account,),
                    )
                    pid_new = int((cur.fetchone() or {}).get("id") or 0)
                return pid_new

            # 挂到商务 promote_ids
            cur.execute(
                f"SELECT id, promote_ids FROM `{db}`.tab_promote_business WHERE id=%s LIMIT 1",
                (biz_id,),
            )
            brow = cur.fetchone() or {}
            exist = [x.strip() for x in str(brow.get("promote_ids") or "").split(",") if x.strip()]

            for i in range(max(0, int(today_n))):
                acc = f"wb_nc_today_{stamp}_{i+1}"
                ts = int(now.timestamp())
                pid_new = _insert(acc, ts)
                if pid_new:
                    s = str(pid_new)
                    if s not in exist:
                        exist.append(s)
                    created.append({"day": "today", "account": acc, "promoteId": pid_new})

            yday = (now - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
            for i in range(max(0, int(yesterday_n))):
                acc = f"wb_nc_yday_{stamp}_{i+1}"
                ts = int(yday.timestamp())
                pid_new = _insert(acc, ts)
                if pid_new:
                    # 再显式改 create_time，确保计入昨日
                    cur.execute(
                        f"UPDATE `{db}`.tab_promote SET create_time=%s, update_time=%s WHERE id=%s",
                        (ts, ts, pid_new),
                    )
                    s = str(pid_new)
                    if s not in exist:
                        exist.append(s)
                    created.append({"day": "yesterday", "account": acc, "promoteId": pid_new})

            cur.execute(
                f"UPDATE `{db}`.tab_promote_business SET promote_ids=%s WHERE id=%s",
                (",".join(exist), biz_id),
            )
            conn.commit()
    finally:
        conn.close()

    stats = query_db_stats(
        source_db=source_db,
        promote_id=ctx.get("promoteId"),
        sdk_business_account=ctx.get("sdkBusinessAccount"),
    )
    m = (stats or {}).get("metrics") or {}
    return {
        "ok": bool(stats.get("ok")),
        "businessId": biz_id,
        "created": created,
        "dbStats": stats,
        "todayNewChannels": m.get("todayNewChannels"),
        "yesterdayNewChannels": m.get("yesterdayNewChannels"),
        "newChannelDelta": m.get("newChannelDelta"),
        "note": "新增渠道组：默认今+1昨+1；测环比请用 seed_channel_mom（昨2今4→+100%）",
    }


def seed_last_month_pay(
    *,
    source_db: str = DEFAULT_SOURCE_DB,
    promote_id: str | int | None = None,
    sdk_business_account: str | None = None,
    amount: float = 2370.0,
) -> dict:
    """本月充值组辅助：在「上月同日」写 1 笔成功充值，并写入日汇总 total_pay。

    页「较上月同期」读上月1号~上月同日的汇总；只写 spend 不够，需同步 report_day。
    """
    import calendar

    from smoke_db import _connect, load_db_config, resolve_database

    defaults = _smoke_l3_defaults()
    ctx = resolve_promote_context(
        source_db=source_db,
        promote_id=promote_id,
        sdk_business_account=sdk_business_account or defaults["sdkBusinessAccount"],
    )
    if not ctx.get("ok"):
        return {"ok": False, "error": ctx.get("error"), "context": ctx}
    pid = int(ctx["promoteId"])
    db = resolve_database(source_db)
    amt = float(amount)

    now = datetime.now()
    y, m = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)
    d = min(now.day, calendar.monthrange(y, m)[1])
    when = datetime(y, m, d, 12, 0, 0)
    ts = int(when.timestamp())
    stat_date = when.strftime("%Y-%m-%d")

    conn = _connect(load_db_config(), source_db=source_db)
    spend_id = None
    report_id = None
    account = ""
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account FROM `{db}`.tab_user WHERE promote_id=%s ORDER BY id DESC LIMIT 1",
                (pid,),
            )
            user = cur.fetchone() or {}
            if not user.get("id"):
                return {"ok": False, "error": f"promote_id={pid} 下无玩家可挂充值", "context": ctx}
            uid = int(user["id"])
            account = str(user.get("account") or "")
            cur.execute(
                f"SELECT * FROM `{db}`.tab_spend WHERE promote_id=%s ORDER BY id DESC LIMIT 1",
                (pid,),
            )
            sample = cur.fetchone() or {}
            game_id = int(sample.get("game_id") or 659)
            game_name = str(sample.get("game_name") or "")
            promote_account = str(sample.get("promote_account") or "")
            order_no = f"AIV_LM_{when.strftime('%Y%m%d')}_{uid}_{int(time.time()) % 100000}"

            # 同日若已有造数单，先删再插，避免重复累加
            cur.execute(
                f"DELETE FROM `{db}`.tab_spend WHERE promote_id=%s AND pay_order_number LIKE %s "
                f"AND DATE(FROM_UNIXTIME(pay_time))=%s",
                (pid, "AIV_LM_%", when.strftime("%Y-%m-%d")),
            )
            cols = [
                "user_id",
                "user_account",
                "game_id",
                "game_name",
                "server_id",
                "server_name",
                "game_player_id",
                "game_player_name",
                "promote_id",
                "promote_account",
                "order_number",
                "pay_order_number",
                "props_name",
                "pay_amount",
                "cost",
                "pay_time",
                "pay_status",
                "pay_way",
                "spend_ip",
                "sdk_version",
                "role_level",
                "small_id",
                "currency_code",
                "pay_config_id",
                "goods_reserve",
                "extra_param",
                "extend",
            ]
            vals = (
                uid,
                account,
                game_id,
                game_name,
                str(sample.get("server_id") or "12"),
                str(sample.get("server_name") or ""),
                str(sample.get("game_player_id") or "10"),
                str(sample.get("game_player_name") or "aiv"),
                pid,
                promote_account,
                "",
                order_no,
                "上月造数",
                amt,
                amt,
                ts,
                1,
                3,
                "127.0.0.1",
                1,
                10,
                uid,
                "CNY",
                int(sample.get("pay_config_id") or 73),
                "造数",
                "http://sw.example.com",
                str(int(time.time() * 1000)),
            )
            ph = ",".join(["%s"] * len(cols))
            cur.execute(
                f"INSERT INTO `{db}`.tab_spend ({','.join(cols)}) VALUES ({ph})",
                vals,
            )
            spend_id = int(cur.lastrowid or 0)

            cur.execute(
                "SELECT id FROM `sw6`.tab_sw_report_day WHERE promote_id=%s AND source_db=%s "
                "AND DATE(stat_date)=%s AND dedup_mode=0 LIMIT 1",
                (pid, "lx", stat_date),
            )
            rr = cur.fetchone() or {}
            if rr.get("id"):
                cur.execute(
                    "UPDATE `sw6`.tab_sw_report_day SET total_pay=%s, pay_cnt=GREATEST(COALESCE(pay_cnt,0),1), "
                    "new_pay_cnt=GREATEST(COALESCE(new_pay_cnt,0),1) WHERE id=%s",
                    (amt, int(rr["id"])),
                )
                report_id = int(rr["id"])
            else:
                cur.execute(
                    "INSERT INTO `sw6`.tab_sw_report_day "
                    "(stat_date, source_db, promote_id, game_id, game_name, dedup_mode, "
                    "new_register_cnt, active_cnt, pay_cnt, new_pay_cnt, total_pay) "
                    "VALUES (%s,%s,%s,%s,%s,0,0,1,1,1,%s)",
                    (stat_date, "lx", pid, game_id, game_name, amt),
                )
                report_id = int(cur.lastrowid or 0)
            conn.commit()
    finally:
        conn.close()

    stats = query_db_stats(
        source_db=source_db,
        promote_id=pid,
        sdk_business_account=ctx.get("sdkBusinessAccount"),
    )
    return {
        "ok": True,
        "promoteId": pid,
        "account": account,
        "amount": amt,
        "statDate": stat_date,
        "payTime": ts,
        "spendId": spend_id,
        "reportId": report_id,
        "dbStats": stats,
        "note": f"已在 {stat_date} 写入充值 {amt}（spend+日汇总）；刷新 L3 工作台后「上月/较上月同期」会变",
    }


def compare_metrics(
    *,
    l3_user: str | None = None,
    l3_pass: str | None = None,
    base_url: str | None = None,
    source_db: str = DEFAULT_SOURCE_DB,
    promote_id: str | int | None = None,
    sdk_business_account: str | None = None,
    project_id: str = DEFAULT_PROJECT_ID,
    project_name: str = DEFAULT_PROJECT_NAME,
    headed: bool = False,
    include_sub_channels: bool = False,
) -> dict:
    defaults = _smoke_l3_defaults()
    user = str(l3_user or defaults["l3User"])
    password = str(l3_pass or defaults["l3Pass"])
    url = str(base_url or defaults["baseUrl"])

    db_stats = query_db_stats(
        source_db=source_db,
        promote_id=promote_id,
        sdk_business_account=sdk_business_account or defaults["sdkBusinessAccount"],
        include_sub_channels=include_sub_channels,
    )
    if not db_stats.get("ok"):
        return {"ok": False, "error": db_stats.get("error") or "库统计失败", "dbStats": db_stats}

    scrape = scrape_l3_workbench(l3_user=user, l3_pass=password, base_url=url, headed=headed)
    page_metrics = (scrape.get("page") or {}).get("metrics") or {}
    if (scrape.get("page") or {}).get("bodyText"):
        parsed = _parse_metrics_from_text(str((scrape.get("page") or {}).get("bodyText") or ""))
        merged = dict(parsed)
        merged.update({k: v for k, v in page_metrics.items() if v is not None})
        page_metrics = merged

    db_m = db_stats.get("metrics") or {}
    exp = db_stats.get("expectedSeed") or {}
    rows = build_compare_rows(db_m, page_metrics)

    seed_check = {
        "todayHit": db_m.get("todayReg") == exp.get("todayReg"),
        "yesterdayHit": db_m.get("yesterdayReg") == exp.get("yesterdayReg"),
        "expected": exp,
    }

    by_key = {r.get("key"): r for r in rows}
    today_ok = (by_key.get("todayReg") or {}).get("status") == "ok"
    mom_ok = (by_key.get("momRatio") or {}).get("status") == "ok"
    all_ok = all(r["status"] in ("ok", "db_only", "page_missing", "pending") for r in rows)
    run = {
        "id": _uid("aivcmp"),
        "kind": "compare",
        "createdAt": _now(),
        "projectId": project_id,
        "projectName": project_name,
        "l3User": user,
        "baseUrl": url,
        "sourceDb": source_db,
        "dbStats": db_m,
        "pageMetrics": page_metrics,
        "rows": rows,
        "seedCheck": seed_check,
        "scrapeOk": bool(scrape.get("ok")),
        "scrape": {
            "ok": scrape.get("ok"),
            "error": (scrape.get("page") or {}).get("error") or scrape.get("error"),
            "exitCode": scrape.get("exitCode"),
            "outFile": scrape.get("outFile"),
        },
        "ok": bool(scrape.get("ok")) and today_ok and mom_ok,
        "note": (
            "对验通过（主指标：今日注册+环比）"
            if (today_ok and mom_ok)
            else "主指标未通过或抓取失败；其它指标可人工填页值后逐项比对"
        ),
    }

    state = load_state()
    runs = state.get("runs") if isinstance(state.get("runs"), list) else []
    runs.insert(0, run)
    state["runs"] = runs[:40]
    save_state(state)

    return {
        "ok": run["ok"],
        "run": run,
        "rows": rows,
        "dbStats": db_stats,
        "scrape": scrape,
        "allOk": all_ok,
    }
