"""框选区域录屏：全局热键唤起 → 拖拽选区 → 录制 → 同键停止。"""
from __future__ import annotations

import ctypes
import json
import os
import queue
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid
from ctypes import wintypes
from datetime import datetime
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STORE_DIR = DATA_DIR / "region_recordings"
INDEX_FILE = STORE_DIR / "index.json"
CONFIG_FILE = DATA_DIR / "region_record_config.json"

DEFAULT_CONFIG = {
    "enabled": True,
    "hotkey": "ctrl+shift+r",
    "fps": 12,
    "max_items": 80,
}

MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
MOD_NOREPEAT = 0x4000
WM_HOTKEY = 0x0312
WM_QUIT = 0x0012
SRCCOPY = 0x00CC0020
BI_RGB = 0
DIB_RGB_COLORS = 0
SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79

_VK_MAP = {
    **{c: ord(c.upper()) for c in "abcdefghijklmnopqrstuvwxyz"},
    **{str(i): ord(str(i)) for i in range(10)},
    "f1": 0x70,
    "f2": 0x71,
    "f3": 0x72,
    "f4": 0x73,
    "f5": 0x74,
    "f6": 0x75,
    "f7": 0x76,
    "f8": 0x77,
    "f9": 0x78,
    "f10": 0x79,
    "f11": 0x7A,
    "f12": 0x7B,
    "space": 0x20,
    "tab": 0x09,
    "enter": 0x0D,
    "esc": 0x1B,
}

_lock = threading.RLock()
_state = {
    "running": False,
    "hotkey_thread": None,
    "error": "",
    "phase": "idle",  # idle | selecting | recording
    "ffmpeg": "",
    "current": None,  # recording meta
    "proc": None,
    "stop_event": None,
    "select_cancel": None,
    "ui_thread": None,
}

_ui_cmd: queue.Queue = queue.Queue()


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_dirs() -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def parse_hotkey(hotkey: str) -> tuple[int, int] | None:
    parts = [p.strip().lower() for p in str(hotkey or "").replace("-", "+").split("+") if p.strip()]
    if not parts:
        return None
    mods = 0
    key = None
    for p in parts:
        if p in ("ctrl", "control"):
            mods |= MOD_CONTROL
        elif p in ("shift",):
            mods |= MOD_SHIFT
        elif p in ("alt",):
            mods |= MOD_ALT
        elif p in ("win", "super", "meta"):
            mods |= MOD_WIN
        else:
            key = _VK_MAP.get(p)
            if key is None:
                return None
    if key is None:
        return None
    return mods | MOD_NOREPEAT, key


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cfg.update(raw)
        except (OSError, json.JSONDecodeError):
            pass
    cfg["enabled"] = bool(cfg.get("enabled", True))
    hotkey = str(cfg.get("hotkey") or DEFAULT_CONFIG["hotkey"]).strip().lower()
    cfg["hotkey"] = hotkey or DEFAULT_CONFIG["hotkey"]
    try:
        cfg["fps"] = max(5, min(30, int(cfg.get("fps") or 12)))
    except (TypeError, ValueError):
        cfg["fps"] = 12
    try:
        cfg["max_items"] = max(10, min(300, int(cfg.get("max_items") or 80)))
    except (TypeError, ValueError):
        cfg["max_items"] = 80
    return cfg


def save_config(updates: dict) -> dict:
    cfg = load_config()
    if "enabled" in updates:
        cfg["enabled"] = bool(updates["enabled"])
    if "hotkey" in updates:
        hk = str(updates.get("hotkey") or "").strip().lower()
        if not hk or not parse_hotkey(hk):
            raise ValueError("无效快捷键，示例：ctrl+shift+r")
        cfg["hotkey"] = hk
    if "fps" in updates:
        cfg["fps"] = max(5, min(30, int(updates["fps"])))
    if "max_items" in updates:
        cfg["max_items"] = max(10, min(300, int(updates["max_items"])))
    _ensure_dirs()
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def apply_config(updates: dict) -> dict:
    cfg = save_config(updates)
    return {"ok": True, "config": cfg, "status": status()}


def _load_index() -> list[dict]:
    if not INDEX_FILE.exists():
        return []
    try:
        raw = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_index(items: list[dict]) -> None:
    _ensure_dirs()
    INDEX_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _trim(items: list[dict], max_items: int) -> list[dict]:
    keep = items[:max_items]
    drop = items[max_items:]
    for it in drop:
        for key in ("file", "thumb"):
            rel = it.get(key)
            if not rel:
                continue
            p = STORE_DIR / rel
            try:
                if p.is_file():
                    p.unlink()
            except OSError:
                pass
    return keep


def list_items(limit: int | None = None) -> list[dict]:
    items = _load_index()
    if limit is not None:
        items = items[: max(0, limit)]
    return items


def get_item(item_id: str) -> dict | None:
    for it in _load_index():
        if it.get("id") == item_id:
            return it
    return None


def delete_item(item_id: str) -> bool:
    items = _load_index()
    keep = []
    found = False
    for it in items:
        if it.get("id") == item_id:
            found = True
            for key in ("file", "thumb"):
                rel = it.get(key)
                if rel:
                    p = STORE_DIR / rel
                    try:
                        if p.is_file():
                            p.unlink()
                    except OSError:
                        pass
        else:
            keep.append(it)
    if found:
        _save_index(keep)
    return found


def clear_all() -> int:
    items = _load_index()
    n = len(items)
    for it in items:
        for key in ("file", "thumb"):
            rel = it.get(key)
            if rel:
                p = STORE_DIR / rel
                try:
                    if p.is_file():
                        p.unlink()
                except OSError:
                    pass
    _save_index([])
    return n


def resolve_store_file(rel: str) -> Path | None:
    rel = str(rel or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        return None
    path = (STORE_DIR / rel).resolve()
    try:
        path.relative_to(STORE_DIR.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def find_ffmpeg() -> str:
    with _lock:
        cached = _state.get("ffmpeg") or ""
        if cached and Path(cached).is_file():
            return cached
    which = shutil.which("ffmpeg")
    if which:
        with _lock:
            _state["ffmpeg"] = which
        return which
    candidates = []
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
    for p in candidates:
        if p.is_file():
            with _lock:
                _state["ffmpeg"] = str(p)
            return str(p)
    return ""


def _setup_win32() -> None:
    if sys.platform != "win32":
        raise RuntimeError("区域录屏仅支持 Windows")
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def _user32():
    return ctypes.windll.user32


def _gdi32():
    return ctypes.windll.gdi32


def _virtual_screen() -> tuple[int, int, int, int]:
    u = _user32()
    x = int(u.GetSystemMetrics(SM_XVIRTUALSCREEN))
    y = int(u.GetSystemMetrics(SM_YVIRTUALSCREEN))
    w = int(u.GetSystemMetrics(SM_CXVIRTUALSCREEN))
    h = int(u.GetSystemMetrics(SM_CYVIRTUALSCREEN))
    if w <= 0 or h <= 0:
        w = int(u.GetSystemMetrics(0))
        h = int(u.GetSystemMetrics(1))
        x, y = 0, 0
    return x, y, w, h


class _BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", ctypes.c_uint32),
        ("biWidth", ctypes.c_int32),
        ("biHeight", ctypes.c_int32),
        ("biPlanes", ctypes.c_uint16),
        ("biBitCount", ctypes.c_uint16),
        ("biCompression", ctypes.c_uint32),
        ("biSizeImage", ctypes.c_uint32),
        ("biXPelsPerMeter", ctypes.c_int32),
        ("biYPelsPerMeter", ctypes.c_int32),
        ("biClrUsed", ctypes.c_uint32),
        ("biClrImportant", ctypes.c_uint32),
    ]


class _MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("message", wintypes.UINT),
        ("wParam", wintypes.WPARAM),
        ("lParam", wintypes.LPARAM),
        ("time", wintypes.DWORD),
        ("pt_x", wintypes.LONG),
        ("pt_y", wintypes.LONG),
    ]


def _capture_region_rgb(x: int, y: int, w: int, h: int) -> bytes | None:
    """返回 RGB 顶部向下的原始像素。"""
    user32 = _user32()
    gdi32 = _gdi32()
    hdc = user32.GetDC(None)
    if not hdc:
        return None
    mem = gdi32.CreateCompatibleDC(hdc)
    bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
    old = gdi32.SelectObject(mem, bmp)
    ok = gdi32.BitBlt(mem, 0, 0, w, h, hdc, x, y, SRCCOPY)
    if not ok:
        gdi32.SelectObject(mem, old)
        gdi32.DeleteObject(bmp)
        gdi32.DeleteDC(mem)
        user32.ReleaseDC(None, hdc)
        return None

    bmi = _BITMAPINFOHEADER()
    bmi.biSize = ctypes.sizeof(_BITMAPINFOHEADER)
    bmi.biWidth = w
    bmi.biHeight = -h  # top-down
    bmi.biPlanes = 1
    bmi.biBitCount = 24
    bmi.biCompression = BI_RGB
    row = ((w * 3 + 3) // 4) * 4
    buf = (ctypes.c_char * (row * h))()
    got = gdi32.GetDIBits(mem, bmp, 0, h, buf, ctypes.byref(bmi), DIB_RGB_COLORS)
    gdi32.SelectObject(mem, old)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mem)
    user32.ReleaseDC(None, hdc)
    if not got:
        return None

    raw = bytes(buf)
    out = bytearray(w * h * 3)
    for yi in range(h):
        src = yi * row
        dst = yi * w * 3
        for xi in range(w):
            b = raw[src + xi * 3]
            g = raw[src + xi * 3 + 1]
            r = raw[src + xi * 3 + 2]
            out[dst + xi * 3] = r
            out[dst + xi * 3 + 1] = g
            out[dst + xi * 3 + 2] = b
    return bytes(out)


def _even(n: int) -> int:
    return n if n % 2 == 0 else n - 1


def _normalize_rect(x1: int, y1: int, x2: int, y2: int) -> tuple[int, int, int, int] | None:
    left = min(x1, x2)
    top = min(y1, y2)
    right = max(x1, x2)
    bottom = max(y1, y2)
    w = right - left
    h = bottom - top
    if w < 16 or h < 16:
        return None
    # keep even sizes for encoders
    w = max(16, _even(w))
    h = max(16, _even(h))
    return left, top, w, h


def _write_mjpeg_avi(path: Path, frames: list[bytes], fps: int, width: int, height: int) -> None:
    """无 ffmpeg 时的回退：MJPEG AVI（系统播放器 / VLC 可播）。"""
    n = len(frames)
    if n <= 0:
        raise RuntimeError("没有可用帧")
    fps = max(1, int(fps))
    movi = bytearray()
    offsets: list[int] = []
    for jpeg in frames:
        pad = len(jpeg) % 2
        offsets.append(len(movi))
        movi += b"00dc"
        movi += struct.pack("<I", len(jpeg) + pad)
        movi += jpeg
        if pad:
            movi += b"\x00"

    micros = int(1_000_000 / fps)
    avih = struct.pack(
        "<14I",
        micros,
        max(1000, width * height),
        0,
        0x10,
        n,
        0,
        1,
        0,
        width,
        height,
        0,
        0,
        0,
        0,
    )
    # AVISTREAMHEADER (56 bytes)
    strh = struct.pack(
        "<4s4sIHHIIIIIIII4H",
        b"vids",
        b"MJPG",
        0,
        0,
        0,
        0,
        1,
        fps,
        0,
        n,
        0,
        0xFFFFFFFF,
        0,
        0,
        0,
        width,
        height,
    )
    strf = struct.pack(
        "<IiiHHIIiiII",
        40,
        width,
        height,
        1,
        24,
        0x47504A4D,
        width * height * 3,
        0,
        0,
        0,
        0,
    )
    strl_body = b"strh" + struct.pack("<I", len(strh)) + strh
    strl_body += b"strf" + struct.pack("<I", len(strf)) + strf
    hdrl_body = b"avih" + struct.pack("<I", len(avih)) + avih
    hdrl_body += b"LIST" + struct.pack("<I", 4 + len(strl_body)) + b"strl" + strl_body
    hdrl = b"LIST" + struct.pack("<I", 4 + len(hdrl_body)) + b"hdrl" + hdrl_body
    movi_chunk = b"LIST" + struct.pack("<I", 4 + len(movi)) + b"movi" + movi

    idx = bytearray()
    for off, jpeg in zip(offsets, frames):
        pad = len(jpeg) % 2
        # offset from start of 'movi' fourcc
        idx += b"00dc" + struct.pack("<III", 0x10, 4 + off, len(jpeg) + pad)
    idx1 = b"idx1" + struct.pack("<I", len(idx)) + idx

    riff_size = 4 + len(hdrl) + len(movi_chunk) + len(idx1)
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", riff_size) + b"AVI ")
        f.write(hdrl)
        f.write(movi_chunk)
        f.write(idx1)


def _rgb_to_jpeg(rgb: bytes, w: int, h: int, quality: int = 75) -> bytes:
    from PIL import Image

    img = Image.frombytes("RGB", (w, h), rgb)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def _make_thumb(rgb: bytes, w: int, h: int, dest: Path) -> None:
    from PIL import Image

    img = Image.frombytes("RGB", (w, h), rgb)
    img.thumbnail((240, 240))
    img.save(dest, format="JPEG", quality=80)


def _add_recording_item(meta: dict) -> dict:
    cfg = load_config()
    with _lock:
        items = _load_index()
        items.insert(0, meta)
        items = _trim(items, cfg["max_items"])
        _save_index(items)
    return meta


def _finish_recording(ok: bool, error: str = "") -> None:
    with _lock:
        cur = _state.get("current")
        _state["proc"] = None
        _state["stop_event"] = None
        _state["phase"] = "idle"
        _state["current"] = None
        if error:
            _state["error"] = error
        elif ok:
            _state["error"] = ""
    _ui_cmd.put(("hide_stop", None))
    if not cur:
        return
    path = Path(cur["path"])
    if not ok or not path.is_file() or path.stat().st_size < 64:
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass
        if error:
            _state["error"] = error or "录制失败"
        return
    ended = time.time()
    duration = max(0.1, ended - float(cur.get("started_at") or ended))
    item = {
        "id": cur["id"],
        "file": cur["rel"],
        "thumb": cur.get("thumb_rel") or "",
        "created_at": _now_iso(),
        "duration": round(duration, 1),
        "width": cur["w"],
        "height": cur["h"],
        "fps": cur["fps"],
        "size": path.stat().st_size,
        "engine": cur.get("engine") or "",
        "preview": f"{cur['w']}×{cur['h']} · {round(duration, 1)}s",
    }
    _add_recording_item(item)


def _record_with_ffmpeg(x: int, y: int, w: int, h: int, fps: int, out_path: Path, stop_event: threading.Event, ffmpeg: str) -> None:
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "gdigrab",
        "-framerate",
        str(fps),
        "-offset_x",
        str(x),
        "-offset_y",
        str(y),
        "-video_size",
        f"{w}x{h}",
        "-i",
        "desktop",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "ultrafast",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    creation = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        creationflags=creation,
    )
    with _lock:
        _state["proc"] = proc
    # first frame thumb
    time.sleep(0.25)
    rgb = _capture_region_rgb(x, y, w, h)
    if rgb and _state.get("current"):
        thumb_rel = _state["current"].get("thumb_rel")
        if thumb_rel:
            try:
                _make_thumb(rgb, w, h, STORE_DIR / thumb_rel)
            except Exception:
                pass
    while not stop_event.is_set():
        if proc.poll() is not None:
            break
        time.sleep(0.15)
    try:
        if proc.poll() is None and proc.stdin:
            proc.stdin.write(b"q")
            proc.stdin.flush()
    except Exception:
        pass
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()
    err = ""
    if proc.returncode not in (0, None) and not out_path.is_file():
        try:
            err = (proc.stderr.read() or b"").decode("utf-8", errors="replace")[-400:]
        except Exception:
            err = f"ffmpeg exit={proc.returncode}"
    _finish_recording(out_path.is_file() and out_path.stat().st_size > 64, err)


def _record_with_gdi(x: int, y: int, w: int, h: int, fps: int, out_path: Path, stop_event: threading.Event) -> None:
    interval = 1.0 / max(1, fps)
    frames: list[bytes] = []
    first_rgb = None
    while not stop_event.is_set():
        tick = time.time()
        rgb = _capture_region_rgb(x, y, w, h)
        if rgb:
            if first_rgb is None:
                first_rgb = rgb
                thumb_rel = (_state.get("current") or {}).get("thumb_rel")
                if thumb_rel:
                    try:
                        _make_thumb(rgb, w, h, STORE_DIR / thumb_rel)
                    except Exception:
                        pass
            try:
                frames.append(_rgb_to_jpeg(rgb, w, h, quality=72))
            except Exception as exc:
                _finish_recording(False, f"编码帧失败: {exc}")
                return
        sleep_for = interval - (time.time() - tick)
        if sleep_for > 0:
            stop_event.wait(sleep_for)
        # safety: avoid unbounded memory (~3 min @12fps)
        if len(frames) >= fps * 180:
            break
    if not frames:
        _finish_recording(False, "未捕获到画面")
        return
    try:
        _write_mjpeg_avi(out_path, frames, fps, w, h)
        _finish_recording(True)
    except Exception as exc:
        _finish_recording(False, str(exc))


def _start_recording(rect: tuple[int, int, int, int]) -> None:
    x, y, w, h = rect
    cfg = load_config()
    fps = int(cfg["fps"])
    _ensure_dirs()
    item_id = uuid.uuid4().hex[:12]
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    ffmpeg = find_ffmpeg()
    ext = "mp4" if ffmpeg else "avi"
    rel = f"{stamp}_{item_id}.{ext}"
    thumb_rel = f"{stamp}_{item_id}_thumb.jpg"
    path = STORE_DIR / rel
    stop_event = threading.Event()
    meta = {
        "id": item_id,
        "path": str(path),
        "rel": rel,
        "thumb_rel": thumb_rel,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "fps": fps,
        "started_at": time.time(),
        "engine": "ffmpeg" if ffmpeg else "gdi-avi",
    }
    with _lock:
        _state["phase"] = "recording"
        _state["current"] = meta
        _state["stop_event"] = stop_event
        _state["error"] = ""
    _ui_cmd.put(("show_stop", {"w": w, "h": h}))

    def worker():
        try:
            if ffmpeg:
                _record_with_ffmpeg(x, y, w, h, fps, path, stop_event, ffmpeg)
            else:
                _record_with_gdi(x, y, w, h, fps, path, stop_event)
        except Exception as exc:
            _finish_recording(False, str(exc))

    threading.Thread(target=worker, name="region-record", daemon=True).start()


def stop_recording() -> dict:
    with _lock:
        if _state["phase"] != "recording":
            return {"ok": False, "error": "当前未在录制"}
        ev = _state.get("stop_event")
        if ev:
            ev.set()
    return {"ok": True, "message": "正在停止…"}


def begin_select() -> dict:
    with _lock:
        if _state["phase"] == "recording":
            return stop_recording()
        if _state["phase"] == "selecting":
            return {"ok": True, "message": "已在选区中"}
        _state["phase"] = "selecting"
        _state["error"] = ""
    _ui_cmd.put(("select", None))
    return {"ok": True, "message": "请拖拽框选录制区域"}


def _on_hotkey() -> None:
    with _lock:
        phase = _state["phase"]
        holder = _state.get("select_cancel")
    if phase == "recording":
        stop_recording()
    elif phase == "selecting":
        if isinstance(holder, dict):
            holder["cancel"] = True
        _ui_cmd.put(("cancel_select", None))
    else:
        begin_select()


def _run_selector(parent, result_holder: dict) -> None:
    """全屏半透明框选。在 UI 线程调用。"""
    import tkinter as tk

    vx, vy, vw, vh = _virtual_screen()
    win = tk.Toplevel(parent)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    try:
        win.attributes("-alpha", 0.35)
    except tk.TclError:
        pass
    win.configure(bg="#111111")
    win.geometry(f"{vw}x{vh}+{vx}+{vy}")
    canvas = tk.Canvas(win, width=vw, height=vh, highlightthickness=0, cursor="crosshair", bg="#111111")
    canvas.pack(fill="both", expand=True)
    canvas.create_text(
        vw // 2,
        36,
        text="拖拽框选录制区域 · Esc 取消 · 松开鼠标开始",
        fill="#ffffff",
        font=("Microsoft YaHei UI", 14),
    )
    start = {"x": 0, "y": 0}
    box = {"id": None}
    done = {"v": False}

    def to_screen(sx: int, sy: int) -> tuple[int, int]:
        return vx + sx, vy + sy

    def on_press(e):
        start["x"], start["y"] = e.x, e.y
        if box["id"] is not None:
            canvas.delete(box["id"])
        box["id"] = canvas.create_rectangle(e.x, e.y, e.x, e.y, outline="#22c55e", width=2)

    def on_drag(e):
        if box["id"] is not None:
            canvas.coords(box["id"], start["x"], start["y"], e.x, e.y)

    def finish(ok_rect):
        if done["v"]:
            return
        done["v"] = True
        result_holder["rect"] = ok_rect
        try:
            win.grab_release()
        except Exception:
            pass
        try:
            win.destroy()
        except Exception:
            pass

    def on_release(e):
        rect = _normalize_rect(*to_screen(start["x"], start["y"]), *to_screen(e.x, e.y))
        finish(rect)

    def on_escape(_e=None):
        finish(None)

    canvas.bind("<ButtonPress-1>", on_press)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    win.bind("<Escape>", on_escape)
    win.focus_force()
    try:
        win.grab_set()
    except Exception:
        pass

    def poll_cancel():
        if done["v"]:
            return
        if result_holder.get("cancel"):
            finish(None)
            return
        try:
            win.after(80, poll_cancel)
        except Exception:
            pass

    poll_cancel()
    win.wait_window()


def _show_stop_bar(info: dict):
    import tkinter as tk

    root = getattr(_show_stop_bar, "_root", None)
    if root is None:
        return None
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.configure(bg="#1f2937")
    w = info.get("w") or 0
    h = info.get("h") or 0
    label = tk.Label(
        win,
        text=f"● 录制中 {w}×{h}  ·  再按快捷键或点此停止",
        fg="#fecaca",
        bg="#1f2937",
        font=("Microsoft YaHei UI", 11),
        padx=14,
        pady=10,
    )
    label.pack(side="left")
    btn = tk.Button(
        win,
        text="停止",
        command=lambda: stop_recording(),
        bg="#dc2626",
        fg="#fff",
        relief="flat",
        padx=12,
        pady=6,
        font=("Microsoft YaHei UI", 11, "bold"),
    )
    btn.pack(side="left", padx=(0, 10), pady=6)
    vx, vy, vw, vh = _virtual_screen()
    win.update_idletasks()
    ww, wh = win.winfo_reqwidth(), win.winfo_reqheight()
    win.geometry(f"+{vx + vw - ww - 24}+{vy + vh - wh - 48}")
    return win


def _ui_loop() -> None:
    """常驻隐藏 Tk 根窗口，处理框选 / 停止条。"""
    import tkinter as tk

    _setup_win32()
    root = tk.Tk()
    root.withdraw()
    _show_stop_bar._root = root  # type: ignore[attr-defined]
    stop_win = {"win": None}

    def tick():
        try:
            while True:
                cmd, payload = _ui_cmd.get_nowait()
                if cmd == "select":
                    holder = {"rect": None, "cancel": False}
                    with _lock:
                        _state["select_cancel"] = holder
                        _state["phase"] = "selecting"
                    _run_selector(root, holder)
                    with _lock:
                        _state["select_cancel"] = None
                        if _state["phase"] == "selecting":
                            _state["phase"] = "idle"
                    rect = holder.get("rect")
                    if rect:
                        # 稍等一帧，让选区窗消失后再抓屏
                        root.after(120, lambda r=rect: _start_recording(r))
                elif cmd == "cancel_select":
                    holder = _state.get("select_cancel")
                    if isinstance(holder, dict):
                        holder["cancel"] = True
                elif cmd == "show_stop":
                    try:
                        if stop_win["win"] is not None:
                            stop_win["win"].destroy()
                    except Exception:
                        pass
                    stop_win["win"] = _show_stop_bar(payload or {})
                elif cmd == "hide_stop":
                    try:
                        if stop_win["win"] is not None:
                            stop_win["win"].destroy()
                    except Exception:
                        pass
                    stop_win["win"] = None
        except queue.Empty:
            pass
        root.after(50, tick)

    root.after(50, tick)
    root.mainloop()


def _hotkey_loop() -> None:
    _setup_win32()
    user32 = _user32()
    HOTKEY_ID = 0xC22A
    registered = False
    current_hk = ""
    while _state["running"]:
        cfg = load_config()
        hk = cfg.get("hotkey") or DEFAULT_CONFIG["hotkey"]
        if cfg.get("enabled", True) and hk != current_hk:
            if registered:
                user32.UnregisterHotKey(None, HOTKEY_ID)
                registered = False
            parsed = parse_hotkey(hk)
            if parsed:
                mods, vk = parsed
                if user32.RegisterHotKey(None, HOTKEY_ID, mods, vk):
                    registered = True
                    current_hk = hk
                    _state["error"] = ""
                else:
                    _state["error"] = f"注册快捷键失败（可能被占用）: {hk}"
                    current_hk = ""
            else:
                _state["error"] = f"无效快捷键: {hk}"
                current_hk = ""
        elif not cfg.get("enabled", True) and registered:
            user32.UnregisterHotKey(None, HOTKEY_ID)
            registered = False
            current_hk = ""

        msg = _MSG()
        while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 1):
            if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
                try:
                    _on_hotkey()
                except Exception as exc:
                    _state["error"] = str(exc)
            elif msg.message == WM_QUIT:
                break
            else:
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
        time.sleep(0.05)

    if registered:
        user32.UnregisterHotKey(None, HOTKEY_ID)


def start() -> dict:
    if sys.platform != "win32":
        return {"ok": False, "error": "区域录屏仅支持 Windows"}
    _setup_win32()
    find_ffmpeg()
    with _lock:
        if _state["running"]:
            return status()
        _ensure_dirs()
        _state["running"] = True
        _state["error"] = ""
        ui = threading.Thread(target=_ui_loop, name="region-record-ui", daemon=True)
        hk = threading.Thread(target=_hotkey_loop, name="region-record-hotkey", daemon=True)
        _state["ui_thread"] = ui
        _state["hotkey_thread"] = hk
        ui.start()
        hk.start()
    return status()


def stop() -> dict:
    with _lock:
        if _state["phase"] == "recording":
            ev = _state.get("stop_event")
            if ev:
                ev.set()
        _state["running"] = False
        holder = _state.get("select_cancel")
        if isinstance(holder, dict):
            holder["cancel"] = True
    return status()


def status() -> dict:
    cfg = load_config()
    items = _load_index()
    with _lock:
        phase = _state["phase"]
        cur = _state.get("current")
        err = _state.get("error") or ""
        running = bool(_state["running"])
        ffmpeg = _state.get("ffmpeg") or find_ffmpeg()
    cur_out = None
    if cur:
        cur_out = {
            "id": cur.get("id"),
            "width": cur.get("w"),
            "height": cur.get("h"),
            "fps": cur.get("fps"),
            "engine": cur.get("engine"),
            "elapsed": round(time.time() - float(cur.get("started_at") or time.time()), 1),
        }
    return {
        "ok": True,
        "running": running,
        "enabled": bool(cfg.get("enabled", True)),
        "hotkey": cfg.get("hotkey"),
        "fps": cfg.get("fps"),
        "max_items": cfg.get("max_items"),
        "phase": phase,
        "recording": cur_out,
        "count": len(items),
        "ffmpeg": ffmpeg or "",
        "engine": "ffmpeg" if ffmpeg else "gdi-avi",
        "error": err,
        "config": cfg,
        "store_dir": str(STORE_DIR),
    }


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
