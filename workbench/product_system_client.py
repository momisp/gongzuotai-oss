# -*- coding: utf-8 -*-
"""灵巅云产品系统开放写接口客户端（用例 / 缺陷）。

密钥不硬编码：由请求体、环境变量或 workbench/.env 提供
（OPEN_API_WRITE_KEY / OPEN_API_KEY）。

接口文档：开放接口说明-质量与执行数据.md
2026-09-22 变更：bugs[] 可选字段 testCaseId（关联用例，向后兼容）。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DEFAULT_BASE = "https://product.example.com"
WRITE_PATH = "/api/v1/open/quality-data"
READ_PATH = "/api/v1/open/quality-summary"
BATCH_LIMIT = 100

_ENV_LOADED = False


def load_product_system_env(force: bool = False) -> None:
    """从 workbench/.env 加载密钥到 os.environ（已有环境变量优先，不覆盖）。"""
    global _ENV_LOADED
    if _ENV_LOADED and not force:
        return
    _ENV_LOADED = True
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    try:
        text = env_path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if not key:
            continue
        if key in os.environ and str(os.environ.get(key) or "").strip():
            continue
        os.environ[key] = val


def resolve_write_key(explicit: str | None = None) -> str:
    load_product_system_env()
    key = str(explicit or "").strip()
    if key:
        return key
    return str(os.environ.get("OPEN_API_WRITE_KEY") or "").strip()


def resolve_read_key(explicit: str | None = None) -> str:
    load_product_system_env()
    key = str(explicit or "").strip()
    if key:
        return key
    return str(os.environ.get("OPEN_API_KEY") or "").strip()


def normalize_base_url(raw: str | None) -> str:
    load_product_system_env()
    if raw and str(raw).strip():
        base = str(raw).strip().rstrip("/")
    else:
        base = str(os.environ.get("PRODUCT_SYSTEM_BASE_URL") or DEFAULT_BASE).strip().rstrip("/")
    return base or DEFAULT_BASE


def has_server_write_key() -> bool:
    return bool(resolve_write_key(""))


def _chunk(items: list[Any], size: int = BATCH_LIMIT) -> list[list[Any]]:
    if size < 1:
        size = BATCH_LIMIT
    return [items[i : i + size] for i in range(0, len(items), size)]


def write_quality_data(
    *,
    write_key: str = "",
    base_url: str = "",
    bugs: list[dict] | None = None,
    test_cases: list[dict] | None = None,
    tasks: list[dict] | None = None,
    test_results: list[dict] | None = None,
    dry_run: bool = False,
    timeout: float = 90,
) -> dict[str, Any]:
    """调用 POST /quality-data，返回 data 段（失败抛 RuntimeError）。"""
    key = resolve_write_key(write_key)
    if not key:
        raise RuntimeError("缺少写密钥（配置 writeKey 或环境变量 OPEN_API_WRITE_KEY）")

    payload: dict[str, Any] = {"dryRun": bool(dry_run)}
    if bugs is not None:
        payload["bugs"] = bugs
    if test_cases is not None:
        payload["testCases"] = test_cases
    if tasks is not None:
        payload["tasks"] = tasks
    if test_results is not None:
        payload["testResults"] = test_results

    for field, arr in (
        ("bugs", bugs),
        ("testCases", test_cases),
        ("tasks", tasks),
        ("testResults", test_results),
    ):
        if arr is not None and len(arr) > BATCH_LIMIT:
            raise RuntimeError(f"{field} 单次最多 {BATCH_LIMIT} 条，请分批调用")

    url = normalize_base_url(base_url) + WRITE_PATH
    try:
        resp = requests.post(
            url,
            headers={
                "X-API-Key": key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout,
            verify=False,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"产品系统请求失败: {exc}") from exc

    try:
        body = resp.json()
    except Exception:
        raise RuntimeError(
            f"产品系统返回非 JSON（HTTP {resp.status_code}）: {(resp.text or '')[:300]}"
        )

    if resp.status_code == 401:
        raise RuntimeError("写密钥无效或无权访问写接口（401）")
    if resp.status_code >= 400:
        msg = body.get("message") if isinstance(body, dict) else None
        raise RuntimeError(msg or f"产品系统 HTTP {resp.status_code}: {str(body)[:300]}")

    if not isinstance(body, dict):
        raise RuntimeError("产品系统响应格式异常")
    if body.get("code") not in (0, "0", None):
        raise RuntimeError(str(body.get("message") or body)[:400])

    data = body.get("data")
    if not isinstance(data, dict):
        raise RuntimeError("产品系统响应缺少 data")
    return data


def summarize_section(sec: dict | None) -> dict[str, Any]:
    sec = sec or {}
    items = sec.get("items") or []
    skipped = [
        {"index": it.get("index"), "reason": it.get("reason"), "bugNo": it.get("bugNo")}
        for it in items
        if it.get("action") == "skipped"
    ]
    created_ids = [
        {"id": it.get("id"), "bugNo": it.get("bugNo"), "index": it.get("index")}
        for it in items
        if it.get("action") == "created"
    ]
    return {
        "total": int(sec.get("total") or 0),
        "created": int(sec.get("created") or 0),
        "updated": int(sec.get("updated") or 0),
        "skipped": int(sec.get("skipped") or 0),
        "skippedItems": skipped,
        "createdItems": created_ids,
    }


def post_batches(
    *,
    write_key: str = "",
    base_url: str = "",
    kind: str,
    items: list[dict],
    dry_run: bool = False,
    on_progress: Callable[[dict], None] | None = None,
) -> dict[str, Any]:
    """按 100 条一批写入 bugs 或 testCases。

    kind: "bugs" | "testCases"
    """
    if kind not in ("bugs", "testCases"):
        raise ValueError("kind 须为 bugs 或 testCases")
    batches = _chunk(items, BATCH_LIMIT)
    total_in = len(items)
    agg = {
        "total": 0,
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "skippedItems": [],
        "createdItems": [],
        "batchCount": len(batches),
        "inputCount": total_in,
    }
    if not batches:
        return agg

    for bi, batch in enumerate(batches):
        if on_progress:
            on_progress(
                {
                    "step": f"写入第 {bi + 1}/{len(batches)} 批（{len(batch)} 条）",
                    "percent": 20 + int(70 * bi / max(len(batches), 1)),
                    "batch": bi + 1,
                    "batchTotal": len(batches),
                }
            )
        kwargs: dict[str, Any] = {
            "write_key": write_key,
            "base_url": base_url,
            "dry_run": dry_run,
        }
        if kind == "bugs":
            kwargs["bugs"] = batch
        else:
            kwargs["test_cases"] = batch
        data = write_quality_data(**kwargs)
        sec = summarize_section(data.get(kind) if kind == "bugs" else data.get("testCases"))
        offset = bi * BATCH_LIMIT
        for it in sec["skippedItems"]:
            if it.get("index") is not None:
                it["index"] = offset + int(it["index"])
            agg["skippedItems"].append(it)
        for it in sec["createdItems"]:
            if it.get("index") is not None:
                it["index"] = offset + int(it["index"])
            agg["createdItems"].append(it)
        agg["total"] += sec["total"]
        agg["created"] += sec["created"]
        agg["updated"] += sec["updated"]
        agg["skipped"] += sec["skipped"]

    if on_progress:
        on_progress(
            {
                "step": f"完成：新建 {agg['created']}，跳过 {agg['skipped']}",
                "percent": 96,
            }
        )
    return agg


def resolve_product_user() -> str:
    load_product_system_env()
    return str(os.environ.get("PRODUCT_SYSTEM_USER") or "pancaiyuan").strip() or "pancaiyuan"


def resolve_product_pass() -> str:
    load_product_system_env()
    return str(os.environ.get("PRODUCT_SYSTEM_PASS") or "").strip()


def login_session(
    *,
    base_url: str = "",
    username: str = "",
    password: str = "",
) -> requests.Session:
    """登录产品系统，返回带 cookie 的 Session（挂图 / 拉列表用）。"""
    user = (username or resolve_product_user()).strip()
    pwd = (password or resolve_product_pass()).strip()
    if not pwd:
        raise RuntimeError("缺少 PRODUCT_SYSTEM_PASS，无法登录产品系统")
    base = normalize_base_url(base_url)
    s = requests.Session()
    s.verify = False
    try:
        resp = s.post(
            base + "/api/v1/auth/login",
            json={"username": user, "password": pwd},
            timeout=30,
        )
        body = resp.json()
    except requests.RequestException as exc:
        raise RuntimeError(f"登录产品系统失败: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"登录产品系统响应异常: {exc}") from exc
    if resp.status_code >= 400 or body.get("code") not in (0, "0"):
        raise RuntimeError(f"登录失败: {body}")
    return s


def norm_bug_title(title: str) -> str:
    """同标题去重用：去空白、统一省略号。"""
    import re

    t = (title or "").strip()
    t = re.sub(r"\s+", " ", t)
    t = t.replace("…", "...").replace("．．．", "...")
    return t


def fetch_existing_bug_titles(
    session: requests.Session | None = None,
    *,
    base_url: str = "",
    version_id: str = "",
    page_size: int = 100,
) -> dict[str, dict[str, Any]]:
    """登录拉取缺陷标题集合。

    返回 {norm_title: {id, bugNo, title, status}}，同标题保留先遇到的一条。
    """
    s = session or login_session(base_url=base_url)
    base = normalize_base_url(base_url)
    out: dict[str, dict[str, Any]] = {}
    page = 1
    total_pages = 1
    while page <= total_pages:
        params: dict[str, Any] = {"page": page, "pageSize": max(1, min(int(page_size), 100))}
        if version_id:
            params["versionId"] = version_id
        r = s.get(base + "/api/v1/bugs", params=params, timeout=45)
        body = r.json()
        if r.status_code >= 400 or body.get("code") not in (0, "0"):
            raise RuntimeError(f"拉取缺陷列表失败: {body}")
        data = body.get("data") or {}
        items = data.get("list") or []
        pag = data.get("pagination") or {}
        total_pages = int(pag.get("totalPages") or 1)
        for it in items:
            if not isinstance(it, dict):
                continue
            key = norm_bug_title(str(it.get("title") or ""))
            if not key or key in out:
                continue
            out[key] = {
                "id": it.get("id"),
                "bugNo": it.get("bugNo"),
                "title": it.get("title"),
                "status": it.get("status"),
            }
        page += 1
        if page > 50:
            break
    return out


def filter_new_bug_payloads(
    payloads: list[dict],
    existing_titles: dict[str, dict[str, Any]] | None,
) -> tuple[list[dict], list[dict]]:
    """按标题去重：已存在同标题 → 进 skipped；否则进 to_create。

    返回 (to_create, skipped_meta)，skipped_meta 含 title/bugNo/reason。
    """
    existing = existing_titles or {}
    to_create: list[dict] = []
    skipped: list[dict] = []
    seen_batch: set[str] = set()
    for pl in payloads:
        title = str(pl.get("title") or "").strip()
        key = norm_bug_title(title)
        if not key:
            skipped.append({"title": title, "reason": "空标题"})
            continue
        if key in seen_batch:
            skipped.append({"title": title, "reason": "本批次标题重复"})
            continue
        hit = existing.get(key)
        if hit:
            skipped.append(
                {
                    "title": title,
                    "reason": "同标题已存在",
                    "bugNo": hit.get("bugNo"),
                    "id": hit.get("id"),
                    "status": hit.get("status"),
                }
            )
            continue
        seen_batch.add(key)
        to_create.append(pl)
    return to_create, skipped
