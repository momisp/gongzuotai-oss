# -*- coding: utf-8 -*-
"""业务自动化 · 造数脚本（按角色分框：能接线的用主流程/SDK，缺接口不编造）。"""
from __future__ import annotations

import copy
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
HTTP_LOG_FILE = DATA_DIR / "seed_script_http_logs.json"
READONLY_DBS = {"sw6"}

# 脑图步骤 → 现有能力。missing_api 的 ask 会原样展示，等你补接口。
CATALOG = {
    "id": "seed_script_v1",
    "name": "造数脚本",
    "note": "按新商务 / 商务 / 会长 / 用户分框。没有独立造数接口的步骤不会假装能跑，页面上会标「待补充」。sw6 只能查不能改。",
    "groups": [
        {
            "id": "xsw",
            "name": "新商务",
            "tone": "teal",
            "summary": "冒烟测试点 S2 / S4 / S5 是 Playwright 页面新增，没有 Python HTTP 造数接口。",
            "actions": [
                {
                    "id": "xsw.create.l1",
                    "title": "创建一级",
                    "status": "missing_api",
                    "smokeCase": "S2",
                    "ask": "请补充新商务「创建一级」HTTP 接口：路径、鉴权、入参/出参。冒烟目前只有 Playwright S2（超管页面新增）。",
                },
                {
                    "id": "xsw.create.l2",
                    "title": "创建二级",
                    "status": "missing_api",
                    "smokeCase": "S4",
                    "ask": "请补充新商务「创建二级」HTTP 接口。冒烟对应 S4（一级登录后页面新增）。",
                },
                {
                    "id": "xsw.create.l3",
                    "title": "创建三级",
                    "status": "missing_api",
                    "smokeCase": "S5",
                    "ask": "请补充新商务「创建三级」HTTP 接口。冒烟对应 S5（二级登录后页面新增）。",
                },
            ],
            "db": {
                "kind": "xsw",
                "fields": [
                    {"id": "create_time", "label": "创建/注册时间"},
                    {"id": "login_date", "label": "最后登录时间"},
                ],
                "note": "新商务用户在 sw6.sys_user。sw6 只允许一键查询。",
            },
        },
        {
            "id": "biz",
            "name": "商务",
            "tone": "slate",
            "summary": "旧商务后台（/sw）。一/二级走 OA tabPromoteBusiness/add；三级还没有接口。",
            "actions": [
                {
                    "id": "biz.create.l1",
                    "title": "创建一级",
                    "status": "wired",
                    "api": "oa_promote_api.create_level1_business",
                    "flow": "F1",
                    "inputs": [
                        {"key": "password", "label": "密码", "value": "111111"},
                    ],
                },
                {
                    "id": "biz.create.l2",
                    "title": "创建二级",
                    "status": "wired",
                    "api": "oa_promote_api.create_level2_business",
                    "flow": "OA add level=2 + commerce1",
                    "inputs": [
                        {"key": "parentAccount", "label": "一级商务账号", "placeholder": "必填，用来解析 commerce1"},
                        {"key": "password", "label": "密码", "value": "111111"},
                    ],
                },
                {
                    "id": "biz.create.l3",
                    "title": "创建三级",
                    "status": "missing_api",
                    "ask": "请补充旧商务「创建三级商务」接口。",
                },
            ],
            "db": {
                "kind": "biz",
                "fields": [
                    {"id": "register_time", "label": "注册时间"},
                    {"id": "last_login_time", "label": "最后登录时间"},
                ],
                "note": "game_* .tab_promote_business + 登录记录表。选 sw6 时只能查。",
            },
        },
        {
            "id": "guild",
            "name": "会长",
            "tone": "violet",
            "summary": "来源：商务账号 + 平台。一级走 F2→F5（创建到申请游戏）；二/三级走会长端创建下级。",
            "sourceInputs": [
                {"key": "bizAccount", "label": "商务账号", "placeholder": "创建一级会长时用来登录 /sw"},
                {"key": "bizPassword", "label": "商务密码", "value": "111111"},
                {"key": "guildAccount", "label": "会长账号", "placeholder": "创建一级后自动填；F3/F4/F5 用"},
                {"key": "guildPassword", "label": "会长密码", "value": "111111"},
                {"key": "parentAccount", "label": "上级会长账号", "placeholder": "创建二/三级时必填"},
                {"key": "parentPassword", "label": "上级会长密码", "placeholder": "创建二/三级时必填"},
            ],
            "actions": [
                {
                    "id": "guild.create.l1",
                    "title": "创建一级",
                    "status": "wired",
                    "api": "biz_web_api.create_level1_president",
                    "flow": "F2",
                },
                {
                    "id": "guild.setup.l1",
                    "title": "登录 / 改密 / 完善信息",
                    "status": "wired",
                    "api": "channel_web_api · login / change_password / updateinfo",
                    "flow": "F3",
                },
                {
                    "id": "guild.approve.l1",
                    "title": "OA 审核会长通过",
                    "status": "wired",
                    "api": "oa_promote_api.approve_promote",
                    "flow": "F4",
                },
                {
                    "id": "guild.apply.l1",
                    "title": "会长申请游戏",
                    "status": "wired",
                    "api": "channel_web_api.channel_apply_game",
                    "flow": "F5",
                },
                {
                    "id": "guild.create.l2",
                    "title": "创建二级",
                    "status": "wired",
                    "api": "channel_web_api.channel_create_child",
                    "flow": "F11",
                },
                {
                    "id": "guild.create.l3",
                    "title": "创建三级",
                    "status": "wired",
                    "api": "channel_web_api.channel_create_child",
                    "flow": "F16",
                },
            ],
            "db": {
                "kind": "guild",
                "fields": [
                    {"id": "register_time", "label": "注册时间"},
                    {"id": "last_login_time", "label": "最后登录时间"},
                ],
                "note": "game_* .tab_promote 的 create_time / login_time。",
            },
        },
        {
            "id": "user",
            "name": "用户",
            "tone": "amber",
            "summary": "来源：会长 id + 会长账号。注册会传 promote_id / promote_account（不要写成「自然注册」）。顺序：注册→登录→实名→上传角色→充值→回调。",
            "collapseSource": True,
            "sourceInputs": [
                {"key": "promoteId", "label": "会长 id", "placeholder": "tab_promote.id，例如 29710"},
                {"key": "promoteNickname", "label": "会长账号", "placeholder": "promote_account，例如 会长L1_8192"},
                {"key": "account", "label": "玩家账号", "placeholder": "登录/实名/充值/回调时填写；注册可留空自动生成"},
                {"key": "password", "label": "玩家密码", "value": "123456"},
                {"key": "realName", "label": "姓名", "placeholder": "实名用，可改"},
                {"key": "idcard", "label": "身份证号", "placeholder": "实名用，可改"},
            ],
            "actions": [
                {"id": "user.register", "title": "注册", "status": "wired", "api": "game_sdk_api.sdk_register", "flow": "F8-1"},
                {"id": "user.login", "title": "登录", "status": "wired", "api": "game_sdk_api.sdk_login", "flow": "F8"},
                {"id": "user.idcard", "title": "实名", "status": "wired", "api": "game_sdk_api.sdk_idcard", "flow": "F8-2"},
                {"id": "user.role", "title": "上传角色", "status": "wired", "api": "game_sdk_api.sdk_upload_role", "flow": "F8-3"},
                {"id": "user.pay", "title": "充值", "status": "wired", "api": "game_sdk_api.sdk_create_pay_order", "flow": "F8-4"},
                {"id": "user.callback", "title": "回调充值", "status": "wired", "api": "simulate-recharge :3780", "flow": "F9"},
                {"id": "user.commission", "title": "分佣核对", "status": "wired", "api": "money_flow.assert_commission", "flow": "F10"},
            ],
            "db": {
                "kind": "user",
                "fields": [
                    {"id": "register_time", "label": "注册时间"},
                    {"id": "login_time", "label": "登录时间"},
                    {"id": "pay_time", "label": "支付成功时间"},
                ],
                "note": "注册时间 tab_user.register_time；登录时间 tab_user_login_record；支付成功时间 tab_spend.pay_time（改支付时间会补当天登录记录）。",
            },
        },
    ],
}


def _clean(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: _clean(v)
            for k, v in obj.items()
            if k != "_opener" and not type(v).__name__.endswith("OpenerDirector")
        }
    if isinstance(obj, list):
        return [_clean(x) for x in obj]
    return obj


def _jsonable(obj: Any) -> Any:
    from smoke_db import _jsonable as _j

    return _j(obj)


def _redact_http(obj: Any) -> Any:
    hide = {"password", "repassword", "token", "pwd", "sms_code", "idcard", "x-token"}
    if isinstance(obj, dict):
        out = {}
        for key, val in obj.items():
            if str(key).lower() in hide:
                out[key] = "***"
            else:
                out[key] = _redact_http(val)
        return out
    if isinstance(obj, list):
        return [_redact_http(x) for x in obj]
    return obj


def save_http_log(action_id: str, result: dict | None) -> None:
    action_id = str(action_id or "").strip()
    result = result if isinstance(result, dict) else {}
    if not action_id:
        return
    entry = {
        "actionId": action_id,
        "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "ok": result.get("ok"),
        "method": str(result.get("method") or "POST"),
        "url": str(result.get("url") or ""),
        "path": str(result.get("path") or ""),
        "httpStatus": result.get("httpStatus"),
        "error": str(result.get("error") or ""),
        "request": _redact_http(result.get("request")),
        "response": _redact_http(result.get("response")),
    }
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        data = {}
        if HTTP_LOG_FILE.is_file():
            raw = json.loads(HTTP_LOG_FILE.read_text(encoding="utf-8"))
            data = raw if isinstance(raw, dict) else {}
        data[action_id] = entry
        HTTP_LOG_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        pass


def get_http_log(action_id: str) -> dict:
    action_id = str(action_id or "").strip()
    if not action_id:
        return {"ok": False, "error": "缺少 actionId"}
    try:
        if not HTTP_LOG_FILE.is_file():
            return {"ok": False, "error": "还没有请求日志，请先执行一次"}
        raw = json.loads(HTTP_LOG_FILE.read_text(encoding="utf-8"))
        data = raw if isinstance(raw, dict) else {}
        item = data.get(action_id)
        if not isinstance(item, dict):
            return {"ok": False, "error": "该接口还没有请求日志，请先执行一次"}
        return {"ok": True, **item}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _resolve_user_promote(params: dict, target: str) -> tuple[str, str]:
    pid = str(params.get("promoteId") or "").strip()
    acc = str(params.get("promoteNickname") or params.get("promoteAccount") or "").strip()
    try:
        from smoke_db import lookup_promote_account, lookup_promote_id
    except Exception:
        return (pid or "0", acc)
    if pid and pid != "0" and not acc:
        found = lookup_promote_account(pid, source_db=target)
        if found.get("ok"):
            acc = str(found.get("account") or "")
    if acc and (not pid or pid == "0"):
        found = lookup_promote_id(acc, source_db=target)
        if found.get("ok"):
            pid = str(found.get("promoteId") or "")
    return (pid or "0", acc)


def _bind_user_promote(account: str, promote_id: str, target: str) -> dict:
    account = str(account or "").strip()
    try:
        pid = int(promote_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "无效 promote_id"}
    if not account or pid <= 0:
        return {"ok": False, "skipped": True}
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        cfg = load_db_config()
        db = resolve_database(target, cfg)
        conn = _connect(cfg, source_db=target)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id, account, promote_id FROM `{db}`.tab_user WHERE account=%s LIMIT 1",
                    (account,),
                )
                row = cur.fetchone() or {}
                current = int(row.get("promote_id") or 0)
                if current == pid:
                    return {"ok": True, "skipped": True, "promoteId": pid, "account": account}
                cur.execute(
                    f"UPDATE `{db}`.tab_user SET promote_id=%s WHERE account=%s LIMIT 1",
                    (pid, account),
                )
                return {
                    "ok": True,
                    "account": account,
                    "from": current,
                    "promoteId": pid,
                    "note": "SDK 未挂上渠道，已按来源会长 id 写库",
                }
        finally:
            conn.close()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def catalog() -> dict:
    game_fixed = {"gameId": "", "gameName": "", "note": "游戏参数先固定，来自 game_sdk 配置"}
    groups = copy.deepcopy(CATALOG["groups"])
    try:
        from game_sdk_api import load_game_sdk_config, resolve_game_meta

        cfg = load_game_sdk_config()
        meta = resolve_game_meta(cfg.get("gameId"), source_db="lx", cfg=cfg)
        game_fixed = {
            "gameId": str((meta or {}).get("gameId") or cfg.get("gameId") or ""),
            "gameName": str((meta or {}).get("gameName") or ""),
            "note": "游戏参数先固定，来自 game_sdk 配置",
        }
        rn = cfg.get("realName") if isinstance(cfg.get("realName"), dict) else {}
        for group in groups:
            if group.get("id") != "user":
                continue
            for inp in group.get("sourceInputs") or []:
                if inp.get("key") == "realName" and not inp.get("value"):
                    inp["value"] = str(rn.get("real_name") or "测试同学")
                if inp.get("key") == "idcard" and not inp.get("value"):
                    inp["value"] = str(rn.get("idcard") or "110101199001011234")
    except Exception:
        pass
    missing = []
    for group in groups:
        for act in group.get("actions") or []:
            if act.get("status") == "missing_api":
                missing.append({"id": act["id"], "title": f"{group['name']} · {act['title']}", "ask": act.get("ask") or ""})
    payload = copy.deepcopy(CATALOG)
    payload["groups"] = groups
    return {
        "ok": True,
        **payload,
        "gameFixed": game_fixed,
        "missingApis": missing,
        "targets": [
            {"id": "lx", "label": "龙翔"},
            {"id": "yq", "label": "游趣"},
            {"id": "hw", "label": "汇玩"},
        ],
    }


def _record_artifact(role: str, account: str, password: str, target: str, note: str, extra: dict | None = None) -> None:
    try:
        from biz_flow import add_artifact

        add_artifact({
            "role": role,
            "account": account,
            "password": password,
            "target": target,
            "source": "seed_script",
            "note": note,
            "extra": extra or {},
        })
    except Exception:
        pass


def _db_name(source_db: str, database: str = "") -> str:
    from smoke_db import resolve_database

    raw = str(database or source_db or "lx").strip()
    if raw.lower() == "sw6":
        return "sw6"
    if raw.startswith("game_") or raw.lower() == "sw6":
        return raw
    return resolve_database(raw)


def _is_sw6(name: str) -> bool:
    from smoke_db import is_sw6

    return is_sw6(name)


def _connect_db(db: str):
    from smoke_db import _connect, load_db_config, resolve_database

    cfg = dict(load_db_config())
    if _is_sw6(db):
        cfg["database"] = "sw6"
        return _connect(cfg)
    key = db
    if key in {"lx", "yq", "hw"}:
        key = resolve_database(key, cfg)
        cfg["database"] = key
        return _connect(cfg, source_db=db if db in {"lx", "yq", "hw"} else None)
    cfg["database"] = key
    return _connect(cfg)


def _columns(cur, db: str, table: str) -> list[str]:
    cur.execute(f"SHOW COLUMNS FROM `{db}`.`{table}`")
    rows = cur.fetchall() or []
    out = []
    for row in rows:
        if isinstance(row, dict):
            out.append(str(row.get("Field") or ""))
        else:
            out.append(str(row[0]))
    return [x for x in out if x]


def _pick_col(cols: list[str], candidates: list[str]) -> str:
    lower = {c.lower(): c for c in cols}
    for name in candidates:
        if name in cols:
            return name
        if name.lower() in lower:
            return lower[name.lower()]
    return ""


def _parse_when(value: str) -> datetime:
    text = str(value or "").strip().replace("T", " ")
    if not text:
        return datetime.now() - timedelta(days=1)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return datetime.now() - timedelta(days=1)


def _unix(dt: datetime) -> str:
    return str(int(dt.timestamp()))


def _to_unix_int(value: Any) -> int:
    if value in (None, ""):
        return 0
    try:
        n = int(float(str(value)))
    except (TypeError, ValueError):
        return 0
    if n > 10**12:
        n //= 1000
    return n


def query_times(kind: str, account: str, *, source_db: str = "lx", database: str = "") -> dict:
    account = str(account or "").strip()
    if not account:
        return {"ok": False, "error": "请填写要查询的账号"}
    db = _db_name(source_db, database)
    kind = str(kind or "").strip()
    if kind == "xsw":
        db = "sw6"
    try:
        conn = _connect_db(db)
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    try:
        with conn.cursor() as cur:
            if kind == "xsw" or _is_sw6(db):
                return _query_sw6_user(cur, account)
            if kind == "biz":
                return _query_biz(cur, db, account)
            if kind == "guild":
                return _query_guild(cur, db, account)
            if kind == "user":
                return _query_user(cur, db, account)
            return {"ok": False, "error": f"未知 kind: {kind}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _fmt_ts(value: Any) -> str:
    if value in (None, ""):
        return ""
    text = str(value)
    try:
        n = int(float(text))
        if 1000000000 <= n <= 9999999999:
            return datetime.fromtimestamp(n).strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError, OSError):
        pass
    return text


def _query_sw6_user(cur, account: str) -> dict:
    cols = _columns(cur, "sw6", "sys_user")
    user_col = _pick_col(cols, ["user_name", "userName", "account"])
    if not user_col:
        return {"ok": False, "error": "sw6.sys_user 未找到账号列", "database": "sw6", "writable": False}
    cur.execute(f"SELECT * FROM `sw6`.`sys_user` WHERE `{user_col}`=%s LIMIT 1", (account,))
    row = cur.fetchone() or {}
    if not row:
        return {"ok": False, "error": f"sw6.sys_user 未找到：{account}", "database": "sw6", "writable": False}
    fields = []
    for fid, label, cands in (
        ("create_time", "创建/注册时间", ["create_time", "createTime", "register_time"]),
        ("login_date", "最后登录时间", ["login_date", "loginDate", "login_time"]),
    ):
        col = _pick_col(cols, cands)
        if not col:
            continue
        val = row.get(col)
        fields.append({"id": fid, "label": label, "column": col, "value": _jsonable(val), "display": _fmt_ts(val)})
    return {
        "ok": True,
        "database": "sw6",
        "table": "sys_user",
        "account": account,
        "writable": False,
        "row": _jsonable(row),
        "fields": fields,
        "note": "sw6 只读，不能一键更换",
    }


def _query_biz(cur, db: str, account: str) -> dict:
    cols = _columns(cur, db, "tab_promote_business")
    cur.execute(f"SELECT * FROM `{db}`.tab_promote_business WHERE account=%s LIMIT 1", (account,))
    row = cur.fetchone()
    if not row:
        return {"ok": False, "error": f"{db}.tab_promote_business 未找到：{account}", "database": db}
    biz_id = row.get("id")
    reg_col = _pick_col(cols, ["create_time", "register_time", "add_time"])
    fields = []
    if reg_col:
        val = row.get(reg_col)
        fields.append({
            "id": "register_time",
            "label": "注册时间",
            "column": f"tab_promote_business.{reg_col}",
            "value": _jsonable(val),
            "display": _fmt_ts(val),
        })
    login_val = None
    try:
        cur.execute(
            f"""
            SELECT login_time FROM `{db}`.tab_promote_business_login_record
            WHERE business_id=%s ORDER BY id DESC LIMIT 1
            """,
            (biz_id,),
        )
        rec = cur.fetchone() or {}
        login_val = rec.get("login_time")
    except Exception:
        login_col = _pick_col(cols, ["login_time", "last_login_time"])
        if login_col:
            login_val = row.get(login_col)
    fields.append({
        "id": "last_login_time",
        "label": "最后登录时间",
        "column": "tab_promote_business_login_record.login_time",
        "value": _jsonable(login_val),
        "display": _fmt_ts(login_val),
    })
    return {
        "ok": True,
        "database": db,
        "table": "tab_promote_business",
        "account": account,
        "id": biz_id,
        "writable": not _is_sw6(db),
        "row": _jsonable({k: row.get(k) for k in ("id", "account", "level", "status") if k in row}),
        "fields": fields,
    }


def _query_guild(cur, db: str, account: str) -> dict:
    cols = _columns(cur, db, "tab_promote")
    cur.execute(f"SELECT * FROM `{db}`.tab_promote WHERE account=%s LIMIT 1", (account,))
    row = cur.fetchone()
    if not row:
        return {"ok": False, "error": f"{db}.tab_promote 未找到：{account}", "database": db}
    fields = []
    reg_col = _pick_col(cols, ["create_time", "register_time"])
    login_col = _pick_col(cols, ["login_time", "last_login_time"])
    if reg_col:
        val = row.get(reg_col)
        fields.append({
            "id": "register_time",
            "label": "注册时间",
            "column": f"tab_promote.{reg_col}",
            "value": _jsonable(val),
            "display": _fmt_ts(val),
        })
    if login_col:
        val = row.get(login_col)
        fields.append({
            "id": "last_login_time",
            "label": "最后登录时间",
            "column": f"tab_promote.{login_col}",
            "value": _jsonable(val),
            "display": _fmt_ts(val),
        })
    return {
        "ok": True,
        "database": db,
        "table": "tab_promote",
        "account": account,
        "id": row.get("id"),
        "writable": not _is_sw6(db),
        "row": _jsonable({k: row.get(k) for k in ("id", "account", "promote_level", "status", "parent_id") if k in row}),
        "fields": fields,
    }


def _query_user(cur, db: str, account: str) -> dict:
    cols = _columns(cur, db, "tab_user")
    cur.execute(f"SELECT * FROM `{db}`.tab_user WHERE account=%s LIMIT 1", (account,))
    row = cur.fetchone()
    if not row:
        return {"ok": False, "error": f"{db}.tab_user 未找到：{account}", "database": db}
    uid = row.get("id") or row.get("user_id")
    fields = []
    reg_col = _pick_col(cols, ["register_time", "create_time"])
    if reg_col:
        val = row.get(reg_col)
        fields.append({
            "id": "register_time",
            "label": "注册时间",
            "column": f"tab_user.{reg_col}",
            "value": _jsonable(val),
            "display": _fmt_ts(val),
        })
    login_val = None
    try:
        cur.execute(
            f"""
            SELECT login_time FROM `{db}`.tab_user_login_record
            WHERE user_id=%s OR user_account=%s
            ORDER BY id DESC LIMIT 1
            """,
            (uid, account),
        )
        rec = cur.fetchone() or {}
        login_val = rec.get("login_time")
    except Exception:
        try:
            cur.execute(
                f"""
                SELECT login_time FROM `{db}`.tab_user_day_login
                WHERE user_id=%s OR user_id=%s
                ORDER BY id DESC LIMIT 1
                """,
                (uid, row.get("user_id") or uid),
            )
            rec = cur.fetchone() or {}
            login_val = rec.get("login_time")
        except Exception:
            login_col = _pick_col(cols, ["login_time", "last_login_time"])
            if login_col:
                login_val = row.get(login_col)
    fields.append({
        "id": "login_time",
        "label": "登录时间",
        "column": "tab_user_login_record.login_time",
        "value": _jsonable(login_val),
        "display": _fmt_ts(login_val),
    })
    pay_val = None
    pay_order = ""
    try:
        cur.execute(
            f"""
            SELECT pay_time, pay_order_number FROM `{db}`.tab_spend
            WHERE user_account=%s OR user_id=%s
            ORDER BY (pay_status=1) DESC, id DESC
            LIMIT 1
            """,
            (account, uid),
        )
        rec = cur.fetchone() or {}
        pay_val = rec.get("pay_time")
        pay_order = rec.get("pay_order_number") or ""
    except Exception:
        pass
    fields.append({
        "id": "pay_time",
        "label": "支付成功时间",
        "column": "tab_spend.pay_time",
        "value": _jsonable(pay_val),
        "display": _fmt_ts(pay_val),
        "payOrderNumber": pay_order,
    })
    return {
        "ok": True,
        "database": db,
        "table": "tab_user",
        "account": account,
        "id": uid,
        "writable": not _is_sw6(db),
        "row": _jsonable({k: row.get(k) for k in ("id", "user_id", "account", "promote_id", "nickname") if k in row}),
        "fields": fields,
    }


def update_times(
    kind: str,
    account: str,
    field: str,
    value: str,
    *,
    source_db: str = "lx",
    database: str = "",
    confirm: bool = False,
) -> dict:
    account = str(account or "").strip()
    field = str(field or "").strip()
    if not account:
        return {"ok": False, "error": "请填写要改的账号"}
    db = _db_name(source_db, database)
    if _is_sw6(db) or kind == "xsw":
        return {"ok": False, "error": "sw6 只允许查询，不能改数据", "database": db}
    when = _parse_when(value)
    unix_s = _unix(when)
    try:
        conn = _connect_db(db)
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    try:
        with conn.cursor() as cur:
            if kind == "biz":
                out = _update_biz(cur, db, account, field, unix_s)
            elif kind == "guild":
                out = _update_guild(cur, db, account, field, unix_s)
            elif kind == "user":
                out = _update_user(cur, db, account, field, unix_s, confirm=confirm)
            else:
                return {"ok": False, "error": f"未知 kind: {kind}"}
        if out.get("ok"):
            conn.commit()
            out["when"] = when.strftime("%Y-%m-%d %H:%M:%S")
            out["unix"] = unix_s
            out["database"] = db
        else:
            try:
                conn.rollback()
            except Exception:
                pass
            out["database"] = db
        return out
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _update_biz(cur, db: str, account: str, field: str, unix_s: str) -> dict:
    cur.execute(f"SELECT id FROM `{db}`.tab_promote_business WHERE account=%s LIMIT 1", (account,))
    row = cur.fetchone()
    if not row:
        return {"ok": False, "error": f"未找到商务账号：{account}"}
    biz_id = row["id"]
    if field == "register_time":
        cols = _columns(cur, db, "tab_promote_business")
        col = _pick_col(cols, ["create_time", "register_time", "add_time"])
        if not col:
            return {"ok": False, "error": "商务表没有注册时间列"}
        n = cur.execute(f"UPDATE `{db}`.tab_promote_business SET `{col}`=%s WHERE id=%s", (unix_s, biz_id))
        return {"ok": True, "updated": int(n or 0), "column": col}
    if field == "last_login_time":
        cur.execute(
            f"SELECT id FROM `{db}`.tab_promote_business_login_record WHERE business_id=%s ORDER BY id DESC LIMIT 1",
            (biz_id,),
        )
        rec = cur.fetchone()
        if rec:
            n = cur.execute(
                f"UPDATE `{db}`.tab_promote_business_login_record SET login_time=%s WHERE id=%s",
                (unix_s, rec["id"]),
            )
        else:
            n = cur.execute(
                f"""
                INSERT INTO `{db}`.tab_promote_business_login_record
                (business_id, login_time, login_ip, user_agent)
                VALUES (%s, %s, %s, %s)
                """,
                (biz_id, unix_s, "127.0.0.1", "seed-script"),
            )
        return {"ok": True, "updated": int(n or 0), "column": "tab_promote_business_login_record.login_time"}
    return {"ok": False, "error": f"不支持字段 {field}"}


def _update_guild(cur, db: str, account: str, field: str, unix_s: str) -> dict:
    cols = _columns(cur, db, "tab_promote")
    cur.execute(f"SELECT id FROM `{db}`.tab_promote WHERE account=%s LIMIT 1", (account,))
    row = cur.fetchone()
    if not row:
        return {"ok": False, "error": f"未找到会长账号：{account}"}
    pid = row["id"]
    if field == "register_time":
        col = _pick_col(cols, ["create_time", "register_time"])
    else:
        col = _pick_col(cols, ["login_time", "last_login_time"])
    if not col:
        return {"ok": False, "error": f"会长表没有对应列：{field}"}
    n = cur.execute(f"UPDATE `{db}`.tab_promote SET `{col}`=%s WHERE id=%s", (unix_s, pid))
    return {"ok": True, "updated": int(n or 0), "column": col}


def _update_user(cur, db: str, account: str, field: str, unix_s: str, *, confirm: bool = False) -> dict:
    cur.execute(f"SELECT * FROM `{db}`.tab_user WHERE account=%s LIMIT 1", (account,))
    row = cur.fetchone()
    if not row:
        return {"ok": False, "error": f"未找到玩家账号：{account}"}
    uid = row.get("id")
    promote_id = row.get("promote_id") or 0
    if field == "register_time":
        cols = _columns(cur, db, "tab_user")
        col = _pick_col(cols, ["register_time", "create_time"])
        if not col:
            return {"ok": False, "error": "用户表没有注册时间列"}
        n = cur.execute(f"UPDATE `{db}`.tab_user SET `{col}`=%s WHERE id=%s", (unix_s, uid))
        return {"ok": True, "updated": int(n or 0), "column": col}
    if field == "pay_time":
        return _update_user_pay(cur, db, row, unix_s, confirm=confirm)
    if field != "login_time":
        return {"ok": False, "error": f"不支持字段 {field}"}
    cur.execute(
        f"SELECT id FROM `{db}`.tab_user_day_login WHERE user_id=%s ORDER BY id DESC LIMIT 1",
        (uid,),
    )
    rec = cur.fetchone()
    if rec:
        n = cur.execute(
            f"UPDATE `{db}`.tab_user_day_login SET login_time=%s WHERE id=%s",
            (unix_s, rec["id"]),
        )
    else:
        n = cur.execute(
            f"INSERT INTO `{db}`.tab_user_day_login (user_id, promote_id, login_time) VALUES (%s, %s, %s)",
            (uid, promote_id, unix_s),
        )
    return {"ok": True, "updated": int(n or 0), "column": "tab_user_day_login.login_time"}


def _update_user_pay(cur, db: str, user: dict, unix_s: str, *, confirm: bool = False) -> dict:
    uid = user.get("id")
    account = str(user.get("account") or "")
    pay_unix = _to_unix_int(unix_s)
    cur.execute(
        f"""
        SELECT * FROM `{db}`.tab_spend
        WHERE user_account=%s OR user_id=%s
        ORDER BY (pay_status=1) DESC, id DESC
        LIMIT 1
        """,
        (account, uid),
    )
    spend = cur.fetchone()
    if not spend:
        return {"ok": False, "error": f"{db}.tab_spend 无该账号支付订单：{account}"}
    if int(spend.get("pay_status") or 0) != 1:
        return {"ok": False, "error": f"该账号最新订单未支付成功（pay_status={spend.get('pay_status')}）"}

    reg_unix = _to_unix_int(user.get("register_time"))
    sync_register = reg_unix > pay_unix
    if sync_register and not confirm:
        return {
            "ok": False,
            "needConfirm": True,
            "confirmKind": "sync_register_before_pay",
            "error": "更改支付订单的时间会同步更改用户注册时间到支付订单时间之前，确定是否更改",
            "registerTime": _fmt_ts(reg_unix),
            "payTime": _fmt_ts(pay_unix),
        }

    n = cur.execute(
        f"UPDATE `{db}`.tab_spend SET pay_time=%s WHERE id=%s",
        (pay_unix, spend["id"]),
    )
    bind_n = 0
    order_no = str(spend.get("pay_order_number") or "")
    if order_no:
        try:
            bind_n = cur.execute(
                f"UPDATE `{db}`.tab_spend_bind SET pay_time=%s WHERE pay_order_number=%s",
                (pay_unix, order_no),
            )
        except Exception:
            bind_n = 0

    login = _insert_user_login_for_pay(cur, db, user, spend, pay_unix)
    synced = {}
    if sync_register:
        new_reg = max(pay_unix - 60, 1)
        cols = _columns(cur, db, "tab_user")
        col = _pick_col(cols, ["register_time", "create_time"])
        if col:
            cur.execute(f"UPDATE `{db}`.tab_user SET `{col}`=%s WHERE id=%s", (str(new_reg), uid))
            synced["register_time"] = _fmt_ts(new_reg)
            synced["registerColumn"] = f"tab_user.{col}"

    user_cols = _columns(cur, db, "tab_user")
    if _pick_col(user_cols, ["login_time"]):
        cur.execute(f"UPDATE `{db}`.tab_user SET login_time=%s WHERE id=%s", (pay_unix, uid))

    return {
        "ok": True,
        "updated": int(n or 0),
        "column": "tab_spend.pay_time",
        "payOrderNumber": order_no,
        "spendId": spend.get("id"),
        "bindUpdated": int(bind_n or 0),
        "login": login,
        "synced": synced,
    }


def _insert_user_login_for_pay(cur, db: str, user: dict, spend: dict, pay_unix: int) -> dict:
    uid = user.get("id")
    account = str(user.get("account") or "")
    promote_id = user.get("promote_id") or spend.get("promote_id") or 0
    game_id = spend.get("game_id") or 0
    game_name = str(spend.get("game_name") or "")
    login_ip = str(spend.get("spend_ip") or "127.0.0.1")
    server_id = spend.get("server_id") or 0
    server_name = str(spend.get("server_name") or "")
    player_name = str(spend.get("game_player_name") or "")
    sample = {}
    try:
        cur.execute(
            f"SELECT * FROM `{db}`.tab_user_login_record WHERE user_id=%s OR user_account=%s ORDER BY id DESC LIMIT 1",
            (uid, account),
        )
        sample = cur.fetchone() or {}
    except Exception:
        sample = {}
    if sample:
        game_id = sample.get("game_id") or game_id
        game_name = str(sample.get("game_name") or game_name)
        login_ip = str(sample.get("login_ip") or login_ip)
        server_id = sample.get("server_id") if sample.get("server_id") not in (None, "") else server_id
        server_name = str(sample.get("server_name") or server_name)
        player_name = str(sample.get("game_player_name") or player_name)

    cur.execute(
        f"""
        INSERT INTO `{db}`.tab_user_login_record
        (game_id, game_name, server_id, game_player_name, server_name, user_id, user_account,
         promote_id, login_time, login_ip, type, sdk_version, status, puid)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            game_id,
            game_name,
            server_id,
            player_name,
            server_name,
            uid,
            account,
            promote_id,
            pay_unix,
            login_ip,
            sample.get("type") if sample else 1,
            sample.get("sdk_version") if sample else 0,
            sample.get("status") if sample else 0,
            sample.get("puid") if sample else 0,
        ),
    )
    login_record_id = int(cur.lastrowid or 0)
    day_n = 0
    try:
        cur.execute(
            f"""
            SELECT id FROM `{db}`.tab_user_day_login
            WHERE user_id=%s AND DATE(FROM_UNIXTIME(login_time))=DATE(FROM_UNIXTIME(%s))
            ORDER BY id DESC LIMIT 1
            """,
            (uid, pay_unix),
        )
        day = cur.fetchone()
        if day:
            day_n = cur.execute(
                f"""
                UPDATE `{db}`.tab_user_day_login
                SET login_time=%s, login_record_id=%s, promote_id=%s, game_id=%s
                WHERE id=%s
                """,
                (pay_unix, login_record_id, promote_id, game_id, day["id"]),
            )
        else:
            day_n = cur.execute(
                f"""
                INSERT INTO `{db}`.tab_user_day_login
                (login_record_id, user_id, promote_id, game_id, is_new, equipment_num, sdk_version, login_time)
                VALUES (%s,%s,%s,%s,0,'',0,%s)
                """,
                (login_record_id, uid, promote_id, game_id, pay_unix),
            )
    except Exception as exc:
        return {
            "loginRecordId": login_record_id,
            "column": "tab_user_login_record.login_time",
            "dayLoginError": str(exc),
        }
    return {
        "loginRecordId": login_record_id,
        "column": "tab_user_login_record.login_time",
        "dayLoginUpdated": int(day_n or 0),
    }


def run_action(action_id: str, params: dict | None = None) -> dict:
    params = params if isinstance(params, dict) else {}
    action_id = str(action_id or "").strip()
    target = str(params.get("target") or params.get("sourceDb") or "lx").strip().lower() or "lx"
    sms_code = str(params.get("smsCode") or params.get("sms_code") or "").strip()
    handlers = {
        "biz.create.l1": lambda: _run_biz_l1(target, params),
        "biz.create.l2": lambda: _run_biz_l2(target, params),
        "guild.create.l1": lambda: _run_guild_l1(target, params, sms_code),
        "guild.setup.l1": lambda: _run_guild_setup_l1(target, params, sms_code),
        "guild.approve.l1": lambda: _run_guild_approve_l1(target, params),
        "guild.apply.l1": lambda: _run_guild_apply_l1(target, params, sms_code),
        "guild.create.l2": lambda: _run_guild_child(target, params, 2, sms_code),
        "guild.create.l3": lambda: _run_guild_child(target, params, 3, sms_code),
        "user.register": lambda: _run_user_register(target, params),
        "user.login": lambda: _run_user_login(target, params),
        "user.idcard": lambda: _run_user_idcard(target, params),
        "user.role": lambda: _run_user_role(target, params),
        "user.pay": lambda: _run_user_pay(target, params),
        "user.callback": lambda: _run_user_callback(target, params),
        "user.commission": lambda: _run_user_commission(target, params),
    }
    fn = handlers.get(action_id)
    if not fn:
        item = None
        for group in CATALOG["groups"]:
            for act in group.get("actions") or []:
                if act.get("id") == action_id:
                    item = act
                    break
        if item and item.get("status") == "missing_api":
            return {"ok": False, "missingApi": True, "error": item.get("ask") or "缺接口，未接线"}
        return {"ok": False, "error": f"未知动作：{action_id}"}
    try:
        out = _clean(fn())
        save_http_log(action_id, out)
        return out
    except Exception as exc:
        fail = {"ok": False, "error": str(exc)}
        save_http_log(action_id, fail)
        return fail


def _run_biz_l1(target: str, params: dict) -> dict:
    from oa_promote_api import create_level1_business

    result = create_level1_business(
        db_name=target,
        password=str(params.get("password") or "111111"),
    )
    if result.get("ok"):
        _record_artifact("一级商务", str(result.get("account") or ""), str(result.get("password") or ""), target, "造数脚本·商务一级")
        try:
            from biz_web_api import load_biz_web_config
            from smoke_db import trust_business_device

            device = str(load_biz_web_config().get("deviceId") or "")
            if device and result.get("account"):
                result["trustDevice"] = trust_business_device(str(result["account"]), device, source_db=target)
        except Exception as exc:
            result["trustDevice"] = {"ok": False, "error": str(exc)}
    return result


def _run_biz_l2(target: str, params: dict) -> dict:
    from oa_promote_api import create_level2_business

    parent_account = str(params.get("parentAccount") or params.get("parent_account") or "").strip()
    commerce1 = params.get("commerce1")
    if not parent_account and commerce1 in (None, "", 0, "0"):
        return {"ok": False, "error": "创建二级需要一级商务账号（parentAccount）"}
    result = create_level2_business(
        parent_account=parent_account or None,
        commerce1=commerce1,
        db_name=target,
        password=str(params.get("password") or "111111"),
        real_name=str(params.get("real_name") or params.get("realName") or "") or None,
    )
    if result.get("ok"):
        extra = {"commerce1": result.get("commerce1"), "parentAccount": result.get("parentAccount")}
        _record_artifact("二级商务", str(result.get("account") or ""), str(result.get("password") or ""), target, "造数脚本·商务二级", extra)
        try:
            from biz_web_api import load_biz_web_config
            from smoke_db import trust_business_device

            device = str(load_biz_web_config().get("deviceId") or "")
            if device and result.get("account"):
                result["trustDevice"] = trust_business_device(str(result["account"]), device, source_db=target)
        except Exception as exc:
            result["trustDevice"] = {"ok": False, "error": str(exc)}
    return result


def _run_guild_l1(target: str, params: dict, sms_code: str = "") -> dict:
    from biz_web_api import create_level1_president, load_biz_web_config
    from channel_web_api import get_universal_sms_code
    from smoke_db import trust_business_device

    biz_account = str(params.get("bizAccount") or "").strip()
    biz_password = str(params.get("bizPassword") or "111111")
    if not biz_account:
        return {"ok": False, "error": "创建一级会长需要来源数据：商务账号"}
    device = str(load_biz_web_config().get("deviceId") or "")
    trust = None
    if device:
        try:
            trust = trust_business_device(biz_account, device, source_db=target)
        except Exception as exc:
            trust = {"ok": False, "error": str(exc)}
    result = create_level1_president(
        biz_account=biz_account,
        biz_password=biz_password,
        source_db=target,
        sms_code=sms_code or None,
    )
    if result.get("needSms") and not sms_code:
        uni = get_universal_sms_code()
        if uni:
            result = create_level1_president(
                biz_account=biz_account,
                biz_password=biz_password,
                source_db=target,
                sms_code=uni,
            )
            result["usedUniversalSms"] = uni
    if trust is not None:
        result["trustDevice"] = trust
    if result.get("ok"):
        _record_artifact("一级会长", str(result.get("account") or ""), str(result.get("password") or ""), target, "造数脚本·会长一级")
    return result


def _guild_l1_creds(params: dict) -> tuple[str, str]:
    account = str(params.get("guildAccount") or params.get("account") or "").strip()
    password = str(params.get("guildPassword") or "111111")
    return account, password


def _channel_login(account: str, password: str, sms_code: str = "") -> dict:
    from channel_web_api import channel_login, get_universal_sms_code

    login = channel_login(account, password, sms_code=sms_code or None)
    if login.get("needSms") and not sms_code:
        uni = get_universal_sms_code()
        if uni:
            login = channel_login(account, password, sms_code=uni)
            login["usedUniversalSms"] = uni
    return login


def _run_guild_setup_l1(target: str, params: dict, sms_code: str) -> dict:
    """F3：会长登录 → 改密 → 完善信息（短信不够用时库写入兜底，与主流程一致）。"""
    from channel_web_api import channel_change_password, complete_profile_with_sms, get_universal_sms_code, load_channel_web_config
    from smoke_db import seed_promote_profile

    account, password = _guild_l1_creds(params)
    if not account:
        return {"ok": False, "error": "请先执行「创建一级」，或填写会长账号"}
    sms_scene = str(params.get("smsScene") or "").strip()
    cfg = load_channel_web_config()
    new_pwd = str(cfg.get("newPassword") or "CHANGE_ME")
    login_sms = sms_code if sms_scene in ("", "login") else ""

    login = _channel_login(account, password, login_sms)
    if not login.get("ok") and not login.get("needSms") and password != new_pwd:
        alt = _channel_login(account, new_pwd, login_sms)
        if alt.get("ok") or alt.get("needSms"):
            login = alt
            password = new_pwd
    if login.get("needSms"):
        login["smsScene"] = "login"
        login["account"] = account
        login["password"] = password
        return login
    if not login.get("ok"):
        return login

    cookies = login.get("cookies") or {}
    steps: dict[str, Any] = {"login": {"ok": True}}
    if password != new_pwd:
        changed = channel_change_password(
            old_password=password,
            new_password=new_pwd,
            session_cookies=cookies,
            cfg=cfg,
        )
        steps["changePassword"] = {k: changed.get(k) for k in ("ok", "error", "httpStatus")}
        if changed.get("ok"):
            password = new_pwd
        elif "不正确" in str(changed.get("error") or "") or "旧密码" in str(changed.get("error") or ""):
            password = new_pwd
            steps["changePassword"]["skipped"] = True
        else:
            return {
                "ok": False,
                "error": changed.get("error") or "会长改密失败",
                "account": account,
                "password": password,
                "steps": steps,
            }
    else:
        steps["changePassword"] = {"ok": True, "skipped": True}

    profile_sms = sms_code if sms_scene == "updateinfo" else ""
    profile = complete_profile_with_sms(
        session_cookies=cookies,
        sms_code=profile_sms or None,
        cfg=cfg,
        skip_send=bool(profile_sms),
    )
    if profile.get("needSms") and not profile_sms:
        uni = get_universal_sms_code()
        if uni:
            profile = complete_profile_with_sms(
                session_cookies=cookies,
                sms_code=uni,
                cfg=cfg,
                skip_send=True,
            )
            profile["usedUniversalSms"] = uni
    if profile.get("needSms"):
        profile["smsScene"] = "updateinfo"
        profile["account"] = account
        profile["password"] = password
        profile["steps"] = steps
        return profile

    if not profile.get("ok"):
        err_msg = str(profile.get("error") or "")
        send_sms = profile.get("sendSms") if isinstance(profile.get("sendSms"), dict) else {}
        send_status = int(send_sms.get("httpStatus") or 0)
        use_db = (
            "实名" in err_msg
            or "验证码" in err_msg
            or "HTML" in err_msg
            or send_status in (404, 500, 502, 503)
            or int(profile.get("httpStatus") or 0) in (404, 500, 502, 503)
        )
        if use_db:
            defaults = cfg.get("profileDefaults") if isinstance(cfg.get("profileDefaults"), dict) else {}
            bypass = seed_promote_profile(
                account,
                defaults,
                source_db=target,
                id_card_front=str(cfg.get("idCardFront") or ""),
                id_card_back=str(cfg.get("idCardBack") or ""),
            )
            steps["profileBypass"] = bypass
            if bypass.get("ok"):
                _record_artifact("一级会长", account, password, target, "造数脚本·F3完善信息(库写入)")
                return {
                    "ok": True,
                    "account": account,
                    "password": password,
                    "note": "完善信息接口不可用/实名失败，已库写入跳过",
                    "steps": steps,
                    "bypass": bypass,
                }
            err_msg = f"{err_msg}；库写入也失败: {bypass.get('error')}"
        return {"ok": False, "error": err_msg or "完善信息失败", "account": account, "password": password, "steps": steps}

    _record_artifact("一级会长", account, password, target, "造数脚本·F3登录改密完善")
    return {"ok": True, "account": account, "password": password, "steps": steps, "profile": {"ok": True}}


def _run_guild_approve_l1(target: str, params: dict) -> dict:
    """F4：OA 审核会长通过。"""
    from oa_promote_api import approve_promote
    from smoke_db import execute_write, lookup_promote_id, resolve_database

    account, _password = _guild_l1_creds(params)
    if not account:
        return {"ok": False, "error": "请先执行「创建一级」，或填写会长账号"}
    looked = lookup_promote_id(account, source_db=target)
    if not looked.get("ok"):
        return {"ok": False, "error": looked.get("error") or "查不到会长 ID", "lookup": looked}
    # F3 库写入也可能把 status 置 0，但不等于 OA 已审；必须打 changeStatus
    result = approve_promote(promote_id=looked.get("promoteId"), db_name=target, status=0)
    if not result.get("ok"):
        err_msg = str(result.get("error") or "")
        if "审核推广员" in err_msg or "推广员错误" in err_msg:
            try:
                db = resolve_database(target)
                execute_write(
                    f"UPDATE `{db}`.tab_promote SET status=0 WHERE id=%s",
                    params=(int(looked.get("promoteId")),),
                )
                return {
                    "ok": True,
                    "account": account,
                    "promoteId": looked.get("promoteId"),
                    "bypassed": True,
                    "note": "OA 审核失败，已库写入 status=0",
                    "error": err_msg,
                }
            except Exception as exc:
                return {"ok": False, "error": f"{err_msg}；库写入也失败: {exc}", "oa": result}
        return {"ok": False, "error": err_msg or "OA 审核会长失败", "oa": result, "account": account}
    result["account"] = account
    result["promoteId"] = looked.get("promoteId")
    return result


def _run_guild_apply_l1(target: str, params: dict, sms_code: str) -> dict:
    """F5：会长申请游戏。"""
    from channel_web_api import channel_apply_game, load_channel_web_config

    account, password = _guild_l1_creds(params)
    if not account:
        return {"ok": False, "error": "请先执行「创建一级」，或填写会长账号"}
    cfg = load_channel_web_config()
    new_pwd = str(cfg.get("newPassword") or "CHANGE_ME")
    login = _channel_login(account, password, sms_code)
    if not login.get("ok") and not login.get("needSms") and password != new_pwd:
        alt = _channel_login(account, new_pwd, sms_code)
        if alt.get("ok") or alt.get("needSms"):
            login = alt
            password = new_pwd
    if login.get("needSms"):
        login["smsScene"] = "login"
        login["account"] = account
        login["password"] = password
        return login
    if not login.get("ok"):
        return login
    game_id = cfg.get("gameId") or 659
    result = channel_apply_game(game_id=game_id, session_cookies=login.get("cookies") or {}, cfg=cfg)
    result["account"] = account
    result["password"] = password
    if result.get("ok"):
        _record_artifact("一级会长", account, password, target, f"造数脚本·F5申请游戏 game_id={result.get('gameId') or game_id}")
    return result


def _run_guild_child(target: str, params: dict, level: int, sms_code: str) -> dict:
    from channel_web_api import channel_create_child, channel_login, get_universal_sms_code

    parent = str(params.get("parentAccount") or "").strip()
    parent_pwd = str(params.get("parentPassword") or "").strip()
    if not parent or not parent_pwd:
        return {"ok": False, "error": f"创建{'二' if level == 2 else '三'}级会长需要上级会长账号和密码"}
    login = channel_login(parent, parent_pwd, sms_code=sms_code or None)
    if login.get("needSms") and not sms_code:
        uni = get_universal_sms_code()
        if uni:
            login = channel_login(parent, parent_pwd, sms_code=uni)
            login["usedUniversalSms"] = uni
    if login.get("needSms"):
        return login
    if not login.get("ok"):
        return login
    prefix = "会长L2" if level == 2 else "会长L3"
    created = channel_create_child(
        session_cookies=login.get("cookies") or {},
        account_prefix=prefix,
        source_db=target,
        sms_code=sms_code or None,
        child_password=str(params.get("password") or "111111"),
    )
    if created.get("needSms") and not sms_code:
        uni = get_universal_sms_code()
        if uni:
            created = channel_create_child(
                session_cookies=login.get("cookies") or {},
                account_prefix=prefix,
                source_db=target,
                sms_code=uni,
                child_account=str(created.get("account") or "") or None,
                child_password=str(params.get("password") or "111111"),
            )
            created["usedUniversalSms"] = uni
    if created.get("ok"):
        _record_artifact(
            f"{'二' if level == 2 else '三'}级会长",
            str(created.get("account") or ""),
            str(created.get("password") or ""),
            target,
            f"造数脚本·会长L{level}",
        )
    return created


def _run_user_register(target: str, params: dict) -> dict:
    from game_sdk_api import sdk_register

    promote_id, promote_account = _resolve_user_promote(params, target)
    result = sdk_register(
        account=str(params.get("account") or "").strip() or None,
        password=str(params.get("password") or "123456"),
        promote_id=promote_id,
        promote_account=promote_account,
        source_db=target,
    )
    if result.get("ok"):
        bind = _bind_user_promote(str(result.get("account") or ""), promote_id, target)
        result["promoteBind"] = bind
        _record_artifact(
            "玩家",
            str(result.get("account") or ""),
            str(result.get("password") or ""),
            target,
            "造数脚本·注册",
            {"promoteId": promote_id, "promoteAccount": promote_account, "promoteBind": bind},
        )
    return result


def _run_user_login(target: str, params: dict) -> dict:
    from game_sdk_api import sdk_login

    account = str(params.get("account") or "").strip()
    password = str(params.get("password") or "123456")
    if not account:
        return {"ok": False, "error": "登录需要玩家账号"}
    promote_id, _acc = _resolve_user_promote(params, target)
    return sdk_login(
        account=account,
        password=password,
        promote_id=promote_id,
        source_db=target,
    )


def _run_user_idcard(target: str, params: dict) -> dict:
    from game_sdk_api import sdk_idcard, sdk_login

    account = str(params.get("account") or "").strip()
    password = str(params.get("password") or "123456")
    if not account:
        return {"ok": False, "error": "实名需要玩家账号（先注册/登录拿到会话）"}
    login = sdk_login(account=account, password=password, promote_id=_resolve_user_promote(params, target)[0], source_db=target)
    if not login.get("ok"):
        return {"ok": False, "error": login.get("error") or "登录失败，无法实名", "login": login}
    return sdk_idcard(
        user_id=str(login.get("userId") or ""),
        token=str(login.get("token") or ""),
        promote_id=_resolve_user_promote(params, target)[0],
        real_name=str(params.get("realName") or params.get("real_name") or "") or None,
        idcard=str(params.get("idcard") or params.get("idCard") or "") or None,
        source_db=target,
    )


def _run_user_role(target: str, params: dict) -> dict:
    from game_sdk_api import sdk_login, sdk_upload_role

    account = str(params.get("account") or "").strip()
    password = str(params.get("password") or "123456")
    if not account:
        return {"ok": False, "error": "上传角色需要玩家账号（先注册/登录拿到会话）"}
    login = sdk_login(account=account, password=password, promote_id=_resolve_user_promote(params, target)[0], source_db=target)
    if not login.get("ok"):
        return {"ok": False, "error": login.get("error") or "登录失败，无法上传角色", "login": login}
    result = sdk_upload_role(
        user_id=str(login.get("userId") or ""),
        token=str(login.get("token") or ""),
        promote_id=_resolve_user_promote(params, target)[0],
        source_db=target,
    )
    if result.get("ok"):
        result["account"] = account
        result["playerRole"] = "已上传角色"
    return result


def _run_user_pay(target: str, params: dict) -> dict:
    from game_sdk_api import sdk_create_pay_order, sdk_login

    account = str(params.get("account") or "").strip()
    password = str(params.get("password") or "123456")
    if not account:
        return {"ok": False, "error": "充值需要玩家账号"}
    login = sdk_login(account=account, password=password, promote_id=_resolve_user_promote(params, target)[0], source_db=target)
    if not login.get("ok"):
        return {"ok": False, "error": login.get("error") or "登录失败，无法下单", "login": login}
    return sdk_create_pay_order(
        account=account,
        user_id=str(login.get("userId") or ""),
        token=str(login.get("token") or ""),
        promote_id=_resolve_user_promote(params, target)[0],
        source_db=target,
    )


def _run_user_callback(target: str, params: dict) -> dict:
    import json as _json
    from urllib.request import Request, urlopen

    account = str(params.get("account") or "").strip()
    if not account:
        return {"ok": False, "error": "回调充值需要玩家账号"}
    db_name = {"lx": "game_lx", "yq": "game_yq", "hw": "game_hw"}.get(target, f"game_{target}")
    try:
        import sys

        host = sys.modules.get("__main__")
        ensure_fn = getattr(host, "ensure_recharge_callback_running", None)
        if ensure_fn is None:
            import app as workbench_app

            ensure_fn = workbench_app.ensure_recharge_callback_running
        ok, status = ensure_fn(force_restart=False)
    except Exception as exc:
        ok, status = False, str(exc)
    if not ok:
        return {"ok": False, "error": f"充值回调模拟服务未就绪: {status}"}
    req_body = {
        "account": account,
        "database": db_name,
        "callbackType": "game",
        "notifyStatus": "success",
    }
    body = _json.dumps(req_body, ensure_ascii=False).encode("utf-8")
    url = "http://127.0.0.1:3780/api/simulate-recharge"
    req = Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            http_status = getattr(resp, "status", None) or resp.getcode()
        payload = _json.loads(raw) if raw else {}
        return {
            "ok": bool(payload.get("ok", True)),
            "url": url,
            "path": "/api/simulate-recharge",
            "httpStatus": int(http_status or 0),
            "request": req_body,
            "response": payload,
            "account": account,
            "database": db_name,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "account": account, "url": url, "request": req_body}


def _run_user_commission(target: str, params: dict) -> dict:
    from money_flow import assert_commission

    account = str(params.get("account") or "").strip()
    if not account:
        return {"ok": False, "error": "分佣核对需要玩家账号"}
    promote_id = params.get("promoteId") or params.get("promote_id") or ""
    game_id = params.get("gameId") or params.get("game_id") or ""
    if not promote_id:
        from smoke_db import execute_select, load_db_config

        rows = execute_select(
            "SELECT promote_id, game_id FROM tab_spend WHERE user_account=%s ORDER BY id DESC LIMIT 1",
            cfg=load_db_config(),
            params=(account,),
        )
        if rows:
            promote_id = rows[0].get("promote_id")
            game_id = game_id or rows[0].get("game_id")
    return assert_commission(
        account=account,
        promote_id=promote_id,
        game_id=game_id or None,
        source_db=target,
    )
