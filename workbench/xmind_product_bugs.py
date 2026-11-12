# -*- coding: utf-8 -*-
"""从测后 XMind 抽取粉红 Bug（含截图），供产品系统导入。

规则与禅道导入一致：
- 粉红 `#FF9595` = Bug
- 文案里有开发者名 → 建议指派该人；否则用本地默认前端账号
- 标题去掉人名；截图取节点及其空标题子节点内嵌图
- 人名映射读 data/dev_assignee_map.json（勿提交仓库）
"""
from __future__ import annotations

import base64
import io
import json
import re
import zipfile
from pathlib import Path
from typing import Any

PINK = "FF9595"
_ROOT = Path(__file__).resolve().parent.parent
_MAP_FILE = _ROOT / "data" / "dev_assignee_map.json"
_MAP_EXAMPLE = _ROOT / "data" / "dev_assignee_map.example.json"

# 仓库内不写真实人名；缺省占位，本地 json 覆盖
DEFAULT_ASSIGNEE_ACCOUNT = "frontend_dev"
DEFAULT_ASSIGNEE_NAME = "前端同学"
DEV_NAME_MAP: dict[str, str] = {}
ACCOUNT_TO_CN: dict[str, str] = {}


def load_dev_assignee_map(force: bool = False) -> None:
    """从本机 data/dev_assignee_map.json 加载人名映射。"""
    global DEFAULT_ASSIGNEE_ACCOUNT, DEFAULT_ASSIGNEE_NAME, DEV_NAME_MAP, ACCOUNT_TO_CN
    if DEV_NAME_MAP and not force:
        return
    path = _MAP_FILE if _MAP_FILE.is_file() else _MAP_EXAMPLE
    data: dict = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except (OSError, json.JSONDecodeError):
            data = {}
    DEFAULT_ASSIGNEE_ACCOUNT = str(data.get("defaultAccount") or "frontend_dev").strip() or "frontend_dev"
    DEFAULT_ASSIGNEE_NAME = str(data.get("defaultName") or "前端同学").strip() or "前端同学"
    name_map = data.get("nameToAccount") if isinstance(data.get("nameToAccount"), dict) else {}
    acc_map = data.get("accountToName") if isinstance(data.get("accountToName"), dict) else {}
    DEV_NAME_MAP = {str(k): str(v) for k, v in name_map.items() if str(k).strip() and str(v).strip()}
    ACCOUNT_TO_CN = {str(k): str(v) for k, v in acc_map.items() if str(k).strip() and str(v).strip()}
    if DEFAULT_ASSIGNEE_ACCOUNT and DEFAULT_ASSIGNEE_ACCOUNT not in ACCOUNT_TO_CN:
        ACCOUNT_TO_CN[DEFAULT_ASSIGNEE_ACCOUNT] = DEFAULT_ASSIGNEE_NAME


load_dev_assignee_map()

PASS_TITLES = {"√", "✓", "通过", "ok", "OK", "pass", "PASS"}

# 挂「图片」附件用：优先保清晰；仅超限才缩边/转 JPEG（已不再塞进 description）
_MAX_IMAGE_BYTES = 1_500_000
_SKIP_COMPRESS_BYTES = 800_000
_MAX_IMAGES_PER_BUG = 6
_MAX_EDGE = 1920


def title_of(n: dict) -> str:
    t = n.get("title") or ""
    if isinstance(t, dict):
        t = t.get("text") or ""
    return str(t).strip()


def bg_of(n: dict) -> str:
    style = n.get("style") or {}
    props = style.get("properties") if isinstance(style, dict) else {}
    return (
        ((props or {}).get("svg:fill") or (props or {}).get("fo:background-color") or "")
        .upper()
        .replace("#", "")
        .replace(" ", "")
    )


def notes_text(n: dict) -> str:
    notes = n.get("notes")
    if not notes:
        return ""
    if isinstance(notes, dict):
        plain = notes.get("plain")
        if isinstance(plain, dict):
            return str(plain.get("content") or "")
        if isinstance(plain, str):
            return plain
        return str(notes.get("content") or notes)[:800]
    return str(notes)[:800]


def walk_build(n: dict, path: list[str] | None = None) -> dict:
    title = title_of(n)
    cur = list(path or []) + ([title] if title else [])
    kids = (n.get("children") or {}).get("attached") or []
    return {
        "title": title,
        "path": cur,
        "bg": bg_of(n),
        "image": n.get("image"),
        "notes": notes_text(n),
        "children": [walk_build(ch, cur) for ch in kids],
    }


def is_pink(bg_or_node) -> bool:
    if isinstance(bg_or_node, dict):
        return PINK in (bg_or_node.get("bg") or "")
    return PINK in (bg_or_node or "").upper()


def image_src(img) -> str | None:
    if not img:
        return None
    if isinstance(img, str):
        return img
    if isinstance(img, dict):
        return img.get("src") or img.get("image")
    return None


def detect_assignee(*texts: str) -> tuple[str, str]:
    """返回 (禅道账号, 命中中文名)；未命中则默认前端。"""
    load_dev_assignee_map()
    blob = " ".join(t for t in texts if t)
    for name in sorted(DEV_NAME_MAP.keys(), key=len, reverse=True):
        if name in blob:
            return DEV_NAME_MAP[name], name
    return DEFAULT_ASSIGNEE_ACCOUNT, ""


def clean_bug_title(title: str) -> str:
    load_dev_assignee_map()
    t = title.strip()
    for name in sorted(DEV_NAME_MAP.keys(), key=len, reverse=True):
        t = t.replace(name, "")
    t = re.sub(r"[（(]\s*[）)]", "", t)
    t = re.sub(r"\s+", " ", t).strip(" ，,、-—|")
    return t or title.strip()


def load_content_root(zf: zipfile.ZipFile) -> dict:
    raw = zf.read("content.json")
    data = json.loads(raw)
    sheets = data if isinstance(data, list) else [data]
    if not sheets:
        raise RuntimeError("content.json 无画布")
    sheet = sheets[0] if isinstance(sheets[0], dict) else {}
    root = sheet.get("rootTopic") or sheet.get("root") or sheet
    if not isinstance(root, dict):
        raise RuntimeError("找不到 XMind 根节点")
    return root


def load_xmind_images_from_zip(zf: zipfile.ZipFile) -> dict[str, bytes]:
    out: dict[str, bytes] = {}
    for name in zf.namelist():
        if name.startswith("resources/") and not name.endswith("/"):
            blob = zf.read(name)
            out[name] = blob
            out[name.split("/")[-1]] = blob
    return out


def resolve_image_bytes(src: str | None, resources: dict[str, bytes]):
    if not src:
        return None
    clean = src.replace("xap:", "").lstrip("/")
    for key in (clean, clean.split("/")[-1], "resources/" + clean.split("/")[-1]):
        if key in resources:
            blob = resources[key]
            mime = "image/png"
            low = key.lower()
            if low.endswith((".jpg", ".jpeg")):
                mime = "image/jpeg"
            elif low.endswith(".gif"):
                mime = "image/gif"
            elif low.endswith(".webp"):
                mime = "image/webp"
            return blob, mime
    return None


def collect_image_srcs(node: dict) -> list[str]:
    """节点自身 + 空标题子节点（及其再下一层）内嵌图。"""
    srcs: list[str] = []
    seen: set[str] = set()

    def add(src: str | None):
        if not src or src in seen:
            return
        seen.add(src)
        srcs.append(src)

    add(image_src(node.get("image")))
    for c in node.get("children") or []:
        # 空标题子节点常挂截图
        if not (c.get("title") or "").strip():
            add(image_src(c.get("image")))
            for gc in c.get("children") or []:
                if not (gc.get("title") or "").strip():
                    add(image_src(gc.get("image")))
        else:
            # 有标题但本身也是粉红叶子的补充图：只取直接子级空图
            pass
    # 非空标题子节点若只有图+开发者名，也收图
    for c in node.get("children") or []:
        if image_src(c.get("image")) and (
            not (c.get("title") or "").strip() or (c.get("title") or "") in DEV_NAME_MAP
        ):
            add(image_src(c.get("image")))
    return srcs


def compress_image(blob: bytes, mime: str) -> tuple[bytes, str]:
    """附件上传前可选压缩：小图/清晰图尽量原样；超边长或超体积再处理。"""
    mime = (mime or "").lower() or "application/octet-stream"
    if mime in ("image/jpeg", "image/png", "image/webp") and len(blob) <= _SKIP_COMPRESS_BYTES:
        return blob, mime
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(blob))
        w, h = im.size
        need_resize = max(w, h) > _MAX_EDGE
        need_shrink = len(blob) > _MAX_IMAGE_BYTES
        if not need_resize and not need_shrink and mime in ("image/jpeg", "image/png", "image/webp"):
            return blob, mime

        # PNG 截图文字更清晰：仅缩边、能压进上限则仍出 PNG
        if mime == "image/png" and (im.mode in ("RGBA", "RGB", "P", "LA") or need_resize):
            if im.mode == "P":
                im = im.convert("RGBA")
            if need_resize:
                scale = _MAX_EDGE / max(w, h, 1)
                im = im.resize(
                    (max(1, int(w * scale)), max(1, int(h * scale))),
                    Image.Resampling.LANCZOS,
                )
            out = io.BytesIO()
            im.save(out, format="PNG", optimize=True)
            data = out.getvalue()
            if len(data) <= _MAX_IMAGE_BYTES:
                return data, "image/png"

        if im.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            if im.mode == "P":
                im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[-1] if im.mode in ("RGBA", "LA") else None)
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, _MAX_EDGE / max(w, h, 1))
        if scale < 1.0:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        quality = 88
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=quality, optimize=True)
        data = out.getvalue()
        while len(data) > _MAX_IMAGE_BYTES and quality > 70:
            quality -= 5
            out = io.BytesIO()
            im.save(out, format="JPEG", quality=quality, optimize=True)
            data = out.getvalue()
        return data, "image/jpeg"
    except Exception:
        if len(blob) > _MAX_IMAGE_BYTES:
            return blob[:0], mime  # 过大且无法压缩则跳过
        return blob, mime


def collect_bugs(root: dict) -> list[dict]:
    bugs: list[dict] = []

    def visit(node: dict):
        pink_kids = [c for c in node["children"] if is_pink(c)]
        if is_pink(node) and not pink_kids and node["title"] and node["title"] not in PASS_TITLES:
            desc_titles: list[str] = []

            def collect_desc(n: dict, depth: int = 0):
                if n.get("title"):
                    desc_titles.append(n["title"])
                if depth < 3:
                    for c in n.get("children") or []:
                        collect_desc(c, depth + 1)

            for c in node["children"]:
                collect_desc(c)
            who, hit = detect_assignee(node["title"], node.get("notes") or "", *desc_titles)
            bug_text = clean_bug_title(node["title"])
            case_parts = [p for p in node["path"][:-1] if p and "测试点" not in p]
            mods = []
            for t in node["path"]:
                if any(
                    k in t
                    for k in (
                        "首页",
                        "祈福",
                        "商城",
                        "我的",
                        "分身",
                        "直播",
                        "后台",
                        "管理",
                        "订单",
                    )
                ):
                    mods.append(t)
            notes = [
                t
                for t in desc_titles
                if t not in DEV_NAME_MAP and t not in PASS_TITLES and t != bug_text
            ]
            bugs.append(
                {
                    "bug": bug_text,
                    "case": " > ".join(case_parts[-4:]) if case_parts else bug_text,
                    "module": " / ".join(dict.fromkeys(mods)) or "功能测试",
                    "path": node["path"][:],
                    "notes": notes[:8],
                    "assignee": who,
                    "assignee_hit": hit,
                    "assignee_name": hit or ACCOUNT_TO_CN.get(who, DEFAULT_ASSIGNEE_NAME),
                    "image_srcs": collect_image_srcs(node),
                    "notes_plain": node.get("notes") or "",
                }
            )
        for c in node["children"]:
            visit(c)

    visit(root)
    # 同标题去重：优先保留有图 / 有命中指派的
    by_title: dict[str, dict] = {}
    for b in bugs:
        key = b["bug"]
        old = by_title.get(key)
        if not old:
            by_title[key] = b
            continue
        if b.get("assignee_hit") and not old.get("assignee_hit"):
            by_title[key] = b
            old = b
        if b.get("image_srcs") and (not old.get("image_srcs") or len(b["image_srcs"]) > len(old.get("image_srcs") or [])):
            old["image_srcs"] = b["image_srcs"]
    return list(by_title.values())


def extract_bugs_from_xmind_bytes(data: bytes) -> tuple[list[dict], dict[str, bytes]]:
    """解析 xmind 字节 → (bugs, resources)。"""
    bio = io.BytesIO(data)
    with zipfile.ZipFile(bio) as zf:
        root_raw = load_content_root(zf)
        tree = walk_build(root_raw)
        resources = load_xmind_images_from_zip(zf)
        bugs = collect_bugs(tree)
    return bugs, resources


def extract_bugs_from_xmind_path(path: str | Path) -> tuple[list[dict], dict[str, bytes]]:
    p = Path(path)
    return extract_bugs_from_xmind_bytes(p.read_bytes())


def resolve_assignee_uuid(
    bug: dict,
    assignee_map: dict[str, str] | None,
) -> str | None:
    """assignee_map 可用中文名或禅道账号作 key → 产品系统用户 uuid。"""
    m = {str(k).strip(): str(v).strip() for k, v in (assignee_map or {}).items() if k and v}
    if not m:
        return None
    for key in (
        bug.get("assignee_hit"),
        bug.get("assignee_name"),
        bug.get("assignee"),
        ACCOUNT_TO_CN.get(bug.get("assignee") or ""),
    ):
        if key and key in m:
            return m[key]
    return None


def _expected_from_bug(bug: dict) -> str:
    """预期 = 关联测点文案（路径最后一段 / case 末级）。"""
    case = str(bug.get("case") or "").strip()
    if case:
        leaf = case.split(">")[-1].strip() if ">" in case else case
        if leaf:
            return leaf
    notes = bug.get("notes") or []
    for n in notes:
        t = str(n or "").strip()
        if t and t not in DEV_NAME_MAP and t != str(bug.get("bug") or "").strip():
            return t
    return str(bug.get("bug") or "").strip()


def collect_pending_images(
    bug: dict,
    resources: dict[str, bytes],
) -> list[dict[str, Any]]:
    """从 XMind 节点解析截图字节，供登录后上传到 bug.images（勿写进 description）。"""
    out: list[dict[str, Any]] = []
    for i, src in enumerate((bug.get("image_srcs") or [])[:_MAX_IMAGES_PER_BUG]):
        resolved = resolve_image_bytes(src, resources)
        if not resolved:
            continue
        blob, mime = resolved
        blob, mime = compress_image(blob, mime)
        if not blob:
            continue
        ext = "jpg" if mime == "image/jpeg" else ("png" if mime == "image/png" else "bin")
        out.append(
            {
                "name": f"screenshot-{i + 1}.{ext}",
                "blob": blob,
                "mime": mime,
            }
        )
    return out


def build_bug_payload(
    bug: dict,
    resources: dict[str, bytes],
    *,
    reporter_name: str,
    version_id: str = "",
    version_name: str = "",
    source: str = "工作台XMind",
    assignee_map: dict[str, str] | None = None,
    severity: str = "major",
    test_case_id: str = "",
) -> dict[str, Any]:
    """组装产品系统 bugs[] 单条。

    问题描述只保留【问题】【预期】（预期取测点），便于一眼看清；
    模块 / 路径 / 指派 / 来源等放进 statusRemark（操作备注，≤200 字）。
    截图不写进 description：开放接口无附件字段，须登录后挂到「图片」；
    有图时 statusRemark 注明「截图见图片附件」，并在返回值 `_pending_images` 留下传图材料。
    """
    title = re.sub(r"\s+", " ", (bug.get("bug") or "").strip())
    if len(title) > 280:
        title = title[:277] + "..."

    problem = str(bug.get("bug") or "").strip() or title
    expected = _expected_from_bug(bug)

    desc_parts = [
        f"【问题】{problem}",
        "",
        f"【预期】{expected}",
    ]

    pending = collect_pending_images(bug, resources)

    who_label = bug.get("assignee_hit") or bug.get("assignee_name") or DEFAULT_ASSIGNEE_NAME
    remark_bits = [
        f"模块：{bug.get('module') or ''}",
        f"关联路径：{bug.get('case') or ''}",
        f"建议指派：{who_label}",
    ]
    if bug.get("assignee_hit"):
        remark_bits.append(f"XMind标注：{bug['assignee_hit']}")
    if version_name:
        remark_bits.append(f"版本：{version_name}")
    remark_bits.append(f"来源：{source}")
    extra_notes = [str(n) for n in (bug.get("notes") or [])[:3] if n and str(n) not in DEV_NAME_MAP]
    if extra_notes:
        remark_bits.append("补充：" + "；".join(extra_notes))
    if bug.get("notes_plain"):
        remark_bits.append(f"节点备注：{str(bug['notes_plain'])[:80]}")
    if pending:
        remark_bits.append(f"截图{len(pending)}张见图片附件")
    status_remark = " | ".join(remark_bits)
    if len(status_remark) > 200:
        status_remark = status_remark[:197] + "..."

    payload: dict[str, Any] = {
        "title": title[:300],
        "description": "\n".join(desc_parts),
        "expectedResult": expected[:4000],
        "actualResult": problem[:4000],
        "reporterName": (reporter_name or "测试")[:50],
        "severity": severity if severity in ("critical", "major", "minor", "trivial") else "major",
        "source": (source or "工作台XMind")[:50],
        "status": "unconfirmed",
        "statusRemark": status_remark,
    }
    if version_id:
        payload["versionId"] = version_id
    uid = resolve_assignee_uuid(bug, assignee_map)
    if uid:
        payload["assignedTo"] = uid
    tc = str(test_case_id or bug.get("testCaseId") or bug.get("test_case_id") or "").strip()
    if tc:
        payload["testCaseId"] = tc
    if pending:
        # 私有字段：调用方上传后须剥掉再走开放写接口
        payload["_pending_images"] = pending
    return payload


# —— 用例：禅道 extract_cases → 产品系统 testCases ——

_PRI_MAP = {"1": "high", "2": "medium", "3": "low", "P0": "high", "P1": "medium", "P2": "low"}
_TYPE_MAP = {
    "功能测试": "functional",
    "性能测试": "performance",
    "安全相关": "security",
    "界面测试": "ui",
    "其他": "other",
}


def cases_to_product_payloads(
    cases: list[dict],
    *,
    suite_id: str,
) -> list[dict[str, Any]]:
    suite_id = str(suite_id or "").strip()
    if not suite_id:
        raise ValueError("suiteId 必填")
    out: list[dict[str, Any]] = []
    for c in cases:
        steps = c.get("steps") or []
        expects = c.get("expects") or []
        if isinstance(steps, list):
            steps_s = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps) if s)
        else:
            steps_s = str(steps)
        if isinstance(expects, list):
            exp_s = "\n".join(str(e) for e in expects if e)
        else:
            exp_s = str(expects)
        pri = str(c.get("priority") or "2")
        priority = _PRI_MAP.get(pri, _PRI_MAP.get(pri.upper(), "medium"))
        ctype = _TYPE_MAP.get(str(c.get("case_type") or ""), "functional")
        mod = c.get("module_path") or ()
        if isinstance(mod, (list, tuple)):
            module_name = "/".join(str(p) for p in mod if p)[:100]
        else:
            module_name = str(mod)[:100]
        title = str(c.get("title") or "").strip()[:200]
        if not title:
            continue
        out.append(
            {
                "suiteId": suite_id,
                "title": title,
                "preconditions": str(c.get("precondition") or "")[:2000],
                "steps": steps_s[:8000],
                "expected": exp_s[:4000],
                "priority": priority,
                "type": ctype,
                "status": "pending",
                "moduleName": module_name,
            }
        )
    return out
