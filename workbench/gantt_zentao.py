# -*- coding: utf-8 -*-
"""甘特图 · 禅道登录与执行信息（逻辑参考 chandao-csv-stats/zentao_client.py）"""
from __future__ import annotations

import json
import re
from typing import Optional

import requests


def _api_root(url: str, path_prefix: str = "") -> str:
    base = (url or "").strip().rstrip("/")
    prefix = (path_prefix or "").strip().rstrip("/")
    if prefix:
        if not prefix.startswith("/"):
            prefix = "/" + prefix
        return base + prefix
    return base


def _parse_data_any(raw: object) -> dict | list | None:
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return None
        try:
            inner = json.loads(raw)
            if isinstance(inner, (dict, list)):
                return inner
        except json.JSONDecodeError:
            return None
    return None


def login_zentao(url: str, user: str, password: str, path_prefix: str = "", *, ssl_verify: bool = True) -> requests.Session:
    if not url or not user or not password:
        raise RuntimeError("请填写禅道地址、账号和密码")

    root = _api_root(url, path_prefix)
    session = requests.Session()
    session.verify = ssl_verify
    session.headers.setdefault("User-Agent", "workbench-gantt/1.0")
    if not ssl_verify:
        try:
            import urllib3

            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        except Exception:
            pass

    session_id: Optional[str] = None
    last_err: Optional[str] = None
    for api_url in (
        f"{root}/api-getsessionid.json",
        f"{root.rstrip('/')}/index.php?m=api&f=getSessionID&t=json",
    ):
        try:
            res = session.get(api_url, timeout=20)
            if res.status_code != 200:
                last_err = f"HTTP {res.status_code}"
                continue
            body = res.json()
            if body.get("status") != "success":
                last_err = body.get("reason") or str(body)[:200]
                continue
            data = _parse_data_any(body.get("data"))
            if isinstance(data, dict):
                session_id = data.get("sessionID") or data.get("sessionid")
            if session_id:
                break
            last_err = "JSON 中无 sessionID"
        except requests.RequestException as exc:
            last_err = str(exc)

    if not session_id:
        raise RuntimeError(f"无法获取禅道 sessionID：{last_err or '未知错误'}")

    session.cookies.set("zentaosid", session_id)
    r = root.rstrip("/")
    last_err = None
    for login_url in (
        f"{r}/user-login.json?zentaosid={session_id}",
        f"{r}/user-login.json",
        f"{r}/index.php?m=user&f=login&t=json&zentaosid={session_id}",
    ):
        try:
            res = session.post(login_url, data={"account": user, "password": password}, timeout=20)
            if res.status_code != 200:
                continue
            body = res.json()
            if body.get("status") == "success":
                session.headers["Referer"] = f"{r}/"
                return session
            last_err = body.get("reason") or body.get("message") or str(body)[:200]
        except requests.RequestException as exc:
            last_err = str(exc)

    raise RuntimeError(f"禅道账号登录失败：{last_err or '未知错误'}")


def _url_append_zentaosid(url: str, session: requests.Session) -> str:
    sid = ""
    for c in session.cookies:
        if getattr(c, "name", None) == "zentaosid" and (getattr(c, "value", None) or "").strip():
            sid = str(c.value).strip()
            break
    if not sid or "zentaosid=" in url:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}zentaosid={sid}"


def fetch_execution_label(session: requests.Session, url: str, path_prefix: str, execution_id: int) -> str:
    eid = str(int(execution_id))
    root = _api_root(url, path_prefix).rstrip("/")
    for api_url in (
        f"{root}/execution-view-{eid}.json",
        f"{root}/execution-task-{eid}.json",
        f"{root}/index.php?m=execution&f=view&executionID={eid}&t=json",
        f"{root}/index.php?m=execution&f=task&executionID={eid}&t=json",
    ):
        try:
            res = session.get(_url_append_zentaosid(api_url, session), timeout=12)
            if res.status_code != 200:
                continue
            body = res.json()
            if str(body.get("status", "")).lower() in ("fail", "error", "failed"):
                continue
            data = _parse_data_any(body.get("data"))
            if not isinstance(data, dict):
                continue
            for key in ("execution", "executionInfo"):
                obj = data.get(key)
                if isinstance(obj, dict):
                    name = obj.get("name") or obj.get("title")
                    if name:
                        return str(name).strip()
            name = data.get("name")
            if name:
                return str(name).strip()
            title = data.get("title")
            if isinstance(title, str) and title.strip():
                t = title.strip()
                return t.split(">")[-1].strip() if ">" in t else t
        except (requests.RequestException, json.JSONDecodeError, TypeError, ValueError):
            continue
    return ""


def execution_task_url(url: str, path_prefix: str, execution_id: int) -> str:
    root = _api_root(url, path_prefix).rstrip("/")
    return f"{root}/execution-task-{int(execution_id)}.html"


def test_zentao_login(url: str, user: str, password: str, path_prefix: str = "") -> tuple[bool, str]:
    session = login_zentao(url, user, password, path_prefix, ssl_verify=False)
    _ = session
    return True, "登录成功"


def fetch_execution_info(url: str, user: str, password: str, path_prefix: str, execution_id: int) -> dict:
    session = login_zentao(url, user, password, path_prefix, ssl_verify=False)
    label = fetch_execution_label(session, url, path_prefix, execution_id)
    return {
        "id": int(execution_id),
        "label": label or f"执行 {execution_id}",
        "url": execution_task_url(url, path_prefix, execution_id),
    }


# ---------- 用例模块树（tree-manageChild，抓包自维护模块页）----------


def _zt_get(session: requests.Session, url: str, timeout: int = 20) -> requests.Response:
    return session.get(_url_append_zentaosid(url, session), timeout=timeout)


def _zt_post(session: requests.Session, url: str, data: dict | list, timeout: int = 30) -> requests.Response:
    return session.post(_url_append_zentaosid(url, session), data=data, timeout=timeout)


def fetch_case_modules(
    session: requests.Session,
    url: str,
    path_prefix: str,
    product_id: int,
) -> list[dict]:
    """拉取产品下用例模块列表。返回 [{id, name, parent, path_name}, ...]。"""
    root = _api_root(url, path_prefix).rstrip("/")
    pid = int(product_id)
    modules: list[dict] = []

    for api in (
        f"{root}/tree-browse-{pid}-case-0-0.json",
        f"{root}/index.php?m=tree&f=browse&root={pid}&viewType=case&t=json",
    ):
        try:
            res = _zt_get(session, api)
            if res.status_code != 200:
                continue
            body = res.json()
            data = _parse_data_any(body.get("data"))
            if data is None and isinstance(body, dict):
                data = body
            mods = _extract_modules_from_payload(data)
            if mods:
                return mods
        except (requests.RequestException, json.JSONDecodeError, TypeError, ValueError):
            continue

    # HTML 回退：浏览页里的模块链接
    try:
        res = _zt_get(session, f"{root}/tree-browse-{pid}-case-0-0.html")
        if res.status_code == 200 and res.text:
            modules = _extract_modules_from_html(res.text, pid)
    except requests.RequestException:
        pass
    return modules


def _extract_modules_from_payload(data: object) -> list[dict]:
    out: list[dict] = []
    if data is None:
        return out

    def add_one(obj: dict, parent: int = 0):
        if not isinstance(obj, dict):
            return
        mid = obj.get("id") or obj.get("moduleID") or obj.get("module")
        name = obj.get("name") or obj.get("title") or obj.get("text")
        if mid is None or not name:
            return
        try:
            mid_i = int(mid)
        except (TypeError, ValueError):
            return
        par = obj.get("parent")
        if par is None:
            par = parent
        try:
            par_i = int(par)
        except (TypeError, ValueError):
            par_i = 0
        out.append({"id": mid_i, "name": str(name).strip(), "parent": par_i})
        for key in ("children", "sons", "items"):
            kids = obj.get(key)
            if isinstance(kids, list):
                for k in kids:
                    add_one(k if isinstance(k, dict) else {}, mid_i)
            elif isinstance(kids, dict):
                for k in kids.values():
                    if isinstance(k, dict):
                        add_one(k, mid_i)

    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                add_one(item)
        return out

    if not isinstance(data, dict):
        return out

    for key in ("tree", "modules", "moduleTree", "datas", "list"):
        block = data.get(key)
        if isinstance(block, list):
            for item in block:
                if isinstance(item, dict):
                    add_one(item)
            if out:
                return out
        if isinstance(block, dict):
            # id → module map
            for v in block.values():
                if isinstance(v, dict):
                    add_one(v)
            if out:
                return out

    # 整包就是 module map
    if all(isinstance(v, dict) and ("name" in v or "title" in v) for v in data.values() if isinstance(v, dict)):
        for v in data.values():
            if isinstance(v, dict):
                add_one(v)
    return out


def _extract_modules_from_html(html: str, product_id: int) -> list[dict]:
    pid = int(product_id)
    # tree-browse-34-case-222-0.html … >名称</a>
    pat = re.compile(
        rf"tree-browse-{pid}-case-(\d+)[^\"']*[\"'][^>]*>([^<]+)<",
        re.I,
    )
    seen: set[int] = set()
    out: list[dict] = []
    for m in pat.finditer(html or ""):
        mid = int(m.group(1))
        if mid in seen or mid == 0:
            continue
        seen.add(mid)
        name = re.sub(r"\s+", " ", m.group(2)).strip()
        if not name:
            continue
        out.append({"id": mid, "name": name, "parent": 0})
    return out


def _module_index(modules: list[dict]) -> dict[int, dict]:
    return {int(m["id"]): m for m in modules if m.get("id") is not None}


def _children_of(modules: list[dict], parent_id: int) -> list[dict]:
    return [m for m in modules if int(m.get("parent") or 0) == int(parent_id)]


def _find_child(modules: list[dict], parent_id: int, name: str) -> dict | None:
    want = (name or "").strip()
    for m in _children_of(modules, parent_id):
        if (m.get("name") or "").strip() == want:
            return m
    return None


def create_case_module(
    session: requests.Session,
    url: str,
    path_prefix: str,
    product_id: int,
    name: str,
    parent_id: int = 0,
    *,
    existing_siblings: list[dict] | None = None,
) -> None:
    """在指定父模块下新建用例模块（POST tree-manageChild）。"""
    root = _api_root(url, path_prefix).rstrip("/")
    pid = int(product_id)
    post_url = f"{root}/tree-manageChild-{pid}-case.html"
    # 表单需带上已有兄弟（改名保留）+ 新名称
    data: list[tuple[str, str]] = []
    max_order = 0
    for sib in existing_siblings or []:
        sid = int(sib.get("id") or 0)
        sname = str(sib.get("name") or "").strip()
        if not sid or not sname:
            continue
        data.append((f"modules[id{sid}]", sname))
        data.append((f"shorts[id{sid}]", ""))
        order = int(sib.get("order") or 0)
        if order:
            data.append((f"order[id{sid}]", str(order)))
            max_order = max(max_order, order)
    data.append(("modules[]", str(name).strip()))
    data.append(("shorts[]", ""))
    # 禅道表单常有若干空行
    for _ in range(5):
        data.append(("modules[]", ""))
        data.append(("shorts[]", ""))
    data.append(("parentModuleID", str(int(parent_id))))
    data.append(("maxOrder", str(max_order)))
    res = _zt_post(session, post_url, data)
    if res.status_code >= 400:
        raise RuntimeError(f"创建模块失败 HTTP {res.status_code}")


def sync_framework_modules(
    url: str,
    user: str,
    password: str,
    path_prefix: str,
    product_id: int,
    module_paths: list[tuple[str, ...]],
    *,
    session: Optional[requests.Session] = None,
) -> dict[tuple[str, ...], int]:
    """按框架路径创建缺失模块，返回 path → module_id（含 () → 0）。"""
    if session is None:
        session = login_zentao(url, user, password, path_prefix, ssl_verify=False)
    pid = int(product_id)
    if pid < 1:
        raise RuntimeError("产品 ID 无效")

    path_to_id: dict[tuple[str, ...], int] = {(): 0}

    # 按深度排序，先父后子
    ordered = sorted({tuple(p) for p in module_paths if p}, key=lambda x: (len(x), x))

    modules = fetch_case_modules(session, url, path_prefix, pid)

    for path in ordered:
        parent_path = path[:-1]
        name = path[-1]
        parent_id = path_to_id.get(parent_path)
        if parent_id is None:
            raise RuntimeError(f"模块父路径未就绪：{'/'.join(parent_path)}")

        hit = _find_child(modules, parent_id, name)
        if hit:
            path_to_id[path] = int(hit["id"])
            continue

        siblings = _children_of(modules, parent_id)
        create_case_module(
            session,
            url,
            path_prefix,
            pid,
            name,
            parent_id,
            existing_siblings=siblings,
        )

        modules = fetch_case_modules(session, url, path_prefix, pid)
        hit = _find_child(modules, parent_id, name)
        if not hit:
            for m in modules:
                if (m.get("name") or "").strip() == name and path not in path_to_id:
                    if int(m.get("parent") or 0) == parent_id or parent_id == 0:
                        hit = m
                        break
            if not hit:
                for m in reversed(modules):
                    if (m.get("name") or "").strip() == name:
                        hit = m
                        break
        if not hit:
            raise RuntimeError(f"已提交创建但未读到模块 id：{'/'.join(path)}")
        path_to_id[path] = int(hit["id"])

    return path_to_id


# ---------- 用例 CSV 导入（testcase-import → showImport 确认）----------


def _html_unescape(s: str) -> str:
    import html as _html

    return _html.unescape(str(s or ""))


def _attr_name(attrs: str) -> str:
    m = re.search(r'\bname=["\']([^"\']+)["\']', attrs or "", re.I)
    if m:
        return m.group(1)
    m = re.search(r"\bname=([^\s>]+)", attrs or "", re.I)
    return m.group(1).strip("\"'") if m else ""


def _parse_form_fields(html: str) -> list[tuple[str, str]]:
    """从 showImport 页粗提取 input/textarea/select 的 name/value。"""
    fields: list[tuple[str, str]] = []
    for m in re.finditer(r"<input\b([^>]*)>", html or "", flags=re.I):
        attrs = m.group(1)
        typ_m = re.search(r'\btype=["\']([^"\']*)["\']', attrs, re.I)
        typ = (typ_m.group(1) if typ_m else "text").lower()
        if typ in ("submit", "button", "image", "file", "reset"):
            continue
        name = _attr_name(attrs)
        if not name:
            continue
        if typ in ("checkbox", "radio"):
            if not re.search(r"\bchecked\b", attrs, re.I):
                continue
            val_m = re.search(r'\bvalue=["\']([^"\']*)["\']', attrs, re.I)
            fields.append((name, _html_unescape(val_m.group(1) if val_m else "on")))
            continue
        val_m = re.search(r'\bvalue=["\']([^"\']*)["\']', attrs, re.I)
        fields.append((name, _html_unescape(val_m.group(1) if val_m else "")))

    for m in re.finditer(
        r"<textarea\b([^>]*)>(.*?)</textarea>",
        html or "",
        flags=re.I | re.S,
    ):
        attrs, body = m.group(1), m.group(2)
        name = _attr_name(attrs)
        if not name:
            continue
        fields.append(
            (name, _html_unescape(re.sub(r"<!--.*?-->", "", body, flags=re.S)))
        )

    for m in re.finditer(
        r"<select\b([^>]*)>(.*?)</select>",
        html or "",
        flags=re.I | re.S,
    ):
        attrs, body = m.group(1), m.group(2)
        name = _attr_name(attrs)
        if not name:
            continue
        sel = re.search(
            r"<option\b([^>]*\bselected\b[^>]*)>.*?</option>",
            body,
            flags=re.I | re.S,
        )
        if not sel:
            sel = re.search(r"<option\b([^>]*)>", body, flags=re.I)
        if not sel:
            fields.append((name, ""))
            continue
        val_m = re.search(r'\bvalue=["\']([^"\']*)["\']', sel.group(1), re.I)
        fields.append((name, _html_unescape(val_m.group(1) if val_m else "")))
    return fields


def _normalize_import_fields(fields: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """补全空用例类型为 feature；补提交按钮字段。"""
    out: list[tuple[str, str]] = []
    names: set[str] = set()
    for name, val in fields:
        names.add(name)
        if re.match(r"^type\[\d+\]$", name) and not str(val or "").strip():
            out.append((name, "feature"))
        else:
            out.append((name, val))
    # 禅道确认页需要点「保存」才会真正入库；无 submit 时常只停留在预览
    if "submit" not in names:
        out.append(("submit", "保存"))
    return out


def _title_fields(fields: list[tuple[str, str]]) -> list[str]:
    return [n for n, _ in fields if re.match(r"^title\[\d+\]$", n)]


def _is_browse_url(url: str) -> bool:
    u = (url or "").lower()
    return "testcase-browse" in u or re.search(r"/testcase-browse-", u) is not None


def _is_show_import_url(url: str) -> bool:
    u = (url or "").lower()
    return "showimport" in u


def _is_max_import_setup(html: str) -> bool:
    """禅道：超过默认每页条数时，先出「每页导入 N 条」中间页，无 title[]。"""
    h = html or ""
    return bool(
        re.search(r'id=["\']maxImport["\']', h, re.I)
        and re.search(r'id=["\']allCount["\']', h, re.I)
    )


def _is_max_input_vars_block(html: str) -> bool:
    h = html or ""
    return "max_input_vars" in h and ("数据太多" in h or "无法保存" in h)


def _parse_import_all_count(html: str) -> int:
    m = re.search(r'id=["\']allCount["\'][^>]*>(\d+)', html or "", re.I)
    if m:
        return int(m.group(1))
    return 0


def _show_import_chunk_url(root: str, product_id: int, page_id: int, max_import: int) -> str:
    # PATH_INFO：testcase-showImport-{product}-{branch}-{pageID}-{maxImport}.html
    return f"{root}/testcase-showImport-{int(product_id)}-0-{int(page_id)}-{int(max_import)}.html"


def import_cases_csv(
    session: requests.Session,
    url: str,
    path_prefix: str,
    product_id: int,
    csv_text: str,
    *,
    filename: str = "cases.csv",
    max_pages: int = 80,
    on_progress=None,
) -> dict:
    """
    自动走禅道导入：
      POST testcase-import-{product}-0.html  (multipart file + encode)
      若条数多：先过「每页导入」中间页，再分页确认 showImport
      POST testcase-showImport-...  (确认，可能多页)
    on_progress(dict): 可选，推送真实步骤进度。
    """
    def prog(step: str, percent: int, **extra):
        if callable(on_progress):
            try:
                on_progress({"step": step, "percent": int(percent), **extra})
            except Exception:
                pass

    root = _api_root(url, path_prefix).rstrip("/")
    pid = int(product_id)
    if pid < 1:
        raise RuntimeError("产品 ID 无效")

    raw = csv_text.encode("utf-8") if isinstance(csv_text, str) else bytes(csv_text or b"")
    # 去掉 BOM 再交给禅道（encode=utf-8）
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    if not raw.strip():
        raise RuntimeError("CSV 内容为空，无法导入")

    prog("上传 CSV 到禅道", 35)
    import_url = f"{root}/testcase-import-{pid}-0.html"
    files = {
        "file": (filename or "cases.csv", raw, "text/csv"),
    }
    data = {"encode": "utf-8"}
    try:
        res = session.post(
            _url_append_zentaosid(import_url, session),
            data=data,
            files=files,
            timeout=180,
            allow_redirects=True,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"上传 CSV 失败：{exc}") from exc
    if res.status_code >= 400:
        raise RuntimeError(f"上传 CSV 失败 HTTP {res.status_code}")

    show_base = f"{root}/testcase-showImport-{pid}-0.html"
    confirmed_pages = 0
    imported_titles = 0
    last_html = res.text or ""
    last_url = res.url or ""
    post_url = show_base
    chunk_size = 0  # >0 表示走 PATH_INFO 分页

    def _titles_of(html: str) -> list[str]:
        return _title_fields(_parse_form_fields(html or ""))

    # 上传响应常是 JS 跳转，不含 title[]；统一打开确认页
    if not _titles_of(last_html):
        prog("打开导入确认页", 42)
        try:
            res = _zt_get(session, show_base, timeout=90)
            last_html = res.text or ""
            last_url = res.url or ""
        except requests.RequestException as exc:
            raise RuntimeError(f"打开导入确认页失败：{exc}") from exc

    # 大批量：禅道先出「每页导入 N 条」；本机 php max_input_vars 常撑不住默认 100
    if _is_max_import_setup(last_html) or (
        not _titles_of(last_html) and _is_max_input_vars_block(last_html)
    ):
        all_count = _parse_import_all_count(last_html)
        # 优先 50，过大则遇 max_input_vars 警告再降
        for cand in (50, 40, 30, 20):
            prog(
                f"用例较多（{all_count or '?'} 条），按每批 {cand} 条打开确认页",
                46,
                allCount=all_count,
                maxImport=cand,
            )
            try_url = _show_import_chunk_url(root, pid, 1, cand)
            try:
                res = _zt_get(session, try_url, timeout=120)
            except requests.RequestException as exc:
                raise RuntimeError(f"打开分页确认页失败：{exc}") from exc
            last_html = res.text or ""
            last_url = res.url or ""
            if _is_max_input_vars_block(last_html) or _is_max_import_setup(last_html):
                continue
            if _titles_of(last_html):
                chunk_size = cand
                post_url = try_url
                break
        else:
            raise RuntimeError(
                "禅道因单页用例过多触发 max_input_vars 限制，确认页无用例行。"
                "已尝试每批 50/40/30/20 条仍失败。请运维调大 php.ini 的 max_input_vars，"
                "或用方式 2 下载 CSV 后在禅道手动分批导入。"
            )

    if not _titles_of(last_html):
        tip = re.search(
            r"<div[^>]*class=[\"'][^\"']*alert[^\"']*[\"'][^>]*>(.*?)</div>",
            last_html or "",
            re.I | re.S,
        )
        msg = re.sub(r"<[^>]+>", "", tip.group(1)).strip() if tip else ""
        empty_hint = ""
        if re.search(r"暂时没有数据|没有数据|no\s*data", last_html or "", re.I):
            empty_hint = "禅道提示「暂时没有数据」，请检查 CSV 表头是否与导出模板一致、编码是否为 UTF-8。"
        raise RuntimeError(
            (msg and f"导入确认页异常：{msg[:200]}")
            or empty_hint
            or "导入确认页未解析到用例行（模块可能已同步，但用例未进入确认页）。请用方式 2 下载 CSV 后在禅道手动导入核对模板。"
        )

    page = 1
    while page <= max_pages:
        if _is_browse_url(last_url) and confirmed_pages > 0:
            break

        # 分页模式下，当前页无表单则拉下一 PATH_INFO 页
        if not _titles_of(last_html) and chunk_size > 0 and confirmed_pages > 0:
            next_url = _show_import_chunk_url(root, pid, page, chunk_size)
            try:
                res = _zt_get(session, next_url, timeout=120)
                last_html = res.text or ""
                last_url = res.url or ""
                post_url = next_url
            except requests.RequestException:
                break
            if not _titles_of(last_html):
                break

        fields = _normalize_import_fields(_parse_form_fields(last_html))
        titles = _title_fields(fields)
        if not titles:
            if confirmed_pages > 0:
                break
            raise RuntimeError("导入确认中断：后续页未解析到用例标题")

        page_titles = sum(
            1
            for n, v in fields
            if re.match(r"^title\[\d+\]$", n) and str(v or "").strip()
        )
        names = {n for n, _ in fields}
        if "pagerID" not in names:
            fields.append(("pagerID", str(page)))
        if "isEndPage" not in names:
            has_next = bool(
                re.search(
                    rf"showImport[^\"']*pagerID[^\"']*{page + 1}",
                    last_html or "",
                    re.I,
                )
                or re.search(r"下一页|下页|>\s*»|next\s*page", last_html or "", re.I)
                or (chunk_size > 0 and page_titles >= chunk_size)
            )
            fields.append(("isEndPage", "0" if has_next else "1"))

        pct = min(92, 50 + int(40 * page / max(max_pages, 1)))
        prog(
            f"确认导入第 {page} 页（本页 {page_titles} 条）",
            pct,
            page=page,
            pageTitles=page_titles,
        )
        try:
            res = _zt_post(session, post_url, fields, timeout=180)
            last_html = res.text or ""
            last_url = res.url or ""
            confirmed_pages += 1
            imported_titles += page_titles
        except requests.RequestException as exc:
            raise RuntimeError(f"确认导入第 {page} 页失败：{exc}") from exc

        if _is_browse_url(last_url):
            break

        # 响应里已有下一页表单
        if _titles_of(last_html):
            page += 1
            continue

        # 大批量：主动打开下一 PATH_INFO 页
        if chunk_size > 0:
            page += 1
            next_url = _show_import_chunk_url(root, pid, page, chunk_size)
            try:
                res = _zt_get(session, next_url, timeout=120)
                last_html = res.text or ""
                last_url = res.url or ""
                post_url = next_url
            except requests.RequestException:
                break
            if not _titles_of(last_html):
                break
            continue

        if not _is_show_import_url(last_url) and "showimport" not in (
            last_html or ""
        ).lower():
            break
        page += 1

    if confirmed_pages < 1 or imported_titles < 1:
        raise RuntimeError(
            "未能确认写入任何用例（模块可能已创建）。"
            "常见原因：确认页未点保存、CSV 缺「用例类型/标题」、或禅道忽略了无效行。"
            "请用方式 2 下载 CSV，在禅道用例页手动「导入」验证。"
        )

    browse = f"{root}/testcase-browse-{pid}-0-all.html"
    # 兼容旧版路径
    browse_alt = f"{root}/testcase-browse-{pid}.html"
    prog("导入完成", 100, importedTitles=imported_titles, confirmedPages=confirmed_pages)
    return {
        "ok": True,
        "productId": pid,
        "confirmedPages": confirmed_pages,
        "importedTitles": imported_titles,
        "browseUrl": browse,
        "browseUrlAlt": browse_alt,
        "maxImport": chunk_size or None,
    }

