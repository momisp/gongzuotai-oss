"""索引「后端学习用」本地项目 + 工作台 backend-info 手册，供测试信息「后端知识」查阅。"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_FILE = DATA_DIR / "test_info_backend_index.json"
HANDBOOK_DIR = Path(__file__).resolve().parent / "docs" / "backend-info"

DEFAULT_BACKEND_ROOT = Path(r"C:\Users\yzyz\Desktop\后端学习用")

INDEX_EXTS = {".md", ".pdf", ".docx", ".doc", ".txt", ".xmind"}

TRACKS = [
    ("overview", "00-总览导读", None),
    ("python-api", "01-Python与接口基础", None),
    ("fastapi-project", "02-FastAPI实战项目", None),
    ("deploy-ops", "03-部署与运维上路", None),
    ("nginx-docker", "04-Nginx·进程·Docker", None),
    ("ops-advanced", "05-监控备份安全进阶", None),
    ("career", "06-岗位与规划", None),
    ("project-docs", "07-本地项目原文", None),
]


def _pick_track(name: str, rel: str, *, is_handbook: bool) -> tuple[str, str]:
    n = name.lower()
    r = rel.replace("\\", "/").lower()
    if is_handbook:
        if name.startswith("00") or "使用说明" in name:
            return "overview", "00-总览导读"
        if name.startswith("01") or "学习目录" in name:
            return "overview", "00-总览导读"
        if "fastapi" in n or "实战" in name:
            return "fastapi-project", "02-FastAPI实战项目"
        if "部署" in name or "运维上路" in name:
            return "deploy-ops", "03-部署与运维上路"
        if "nginx" in n or "docker" in n:
            return "nginx-docker", "04-Nginx·进程·Docker"
        if "监控" in name or "安全" in name or "进阶" in name:
            return "ops-advanced", "05-监控备份安全进阶"
        if "岗位" in name or "规划" in name:
            return "career", "06-岗位与规划"
        if "python" in n or "接口" in name:
            return "python-api", "01-Python与接口基础"
        return "overview", "00-总览导读"

    if "岗位" in name or "对比" in name:
        return "career", "06-岗位与规划"
    if "okr" in n:
        return "career", "06-岗位与规划"
    if "宝塔" in name or "部署" in name:
        return "deploy-ops", "03-部署与运维上路"
    if "学习清单" in name or "运维学习" in r:
        return "deploy-ops", "03-部署与运维上路"
    if name in {"main.py", "url_crypto.py"} or n.endswith(".py"):
        return "fastapi-project", "02-FastAPI实战项目"
    return "project-docs", "07-本地项目原文"


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


def _file_item(path: Path, *, category: str, track_id: str, track: str, source: str, rel: str) -> dict:
    st = path.stat()
    summary = ""
    if path.suffix.lower() in {".md", ".txt"}:
        summary = _summarize_md(path)
    if not summary:
        summary = track
    return {
        "id": f"backend:{str(path.resolve()).lower()}",
        "title": path.name,
        "category": category,
        "track": track,
        "trackId": track_id,
        "kind": "file",
        "ext": path.suffix.lower() or ".py",
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


def build_index(backend_root: Path | None = None) -> dict:
    root = Path(backend_root or DEFAULT_BACKEND_ROOT)
    items: list[dict] = []
    seen: set[str] = set()

    # 1) 工作台内置手册
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
                    category="后端知识",
                    track_id=tid,
                    track=tname,
                    source="backend-handbook",
                    rel=f"workbench/docs/backend-info/{p.name}",
                )
            )

    # 2) 本地「后端学习用」项目文档（含 py 入口说明用 md 旁路；py 仍可系统打开）
    if root.is_dir():
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix.lower() not in INDEX_EXTS and p.suffix.lower() != ".py":
                continue
            if "__pycache__" in p.parts or p.suffix == ".pyc":
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
                    category="后端知识",
                    track_id=tid,
                    track=tname,
                    source="backend-local",
                    rel=rel,
                )
            )

    def order_key(it: dict):
        m = re.search(r"(\d{1,2})", it.get("title") or "")
        num = int(m.group(1)) if m else 999
        return (it.get("track") or "", num, it.get("title") or "")

    items.sort(key=order_key)
    tracks = []
    for tid, tname, _ in TRACKS:
        cnt = sum(1 for it in items if it.get("trackId") == tid)
        if cnt:
            tracks.append({"id": tid, "name": tname, "count": cnt})

    payload = {
        "ok": True,
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "backendRoot": str(root.resolve()) if root.exists() else str(root),
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
                "backendRoot": result.get("backendRoot"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
