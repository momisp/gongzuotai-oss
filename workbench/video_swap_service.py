# -*- coding: utf-8 -*-
"""视频替换人物 · 项目资产扫描 / 进度 / 媒体解析。"""
from __future__ import annotations

import copy
import json
import mimetypes
import re
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PROJECTS_FILE = DATA_DIR / "video_swap_projects.json"
JOBS_FILE = DATA_DIR / "video_swap_jobs.json"

# RLock：update_progress 需要「读-改-写」整体原子，心跳线程与主线程会并发调用
_lock = threading.RLock()

# 任务心跳/租约：running 状态超过该秒数没有心跳，就收敛为 stale（可重新送方舟）
JOB_HEARTBEAT_TIMEOUT_SEC = 180
# 前端轮询保护建议值（与 video-swap.js 的 VS_POLL_MAX_TICKS 保持一致语义：次数 × 2.5s）
JOB_POLL_MAX_TICKS = 240

_IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
_VID_EXT = {".mp4", ".webm", ".mov", ".mkv", ".avi"}
_REPORT_EXT = {".md", ".txt", ".json"}

_VERSION_RE = re.compile(
    r"(?:^|[_\-])(v\d+|ark-final|faceswap|preview)(?:[_\-]|$)|"
    r"(?:^|[_\-])(仅配色|原音|无声)(?:[_\-]|$)",
    re.I,
)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _registry_stat_key() -> tuple:
    """注册表文件指纹（mtime_ns + size），用于进程内缓存失效。"""
    try:
        st = PROJECTS_FILE.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return (0, 0)


# 注册表进程内缓存：送方舟时 stdout 每行一次 update_progress，不能每次都读盘
_registry_cache: dict = {"key": None, "data": None}
# 流程步骤 id → label 缓存（同注册表指纹失效）
_flow_label_cache: dict = {"key": None, "labels": {}}


def load_registry() -> dict:
    key = _registry_stat_key()
    with _lock:
        cached = _registry_cache.get("data")
        if _registry_cache.get("key") == key and isinstance(cached, dict):
            # 深拷贝返回，避免调用方就地修改污染缓存
            return copy.deepcopy(cached)
    data = _load_json(PROJECTS_FILE, {})
    if not isinstance(data, dict):
        data = {}
    data.setdefault("version", 1)
    data.setdefault("default_flow", [])
    data.setdefault("projects", [])
    with _lock:
        _registry_cache["key"] = key
        _registry_cache["data"] = copy.deepcopy(data)
    return copy.deepcopy(data)


def save_registry(data: dict) -> None:
    _save_json(PROJECTS_FILE, data)
    # 写盘后主动失效缓存，下次 load_registry 重新读
    with _lock:
        _registry_cache["key"] = None
        _registry_cache["data"] = None
        _flow_label_cache["key"] = None
        _flow_label_cache["labels"] = {}


def _flow_label(step_id: str) -> str:
    """default_flow 的 id→label，按注册表指纹缓存，避免每次读盘解析。"""
    sid = str(step_id or "").strip()
    if not sid:
        return ""
    key = _registry_stat_key()
    with _lock:
        labels = _flow_label_cache.get("labels")
        if _flow_label_cache.get("key") == key and isinstance(labels, dict):
            return str(labels.get(sid) or "")
    labels = {}
    for s in load_registry().get("default_flow") or []:
        if isinstance(s, dict) and s.get("id"):
            labels[str(s["id"])] = str(s.get("label") or "")
    with _lock:
        _flow_label_cache["key"] = key
        _flow_label_cache["labels"] = labels
    return str(labels.get(sid) or "")


def load_jobs() -> dict:
    data = _load_json(JOBS_FILE, {})
    return data if isinstance(data, dict) else {}


def save_jobs(jobs: dict) -> None:
    with _lock:
        _save_json(JOBS_FILE, jobs)


def _abs(rel: str | Path) -> Path:
    p = Path(rel)
    return p if p.is_absolute() else (ROOT / p).resolve()


def _rel_to_root(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def get_project(project_id: str) -> dict | None:
    for p in load_registry().get("projects") or []:
        if str(p.get("id")) == str(project_id):
            return p
    return None


def project_allowed_roots(proj: dict) -> list[Path]:
    roots = [_abs(proj["root"])]
    for extra in proj.get("extra_roots") or []:
        roots.append(_abs(extra))
    for item in proj.get("extra_outputs") or []:
        if item.get("root"):
            roots.append(_abs(item["root"]))
    # unique preserve order
    seen = set()
    out = []
    for r in roots:
        key = str(r)
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def resolve_project_file(project_id: str, rel: str) -> Path | None:
    proj = get_project(project_id)
    if not proj:
        return None
    rel = (rel or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        return None
    # allow "root_index::rel" for extra roots
    if "::" in rel:
        idx_s, rest = rel.split("::", 1)
        try:
            idx = int(idx_s)
        except ValueError:
            return None
        roots = project_allowed_roots(proj)
        if idx < 0 or idx >= len(roots):
            return None
        target = (roots[idx] / rest).resolve()
        try:
            target.relative_to(roots[idx])
        except ValueError:
            return None
        return target if target.is_file() else None

    root = _abs(proj["root"])
    target = (root / rel).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        # try extra roots by basename hunt only if exact path under each
        for i, er in enumerate(project_allowed_roots(proj)[1:], start=1):
            cand = (er / rel).resolve()
            try:
                cand.relative_to(er)
            except ValueError:
                continue
            if cand.is_file():
                return cand
        return None
    return target if target.is_file() else None


def _file_info(path: Path, *, label: str | None = None, version: str | None = None, kind: str = "file") -> dict:
    st = path.stat()
    suffix = path.suffix.lower()
    if kind == "auto":
        if suffix in _IMG_EXT:
            kind = "image"
        elif suffix in _VID_EXT:
            kind = "video"
        elif suffix in _REPORT_EXT:
            kind = "report"
        else:
            kind = "file"
    ver = version or _guess_version(path.name)
    return {
        "name": path.name,
        "label": label or path.stem,
        "path": _rel_to_root(path),
        "rel": path.name,  # filled by caller when under project root
        "size": st.st_size,
        "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        "mtime_ts": st.st_mtime,
        "kind": kind,
        "version": ver,
        "mime": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
    }


def _guess_version(name: str) -> str:
    m = re.search(r"(?:^|[_\-])(v\d+)(?:[_\-.]|$)", name, re.I)
    if m:
        return m.group(1).lower()
    low = name.lower()
    if "ark" in low and "final" in low or "narration_bgm" in low:
        return "ark-final"
    if "faceswap" in low:
        return "faceswap"
    if "preview" in low:
        return "preview"
    return "v1"


def _glob_under(root: Path, pattern: str) -> list[Path]:
    if not root.exists():
        return []
    # support simple patterns relative to root
    pat = pattern.replace("\\", "/")
    return sorted(root.glob(pat), key=lambda p: p.stat().st_mtime, reverse=True)


def _list_images_in_dirs(root: Path, dirs: list[str]) -> list[dict]:
    items = []
    for d in dirs or []:
        folder = root / d
        if not folder.is_dir():
            continue
        files: list[Path] = []
        for f in folder.iterdir():
            if f.is_file() and f.suffix.lower() in _IMG_EXT:
                files.append(f)
            elif f.is_dir():
                for sub in f.iterdir():
                    if sub.is_file() and sub.suffix.lower() in _IMG_EXT:
                        files.append(sub)
        for f in sorted(files, key=lambda x: x.name):
            info = _file_info(f, kind="image", label=f"{d}/{f.name}")
            try:
                info["rel"] = f.relative_to(root).as_posix()
            except ValueError:
                info["rel"] = f.name
            info["group"] = d
            items.append(info)
    return items


def _list_videos(root: Path, paths: list[str]) -> list[dict]:
    items = []
    for rel in paths or []:
        p = root / rel
        if p.is_file() and p.suffix.lower() in _VID_EXT:
            info = _file_info(p, kind="video", label=p.stem)
            info["rel"] = Path(rel).as_posix()
            items.append(info)
    return items


def _list_outputs(proj: dict) -> list[dict]:
    root = _abs(proj["root"])
    items: list[dict] = []
    seen = set()

    for pat in proj.get("output_patterns") or []:
        for p in _glob_under(root, pat):
            if not p.is_file() or p.suffix.lower() not in _VID_EXT:
                continue
            key = str(p.resolve())
            if key in seen:
                continue
            seen.add(key)
            info = _file_info(p, kind="video")
            try:
                info["rel"] = p.relative_to(root).as_posix()
            except ValueError:
                info["rel"] = p.name
            info["variant"] = _variant_tag(p.name)
            info["is_silent"] = "无声" in p.name
            items.append(info)

    for pat in proj.get("compare_patterns") or []:
        for p in _glob_under(root, pat):
            if not p.is_file() or p.suffix.lower() not in _VID_EXT:
                continue
            key = str(p.resolve())
            if key in seen:
                continue
            seen.add(key)
            info = _file_info(p, kind="video", label=p.stem)
            try:
                info["rel"] = p.relative_to(root).as_posix()
            except ValueError:
                info["rel"] = p.name
            info["variant"] = "compare"
            info["is_compare"] = True
            items.append(info)

    for extra in proj.get("extra_outputs") or []:
        er = _abs(extra.get("root") or proj["root"])
        p = er / extra["path"]
        if not p.is_file():
            continue
        key = str(p.resolve())
        if key in seen:
            continue
        seen.add(key)
        roots = project_allowed_roots(proj)
        try:
            idx = roots.index(er.resolve())
        except ValueError:
            idx = 0
        info = _file_info(
            p,
            kind="video",
            label=extra.get("label") or p.stem,
            version=extra.get("version"),
        )
        info["rel"] = f"{idx}::{Path(extra['path']).as_posix()}"
        info["variant"] = extra.get("label") or "extra"
        items.append(info)

    items.sort(key=lambda x: x.get("mtime_ts") or 0, reverse=True)
    return items


def _variant_tag(name: str) -> str:
    tags = []
    if "无声" in name:
        tags.append("无声")
    if "原音" in name:
        tags.append("原音")
    if "对照" in name:
        tags.append("对照")
    return "+".join(tags) if tags else "成片"


def _list_reports(proj: dict) -> list[dict]:
    root = _abs(proj["root"])
    items = []
    for rel in proj.get("reports") or []:
        p = root / rel
        if p.is_file():
            info = _file_info(p, kind="report", label=p.name)
            info["rel"] = Path(rel).as_posix()
            try:
                info["preview"] = p.read_text(encoding="utf-8", errors="replace")[:4000]
            except OSError:
                info["preview"] = ""
            items.append(info)
    return items


def _tail_log(path: Path, max_lines: int = 120, max_bytes: int = 64_000) -> str:
    """只读文件尾部，避免大日志整文件读入。"""
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            if size > max_bytes:
                f.seek(size - max_bytes)
            data = f.read()
        text = data.decode("utf-8", errors="replace")
        if size > max_bytes:
            # 去掉半截行
            nl = text.find("\n")
            if nl >= 0:
                text = text[nl + 1 :]
    except OSError:
        return ""
    lines = text.splitlines()
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    return "\n".join(lines)


def _count_images(root: Path, dirs: list[str]) -> int:
    n = 0
    for d in dirs or []:
        folder = root / d
        if not folder.is_dir():
            continue
        for f in folder.iterdir():
            if f.is_file() and f.suffix.lower() in _IMG_EXT:
                n += 1
            elif f.is_dir():
                for sub in f.iterdir():
                    if sub.is_file() and sub.suffix.lower() in _IMG_EXT:
                        n += 1
    return n


def _latest_output_light(proj: dict) -> dict | None:
    """列表页只用：找最新一条成片，不做全量元数据拼装。"""
    root = _abs(proj["root"])
    best: tuple[float, Path, dict | None] | None = None

    def consider(path: Path, meta: dict | None = None) -> None:
        nonlocal best
        if not path.is_file() or path.suffix.lower() not in _VID_EXT:
            return
        if "无声" in path.name:
            return
        try:
            m = path.stat().st_mtime
        except OSError:
            return
        if best is None or m > best[0]:
            best = (m, path, meta)

    for pat in proj.get("output_patterns") or []:
        for p in _glob_under(root, pat):
            consider(p)

    for extra in proj.get("extra_outputs") or []:
        er = _abs(extra.get("root") or proj["root"])
        consider(er / extra["path"], extra)

    if not best:
        return None
    _, path, extra = best
    if extra:
        er = _abs(extra.get("root") or proj["root"])
        info = _file_info(
            path,
            kind="video",
            label=extra.get("label") or path.stem,
            version=extra.get("version"),
        )
        roots = project_allowed_roots(proj)
        try:
            idx = roots.index(er.resolve())
        except ValueError:
            idx = 0
        info["rel"] = f"{idx}::{Path(extra['path']).as_posix()}"
        return info

    info = _file_info(path, kind="video")
    try:
        info["rel"] = path.relative_to(root).as_posix()
    except ValueError:
        info["rel"] = path.name
    return info


def _count_outputs(proj: dict) -> int:
    root = _abs(proj["root"])
    n = 0
    seen = set()
    for pat in (proj.get("output_patterns") or []) + (proj.get("compare_patterns") or []):
        for p in _glob_under(root, pat):
            if p.is_file() and p.suffix.lower() in _VID_EXT:
                key = str(p)
                if key not in seen:
                    seen.add(key)
                    n += 1
    for extra in proj.get("extra_outputs") or []:
        p = _abs(extra.get("root") or proj["root"]) / extra["path"]
        if p.is_file():
            n += 1
    return n


def _ts_to_epoch(text: str) -> float:
    """'YYYY-MM-DD HH:MM:SS' → epoch 秒；解析失败返回 0。"""
    s = str(text or "").strip()
    if not s:
        return 0.0
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).timestamp()
        except ValueError:
            continue
    return 0.0


def _heartbeat_age_sec(job: dict) -> float:
    """距最近一次心跳（heartbeat_at，缺失则 updated_at）的秒数；无法判断返回 -1。"""
    ts = _ts_to_epoch(job.get("heartbeat_at") or "") or _ts_to_epoch(job.get("updated_at") or "")
    if not ts:
        return -1.0
    return max(0.0, time.time() - ts)


def _job_view(raw: dict) -> dict:
    """
    把落盘的 job 记录收敛成对外视图。
    running 且心跳超时（进程被中断/脚本回写失败）→ 收敛为 stale，
    保留 error_code 与 logs 供追溯，绝不静默改成 done。
    """
    raw = raw if isinstance(raw, dict) else {}
    status = str(raw.get("status") or "idle")
    view = {
        "status": status,
        "step": raw.get("step") or "",
        "step_label": raw.get("step_label") or "",
        "progress": int(raw.get("progress") or 0),
        "message": raw.get("message") or "",
        "error_code": raw.get("error_code") or "",
        "segment_i": raw.get("segment_i"),
        "segment_n": raw.get("segment_n"),
        "updated_at": raw.get("updated_at") or "",
        "heartbeat_at": raw.get("heartbeat_at") or "",
        "logs": list(raw.get("logs") or [])[-200:],
        "flow": raw.get("flow"),
        "events": list(raw.get("events") or [])[-80:],
        "stale": False,
        "heartbeat_age": 0,
    }
    if status != "running":
        return view
    age = _heartbeat_age_sec(raw)
    if age < 0 or age <= JOB_HEARTBEAT_TIMEOUT_SEC:
        view["heartbeat_age"] = int(max(0.0, age))
        return view
    view["status"] = "stale"
    view["stale"] = True
    view["heartbeat_age"] = int(age)
    view["message"] = (
        f"任务已中断（心跳超时 {int(age)}s，未收到进度回写），可重新送方舟。"
        f"最后一次消息：{view['message'] or '（无）'}"[:300]
    )
    return view


def _job_for(project_id: str) -> dict:
    jobs = load_jobs()
    job = jobs.get(project_id) or {}
    return _job_view(job)


def _job_heartbeat_fresh(project_id: str) -> bool:
    """心跳是否新鲜：仅凭 status=running 不足以认定任务在跑。"""
    jobs = load_jobs()
    job = jobs.get(project_id)
    if not isinstance(job, dict):
        return False
    if str(job.get("status") or "idle") != "running":
        return False
    age = _heartbeat_age_sec(job)
    return age >= 0 and age <= JOB_HEARTBEAT_TIMEOUT_SEC


def update_progress(project_id: str, payload: dict | None = None) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    with _lock:
        jobs = load_jobs()
        cur = dict(jobs.get(project_id) or {})
        if "status" in payload:
            cur["status"] = str(payload["status"])
        if "step" in payload:
            cur["step"] = str(payload["step"])
        if "step_label" in payload:
            cur["step_label"] = str(payload["step_label"])
        elif payload.get("step"):
            # map from default flow（带缓存，不再每次读盘解析注册表）
            label = _flow_label(payload.get("step"))
            if label:
                cur["step_label"] = label
        if "progress" in payload:
            try:
                cur["progress"] = max(0, min(100, int(payload["progress"])))
            except (TypeError, ValueError):
                pass
        if "message" in payload:
            cur["message"] = str(payload["message"])
        if "error_code" in payload:
            cur["error_code"] = str(payload["error_code"] or "")
        if "segment_i" in payload:
            cur["segment_i"] = payload.get("segment_i")
        if "segment_n" in payload:
            cur["segment_n"] = payload.get("segment_n")
        if "flow" in payload and isinstance(payload["flow"], list):
            cur["flow"] = payload["flow"]
        logs = list(cur.get("logs") or [])
        events = list(cur.get("events") or [])
        if payload.get("log"):
            line = f"[{_now()}] {payload['log']}"
            logs.append(line)
            events.append(
                {
                    "ts": _now(),
                    "level": str(payload.get("level") or "info"),
                    "step": cur.get("step") or "",
                    "message": str(payload["log"]),
                    "error_code": cur.get("error_code") or "",
                }
            )
        if payload.get("append_logs"):
            for line in payload["append_logs"]:
                logs.append(str(line))
        if payload.get("clear_logs"):
            logs = []
            events = []
        cur["logs"] = logs[-300:]
        cur["events"] = events[-120:]
        cur["updated_at"] = _now()
        # 心跳/租约：显式 heartbeat 或仍在 running 都刷新；终态清空
        if payload.get("heartbeat") or cur.get("status") == "running":
            cur["heartbeat_at"] = _now()
        elif cur.get("status") in ("done", "failed", "idle", "cancelled"):
            cur["heartbeat_at"] = ""
        jobs[project_id] = cur
        save_jobs(jobs)
    return {"ok": True, "job": _job_for(project_id)}


def reset_stuck_job(project_id: str) -> dict:
    """
    手动复位卡住的任务：running/stale → idle，清空心跳，保留 logs 与 error_code 供追溯。
    用于「进程重启后 jobs.json 仍是脏 running」的人工兜底。
    """
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    with _lock:
        jobs = load_jobs()
        cur = dict(jobs.get(project_id) or {})
        prev_status = str(cur.get("status") or "idle")
        cur["status"] = "idle"
        cur["step"] = ""
        cur["step_label"] = ""
        cur["progress"] = 0
        cur["segment_i"] = None
        cur["segment_n"] = None
        cur["heartbeat_at"] = ""
        cur["message"] = f"已手动复位（原状态 {prev_status}），可重新送方舟"
        cur["updated_at"] = _now()
        logs = list(cur.get("logs") or [])
        logs.append(f"[{_now()}] manual reset: {prev_status} → idle（保留 error_code={cur.get('error_code') or ''}）")
        cur["logs"] = logs[-300:]
        jobs[project_id] = cur
        save_jobs(jobs)
    return {"ok": True, "job": _job_for(project_id), "reset": True}


def clear_progress(project_id: str) -> dict:
    jobs = load_jobs()
    if project_id in jobs:
        del jobs[project_id]
        save_jobs(jobs)
    return {"ok": True, "job": _job_for(project_id)}


def get_job(project_id: str) -> dict:
    return _job_for(project_id)


def project_summary(proj: dict) -> dict:
    """列表页轻量摘要：不扫全量定妆照/成片元数据。"""
    root = _abs(proj["root"])
    job = _job_for(proj["id"])
    sources = proj.get("source_videos") or []
    reports = proj.get("reports") or []
    return {
        "id": proj["id"],
        "name": proj.get("name") or proj["id"],
        "subtitle": proj.get("subtitle") or "",
        "notes": proj.get("notes") or "",
        "recommended_version": proj.get("recommended_version") or "",
        "root": _rel_to_root(root),
        "root_exists": root.is_dir(),
        "counts": {
            "costumes": _count_images(root, proj.get("costume_dirs") or []),
            "sources": sum(1 for r in sources if (root / r).is_file()),
            "outputs": _count_outputs(proj),
            "reports": sum(1 for r in reports if (root / r).is_file()),
        },
        "latest_output": _latest_output_light(proj),
        "job": job,
        "running": job.get("status") == "running",
    }


def list_projects() -> dict:
    reg = load_registry()
    # jobs 只读一次，避免每个项目反复打开 JSON
    jobs = load_jobs()
    items = []
    for p in reg.get("projects") or []:
        summary = project_summary(p)
        j = jobs.get(p["id"]) or {}
        view = _job_view(j)
        summary["job"] = {
            "status": view["status"],
            "step": view["step"],
            "step_label": view["step_label"],
            "progress": view["progress"],
            "message": view["message"],
            "updated_at": view["updated_at"],
            "heartbeat_at": view["heartbeat_at"],
            "stale": view["stale"],
            "logs": [],  # 列表不带日志
            "flow": None,
        }
        summary["running"] = summary["job"]["status"] == "running"
        items.append(summary)
    return {
        "ok": True,
        "projects": items,
        "flow": reg.get("default_flow") or [],
        "count": len(items),
    }


def project_detail(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    root = _abs(proj["root"])
    reg = load_registry()
    job = _job_for(project_id)
    file_logs = []
    for rel in proj.get("log_files") or []:
        p = root / rel
        if p.is_file():
            file_logs.append(
                {
                    "name": p.name,
                    "rel": Path(rel).as_posix(),
                    "tail": _tail_log(p),
                    "mtime": datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                }
            )
    flow = job.get("flow") or reg.get("default_flow") or []
    outputs = _list_outputs(proj)
    return {
        "ok": True,
        "project": {
            **project_summary(proj),
            "aliases": proj.get("aliases") or [],
            "flow": flow,
            "costumes": _list_images_in_dirs(root, proj.get("costume_dirs") or []),
            "sources": _list_videos(root, proj.get("source_videos") or []),
            "outputs": outputs,
            "version_groups": group_outputs_by_version(outputs, proj.get("recommended_version") or ""),
            "compares": [o for o in outputs if o.get("is_compare")],
            "shot_compare": list_shot_pairs(project_id),
            "reports": _list_reports(proj),
            "file_logs": file_logs,
            "job": job,
            "guide_path": "流程说明.md" if (root / "流程说明.md").is_file() else "",
        },
    }


def group_outputs_by_version(outputs: list[dict], baseline: str) -> list[dict]:
    """成片按版本分组；对照单独列出。"""
    groups: dict[str, dict] = {}
    order: list[str] = []
    for o in outputs:
        if o.get("is_compare"):
            continue
        ver = str(o.get("version") or "v1").lower()
        if ver not in groups:
            groups[ver] = {
                "version": ver,
                "is_baseline": ver == str(baseline or "").lower(),
                "items": [],
            }
            order.append(ver)
        groups[ver]["items"].append(o)
    # baseline first, then version sort-ish
    def sort_key(v: str):
        m = re.search(r"v(\d+)", v)
        return (0 if v == str(baseline or "").lower() else 1, -(int(m.group(1)) if m else -1), v)

    order.sort(key=sort_key)
    return [groups[v] for v in order]


def set_baseline(project_id: str, version: str, notes: str | None = None) -> dict:
    reg = load_registry()
    found = None
    for p in reg.get("projects") or []:
        if p.get("id") == project_id:
            found = p
            break
    if not found:
        return {"ok": False, "error": "项目不存在"}
    version = (version or "").strip()
    if not version:
        return {"ok": False, "error": "版本号不能为空"}
    old = found.get("recommended_version") or ""
    found["recommended_version"] = version
    if notes is not None:
        found["notes"] = notes
    else:
        stamp = _now()
        prev = found.get("notes") or ""
        audit = f"基线 {old or '无'} → {version}（{stamp}）"
        found["notes"] = (prev + " · " + audit) if prev else audit
    # versions.json soft write
    root = _abs(found["root"])
    meta_dir = root / "输出"
    meta_dir.mkdir(parents=True, exist_ok=True)
    meta_path = meta_dir / "versions.json"
    meta = _load_json(meta_path, {"baseline": "", "versions": [], "audit": []})
    meta["baseline"] = version
    audit = list(meta.get("audit") or [])
    audit.append({"ts": _now(), "from": old, "to": version})
    meta["audit"] = audit[-50:]
    _save_json(meta_path, meta)
    save_registry(reg)
    return {"ok": True, "recommended_version": version, "project": project_summary(found)}


GUIDE_FILE = ROOT / "integrated" / "ai_story" / "视频替换人物" / "流程说明.md"
GUIDE_TOC_FILE = ROOT / "integrated" / "ai_story" / "视频替换人物" / "流程步骤.json"
MANUAL_FILE = Path(__file__).resolve().parent / "docs" / "视频替换工作台_使用说明书.md"

# 兜底；优先读 流程步骤.json，改流程卡无需重启工作台
GUIDE_TOC = [
    {
        "id": "s1",
        "title": "第一步：定妆照",
        "summary": "每角色正/侧/背/脸四视图；过审配色；二次元锚点，禁真人摄影。",
    },
    {
        "id": "s2",
        "title": "第二步：原片入库",
        "summary": "参考视频放入参考视频/；公网上传；真人片勿直喂方舟。",
    },
    {
        "id": "s3",
        "title": "第三步：切段 + 分镜对照（人工审核）",
        "summary": "硬切→人数归类后，在「分镜对照」改人工判断/备注并保存；禁跨镜粘段；未审不得拼包。",
    },
    {
        "id": "s4",
        "title": "第四步：提示词",
        "summary": "官方全文 + 约束追加（表情/朝向/嘴上弹/禁换景）；必要时分段补丁。",
    },
    {
        "id": "s5",
        "title": "第五步：送方舟的视频（人工审核）",
        "summary": "按人工判断拼包→逐包复查画面/分类/吃镜；确认后才点「送方舟生成」。",
    },
    {
        "id": "s6",
        "title": "第六步：分段换角",
        "summary": "用已审包送 Seedance 2.0；无声；按原时长切开回填；失败单包重试。",
    },
    {
        "id": "s7",
        "title": "第七步：拼轨叠音出版本",
        "summary": "按时间轴拼回；叠原片音；命名 _vN；勿覆盖基线。",
    },
    {
        "id": "s8",
        "title": "第八步：复查对照锁基线",
        "summary": "人工抽查 → 左右对照 → 写报告 → 工作台锁定推荐基线。",
    },
    {
        "id": "s9",
        "title": "第九步：问题段重换",
        "summary": "只重跑问题区间合并新版本；版权死段可保留并注明。",
    },
]


def _load_guide_toc() -> list:
    path = GUIDE_TOC_FILE
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list) and data:
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return list(GUIDE_TOC)


def get_guide() -> dict:
    text = ""
    path = GUIDE_FILE
    if path.is_file():
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "path": _rel_to_root(path) if path.exists() else "",
        "toc": _load_guide_toc(),
        "markdown": text,
    }


def get_manual() -> dict:
    """工作台界面使用说明书（两栏 / Stepper / 闸门怎么点）。"""
    path = MANUAL_FILE
    if not path.is_file():
        return {"ok": False, "error": f"说明书缺失：{path.name}", "markdown": ""}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return {"ok": False, "error": str(exc), "markdown": ""}
    try:
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        rel = path.name
    return {
        "ok": True,
        "path": rel,
        "title": "视频替换工作台 · 使用说明书",
        "markdown": text,
    }


def create_project(payload: dict | None = None) -> dict:
    payload = payload or {}
    name = str(payload.get("name") or "").strip()
    pid = str(payload.get("id") or "").strip()
    if not name:
        return {"ok": False, "error": "请填写项目名称"}
    if not pid:
        pid = re.sub(r"[^a-zA-Z0-9_\-]+", "-", name).strip("-").lower() or f"proj-{int(time.time())}"
    if get_project(pid):
        return {"ok": False, "error": f"项目 id 已存在：{pid}"}
    root_rel = str(payload.get("root") or f"integrated/ai_story/视频替换人物/projects/{pid}")
    root = _abs(root_rel)
    for sub in ("定妆照", "参考视频", "原片分镜/仅角色一", "原片分镜/仅角色二", "原片分镜/双人同屏", "原片分镜/空镜", "提示词", "输出/对照"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    readme = root / "README.md"
    if not readme.exists():
        readme.write_text(
            f"# {name}\n\n请按工作台「流程说明」准备定妆照与原片，再切段换角。\n",
            encoding="utf-8",
        )
    # copy guide pointer
    guide_src = GUIDE_FILE
    if guide_src.is_file():
        try:
            (root / "流程说明.md").write_text(guide_src.read_text(encoding="utf-8"), encoding="utf-8")
        except OSError:
            pass
    proj = {
        "id": pid,
        "name": name,
        "subtitle": str(payload.get("subtitle") or "新建换角项目"),
        "root": root_rel.replace("\\", "/"),
        "costume_dirs": ["定妆照"],
        "source_videos": [],
        "output_patterns": ["输出/*换角*.mp4", "输出/*.mp4"],
        "compare_patterns": ["输出/对照/*.mp4"],
        "reports": ["README.md", "流程说明.md"],
        "log_files": [],
        "recommended_version": "",
        "notes": "由工作台新建；请按流程说明准备素材。",
    }
    reg = load_registry()
    projects = list(reg.get("projects") or [])
    projects.append(proj)
    reg["projects"] = projects
    reg["updated_at"] = datetime.now().strftime("%Y-%m-%d")
    save_registry(reg)
    return {"ok": True, "project": project_summary(proj)}


def build_compare(project_id: str, payload: dict | None = None) -> dict:
    """生成左原片|右成片对照（默认前 12 秒）。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    root = _abs(proj["root"])
    sources = _list_videos(root, proj.get("source_videos") or [])
    if not sources:
        return {"ok": False, "error": "项目未登记原片"}
    left = root / sources[0]["rel"]
    version = str(payload.get("version") or proj.get("recommended_version") or "").strip()
    outputs = _list_outputs(proj)
    right_info = None
    if version:
        for o in outputs:
            if o.get("is_compare") or o.get("is_silent"):
                continue
            if str(o.get("version") or "").lower() == version.lower():
                right_info = o
                break
    if not right_info:
        for o in outputs:
            if not o.get("is_compare") and not o.get("is_silent"):
                right_info = o
                break
    if not right_info:
        return {"ok": False, "error": "没有可对照的成片"}
    right = resolve_project_file(project_id, right_info["rel"])
    if not right or not left.is_file():
        return {"ok": False, "error": "原片或成片文件不存在"}
    out_dir = root / "输出" / "对照"
    out_dir.mkdir(parents=True, exist_ok=True)
    ver_tag = right_info.get("version") or "out"
    duration = float(payload.get("duration") or 12)
    out_path = out_dir / f"对照_原片_vs_{ver_tag}_前{int(duration)}秒.mp4"
    update_progress(
        project_id,
        {
            "status": "running",
            "step": "compare",
            "progress": 10,
            "message": f"正在生成对照 {out_path.name}",
            "log": f"compare start left={left.name} right={right.name}",
            "clear_logs": False,
        },
    )
    # hstack via ffmpeg
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        "0",
        "-t",
        str(duration),
        "-i",
        str(left),
        "-ss",
        "0",
        "-t",
        str(duration),
        "-i",
        str(right),
        "-filter_complex",
        "[0:v]scale=640:-2,setsar=1[left];[1:v]scale=640:-2,setsar=1[right];[left][right]hstack=inputs=2[v]",
        "-map",
        "[v]",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        str(out_path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except FileNotFoundError:
        update_progress(
            project_id,
            {"status": "failed", "error_code": "FFMPEG_MISSING", "message": "未找到 ffmpeg", "log": "ffmpeg missing"},
        )
        return {"ok": False, "error": "未找到 ffmpeg，请先安装并加入 PATH"}
    except subprocess.TimeoutExpired:
        update_progress(
            project_id,
            {"status": "failed", "error_code": "COMPARE_TIMEOUT", "message": "对照生成超时", "log": "timeout"},
        )
        return {"ok": False, "error": "对照生成超时"}
    if proc.returncode != 0:
        err = (proc.stderr or "")[-500:]
        update_progress(
            project_id,
            {
                "status": "failed",
                "error_code": "COMPARE_FAIL",
                "message": "对照生成失败",
                "log": err,
                "level": "error",
            },
        )
        return {"ok": False, "error": "ffmpeg 失败", "detail": err}
    rel = out_path.relative_to(root).as_posix()
    update_progress(
        project_id,
        {
            "status": "done",
            "step": "done",
            "progress": 100,
            "message": f"对照已生成：{out_path.name}",
            "log": f"compare ok → {rel}",
            "error_code": "",
        },
    )
    return {
        "ok": True,
        "path": rel,
        "file": _file_info(out_path, kind="video", label=out_path.stem),
        "version": ver_tag,
    }


_demo_threads: dict[str, threading.Thread] = {}


def start_demo_progress(project_id: str) -> dict:
    """P2：页内演示完整进度（不调用方舟）。"""
    if not get_project(project_id):
        return {"ok": False, "error": "项目不存在"}
    cur = _job_for(project_id)
    if cur.get("status") == "running":
        return {"ok": False, "error": "已有任务进行中"}

    def runner():
        steps = load_registry().get("default_flow") or []
        n = max(len(steps), 1)
        update_progress(
            project_id,
            {"status": "running", "progress": 0, "message": "演示任务开始", "log": "demo start", "clear_logs": True},
        )
        for i, s in enumerate(steps):
            pct = int((i + 1) / n * 100)
            msg = s.get("label") or s.get("id")
            extra = {}
            if s.get("id") == "generate":
                extra = {"segment_i": 3, "segment_n": 19, "message": f"{msg}（演示 3/19 段）"}
            else:
                extra = {"message": f"演示：{msg}"}
            update_progress(
                project_id,
                {
                    "status": "running",
                    "step": s.get("id"),
                    "step_label": s.get("label"),
                    "progress": pct,
                    "log": f"demo step {s.get('id')}",
                    **extra,
                },
            )
            time.sleep(0.8)
        update_progress(
            project_id,
            {
                "status": "done",
                "step": "done",
                "progress": 100,
                "message": "演示完成（未真实调用 Seedance）",
                "log": "demo done",
                "segment_i": None,
                "segment_n": None,
            },
        )

    t = threading.Thread(target=runner, daemon=True)
    _demo_threads[project_id] = t
    t.start()
    return {"ok": True, "message": "已开始进度演示"}


def mark_job(project_id: str, action: str) -> dict:
    """人工标记任务开始/取消（真实换角仍由 Agent/CLI 执行并上报 progress）。"""
    if not get_project(project_id):
        return {"ok": False, "error": "项目不存在"}
    action = (action or "").strip().lower()
    if action == "start":
        return update_progress(
            project_id,
            {
                "status": "running",
                "step": "assets",
                "progress": 5,
                "message": "已标记开始：请按流程说明准备定妆照与原片（Agent/脚本请持续上报 progress）",
                "log": "manual mark start",
                "error_code": "",
                "clear_logs": True,
            },
        )
    if action == "cancel":
        return update_progress(
            project_id,
            {
                "status": "idle",
                "step": "",
                "progress": 0,
                "message": "已取消标记",
                "log": "manual cancel",
                "error_code": "",
            },
        )
    if action == "fail_sample":
        return update_progress(
            project_id,
            {
                "status": "failed",
                "step": "generate",
                "progress": 42,
                "error_code": "InputVideoSensitiveContentDetected.Copyright",
                "message": "示例失败：分段疑似版权拦截，可单段重试或换提示词/参考片",
                "log": "sample fail copyright",
                "level": "error",
            },
        )
    return {"ok": False, "error": "未知 action"}


ISSUE_TYPES = [
    {"id": "ok", "label": "通过"},
    {"id": "not_swapped", "label": "未换角/像原片"},
    {"id": "motion_wrong", "label": "动作不对"},
    {"id": "facing_wrong", "label": "朝向错误"},
    {"id": "scene_drift", "label": "漂景/换景"},
    {"id": "face_mix", "label": "混脸/串人"},
    {"id": "expression", "label": "表情不到位"},
    {"id": "hand_mouth", "label": "手部/嘴上弹问题"},
    {"id": "other", "label": "其他"},
]

DEFAULT_PROMPTS = {
    "仅角色一": (
        "严格替换@视频1中唯一人物的身份为角色一，全片只做这一处身份置换，不新增任何人物。"
        "@图片1正面全身主锚点，@图片2侧面，@图片3背面，@图片4面部特写。"
        "锁定五官发型服装与@图片一致；@视频1的镜头、动作、走位、场景、光影、时长一律保留。"
        "表情幅度跟随原片；朝向跟随原片；禁止换景；无声。"
    ),
    "仅角色二": (
        "严格替换@视频1中唯一人物的身份为角色二，全片只做这一处身份置换，不新增任何人物。"
        "@图片1正面全身主锚点，@图片2侧面，@图片3背面，@图片4面部特写。"
        "锁定五官发型服装与@图片一致；@视频1的镜头、动作、走位、场景、光影、时长一律保留。"
        "表情幅度跟随原片；朝向跟随原片；禁止换景；无声。"
    ),
    "双人同屏": (
        "严格按身份一一替换，禁止混脸、混发、混服装。"
        "@图片1-4 角色一：只替换原视频里对应人物；@图片5-8 角色二：只替换另一人。"
        "镜头、动作、走位、场景、光影、时长保持原视频；禁止换景；无声；不新增第三人。"
    ),
    "空镜": "空镜不换人，拼轨时直接使用原片切段。",
    "角色一": (
        "严格替换@视频1中人物身份为角色一；锁定定妆；动作运镜场景跟随参考视频；无声。"
    ),
    "角色二": (
        "严格替换@视频1中人物身份为角色二；锁定定妆；动作运镜场景跟随参考视频；无声。"
    ),
}


def _prompts_path(proj: dict) -> Path:
    cfg = proj.get("shot_compare") or {}
    rel = cfg.get("prompts_file") or "输出/分镜提示词.json"
    return _abs(proj["root"]) / rel


def load_prompts(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    path = _prompts_path(proj)
    data = _load_json(path, {"version": 1, "defaults": {}, "overrides": {}})
    defaults = dict(DEFAULT_PROMPTS)
    defaults.update(data.get("defaults") or {})
    return {
        "ok": True,
        "defaults": defaults,
        "overrides": data.get("overrides") or {},
        "path": _rel_to_root(path),
    }


def save_prompts(project_id: str, payload: dict | None = None) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    path = _prompts_path(proj)
    cur = _load_json(path, {"version": 1, "defaults": {}, "overrides": {}})
    if isinstance(payload.get("defaults"), dict):
        cur.setdefault("defaults", {}).update({str(k): str(v) for k, v in payload["defaults"].items()})
    if isinstance(payload.get("overrides"), dict):
        ov = cur.setdefault("overrides", {})
        for k, v in payload["overrides"].items():
            text = str(v or "").strip()
            if text:
                ov[str(k)] = text
            elif str(k) in ov:
                del ov[str(k)]
    # single shot
    if payload.get("id") is not None and "prompt" in payload:
        sid = str(payload["id"])
        text = str(payload.get("prompt") or "").strip()
        ov = cur.setdefault("overrides", {})
        if text:
            ov[sid] = text
        elif sid in ov:
            del ov[sid]
    cur["updated_at"] = _now()
    path.parent.mkdir(parents=True, exist_ok=True)
    _save_json(path, cur)
    return load_prompts(project_id)


def resolve_shot_prompt(project_id: str, shot_id: str, kind: str) -> str:
    data = load_prompts(project_id)
    if not data.get("ok"):
        return DEFAULT_PROMPTS.get(kind) or ""
    ov = (data.get("overrides") or {}).get(shot_id)
    if ov:
        return ov
    return (data.get("defaults") or {}).get(kind) or DEFAULT_PROMPTS.get(kind) or ""


def _kind_default_prompt(project_id: str, kind: str) -> str:
    data = load_prompts(project_id)
    if data.get("ok"):
        return (data.get("defaults") or {}).get(kind) or DEFAULT_PROMPTS.get(kind) or ""
    return DEFAULT_PROMPTS.get(kind) or ""


def _kind_from_shot_id(shot_id: str, fallback: str = "") -> str:
    if "/" in shot_id:
        return shot_id.split("/", 1)[0]
    return fallback


def _save_prompt_if_needed(project_id: str, shot_id: str, prompt: str, kind: str = "") -> None:
    """与分类默认相同则清除覆盖，避免整页保存把默认词都写成「已改」。"""
    kind = kind or _kind_from_shot_id(shot_id)
    text = str(prompt or "").strip()
    default = _kind_default_prompt(project_id, kind).strip()
    if text == default:
        save_prompts(project_id, {"id": shot_id, "prompt": ""})
    else:
        save_prompts(project_id, {"id": shot_id, "prompt": text})


# ---------- 分镜段说明（镜头/场景/角色/动作）----------

DESC_FIELDS = ("camera", "scene", "character", "action")
HUMAN_KIND_OPTIONS = [
    {"id": "角色一", "label": "角色一"},
    {"id": "角色二", "label": "角色二"},
    {"id": "双人同镜", "label": "双人同镜"},
    {"id": "空镜", "label": "空镜"},
]
KIND_TO_HUMAN = {
    "仅角色一": "角色一",
    "仅角色二": "角色二",
    "双人同屏": "双人同镜",
    "空镜": "空镜",
}
_VL_CFG_CACHE: dict | None = None


def _judges_path(proj: dict) -> Path:
    cfg = proj.get("shot_compare") or {}
    rel = cfg.get("judges_file") or "输出/分镜人工判断.json"
    return _abs(proj["root"]) / rel


def load_shot_judges(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在", "items": {}}
    path = _judges_path(proj)
    data = _load_json(path, {"version": 1, "items": {}})
    if not isinstance(data.get("items"), dict):
        data["items"] = {}
    return {"ok": True, "items": data["items"], "path": _rel_to_root(path)}


def save_shot_judges(project_id: str, payload: dict | None = None) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    path = _judges_path(proj)
    cur = _load_json(path, {"version": 1, "items": {}})
    items = dict(cur.get("items") or {})
    bulk = payload.get("items")
    if isinstance(bulk, dict):
        for sid, body in bulk.items():
            if not isinstance(body, dict):
                continue
            hk = str(body.get("human_kind") or "").strip()
            if hk:
                items[str(sid)] = {
                    "human_kind": hk,
                    "source": str(body.get("source") or "manual"),
                    "updated_at": _now(),
                }
            elif str(sid) in items:
                del items[str(sid)]
    elif payload.get("id") is not None:
        sid = str(payload["id"])
        hk = str(payload.get("human_kind") or "").strip()
        if hk:
            items[sid] = {"human_kind": hk, "source": str(payload.get("source") or "manual"), "updated_at": _now()}
        elif sid in items:
            del items[sid]
    else:
        return {"ok": False, "error": "缺少 items 或 id"}
    cur["items"] = items
    cur["updated_at"] = _now()
    path.parent.mkdir(parents=True, exist_ok=True)
    _save_json(path, cur)
    return {"ok": True, "items": items, "path": _rel_to_root(path)}


def _attach_judges(project_id: str, items: list[dict]) -> None:
    data = load_shot_judges(project_id)
    stored = data.get("items") or {}
    for it in items:
        sid = it["id"]
        kind = it.get("kind") or ""
        auto = KIND_TO_HUMAN.get(kind, "")
        row = stored.get(sid) or {}
        human = str(row.get("human_kind") or "").strip() or auto
        it["human_kind"] = human
        it["human_kind_auto"] = auto
        it["human_kind_overridden"] = bool(row.get("human_kind")) and str(row.get("human_kind")) != auto
        it["judge_source"] = str(row.get("source") or "")


def _descs_path(proj: dict) -> Path:
    cfg = proj.get("shot_compare") or {}
    rel = cfg.get("descs_file") or "输出/分镜段说明.json"
    return _abs(proj["root"]) / rel


def load_shot_descs(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在", "items": {}}
    path = _descs_path(proj)
    data = _load_json(path, {"version": 1, "items": {}})
    if not isinstance(data.get("items"), dict):
        data["items"] = {}
    return {
        "ok": True,
        "items": data["items"],
        "path": _rel_to_root(path),
        "updated_at": data.get("updated_at") or "",
    }


def save_shot_descs(project_id: str, payload: dict | None = None) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    path = _descs_path(proj)
    cur = _load_json(path, {"version": 1, "items": {}})
    items = dict(cur.get("items") or {})
    bulk = payload.get("items")
    if isinstance(bulk, dict):
        for sid, body in bulk.items():
            if not isinstance(body, dict):
                continue
            _merge_desc_item(items, str(sid), body)
    elif payload.get("id") is not None:
        _merge_desc_item(items, str(payload["id"]), payload)
    else:
        return {"ok": False, "error": "缺少 items 或 id"}
    cur["items"] = items
    cur["updated_at"] = _now()
    path.parent.mkdir(parents=True, exist_ok=True)
    _save_json(path, cur)
    return {"ok": True, "items": items, "path": _rel_to_root(path), "shot_compare": list_shot_pairs(project_id)}


def _merge_desc_item(items: dict, sid: str, body: dict) -> None:
    row = dict(items.get(sid) or {})
    touched = False
    for k in DESC_FIELDS:
        if k in body:
            row[k] = str(body.get(k) or "").strip()
            touched = True
    if "source" in body:
        row["source"] = str(body.get("source") or "").strip()
        touched = True
    if not touched:
        return
    if any(row.get(k) for k in DESC_FIELDS):
        row["updated_at"] = _now()
        items[sid] = row
    elif sid in items:
        del items[sid]


def _empty_desc() -> dict:
    return {k: "" for k in DESC_FIELDS} | {"source": "", "updated_at": ""}


def _attach_descs(project_id: str, items: list[dict]) -> None:
    data = load_shot_descs(project_id)
    stored = data.get("items") or {}
    for it in items:
        row = stored.get(it["id"]) or {}
        for k in DESC_FIELDS:
            it[k] = str(row.get(k) or "")
        it["desc_source"] = str(row.get("source") or "")
        it["desc_updated_at"] = str(row.get("updated_at") or "")
        it["has_desc"] = any(it.get(k) for k in DESC_FIELDS)


def _fetch_vl_config() -> dict:
    """从 ai_story 容器取 doubao-seed-1-6 凭证（进程内缓存）。"""
    global _VL_CFG_CACHE
    if _VL_CFG_CACHE:
        return _VL_CFG_CACHE
    import subprocess

    code = (
        "import os,django,json;"
        "os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.production');"
        "django.setup();"
        "from apps.models.models import ModelProvider;"
        "p=ModelProvider.objects.get(id='62e27635-2aa1-4d73-b7a6-922443cab27c');"
        "print(json.dumps({'api_url':p.api_url,'api_key':p.api_key,'model':p.model_name}))"
    )
    out = subprocess.check_output(
        [
            "docker",
            "exec",
            "-e",
            "PYTHONPATH=/app/backend",
            "-w",
            "/app/backend",
            "ai_story-backend-1",
            "python",
            "-c",
            code,
        ],
        text=True,
        timeout=60,
    ).strip()
    # last line is JSON
    line = out.splitlines()[-1]
    cfg = json.loads(line)
    if not cfg.get("api_key") or not cfg.get("api_url"):
        raise RuntimeError("未能从容器读取视觉模型配置")
    _VL_CFG_CACHE = cfg
    return cfg


def auto_describe_shots(project_id: str, payload: dict | None = None) -> dict:
    """抽帧 + 多模态，自动填写镜头/场景/角色/动作。"""
    import importlib.util
    import sys
    import tempfile

    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    if not proj.get("shot_compare"):
        return {"ok": False, "error": "本项目未配置分镜对照"}
    payload = payload or {}
    pairs = list_shot_pairs(project_id)
    all_items = pairs.get("items") or []
    ids = payload.get("ids")
    only_missing = bool(payload.get("only_missing", True))
    force = bool(payload.get("force", False))
    limit = int(payload.get("limit") or 0)

    if ids is not None:
        idset = set(str(x) for x in ids)
        selected = [i for i in all_items if i["id"] in idset]
    else:
        selected = list(all_items)

    if only_missing and not force:
        selected = [i for i in selected if not i.get("has_desc")]
    # 空镜也可描述场景，但默认跳过无原片
    selected = [i for i in selected if i.get("has_shot") and i.get("shot_rel")]
    if limit > 0:
        selected = selected[:limit]
    if not selected:
        return {"ok": True, "count": 0, "updated": 0, "message": "没有需要描述的段", "shot_compare": pairs}

    mod_path = ROOT / "integrated" / "ai_story" / "tools" / "shot_desc_vl.py"
    spec = importlib.util.spec_from_file_location("shot_desc_vl", mod_path)
    if not spec or not spec.loader:
        return {"ok": False, "error": "缺少 shot_desc_vl.py"}
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)

    try:
        cfg = _fetch_vl_config()
    except Exception as exc:
        return {"ok": False, "error": f"读取视觉模型失败：{exc}"}

    root = _abs(proj["root"])
    path = _descs_path(proj)
    cur = _load_json(path, {"version": 1, "items": {}})
    items = dict(cur.get("items") or {})
    updated = []
    errors = []
    n = len(selected)
    update_progress(
        project_id,
        {
            "status": "running",
            "step": "describe",
            "progress": 10,
            "segment_i": 0,
            "segment_n": n,
            "message": f"正在自动描述分镜 0/{n}",
            "log": "shot describe start",
            "clear_logs": False,
        },
    )

    for idx, it in enumerate(selected, start=1):
        video = root / it["shot_rel"]
        if not video.is_file():
            errors.append({"id": it["id"], "error": "原片不存在"})
            continue
        work = Path(tempfile.mkdtemp(prefix="vs_desc_"))
        try:
            desc = mod.describe_video(
                video,
                it.get("kind") or "",
                api_url=cfg["api_url"],
                api_key=cfg["api_key"],
                model=cfg["model"],
                work=work,
                max_frames=3 if (it.get("t1") or 0) - (it.get("t0") or 0) > 2 else 2,
            )
            row = {
                "camera": desc.get("camera") or "",
                "scene": desc.get("scene") or "",
                "character": desc.get("character") or "",
                "action": desc.get("action") or "",
                "source": "auto",
                "updated_at": _now(),
                "frames": desc.get("frames") or 0,
            }
            items[it["id"]] = row
            updated.append({"id": it["id"], **{k: row[k] for k in DESC_FIELDS}})
            update_progress(
                project_id,
                {
                    "status": "running",
                    "step": "describe",
                    "progress": 10 + int(80 * idx / max(1, n)),
                    "segment_i": idx,
                    "segment_n": n,
                    "message": f"正在自动描述分镜 {idx}/{n} · {it.get('name')}",
                    "log": f"described {it['id']}",
                },
            )
            # 降低 RPM 触发概率
            import time

            time.sleep(1.2)
        except Exception as exc:
            errors.append({"id": it["id"], "error": str(exc)[:300]})
        finally:
            try:
                import shutil

                shutil.rmtree(work, ignore_errors=True)
            except Exception:
                pass

    cur["items"] = items
    cur["updated_at"] = _now()
    path.parent.mkdir(parents=True, exist_ok=True)
    _save_json(path, cur)

    update_progress(
        project_id,
        {
            "status": "idle" if not errors else "error",
            "step": "describe",
            "progress": 100 if updated else 0,
            "segment_i": len(updated),
            "segment_n": n,
            "message": f"自动描述完成：成功 {len(updated)}，失败 {len(errors)}",
            "log": f"shot describe done ok={len(updated)} err={len(errors)}",
            "error_code": "" if not errors else "describe_partial",
        },
    )
    return {
        "ok": True,
        "count": n,
        "updated": len(updated),
        "failed": len(errors),
        "items": updated,
        "errors": errors,
        "descs_file": _rel_to_root(path),
        "shot_compare": list_shot_pairs(project_id),
    }


def _annotate_packs(items: list[dict], kind_key: str = "kind", max_gap: float | None = None) -> list[dict]:
    try:
        import importlib.util
        import sys

        mod_path = ROOT / "integrated" / "ai_story" / "tools" / "segment_pack.py"
        spec = importlib.util.spec_from_file_location("segment_pack", mod_path)
        if not spec or not spec.loader:
            return items
        mod = importlib.util.module_from_spec(spec)
        # Python 3.9 dataclass 在 exec 前需要模块已登记，否则 AttributeError
        sys.modules[spec.name] = mod
        spec.loader.exec_module(mod)
        # 优化策略：同人工判断分类按时间轴拼到 5～12s（允许中间隔了其它镜头），
        # 减少包数与循环垫；manifest.parts 记清各段，生成后再按原时长切开回填。
        # max_gap=None → 不按近邻拆包。显式传入 max_gap 时仍可走旧近邻策略。
        gap = max_gap
        return mod.annotate_items_with_packs(items, kind_key=kind_key, max_gap=gap)
    except Exception:
        return items


def _issues_path(proj: dict) -> Path:
    cfg = proj.get("shot_compare") or {}
    rel = cfg.get("issues_file") or "输出/分镜问题标记.json"
    return _abs(proj["root"]) / rel


def _reswap_queue_path(proj: dict) -> Path:
    cfg = proj.get("shot_compare") or {}
    rel = cfg.get("reswap_queue_file") or "输出/分镜重跑队列.json"
    return _abs(proj["root"]) / rel


def _load_issues(proj: dict) -> dict:
    path = _issues_path(proj)
    data = _load_json(path, {"version": 1, "items": {}})
    if not isinstance(data.get("items"), dict):
        data["items"] = {}
    return data


def _save_issues(proj: dict, data: dict) -> None:
    path = _issues_path(proj)
    path.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = _now()
    _save_json(path, data)


def _parse_range_name(name: str) -> tuple[float | None, float | None]:
    m = re.match(r"^(\d+\.\d+)-(\d+\.\d+)\.mp4$", name, re.I)
    if not m:
        return None, None
    return float(m.group(1)), float(m.group(2))


def list_shot_pairs(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在", "items": [], "kinds": [], "issue_types": ISSUE_TYPES}
    cfg = proj.get("shot_compare")
    if not cfg:
        return {
            "ok": True,
            "enabled": False,
            "items": [],
            "kinds": [],
            "issue_types": ISSUE_TYPES,
            "marked_count": 0,
            "message": "本项目未配置分镜对照（shot_compare）",
        }
    root = _abs(proj["root"])
    issues = _load_issues(proj).get("items") or {}
    items: list[dict] = []

    if cfg.get("mode") == "pairs":
        for pair in cfg.get("pairs") or []:
            shot_rel = pair.get("shot") or ""
            gen_rel = pair.get("generated") or ""
            shot_p = root / shot_rel
            gen_p = root / gen_rel
            sid = str(pair.get("id") or f"{pair.get('kind')}:{Path(shot_rel).name}")
            issue = issues.get(sid) or {}
            items.append(
                {
                    "id": sid,
                    "kind": pair.get("kind") or "分段",
                    "label": pair.get("label") or Path(shot_rel).stem,
                    "name": Path(shot_rel).name,
                    "t0": None,
                    "t1": None,
                    "shot_rel": shot_rel.replace("\\", "/") if shot_p.is_file() else "",
                    "gen_rel": gen_rel.replace("\\", "/") if gen_p.is_file() else "",
                    "has_shot": shot_p.is_file(),
                    "has_gen": gen_p.is_file(),
                    "marked": bool(issue.get("marked")),
                    "issue_type": issue.get("issue_type") or "",
                    "note": issue.get("note") or "",
                    "updated_at": issue.get("updated_at") or "",
                    "prompt": "",
                }
            )
    else:
        kinds = cfg.get("kinds") or ["仅角色一", "仅角色二", "双人同屏", "空镜"]
        shot_root = root / (cfg.get("shot_root") or "原片分镜")
        gen_roots = [root / r for r in (cfg.get("gen_roots") or ["输出/分段替换"])]
        for kind in kinds:
            shot_dir = shot_root / kind
            if not shot_dir.is_dir():
                continue
            for shot_p in sorted(shot_dir.glob("*.mp4")):
                gen_p = None
                gen_rel = ""
                for gr in gen_roots:
                    cand = gr / kind / shot_p.name
                    if cand.is_file():
                        gen_p = cand
                        try:
                            gen_rel = cand.relative_to(root).as_posix()
                        except ValueError:
                            gen_rel = cand.name
                        break
                t0, t1 = _parse_range_name(shot_p.name)
                try:
                    shot_rel = shot_p.relative_to(root).as_posix()
                except ValueError:
                    shot_rel = shot_p.name
                sid = f"{kind}/{shot_p.name}"
                issue = issues.get(sid) or {}
                items.append(
                    {
                        "id": sid,
                        "kind": kind,
                        "label": f"{kind} · {shot_p.stem}",
                        "name": shot_p.name,
                        "t0": t0,
                        "t1": t1,
                        "shot_rel": shot_rel,
                        "gen_rel": gen_rel,
                        "has_shot": True,
                        "has_gen": bool(gen_p and gen_p.is_file()),
                        "marked": bool(issue.get("marked")),
                        "issue_type": issue.get("issue_type") or "",
                        "note": issue.get("note") or "",
                        "updated_at": issue.get("updated_at") or "",
                        "prompt": "",
                    }
                )

    _attach_descs(project_id, items)
    _attach_judges(project_id, items)
    # 拼包按人工判断分类（改判后与送方舟一致），空镜跳过
    items = _annotate_packs(items, kind_key="human_kind")
    prompt_data = load_prompts(project_id)
    overrides = prompt_data.get("overrides") or {}
    defaults = prompt_data.get("defaults") or DEFAULT_PROMPTS
    for it in items:
        sid = it["id"]
        kind = it.get("kind") or ""
        it["prompt"] = overrides.get(sid) or defaults.get(kind) or DEFAULT_PROMPTS.get(kind) or ""
        it["prompt_overridden"] = sid in overrides

    # sort by t0 then kind
    def _sk(it: dict):
        return (it.get("t0") is None, it.get("t0") or 0, it.get("kind") or "", it.get("name") or "")

    items.sort(key=_sk)
    marked = [i for i in items if i.get("marked")]
    judged_diff = [i for i in items if i.get("human_kind_overridden")]
    noted = [i for i in items if str(i.get("note") or "").strip()]
    cfg_kinds = (cfg.get("kinds") or []) if isinstance(cfg, dict) else []
    kinds_present = []
    for k in cfg_kinds:
        if any(i.get("kind") == k for i in items) and k not in kinds_present:
            kinds_present.append(k)
    for i in items:
        if i["kind"] not in kinds_present:
            kinds_present.append(i["kind"])
    return {
        "ok": True,
        "enabled": True,
        "items": items,
        "kinds": kinds_present,
        "issue_types": ISSUE_TYPES,
        "marked_count": len(marked),
        "judge_diff_count": len(judged_diff),
        "note_count": len(noted),
        "total": len(items),
        "missing_gen": sum(1 for i in items if not i.get("has_gen")),
        "issues_file": _rel_to_root(_issues_path(proj)),
        "prompts_file": _rel_to_root(_prompts_path(proj)),
        "descs_file": _rel_to_root(_descs_path(proj)),
        "judges_file": _rel_to_root(_judges_path(proj)),
        "human_kind_options": HUMAN_KIND_OPTIONS,
        "pack_note": "优化拼包：同人工判断分类按时间轴拼到 5～12s（允许中间隔其它镜头）；不够才循环垫。manifest.parts 记录各段，生成后按原时长切开回填。",
        "ark_packs": list_ark_send_packs(project_id),
        "gates": get_workflow_gates(project_id),
    }


def save_shot_issues(project_id: str, payload: dict | None = None) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    if not proj.get("shot_compare"):
        return {"ok": False, "error": "本项目未配置分镜对照"}
    payload = payload or {}
    data = _load_issues(proj)
    items = dict(data.get("items") or {})
    desc_bulk: dict = {}
    judge_bulk: dict = {}
    # bulk: { items: { id: {marked, note, issue_type} } } or single
    bulk = payload.get("items")
    if isinstance(bulk, dict):
        for sid, body in bulk.items():
            if not isinstance(body, dict):
                continue
            cur = dict(items.get(sid) or {})
            if "marked" in body:
                cur["marked"] = bool(body["marked"])
            if "note" in body:
                cur["note"] = str(body["note"] or "")
            if "issue_type" in body:
                cur["issue_type"] = str(body["issue_type"] or "")
            if "prompt" in body:
                _save_prompt_if_needed(project_id, sid, body.get("prompt") or "", str(body.get("kind") or ""))
            if any(k in body for k in DESC_FIELDS):
                desc_bulk[sid] = {
                    "source": body.get("desc_source") or body.get("source") or "manual",
                    **{k: body.get(k) or "" for k in DESC_FIELDS if k in body},
                }
            if "human_kind" in body:
                judge_bulk[sid] = {
                    "human_kind": body.get("human_kind") or "",
                    "source": "manual",
                }
            cur["updated_at"] = _now()
            if cur.get("marked") or cur.get("note") or cur.get("issue_type"):
                items[sid] = cur
            elif sid in items:
                del items[sid]
    elif payload.get("id"):
        sid = str(payload["id"])
        cur = dict(items.get(sid) or {})
        if "marked" in payload:
            cur["marked"] = bool(payload["marked"])
        if "note" in payload:
            cur["note"] = str(payload["note"] or "")
        if "issue_type" in payload:
            cur["issue_type"] = str(payload["issue_type"] or "")
        if "prompt" in payload:
            _save_prompt_if_needed(project_id, sid, payload.get("prompt") or "", str(payload.get("kind") or ""))
        if any(k in payload for k in DESC_FIELDS):
            desc_bulk[sid] = {
                "source": payload.get("desc_source") or payload.get("source") or "manual",
                **{k: payload.get(k) or "" for k in DESC_FIELDS if k in payload},
            }
        if "human_kind" in payload:
            judge_bulk[sid] = {"human_kind": payload.get("human_kind") or "", "source": "manual"}
        cur["updated_at"] = _now()
        if cur.get("marked") or cur.get("note") or cur.get("issue_type"):
            items[sid] = cur
        elif sid in items:
            del items[sid]
    else:
        return {"ok": False, "error": "缺少 items 或 id"}
    data["items"] = items
    # 闸门1：保存标记即视为完成分镜对照审核
    data["shot_review_confirmed_at"] = _now()
    _save_issues(proj, data)
    jpath = _judges_path(proj)
    judges = _load_json(jpath, {"version": 1, "items": {}})
    judges["review_confirmed_at"] = data["shot_review_confirmed_at"]
    if judge_bulk or judges.get("items") is not None:
        _save_json(jpath, judges)
    if desc_bulk:
        save_shot_descs(project_id, {"items": desc_bulk})
    if judge_bulk:
        save_shot_judges(project_id, {"items": judge_bulk})
        # save_shot_judges 可能覆盖 review_confirmed_at，再写回
        judges2 = _load_json(jpath, {"version": 1, "items": {}})
        judges2["review_confirmed_at"] = data["shot_review_confirmed_at"]
        _save_json(jpath, judges2)
    return {
        "ok": True,
        "shot_compare": list_shot_pairs(project_id),
        "gates": get_workflow_gates(project_id),
        "shot_review_confirmed_at": data["shot_review_confirmed_at"],
    }


# ---------- 送方舟拼包（按人工判断，先合成不送）----------

ARK_SEND_KINDS = ["角色一", "角色二", "双人同屏"]
# 人工判断「双人同镜」落盘到「双人同屏」目录，与用户 tab 文案一致
_ARK_HUMAN_TO_FOLDER = {
    "角色一": "角色一",
    "角色二": "角色二",
    "双人同镜": "双人同屏",
    "双人同屏": "双人同屏",
}
# 分镜目录名（含「仅…」前缀的真实目录）→ 送方舟包目录名
_ARK_KIND_TO_FOLDER = {
    "角色一": "角色一",
    "仅角色一": "角色一",
    "角色二": "角色二",
    "仅角色二": "角色二",
    "双人同镜": "双人同屏",
    "双人同屏": "双人同屏",
}
# 空镜类分类：按契约不送方舟，拼轨直接用原片
_ARK_EMPTY_KINDS = {"空镜", "空景", "empty", "none"}
_ARK_MIN_SEC = 5.0
_ARK_MAX_SEC = 12.0

# PRD v2：对照验收标记 / 风险关键词 / 默认 look
ARK_QA_MARKS = [
    {"id": "ok", "label": "可用"},
    {"id": "orient_wrong", "label": "朝向错误"},
    {"id": "scene_drift", "label": "换景"},
    {"id": "sensitive", "label": "敏感"},
    {"id": "portrait", "label": "肖像化"},
]
_RISK_KEYWORDS = {
    "back_facing": ("背对", "背身", "背面", "后背", "背向", "背蹲"),
    "low_angle": ("低角度", "仰拍", "从下往上", "胯下"),
    "sensitive_pose": ("蹲姿", "开腿", "紧身", "臀部", "敏感", "低角度背"),
    "copyright_risk": ("版权", "IP", "撞车"),
}
_LOOK_DEFAULT = {
    "角色一": "角色一_过审向_仅配色",
    "角色二": "角色二_过审向_仅配色",
    "双人同屏": "双人_过审向_仅配色",
}
_LOOK_SAFE = {
    "角色一": "角色一_过审向_打底",
    "角色二": "角色二_过审向_打底",
    "双人同屏": "双人_过审向_打底",
}


def classify_ark_error(message: "str | dict") -> dict:
    """
    PRD §6：失败分类 → error_code + 默认处置说明。
    兼容生成脚本落盘的结构化错误对象（dict）：直接取 error_code/disposition，不再二次猜。
    """
    if isinstance(message, dict):
        raw = str(message.get("raw") or message.get("message") or "")[:400]
        return {
            "error_code": str(message.get("error_code") or "ARK_UNKNOWN"),
            "disposition": str(message.get("disposition") or "查日志后按包重试或入重送队列"),
            "raw": raw,
            "pack_id": str(message.get("pack_id") or ""),
            "part_id": str(message.get("part_id") or ""),
            "look_set": str(message.get("look_set") or ""),
            "send_mode": str(message.get("send_mode") or ""),
            "ts": str(message.get("ts") or ""),
        }
    msg = str(message or "")
    low = msg.lower()
    rules = [
        (
            "InputVideoSensitiveContentDetected",
            ("InputVideoSensitiveContentDetected", "InputVideoSensitive", "输入视频敏感"),
            "降敏预处理 / 逐段送 / 打底定妆；禁止去掉 reference_video",
        ),
        (
            "OutputVideoSensitive",
            ("OutputVideoSensitive", "PolicyViolation", "输出版权", "输出敏感"),
            "换过审/打底定妆；弱化 IP；必要时死段保留",
        ),
        (
            "InvalidVideoUrl",
            ("Invalid video_url", "invalid video_url", "resource download failed", "上传失败", "litterbox"),
            "切换上传通道或隧道后重试",
        ),
        (
            "OrientTwist",
            ("朝向拧断", "正背颠倒", "上下身", "orient"),
            "背身补丁 + 背面参考优先；单段重送",
        ),
        (
            "PortraitDrift",
            ("办公室", "肖像", "定妆站姿", "portrait"),
            "查是否丢掉视频参考；加强动作锁；禁办公室暗示套用",
        ),
        (
            "CrossCutJump",
            ("跨镜", "切段错误", "硬切"),
            "回闸门1重审硬切",
        ),
    ]
    for code, needles, disposition in rules:
        if any(n.lower() in low or n in msg for n in needles):
            return {"error_code": code, "disposition": disposition, "raw": msg[:400]}
    if "敏感" in msg:
        return {
            "error_code": "InputVideoSensitiveContentDetected",
            "disposition": "降敏预处理 / 逐段送 / 打底定妆；禁止去掉 reference_video",
            "raw": msg[:400],
        }
    return {"error_code": "ARK_UNKNOWN", "disposition": "查日志后按包重试或入重送队列", "raw": msg[:400]}


def _infer_risk_tags(parts: list[dict], shot_lookup: dict | None = None, kind: str = "") -> list[str]:
    tags: set[str] = set()
    shot_lookup = shot_lookup or {}
    if kind == "双人同屏":
        tags.add("dual")
    for p in parts or []:
        try:
            dur = float(p.get("dur")) if p.get("dur") is not None else None
        except (TypeError, ValueError):
            dur = None
        if dur is not None and dur < 2.0:
            tags.add("short_clip")
        sid = str(p.get("id") or "")
        it = shot_lookup.get(sid) or {}
        blob = " ".join(
            str(it.get(k) or "")
            for k in ("character", "action", "note", "camera", "scene", "issue_type")
        )
        blob += " " + str(p.get("name") or "")
        for tag, kws in _RISK_KEYWORDS.items():
            if any(k in blob for k in kws):
                tags.add(tag)
    return sorted(tags)


def _recommend_look_set(kind: str, risk_tags: list[str]) -> str:
    risky = bool({"sensitive_pose", "copyright_risk", "low_angle"} & set(risk_tags or []))
    table = _LOOK_SAFE if risky else _LOOK_DEFAULT
    return table.get(kind) or _LOOK_DEFAULT.get(kind) or ""


def _recommend_send_mode(risk_tags: list[str]) -> str:
    tags = set(risk_tags or [])
    if tags & {"sensitive_pose", "back_facing", "short_clip", "low_angle"}:
        if "sensitive_pose" in tags or ("back_facing" in tags and "short_clip" in tags):
            return "per_part"
    return "pack"


def _recommend_patch(risk_tags: list[str]) -> str:
    tags = set(risk_tags or [])
    if "back_facing" in tags or "orient_wrong" in tags:
        return "提示词/分段补丁_背身蹲姿转头.txt"
    return ""


def get_workflow_gates(project_id: str) -> dict:
    """两道人工闸门状态（不触发重 IO 列表）。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    issues = _load_issues(proj)
    judges = _load_json(_judges_path(proj), {})
    # 兼容旧项目：曾保存过判断/标记也算过闸门1
    shot_at = str(
        issues.get("shot_review_confirmed_at")
        or judges.get("review_confirmed_at")
        or judges.get("updated_at")
        or issues.get("updated_at")
        or ""
    ).strip()
    shot_ok = bool(shot_at)
    ark = _ark_root(proj)
    manifest_path = ark / "manifest.json"
    manifest = _load_json(manifest_path, {}) if manifest_path.is_file() else {}
    packs = manifest.get("packs") if isinstance(manifest.get("packs"), dict) else {}
    packs_ok = bool(packs)
    ark_at = str(manifest.get("ark_review_confirmed_at") or "").strip()
    ark_ok = bool(ark_at) and packs_ok
    return {
        "ok": True,
        "shot_review": {
            "ok": shot_ok,
            "at": shot_at,
            "reason": "" if shot_ok else "闸门1未过：请先在「分镜对照」点「保存标记」确认审核",
        },
        "packs_built": {
            "ok": packs_ok,
            "count": len(packs),
            "reason": "" if packs_ok else "尚未拼包：请先点「按人工判断拼包」",
        },
        "ark_review": {
            "ok": ark_ok,
            "at": ark_at,
            "reason": ""
            if ark_ok
            else ("闸门2未过：请逐包复查后点「确认包已审，可送方舟」" if packs_ok else "请先拼包再复查确认"),
        },
        "can_build": shot_ok,
        "can_send": ark_ok,
        "qa_marks": ARK_QA_MARKS,
        "require_reference_video": True,
    }


def confirm_shot_review(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    data = _load_issues(proj)
    data["shot_review_confirmed_at"] = _now()
    _save_issues(proj, data)
    jpath = _judges_path(proj)
    judges = _load_json(jpath, {"version": 1, "items": {}})
    judges["review_confirmed_at"] = data["shot_review_confirmed_at"]
    _save_json(jpath, judges)
    return {"ok": True, "gates": get_workflow_gates(project_id), "at": data["shot_review_confirmed_at"]}


def confirm_ark_review(project_id: str, payload: dict | None = None) -> dict:
    """闸门2：逐包复查通过。包与分镜清单不一致只告警，不阻断（可用单包补送定点修复）。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    force = bool(payload.get("force"))
    ark = _ark_root(proj)
    manifest_path = ark / "manifest.json"
    if not manifest_path.is_file():
        return {"ok": False, "error": "还没有拼包，无法确认闸门2"}
    manifest = _load_json(manifest_path, {})
    if not (manifest.get("packs") or {}):
        return {"ok": False, "error": "manifest 无包，请先拼包"}
    coverage = validate_pack_coverage(project_id)
    warnings: list[str] = []
    if not coverage.get("ok"):
        # 覆盖不一致已降级为「警告」，不再阻断闸门2。
        # 理由：缺段/过期多数是历史打包残留，整批重打包代价远高于定点补送；
        # 缺的那些段可以在送完之后用「单包补送」逐个补，不需要推倒重来。
        bit = coverage.get("reason") or ""
        if coverage.get("missing"):
            bit += f" 缺段示例：{'、'.join(coverage.get('missing') or [])}"
        warnings.append("分镜覆盖不一致（警告，已放行）：" + bit)
    manifest["ark_review_confirmed_at"] = _now()
    manifest["updated_at"] = _now()
    # 留痕：确认当时到底带着什么不一致过的闸门，便于事后追责
    manifest["coverage_ack"] = {
        "ok": bool(coverage.get("ok")),
        "missing_count": int(coverage.get("missing_count") or 0),
        "dup_count": int(coverage.get("dup_count") or 0),
        "extra_count": int(coverage.get("extra_count") or 0),
        "at": _now(),
    }
    _save_json(manifest_path, manifest)
    return {
        "ok": True,
        "gates": get_workflow_gates(project_id),
        "at": manifest["ark_review_confirmed_at"],
        "coverage": coverage,
        "warnings": warnings,
        "ark_packs": list_ark_send_packs(project_id),
    }


def _pack_qa_path(proj: dict) -> Path:
    return _ark_root(proj) / "pack_qa.json"


def _load_pack_qa(proj: dict) -> dict:
    data = _load_json(_pack_qa_path(proj), {"version": 1, "items": {}})
    if not isinstance(data.get("items"), dict):
        data["items"] = {}
    return data


def save_ark_pack_qa(project_id: str, payload: dict | None = None) -> dict:
    """包级对照验收标记（朝向错误/换景/敏感/可用…）。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    rel = str(payload.get("rel") or payload.get("id") or payload.get("pack_rel") or "").strip()
    if not rel:
        return {"ok": False, "error": "缺少 pack rel"}
    mark = str(payload.get("mark") or "").strip()
    valid = {m["id"] for m in ARK_QA_MARKS}
    if mark and mark not in valid:
        return {"ok": False, "error": f"未知标记：{mark}，可选 {sorted(valid)}"}
    data = _load_pack_qa(proj)
    items = dict(data.get("items") or {})
    if not mark:
        items.pop(rel, None)
    else:
        items[rel] = {
            "mark": mark,
            "note": str(payload.get("note") or ""),
            "updated_at": _now(),
        }
    data["items"] = items
    data["updated_at"] = _now()
    path = _pack_qa_path(proj)
    path.parent.mkdir(parents=True, exist_ok=True)
    _save_json(path, data)
    return {"ok": True, "items": items, "ark_packs": list_ark_send_packs(project_id)}


def queue_ark_resend(project_id: str, payload: dict | None = None) -> dict:
    """写入重送队列（look/补丁/整包|逐段/降敏），供脚本或后台消费。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    rel = str(payload.get("rel") or payload.get("id") or "").strip()
    if not rel:
        return {"ok": False, "error": "缺少 pack rel"}
    ark = _ark_root(proj)
    manifest = _load_json(ark / "manifest.json", {}) if (ark / "manifest.json").is_file() else {}
    meta = ((manifest.get("packs") or {}).get(rel)) or {}
    risk_tags = list(meta.get("risk_tags") or payload.get("risk_tags") or [])
    look_set = str(payload.get("look_set") or meta.get("look_set") or _recommend_look_set(str(meta.get("kind") or ""), risk_tags))
    send_mode = str(payload.get("send_mode") or meta.get("send_mode") or _recommend_send_mode(risk_tags))
    patch = str(payload.get("patch") or _recommend_patch(risk_tags))
    sanitize = bool(payload.get("sanitize"))
    row = {
        "rel": rel,
        "pack_id": meta.get("pack_id") or "",
        "kind": meta.get("kind") or "",
        "look_set": look_set,
        "send_mode": send_mode,
        "patch": patch,
        "sanitize": sanitize,
        "risk_tags": risk_tags,
        "require_reference_video": True,
        "note": str(payload.get("note") or ""),
        "queued_at": _now(),
        "status": "queued",
    }
    qpath = ark / "resend_queue.json"
    qdata = _load_json(qpath, {"version": 1, "items": []})
    items = list(qdata.get("items") or [])
    items = [x for x in items if not (isinstance(x, dict) and x.get("rel") == rel and x.get("status") == "queued")]
    items.append(row)
    qdata["items"] = items
    qdata["updated_at"] = _now()
    _save_json(qpath, qdata)
    # 同步写回 manifest 包级策略偏好
    if meta and isinstance(manifest.get("packs"), dict):
        packs = dict(manifest["packs"])
        cur = dict(packs.get(rel) or meta)
        cur["look_set"] = look_set
        cur["send_mode"] = send_mode
        cur["risk_tags"] = risk_tags
        if patch:
            cur["patch"] = patch
        packs[rel] = cur
        manifest["packs"] = packs
        manifest["updated_at"] = _now()
        _save_json(ark / "manifest.json", manifest)
    return {"ok": True, "item": row, "queue_len": len(items), "path": _rel_to_root(qpath)}


def _ark_root(proj: dict) -> Path:
    cfg = proj.get("shot_compare") or {}
    rel = cfg.get("ark_packs_dir") or "输出/送方舟"
    return _abs(proj["root"]) / rel


def _ark_shot_root(proj: dict) -> Path:
    """原片分镜根目录（shot_compare.shot_root 可配）。"""
    cfg = proj.get("shot_compare") or {}
    return _abs(proj["root"]) / (cfg.get("shot_root") or "原片分镜")


def _ark_kinds(proj: dict) -> list[str]:
    """
    送方舟分类（= 输出/送方舟 下的包目录名），按真实项目数据推导，不再硬编码：
    1) shot_compare.kinds 排除空镜后映射成包目录名（仅角色一 → 角色一）；
    2) 扫描 _ark_root 下真实存在的子目录；
    3) 兜底 ARK_SEND_KINDS。
    """
    cfg = proj.get("shot_compare") or {}
    out: list[str] = []
    for k in cfg.get("kinds") or []:
        if str(k) in _ARK_EMPTY_KINDS:
            continue
        folder = _ARK_KIND_TO_FOLDER.get(str(k))
        if folder and folder not in out:
            out.append(folder)
    if out:
        return out
    ark = _ark_root(proj)
    if ark.is_dir():
        found: list[str] = []
        for sub in ark.iterdir():
            name = sub.name
            if not sub.is_dir() or name.startswith("_") or name in _ARK_EMPTY_KINDS:
                continue
            if name not in found:
                found.append(name)
        # 已知分类按既有顺序优先，其余按目录名追加
        out = [k for k in ARK_SEND_KINDS if k in found] + [k for k in sorted(found) if k not in ARK_SEND_KINDS]
    if out:
        return out
    return list(ARK_SEND_KINDS)


def _ark_folder_for(human_kind: str, kinds: list[str] | None = None) -> str:
    """人工判断/初分目录名 → 送方舟包目录名；空镜等无法映射的返回空串（调用方跳过）。"""
    hk = str(human_kind or "").strip()
    if not hk or hk in _ARK_EMPTY_KINDS:
        return ""
    folder = _ARK_HUMAN_TO_FOLDER.get(hk) or _ARK_KIND_TO_FOLDER.get(hk) or ""
    if not folder:
        folder = hk
    if kinds and folder not in kinds:
        return ""
    return folder


def _expected_shot_ids(proj: dict) -> tuple[list[str], dict]:
    """
    「原片分镜」里所有需要送方舟的段（排除空镜）→ (ids, id→kind)。
    ids 与 list_shot_pairs 的 id 规则一致：dirs 模式为 "<分类>/<文件名>"。
    """
    cfg = proj.get("shot_compare") or {}
    ids: list[str] = []
    kind_of: dict[str, str] = {}
    if cfg.get("mode") == "pairs":
        for pair in cfg.get("pairs") or []:
            shot_rel = str(pair.get("shot") or "")
            sid = str(pair.get("id") or f"{pair.get('kind')}:{Path(shot_rel).name}")
            ids.append(sid)
            kind_of[sid] = str(pair.get("kind") or "")
        return ids, kind_of
    shot_root = _ark_shot_root(proj)
    kinds = cfg.get("kinds")
    if not kinds:
        kinds = sorted(
            d.name
            for d in shot_root.iterdir()
            if d.is_dir() and not d.name.startswith("_")
        ) if shot_root.is_dir() else []
    for k in kinds:
        if str(k) in _ARK_EMPTY_KINDS:
            continue
        d = shot_root / str(k)
        if not d.is_dir():
            continue
        for p in sorted(d.glob("*.mp4")):
            sid = f"{k}/{p.name}"
            ids.append(sid)
            kind_of[sid] = str(k)
    return ids, kind_of


def _manifest_covered_ids(manifest: dict) -> tuple[list[str], dict]:
    """manifest 所有 packs[].parts[].id 的展开（含重复），以及 pack_rel → part ids。"""
    all_ids: list[str] = []
    per_pack: dict[str, list[str]] = {}
    packs = (manifest or {}).get("packs")
    if not isinstance(packs, dict):
        return all_ids, per_pack
    for rel, meta in packs.items():
        if not isinstance(meta, dict):
            continue
        cur: list[str] = []
        for pt in meta.get("parts") or []:
            if isinstance(pt, str):
                pid = pt
            else:
                pid = str((pt or {}).get("id") or "").strip()
                if not pid:
                    folder = str((pt or {}).get("folder") or "").strip()
                    name = str((pt or {}).get("name") or "").strip()
                    pid = f"{folder}/{name}" if folder and name else name
            if not pid:
                continue
            cur.append(pid)
            all_ids.append(pid)
        per_pack[str(rel)] = cur
    return all_ids, per_pack


def validate_pack_coverage(project_id: str) -> dict:
    """
    包与分镜清单一致性校验：manifest 的 parts 是否完整、无重复、不过期地覆盖「原片分镜」。
    空镜按契约不送方舟，不计入 expected。ok = 无缺失 + 无重复 + 无过期。
    """
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在", "expected_count": 0, "covered_count": 0}
    if not proj.get("shot_compare"):
        return {
            "ok": True,
            "skipped": True,
            "expected_count": 0,
            "covered_count": 0,
            "missing": [],
            "dup": [],
            "extra": [],
            "reason": "本项目未配置分镜对照，跳过覆盖校验",
        }
    ark = _ark_root(proj)
    manifest_path = ark / "manifest.json"
    manifest = _load_json(manifest_path, {}) if manifest_path.is_file() else {}
    if not isinstance(manifest.get("packs"), dict) or not manifest.get("packs"):
        # 还没拼包：不是「覆盖不完整」，交给既有闸门提示，避免新增噪音阻断
        return {
            "ok": False,
            "skipped": True,
            "expected_count": len(_expected_shot_ids(proj)[0]),
            "covered_count": 0,
            "missing": [],
            "missing_count": 0,
            "extra": [],
            "extra_count": 0,
            "dup": [],
            "dup_count": 0,
            "packs": 0,
            "parts_total": 0,
            "by_kind": {},
            "manifest": _rel_to_root(manifest_path) if manifest_path.is_file() else "",
            "reason": "尚未拼包：manifest 里还没有包，请先「按人工判断拼包」",
        }
    expected, kind_of = _expected_shot_ids(proj)
    all_ids, per_pack = _manifest_covered_ids(manifest)
    exp_set = set(expected)
    cov_set = set(all_ids)
    counts: dict[str, int] = {}
    for sid in all_ids:
        counts[sid] = counts.get(sid, 0) + 1
    missing = sorted(exp_set - cov_set)
    extra = sorted(cov_set - exp_set)
    dup = sorted(sid for sid, n in counts.items() if n > 1)
    ok = not missing and not dup and not extra
    reason = ""
    if not ok:
        bits = []
        if missing:
            bits.append(f"缺 {len(missing)} 段")
        if dup:
            bits.append(f"重复 {len(dup)} 段")
        if extra:
            bits.append(f"过期 {len(extra)} 段（manifest 里有但原片分镜已不存在）")
        reason = (
            "、".join(bits)
            + "。请先回「分镜对照」保存标记 → 重新「按人工判断拼包」，再确认闸门2送方舟。"
        )
    return {
        "ok": ok,
        "expected_count": len(exp_set),
        "covered_count": len(cov_set),
        "expected": sorted(exp_set),
        "missing": missing[:20],
        "missing_count": len(missing),
        "extra": extra[:20],
        "extra_count": len(extra),
        "dup": dup[:20],
        "dup_count": len(dup),
        "packs": len(per_pack),
        "parts_total": len(all_ids),
        "by_kind": {
            k: sum(1 for s in exp_set if kind_of.get(s) == k)
            for k in sorted({kind_of.get(s, "") for s in exp_set})
        },
        "manifest": _rel_to_root(manifest_path) if manifest_path.is_file() else "",
        "reason": reason,
    }


def _ffprobe_dur(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1",
            str(path),
        ],
        text=True,
    ).strip()
    return float(out)


def _ffmpeg_concat(clips: list[Path], dest: Path) -> float:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if len(clips) == 1:
        import shutil

        shutil.copy2(clips[0], dest)
        return _ffprobe_dur(dest)
    lst = dest.with_suffix(".concat.txt")
    lst.write_text("".join(f"file '{c.resolve().as_posix()}'\n" for c in clips), encoding="utf-8")
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
            "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(dest),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return _ffprobe_dur(dest)


def _ffmpeg_pad_loop(src: Path, dest: Path, min_sec: float = _ARK_MIN_SEC) -> float:
    dur = _ffprobe_dur(src)
    if dur >= min_sec - 0.05:
        import shutil

        shutil.copy2(src, dest)
        return dur
    loops = int(min_sec / max(dur, 0.01)) + 1
    lst = dest.with_suffix(".pad.txt")
    lst.write_text("".join(f"file '{src.resolve().as_posix()}'\n" for _ in range(loops)), encoding="utf-8")
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
            "-t", f"{min_sec:.3f}",
            "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(dest),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return _ffprobe_dur(dest)


def _resolve_gen_clip(root: Path, part: dict, gen_roots: list[Path]) -> Path | None:
    """
    按 pack part 找回 输出/分段替换 下的生成段。
    兜底搜索必须限定 sub.name == folder，否则会把「仅角色一」的段当成「仅角色二」的生成结果。
    """
    sid = str(part.get("id") or "").replace("\\", "/").strip()
    name = str(part.get("name") or "").strip()
    folder = str(part.get("folder") or "").strip()
    candidates: list[Path] = []
    if sid:
        for gr in gen_roots:
            candidates.append(gr / sid)
    if folder and name:
        for gr in gen_roots:
            candidates.append(gr / folder / name)
    if name:
        # 兜底：在各 gen_root 下按文件名搜一层分类目录（分类目录必须匹配，避免张冠李戴）
        for gr in gen_roots:
            if not gr.is_dir():
                continue
            for sub in gr.iterdir():
                if not sub.is_dir():
                    continue
                if folder and sub.name != folder:
                    continue
                candidates.append(sub / name)
    for cand in candidates:
        try:
            if cand.is_file() and cand.stat().st_size >= 1000:
                return cand
        except OSError:
            continue
    return None


def _ark_gen_compare_rel(root: Path, ark: Path, pack_rel: str) -> str:
    """
    对照片相对项目根的路径：与送方舟包平行，位于 <送方舟>/_gen_compare/ 下。
    基于 _ark_root 计算，不再硬编码中文目录名（ark_packs_dir 改名后依然正确）。
    """
    rel_posix = str(pack_rel or "").replace("\\", "/").lstrip("/")
    try:
        ark_rel = ark.resolve().relative_to(root.resolve()).as_posix()
    except (ValueError, OSError):
        ark_rel = "输出/送方舟"
    ark_rel = ark_rel.strip("/")
    if ark_rel and rel_posix.startswith(ark_rel + "/"):
        rest = rel_posix[len(ark_rel) + 1:]
    else:
        rest = Path(rel_posix).name
    return f"{ark_rel}/_gen_compare/{rest}" if ark_rel else f"_gen_compare/{rest}"


def _ensure_ark_pack_gen_compare(
    root: Path,
    pack_rel: str,
    parts: list[dict],
    gen_roots: list[Path],
    ark: Path | None = None,
) -> dict:
    """
    把已回填的各 part 生成段按顺序拼成对照片，供「送方舟的视频」左右对照。
    输出：<送方舟>/_gen_compare/<原相对路径>
    """
    n = len(parts or [])
    if n <= 0:
        return {"has_gen": False, "gen_rel": "", "gen_ready": 0, "gen_total": 0, "gen_missing": []}
    clips: list[Path] = []
    missing: list[str] = []
    for pt in parts:
        hit = _resolve_gen_clip(root, pt if isinstance(pt, dict) else {"name": pt}, gen_roots)
        if hit is None:
            missing.append(str((pt or {}).get("id") or (pt or {}).get("name") or pt))
        else:
            clips.append(hit)
    ready = len(clips)
    if ready < n or not clips:
        return {
            "has_gen": False,
            "gen_rel": "",
            "gen_ready": ready,
            "gen_total": n,
            "gen_missing": missing[:12],
        }

    # 对照片路径与参考包平行，放在 _gen_compare 下
    # 输出/送方舟/角色一/xxx.mp4 → 输出/送方舟/_gen_compare/角色一/xxx.mp4
    rel_posix = str(pack_rel or "").replace("\\", "/")
    gen_rel = _ark_gen_compare_rel(root, ark or (root / "输出" / "送方舟"), rel_posix)
    dest = root / gen_rel
    dest.parent.mkdir(parents=True, exist_ok=True)

    newest = max((c.stat().st_mtime for c in clips), default=0)
    need_build = (not dest.is_file()) or dest.stat().st_mtime < newest - 0.5 or dest.stat().st_size < 1000
    if need_build:
        try:
            if len(clips) == 1:
                import shutil

                shutil.copy2(clips[0], dest)
            else:
                _ffmpeg_concat(clips, dest)
        except Exception as exc:
            return {
                "has_gen": False,
                "gen_rel": "",
                "gen_ready": ready,
                "gen_total": n,
                "gen_missing": missing[:12],
                "gen_error": str(exc)[:200],
            }
    return {
        "has_gen": dest.is_file() and dest.stat().st_size >= 1000,
        "gen_rel": gen_rel if dest.is_file() else "",
        "gen_ready": ready,
        "gen_total": n,
        "gen_missing": [],
    }


def list_ark_send_packs(project_id: str) -> dict:
    """读取已合成的送方舟片段（不触发方舟）；已回填的附带生成对照片路径。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在", "items": [], "kinds": ARK_SEND_KINDS}
    root = _abs(proj["root"])
    ark = _ark_root(proj)
    kinds = _ark_kinds(proj)
    manifest_path = ark / "manifest.json"
    manifest = _load_json(manifest_path, {}) if manifest_path.is_file() else {}
    cfg = proj.get("shot_compare") or {}
    gen_roots = [root / r for r in (cfg.get("gen_roots") or ["输出/分段替换_v2", "输出/分段替换"])]
    qa_items = _load_pack_qa(proj).get("items") or {}
    gates = get_workflow_gates(project_id)
    items: list[dict] = []
    for folder in kinds:
        d = ark / folder
        if not d.is_dir():
            continue
        for p in sorted(d.glob("*.mp4")):
            rel = p.relative_to(root).as_posix()
            meta = ((manifest.get("packs") or {}).get(rel)) or {}
            try:
                dur = float(meta.get("duration") or 0)
            except (TypeError, ValueError):
                dur = 0.0
            parts = meta.get("parts") or []
            cmp_info = (
                _ensure_ark_pack_gen_compare(root, rel, parts, gen_roots, ark)
                if parts
                else {"has_gen": False, "gen_rel": "", "gen_ready": 0, "gen_total": 0, "gen_missing": []}
            )
            risk_tags = list(meta.get("risk_tags") or [])
            look_set = str(meta.get("look_set") or "")
            send_mode = str(meta.get("send_mode") or "")
            if not risk_tags and parts:
                risk_tags = _infer_risk_tags(parts, kind=folder)
            if not look_set:
                look_set = _recommend_look_set(folder, risk_tags)
            if not send_mode:
                send_mode = _recommend_send_mode(risk_tags)
            qa = qa_items.get(rel) or {}
            items.append(
                {
                    "id": rel,
                    "kind": folder,
                    "human_kind": meta.get("human_kind") or folder,
                    "name": p.name,
                    "rel": rel,
                    "size": p.stat().st_size,
                    "mtime": datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "duration": round(dur, 3),
                    "strategy": meta.get("strategy") or "",
                    "need_pad": bool(meta.get("need_pad")),
                    "parts": parts,
                    "shot_ids": meta.get("shot_ids") or [],
                    "pack_id": meta.get("pack_id") or "",
                    "sent_to_ark": bool(meta.get("sent_to_ark")),
                    "sent_at": meta.get("sent_at") or "",
                    "has_gen": bool(cmp_info.get("has_gen")),
                    "gen_rel": cmp_info.get("gen_rel") or "",
                    "gen_ready": int(cmp_info.get("gen_ready") or 0),
                    "gen_total": int(cmp_info.get("gen_total") or 0),
                    "gen_missing": cmp_info.get("gen_missing") or [],
                    "risk_tags": risk_tags,
                    "look_set": look_set,
                    "send_mode": send_mode,
                    "patch": meta.get("patch") or _recommend_patch(risk_tags),
                    "qa_mark": qa.get("mark") or "",
                    "qa_note": qa.get("note") or "",
                    "suggest_per_part": send_mode == "per_part",
                }
            )
    return {
        "ok": True,
        "enabled": True,
        "items": items,
        "kinds": kinds,
        "coverage": validate_pack_coverage(project_id),
        "total": len(items),
        "sent": sum(1 for x in items if x.get("sent_to_ark")),
        "with_gen": sum(1 for x in items if x.get("has_gen")),
        "dir": _rel_to_root(ark),
        "manifest": _rel_to_root(manifest_path) if manifest_path.is_file() else "",
        "updated_at": manifest.get("updated_at") or "",
        "pack_mode": manifest.get("pack_mode") or "",
        "policy": manifest.get("policy") or "",
        "send_to_ark": False,
        "gates": gates,
        "qa_marks": ARK_QA_MARKS,
        "ark_review_confirmed_at": manifest.get("ark_review_confirmed_at") or "",
        "require_reference_video": True,
        "note": "按人工判断同分类拼包（5～12s）。闸门2确认后才可送方舟；对照页可标朝向/换景/敏感。",
    }


def build_ark_send_packs(project_id: str, payload: dict | None = None) -> dict:
    """第五步：按人工判断把同分类短段拼成适合送方舟的参考片；不调用方舟。"""
    import shutil

    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    if not proj.get("shot_compare"):
        return {"ok": False, "error": "本项目未配置分镜对照"}
    payload = payload or {}
    only_kinds = payload.get("kinds")  # optional filter
    force = bool(payload.get("force"))
    gates = get_workflow_gates(project_id)
    if not gates.get("can_build") and not force:
        return {
            "ok": False,
            "error": (gates.get("shot_review") or {}).get("reason") or "闸门1未过，禁止拼包",
            "gates": gates,
        }

    pairs = list_shot_pairs(project_id)
    if not pairs.get("enabled"):
        return {"ok": False, "error": pairs.get("message") or "未启用分镜对照"}
    shot_items = [i for i in (pairs.get("items") or []) if i.get("has_shot")]
    shot_lookup = {str(i.get("id")): i for i in shot_items}

    root = _abs(proj["root"])
    ark = _ark_root(proj)
    kinds = _ark_kinds(proj)
    # 清空旧包，避免改判后残留
    if ark.exists():
        shutil.rmtree(ark)
    for folder in kinds:
        (ark / folder).mkdir(parents=True, exist_ok=True)

    # 按 pack_id 归组（list_shot_pairs 已按 human_kind 打 pack）
    by_pack: dict[str, list[dict]] = {}
    for it in shot_items:
        hk = str(it.get("human_kind") or "").strip()
        folder = _ark_folder_for(hk, kinds)
        if not folder:
            continue  # 空镜等跳过
        if only_kinds and folder not in only_kinds and hk not in only_kinds:
            continue
        strategy = it.get("pack_strategy") or ""
        if strategy == "skip":
            continue
        pid = str(it.get("pack_id") or "").strip()
        if not pid:
            # 无 pack 标注时单段兜底
            pid = f"{hk}#solo:{it.get('name')}"
            it = dict(it)
            it["pack_with"] = [it.get("name")]
            it["pack_need_pad"] = True
            it["pack_strategy"] = "pad_fallback"
        by_pack.setdefault(pid, []).append(it)

    packs_meta: dict[str, dict] = {}
    built: list[dict] = []
    errors: list[dict] = []

    for pid, members in sorted(by_pack.items(), key=lambda kv: kv[0]):
        members_sorted = sorted(members, key=lambda x: (x.get("t0") is None, x.get("t0") or 0, x.get("name") or ""))
        head = members_sorted[0]
        hk = str(head.get("human_kind") or "").strip()
        folder = _ark_folder_for(hk, kinds) or (kinds[0] if kinds else "角色一")
        names = list(head.get("pack_with") or [m.get("name") for m in members_sorted])
        # 按 pack_with 顺序取路径
        name_to_it = {m.get("name"): m for m in members_sorted}
        clips: list[Path] = []
        shot_ids: list[str] = []
        parts: list[dict] = []
        missing = False
        for name in names:
            it = name_to_it.get(name)
            if not it:
                # 同名可能在 members 外（同 pack 标注一致时不应发生）
                for m in members_sorted:
                    if m.get("name") == name:
                        it = m
                        break
            if not it:
                missing = True
                break
            rel = it.get("shot_rel") or ""
            p = root / rel
            if not p.is_file():
                missing = True
                errors.append({"pack_id": pid, "error": f"缺少文件 {rel}"})
                break
            clips.append(p)
            shot_ids.append(it["id"])
            parts.append(
                {
                    "name": name,
                    "id": it["id"],
                    "shot_rel": it.get("shot_rel") or "",
                    "folder": str(it["id"]).split("/", 1)[0] if "/" in str(it.get("id") or "") else folder,
                    "t0": it.get("t0"),
                    "t1": it.get("t1"),
                    "dur": round(float(it["t1"] - it["t0"]), 3) if it.get("t0") is not None and it.get("t1") is not None else None,
                    "order": len(parts),
                }
            )
        if missing or not clips:
            continue

        need_pad = bool(head.get("pack_need_pad"))
        strategy = head.get("pack_strategy") or ("pad_fallback" if need_pad else ("solo" if len(clips) == 1 else "concat"))
        # 文件名：pack序号_首段-末段
        pack_no = pid.split("#")[-1] if "#" in pid else "pack"
        stem_parts = [Path(n).stem for n in names]
        if len(stem_parts) == 1:
            fname = f"{pack_no}_{stem_parts[0]}.mp4"
        else:
            fname = f"{pack_no}_{stem_parts[0]}_x{len(stem_parts)}.mp4"
        dest = ark / folder / fname
        tmp = dest.with_suffix(".tmp.mp4")
        try:
            concat_dur = _ffmpeg_concat(clips, tmp)
            if need_pad or concat_dur < _ARK_MIN_SEC - 0.05:
                final_dur = _ffmpeg_pad_loop(tmp, dest, _ARK_MIN_SEC)
                strategy = "pad_fallback"
                need_pad = True
                tmp.unlink(missing_ok=True)
            else:
                tmp.replace(dest)
                final_dur = concat_dur
            for side in (tmp.with_suffix(".concat.txt"), dest.with_suffix(".concat.txt"), dest.with_suffix(".pad.txt"), tmp.with_suffix(".pad.txt")):
                if side.exists():
                    side.unlink(missing_ok=True)
            rel = dest.relative_to(root).as_posix()
            risk_tags = _infer_risk_tags(parts, shot_lookup=shot_lookup, kind=folder)
            look_set = _recommend_look_set(folder, risk_tags)
            send_mode = _recommend_send_mode(risk_tags)
            patch = _recommend_patch(risk_tags)
            row = {
                "pack_id": pid,
                "kind": folder,
                "human_kind": hk,
                "rel": rel,
                "name": fname,
                "duration": round(final_dur, 3),
                "strategy": strategy,
                "need_pad": need_pad,
                "parts": parts,
                "shot_ids": shot_ids,
                "sent_to_ark": False,
                "risk_tags": risk_tags,
                "look_set": look_set,
                "send_mode": send_mode,
                "patch": patch,
                "require_reference_video": True,
            }
            packs_meta[rel] = row
            built.append(row)
        except Exception as e:
            errors.append({"pack_id": pid, "error": str(e)[:300]})
            if tmp.exists():
                tmp.unlink(missing_ok=True)

    manifest = {
        "version": 2,
        "updated_at": _now(),
        "send_to_ark": False,
        "ark_review_confirmed_at": "",  # 重拼后需重新过闸门2
        "policy": "优化：按人工判断同分类拼包 5～12s（允许时间轴中间隔其它镜头）；不够再循环垫；parts 记清各段供生成后切开回填；本步不调用方舟；换角强制 reference_video",
        "pack_mode": "same_kind_concat_v2",
        "require_reference_video": True,
        "packs": packs_meta,
        "errors": errors,
    }
    _save_json(ark / "manifest.json", manifest)
    # 单独一份可读计划，方便生成后按记录拆回
    plan = {
        "updated_at": _now(),
        "pack_mode": "same_kind_concat_v2",
        "note": "生成后按每包 parts[].dur 顺序切开，写回 输出/分段替换/<folder>/<name>",
        "packs": [
            {
                "pack_id": row["pack_id"],
                "kind": row["kind"],
                "rel": row["rel"],
                "strategy": row["strategy"],
                "need_pad": row["need_pad"],
                "duration": row["duration"],
                "parts": row["parts"],
            }
            for row in built
        ],
    }
    _save_json(ark / "pack_plan.json", plan)

    listed = list_ark_send_packs(project_id)
    return {
        "ok": True,
        "built": len(built),
        "failed": len(errors),
        "packs": built,
        "errors": errors,
        "ark_packs": listed,
        "shot_compare": list_shot_pairs(project_id),
        "gates": get_workflow_gates(project_id),
        "send_to_ark": False,
        "message": (
            f"已合成 {len(built)} 个送方舟片段（未送方舟）"
            + (f"，失败 {len(errors)}" if errors else "")
            + "。请逐包复查后点「确认包已审」再送方舟。"
        ),
    }


_ark_send_threads: dict[str, threading.Thread] = {}


def _ark_send_running(project_id: str) -> bool:
    """
    是否真的在送方舟：线程存活 OR 心跳新鲜。
    只看线程字典会在进程重启后误判为「没跑」；只看 jobs.json 的 running 又会被脏状态骗住。
    """
    t = _ark_send_threads.get(project_id)
    if bool(t and t.is_alive()):
        return True
    return _job_heartbeat_fresh(project_id)


def start_ark_send_packs(project_id: str, payload: dict | None = None) -> dict:
    """用已拼好的「输出/送方舟」包直接送 Seedance（不重拼）。后台 docker 消费。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    payload = payload or {}
    force = bool(payload.get("force"))
    # 单包补送：只重生成这一个已拼好的包，不重打包、不做全覆盖校验
    only_pack = str(payload.get("only_pack") or payload.get("rel") or "").strip()
    listed = list_ark_send_packs(project_id)
    items = listed.get("items") or []
    coverage = listed.get("coverage") or validate_pack_coverage(project_id)
    gates = get_workflow_gates(project_id)
    if not gates.get("can_send") and not force:
        return {
            "ok": False,
            "error": (gates.get("ark_review") or {}).get("reason") or "闸门2未过，禁止送方舟",
            "gates": gates,
            "coverage": coverage,
            "ark_packs": listed,
        }
    if not items:
        return {"ok": False, "error": "还没有送方舟包，请先点「按人工判断拼包」"}
    if only_pack:
        hit = [
            x for x in items
            if str(x.get("rel") or "") == only_pack
            or str(x.get("pack_id") or "") == only_pack
            or str(x.get("name") or "") == only_pack
            or only_pack in str(x.get("rel") or "")
        ]
        if not hit:
            return {
                "ok": False,
                "error": f"找不到要补送的包：{only_pack}。可用 rel 示例：{str((items[0] or {}).get('rel') or '')}",
                "coverage": coverage,
                "ark_packs": listed,
            }
    # 覆盖校验降级为警告：整批发送只提示，缺的段可以事后用「单包补送」定点修。
    # 单包补送本身就是子集，天然不满足全覆盖，直接跳过该校验。
    warnings: list[str] = []
    if not only_pack and not coverage.get("ok"):
        bit = coverage.get("reason") or ""
        if coverage.get("missing"):
            bit += f" 缺段示例：{'、'.join(coverage.get('missing') or [])}"
        warnings.append("分镜覆盖不一致（警告，已放行）：" + bit + " 缺的段可用「单包补送」逐个补。")
    if _ark_send_running(project_id):
        job = _job_for(project_id)
        return {
            "ok": True,
            "already_running": True,
            "message": job.get("message") or "送方舟任务已在跑",
            "ark_packs": listed,
            "job": job,
        }

    only = str(payload.get("only") or "").strip()
    limit = int(payload.get("limit") or 0)
    root = _abs(proj["root"])
    tools = ROOT / "integrated" / "ai_story" / "tools"
    ctr = str(payload.get("container") or "ai_story-backend-1")

    prev_status = str((load_jobs().get(project_id) or {}).get("status") or "idle")
    if prev_status == "running":
        update_progress(
            project_id,
            {
                "status": "running",
                "log": "检测到上一次送方舟已中断（心跳超时），本次重新启动",
                "level": "warn",
            },
        )

    send_n = 1 if only_pack else len(items)
    head_msg = (
        f"补送单包：{only_pack}（不重拼，其余包不动）"
        if only_pack
        else f"送方舟：准备提交 {send_n} 个现成包（不重拼）"
    )
    update_progress(
        project_id,
        {
            "status": "running",
            "step": "generate",
            "progress": 8,
            "message": head_msg,
            "log": f"ark send enqueue packs={send_n} only={only or '-'} pack={only_pack or '-'} limit={limit or '-'}",
            "clear_logs": False,
            "error_code": "",
        },
    )
    for w in warnings:
        update_progress(project_id, {"status": "running", "log": w, "level": "warn"})

    def runner():
        try:
            # 同步现成包与脚本进容器
            sync = [
                "python",
                str(tools / "_pipa_sync_to_docker.py"),
            ]
            subprocess.run(sync, cwd=str(ROOT / "workbench"), capture_output=True, text=True, timeout=180)

            cmd = [
                "docker",
                "exec",
                "-e",
                "PYTHONPATH=/app/backend",
                "-e",
                "PYTHONUNBUFFERED=1",
                "-e",
                "PIPA_SWAP_ROOT=/tmp/swap_job",
                "-w",
                "/app/backend",
                ctr,
                "python",
                "/tmp/pipa_send_ark_from_packs.py",
            ]
            if only:
                cmd.extend(["--only", only])
            if only_pack:
                cmd.extend(["--pack", only_pack])
            if limit > 0:
                cmd.extend(["--limit", str(limit)])

            update_progress(
                project_id,
                {
                    "status": "running",
                    "step": "generate",
                    "progress": 12,
                    "message": f"{'补送单包' if only_pack else '送方舟'}进行中（共 {send_n} 包）…",
                    "log": "ark send docker exec start",
                },
            )
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            assert proc.stdout is not None
            # 心跳线程：Seedance 生成期间脚本可能几分钟无输出，避免被误判 stale
            stop_hb = threading.Event()

            def _heartbeat_loop() -> None:
                while not stop_hb.wait(10):
                    if proc.poll() is not None:
                        break
                    update_progress(project_id, {"heartbeat": True})

            hb = threading.Thread(target=_heartbeat_loop, name=f"ark-hb-{project_id}", daemon=True)
            hb.start()
            n_ok = 0
            n_fail = 0
            try:
                for line in proc.stdout:
                    line = (line or "").rstrip()
                    if not line:
                        continue
                    update_progress(
                        project_id,
                        {
                            "status": "running",
                            "step": "generate",
                            "log": line[:500],
                            "message": line[:120],
                            "heartbeat": True,
                        },
                    )
                    if line.startswith("OK "):
                        n_ok += 1
                    if line.startswith("FAIL "):
                        n_fail += 1
                        cls = classify_ark_error(line)
                        update_progress(
                            project_id,
                            {
                                "error_code": cls.get("error_code") or "ARK_PACK_FAIL",
                                "message": f"{cls.get('error_code')}: {cls.get('disposition')}"[:120],
                                "log": line[:500],
                            },
                        )
                    # 粗略进度
                    done_est = n_ok + n_fail
                    if len(items):
                        pct = min(95, 12 + int(done_est / max(len(items), 1) * 80))
                        update_progress(project_id, {"progress": pct})
            finally:
                stop_hb.set()
            code = proc.wait()
            # 拉回生成结果与状态
            try:
                out_seg = root / "输出" / "分段替换"
                out_seg.mkdir(parents=True, exist_ok=True)
                subprocess.run(
                    ["docker", "cp", f"{ctr}:/tmp/swap_job/输出/分段替换/.", str(out_seg) + "/"],
                    capture_output=True,
                    text=True,
                    timeout=300,
                )
                subprocess.run(
                    ["docker", "cp", f"{ctr}:/tmp/swap_job/输出/送方舟/manifest.json", str(root / "输出" / "送方舟" / "manifest.json")],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
            except Exception as e:
                update_progress(project_id, {"log": f"pull results warn: {e}", "level": "warn"})

            if code == 0 and n_fail == 0:
                update_progress(
                    project_id,
                    {
                        "status": "done",
                        "step": "generate",
                        "progress": 100,
                        "message": f"送方舟完成：成功切开回填（日志 OK≈{n_ok}）",
                        "log": "ark send done",
                        "error_code": "",
                    },
                )
            else:
                update_progress(
                    project_id,
                    {
                        "status": "failed",
                        "step": "generate",
                        "progress": 90,
                        "message": f"送方舟结束有失败 exit={code} OK≈{n_ok} FAIL≈{n_fail}",
                        "log": f"ark send exit={code}",
                        "error_code": "ARK_SEND_FAIL" if n_fail else "ARK_SEND_EXIT",
                        "level": "error",
                    },
                )
        except Exception as e:
            cls = classify_ark_error(str(e))
            update_progress(
                project_id,
                {
                    "status": "failed",
                    "step": "generate",
                    "message": f"送方舟启动/执行失败：{e}",
                    "log": str(e)[:500],
                    "error_code": cls.get("error_code") or "ARK_SEND_ERROR",
                    "level": "error",
                },
            )

    t = threading.Thread(target=runner, name=f"ark-send-{project_id}", daemon=True)
    _ark_send_threads[project_id] = t
    t.start()
    return {
        "ok": True,
        "started": True,
        "packs": send_n,
        "only_pack": only_pack or "",
        "message": (
            f"已开始补送单包 {only_pack}（不重拼，后台执行）"
            if only_pack
            else f"已开始用现成 {send_n} 包送方舟（后台执行，可看进度条）"
        ),
        "warnings": warnings,
        "coverage": coverage,
        "ark_packs": listed,
        "job": _job_for(project_id),
    }


def queue_shot_reswap(project_id: str, payload: dict | None = None) -> dict:
    """把已标记问题段写入重跑队列，并更新任务进度（真实 Seedance 由 Agent/CLI 消费队列）。"""
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    if not proj.get("shot_compare"):
        return {"ok": False, "error": "本项目未配置分镜对照"}
    payload = payload or {}
    pairs = list_shot_pairs(project_id)
    all_items = pairs.get("items") or []
    ids = payload.get("ids")
    if ids is None:
        selected = [i for i in all_items if i.get("marked")]
    else:
        idset = set(str(x) for x in ids)
        selected = [i for i in all_items if i["id"] in idset]
    if not selected:
        return {"ok": False, "error": "没有已标记的问题段，请先勾选并填写说明后保存"}
    # enrich with latest notes from disk
    issues = _load_issues(proj).get("items") or {}
    queue_items = []
    for it in selected:
        iss = issues.get(it["id"]) or {}
        prompt = resolve_shot_prompt(project_id, it["id"], it.get("kind") or "")
        queue_items.append(
            {
                "id": it["id"],
                "kind": it.get("kind"),
                "name": it.get("name"),
                "label": it.get("label"),
                "t0": it.get("t0"),
                "t1": it.get("t1"),
                "shot_rel": it.get("shot_rel"),
                "gen_rel": it.get("gen_rel"),
                "issue_type": iss.get("issue_type") or it.get("issue_type") or "other",
                "note": iss.get("note") or it.get("note") or "",
                "prompt": prompt,
                "camera": it.get("camera") or "",
                "scene": it.get("scene") or "",
                "character": it.get("character") or "",
                "action": it.get("action") or "",
                "pack_id": it.get("pack_id") or "",
                "pack_with": it.get("pack_with") or [],
                "pack_strategy": it.get("pack_strategy") or "",
            }
        )
    queue = {
        "version": 1,
        "project_id": project_id,
        "created_at": _now(),
        "status": "queued",
        "count": len(queue_items),
        "items": queue_items,
        "hint": "Agent/CLI 读取本文件后按段重跑 Seedance，完成后写回 status=done 并上报 progress",
    }
    qpath = _reswap_queue_path(proj)
    qpath.parent.mkdir(parents=True, exist_ok=True)
    _save_json(qpath, queue)

    # also write a markdown summary for humans
    md_path = qpath.with_suffix(".md")
    lines = [
        f"# 分镜重跑队列 · {proj.get('name')}",
        "",
        f"- 时间：{queue['created_at']}",
        f"- 段数：{len(queue_items)}",
        f"- 队列文件：`{qpath.name}`",
        "",
        "| 段 | 类型 | 拼包 | 问题 | 说明 |",
        "|----|------|------|------|------|",
    ]
    type_map = {t["id"]: t["label"] for t in ISSUE_TYPES}
    for it in queue_items:
        pack = it.get("pack_strategy") or "-"
        if it.get("pack_with") and len(it["pack_with"]) > 1:
            pack = f"{pack}:{'+'.join(it['pack_with'])}"
        lines.append(
            f"| {it.get('name') or it['id']} | {it.get('kind')} | {pack} | "
            f"{type_map.get(it.get('issue_type') or '', it.get('issue_type'))} | "
            f"{(it.get('note') or '').replace('|', '/')} |"
        )
    lines.extend(["", "## 各段提示词", ""])
    for it in queue_items:
        lines.append(f"### {it.get('name') or it['id']}（{it.get('kind')}）")
        lines.append("")
        lines.append("```")
        lines.append((it.get("prompt") or "").strip() or "（空）")
        lines.append("```")
        lines.append("")
    try:
        md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError:
        pass

    n = len(queue_items)
    update_progress(
        project_id,
        {
            "status": "queued",
            "step": "generate",
            "progress": 35,
            "segment_i": 0,
            "segment_n": n,
            "message": f"已排队重跑 {n} 个问题段（未开始执行，等 Agent/脚本消费）",
            "log": f"reswap queue {n} → {qpath.name}",
            "error_code": "",
            "clear_logs": False,
        },
    )
    return {
        "ok": True,
        "count": n,
        "queue_file": _rel_to_root(qpath),
        "report_md": _rel_to_root(md_path) if md_path.exists() else "",
        "items": queue_items,
        "shot_compare": list_shot_pairs(project_id),
    }


def cancel_shot_reswap(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    qpath = _reswap_queue_path(proj)
    if qpath.is_file():
        data = _load_json(qpath, {})
        data["status"] = "cancelled"
        data["cancelled_at"] = _now()
        data["cancel_reason"] = "用户在工作台取消排队"
        _save_json(qpath, data)
    update_progress(
        project_id,
        {
            "status": "idle",
            "step": "",
            "progress": 0,
            "message": "已取消重跑排队",
            "log": "reswap queue cancelled",
            "segment_i": None,
            "segment_n": None,
            "error_code": "",
        },
    )
    return {"ok": True, "job": _job_for(project_id)}


def open_project_folder(project_id: str) -> dict:
    proj = get_project(project_id)
    if not proj:
        return {"ok": False, "error": "项目不存在"}
    root = _abs(proj["root"])
    root.mkdir(parents=True, exist_ok=True)
    try:
        import os

        os.startfile(str(root))  # type: ignore[attr-defined]
        return {"ok": True, "path": str(root)}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}
