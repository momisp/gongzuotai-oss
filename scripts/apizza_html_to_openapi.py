#!/usr/bin/env python3
"""将 apizza 导出的 HTML 接口文档转换为 OpenAPI 3.0（Apifox 可导入）。"""

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

from bs4 import BeautifulSoup

TYPE_MAP = {
    "string": "string",
    "number": "number",
    "integer": "integer",
    "int": "integer",
    "float": "number",
    "double": "number",
    "boolean": "boolean",
    "bool": "boolean",
    "array": "array",
    "object": "object",
}


def map_type(raw: str) -> str:
    return TYPE_MAP.get((raw or "").strip().lower(), "string")


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_json_example(text: str) -> Optional[Any]:
    text = (text or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def detect_table_kind(table) -> Optional[str]:
    thead = table.find("thead")
    if not thead:
        return None
    header_text = clean_text(thead.get_text())
    if "Body参数名" in header_text:
        return "body"
    if "参数名" in header_text:
        return "response"
    return None


def parse_body_table(table) -> List[dict]:
    rows = []
    tbody = table.find("tbody")
    if not tbody:
        return rows
    for tr in tbody.find_all("tr", recursive=False):
        cells = [clean_text(td.get_text()) for td in tr.find_all(["td", "th"])]
        if len(cells) < 4:
            continue
        rows.append(
            {
                "name": cells[0],
                "type": cells[1],
                "required": cells[2] in ("是", "true", "True", "必填"),
                "description": cells[3],
                "example": cells[4] if len(cells) > 4 else "",
            }
        )
    return rows


def parse_response_table(table) -> List[dict]:
    rows = []
    tbody = table.find("tbody")
    if not tbody:
        return rows
    for tr in tbody.find_all("tr", recursive=False):
        cells = [clean_text(td.get_text()) for td in tr.find_all(["td", "th"])]
        if len(cells) < 3:
            continue
        rows.append(
            {
                "name": cells[0],
                "description": cells[1],
                "type": cells[2],
            }
        )
    return rows


def extract_apis(soup: BeautifulSoup) -> Tuple[str, List[dict]]:
    section_title = ""
    apis: List[dict] = []
    skip_appendix = False

    block = soup.select_one(".block-doc-one")
    if not block:
        return section_title, apis

    h1 = block.find("h1")
    if h1:
        section_title = clean_text(h1.get_text())

    for api_div in block.select(".api-one"):
        h3 = api_div.find("h3")
        if not h3:
            continue

        name = clean_text(h3.get_text())
        if name == "环境变量" or h3.get("id") == "envs":
            skip_appendix = True
            continue
        if skip_appendix:
            continue

        api = {
            "name": name,
            "id": h3.get("id", ""),
            "method": "POST",
            "url": "",
            "body_params": [],
            "response_params": [],
            "response_example": None,
            "section": section_title,
        }

        for p in api_div.find_all("p"):
            text = clean_text(p.get_text())
            if text.startswith("请求方式："):
                api["method"] = text.replace("请求方式：", "").strip().upper()
            elif text.startswith("请求地址："):
                api["url"] = text.replace("请求地址：", "").strip()

        for table in api_div.find_all("table"):
            kind = detect_table_kind(table)
            if kind == "body":
                api["body_params"] = parse_body_table(table)
            elif kind == "response":
                api["response_params"] = parse_response_table(table)

        code = api_div.find("code")
        if code:
            api["response_example"] = parse_json_example(code.get_text())

        if api["url"] or api["name"]:
            apis.append(api)

    return section_title, apis


def build_properties_from_params(params: List[dict]) -> Tuple[dict, List[str]]:
    properties: Dict[str, dict] = {}
    required: List[str] = []
    for p in params:
        prop: Dict[str, Any] = {
            "type": map_type(p["type"]),
            "description": p.get("description", ""),
        }
        if p.get("example"):
            prop["example"] = p["example"]
        properties[p["name"]] = prop
        if p.get("required"):
            required.append(p["name"])
    return properties, required


def example_to_schema(value: Any) -> dict:
    if isinstance(value, dict):
        props = {}
        for k, v in value.items():
            props[k] = example_to_schema(v)
        return {"type": "object", "properties": props}
    if isinstance(value, list):
        item_schema = (
            example_to_schema(value[0]) if value else {"type": "object"}
        )
        return {"type": "array", "items": item_schema}
    if isinstance(value, bool):
        return {"type": "boolean"}
    if isinstance(value, int):
        return {"type": "integer"}
    if isinstance(value, float):
        return {"type": "number"}
    return {"type": "string"}


def build_response_schema(api: dict) -> dict:
    if api.get("response_example") is not None:
        return example_to_schema(api["response_example"])

    properties: Dict[str, Any] = {}
    for p in api.get("response_params", []):
        name = p["name"]
        prop = {
            "type": map_type(p["type"]),
            "description": p.get("description", ""),
        }
        if "." in name:
            parts = name.split(".")
            root = properties.setdefault(
                parts[0], {"type": "object", "properties": {}}
            )
            if root.get("type") == "object":
                root["properties"][parts[1]] = prop
        else:
            properties[name] = prop

    return {"type": "object", "properties": properties}


def path_from_url(url: str) -> str:
    path = urlparse(url).path or "/"
    return re.sub(r"/+", "/", path)


def operation_id(name: str, path: str) -> str:
    slug = re.sub(r"[^\w]+", "_", name, flags=re.UNICODE).strip("_")
    if slug:
        return slug
    slug = re.sub(r"[^\w]+", "_", path).strip("_")
    return slug or "operation"


def convert(html_path: Path, output_path: Path) -> dict:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    section_title, apis = extract_apis(soup)

    base_url = "http://qq.klewanq.com"
    paths: Dict[str, dict] = {}
    tags_seen: Set[str] = set()

    for api in apis:
        if not api.get("url"):
            continue

        parsed = urlparse(api["url"])
        if parsed.scheme and parsed.netloc:
            base_url = f"{parsed.scheme}://{parsed.netloc}"

        path = path_from_url(api["url"])
        method = api["method"].lower()
        section = api.get("section") or "默认"
        tags_seen.add(section)

        body_props, body_required = build_properties_from_params(
            api.get("body_params", [])
        )
        request_body = {
            "required": True,
            "content": {
                "application/x-www-form-urlencoded": {
                    "schema": {
                        "type": "object",
                        "properties": body_props,
                        "required": body_required,
                    }
                },
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": body_props,
                        "required": body_required,
                    }
                },
            },
        }

        response_example = api.get("response_example")
        response_content: Dict[str, Any] = {
            "application/json": {
                "schema": build_response_schema(api),
            }
        }
        if response_example is not None:
            response_content["application/json"]["example"] = response_example

        operation = {
            "tags": [section],
            "summary": api["name"],
            "operationId": operation_id(api["name"], path),
            "requestBody": request_body,
            "responses": {
                "200": {
                    "description": "成功",
                    "content": response_content,
                }
            },
        }

        paths.setdefault(path, {})[method] = operation

    openapi = {
        "openapi": "3.0.3",
        "info": {
            "title": section_title or "PC端游接口",
            "description": "由 apizza HTML 导出转换，适用于 Apifox 导入",
            "version": "1.0.0",
        },
        "servers": [{"url": base_url, "description": "默认服务器"}],
        "tags": [{"name": t} for t in sorted(tags_seen)],
        "paths": paths,
    }

    output_path.write_text(
        json.dumps(openapi, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return openapi


def main():
    if len(sys.argv) < 2:
        print("用法: python apizza_html_to_openapi.py <html文件> [输出json路径]")
        sys.exit(1)

    html_path = Path(sys.argv[1]).resolve()
    if len(sys.argv) >= 3:
        output_path = Path(sys.argv[2]).resolve()
    else:
        output_path = html_path.with_suffix(".openapi.json")

    if not html_path.exists():
        print(f"文件不存在: {html_path}")
        sys.exit(1)

    result = convert(html_path, output_path)
    print(f"已转换 {len(result['paths'])} 个接口")
    print(f"输出文件: {output_path}")


if __name__ == "__main__":
    main()
