# -*- coding: utf-8 -*-
"""商务网页端（dev.example.com/business）· PHP 会话接口。

F2-1：商务登录
F2-2：商务创建一级会长（复用 F2-1 会话；无会话则先登录）
"""
from __future__ import annotations

import json
from datetime import datetime
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "biz_web_config.json"
EXAMPLE_FILE = DATA_DIR / "biz_web_config.example.json"

# 已在浏览器验证可跳过短信的设备码（可在主流程台修改）
DEFAULT_DEVICE_ID = "b2e3f89f-5453-456a-a87e-109dc9baa45c"


def load_biz_web_config() -> dict:
    path = CONFIG_FILE if CONFIG_FILE.is_file() else EXAMPLE_FILE
    data: dict = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except (OSError, json.JSONDecodeError):
            data = {}
    if not str(data.get("deviceId") or "").strip():
        data["deviceId"] = DEFAULT_DEVICE_ID
    return data


def save_biz_web_config(updates: dict) -> dict:
    cfg = load_biz_web_config()
    if not isinstance(updates, dict):
        return cfg
    for key in ("baseUrl", "origin", "deviceId", "needVerifyPath", "loginPath", "addPromotePath", "userAgent"):
        if key in updates and updates[key] is not None:
            cfg[key] = str(updates[key]).strip()
    if isinstance(updates.get("createDefaults"), dict):
        cur = cfg.get("createDefaults") if isinstance(cfg.get("createDefaults"), dict) else {}
        cur.update({k: updates["createDefaults"][k] for k in updates["createDefaults"]})
        cfg["createDefaults"] = cur
    if not str(cfg.get("deviceId") or "").strip():
        cfg["deviceId"] = DEFAULT_DEVICE_ID
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def _ua(cfg: dict) -> str:
    return str(
        cfg.get("userAgent")
        or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
    )


def _opener(cookie_dict: dict | None = None):
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))
    if cookie_dict:
        # 通过首次请求前写入：用简单 Cookie 头更稳
        pass
    return opener, jar


def _cookie_header(cookies: dict) -> str:
    return "; ".join(f"{k}={v}" for k, v in (cookies or {}).items() if k and v is not None)


_SENSITIVE_FORM_KEYS = frozenset(
    {"pwd", "password", "old_password", "code", "sms_code", "verify_code", "token"}
)


def _redact_form(form: dict | None) -> dict:
    out: dict = {}
    for k, v in (form or {}).items():
        if str(k).lower() in _SENSITIVE_FORM_KEYS:
            out[k] = "***" if v not in (None, "") else v
        else:
            out[k] = v
    return out


def _http_snap(url: str, form: dict, code: int, payload: Any) -> dict:
    resp = payload
    if isinstance(payload, str):
        resp = {"_raw": payload[:4000]}
    return {
        "url": url,
        "method": "POST",
        "httpStatus": int(code or 0),
        "request": _redact_form(form),
        "response": resp,
    }


def _post_form(
    opener,
    url: str,
    form: dict,
    *,
    referer: str,
    cfg: dict,
    extra_headers: dict | None = None,
    timeout: int = 30,
) -> tuple[int, Any, dict]:
    raw = urlencode(form).encode("utf-8")
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": str(cfg.get("origin") or "http://dev.example.com"),
        "Referer": referer,
        "User-Agent": _ua(cfg),
        "X-Requested-With": "XMLHttpRequest",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = Request(url, data=raw, headers=headers, method="POST")
    try:
        with opener.open(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            code = getattr(resp, "status", None) or resp.getcode()
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        code = exc.code
    except (URLError, TimeoutError, OSError) as exc:
        snap = _http_snap(url, form, 0, str(exc))
        return 0, str(exc), snap
    try:
        payload = json.loads(text) if text else {}
    except json.JSONDecodeError:
        payload = text
    snap = _http_snap(url, form, int(code or 0), payload)
    return int(code or 0), payload, snap


def _biz_ok(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    msg = str(payload.get("msg") or payload.get("message") or "")
    if any(x in msg for x in ("失败", "错误", "不正确", "不存在", "禁用", "验证码")):
        if "成功" not in msg:
            return False
    if "成功" in msg:
        return True
    code = payload.get("code", payload.get("status"))
    if code in (1, "1", 200, "200", True):
        return True
    if code in (0, "0") and not msg:
        return True
    if payload.get("url") or payload.get("jump"):
        return True
    return False


def biz_login(
    account: str,
    password: str,
    *,
    device_id: str | None = None,
    sms_code: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """needverifycode → login，保持 PHPSESSID。需要短信且未带码时返回 needSms。"""
    cfg = cfg or load_biz_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    account = str(account or "").strip()
    password = str(password or "")
    if not account or not password:
        return {"ok": False, "error": "缺少商务账号或密码"}

    device_id = str(device_id or cfg.get("deviceId") or DEFAULT_DEVICE_ID).strip() or DEFAULT_DEVICE_ID
    # 确保配置落盘固定设备码
    if str(cfg.get("deviceId") or "").strip() != device_id:
        save_biz_web_config({"deviceId": device_id})
        cfg = load_biz_web_config()

    opener, jar = _opener()
    form = {"account": account, "pwd": password, "device_id": device_id}
    referer = f"{base}/sw/index/login.html"

    try:
        req = Request(referer, headers={"User-Agent": _ua(cfg)}, method="GET")
        opener.open(req, timeout=20).read()
    except Exception:
        pass

    need_path = str(cfg.get("needVerifyPath") or "/business/index/needverifycode.html")
    login_path = str(cfg.get("loginPath") or "/business/index/login.html")

    need_url = f"{base}{need_path}"
    login_url = f"{base}{login_path}"
    code1, payload1, snap1 = _post_form(opener, need_url, form, referer=referer, cfg=cfg)
    need_flag = 0
    mobile = ""
    if isinstance(payload1, dict):
        data = payload1.get("data") if isinstance(payload1.get("data"), dict) else {}
        need_flag = int(data.get("needVerifyCode") or 0)
        mobile = str(data.get("mobile_phone") or "")

    sms_code = str(sms_code or "").strip()
    if need_flag == 1 and not sms_code:
        return {
            "ok": False,
            "needSms": True,
            "smsScene": "login",
            "account": account,
            "deviceId": device_id,
            "needVerifyCode": True,
            "mobile_phone": mobile,
            "mobile": mobile,
            "smsHint": f"商务登录需要短信验证码，请查手机后填入（{mobile or '未知'}）",
            "needVerify": snap1,
            "cookies": {c.name: c.value for c in jar},
            "error": f"商务登录需要短信验证码（手机 {mobile or '未知'}）",
        }

    login_form = dict(form)
    if sms_code:
        login_form["code"] = sms_code
        login_form["sms_code"] = sms_code
        login_form["verify_code"] = sms_code

    code2, payload2, snap2 = _post_form(opener, login_url, login_form, referer=referer, cfg=cfg)
    cookies = {c.name: c.value for c in jar}
    ok = _biz_ok(payload2)
    msg = str(payload2.get("msg") if isinstance(payload2, dict) else payload2 or "")
    if any(x in msg for x in ("失败", "错误", "不正确", "不能为空", "不存在", "禁用", "验证码")):
        if "成功" not in msg:
            ok = False
    if "成功" in msg:
        ok = True

    sms_required = (not ok) and any(
        x in msg for x in ("请先填写验证码", "请先短信验证码", "短信验证码验证", "填写验证码验证", "需要验证码")
    )
    if sms_required and not sms_code:
        return {
            "ok": False,
            "needSms": True,
            "smsScene": "login",
            "account": account,
            "deviceId": device_id,
            "needVerifyCode": True,
            "mobile_phone": mobile,
            "mobile": mobile,
            "smsHint": f"商务登录需要短信验证码，请查手机后填入（{mobile or '未知'}）",
            "needVerify": snap1,
            "login": snap2,
            "lastHttp": snap2,
            "cookies": cookies,
            "error": msg or f"商务登录需要短信验证码（手机 {mobile or '未知'}）",
        }

    return {
        "ok": bool(ok),
        "account": account,
        "deviceId": device_id,
        "needVerifyCode": False,
        "needSms": False,
        "cookies": cookies,
        "needVerify": snap1,
        "login": snap2,
        "lastHttp": snap2,
        "error": "" if ok else (msg or f"商务登录失败 HTTP {code2}"),
        "_opener": opener,
    }


def next_president_account(prefix: str = "会长L1", source_db: str = "lx") -> str:
    """统一账号：前缀_月日序号。例：会长L1_8131、会长L2_8131、商务L1_8131、玩家L1_8131。"""
    return next_flow_account(prefix, source_db=source_db, table="promote")


def next_flow_account(
    prefix: str,
    *,
    source_db: str = "lx",
    table: str = "promote",
) -> str:
    """按前缀在测库生成不撞名短账号：{prefix}_{月日}{序号}。"""
    prefix = str(prefix or "").strip().rstrip("_")
    if not prefix:
        prefix = "账号"
    now = datetime.now()
    md = f"{now.month}{now.day:02d}"
    base = f"{prefix}_{md}"
    next_n = 1
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        cfg = load_db_config()
        db = resolve_database(source_db, cfg)
        conn = _connect(cfg, source_db=source_db)
        try:
            with conn.cursor() as cur:
                if table == "user":
                    cur.execute(
                        f"SELECT account FROM `{db}`.tab_user WHERE account LIKE %s",
                        (f"{base}%",),
                    )
                elif table == "business":
                    cur.execute(
                        f"SELECT account FROM `{db}`.tab_promote_business WHERE account LIKE %s",
                        (f"{base}%",),
                    )
                else:
                    cur.execute(
                        f"SELECT account FROM `{db}`.tab_promote WHERE account LIKE %s",
                        (f"{base}%",),
                    )
                rows = cur.fetchall() or []
        finally:
            conn.close()
        import re

        max_n = 0
        pat = re.compile(rf"^{re.escape(base)}(\d+)$")
        for row in rows:
            m = pat.match(str((row or {}).get("account") or ""))
            if m:
                max_n = max(max_n, int(m.group(1)))
        next_n = max_n + 1
    except Exception:
        next_n = int(datetime.now().strftime("%H%M%S")) % 1000 or 1
    return f"{base}{next_n}"


def create_level1_president(
    *,
    biz_account: str = "",
    biz_password: str = "",
    president_account: str | None = None,
    president_password: str | None = None,
    session_cookies: dict | None = None,
    sms_code: str | None = None,
    source_db: str = "lx",
    cfg: dict | None = None,
) -> dict:
    """新增一级会长。优先复用 session_cookies；否则先 biz_login。"""
    cfg = cfg or load_biz_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    defaults = cfg.get("createDefaults") if isinstance(cfg.get("createDefaults"), dict) else {}

    login_info = None
    opener = None
    if session_cookies and session_cookies.get("PHPSESSID"):
        opener, _jar = _opener()
        cookie_hdr = _cookie_header(session_cookies)
    else:
        login_info = biz_login(biz_account, biz_password, sms_code=sms_code, cfg=cfg)
        if login_info.get("needSms"):
            return {k: v for k, v in login_info.items() if k != "_opener"}
        if not login_info.get("ok"):
            return {
                "ok": False,
                "error": login_info.get("error") or "商务登录失败",
                "login": {k: v for k, v in login_info.items() if k != "_opener"},
            }
        opener = login_info.get("_opener")
        cookie_hdr = ""
        session_cookies = login_info.get("cookies") or {}

    prefix = (president_account or defaults.get("accountPrefix") or "会长L1").strip()
    if defaults.get("uniqueAccount", True) or not president_account:
        president_account = next_president_account(prefix, source_db=source_db)
    else:
        president_account = prefix
    president_password = str(
        president_password if president_password is not None else defaults.get("password") or "111111"
    )

    add_path = str(cfg.get("addPromotePath") or "/business/promote/add.html")
    form = {
        "account": president_account,
        "password": president_password,
        "register_type": str(defaults.get("register_type") if defaults.get("register_type") is not None else "0"),
    }
    referer = f"{base}/sw/promote/add.html"
    extra = {"Cookie": cookie_hdr} if cookie_hdr else None
    add_url = f"{base}{add_path}"
    code, payload, snap = _post_form(opener, add_url, form, referer=referer, cfg=cfg, extra_headers=extra)

    ok = _biz_ok(payload)
    if not ok and code == 200 and isinstance(payload, dict):
        msg = str(payload.get("msg") or payload.get("message") or "")
        if "成功" in msg or payload.get("code") in (1, "1"):
            ok = True
        if any(x in msg for x in ("失败", "已存在", "错误")):
            ok = False

    out = {
        "ok": bool(ok),
        "system": "biz_web_promote",
        "bizAccount": biz_account or "",
        "account": president_account,
        "password": president_password,
        "level": 1,
        "register_type": form["register_type"],
        "httpStatus": code,
        "response": payload,
        "lastHttp": snap,
        "cookies": session_cookies,
        "error": "" if ok else str(
            (payload.get("msg") if isinstance(payload, dict) else None)
            or (payload.get("message") if isinstance(payload, dict) else None)
            or f"新增一级会长失败 HTTP {code}"
        ),
    }
    if login_info:
        out["login"] = {k: v for k, v in login_info.items() if k != "_opener"}
    return out
