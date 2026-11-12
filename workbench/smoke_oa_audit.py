# -*- coding: utf-8 -*-
"""新商务冒烟 · OA 绑定审核（接口版）。

对齐 HAR：
  GET  /api/sysUserBindPlatform/getAuditList
  POST /api/sysUserBindPlatform/approveAudit  {platformBusierId, sourceDb, userId}
  POST /api/sysUserBindPlatform/rejectAudit   {platformBusierId, sourceDb, userId, rejectReason}

鉴权与渠道主流程同一套 OA：oa.example.com + x-token（复用 oa_promote_config / oa_login）。
"""
from __future__ import annotations

import copy
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "smoke_oa_audit_api.json"
EXAMPLE_FILE = DATA_DIR / "smoke_oa_audit_api.example.json"

# 审核单 status：0 待审 / 1 通过 / 2 驳回（与 getAuditList 实测一致）
STATUS_PENDING = "0"
STATUS_APPROVED = "1"
STATUS_REJECTED = "2"


def load_oa_audit_config() -> dict:
    path = CONFIG_FILE if CONFIG_FILE.is_file() else EXAMPLE_FILE
    if not path.is_file():
        return {"enabled": False}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"enabled": False}
    except (OSError, json.JSONDecodeError):
        return {"enabled": False}


def _render(value: Any, vars_map: dict[str, str]) -> Any:
    if isinstance(value, str):
        out = value
        for k, v in vars_map.items():
            out = out.replace("{{" + k + "}}", str(v))
        return out
    if isinstance(value, list):
        return [_render(x, vars_map) for x in value]
    if isinstance(value, dict):
        return {k: _render(v, vars_map) for k, v in value.items()}
    return value


def _http(method: str, url: str, headers: dict, body: dict | None = None, timeout: int = 20) -> tuple[int, str]:
    raw = None
    if body is not None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=raw, headers=headers, method=method.upper())
    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except (URLError, TimeoutError, OSError) as exc:
        return 0, str(exc)


def _merge_oa_credentials(cfg: dict) -> dict:
    """审核配置可缺省账号，回落到 oa_promote_config（同一 OA 测试账号）。"""
    out = dict(cfg or {})
    login = dict(out.get("login") or {}) if isinstance(out.get("login"), dict) else {}
    user = str(login.get("username") or "").strip() or str(os.environ.get("SMOKE_OA_USER") or "").strip()
    pwd = str(login.get("password") or "") or str(os.environ.get("SMOKE_OA_PASS") or "")
    if user and pwd:
        login["username"] = user
        login["password"] = pwd
        out["login"] = login
        return out
    try:
        from oa_promote_api import load_oa_promote_config

        promote = load_oa_promote_config() or {}
        if not out.get("baseUrl"):
            out["baseUrl"] = promote.get("baseUrl") or "http://oa.example.com"
        login["username"] = str(promote.get("username") or "").strip()
        login["password"] = str(promote.get("password") or "")
        if promote.get("loginPath"):
            login["path"] = promote.get("loginPath")
        out["login"] = login
    except Exception:
        out["login"] = login
    return out


def _login(cfg: dict) -> str:
    """优先走 oa_promote_api.oa_login（x-token）；失败再尝试配置内自定义登录。"""
    cfg = _merge_oa_credentials(cfg)
    try:
        from oa_promote_api import oa_login, load_oa_promote_config

        promote = load_oa_promote_config() or {}
        login_cfg = dict(promote)
        login = cfg.get("login") if isinstance(cfg.get("login"), dict) else {}
        if login.get("username"):
            login_cfg["username"] = login["username"]
        if login.get("password"):
            login_cfg["password"] = login["password"]
        if cfg.get("baseUrl"):
            login_cfg["baseUrl"] = cfg["baseUrl"]
        if login.get("path"):
            login_cfg["loginPath"] = login["path"]
        result = oa_login(login_cfg)
        if result.get("ok") and result.get("token"):
            return str(result["token"])
        # 继续走下方自定义登录
        last_err = result.get("error") or "oa_login 失败"
    except Exception as exc:  # noqa: BLE001
        last_err = str(exc)

    login = cfg.get("login") if isinstance(cfg.get("login"), dict) else {}
    base = str(cfg.get("baseUrl") or "http://oa.example.com").rstrip("/")
    path = str(login.get("path") or "/api/base/login")
    user = str(login.get("username") or "").strip()
    pwd = str(login.get("password") or "")
    if not user or not pwd:
        raise RuntimeError(f"OA 审核账号未配置（{last_err}）")
    headers = {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Language": "zh-CN",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Electron/17.4.11 Safari/537.36",
    }
    code, text = _http("POST", f"{base}{path}", headers, {"username": user, "password": pwd})
    if code != 200:
        raise RuntimeError(f"OA 登录失败 HTTP {code}: {text[:300]}")
    data = json.loads(text) if text else {}
    token = ""
    if isinstance(data, dict):
        inner = data.get("data") if isinstance(data.get("data"), dict) else {}
        token = str(
            (inner or {}).get("token")
            or (inner or {}).get("x-token")
            or data.get("token")
            or ""
        )
    if not token:
        raise RuntimeError(f"OA 登录未返回 token: {text[:300]}")
    return token


def _auth_headers(token: str) -> dict:
    return {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Language": "zh-CN",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Electron/17.4.11 Safari/537.36",
        "x-token": token,
    }


def list_pending_audits(
    cfg: dict | None = None,
    *,
    token: str | None = None,
    page: int = 1,
    page_size: int = 50,
    status: str | None = STATUS_PENDING,
) -> dict:
    """拉取绑定审核列表。默认只返回待审（status=0）。"""
    cfg = _merge_oa_credentials(cfg or load_oa_audit_config())
    token = token or _login(cfg)
    base = str(cfg.get("baseUrl") or "http://oa.example.com").rstrip("/")
    list_spec = cfg.get("listPending") if isinstance(cfg.get("listPending"), dict) else {}
    path = str(list_spec.get("path") or "/api/sysUserBindPlatform/getAuditList")
    query = dict(list_spec.get("query") or {})
    query.setdefault("page", page)
    query.setdefault("pageSize", page_size)
    url = f"{base}{path}?{urlencode(query)}"
    code, text = _http("GET", url, _auth_headers(token))
    if code != 200:
        return {"ok": False, "error": f"审核列表 HTTP {code}", "raw": text[:500], "items": []}
    try:
        payload = json.loads(text) if text else {}
    except json.JSONDecodeError:
        return {"ok": False, "error": "审核列表非 JSON", "raw": text[:500], "items": []}
    data = payload.get("data") if isinstance(payload, dict) else {}
    rows = []
    if isinstance(data, dict):
        rows = data.get("list") or data.get("rows") or data.get("records") or []
    elif isinstance(data, list):
        rows = data
    items = [r for r in rows if isinstance(r, dict)]
    if status is not None and status != "":
        items = [r for r in items if str(r.get("status") or "") == str(status)]
    biz_ok = True
    if isinstance(payload, dict) and "code" in payload:
        biz_ok = payload.get("code") in (0, 200, "0", "200")
    return {
        "ok": biz_ok,
        "items": items,
        "total": (data.get("total") if isinstance(data, dict) else len(items)),
        "response": payload if isinstance(payload, dict) else {"raw": text[:500]},
        "token": token,
    }


def resolve_audit_target(
    *,
    platform_busier_id: str | int | None = None,
    user_id: str | None = None,
    source_db: str | None = None,
    promote_account: str | None = None,
    cfg: dict | None = None,
    token: str | None = None,
) -> dict:
    """根据 platformBusierId / promoteAccount / userId 定位审核记录。

    返回 candidates（同账号多条，按创建时间倒序）。列表里 status=0 也可能已审过，
    调用方应按 candidates 逐条尝试直到接口成功。
    """
    if platform_busier_id and user_id and source_db and not promote_account:
        return {
            "ok": True,
            "platformBusierId": int(platform_busier_id) if str(platform_busier_id).isdigit() else platform_busier_id,
            "userId": str(user_id),
            "sourceDb": str(source_db),
            "promoteAccount": "",
            "matched": False,
            "candidates": [],
        }

    listed = list_pending_audits(cfg, token=token, status=None)
    if not listed.get("ok"):
        return {"ok": False, "error": listed.get("error") or "拉取审核列表失败", "items": listed.get("items") or []}

    items = listed.get("items") or []
    promote_account = str(promote_account or "").strip()
    user_id = str(user_id or "").strip()
    source_db = str(source_db or "").strip().lower()
    pid = str(platform_busier_id or "").strip()

    def match(row: dict) -> bool:
        if pid and str(row.get("platformBusierId") or "") != pid:
            return False
        if promote_account and str(row.get("promoteAccount") or "").strip() != promote_account:
            return False
        if user_id and str(row.get("userId") or "").strip() != user_id:
            return False
        if source_db and str(row.get("sourceDb") or "").strip().lower() != source_db:
            return False
        return bool(pid or promote_account or user_id)

    hits = [r for r in items if match(r)]
    if not hits and not (pid or promote_account or user_id):
        hits = list(items)

    # 排除明确已驳回；其余按创建时间倒序（最新优先）
    hits = [r for r in hits if str(r.get("status") or "") != STATUS_REJECTED]
    hits.sort(
        key=lambda r: (str(r.get("createTime") or ""), int(r.get("platformBusierId") or 0)),
        reverse=True,
    )

    if not hits:
        return {
            "ok": False,
            "error": f"未找到绑定审核单（promoteAccount={promote_account or '-'} userId={user_id or '-'}）",
            "items": items[:10],
            "token": listed.get("token"),
        }
    row = hits[0]
    return {
        "ok": True,
        "platformBusierId": row.get("platformBusierId"),
        "userId": str(row.get("userId") or ""),
        "sourceDb": str(row.get("sourceDb") or source_db or "lx"),
        "promoteAccount": str(row.get("promoteAccount") or ""),
        "matched": True,
        "row": row,
        "candidates": hits,
        "token": listed.get("token"),
    }


def audit_bind(
    action: str,
    bind_id: str = "",
    cfg: dict | None = None,
    *,
    platform_busier_id: str | int | None = None,
    user_id: str | None = None,
    source_db: str | None = None,
    promote_account: str | None = None,
    reject_reason: str | None = None,
) -> dict:
    """
    action: approve | reject
    可直接传 platformBusierId+userId+sourceDb；
    或只传 promoteAccount / userId，从待审列表自动解析。
    bind_id 兼容旧参数，等同 platformBusierId。
    """
    cfg = _merge_oa_credentials(cfg or load_oa_audit_config())
    if not cfg.get("enabled"):
        return {
            "ok": False,
            "skipped": True,
            "error": "OA 接口审核尚未启用（配置 enabled=false）。",
        }
    action = str(action or "").strip().lower()
    if action in {"pass", "通过"}:
        action = "approve"
    if action in {"驳回"}:
        action = "reject"
    if action not in {"approve", "reject"}:
        return {"ok": False, "error": f"不支持的 action: {action}"}

    platform_busier_id = platform_busier_id or bind_id or None
    try:
        token = _login(cfg)
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}

    target = resolve_audit_target(
        platform_busier_id=platform_busier_id,
        user_id=user_id,
        source_db=source_db or (cfg.get("defaultSourceDb") or "lx"),
        promote_account=promote_account,
        cfg=cfg,
        token=token,
    )
    if not target.get("ok"):
        return target

    candidates = list(target.get("candidates") or [])
    if not candidates and target.get("platformBusierId") is not None:
        candidates = [
            {
                "platformBusierId": target.get("platformBusierId"),
                "userId": target.get("userId"),
                "sourceDb": target.get("sourceDb"),
                "promoteAccount": target.get("promoteAccount"),
            }
        ]

    base = str(cfg.get("baseUrl") or "http://oa.example.com").rstrip("/")
    spec = cfg.get(action) if isinstance(cfg.get(action), dict) else {}
    method = str(spec.get("method") or "POST").upper()
    path = str(
        spec.get("path")
        or (
            "/api/sysUserBindPlatform/approveAudit"
            if action == "approve"
            else "/api/sysUserBindPlatform/rejectAudit"
        )
    )
    reject_reason_final = str(reject_reason or cfg.get("defaultRejectReason") or "smoke-reject")

    last: dict = {}
    for row in candidates:
        vars_map = {
            "bindId": str(row.get("platformBusierId") or ""),
            "platformBusierId": str(row.get("platformBusierId") or ""),
            "userId": str(row.get("userId") or ""),
            "sourceDb": str(row.get("sourceDb") or target.get("sourceDb") or "lx"),
            "rejectReason": reject_reason_final,
            "promoteAccount": str(row.get("promoteAccount") or target.get("promoteAccount") or ""),
        }
        body = _render(copy.deepcopy(spec.get("body") or {}), vars_map)
        if isinstance(body, dict):
            body.setdefault("platformBusierId", row.get("platformBusierId"))
            body.setdefault("sourceDb", vars_map["sourceDb"])
            body.setdefault("userId", vars_map["userId"])
            if action == "reject":
                body.setdefault("rejectReason", reject_reason_final)
            try:
                body["platformBusierId"] = int(body["platformBusierId"])
            except (TypeError, ValueError):
                pass

        query = _render(copy.deepcopy(spec.get("query") or {}), vars_map)
        url = f"{base}{path}"
        if isinstance(query, dict) and query:
            url = f"{url}?{urlencode(query)}"

        code, text = _http(method, url, _auth_headers(token), body if method in {"POST", "PUT", "PATCH"} else None)
        ok = code == 200
        try:
            payload = json.loads(text) if text else {}
            if isinstance(payload, dict) and "code" in payload:
                ok = ok and payload.get("code") in (0, 200, "0", "200")
        except json.JSONDecodeError:
            payload = {"raw": text[:1000]}
            ok = False

        last = {
            "ok": ok,
            "action": action,
            "bindId": str(row.get("platformBusierId") or ""),
            "platformBusierId": row.get("platformBusierId"),
            "userId": row.get("userId"),
            "sourceDb": vars_map["sourceDb"],
            "promoteAccount": vars_map["promoteAccount"],
            "httpStatus": code,
            "response": payload if isinstance(payload, dict) else {"raw": text[:1000]},
            "error": "" if ok else f"审核接口失败 HTTP {code}: {str(payload)[:200]}",
        }
        if ok:
            return last
        # 已审过的脏数据：换下一条候选
        msg = ""
        if isinstance(payload, dict):
            msg = str(payload.get("msg") or payload.get("message") or "")
        if "待审" in msg or "状态" in msg:
            continue
        # 其它业务错误不盲试
        break

    return last or {"ok": False, "error": "无可用审核候选"}


def extract_bind_id_from_text(text: str) -> str:
    """从页面/日志里尽量抠 platformBusierId / bindId。"""
    s = str(text or "")
    m = re.search(r"platformBusierId[\"'\s:=]+(\d+)", s, re.I)
    if m:
        return m.group(1)
    m = re.search(r"bindId[\"'\s:=]+(\d{3,})", s, re.I)
    if m:
        return m.group(1)
    m = re.search(r'"id"\s*:\s*"?(\d{6,})"?', s)
    return m.group(1) if m else ""
