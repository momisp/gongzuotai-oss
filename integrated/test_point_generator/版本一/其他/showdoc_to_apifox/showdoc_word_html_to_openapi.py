# -*- coding: utf-8 -*-
"""
将 ShowDoc / RunApi 导出的「Word」实为 HTML 的 .doc 转为 OpenAPI 3.0 JSON，供 Apifox 导入。

用法:
  python showdoc_word_html_to_openapi.py [输入.doc/.html] [-o 输出.json] [--prefix /tg]

说明:
  - 依赖文档内典型结构: <h5>请求URL</h5> + <h5>请求方式</h5>，可选 <h5>请求参数示例</h5> 内 JSON。
  - 默认跳过 showdoc.com.cn 等占位 URL。
  - 每个接口会带 `tags`：按文档中出现的 h1→h2→h3→h4 标题栈生成路径（用 ` / ` 连接），便于 Apifox 按标签分组；根级 `tags` 列出全部用到的分组名。
  - servers.url 须为合法 URL；含中文主机名会导致解析失败（预览里接口数为 0）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

# 请求URL + 请求方式（允许 li/code 内多空格）
_URL_METHOD = re.compile(
    r"<h5>请求URL</h5>\s*<ul>\s*<li>\s*<code>\s*([^<]+?)\s*</code>\s*</li>\s*</ul>\s*"
    r"<h5>请求方式</h5>\s*<ul>\s*<li>\s*([^<]+?)\s*</li>",
    re.IGNORECASE | re.DOTALL,
)

# 只识别 h1~h4 作目录（h5/h6 在文档里多为「简要描述」等，不能当分组）
_HEADING = re.compile(r"<h([1-4])[^>]*>([^<]+)</h\1>", re.IGNORECASE)

# 请求参数示例后的第一个 <pre><code>...</code></pre>
_BODY_SAMPLE = re.compile(
    r"<h5>请求参数示例</h5>\s*.*?<pre>\s*<code>(.*?)</code>\s*</pre>",
    re.IGNORECASE | re.DOTALL,
)


def _strip_base(url: str) -> str | None:
    u = url.strip()
    if "showdoc.com.cn" in u or "showdoc.cc" in u:
        return None
    u = u.replace("{{baseUrl}}", "").replace("${baseUrl}", "")
    if u.startswith("http://") or u.startswith("https://"):
        try:
            from urllib.parse import urlparse

            p = urlparse(u)
            path = p.path or "/"
            return path if path.startswith("/") else "/" + path
        except Exception:
            return None
    if not u.startswith("/"):
        u = "/" + u
    return u or None


def _heading_events(html: str) -> list[tuple[int, int, str]]:
    """返回 (heading 结束位置, 级别 1-4, 标题文本)，按文档顺序。"""
    return [(m.end(), int(m.group(1)), m.group(2).strip()) for m in _HEADING.finditer(html)]


def _parse_json_sample(raw: str) -> Any | None:
    s = raw.strip()
    if not s or s in ("无", "null"):
        return None
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return None


def convert(html: str, path_prefix: str | None) -> dict[str, Any]:
    paths: dict[str, Any] = {}
    skipped = 0
    dup = 0
    tag_names: set[str] = set()

    head_events = _heading_events(html)
    hi = 0
    stack: list[tuple[int, str]] = []  # (level, title)

    for m in _URL_METHOD.finditer(html):
        pos = m.start()
        while hi < len(head_events) and head_events[hi][0] <= pos:
            level, text = head_events[hi][1], head_events[hi][2]
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, text))
            hi += 1

        trail = [t[1] for t in stack]
        group_tag = " / ".join(trail) if trail else "未分类"

        raw_url, raw_method = m.group(1), m.group(2)
        path = _strip_base(raw_url)
        if not path:
            skipped += 1
            continue
        pref = path_prefix.rstrip("/") if path_prefix else ""
        if pref and path != pref and not path.startswith(pref + "/"):
            skipped += 1
            continue

        method = raw_method.strip().lower()
        if method not in ("get", "post", "put", "delete", "patch", "head", "options"):
            method = "post"

        tail = html[m.end() : m.end() + 12000]
        body_m = _BODY_SAMPLE.search(tail)
        example = _parse_json_sample(body_m.group(1)) if body_m else None

        # summary：沿用离接口最近的一级标题（一般为 h2/h3）
        summary = trail[-1] if trail else path

        op: dict[str, Any] = {
            "tags": [group_tag],
            "summary": summary or path,
            "responses": {"200": {"description": "OK"}},
        }
        tag_names.add(group_tag)
        if example is not None:
            op["requestBody"] = {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": {"type": "object"},
                        "example": example,
                    }
                },
            }
        elif method in ("post", "put", "patch"):
            op["requestBody"] = {
                "content": {"application/json": {"schema": {"type": "object"}}},
            }

        key = path
        if key not in paths:
            paths[key] = {}
        if method in paths[key]:
            dup += 1
        paths[key][method] = op

    doc: dict[str, Any] = {
        "openapi": "3.0.0",
        "info": {
            "title": "从 ShowDoc Word/HTML 导出转换",
            "version": "1.0.0",
            "description": "由 showdoc_word_html_to_openapi.py 生成。请在 Apifox 中配置环境与 baseUrl。tags 对应原文 h1~h4 目录路径，便于分组。",
        },
        "tags": [{"name": name} for name in sorted(tag_names)],
        "servers": [
            {
                "url": "http://127.0.0.1:8080",
                "description": "占位 base（须合法 URL）。导入后在 Apifox 环境里改成真实网关；path 已去掉 {{baseUrl}}。",
            }
        ],
        "paths": dict(sorted(paths.items())),
    }
    doc["x-meta"] = {  # type: ignore[assignment]
        "parsed_endpoints": sum(len(v) for v in paths.values()),
        "skipped_url_blocks": skipped,
        "duplicate_method_overwrites": dup,
    }
    return doc


def main() -> int:
    ap = argparse.ArgumentParser(description="ShowDoc HTML/.doc → OpenAPI JSON (Apifox)")
    ap.add_argument("input", nargs="?", help="输入 .doc/.html 路径")
    ap.add_argument("-o", "--output", help="输出 .json 路径")
    ap.add_argument("--prefix", help='只保留 path 以此前缀开头的接口，如 /tg')
    args = ap.parse_args()

    default_in = Path(r"c:\Users\yzyz\Desktop\源之蜂巢.doc")
    in_path = Path(args.input) if args.input else default_in
    if not in_path.is_file():
        print("文件不存在:", in_path, file=sys.stderr)
        return 1

    raw = in_path.read_bytes()
    if raw[:5] == b"<?xml" or raw[:2] == b"PK":
        print("暂不处理 XML/OOXML，请使用当前这种 Word 另存为 HTML 的 .doc。", file=sys.stderr)
        return 1

    text = raw.decode("utf-8", errors="replace")
    if "<html" not in text[:2000].lower():
        print("未识别为 HTML。OLE 二进制 .doc 需用 Word 另存为「网页」或导出 HTML 后再转换。", file=sys.stderr)
        return 1

    spec = convert(text, args.prefix.strip() if args.prefix else None)
    meta = spec.pop("x-meta", {})
    out_path = Path(args.output) if args.output else in_path.with_suffix(".openapi.json")
    out_path = out_path.resolve()
    out_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    print("写入:", out_path)
    print("统计:", meta)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
