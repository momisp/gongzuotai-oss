"""索引前端知识手册（及可选本地 frontend_root），供测试信息「前端知识」查阅。"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_FILE = DATA_DIR / "test_info_frontend_index.json"
HANDBOOK_DIR = Path(__file__).resolve().parent / "docs" / "frontend-info"

DEFAULT_FRONTEND_ROOT = None  # 仅手册；本地目录由配置 frontend_root 指定

INDEX_EXTS = {".md", ".pdf", ".docx", ".doc", ".txt", ".xmind"}

TRACKS = [
    ("overview", "00-总览导读"),
    ("html-css", "01-HTML与CSS基础"),
    ("javascript", "02-JavaScript核心"),
    ("browser-http", "03-浏览器与网络"),
    ("framework", "04-框架与工程化"),
    ("practice", "05-实战与联调"),
    ("advanced", "06-进阶专项"),
    ("project-docs", "07-本地补充资料"),
]


def _norm_root(frontend_root: Path | None) -> Path | None:
    if frontend_root is None:
        return None
    raw = str(frontend_root).strip()
    if not raw or raw in {".", "./"}:
        return None
    p = Path(raw)
    try:
        resolved = p.resolve()
    except OSError:
        return None
    try:
        if resolved == ROOT.resolve():
            return None
    except OSError:
        pass
    if not resolved.is_dir():
        return None
    return resolved


def _pick_track(name: str, rel: str, *, is_handbook: bool) -> tuple[str, str]:
    n = name.lower()
    r = rel.replace("\\", "/").lower()
    if is_handbook:
        if name.startswith("00") or "使用说明" in name or "学习目录" in name:
            return "overview", "00-总览导读"
        if name.startswith("02") or (("html" in n or "css" in n) and "学习" not in name):
            return "html-css", "01-HTML与CSS基础"
        if name.startswith("03") or "javascript" in n or "js要点" in name:
            return "javascript", "02-JavaScript核心"
        if name.startswith("04") or "浏览器" in name or "联调" in name:
            return "browser-http", "03-浏览器与网络"
        if name.startswith("05") or "框架" in name or "工程" in name:
            return "framework", "04-框架与工程化"
        if "实战" in name:
            return "practice", "05-实战与联调"
        if "进阶" in name or "性能" in name:
            return "advanced", "06-进阶专项"
        if name.startswith("01"):
            return "overview", "00-总览导读"
        return "overview", "00-总览导读"
    if any(k in n or k in r for k in ("html", "css", "样式")):
        return "html-css", "01-HTML与CSS基础"
    if "javascript" in n or n.endswith(".js"):
        return "javascript", "02-JavaScript核心"
    if any(k in n for k in ("react", "vue", "vite", "webpack", "typescript")):
        return "framework", "04-框架与工程化"
    return "project-docs", "07-本地补充资料"


def _summarize_md(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    title = ""
    bullets = []
    for ln in lines[:40]:
        if ln.startswith("# ") and not title:
            title = ln[2:].strip()
            continue
        if ln.startswith(">") and len(ln) > 4:
            return (ln.lstrip("> ").strip())[:56]
        if ln.startswith("- ") and len(bullets) < 2:
            bullets.append(re.sub(r"^\[.\]\s*", "", ln[2:]).strip())
    if bullets:
        return "；".join(bullets)[:56]
    return (title or path.stem)[:56]


def _file_item(path: Path, *, track_id: str, track: str, source: str, rel: str) -> dict:
    st = path.stat()
    summary = ""
    if path.suffix.lower() in {".md", ".txt"}:
        summary = _summarize_md(path)
    if not summary:
        summary = track
    return {
        "id": f"frontend:{str(path.resolve()).lower()}",
        "title": path.name,
        "category": "前端知识",
        "track": track,
        "trackId": track_id,
        "kind": "file",
        "ext": path.suffix.lower() or "",
        "path": str(path.resolve()),
        "rel": rel,
        "size": st.st_size,
        "size_mb": round(st.st_size / (1024 * 1024), 2),
        "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
        "source": source,
        "note": track,
        "summary": summary,
        "can_preview": path.suffix.lower() in {".md", ".txt", ".markdown", ".pdf"},
    }


def build_index(frontend_root: Path | None = None) -> dict:
    root = _norm_root(frontend_root if frontend_root is not None else DEFAULT_FRONTEND_ROOT)

    items: list[dict] = []
    seen: set[str] = set()

    if HANDBOOK_DIR.is_dir():
        for p in sorted(HANDBOOK_DIR.glob("*.md")):
            key = str(p.resolve()).lower()
            if key in seen:
                continue
            seen.add(key)
            tid, tname = _pick_track(p.name, p.name, is_handbook=True)
            items.append(
                _file_item(
                    p,
                    track_id=tid,
                    track=tname,
                    source="frontend-handbook",
                    rel=f"workbench/docs/frontend-info/{p.name}",
                )
            )

    if root is not None:
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix.lower() not in INDEX_EXTS:
                continue
            if any(x in p.parts for x in ("node_modules", ".git", "dist", "build", "__pycache__", ".codegraph")):
                continue
            try:
                key = str(p.resolve()).lower()
            except OSError:
                continue
            if key in seen:
                continue
            seen.add(key)
            try:
                rel = str(p.relative_to(root)).replace("\\", "/")
            except ValueError:
                rel = p.name
            tid, tname = _pick_track(p.name, rel, is_handbook=False)
            items.append(
                _file_item(
                    p,
                    track_id=tid,
                    track=tname,
                    source="frontend-local",
                    rel=rel,
                )
            )

    def order_key(it: dict):
        m = re.search(r"(\d{1,2})", it.get("title") or "")
        num = int(m.group(1)) if m else 999
        return (it.get("track") or "", num, it.get("title") or "")

    items.sort(key=order_key)
    tracks = []
    for tid, tname in TRACKS:
        cnt = sum(1 for it in items if it.get("trackId") == tid)
        if cnt:
            tracks.append({"id": tid, "name": tname, "count": cnt})

    payload = {
        "ok": True,
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "frontendRoot": str(root) if root else "",
        "handbookDir": str(HANDBOOK_DIR.resolve()),
        "count": len(items),
        "tracks": tracks,
        "items": items,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = build_index()
    print(
        json.dumps(
            {
                "ok": result.get("ok"),
                "count": result.get("count"),
                "tracks": result.get("tracks"),
                "frontendRoot": result.get("frontendRoot"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
