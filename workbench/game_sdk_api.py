# -*- coding: utf-8 -*-
"""游戏 SDK 接口（Base64 JSON；域名/密钥读本地 game_sdk_config.json）。

md5_sign = md5(按 key 排序后拼接全部 value + access_key)，access_key 取自 tab_game_set。
请求：JSON → Base64；响应：Base64 → JSON。
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import ssl
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "game_sdk_config.json"
EXAMPLE_FILE = DATA_DIR / "game_sdk_config.example.json"

_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


def load_game_sdk_config() -> dict:
    path = CONFIG_FILE if CONFIG_FILE.is_file() else EXAMPLE_FILE
    data: dict = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except (OSError, json.JSONDecodeError):
            data = {}
    if not str(data.get("baseUrl") or "").strip():
        data["baseUrl"] = "http://dev.example.com"
    if not str(data.get("gameId") or "").strip():
        data["gameId"] = "0"
    if not str(data.get("password") or "").strip():
        data["password"] = "CHANGE_ME"
    if not str(data.get("equipmentNum") or "").strip():
        data["equipmentNum"] = "device_fingerprint_here"
    if not str(data.get("deviceName") or "").strip():
        data["deviceName"] = "Device:MODEL"
    if not str(data.get("price") or "").strip():
        data["price"] = "2.00"
    profile = data.get("realName") if isinstance(data.get("realName"), dict) else {}
    data["realName"] = {
        "real_name": str(profile.get("real_name") or "测试实名"),
        "idcard": str(profile.get("idcard") or "110101199001011234"),
    }
    return data


def save_game_sdk_config(updates: dict) -> dict:
    cfg = load_game_sdk_config()
    if not isinstance(updates, dict):
        return cfg
    for key in ("baseUrl", "gameId", "gameAppId", "gameName", "password", "equipmentNum", "deviceName", "price", "accountPrefix", "accessKey"):
        if key in updates and updates[key] is not None:
            cfg[key] = str(updates[key]).strip()
    if isinstance(updates.get("realName"), dict):
        cur = cfg.get("realName") if isinstance(cfg.get("realName"), dict) else {}
        cur.update(updates["realName"])
        cfg["realName"] = cur
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def _ts() -> str:
    return str(int(time.time() * 1000))


def encrypt_md5(data: dict, access_key: str) -> str:
    """对齐服务端 BaseController::encrypt_md5：ksort 后拼 value，再拼 access_key。"""
    items = sorted(
        (str(k), "" if v is None else str(v))
        for k, v in (data or {}).items()
        if str(k) != "md5_sign"
    )
    raw = "".join(v for _, v in items) + str(access_key or "")
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def resolve_access_key(game_id: str | int | None = None, *, source_db: str = "lx", cfg: dict | None = None) -> str:
    """优先配置 accessKey，否则查 tab_game_set.access_key。"""
    cfg = cfg or load_game_sdk_config()
    from_cfg = str(cfg.get("accessKey") or "").strip()
    if from_cfg:
        return from_cfg
    gid = str(game_id or cfg.get("gameId") or "").strip()
    if not gid:
        return ""
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        db_cfg = load_db_config()
        db = resolve_database(source_db, db_cfg)
        conn = _connect(db_cfg, source_db=source_db)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT access_key FROM `{db}`.tab_game_set WHERE game_id=%s LIMIT 1",
                    (int(gid),),
                )
                row = cur.fetchone() or {}
                return str(row.get("access_key") or "").strip()
        finally:
            conn.close()
    except Exception:
        return ""


def attach_md5_sign(
    body: dict,
    *,
    access_key: str | None = None,
    game_id: str | int | None = None,
    source_db: str = "lx",
    cfg: dict | None = None,
) -> dict:
    out = dict(body or {})
    if str(out.get("md5_sign") or "").strip():
        return out
    key = str(access_key or "").strip() or resolve_access_key(
        game_id or out.get("game_id"),
        source_db=source_db,
        cfg=cfg,
    )
    if not key:
        return out
    out["md5_sign"] = encrypt_md5(out, key)
    return out


def encode_body(obj: dict) -> bytes:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return base64.b64encode(raw.encode("utf-8"))


def decode_response(text: str) -> Any:
    t = (text or "").strip().strip('"').strip("'")
    try:
        plain = base64.b64decode(t).decode("utf-8")
    except Exception:
        plain = text or ""
    try:
        return json.loads(plain)
    except json.JSONDecodeError:
        return {"_raw": plain}


def _redact_sdk_body(body: dict) -> dict:
    hide = {"password", "repassword", "token", "pwd", "sms_code", "idcard"}
    out = {}
    for key, val in (body or {}).items():
        out[key] = "***" if str(key).lower() in hide else val
    return out


def sdk_ok(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    msg = str(payload.get("msg") or "")
    if "成功" in msg:
        return True
    code = payload.get("code")
    return code in (1, "1", 200, "200", 0, "0", True)


def sdk_post(
    path: str,
    body: dict,
    *,
    cfg: dict | None = None,
    timeout: int = 30,
    source_db: str = "lx",
    auto_sign: bool = True,
) -> dict:
    cfg = cfg or load_game_sdk_config()
    if auto_sign:
        body = attach_md5_sign(body, source_db=source_db, cfg=cfg)
    base = str(cfg.get("baseUrl") or "http://dev.example.com").rstrip("/")
    url = f"{base}{path}"
    raw = encode_body(body)
    req = Request(
        url,
        data=raw,
        headers={
            "Content-Type": "application/json",
            "Accept": "*/*",
            "User-Agent": str(cfg.get("userAgent") or "workbench-game-sdk"),
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=timeout, context=_SSL) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            http_status = getattr(resp, "status", None) or resp.getcode()
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        http_status = exc.code
    except (URLError, TimeoutError, OSError) as exc:
        return {"ok": False, "error": str(exc), "path": path, "url": url, "request": _redact_sdk_body(body)}
    payload = decode_response(text)
    ok = sdk_ok(payload)
    msg = str(payload.get("msg") if isinstance(payload, dict) else payload or "")
    return {
        "ok": bool(ok),
        "httpStatus": int(http_status or 0),
        "path": path,
        "url": url,
        "request": _redact_sdk_body(body),
        "response": payload,
        "lastHttp": {
            "url": url,
            "method": "POST",
            "httpStatus": int(http_status or 0),
            "request": _redact_sdk_body(body),
            "response": payload,
        },
        "error": "" if ok else (msg or f"SDK 调用失败 HTTP {http_status}"),
    }


def resolve_game_meta(game_id: str | int | None = None, *, source_db: str = "lx", cfg: dict | None = None) -> dict:
    """从配置或 tab_game 解析 game_appid / game_name / access_key。"""
    cfg = cfg or load_game_sdk_config()
    gid = str(game_id or cfg.get("gameId") or "659").strip()
    appid = str(cfg.get("gameAppId") or "").strip()
    gname = str(cfg.get("gameName") or "").strip()
    access = str(cfg.get("accessKey") or "").strip()
    if appid and gname and access:
        return {
            "ok": True,
            "gameId": gid,
            "gameAppId": appid,
            "gameName": gname,
            "accessKey": access,
            "source": "config",
        }
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        db_cfg = load_db_config()
        db = resolve_database(source_db, db_cfg)
        conn = _connect(db_cfg, source_db=source_db)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id, game_name, game_appid, sdk_verify FROM `{db}`.tab_game WHERE id=%s LIMIT 1",
                    (int(gid),),
                )
                row = cur.fetchone()
                if not access:
                    cur.execute(
                        f"SELECT access_key FROM `{db}`.tab_game_set WHERE game_id=%s LIMIT 1",
                        (int(gid),),
                    )
                    aset = cur.fetchone() or {}
                    access = str(aset.get("access_key") or "").strip()
        finally:
            conn.close()
        if not row:
            return {"ok": False, "error": f"{db} 未找到游戏 id={gid}"}
        return {
            "ok": True,
            "gameId": str(row["id"]),
            "gameAppId": str(row.get("game_appid") or appid),
            "gameName": str(row.get("game_name") or gname or f"game{gid}"),
            "accessKey": access,
            "sdkVerify": row.get("sdk_verify"),
            "source": "db",
            "database": db,
        }
    except Exception as exc:
        if appid:
            return {
                "ok": True,
                "gameId": gid,
                "gameAppId": appid,
                "gameName": gname or f"game{gid}",
                "accessKey": access,
                "source": "config",
                "warn": str(exc),
            }
        return {"ok": False, "error": str(exc)}


def next_player_account(prefix: str = "pL1", *, source_db: str = "lx") -> str:
    """玩家登录账号仅 ASCII，不能含下划线。

    - 新规：lxautotest1 / yqautotest1 / hwautotest1（前缀+序号）
    - 兼容旧规：pL1 + 月日 + 序号 → pL111031
    """
    prefix = _ascii_player_prefix(prefix)
    sequential = bool(re.fullmatch(r"[a-z]+autotest", prefix.lower())) or prefix.lower().endswith("autotest")
    base = prefix if sequential else f"{prefix}{datetime.now().month}{datetime.now().day:02d}"
    next_n = 1
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        cfg = load_db_config()
        db = resolve_database(source_db, cfg)
        conn = _connect(cfg, source_db=source_db)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT account FROM `{db}`.tab_user WHERE account LIKE %s",
                    (f"{base}%",),
                )
                rows = cur.fetchall() or []
        finally:
            conn.close()
        max_n = 0
        pat = re.compile(rf"^{re.escape(base)}(\d+)$", re.I)
        for row in rows:
            m = pat.match(str((row or {}).get("account") or ""))
            if m:
                max_n = max(max_n, int(m.group(1)))
        next_n = max_n + 1
    except Exception:
        next_n = int(datetime.now().strftime("%H%M%S")) % 1000 or 1
    return f"{base}{next_n}"


def _ascii_player_prefix(prefix: str | None) -> str:
    """归一玩家账号前缀：优先保留 lxautotest/yqautotest；旧的 pL1 仍可用。"""
    raw = str(prefix or "pL1").strip().rstrip("_")
    low = raw.lower().replace("玩家", "p").replace("player", "p")
    # 新命名：lxautotest / yqautotest / hwautotest
    m = re.fullmatch(r"([a-z]{2})autotest", low)
    if m:
        return f"{m.group(1)}autotest"
    if low.endswith("autotest") and re.fullmatch(r"[a-z0-9]+", low):
        return low
    if low in {"pl1", "p1", "l1", "1"}:
        return "pL1"
    if low in {"pl2", "p2", "l2", "2"}:
        return "pL2"
    if low in {"pl3", "p3", "l3", "3"}:
        return "pL3"
    if raw.startswith("pL") and len(raw) >= 3 and raw[2].isdigit():
        return f"pL{raw[2]}"
    cleaned = "".join(ch for ch in raw if ord(ch) < 128 and (ch.isalnum() or ch in ("_", "-")))
    return cleaned or "pL1"


def player_nickname_for_prefix(prefix: str | None, account: str = "") -> str:
    """展示用昵称：新 autotest 账号直接用账号；旧 pL 前缀仍用玩家L*。"""
    p = _ascii_player_prefix(prefix)
    acc = str(account or "").strip()
    if "autotest" in p.lower():
        return acc or p
    level = p[-1] if p[-1:].isdigit() else "1"
    suffix = ""
    if "_" in acc:
        suffix = acc.split("_", 1)[-1]
    else:
        m = re.search(r"(\d{3,})$", acc)
        if m:
            suffix = m.group(1)
    return f"玩家L{level}_{suffix}" if suffix else f"玩家L{level}"


def seed_user_nickname(account: str, nickname: str, *, source_db: str = "lx") -> dict:
    """注册后写 tab_user.nickname（账号保持 ASCII）。"""
    account = str(account or "").strip()
    nickname = str(nickname or "").strip()
    if not account or not nickname:
        return {"ok": False, "error": "缺少 account/nickname"}
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        cfg = load_db_config()
        db = resolve_database(source_db, cfg)
        conn = _connect(cfg, source_db=source_db)
        try:
            with conn.cursor() as cur:
                n = cur.execute(
                    f"UPDATE `{db}`.tab_user SET nickname=%s WHERE account=%s LIMIT 1",
                    (nickname, account),
                )
            return {"ok": True, "account": account, "nickname": nickname, "updated": int(n or 0)}
        finally:
            conn.close()
    except Exception as exc:
        return {"ok": False, "error": str(exc), "account": account, "nickname": nickname}


def sdk_register(
    *,
    account: str | None = None,
    password: str | None = None,
    promote_id: str | int = "0",
    game_id: str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
    account_prefix: str | None = None,
    nickname: str | None = None,
    promote_account: str | None = None,
) -> dict:
    cfg = cfg or load_game_sdk_config()
    meta = resolve_game_meta(game_id, source_db=source_db, cfg=cfg)
    if not meta.get("ok"):
        return {"ok": False, "error": meta.get("error") or "解析游戏失败", "meta": meta}
    prefix = _ascii_player_prefix(
        account_prefix or cfg.get("accountPrefix") or "pL1"
    )
    account = str(account or next_player_account(prefix, source_db=source_db)).strip()
    # 账号强制去掉汉字 / 下划线，避免 SDK 拒收
    if any(ord(ch) > 127 for ch in account) or "_" in account:
        account = next_player_account(prefix, source_db=source_db)
    password = str(password if password is not None else cfg.get("password") or "123456")
    nick = str(nickname or "").strip() or player_nickname_for_prefix(prefix, account)
    pid = str(promote_id if promote_id is not None else "0").strip() or "0"
    promo_acc = str(promote_account or "").strip()
    if pid not in ("", "0") and not promo_acc:
        try:
            from smoke_db import lookup_promote_account

            found = lookup_promote_account(pid, source_db=source_db)
            if found.get("ok"):
                promo_acc = str(found.get("account") or "")
        except Exception:
            promo_acc = ""
    if pid in ("", "0") and not promo_acc:
        promo_acc = "自然注册"
    body = {
        "account": account,
        "device_name": str(cfg.get("deviceName") or "Redmi:23013RK75C"),
        "equipment_num": str(cfg.get("equipmentNum") or "c3f2f19347a302bf"),
        "game_appid": meta["gameAppId"],
        "game_id": str(meta["gameId"]),
        "game_name": meta["gameName"],
        "geetest_challenge": "",
        "geetest_seccode": "",
        "geetest_validate": "",
        "is_simulator": "0",
        "password": password,
        "promote_account": promo_acc,
        "promote_id": pid,
        "repassword": password,
        "sdk_version": "1",
        "t": _ts(),
        "type": "1",
    }
    result = sdk_post("/sdk/User/register", body, cfg=cfg, source_db=source_db)
    data = result.get("response", {}).get("data") if isinstance(result.get("response"), dict) else {}
    data = data if isinstance(data, dict) else {}
    nick_seed = None
    if result.get("ok"):
        nick_seed = seed_user_nickname(account, nick, source_db=source_db)
    return {
        **result,
        "account": account,
        "password": password,
        "nickname": nick,
        "nicknameSeed": nick_seed,
        "userId": str(data.get("user_id") or ""),
        "token": str(data.get("token") or ""),
        "gameId": meta["gameId"],
        "gameAppId": meta["gameAppId"],
        "gameName": meta["gameName"],
        "promoteId": pid,
        "promoteAccount": promo_acc,
        "meta": meta,
    }


def sdk_login(
    *,
    account: str,
    password: str,
    promote_id: str | int = "0",
    game_id: str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
) -> dict:
    cfg = cfg or load_game_sdk_config()
    meta = resolve_game_meta(game_id, source_db=source_db, cfg=cfg)
    if not meta.get("ok"):
        return {"ok": False, "error": meta.get("error") or "解析游戏失败", "meta": meta}
    body = {
        "account": str(account),
        "device_name": str(cfg.get("deviceName") or "Redmi:23013RK75C"),
        "equipment_num": str(cfg.get("equipmentNum") or "c3f2f19347a302bf"),
        "game_appid": meta["gameAppId"],
        "game_id": str(meta["gameId"]),
        "game_name": meta["gameName"],
        "geetest_challenge": "",
        "geetest_seccode": "",
        "geetest_validate": "",
        "is_simulator": "0",
        "password": str(password),
        "promote_id": str(promote_id if promote_id is not None else "0"),
        "sdk_version": "1",
        "t": _ts(),
    }
    result = sdk_post("/sdk/User/user_login", body, cfg=cfg, source_db=source_db)
    data = result.get("response", {}).get("data") if isinstance(result.get("response"), dict) else {}
    data = data if isinstance(data, dict) else {}
    return {
        **result,
        "account": account,
        "password": password,
        "userId": str(data.get("user_id") or ""),
        "token": str(data.get("token") or ""),
        "gameId": meta["gameId"],
        "gameAppId": meta["gameAppId"],
        "gameName": meta["gameName"],
    }


def sdk_idcard(
    *,
    user_id: str,
    token: str,
    game_id: str | None = None,
    promote_id: str | int = "0",
    real_name: str | None = None,
    idcard: str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
) -> dict:
    cfg = cfg or load_game_sdk_config()
    meta = resolve_game_meta(game_id, source_db=source_db, cfg=cfg)
    if not meta.get("ok"):
        return {"ok": False, "error": meta.get("error") or "解析游戏失败"}
    rn = cfg.get("realName") if isinstance(cfg.get("realName"), dict) else {}
    body = {
        "device_name": str(cfg.get("deviceName") or "Redmi:23013RK75C"),
        "equipment_num": str(cfg.get("equipmentNum") or "c3f2f19347a302bf"),
        "game_id": str(meta["gameId"]),
        "game_name": meta["gameName"],
        "idcard": str(idcard or rn.get("idcard") or ""),
        "is_simulator": "0",
        "promote_id": str(promote_id if promote_id is not None else "0"),
        "real_name": str(real_name or rn.get("real_name") or ""),
        "sdk_ua": str(cfg.get("sdkUa") or "Mozilla/5.0 (Linux; Android 15; 23013RK75C) AppleWebKit/537.36"),
        "sdk_version": "1",
        "small_id": str(user_id),
        "t": _ts(),
        "token": str(token),
        "user_id": str(user_id),
    }
    return sdk_post("/sdk/user/idcard_change", body, cfg=cfg, source_db=source_db)


def sdk_upload_role(
    *,
    user_id: str,
    token: str,
    game_id: str | None = None,
    promote_id: str | int = "0",
    cfg: dict | None = None,
    source_db: str = "lx",
) -> dict:
    cfg = cfg or load_game_sdk_config()
    meta = resolve_game_meta(game_id, source_db=source_db, cfg=cfg)
    if not meta.get("ok"):
        return {"ok": False, "error": meta.get("error") or "解析游戏失败"}
    body = {
        "combat_number": str(cfg.get("combatNumber") or "199999"),
        "device_name": str(cfg.get("deviceName") or "Redmi:23013RK75C"),
        "equipment_num": str(cfg.get("equipmentNum") or "c3f2f19347a302bf"),
        "game_id": str(meta["gameId"]),
        "game_name": meta["gameName"],
        "game_player_id": str(cfg.get("gamePlayerId") or "10"),
        "game_player_name": str(cfg.get("gamePlayerName") or "好好好"),
        "is_simulator": "0",
        "player_reserve": str(cfg.get("playerReserve") or "其它信息"),
        "promote_id": str(promote_id if promote_id is not None else "0"),
        "role_level": str(cfg.get("roleLevel") or "10"),
        "sdk_ua": str(cfg.get("sdkUa") or "Mozilla/5.0 (Linux; Android 15; 23013RK75C) AppleWebKit/537.36"),
        "sdk_version": "1",
        "server_id": str(cfg.get("serverId") or "12"),
        "server_name": str(cfg.get("serverName") or "江苏一区"),
        "small_id": str(user_id),
        "t": _ts(),
        "token": str(token),
        "user_id": str(user_id),
    }
    return sdk_post("/sdk/User/save_user_play_info", body, cfg=cfg, source_db=source_db)


def _lookup_latest_spend(user_id: str | int, *, source_db: str, game_id: str | int | None = None) -> dict:
    """下单接口偶发业务失败码，但仍可能已写入 tab_spend；用库内最新单兜底。"""
    try:
        from smoke_db import _connect, load_db_config, resolve_database

        cfg = load_db_config()
        db = resolve_database(source_db, cfg)
        conn = _connect(cfg, source_db=source_db)
        try:
            with conn.cursor() as cur:
                if game_id not in (None, "", 0, "0"):
                    cur.execute(
                        f"SELECT id, pay_order_number, pay_status, pay_amount, promote_id, game_id, user_id "
                        f"FROM `{db}`.tab_spend WHERE user_id=%s AND game_id=%s ORDER BY id DESC LIMIT 1",
                        (int(user_id), int(game_id)),
                    )
                else:
                    cur.execute(
                        f"SELECT id, pay_order_number, pay_status, pay_amount, promote_id, game_id, user_id "
                        f"FROM `{db}`.tab_spend WHERE user_id=%s ORDER BY id DESC LIMIT 1",
                        (int(user_id),),
                    )
                row = cur.fetchone()
                return dict(row) if row else {}
        finally:
            conn.close()
    except Exception:
        return {}


def sdk_create_pay_order(
    *,
    account: str,
    user_id: str,
    token: str,
    game_id: str | None = None,
    promote_id: str | int = "0",
    price: str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
) -> dict:
    cfg = cfg or load_game_sdk_config()
    meta = resolve_game_meta(game_id, source_db=source_db, cfg=cfg)
    if not meta.get("ok"):
        return {"ok": False, "error": meta.get("error") or "解析游戏失败"}
    price = str(price if price is not None else cfg.get("price") or "2.00")
    body = {
        "account": str(account),
        "body": str(cfg.get("payBody") or "钻石礼包"),
        "code": "1",
        "device_name": str(cfg.get("deviceName") or "Redmi:23013RK75C"),
        "equipment_num": str(cfg.get("equipmentNum") or "c3f2f19347a302bf"),
        "extend": _ts(),
        "extra_param": str(cfg.get("baseUrl") or "http://dev.example.com"),
        "game_appid": meta["gameAppId"],
        "game_id": str(meta["gameId"]),
        "game_name": meta["gameName"],
        "game_player_id": str(cfg.get("gamePlayerId") or "10"),
        "game_player_name": str(cfg.get("gamePlayerName") or "好好好"),
        "goods_reserve": str(cfg.get("goodsReserve") or "其它信息"),
        "is_simulator": "0",
        "price": price,
        "promote_id": str(promote_id if promote_id is not None else "0"),
        "role_level": str(cfg.get("roleLevel") or "10"),
        "sdk_version": "1",
        "server_id": str(cfg.get("serverId") or "12"),
        "server_name": str(cfg.get("serverName") or "江苏一区"),
        "small_id": str(user_id),
        "t": _ts(),
        "title": str(cfg.get("payTitle") or "钻石礼包"),
        "token": str(token),
        "user_id": str(user_id),
    }
    result = sdk_post("/sdk/pay/and_alipay_pay", body, cfg=cfg, source_db=source_db)
    out = {**result, "price": price, "account": account}
    if out.get("ok"):
        return out
    # 汇玩等环境：接口返回「支付失败」但仍落了未支付订单，主链可继续走模拟回调
    spend = _lookup_latest_spend(user_id, source_db=source_db, game_id=meta.get("gameId"))
    order_no = str((spend or {}).get("pay_order_number") or "").strip()
    if order_no:
        resp = out.get("response") if isinstance(out.get("response"), dict) else {}
        data = resp.get("data") if isinstance(resp.get("data"), dict) else {}
        if not isinstance(data, dict):
            data = {}
        data = {**data, "out_trade_no": order_no}
        out["ok"] = True
        out["recoveredFromDb"] = True
        out["payOrder"] = order_no
        out["error"] = ""
        out["note"] = f"接口业务失败但已落单 {order_no}，按未支付订单继续"
        out["response"] = {**(resp if isinstance(resp, dict) else {}), "data": data, "msg": out.get("note")}
    return out


def run_player_flow(
    *,
    promote_id: str | int = "0",
    game_id: str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
) -> dict:
    """注册(含会话) → 实名 → 上传角色 → 下单。"""
    cfg = cfg or load_game_sdk_config()
    reg = sdk_register(promote_id=promote_id, game_id=game_id, cfg=cfg, source_db=source_db)
    if not reg.get("ok") or not reg.get("token"):
        return {"ok": False, "step": "register", "error": reg.get("error") or "注册失败", "register": reg}
    uid, token = reg["userId"], reg["token"]
    idc = sdk_idcard(
        user_id=uid,
        token=token,
        game_id=reg.get("gameId"),
        promote_id=promote_id,
        cfg=cfg,
        source_db=source_db,
    )
    if not idc.get("ok"):
        return {"ok": False, "step": "idcard", "error": idc.get("error") or "实名失败", "register": reg, "idcard": idc}
    role = sdk_upload_role(
        user_id=uid,
        token=token,
        game_id=reg.get("gameId"),
        promote_id=promote_id,
        cfg=cfg,
        source_db=source_db,
    )
    if not role.get("ok"):
        return {"ok": False, "step": "role", "error": role.get("error") or "上传角色失败", "register": reg, "idcard": idc, "role": role}
    pay = sdk_create_pay_order(
        account=reg["account"],
        user_id=uid,
        token=token,
        game_id=reg.get("gameId"),
        promote_id=promote_id,
        cfg=cfg,
        source_db=source_db,
    )
    if not pay.get("ok"):
        return {
            "ok": False,
            "step": "pay",
            "error": pay.get("error") or "下单失败",
            "register": reg,
            "idcard": idc,
            "role": role,
            "pay": pay,
        }
    return {
        "ok": True,
        "account": reg["account"],
        "password": reg["password"],
        "userId": uid,
        "token": token,
        "gameId": reg.get("gameId"),
        "promoteId": str(promote_id),
        "register": reg,
        "idcard": idc,
        "role": role,
        "pay": pay,
    }
