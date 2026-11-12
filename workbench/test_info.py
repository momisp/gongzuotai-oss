"""测试信息库：知识手册 + 本机扫描资料 + 外部链接。"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
WORKBENCH_DIR = Path(__file__).resolve().parent
DOCS_DIR = WORKBENCH_DIR / "docs"
TEST_INFO_DIR = DOCS_DIR / "test-info"
BACKEND_INFO_DIR = DOCS_DIR / "backend-info"
FRONTEND_INFO_DIR = DOCS_DIR / "frontend-info"
MAKER_LAB_DIR = DOCS_DIR / "maker-lab"
CONFIG_FILE = DATA_DIR / "test_info_config.json"
SCAN_FILE = DATA_DIR / "test_info_scan.json"
COURSE_INDEX_FILE = DATA_DIR / "test_info_course_index.json"
BACKEND_INDEX_FILE = DATA_DIR / "test_info_backend_index.json"
FRONTEND_INDEX_FILE = DATA_DIR / "test_info_frontend_index.json"
DEFAULT_COURSE_ROOT = Path(r"F:\BaiduNetdiskDownload\14-2022年软测项目资料")
DEFAULT_BACKEND_ROOT = Path(r"C:\Users\yzyz\Desktop\后端学习用")
DEFAULT_FRONTEND_ROOT = ""

VIEWABLE_TEXT = {".md", ".txt", ".markdown", ".html"}
VIEWABLE_BINARY = {".pdf"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
LIST_EXTS = {".md", ".txt", ".markdown", ".pdf", ".epub", ".docx", ".doc", ".pptx", ".xmind", ".py", ".html"} | IMAGE_EXTS

DEFAULT_CONFIG = {
    "scan_roots": [str(DOCS_DIR)],
    "scan_depth": 4,
    "name_keywords": ["测试", "质量", "QA", "用例", "冒烟", "性能", "安全"],
    "exts": [".md", ".pdf", ".epub", ".txt", ".docx"],
    "exclude_path_parts": ["node_modules", ".git", "code-scan-repos", "auto_qa_runs"],
    "external_links": [],
    "course_root": str(DEFAULT_COURSE_ROOT),
    "backend_root": str(DEFAULT_BACKEND_ROOT),
    "frontend_root": DEFAULT_FRONTEND_ROOT,
}


def _load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if data is not None else default
    except (OSError, json.JSONDecodeError):
        return default


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    raw = _load_json(CONFIG_FILE, {})
    if isinstance(raw, dict):
        cfg.update(raw)
    cfg["scan_roots"] = [str(x) for x in (cfg.get("scan_roots") or []) if str(x).strip()]
    cfg["scan_depth"] = int(cfg.get("scan_depth") or 4)
    cfg["name_keywords"] = [str(x) for x in (cfg.get("name_keywords") or []) if str(x).strip()]
    cfg["exts"] = [
        (str(x).lower() if str(x).startswith(".") else "." + str(x).lower())
        for x in (cfg.get("exts") or LIST_EXTS)
    ]
    cfg["exclude_path_parts"] = [str(x) for x in (cfg.get("exclude_path_parts") or [])]
    links = cfg.get("external_links") or []
    cfg["external_links"] = [x for x in links if isinstance(x, dict) and x.get("url")]
    cfg["course_root"] = str(cfg.get("course_root") or DEFAULT_COURSE_ROOT).strip()
    cfg["backend_root"] = str(cfg.get("backend_root") or DEFAULT_BACKEND_ROOT).strip()
    cfg["frontend_root"] = str(cfg.get("frontend_root") or DEFAULT_FRONTEND_ROOT or "").strip()
    return cfg


def course_root() -> Path:
    return Path(load_config().get("course_root") or DEFAULT_COURSE_ROOT)


def backend_root() -> Path:
    return Path(load_config().get("backend_root") or DEFAULT_BACKEND_ROOT)


def frontend_root() -> Path | None:
    raw = (load_config().get("frontend_root") or "").strip()
    return Path(raw) if raw else None


def list_course_materials() -> tuple[list[dict], dict]:
    """从课程索引读取系统性课件条目。"""
    data = _load_json(COURSE_INDEX_FILE, {})
    if not isinstance(data, dict):
        data = {}
    items = data.get("items") if isinstance(data.get("items"), list) else []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        path = Path(str(it.get("path") or ""))
        if not path.is_file():
            continue
        row = dict(it)
        row["category"] = "课程资料"
        row.setdefault("kind", "file")
        row.setdefault("source", "course-2022")
        row.setdefault("note", row.get("track") or "")
        out.append(row)
    meta = {
        "updatedAt": data.get("updatedAt") or "",
        "count": len(out),
        "courseRoot": data.get("courseRoot") or str(course_root()),
        "tracks": data.get("tracks") or [],
        "ok": bool(data.get("ok", True)) if out or data.get("ok") else False,
        "error": data.get("error") or "",
    }
    return out, meta


def rebuild_course_index() -> dict:
    """按配置 course_root 重建课件索引。"""
    try:
        from build_course_index import build_index
    except ImportError:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "build_course_index", WORKBENCH_DIR / "build_course_index.py"
        )
        if not spec or not spec.loader:
            return {"ok": False, "error": "找不到 build_course_index.py"}
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        build_index = mod.build_index
    result = build_index(course_root())
    catalog_data = catalog()
    return {**result, "catalog": catalog_data}


def list_backend_materials() -> tuple[list[dict], dict]:
    """后端知识：手册 + 本地后端学习用项目索引。"""
    data = _load_json(BACKEND_INDEX_FILE, {})
    if not isinstance(data, dict):
        data = {}
    items = data.get("items") if isinstance(data.get("items"), list) else []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        path = Path(str(it.get("path") or ""))
        if not path.is_file():
            continue
        row = dict(it)
        row["category"] = "后端知识"
        row.setdefault("kind", "file")
        row.setdefault("source", "backend")
        row.setdefault("note", row.get("track") or "")
        out.append(row)
    meta = {
        "updatedAt": data.get("updatedAt") or "",
        "count": len(out),
        "backendRoot": data.get("backendRoot") or str(backend_root()),
        "tracks": data.get("tracks") or [],
        "ok": bool(data.get("ok", True)) if out or data.get("ok") else False,
        "error": data.get("error") or "",
    }
    return out, meta


def rebuild_backend_index() -> dict:
    """按配置 backend_root 重建后端知识索引。"""
    try:
        from build_backend_index import build_index
    except ImportError:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "build_backend_index", WORKBENCH_DIR / "build_backend_index.py"
        )
        if not spec or not spec.loader:
            return {"ok": False, "error": "找不到 build_backend_index.py"}
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        build_index = mod.build_index
    result = build_index(backend_root())
    return {**result, "catalog": catalog()}


def list_frontend_materials() -> tuple[list[dict], dict]:
    """前端知识：手册 + 可选本地目录索引。"""
    data = _load_json(FRONTEND_INDEX_FILE, {})
    if not isinstance(data, dict):
        data = {}
    items = data.get("items") if isinstance(data.get("items"), list) else []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        path = Path(str(it.get("path") or ""))
        if not path.is_file():
            continue
        row = dict(it)
        row["category"] = "前端知识"
        row.setdefault("kind", "file")
        row.setdefault("source", "frontend")
        row.setdefault("note", row.get("track") or "")
        out.append(row)
    fr = frontend_root()
    meta = {
        "updatedAt": data.get("updatedAt") or "",
        "count": len(out),
        "frontendRoot": data.get("frontendRoot") or (str(fr) if fr else ""),
        "tracks": data.get("tracks") or [],
        "ok": bool(data.get("ok", True)) if out or data.get("ok") else False,
        "error": data.get("error") or "",
    }
    return out, meta


def rebuild_frontend_index() -> dict:
    """按配置 frontend_root 重建前端知识索引（可为空，仅手册）。"""
    try:
        from build_frontend_index import build_index
    except ImportError:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "build_frontend_index", WORKBENCH_DIR / "build_frontend_index.py"
        )
        if not spec or not spec.loader:
            return {"ok": False, "error": "找不到 build_frontend_index.py"}
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        build_index = mod.build_index
    result = build_index(frontend_root())
    return {**result, "catalog": catalog()}


def _excluded(path: Path, parts: list[str]) -> bool:
    s = str(path).replace("/", "\\").lower()
    for p in parts:
        if p and p.lower() in s:
            return True
    return False


def _match_keyword(name: str, keywords: list[str]) -> bool:
    n = name.lower()
    for kw in keywords:
        if kw.lower() in n:
            return True
    return False


def _file_item(path: Path, category: str, *, source: str, note: str = "") -> dict:
    st = path.stat()
    rel = None
    try:
        rel = str(path.resolve().relative_to(ROOT.resolve())).replace("\\", "/")
    except ValueError:
        rel = None
    return {
        "id": f"file:{path.resolve()}",
        "title": path.name,
        "category": category,
        "kind": "file",
        "ext": path.suffix.lower(),
        "path": str(path.resolve()),
        "rel": rel,
        "size": st.st_size,
        "size_mb": round(st.st_size / (1024 * 1024), 2),
        "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
        "source": source,
        "note": note,
        "can_preview": path.suffix.lower() in VIEWABLE_TEXT | VIEWABLE_BINARY,
    }


def list_handbook() -> list[dict]:
    if not TEST_INFO_DIR.is_dir():
        return []
    items = []
    for p in sorted(TEST_INFO_DIR.glob("*.md")):
        items.append(
            _file_item(p, "知识手册", source="handbook", note="内置知识")
        )
    return items


def list_workbench_docs() -> list[dict]:
    if not DOCS_DIR.is_dir():
        return []
    items = []
    for p in sorted(DOCS_DIR.rglob("*.md")):
        if TEST_INFO_DIR in p.parents or p.parent == TEST_INFO_DIR:
            continue
        if BACKEND_INFO_DIR in p.parents or p.parent == BACKEND_INFO_DIR:
            continue
        if FRONTEND_INFO_DIR in p.parents or p.parent == FRONTEND_INFO_DIR:
            continue
        if MAKER_LAB_DIR in p.parents or p.parent == MAKER_LAB_DIR:
            continue
        if p.name.lower() == "readme.md" and "func-sessions" in str(p):
            # keep README but tag
            pass
        items.append(
            _file_item(p, "工作台文档", source="workbench-docs", note="workbench/docs")
        )
    return items


def list_external() -> list[dict]:
    cfg = load_config()
    out = []
    for i, link in enumerate(cfg.get("external_links") or []):
        out.append(
            {
                "id": link.get("id") or f"ext-{i}",
                "title": link.get("title") or link.get("url"),
                "category": link.get("category") or "外部链接",
                "kind": "link",
                "url": link.get("url"),
                "note": link.get("note") or "",
                "ext": "url",
                "can_preview": False,
                "source": "external",
            }
        )
    return out


def list_scanned() -> list[dict]:
    data = _load_json(SCAN_FILE, {})
    items = data.get("items") if isinstance(data, dict) else []
    if not isinstance(items, list):
        return []
    out = []
    docs_root = DOCS_DIR.resolve()
    for it in items:
        if not isinstance(it, dict):
            continue
        path = Path(str(it.get("path") or ""))
        if not path.is_file():
            continue
        try:
            resolved = path.resolve()
            # workbench/docs 已在「知识手册 / 工作台文档」展示，扫描结果里去重
            if resolved.is_relative_to(docs_root):
                continue
        except Exception:
            if str(DOCS_DIR) in str(path):
                continue
        try:
            out.append(
                _file_item(
                    path,
                    "本机资料",
                    source="scan",
                    note=str(it.get("note") or it.get("root") or ""),
                )
            )
        except OSError:
            continue
    return out


def catalog() -> dict:
    handbook = list_handbook()
    wb = list_workbench_docs()
    course, course_meta = list_course_materials()
    backend, backend_meta = list_backend_materials()
    frontend, frontend_meta = list_frontend_materials()
    scanned = list_scanned()
    external = list_external()
    # 本机资料去掉已在课程/后端/前端索引中的路径，避免重复
    skip_paths = set()
    for x in course + backend + frontend:
        try:
            if x.get("path"):
                skip_paths.add(str(Path(x["path"]).resolve()).lower())
        except Exception:
            continue
    for folder in (TEST_INFO_DIR, BACKEND_INFO_DIR, FRONTEND_INFO_DIR, DOCS_DIR):
        try:
            skip_paths.add(str(folder.resolve()).lower())
        except Exception:
            pass
    filtered_scanned = []
    for x in scanned:
        try:
            p = str(Path(x.get("path") or "").resolve()).lower()
        except Exception:
            filtered_scanned.append(x)
            continue
        if p in skip_paths:
            continue
        under_skip = False
        for root in (TEST_INFO_DIR, BACKEND_INFO_DIR, FRONTEND_INFO_DIR):
            try:
                if Path(x.get("path") or "").resolve().is_relative_to(root.resolve()):
                    under_skip = True
                    break
            except Exception:
                continue
        if not under_skip:
            filtered_scanned.append(x)
    scanned = filtered_scanned
    items = handbook + backend + frontend + course + wb + scanned + external
    cats = []
    for name in ("知识手册", "后端知识", "前端知识", "课程资料", "工作台文档", "本机资料", "外部链接"):
        n = sum(1 for x in items if x.get("category") == name)
        cats.append({"id": name, "name": name, "count": n})
    scan_meta = _load_json(SCAN_FILE, {})
    return {
        "ok": True,
        "categories": cats,
        "items": items,
        "course": course_meta,
        "backend": backend_meta,
        "frontend": frontend_meta,
        "scan": {
            "updatedAt": scan_meta.get("updatedAt") or "",
            "count": len(scanned),
            "roots": (scan_meta.get("roots") or []),
        },
    }


def scan_local(max_files: int = 400) -> dict:
    cfg = load_config()
    roots = cfg["scan_roots"]
    depth = int(cfg["scan_depth"])
    keywords = cfg["name_keywords"]
    exts = set(cfg["exts"])
    exclude = cfg["exclude_path_parts"]
    found: list[dict] = []
    seen: set[str] = set()
    errors: list[str] = []

    def walk(root: Path, cur_depth: int):
        nonlocal found
        if len(found) >= max_files:
            return
        try:
            entries = list(root.iterdir())
        except OSError as e:
            errors.append(f"{root}: {e}")
            return
        for entry in entries:
            if len(found) >= max_files:
                return
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir():
                    if _excluded(entry, exclude):
                        continue
                    if cur_depth < depth:
                        walk(entry, cur_depth + 1)
                    continue
                if not entry.is_file():
                    continue
                if entry.suffix.lower() not in exts:
                    continue
                if _excluded(entry, exclude):
                    continue
                # docs under workbench always keep; elsewhere require keyword in name or parent
                under_docs = False
                try:
                    under_docs = entry.resolve().is_relative_to(DOCS_DIR.resolve())
                except Exception:
                    under_docs = str(DOCS_DIR) in str(entry)
                if not under_docs and not (
                    _match_keyword(entry.name, keywords)
                    or _match_keyword(entry.parent.name, keywords)
                ):
                    continue
                key = str(entry.resolve()).lower()
                if key in seen:
                    continue
                seen.add(key)
                # skip handbook duplicates already listed by list_handbook
                found.append(
                    {
                        "path": str(entry.resolve()),
                        "name": entry.name,
                        "ext": entry.suffix.lower(),
                        "root": str(root),
                        "note": entry.parent.name,
                    }
                )
            except OSError:
                continue

    t0 = time.time()
    for r in roots:
        p = Path(r)
        if not p.exists():
            errors.append(f"目录不存在: {r}")
            continue
        walk(p if p.is_dir() else p.parent, 0)

    payload = {
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "elapsedSec": round(time.time() - t0, 2),
        "roots": roots,
        "count": len(found),
        "items": found,
        "errors": errors[:20],
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SCAN_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, **payload, "catalog": catalog()}


def _allowed_roots() -> list[Path]:
    cfg = load_config()
    roots = [DOCS_DIR.resolve(), TEST_INFO_DIR.resolve(), BACKEND_INFO_DIR.resolve(), FRONTEND_INFO_DIR.resolve()]
    try:
        roots.append(course_root().resolve())
    except OSError:
        pass
    try:
        roots.append(backend_root().resolve())
    except OSError:
        pass
    fr = frontend_root()
    if fr:
        try:
            roots.append(fr.resolve())
        except OSError:
            pass
    # 课程索引里的文件父目录（即使 course_root 配置变更也允许打开）
    for it in (_load_json(COURSE_INDEX_FILE, {}) or {}).get("items") or []:
        try:
            roots.append(Path(it["path"]).resolve().parent)
        except Exception:
            continue
    for it in (_load_json(BACKEND_INDEX_FILE, {}) or {}).get("items") or []:
        try:
            roots.append(Path(it["path"]).resolve().parent)
        except Exception:
            continue
    for it in (_load_json(FRONTEND_INDEX_FILE, {}) or {}).get("items") or []:
        try:
            roots.append(Path(it["path"]).resolve().parent)
        except Exception:
            continue
    for r in cfg.get("scan_roots") or []:
        try:
            roots.append(Path(r).resolve())
        except OSError:
            continue
    # also allow previously scanned files' parents via scan file paths themselves
    for it in (_load_json(SCAN_FILE, {}) or {}).get("items") or []:
        try:
            roots.append(Path(it["path"]).resolve().parent)
        except Exception:
            continue
    return roots


def assert_readable(raw: str) -> Path:
    target = Path(raw).expanduser().resolve()
    if not target.is_file():
        raise FileNotFoundError(f"文件不存在: {target}")
    ext = target.suffix.lower()
    if ext not in LIST_EXTS:
        raise PermissionError(f"不支持的类型: {ext}")
    allowed = False
    for root in _allowed_roots():
        try:
            if target.is_relative_to(root):
                allowed = True
                break
        except AttributeError:
            if str(target).lower().startswith(str(root).lower()):
                allowed = True
                break
        except (OSError, ValueError):
            continue
    # also allow if exact path is in last scan or course index
    if not allowed:
        for it in (_load_json(SCAN_FILE, {}) or {}).get("items") or []:
            try:
                if Path(it["path"]).resolve() == target:
                    allowed = True
                    break
            except Exception:
                continue
    if not allowed:
        for it in (_load_json(COURSE_INDEX_FILE, {}) or {}).get("items") or []:
            try:
                if Path(it["path"]).resolve() == target:
                    allowed = True
                    break
            except Exception:
                continue
    if not allowed:
        for it in (_load_json(BACKEND_INDEX_FILE, {}) or {}).get("items") or []:
            try:
                if Path(it["path"]).resolve() == target:
                    allowed = True
                    break
            except Exception:
                continue
    if not allowed:
        for it in (_load_json(FRONTEND_INDEX_FILE, {}) or {}).get("items") or []:
            try:
                if Path(it["path"]).resolve() == target:
                    allowed = True
                    break
            except Exception:
                continue
    if not allowed:
        # allow anything under ROOT (工作控制台)
        try:
            if target.is_relative_to(ROOT.resolve()):
                allowed = True
        except Exception:
            pass
    if not allowed:
        raise PermissionError("无权访问该路径（不在扫描白名单内）")
    return target


def read_text_doc(raw: str) -> dict:
    target = assert_readable(raw)
    if target.suffix.lower() not in VIEWABLE_TEXT:
        raise PermissionError("该类型请用文件打开，不支持文本预览")
    content = target.read_text(encoding="utf-8", errors="replace")
    mtime = datetime.fromtimestamp(target.stat().st_mtime)
    try:
        rel = str(target.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        rel = str(target)
    return {
        "ok": True,
        "title": target.stem,
        "path": str(target),
        "rel": rel,
        "markdown": content,
        "updatedAt": mtime.strftime("%Y-%m-%d %H:%M"),
        "ext": target.suffix.lower(),
    }
