"""将 Markdown 标题树转为 XMind Zen (.xmind，zip+content.json)。默认嵌入 Snowbrush（雪青）主题。"""
from __future__ import annotations

import io
import json
import re
import uuid
import zipfile
from pathlib import Path
from typing import Any

_THEME_PATH = Path(__file__).resolve().parent / "themes" / "snowbrush.json"

# 本机 XMind「Snowbrush / 雪青」主题快照（中心红底 + 白画布）；themes/snowbrush.json 优先
_SNOWBRUSH_FALLBACK: dict[str, Any] = {
    "importantTopic": {
        "id": "ed2cbbaa-82c0-4fda-8a3c-f65c9387fc0c",
        "properties": {
            "fo:font-weight": "bold",
            "fo:color": "#F8F7F7",
            "svg:fill": "#111111",
        },
    },
    "minorTopic": {
        "id": "6adf0549-7174-4893-b07f-88f9d262c393",
        "properties": {
            "fo:font-weight": "bold",
            "fo:color": "#F8F7F7",
            "svg:fill": "#666666",
        },
    },
    "expiredTopic": {
        "id": "a9e7ce21-0b6c-42ec-b362-7672553b1c2e",
        "properties": {
            "fo:font-style": "italic",
            "fo:text-decoration": " line-through",
        },
    },
    "boundary": {
        "id": "7eb41177-cdd1-4b51-9a09-819580a7a8f5",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "13",
            "fo:font-weight": "700",
            "fo:font-style": "normal",
            "fo:color": "#FFFFFF",
            "svg:fill": "none",
            "line-color": "#F6212D",
        },
    },
    "calloutTopic": {
        "id": "ac43f41c-0777-4e5e-af51-385566884bed",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "14",
            "fo:font-weight": "600",
            "fo:font-style": "normal",
            "svg:fill": "#292929",
        },
    },
    "centralTopic": {
        "id": "d6ec6ed0-fc44-4c73-9f4f-17a1656eca49",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "28",
            "fo:font-weight": "600",
            "fo:font-style": "normal",
            "fo:color": "#FFFFFF",
            "svg:fill": "#F6212D",
            "line-width": "4",
            "line-color": "#333333",
            "border-line-width": "0",
            "shape-class": "org.xmind.topicShape.roundedRect",
            "line-class": "org.xmind.branchConnection.curve",
        },
    },
    "floatingTopic": {
        "id": "c12f37a4-34b8-4a96-86c0-3b224f86cd41",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "16",
            "fo:font-weight": "600",
            "fo:font-style": "normal",
            "svg:fill": "#292929",
            "line-width": "2",
            "line-color": "#292929",
            "border-line-width": "0",
        },
    },
    "mainTopic": {
        "id": "a38cff55-d043-4d59-ae40-68be1d94d4b1",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "20",
            "fo:font-weight": "500",
            "fo:font-style": "normal",
            "fo:color": "#333333",
            "svg:fill": "#FFFFFF",
            "border-line-width": "1",
            "border-line-color": "#D0D0D0",
            "shape-class": "org.xmind.topicShape.roundedRect",
            "line-width": "3",
            "line-color": "#333333",
            "line-class": "org.xmind.branchConnection.curve",
        },
    },
    "map": {
        "id": "a751a55c-1140-4e7c-902a-2c714e5c4604",
        "properties": {
            "svg:fill": "#FFFFFF",
        },
    },
    "relationship": {
        "id": "6e66ddbb-5ac0-49aa-baee-26fdcfaea503",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "14",
            "fo:font-weight": "normal",
            "fo:font-style": "normal",
            "fo:color": "#292929",
            "line-color": "#292929",
            "line-pattern": "dash",
            "arrow-begin-class": "org.xmind.arrowShape.none",
            "arrow-end-class": "org.xmind.arrowShape.triangle",
        },
    },
    "subTopic": {
        "id": "71f97740-8a9c-46f9-a28d-77243ca46a9a",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "14",
            "fo:font-weight": "500",
            "fo:font-style": "normal",
            "fo:color": "#333333",
            "svg:fill": "#F8F7F7",
            "border-line-width": "0",
            "shape-class": "org.xmind.topicShape.roundedRect",
            "line-class": "org.xmind.branchConnection.curve",
            "line-width": "2",
            "line-color": "#333333",
        },
    },
    "summary": {
        "id": "99b208e6-b7b1-4a12-b1ce-df3e6e21a9b9",
        "properties": {
            "line-width": "2",
            "line-color": "#292929",
            "shape-class": "org.xmind.summaryShape.round",
        },
    },
    "summaryTopic": {
        "id": "93e4ec30-6b6c-4b50-9b31-ebd648257c44",
        "properties": {
            "fo:font-family": "NeverMind",
            "fo:font-size": "16",
            "fo:font-weight": "600",
            "fo:font-style": "normal",
            "svg:fill": "#4051B5",
            "line-width": "2",
            "border-line-width": "0",
            "line-class": "org.xmind.branchConnection.curve",
        },
    },
}


def _load_snowbrush_theme() -> dict[str, Any]:
    try:
        raw = json.loads(_THEME_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and "centralTopic" in raw:
            theme = json.loads(json.dumps(raw))  # deep copy
            # 与画廊预览对齐：红心白字、主分支圆角白底、曲线连接
            ct = theme.setdefault("centralTopic", {}).setdefault("properties", {})
            ct.setdefault("fo:color", "#FFFFFF")
            ct.setdefault("shape-class", "org.xmind.topicShape.roundedRect")
            ct.setdefault("line-class", "org.xmind.branchConnection.curve")
            mt = theme.setdefault("mainTopic", {}).setdefault("properties", {})
            mt.setdefault("fo:color", "#333333")
            mt.setdefault("svg:fill", "#FFFFFF")
            mt.setdefault("border-line-width", "1")
            mt.setdefault("border-line-color", "#D0D0D0")
            mt.setdefault("shape-class", "org.xmind.topicShape.roundedRect")
            mt.setdefault("line-color", "#333333")
            mt.setdefault("line-class", "org.xmind.branchConnection.curve")
            st = theme.setdefault("subTopic", {}).setdefault("properties", {})
            st.setdefault("line-class", "org.xmind.branchConnection.curve")
            st.setdefault("line-color", "#333333")
            return theme
    except OSError:
        pass
    return json.loads(json.dumps(_SNOWBRUSH_FALLBACK))


def _nid() -> str:
    return uuid.uuid4().hex[:16]


_PRIORITY_PREFIX_RE = re.compile(
    r"^[\[［【]\s*P\s*([012])\s*[\]］】]\s*",
    re.I,
)
# 〔源:路径 ·「控件」〕勿当「标题：备注」切分，导出脑图/用例也不保留
_SOURCE_ANCHOR_RE = re.compile(
    r"[〔【\[]\s*源\s*[:：][^〕】\]]*[〕】\]]"
    r"|\(\s*源\s*[:：][^)]*\)"
)


def _strip_priority_prefix(text: str) -> str:
    """导出 XMind 时去掉叶子上的 [P0]/[P1]/[P2]（含全角括号），脑图名称不显示级别。"""
    s = str(text or "").strip()
    # 连续前缀也剥干净
    for _ in range(3):
        nxt = _PRIORITY_PREFIX_RE.sub("", s).strip()
        if nxt == s:
            break
        s = nxt
    return s


def _strip_source_anchor(text: str) -> str:
    s = _SOURCE_ANCHOR_RE.sub("", str(text or ""))
    return re.sub(r"\s+", " ", s).strip()


def _strip_heading_marks(text: str) -> str:
    """模型常把「### 筛选区」写成列表项；导出时去掉标题井号。"""
    return re.sub(r"^#{1,6}\s+", "", str(text or "").strip()).strip()


def _expand_field_list_children(rest: str) -> list[dict[str, Any]]:
    """把「A / B / C」拆成子节点，避免字段进备注。"""
    t = re.sub(r"\s+", " ", str(rest or "")).strip()
    if not t:
        return []
    parts = [p.strip() for p in re.split(r"\s*/\s*|、", t) if p.strip()]
    if len(parts) < 2 or any(len(p) > 40 for p in parts):
        return []
    out: list[dict[str, Any]] = []
    for p in parts:
        p = re.sub(r"[，,].*$", "", p).strip()
        if p:
            out.append({"title": p, "intro": "", "children": [], "priority": "2"})
    return out if len(out) >= 2 else []


def _split_label_enum(body: str) -> tuple[str, str] | None:
    """仅在括号外的冒号处切分，避免「结算模式（单选：预付款…）」被截断。"""
    s = str(body or "")
    depth = 0
    for i, ch in enumerate(s):
        if ch in "（(":
            depth += 1
        elif ch in "）)":
            depth = max(0, depth - 1)
        elif ch in "：" and depth == 0 and 1 <= i <= 40:
            head, rest = s[:i].strip(), s[i + 1 :].strip()
            if head and rest:
                return head, rest
    return None


def _heading_parent(heading_stack: list[tuple[int, dict[str, Any]]]) -> dict[str, Any]:
    return heading_stack[-1][1] if heading_stack else {"title": "", "intro": "", "children": []}


def parse_md_tree(md: str) -> dict[str, Any]:
    """#~###### / 缩进嵌套 - / > 业务简介 → 树。

    缩进列表必须保留父子关系，例如：
      - 安全验证弹窗
        - 标题「安全验证」
    导出 XMind 时「标题」应挂在弹窗下，而不是与弹窗并排。
    叶子上的 [P0]/[P1]/[P2] 优先级标记会在导出时剥离，不出现在脑图名称上。
    """
    root: dict[str, Any] = {"title": "中心主题", "intro": "", "children": []}
    # (heading_level, node)；root 视为 level 0
    heading_stack: list[tuple[int, dict[str, Any]]] = [(0, root)]
    # (indent_spaces, node)；同一标题块内的列表缩进栈
    list_stack: list[tuple[int, dict[str, Any]]] = []

    for raw in str(md or "").splitlines():
        if not str(raw or "").strip():
            continue

        line = raw.strip()

        hm = re.match(r"^(#{1,6})\s+(.+)$", line)
        if hm:
            level = len(hm.group(1))
            title = _strip_heading_marks(
                _strip_source_anchor(_strip_priority_prefix(hm.group(2).strip()))
            )
            list_stack = []
            if level == 1:
                root["title"] = re.sub(
                    r"[·•]\s*页面框架\s*$|\s*页面框架\s*$|\s*测试点\s*$",
                    "",
                    title,
                ).strip() or root["title"]
                heading_stack = [(0, root)]
                continue
            node: dict[str, Any] = {"title": title, "intro": "", "children": []}
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            _heading_parent(heading_stack)["children"].append(node)
            heading_stack.append((level, node))
            continue

        bq = re.match(r"^>\s*(?:业务简介\s*[:：]\s*)?(.+)$", line)
        if bq:
            target = _heading_parent(heading_stack)
            intro = bq.group(1).strip()
            target["intro"] = f"{target['intro']} {intro}".strip() if target["intro"] else intro
            continue

        # 必须用原始行算缩进；strip 后会丢掉嵌套层级
        li = re.match(r"^([ \t]*)[-*+]\s+(.+)$", raw.rstrip("\n"))
        if li:
            indent = len(li.group(1).expandtabs(2))
            raw_body = li.group(2).strip()
            pri_m = _PRIORITY_PREFIX_RE.match(raw_body)
            priority = {"0": "1", "1": "2", "2": "3"}.get(
                (pri_m.group(1) if pri_m else ""), "2"
            )
            body = _strip_heading_marks(
                _strip_source_anchor(_strip_priority_prefix(raw_body))
            )
            title = body
            kids: list[dict[str, Any]] = []
            # 「列：A / B / C」→ 子节点；禁止字段进备注
            split = _split_label_enum(body)
            if split:
                head, rest = split
                kids = _expand_field_list_children(rest)
                title = head if kids else body
            node = {
                "title": title,
                "intro": "",
                "children": kids,
                "priority": priority,
            }
            while list_stack and list_stack[-1][0] >= indent:
                list_stack.pop()
            parent = list_stack[-1][1] if list_stack else _heading_parent(heading_stack)
            parent["children"].append(node)
            list_stack.append((indent, node))

    return root


def _topic(node: dict[str, Any]) -> dict[str, Any]:
    title = (
        _strip_heading_marks(
            _strip_source_anchor(
                _strip_priority_prefix(str(node.get("title") or "未命名"))
            )
        )
        or "未命名"
    )
    topic: dict[str, Any] = {
        "id": _nid(),
        "class": "topic",
        "title": title,
    }
    # 业务简介可进备注；含 / 、 的字段枚举不进备注
    intro = _strip_source_anchor(str(node.get("intro") or "").strip())
    if intro and not re.search(r"\s*/\s*|、", intro):
        topic["notes"] = {"plain": {"content": intro}}
    kids = node.get("children") or []
    if kids:
        topic["children"] = {"attached": [_topic(c) for c in kids]}
    return topic


def build_xmind_bytes(md: str, sheet_title: str = "画布 1") -> bytes:
    tree = parse_md_tree(md)
    root_topic = _topic(tree)
    root_topic["structureClass"] = "org.xmind.ui.logic.right"
    theme = _load_snowbrush_theme()
    ct = theme.setdefault("centralTopic", {}).setdefault("properties", {})
    ct["svg:fill"] = "#F6212D"
    ct["fo:color"] = "#FFFFFF"

    content = [
        {
            "id": _nid(),
            "class": "sheet",
            "title": sheet_title or "画布 1",
            "rootTopic": root_topic,
            "theme": theme,
        }
    ]
    metadata = {
        "modifier": "",
        "dataVersion": "2",
        "dataStructureVersion": "2",
        "creator": {"name": "Workbench", "version": "1.0"},
    }
    manifest = {
        "file-entries": {
            "content.json": {},
            "metadata.json": {},
        }
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("content.json", json.dumps(content, ensure_ascii=False, indent=2))
        zf.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False))
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return buf.getvalue()
