"""手机 IP 摄像头延时摄影：定时拉帧 → 本地存图 → ffmpeg 合成。"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STORE_DIR = DATA_DIR / "timelapse"
CONFIG_FILE = DATA_DIR / "timelapse_config.json"
INDEX_FILE = STORE_DIR / "index.json"

DEFAULT_CONFIG = {
    "base_url": "http://192.168.0.108:8080",
    "interval_sec": 10,
    "count": 60,
    "output_fps": 12,
    "auto_compose": True,
    "ensure_stream": True,
}

_lock = threading.Lock()
_job: dict = {}
_stop_event = threading.Event()
_ffmpeg_cache = ""


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_dirs() -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    _ensure_dirs()
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.is_file():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cfg.update({k: raw[k] for k in DEFAULT_CONFIG if k in raw})
        except (OSError, json.JSONDecodeError):
            pass
    return cfg


def save_config(cfg: dict) -> dict:
    _ensure_dirs()
    merged = load_config()
    merged.update(cfg)
    # 校验
    try:
        merged["interval_sec"] = max(1, min(3600, int(merged.get("interval_sec") or 10)))
    except (TypeError, ValueError):
        merged["interval_sec"] = 10
    try:
        merged["count"] = max(0, min(100000, int(merged.get("count") or 0)))
    except (TypeError, ValueError):
        merged["count"] = 60
    try:
        merged["output_fps"] = max(1, min(60, int(merged.get("output_fps") or 12)))
    except (TypeError, ValueError):
        merged["output_fps"] = 12
    base = str(merged.get("base_url") or "").strip().rstrip("/")
    if base and not re.match(r"^https?://", base, re.I):
        raise ValueError("base_url 须以 http:// 或 https:// 开头")
    merged["base_url"] = base
    merged["auto_compose"] = bool(merged.get("auto_compose", True))
    merged["ensure_stream"] = bool(merged.get("ensure_stream", True))
    CONFIG_FILE.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return merged


def apply_config(data: dict) -> dict:
    cfg = load_config()
    for k in DEFAULT_CONFIG:
        if k in data:
            cfg[k] = data[k]
    saved = save_config(cfg)
    return {"ok": True, "config": saved}


def find_ffmpeg() -> str:
    global _ffmpeg_cache
    if _ffmpeg_cache and Path(_ffmpeg_cache).is_file():
        return _ffmpeg_cache
    which = shutil.which("ffmpeg")
    if which:
        _ffmpeg_cache = which
        return which
    candidates: list[Path] = []
    local = os.environ.get("LOCALAPPDATA", "")
    prog = os.environ.get("PROGRAMFILES", r"C:\Program Files")
    prog86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
    for base in (local, prog, prog86, r"C:\ffmpeg", str(ROOT / "tools")):
        if not base:
            continue
        candidates.extend(
            [
                Path(base) / "ffmpeg" / "bin" / "ffmpeg.exe",
                Path(base) / "ffmpeg.exe",
                Path(base) / "bin" / "ffmpeg.exe",
            ]
        )
    # 常见 gyan 解压路径
    for p in Path(r"C:\ffmpeg").glob("**/ffmpeg.exe") if Path(r"C:\ffmpeg").is_dir() else []:
        candidates.append(p)
    for p in candidates:
        if p.is_file():
            _ffmpeg_cache = str(p)
            return _ffmpeg_cache
    return ""


def _subprocess_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def _http_get(url: str, timeout: float = 10, headers: dict | None = None) -> tuple[int, bytes, str]:
    hdrs = {"User-Agent": "WorkbenchTimelapse/1.0"}
    if headers:
        hdrs.update(headers)
    req = Request(url, headers=hdrs, method="GET")
    try:
        with urlopen(req, timeout=timeout) as resp:
            ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            return resp.status, resp.read(), ctype
    except HTTPError as exc:
        body = exc.read() if hasattr(exc, "read") else b""
        return int(exc.code or 0), body, ""
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(str(exc)) from exc


def _http_post_json(url: str, payload: dict | None = None, timeout: float = 10, origin: str = "") -> dict:
    body = json.dumps(payload or {}).encode("utf-8")
    headers = {
        "User-Agent": "WorkbenchTimelapse/1.0",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if origin:
        headers["Origin"] = origin
        headers["Referer"] = origin.rstrip("/") + "/"
    req = Request(url, data=body, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
        try:
            data = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            data = {"error": raw or str(exc)}
        data.setdefault("error", str(exc))
        data["_http"] = int(exc.code or 0)
        return data
    except (URLError, TimeoutError, OSError) as exc:
        return {"error": str(exc)}


def normalize_base_url(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    # 若用户填了 /stream，剥掉路径只留 origin
    m = re.match(r"^(https?://[^/]+(?::\d+)?)", u, re.I)
    if m and ("/stream" in u or "/video" in u or "/shot" in u):
        return m.group(1)
    return u


def camera_status(base_url: str | None = None) -> dict:
    base = normalize_base_url(base_url or load_config().get("base_url") or "")
    if not base:
        return {"ok": False, "error": "未配置摄像头地址", "base_url": ""}
    out: dict = {"ok": True, "base_url": base, "reachable": False, "streaming": None, "hint": ""}
    # LensCast /api/status
    try:
        code, raw, _ = _http_get(base + "/api/status", timeout=5)
        if code == 200 and raw:
            try:
                data = json.loads(raw.decode("utf-8", errors="replace"))
                out["reachable"] = True
                out["streaming"] = data.get("streaming")
                out["camera"] = data.get("camera")
                out["battery"] = data.get("battery")
                out["provider"] = "lenscast"
                return out
            except json.JSONDecodeError:
                pass
    except RuntimeError as exc:
        out["hint"] = str(exc)
    # 任意首页可达
    try:
        code, _, _ = _http_get(base + "/", timeout=5)
        out["reachable"] = code > 0 and code < 500
        if out["reachable"]:
            out["provider"] = out.get("provider") or "http"
            return out
    except RuntimeError as exc:
        out["ok"] = False
        out["error"] = f"无法连接摄像头: {exc}"
        out["hint"] = "确认手机与电脑同网、代理已关，且 App 已启动服务器"
    return out


def ensure_stream(base_url: str | None = None) -> dict:
    """尽量打开 LensCast Web 推流；其它 App 忽略。"""
    base = normalize_base_url(base_url or load_config().get("base_url") or "")
    if not base:
        return {"ok": False, "error": "未配置摄像头地址"}
    st = camera_status(base)
    streaming = st.get("streaming") or {}
    if streaming.get("isActive") or streaming.get("webStreamingActive"):
        return {"ok": True, "already": True, "url": streaming.get("url") or (base + "/stream")}
    for path in ("/api/stream/web/start", "/api/stream/start"):
        res = _http_post_json(base + path, {}, timeout=8, origin=base)
        if res.get("success") or res.get("isActive") or res.get("ok"):
            return {"ok": True, "started": True, "url": res.get("url") or (base + "/stream"), "raw": res}
        if res.get("_http") == 404:
            continue
    # 非 LensCast：只要能拉帧即可
    if st.get("reachable"):
        return {"ok": True, "skipped": True, "hint": "未检测到 LensCast 推流接口，将直接尝试拉帧"}
    return {"ok": False, "error": st.get("error") or "无法启动推流", "hint": st.get("hint") or ""}


def _extract_jpeg_from_mjpeg(url: str, timeout: float = 12) -> bytes:
    req = Request(url, headers={"User-Agent": "WorkbenchTimelapse/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        buf = b""
        deadline = time.time() + timeout
        while time.time() < deadline and len(buf) < 12_000_000:
            chunk = resp.read(8192)
            if not chunk:
                break
            buf += chunk
            start = buf.find(b"\xff\xd8")
            if start < 0:
                if len(buf) > 65536:
                    buf = buf[-4096:]
                continue
            end = buf.find(b"\xff\xd9", start + 2)
            if end >= 0:
                return buf[start : end + 2]
    raise RuntimeError("MJPEG 流中未读到完整 JPEG（请确认已开始推流）")


def fetch_frame(base_url: str | None = None) -> dict:
    """从摄像头拉一帧 JPEG。"""
    base = normalize_base_url(base_url or load_config().get("base_url") or "")
    if not base:
        return {"ok": False, "error": "未配置摄像头地址"}
    errors: list[str] = []
    # 1) 常见单帧 URL
    for path in ("/shot.jpg", "/snapshot", "/snap", "/photo.jpg", "/jpg", "/video/mjpeg"):
        url = base + path
        try:
            if path.endswith("mjpeg") or "stream" in path:
                jpeg = _extract_jpeg_from_mjpeg(url, timeout=10)
            else:
                code, raw, ctype = _http_get(url, timeout=8)
                if code != 200 or not raw:
                    errors.append(f"{path}: HTTP {code}")
                    continue
                if raw[:2] == b"\xff\xd8":
                    jpeg = raw
                elif "jpeg" in ctype or "jpg" in ctype:
                    jpeg = raw
                else:
                    # 可能仍是 MJPEG
                    if b"\xff\xd8" in raw and b"\xff\xd9" in raw:
                        i, j = raw.find(b"\xff\xd8"), raw.find(b"\xff\xd9")
                        jpeg = raw[i : j + 2]
                    else:
                        errors.append(f"{path}: 非 JPEG ({ctype or 'unknown'})")
                        continue
            return {"ok": True, "jpeg": jpeg, "source": url, "size": len(jpeg)}
        except Exception as exc:
            errors.append(f"{path}: {exc}")
    # 2) LensCast /stream
    try:
        jpeg = _extract_jpeg_from_mjpeg(base + "/stream", timeout=12)
        return {"ok": True, "jpeg": jpeg, "source": base + "/stream", "size": len(jpeg)}
    except Exception as exc:
        errors.append(f"/stream: {exc}")
    return {"ok": False, "error": "拉帧失败", "logs": errors}


def _load_index() -> list[dict]:
    _ensure_dirs()
    if not INDEX_FILE.is_file():
        return []
    try:
        raw = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_index(items: list[dict]) -> None:
    _ensure_dirs()
    INDEX_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _job_dir(job_id: str) -> Path:
    return STORE_DIR / job_id


def _safe_job_id(job_id: str) -> str:
    jid = re.sub(r"[^\w.\-]+", "", (job_id or "").strip())
    if not jid or ".." in jid:
        raise ValueError("无效任务 id")
    return jid


def list_jobs(limit: int | None = 50) -> list[dict]:
    items = _load_index()
    items = sorted(items, key=lambda x: x.get("created_at") or "", reverse=True)
    if limit is not None:
        items = items[: max(1, min(200, int(limit)))]
    # 附带目录内帧数
    for it in items:
        d = _job_dir(it["id"])
        frames = sorted(d.glob("frame_*.jpg")) if d.is_dir() else []
        it["frame_count"] = len(frames)
        vid = d / "timelapse.mp4"
        it["has_video"] = vid.is_file()
        if it["has_video"]:
            it["video_size"] = vid.stat().st_size
            it["video_rel"] = f"{it['id']}/timelapse.mp4"
        if frames:
            it["preview_rel"] = f"{it['id']}/{frames[-1].name}"
    return items


def get_job(job_id: str) -> dict | None:
    jid = _safe_job_id(job_id)
    for it in _load_index():
        if it.get("id") == jid:
            return it
    return None


def resolve_file(rel: str) -> Path | None:
    raw = str(rel or "").strip().replace("\\", "/")
    if not raw or ".." in raw.split("/"):
        return None
    try:
        root = STORE_DIR.resolve()
        p = (STORE_DIR / raw).resolve()
        p.relative_to(root)
        return p if p.is_file() else None
    except (OSError, ValueError):
        return None


def delete_job(job_id: str) -> dict:
    jid = _safe_job_id(job_id)
    with _lock:
        if _job.get("id") == jid and _job.get("status") == "running":
            return {"ok": False, "error": "任务正在运行，请先停止"}
    items = [x for x in _load_index() if x.get("id") != jid]
    _save_index(items)
    d = _job_dir(jid)
    if d.is_dir():
        shutil.rmtree(d, ignore_errors=True)
    return {"ok": True}


def clear_all() -> dict:
    with _lock:
        if _job.get("status") == "running":
            return {"ok": False, "error": "有任务在运行，请先停止"}
    items = _load_index()
    n = len(items)
    for it in items:
        d = _job_dir(it["id"])
        if d.is_dir():
            shutil.rmtree(d, ignore_errors=True)
    _save_index([])
    return {"ok": True, "cleared": n}


def _update_index_item(job_id: str, **kwargs) -> None:
    items = _load_index()
    for it in items:
        if it.get("id") == job_id:
            it.update(kwargs)
            it["updated_at"] = _now()
            break
    _save_index(items)


def _set_job(**kwargs) -> None:
    with _lock:
        _job.update(kwargs)
        _job["updated_at"] = time.time()


def _snapshot_job() -> dict:
    with _lock:
        return dict(_job) if _job else {}


def status() -> dict:
    cfg = load_config()
    snap = _snapshot_job()
    return {
        "ok": True,
        "config": cfg,
        "ffmpeg": find_ffmpeg() or "",
        "job": snap,
        "running": snap.get("status") == "running",
        "store_dir": str(STORE_DIR),
    }


def stop_job() -> dict:
    with _lock:
        if _job.get("status") != "running":
            return {"ok": False, "error": "当前没有进行中的延时任务"}
    _stop_event.set()
    return {"ok": True, "message": "正在停止…"}


def compose_job(job_id: str, fps: int | None = None) -> dict:
    jid = _safe_job_id(job_id)
    d = _job_dir(jid)
    frames = sorted(d.glob("frame_*.jpg"))
    if len(frames) < 2:
        return {"ok": False, "error": f"帧数不足（{len(frames)}），至少需要 2 张"}
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return {"ok": False, "error": "未找到 ffmpeg，请安装并加入 PATH"}
    out_fps = fps if fps is not None else int(load_config().get("output_fps") or 12)
    out_fps = max(1, min(60, int(out_fps)))
    out = d / "timelapse.mp4"
    # 使用 pattern：frame_%04d.jpg
    pattern = str(d / "frame_%04d.jpg")
    cmd = [
        ffmpeg,
        "-y",
        "-framerate",
        str(out_fps),
        "-i",
        pattern,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
            creationflags=_subprocess_flags(),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "ffmpeg 超时"}
    if proc.returncode != 0 or not out.is_file():
        err = (proc.stderr or proc.stdout or "合成失败")[-800:]
        return {"ok": False, "error": err}
    _update_index_item(
        jid,
        has_video=True,
        video_rel=f"{jid}/timelapse.mp4",
        video_size=out.stat().st_size,
        output_fps=out_fps,
        status="done",
    )
    return {
        "ok": True,
        "path": str(out),
        "rel": f"{jid}/timelapse.mp4",
        "size": out.stat().st_size,
        "frames": len(frames),
        "fps": out_fps,
    }


def _worker(job_id: str, cfg: dict) -> None:
    logs: list[str] = []
    base = normalize_base_url(cfg.get("base_url") or "")
    interval = max(1, int(cfg.get("interval_sec") or 10))
    count = max(0, int(cfg.get("count") or 0))  # 0 = 直到手动停
    auto_compose = bool(cfg.get("auto_compose", True))
    d = _job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    captured = 0
    last_error = ""

    try:
        if cfg.get("ensure_stream", True):
            es = ensure_stream(base)
            logs.append("ensure_stream: " + json.dumps({k: es.get(k) for k in ("ok", "already", "started", "skipped", "error", "hint") if k in es}, ensure_ascii=False))
            if not es.get("ok"):
                raise RuntimeError(es.get("error") or "无法启动推流")

        _set_job(status="running", logs=list(logs), captured=0, last_error="")

        while not _stop_event.is_set():
            if count and captured >= count:
                break
            t0 = time.time()
            fr = fetch_frame(base)
            if not fr.get("ok"):
                last_error = fr.get("error") or "拉帧失败"
                detail = "; ".join((fr.get("logs") or [])[:3])
                if detail:
                    last_error = f"{last_error}: {detail}"
                logs.append(f"[{_now()}] 失败 #{captured + 1}: {last_error}")
                _set_job(logs=list(logs), last_error=last_error, captured=captured)
                # 短暂退避后重试，不计入成功张数
                if _stop_event.wait(min(5, interval)):
                    break
                continue

            captured += 1
            name = f"frame_{captured:04d}.jpg"
            path = d / name
            path.write_bytes(fr["jpeg"])
            last_error = ""
            msg = f"[{_now()}] #{captured} {name} ({round(len(fr['jpeg']) / 1024, 1)} KB) ← {fr.get('source')}"
            logs.append(msg)
            if len(logs) > 200:
                logs = logs[-150:]
            _set_job(captured=captured, logs=list(logs), last_error="", last_frame=name)
            _update_index_item(job_id, captured=captured, status="running")

            elapsed = time.time() - t0
            wait = interval - elapsed
            if wait > 0 and _stop_event.wait(wait):
                break

        stopped = _stop_event.is_set()
        final_status = "stopped" if stopped and (not count or captured < count) else "captured"
        _update_index_item(job_id, captured=captured, status=final_status, finished_at=_now())
        logs.append(f"[{_now()}] 采集结束，共 {captured} 帧（{final_status}）")

        video = None
        if auto_compose and captured >= 2:
            logs.append(f"[{_now()}] 开始 ffmpeg 合成…")
            _set_job(logs=list(logs), status="composing")
            video = compose_job(job_id, fps=int(cfg.get("output_fps") or 12))
            if video.get("ok"):
                logs.append(f"[{_now()}] 合成完成: {video.get('rel')}（{round(video['size']/1024/1024, 2)} MB）")
                final_status = "done"
            else:
                logs.append(f"[{_now()}] 合成失败: {video.get('error')}")
                final_status = "compose_failed"

        _update_index_item(job_id, captured=captured, status=final_status, finished_at=_now())
        _set_job(
            status="done" if final_status in ("done", "captured", "stopped") else final_status,
            ok=True,
            captured=captured,
            logs=list(logs),
            video=video,
            finished_at=time.time(),
        )
    except Exception as exc:
        logs.append(f"[{_now()}] 异常: {exc}")
        _update_index_item(job_id, status="failed", error=str(exc), captured=captured, finished_at=_now())
        _set_job(status="failed", ok=False, error=str(exc), captured=captured, logs=list(logs), finished_at=time.time())


def start_job(overrides: dict | None = None) -> dict:
    with _lock:
        if _job.get("status") == "running":
            return {"ok": False, "error": "已有延时任务在运行，请先停止", "job": dict(_job)}

    cfg = load_config()
    if overrides:
        for k in ("base_url", "interval_sec", "count", "output_fps", "auto_compose", "ensure_stream"):
            if k in overrides:
                cfg[k] = overrides[k]
        try:
            cfg = save_config(cfg)
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}

    base = normalize_base_url(cfg.get("base_url") or "")
    if not base:
        return {"ok": False, "error": "请先填写摄像头地址，例如 http://192.168.0.108:8080"}

    job_id = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
    item = {
        "id": job_id,
        "created_at": _now(),
        "updated_at": _now(),
        "base_url": base,
        "interval_sec": cfg["interval_sec"],
        "count": cfg["count"],
        "output_fps": cfg["output_fps"],
        "auto_compose": cfg["auto_compose"],
        "status": "running",
        "captured": 0,
    }
    items = _load_index()
    items.insert(0, item)
    _save_index(items)

    _stop_event.clear()
    _set_job(
        id=job_id,
        status="running",
        ok=None,
        captured=0,
        logs=[f"[{_now()}] 任务启动 {job_id} → {base}，间隔 {cfg['interval_sec']}s，目标 {cfg['count'] or '∞'} 张"],
        base_url=base,
        interval_sec=cfg["interval_sec"],
        count=cfg["count"],
        started_at=time.time(),
        error="",
        last_error="",
    )
    threading.Thread(target=_worker, args=(job_id, dict(cfg)), name=f"timelapse-{job_id}", daemon=True).start()
    return {"ok": True, "job_id": job_id, "job": _snapshot_job(), "config": cfg}


def open_store_folder() -> dict:
    _ensure_dirs()
    path = str(STORE_DIR)
    if sys.platform == "win32":
        try:
            os.startfile(path)  # type: ignore[attr-defined]
            return {"ok": True, "path": path}
        except OSError as exc:
            return {"ok": False, "error": str(exc), "path": path}
    return {"ok": False, "error": "仅支持 Windows", "path": path}


def preview_frame(base_url: str | None = None, ensure: bool = True) -> dict:
    """拉一帧用于 UI 预览（不写入任务）。"""
    base = normalize_base_url(base_url or load_config().get("base_url") or "")
    if ensure:
        ensure_stream(base)
    fr = fetch_frame(base)
    if not fr.get("ok"):
        return fr
    # 写临时预览
    _ensure_dirs()
    preview = STORE_DIR / "_preview.jpg"
    preview.write_bytes(fr["jpeg"])
    return {
        "ok": True,
        "size": fr["size"],
        "source": fr.get("source"),
        "rel": "_preview.jpg",
        "url": "/api/timelapse/file?path=_preview.jpg&t=" + str(int(time.time())),
    }
