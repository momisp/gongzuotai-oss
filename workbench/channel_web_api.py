# -*- coding: utf-8 -*-
"""会长网页端（dev.example.com/channelsite · /tg）。

F3-1：登录（needverifycode + login；需短信时由主流程台弹窗手填）
F3-2：改密（promote/base_info）
F3-3：完善信息（send_sms 弹窗填码 + updateinfo；证件用配置固定路径，跳过上传/OCR）
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from biz_web_api import (
    _biz_ok,
    _cookie_header,
    _opener,
    _post_form,
    _ua,
)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "channel_web_config.json"
EXAMPLE_FILE = DATA_DIR / "channel_web_config.example.json"

# 会长端常用设备码（与商务端可不同）
DEFAULT_CHANNEL_DEVICE_ID = "dcdef95c-cb19-44b6-b118-c773ef8a5716"

# 测试环境短信万能码（免看手机）
DEFAULT_SMS_UNIVERSAL_CODE = "888999"

# 测试环境已存在的证件图路径（跳过每次上传/OCR）
DEFAULT_ID_CARD_PATH = "channelsite/20260813/a44837a08c48ca5c4dfdf2ff592368a5.jpg"


def load_channel_web_config() -> dict:
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
        data["deviceId"] = DEFAULT_CHANNEL_DEVICE_ID
    if not str(data.get("smsUniversalCode") or "").strip():
        data["smsUniversalCode"] = DEFAULT_SMS_UNIVERSAL_CODE
    if str(data.get("useUniversalSms") or "1").strip() in {"", "1", "true", "True", "yes"}:
        data["useUniversalSms"] = True
    else:
        data["useUniversalSms"] = False
    if not str(data.get("idCardFront") or "").strip():
        data["idCardFront"] = DEFAULT_ID_CARD_PATH
    if not str(data.get("idCardBack") or "").strip():
        data["idCardBack"] = DEFAULT_ID_CARD_PATH
    if not str(data.get("gameId") or "").strip():
        data["gameId"] = "659"
    profile = data.get("profileDefaults") if isinstance(data.get("profileDefaults"), dict) else {}
    data["profileDefaults"] = {
        "real_name": str(profile.get("real_name") or "测试实名"),
        "id_card_no": str(profile.get("id_card_no") or "110101199001011234"),
        "mobile_phone": str(profile.get("mobile_phone") or ""),
        "address": str(profile.get("address") or "测试省测试市测试区测试路1号"),
        "email": str(profile.get("email") or "test@qq.com"),
        "settment_type": str(profile.get("settment_type") if profile.get("settment_type") is not None else "1"),
        "alipay_name": str(profile.get("alipay_name") or profile.get("real_name") or "测试实名"),
        "alipay_account": str(profile.get("alipay_account") or profile.get("mobile_phone") or ""),
        "register_type": str(profile.get("register_type") if profile.get("register_type") is not None else "0"),
    }
    if not str(data.get("newPassword") or "").strip():
        data["newPassword"] = "CHANGE_ME"
    return data


def get_universal_sms_code(cfg: dict | None = None) -> str:
    """测试环境万能短信验证码；未开启则返回空。"""
    cfg = cfg or load_channel_web_config()
    if not cfg.get("useUniversalSms", True):
        return ""
    return str(cfg.get("smsUniversalCode") or DEFAULT_SMS_UNIVERSAL_CODE).strip()


def save_channel_web_config(updates: dict) -> dict:
    cfg = load_channel_web_config()
    if not isinstance(updates, dict):
        return cfg
    for key in (
        "baseUrl",
        "origin",
        "deviceId",
        "newPassword",
        "idCardFront",
        "idCardBack",
        "gameId",
        "needVerifyPath",
        "loginPath",
        "baseInfoPath",
        "sendSmsPath",
        "updateInfoPath",
        "contractPath",
        "applyGamePath",
        "addChildPath",
        "agreementPath",
        "smsUniversalCode",
        "userAgent",
    ):
        if key in updates and updates[key] is not None:
            cfg[key] = str(updates[key]).strip()
    if "useUniversalSms" in updates and updates["useUniversalSms"] is not None:
        cfg["useUniversalSms"] = bool(updates["useUniversalSms"])
    if not str(cfg.get("smsUniversalCode") or "").strip():
        cfg["smsUniversalCode"] = DEFAULT_SMS_UNIVERSAL_CODE
    if "useUniversalSms" not in cfg:
        cfg["useUniversalSms"] = True
    if not str(cfg.get("gameId") or "").strip():
        cfg["gameId"] = "659"
    if isinstance(updates.get("profileDefaults"), dict):
        cur = cfg.get("profileDefaults") if isinstance(cfg.get("profileDefaults"), dict) else {}
        cur.update({k: updates["profileDefaults"][k] for k in updates["profileDefaults"]})
        cfg["profileDefaults"] = cur
    if not str(cfg.get("deviceId") or "").strip():
        cfg["deviceId"] = DEFAULT_CHANNEL_DEVICE_ID
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def _cookies_from_jar(jar) -> dict:
    return {c.name: c.value for c in jar}


def _looks_like_html(text: str) -> bool:
    s = str(text or "").lstrip().lower()
    return s.startswith("<!doctype") or s.startswith("<html") or "404.css" in s


def _short_http_error(payload: Any, http_status: int, fallback: str) -> str:
    """把对方返回的 HTML 错误页收成可读短句，避免前端 alert 整页源码。"""
    if isinstance(payload, dict):
        msg = str(payload.get("msg") or payload.get("message") or "").strip()
        if msg and not _looks_like_html(msg):
            return msg
        return fallback + (f" HTTP {http_status}" if http_status else "")
    text = str(payload or "").strip()
    if _looks_like_html(text):
        hint = "页面不存在/路由未命中" if ("404" in text or "不存在" in text) else "非 JSON 错误页"
        return f"{fallback}：对方返回 HTML（{hint}，HTTP {http_status or '?'}）"
    if text:
        return text[:200]
    return fallback + (f" HTTP {http_status}" if http_status else "")


def channel_login(
    account: str,
    password: str,
    *,
    device_id: str | None = None,
    sms_code: str | None = None,
    cfg: dict | None = None,
) -> dict:
    """needverifycode → login。needVerifyCode=1 且未传 sms_code 时返回 needSms。"""
    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    account = str(account or "").strip()
    password = str(password or "")
    if not account or not password:
        return {"ok": False, "error": "缺少会长账号或密码"}

    device_id = str(device_id or cfg.get("deviceId") or DEFAULT_CHANNEL_DEVICE_ID).strip() or DEFAULT_CHANNEL_DEVICE_ID
    opener, jar = _opener()
    form = {"account": account, "password": password, "redirect": "", "device_id": device_id}
    referer = f"{base}/tg"

    try:
        from urllib.request import Request

        req = Request(referer, headers={"User-Agent": _ua(cfg)}, method="GET")
        opener.open(req, timeout=20).read()
    except Exception:
        pass

    need_path = str(cfg.get("needVerifyPath") or "/channelsite/index/needverifycode.html")
    login_path = str(cfg.get("loginPath") or "/channelsite/index/login.html")

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
            "mobile": mobile,
            "smsHint": "会长登录需要短信验证码，请查手机后填入",
            "needVerify": snap1,
            "cookies": _cookies_from_jar(jar),
            "error": f"会长登录需要短信验证码（手机 {mobile or '未知'}）",
        }

    login_form = dict(form)
    if sms_code:
        # 兼容常见字段名
        login_form["code"] = sms_code
        login_form["sms_code"] = sms_code
        login_form["verify_code"] = sms_code

    code2, payload2, snap2 = _post_form(opener, login_url, login_form, referer=referer, cfg=cfg)
    cookies = _cookies_from_jar(jar)
    ok = _biz_ok(payload2)
    msg = str(payload2.get("msg") if isinstance(payload2, dict) else payload2 or "")
    if any(x in msg for x in ("失败", "错误", "不正确", "不能为空", "不存在", "禁用", "验证码")):
        if "成功" not in msg:
            ok = False
    if "成功" in msg:
        ok = True

    # 登录接口直接提示要短信，但 needverify 未标 needVerifyCode=1 时，仍要走短信半自动
    sms_required = (not ok) and any(
        x in msg for x in ("请先填写验证码", "请先短信验证码", "短信验证码验证", "填写验证码验证")
    )
    if sms_required and not sms_code:
        return {
            "ok": False,
            "needSms": True,
            "smsScene": "login",
            "account": account,
            "deviceId": device_id,
            "mobile": mobile,
            "smsHint": "会长登录需要短信验证码，请查手机后填入",
            "needVerify": snap1,
            "login": snap2,
            "lastHttp": snap2,
            "cookies": cookies,
            "error": msg or "会长登录需要短信验证码",
        }

    return {
        "ok": bool(ok),
        "needSms": False,
        "account": account,
        "deviceId": device_id,
        "mobile": mobile,
        "cookies": cookies,
        "needVerify": snap1,
        "login": snap2,
        "lastHttp": snap2,
        "error": "" if ok else (msg or f"会长登录失败 HTTP {code2}"),
    }


def channel_change_password(
    *,
    old_password: str,
    new_password: str,
    session_cookies: dict,
    cfg: dict | None = None,
) -> dict:
    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    path = str(cfg.get("baseInfoPath") or "/channelsite/promote/base_info.html")
    opener, _jar = _opener()
    form = {
        "old_password": str(old_password or ""),
        "password": str(new_password or ""),
        "password_confirm": str(new_password or ""),
        "tab": "3",
    }
    referer = f"{base}/tg/promote/base_info.html"
    extra = {"Cookie": _cookie_header(session_cookies)} if session_cookies else None
    req_url = f"{base}{path}"
    code, payload, snap = _post_form(opener, req_url, form, referer=referer, cfg=cfg, extra_headers=extra)
    ok = _biz_ok(payload)
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    if "成功" in msg:
        ok = True
    if any(x in msg for x in ("失败", "错误", "不正确")):
        ok = False
    return {
        "ok": bool(ok),
        "httpStatus": code,
        "response": payload,
        "lastHttp": snap,
        "newPassword": new_password,
        "error": "" if ok else (msg or f"改密失败 HTTP {code}"),
    }


def channel_send_sms(
    mobile: str,
    *,
    session_cookies: dict,
    cfg: dict | None = None,
) -> dict:
    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    path = str(cfg.get("sendSmsPath") or "/channelsite/index/send_sms.html")
    mobile = str(mobile or "").strip()
    if not mobile:
        return {"ok": False, "error": "缺少手机号"}
    opener, _jar = _opener()
    referer = f"{base}/tg/promote/base_info.html"
    extra = {"Cookie": _cookie_header(session_cookies)} if session_cookies else None
    req_url = f"{base}{path}"
    code, payload, snap = _post_form(
        opener,
        req_url,
        {"mobile": mobile},
        referer=referer,
        cfg=cfg,
        extra_headers=extra,
    )
    ok = _biz_ok(payload)
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    if "成功" in msg or "发送" in msg:
        ok = True
    if any(x in msg for x in ("失败", "错误", "频繁", "不正确")):
        ok = False
    if _looks_like_html(payload if not isinstance(payload, dict) else msg) or code in (404, 500, 502, 503):
        ok = False
    return {
        "ok": bool(ok),
        "mobile": mobile,
        "httpStatus": code,
        "response": payload if isinstance(payload, dict) else (str(payload)[:300] if payload else ""),
        "lastHttp": snap,
        "error": "" if ok else _short_http_error(payload, code, "发送短信失败"),
    }


def channel_update_info(
    *,
    session_cookies: dict,
    sms_code: str,
    profile: dict | None = None,
    cfg: dict | None = None,
) -> dict:
    """提交完善信息（证件用配置固定路径，不走上传/OCR）。"""
    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    path = str(cfg.get("updateInfoPath") or "/channelsite/index/updateinfo.html")
    defaults = cfg.get("profileDefaults") if isinstance(cfg.get("profileDefaults"), dict) else {}
    profile = {**defaults, **(profile or {})}
    sms_code = str(sms_code or "").strip()
    if not sms_code:
        return {"ok": False, "needSms": True, "error": "缺少短信验证码"}

    form = {
        "id_card_front": str(cfg.get("idCardFront") or DEFAULT_ID_CARD_PATH),
        "id_card_back": str(cfg.get("idCardBack") or DEFAULT_ID_CARD_PATH),
        "real_name": str(profile.get("real_name") or ""),
        "id_card_no": str(profile.get("id_card_no") or ""),
        "mobile_phone": str(profile.get("mobile_phone") or ""),
        "sms_code": sms_code,
        "address": str(profile.get("address") or ""),
        "email": str(profile.get("email") or ""),
        "settment_type": str(profile.get("settment_type") if profile.get("settment_type") is not None else "1"),
        "alipay_name": str(profile.get("alipay_name") or profile.get("real_name") or ""),
        "alipay_account": str(profile.get("alipay_account") or profile.get("mobile_phone") or ""),
        "register_type": str(profile.get("register_type") if profile.get("register_type") is not None else "0"),
    }
    opener, _jar = _opener()
    referer = f"{base}/tg/promote/base_info.html"
    extra = {"Cookie": _cookie_header(session_cookies)} if session_cookies else None
    req_url = f"{base}{path}"
    code, payload, snap = _post_form(opener, req_url, form, referer=referer, cfg=cfg, extra_headers=extra)
    ok = _biz_ok(payload)
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    if "成功" in msg:
        ok = True
    if any(x in msg for x in ("失败", "错误", "不正确", "验证码")):
        ok = False

    # 合同刷新（HAR 里有；失败不阻断主结果）
    contract = None
    if ok:
        cpath = str(cfg.get("contractPath") or "/channelsite/contract/contract_afresh.html")
        try:
            ccode, cpayload, csnap = _post_form(
                opener,
                f"{base}{cpath}",
                {},
                referer=referer,
                cfg=cfg,
                extra_headers=extra,
            )
            contract = csnap
        except Exception as exc:
            contract = {"error": str(exc)}

    if _looks_like_html(payload if not isinstance(payload, dict) else msg) or code in (404, 500, 502, 503):
        ok = False
    return {
        "ok": bool(ok),
        "httpStatus": code,
        "response": payload if isinstance(payload, dict) else (str(payload)[:300] if payload else ""),
        "lastHttp": snap,
        "form": {k: v for k, v in form.items() if k != "sms_code"},
        "contract": contract,
        "error": "" if ok else _short_http_error(payload, code, "完善信息失败"),
    }


def complete_profile_with_sms(
    *,
    session_cookies: dict,
    sms_code: str | None = None,
    profile: dict | None = None,
    cfg: dict | None = None,
    skip_send: bool = False,
) -> dict:
    """发短信（若未带码）或提交完善信息。未带码时返回 needSms 给前端弹窗。"""
    cfg = cfg or load_channel_web_config()
    defaults = cfg.get("profileDefaults") if isinstance(cfg.get("profileDefaults"), dict) else {}
    profile = {**defaults, **(profile or {})}
    mobile = str(profile.get("mobile_phone") or "").strip()
    sms_code = str(sms_code or "").strip()

    if not sms_code:
        if not mobile:
            return {"ok": False, "error": "完善信息缺少手机号（请在左侧测试数据填写）"}
        if not skip_send:
            sent = channel_send_sms(mobile, session_cookies=session_cookies, cfg=cfg)
            if not sent.get("ok"):
                return {
                    "ok": False,
                    "error": sent.get("error") or "发送短信失败",
                    "sendSms": sent,
                }
        else:
            sent = {"ok": True, "skipped": True, "mobile": mobile}
        return {
            "ok": False,
            "needSms": True,
            "smsScene": "updateinfo",
            "mobile": mobile,
            "smsHint": "完善信息短信已发送，请查手机后填入验证码",
            "sendSms": sent,
            "error": f"等待短信验证码（手机 {mobile}）",
        }

    updated = channel_update_info(
        session_cookies=session_cookies,
        sms_code=sms_code,
        profile=profile,
        cfg=cfg,
    )
    return updated


def channel_create_child(
    *,
    session_cookies: dict,
    child_account: str | None = None,
    child_password: str = "111111",
    mobile: str | None = None,
    sms_code: str | None = None,
    email: str = "",
    mark1: str = "",
    account_prefix: str = "二级会长",
    source_db: str = "lx",
    cfg: dict | None = None,
) -> dict:
    """一级/二级会长在 channelsite 创建下级：POST /channelsite/promote/add_chlid.html（官方拼写 chlid）。"""
    from biz_web_api import next_president_account

    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    path = str(cfg.get("addChildPath") or "/channelsite/promote/add_chlid.html")
    if not session_cookies or not session_cookies.get("PHPSESSID"):
        return {"ok": False, "error": "缺少上级会长登录会话"}

    defaults = cfg.get("profileDefaults") if isinstance(cfg.get("profileDefaults"), dict) else {}
    mobile = str(mobile or defaults.get("mobile_phone") or "").strip()
    sms_code = str(sms_code or "").strip()
    child_password = str(child_password or "111111")
    prefix = str(account_prefix or "二级会长").strip() or "二级会长"

    if not child_account:
        child_account = next_president_account(prefix, source_db=source_db)
    else:
        child_account = str(child_account).strip()

    if not sms_code:
        if not mobile:
            return {"ok": False, "error": "创建下级缺少手机号（左侧完善信息手机号）"}
        sent = channel_send_sms(mobile, session_cookies=session_cookies, cfg=cfg)
        if not sent.get("ok"):
            return {
                "ok": False,
                "error": sent.get("error") or "发送短信失败",
                "sendSms": sent,
                "account": child_account,
                "password": child_password,
                "mobile": mobile,
            }
        return {
            "ok": False,
            "needSms": True,
            "smsScene": "add_child",
            "mobile": mobile,
            "account": child_account,
            "password": child_password,
            "smsHint": f"创建下级会长短信已发送，请查手机后填入（将创建 {child_account}）",
            "sendSms": sent,
            "error": f"等待短信验证码（手机 {mobile}）",
        }

    form = {
        "account": child_account,
        "password": child_password,
        "password_confirm": child_password,
        "second_pwd": "",
        "real_name": "",
        "mobile_phone": mobile,
        "code": sms_code,
        "email": str(email or ""),
        "mark1": str(mark1 or ""),
    }
    opener, _jar = _opener()
    referer = f"{base}/tg/promote/add_chlid.html"
    extra = {"Cookie": _cookie_header(session_cookies)}
    req_url = f"{base}{path}"
    code, payload, snap = _post_form(opener, req_url, form, referer=referer, cfg=cfg, extra_headers=extra)
    ok = _biz_ok(payload)
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    if "成功" in msg:
        ok = True
    if any(x in msg for x in ("失败", "错误", "已存在", "不正确", "验证码")):
        ok = False
    if _looks_like_html(payload if not isinstance(payload, dict) else msg) or code in (404, 500, 502, 503):
        ok = False
    return {
        "ok": bool(ok),
        "account": child_account,
        "password": child_password,
        "mobile": mobile,
        "httpStatus": code,
        "response": payload if isinstance(payload, dict) else (str(payload)[:300] if payload else ""),
        "lastHttp": snap,
        "error": "" if ok else _short_http_error(payload, code, "创建下级会长失败"),
    }


def channel_agreement_rule(
    *,
    session_cookies: dict,
    cfg: dict | None = None,
) -> dict:
    """新会长登录后确认协议：POST /channelsite/promote/agreement_rule.html"""
    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    path = str(cfg.get("agreementPath") or "/channelsite/promote/agreement_rule.html")
    if not session_cookies or not session_cookies.get("PHPSESSID"):
        return {"ok": False, "error": "缺少会长登录会话"}
    opener, _jar = _opener()
    referer = f"{base}/tg/promote/index.html"
    extra = {"Cookie": _cookie_header(session_cookies)}
    req_url = f"{base}{path}"
    code, payload, snap = _post_form(opener, req_url, {}, referer=referer, cfg=cfg, extra_headers=extra)
    ok = _biz_ok(payload) or code == 200
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    if any(x in msg for x in ("失败", "错误")):
        ok = False
    return {
        "ok": bool(ok),
        "httpStatus": code,
        "response": payload if isinstance(payload, dict) else (str(payload)[:200] if payload else ""),
        "lastHttp": snap,
        "error": "" if ok else (msg or f"确认协议失败 HTTP {code}"),
    }


def channel_set_second_pwd(
    *,
    session_cookies: dict,
    second_pwd: str = "111111",
    cfg: dict | None = None,
) -> dict:
    """设置提现二级密码：POST /channelsite/promote/base_info.html tab=4。"""
    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    path = str(cfg.get("baseInfoPath") or "/channelsite/promote/base_info.html")
    pwd = str(second_pwd or "111111").strip() or "111111"
    if not session_cookies or not session_cookies.get("PHPSESSID"):
        return {"ok": False, "error": "缺少会长登录会话"}
    opener, _jar = _opener()
    referer = f"{base}/tg/promote/base_info.html"
    extra = {"Cookie": _cookie_header(session_cookies)}
    form = {"tab": "4", "second_pwd": pwd, "second_pwd_confirm": pwd}
    code, payload, snap = _post_form(
        opener, f"{base}{path}", form, referer=referer, cfg=cfg, extra_headers=extra
    )
    ok = _biz_ok(payload)
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    if "成功" in msg:
        ok = True
    if any(x in msg for x in ("失败", "错误", "不正确")):
        ok = False
    return {
        "ok": bool(ok),
        "httpStatus": code,
        "response": payload if isinstance(payload, dict) else (str(payload)[:200] if payload else ""),
        "lastHttp": snap,
        "error": "" if ok else (msg or f"设置二级密码失败 HTTP {code}"),
    }


def channel_apply_game(
    *,
    game_id: int | str,
    session_cookies: dict,
    is_pi: str | int = 0,
    cfg: dict | None = None,
) -> dict:
    """会长申请游戏：POST /channelsite/game/apply.html"""
    cfg = cfg or load_channel_web_config()
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    path = str(cfg.get("applyGamePath") or "/channelsite/game/apply.html")
    try:
        gid = int(game_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": f"无效 game_id: {game_id}"}
    if not session_cookies or not session_cookies.get("PHPSESSID"):
        return {"ok": False, "error": "缺少会长登录会话"}

    opener, _jar = _opener()
    form = {"game_id": str(gid), "is_pi": str(is_pi if is_pi is not None else 0)}
    referer = f"{base}/tg/promote/index.html"
    extra = {"Cookie": _cookie_header(session_cookies)}
    req_url = f"{base}{path}"
    code, payload, snap = _post_form(opener, req_url, form, referer=referer, cfg=cfg, extra_headers=extra)
    ok = _biz_ok(payload)
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    if "成功" in msg or "申请" in msg:
        ok = True
    if any(x in msg for x in ("失败", "错误", "已申请", "不能")):
        # 已申请可视为本步达成
        if "已申请" in msg or "已经申请" in msg:
            ok = True
        else:
            ok = False
    return {
        "ok": bool(ok),
        "gameId": gid,
        "httpStatus": code,
        "response": payload,
        "lastHttp": snap,
        "error": "" if ok else (msg or f"申请游戏失败 HTTP {code}"),
    }
