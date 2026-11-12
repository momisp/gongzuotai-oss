# -*- coding: utf-8 -*-
"""OA · 渠道商务（tabPromoteBusiness）接口客户端。

体系区分（重要）：
- 本模块 = OA「渠道/推广商务」：http://oa.example.com · tabPromoteBusiness
- 另一套 = 遨游「新商务」后台（RuoYi/冒烟 S2 那条），后续单独模块，勿混用
"""
from __future__ import annotations

import json
import ssl
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "oa_promote_config.json"
EXAMPLE_FILE = DATA_DIR / "oa_promote_config.example.json"

# 忽略自签证书（curl --insecure）
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def load_oa_promote_config() -> dict:
    path = CONFIG_FILE if CONFIG_FILE.is_file() else EXAMPLE_FILE
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_oa_promote_config(updates: dict | None = None) -> dict:
    """合并写入 OA 渠道商务配置（账号/密码/造数前缀等）。"""
    cfg = load_oa_promote_config()
    updates = updates if isinstance(updates, dict) else {}
    for key, val in updates.items():
        if key == "createDefaults" and isinstance(val, dict):
            base = cfg.get("createDefaults") if isinstance(cfg.get("createDefaults"), dict) else {}
            merged = {**base, **val}
            cfg["createDefaults"] = merged
        else:
            cfg[key] = val
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return cfg


def _http_json(
    method: str,
    url: str,
    body: dict | None = None,
    headers: dict | None = None,
    timeout: int = 30,
) -> tuple[int, dict | str]:
    raw = None
    if body is not None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=raw, headers=headers or {}, method=method.upper())
    try:
        with urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            code = resp.status
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        code = exc.code
    except (URLError, TimeoutError, OSError) as exc:
        return 0, str(exc)
    try:
        return code, json.loads(text) if text else {}
    except json.JSONDecodeError:
        return code, text


def _extract_token(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    data = payload.get("data")
    if isinstance(data, dict):
        for key in ("token", "x-token", "Token", "access_token"):
            if data.get(key):
                return str(data[key])
        user = data.get("user")
        if isinstance(user, dict) and user.get("token"):
            return str(user["token"])
    for key in ("token", "x-token"):
        if payload.get(key):
            return str(payload[key])
    return ""


def _ua(cfg: dict) -> str:
    return str(
        cfg.get("userAgent")
        or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Electron/17.4.11 Safari/537.36"
    )


def _auth_headers(token: str, cfg: dict) -> dict:
    return {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Language": "zh-CN",
        "x-token": str(token or ""),
        "User-Agent": _ua(cfg),
    }


def _ensure_token(token: str | None, cfg: dict) -> dict:
    token = str(token or "").strip()
    if token:
        return {"ok": True, "token": token}
    login = oa_login(cfg)
    if not login.get("ok"):
        return {"ok": False, "error": login.get("error") or "登录失败", "login": login}
    token = str(login.get("token") or "")
    if not token:
        return {"ok": False, "error": "缺少 OA token"}
    return {"ok": True, "token": token, "login": login}


def oa_login(cfg: dict | None = None) -> dict:
    """登录拿 x-token。失效后任何业务接口前都应再调一次。"""
    cfg = cfg or load_oa_promote_config()
    base = str(cfg.get("baseUrl") or "http://oa.example.com").rstrip("/")
    login_path = str(cfg.get("loginPath") or "/api/base/login")
    user = str((cfg.get("username") or "")).strip()
    pwd = str(cfg.get("password") or "")
    if not user or not pwd:
        return {"ok": False, "error": "未配置 OA 账号（oa_promote_config.json）"}
    headers = {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Language": "zh-CN",
        "User-Agent": str(
            cfg.get("userAgent")
            or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Electron/17.4.11 Safari/537.36"
        ),
    }
    # 部分环境登录也带旧 token；没有则不传
    old = str(cfg.get("xToken") or "").strip()
    if old:
        headers["x-token"] = old
    code, payload = _http_json("POST", f"{base}{login_path}", {"username": user, "password": pwd}, headers)
    if code != 200:
        return {"ok": False, "error": f"OA 登录 HTTP {code}", "response": payload}
    if isinstance(payload, dict):
        biz_code = payload.get("code")
        # gin-vue-admin 常用 0 成功；也有 200
        if biz_code not in (None, 0, 200, "0", "200"):
            return {
                "ok": False,
                "error": str(payload.get("msg") or payload.get("message") or f"登录业务码 {biz_code}"),
                "response": payload,
            }
    token = _extract_token(payload)
    if not token:
        return {"ok": False, "error": "登录成功但未解析到 token", "response": payload}
    return {"ok": True, "token": token, "response": payload}


def _parse_list_rows(payload: Any) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for key in ("list", "records", "rows"):
            rows = data.get(key)
            if isinstance(rows, list):
                return [x for x in rows if isinstance(x, dict)]
    return []


def list_promote_business(
    *,
    db_name: str = "lx",
    where: dict | None = None,
    field: list[str] | None = None,
    page: int = 1,
    page_size: int = 9999,
    token: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """HAR：POST /api/tabPromoteBusiness/list。"""
    cfg = cfg or load_oa_promote_config()
    auth = _ensure_token(token, cfg)
    if not auth.get("ok"):
        return auth
    token = str(auth["token"])
    db_name = str(db_name or "lx").strip().lower() or "lx"
    base = str(cfg.get("baseUrl") or "http://oa.example.com").rstrip("/")
    path = str(cfg.get("listBusinessPath") or "/api/tabPromoteBusiness/list")
    body = {
        "dbName": [db_name],
        "where": where if isinstance(where, dict) else {},
        "field": field or ["id", "account"],
        "page": int(page or 1),
        "pageSize": int(page_size or 9999),
    }
    code, payload = _http_json("POST", f"{base}{path}", body, _auth_headers(token, cfg))
    ok = code == 200
    if isinstance(payload, dict) and "code" in payload:
        ok = ok and payload.get("code") in (0, 200, "0", "200")
    rows = _parse_list_rows(payload) if ok else []
    return {
        "ok": bool(ok),
        "httpStatus": code,
        "items": rows,
        "response": payload,
        "error": "" if ok else str(
            (payload.get("msg") if isinstance(payload, dict) else None)
            or (payload.get("message") if isinstance(payload, dict) else None)
            or f"列表失败 HTTP {code}"
        ),
        "token": token,
    }


def lookup_business_id(
    account: str,
    *,
    db_name: str = "lx",
    level: int = 1,
    token: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """按账号找商务 id。先走 list 接口，再兜底查库。"""
    account = str(account or "").strip()
    if not account:
        return {"ok": False, "error": "缺少商务账号"}
    listed = list_promote_business(
        db_name=db_name,
        where={"status": 1, "level": int(level)},
        field=["id", "account"],
        token=token,
        cfg=cfg,
    )
    if listed.get("ok"):
        for row in listed.get("items") or []:
            if str(row.get("account") or "").strip() == account:
                try:
                    return {
                        "ok": True,
                        "id": int(row.get("id")),
                        "account": account,
                        "via": "list",
                        "token": listed.get("token"),
                    }
                except (TypeError, ValueError):
                    continue
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        cfg_db = load_db_config()
        db = resolve_database(db_name, cfg_db)
        conn = _connect(cfg_db, source_db=db_name)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id, account, level FROM `{db}`.tab_promote_business WHERE account=%s LIMIT 1",
                    (account,),
                )
                row = cur.fetchone() or {}
        finally:
            conn.close()
        if row.get("id") is not None:
            return {"ok": True, "id": int(row["id"]), "account": account, "level": row.get("level"), "via": "db"}
    except Exception as exc:
        if not listed.get("ok"):
            return {"ok": False, "error": listed.get("error") or str(exc), "list": listed}
    return {"ok": False, "error": f"未找到{level}级商务账号：{account}", "list": listed}


def create_promote_business(
    *,
    level: int = 1,
    db_name: str = "lx",
    account: str | None = None,
    password: str | None = None,
    real_name: str | None = None,
    mobile_phone: str | None = None,
    parent_account: str | None = None,
    commerce1: int | str | None = None,
    token: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """OA 创建渠道商务。HAR：POST /api/tabPromoteBusiness/add。

    一级：level=1
    二级：level=2 且带 commerce1=一级商务 id
    """
    cfg = cfg or load_oa_promote_config()
    defaults = cfg.get("createDefaults") if isinstance(cfg.get("createDefaults"), dict) else {}
    db_name = str(db_name or "lx").strip().lower() or "lx"
    level = int(level or 1)
    auth = _ensure_token(token, cfg)
    if not auth.get("ok"):
        return auth
    token = str(auth["token"])

    parent_id = None
    if level >= 2:
        if commerce1 not in (None, "", 0, "0"):
            try:
                parent_id = int(commerce1)
            except (TypeError, ValueError):
                return {"ok": False, "error": f"无效 commerce1: {commerce1}"}
        elif str(parent_account or "").strip():
            found = lookup_business_id(str(parent_account).strip(), db_name=db_name, level=level - 1, token=token, cfg=cfg)
            if not found.get("ok"):
                return found
            parent_id = int(found["id"])
            token = str(found.get("token") or token)
        else:
            return {"ok": False, "error": "创建二级需要一级商务账号（parentAccount）或 commerce1"}

    stamp = datetime.now().strftime("%m%d%H%M%S")
    default_prefix = {1: "商务L1", 2: "商务L2", 3: "商务L3"}.get(level, f"商务L{level}")
    raw_prefix = (account or defaults.get("accountPrefix") or default_prefix).strip()
    if raw_prefix in {"商务L1", "商务L2", "商务L3"} or not account:
        raw_prefix = default_prefix
    if "{{stamp}}" in raw_prefix:
        account = raw_prefix.replace("{{stamp}}", stamp)
    elif defaults.get("uniqueAccount", True) or not account:
        try:
            from biz_web_api import next_flow_account

            account = next_flow_account(raw_prefix, source_db=db_name, table="business")
        except Exception:
            account = f"{raw_prefix}_{stamp}"
    else:
        account = raw_prefix

    password = str(password if password is not None else defaults.get("password") or "111111")
    real_name = str(real_name if real_name is not None else defaults.get("real_name") or "自动化测试")
    mobile_phone = str(
        mobile_phone if mobile_phone is not None else defaults.get("mobile_phone") or cfg.get("username") or ""
    )

    row = {
        "dbName": db_name,
        "account": account,
        "password": password,
        "real_name": real_name,
        "mobile_phone": mobile_phone,
        "status": int(defaults.get("status") or 1),
        "level": level,
    }
    if parent_id is not None:
        row["commerce1"] = parent_id

    base = str(cfg.get("baseUrl") or "http://oa.example.com").rstrip("/")
    add_path = str(cfg.get("addBusinessPath") or "/api/tabPromoteBusiness/add")
    code, payload = _http_json("POST", f"{base}{add_path}", {"data": [row]}, _auth_headers(token, cfg))
    ok = code == 200
    if isinstance(payload, dict) and "code" in payload:
        ok = ok and payload.get("code") in (0, 200, "0", "200")
    return {
        "ok": ok,
        "system": "oa_promote",
        "httpStatus": code,
        "account": account,
        "password": password,
        "dbName": db_name,
        "level": level,
        "commerce1": parent_id,
        "parentAccount": str(parent_account or ""),
        "real_name": real_name,
        "mobile_phone": mobile_phone,
        "tokenUsed": True,
        "response": payload if isinstance(payload, (dict, list, str)) else str(payload),
        "error": "" if ok else str(
            (payload.get("msg") if isinstance(payload, dict) else None)
            or (payload.get("message") if isinstance(payload, dict) else None)
            or f"创建失败 HTTP {code}"
        ),
    }


def create_level1_business(
    *,
    db_name: str = "lx",
    account: str | None = None,
    password: str | None = None,
    real_name: str | None = None,
    mobile_phone: str | None = None,
    token: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """OA 创建一级渠道商务（tabPromoteBusiness/add）。"""
    return create_promote_business(
        level=1,
        db_name=db_name,
        account=account,
        password=password,
        real_name=real_name,
        mobile_phone=mobile_phone,
        token=token,
        cfg=cfg,
    )


def create_level2_business(
    *,
    parent_account: str | None = None,
    commerce1: int | str | None = None,
    db_name: str = "lx",
    account: str | None = None,
    password: str | None = None,
    real_name: str | None = None,
    mobile_phone: str | None = None,
    token: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """OA 创建二级渠道商务。HAR：add 时 level=2、commerce1=一级商务 id。"""
    return create_promote_business(
        level=2,
        db_name=db_name,
        account=account,
        password=password,
        real_name=real_name,
        mobile_phone=mobile_phone,
        parent_account=parent_account,
        commerce1=commerce1,
        token=token,
        cfg=cfg,
    )


def approve_promote(
    *,
    promote_id: int | str,
    db_name: str = "lx",
    status: int = 0,
    token: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """OA 渠道会长审核通过：tabPromote/changeStatus（HAR 中通过为 status=0）。"""
    cfg = cfg or load_oa_promote_config()
    base = str(cfg.get("baseUrl") or "http://oa.example.com").rstrip("/")
    path = str(cfg.get("changePromoteStatusPath") or "/api/tabPromote/changeStatus")

    token = str(token or "").strip()
    login = None
    if not token:
        login = oa_login(cfg)
        if not login.get("ok"):
            return {"ok": False, "error": login.get("error") or "登录失败", "login": login}
        token = str(login.get("token") or "")
    if not token:
        return {"ok": False, "error": "缺少 OA token"}

    try:
        pid = int(promote_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": f"无效 promote_id: {promote_id}"}

    db_name = str(db_name or "lx").strip().lower() or "lx"
    body = {"ids": [{"id": pid, "dbName": db_name}], "status": int(status)}
    headers = {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Language": "zh-CN",
        "x-token": token,
        "User-Agent": str(
            cfg.get("userAgent")
            or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Electron/17.4.11 Safari/537.36"
        ),
    }
    code, payload = _http_json("POST", f"{base}{path}", body, headers)
    ok = code == 200
    if isinstance(payload, dict) and "code" in payload:
        ok = ok and payload.get("code") in (0, 200, "0", "200")
    return {
        "ok": bool(ok),
        "system": "oa_promote",
        "httpStatus": code,
        "promoteId": pid,
        "dbName": db_name,
        "status": int(status),
        "response": payload,
        "error": "" if ok else str(
            (payload.get("msg") if isinstance(payload, dict) else None)
            or (payload.get("message") if isinstance(payload, dict) else None)
            or f"审核失败 HTTP {code}"
        ),
    }
