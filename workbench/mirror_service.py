"""浏览器内设备投屏（MJPEG）与触控注入。"""
from __future__ import annotations

import re
import subprocess
import sys
import threading
import time
from io import BytesIO

from adb_service import _subprocess_flags, run_adb

try:
    from PIL import Image

    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False

_mirror_lock = threading.Lock()
_sessions: dict[str, "_MirrorSession"] = {}

KEYCODES = {
    "back": 4,
    "home": 3,
    "recents": 187,
    "power": 26,
    "volume_up": 24,
    "volume_down": 25,
}


def _run_adb_bytes(args: list[str], timeout: float = 30, serial: str | None = None) -> tuple[int, bytes, bytes]:
    cmd = ["adb"]
    if serial:
        cmd.extend(["-s", serial])
    cmd.extend(args)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=timeout,
            creationflags=_subprocess_flags(),
        )
        return proc.returncode, proc.stdout or b"", proc.stderr or b""
    except FileNotFoundError:
        return 127, b"", b"adb not found"
    except subprocess.TimeoutExpired:
        return 124, b"", b"timeout"


def get_device_size(serial: str) -> tuple[int, int]:
    code, out, _ = run_adb(["shell", "wm", "size"], timeout=10, serial=serial)
    text = out or ""
    if code != 0:
        return 1080, 1920
    physical = re.search(r"Physical size:\s*(\d+)x(\d+)", text)
    if physical:
        return int(physical.group(1)), int(physical.group(2))
    override = re.search(r"Override size:\s*(\d+)x(\d+)", text)
    if override:
        return int(override.group(1)), int(override.group(2))
    any_size = re.search(r"(\d+)x(\d+)", text)
    if any_size:
        return int(any_size.group(1)), int(any_size.group(2))
    return 1080, 1920


def _png_to_jpeg(png_bytes: bytes, quality: int = 72) -> bytes:
    if not _HAS_PIL or not png_bytes:
        return png_bytes
    img = Image.open(BytesIO(png_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


class _MirrorSession:
    def __init__(self, serial: str):
        self.serial = serial
        self.stop_event = threading.Event()
        self.frame_lock = threading.Lock()
        self.latest_frame = b""
        self.content_type = "image/jpeg" if _HAS_PIL else "image/png"
        self.width = 1080
        self.height = 1920
        self.fps = 0.0
        self.frames = 0
        self.error = ""
        self.thread: threading.Thread | None = None
        self._fps_t0 = time.time()
        self._fps_count = 0

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.error = ""
        self.width, self.height = get_device_size(self.serial)
        self.thread = threading.Thread(target=self._loop, name=f"mirror-{self.serial}", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2)
        with self.frame_lock:
            self.latest_frame = b""

    def _loop(self) -> None:
        target_interval = 0.09
        while not self.stop_event.is_set():
            t0 = time.time()
            code, raw, err = _run_adb_bytes(["exec-out", "screencap", "-p"], timeout=20, serial=self.serial)
            if code != 0 or not raw:
                self.error = (err or b"screencap failed").decode("utf-8", errors="replace")
                time.sleep(0.5)
                continue
            self.error = ""
            if _HAS_PIL:
                frame = _png_to_jpeg(raw)
                ctype = "image/jpeg"
            else:
                frame = raw
                ctype = "image/png"
            with self.frame_lock:
                self.latest_frame = frame
                self.content_type = ctype
            self.frames += 1
            self._fps_count += 1
            elapsed = time.time() - self._fps_t0
            if elapsed >= 1.0:
                self.fps = round(self._fps_count / elapsed, 1)
                self._fps_count = 0
                self._fps_t0 = time.time()
            sleep_for = target_interval - (time.time() - t0)
            if sleep_for > 0:
                time.sleep(sleep_for)


def _get_session(serial: str, create: bool = False) -> _MirrorSession | None:
    serial = (serial or "").strip()
    if not serial:
        return None
    with _mirror_lock:
        if create and serial not in _sessions:
            _sessions[serial] = _MirrorSession(serial)
        return _sessions.get(serial)


def start_mirror(serial: str) -> dict:
    serial = (serial or "").strip()
    if not serial:
        return {"ok": False, "error": "未指定设备 serial"}
    session = _get_session(serial, create=True)
    assert session is not None
    session.start()
    return mirror_status(serial)


def stop_mirror(serial: str | None = None) -> dict:
    with _mirror_lock:
        if serial:
            s = serial.strip()
            session = _sessions.pop(s, None)
            if session:
                session.stop()
            return {"ok": True, "serial": s}
        stopped = list(_sessions.keys())
        for s in list(_sessions.keys()):
            _sessions[s].stop()
        _sessions.clear()
        return {"ok": True, "stopped": stopped}


def mirror_status(serial: str | None = None) -> dict:
    if not serial:
        with _mirror_lock:
            return {
                "ok": True,
                "sessions": {
                    s: {
                        "running": sess.thread is not None and sess.thread.is_alive(),
                        "width": sess.width,
                        "height": sess.height,
                        "fps": sess.fps,
                        "error": sess.error,
                    }
                    for s, sess in _sessions.items()
                },
            }
    session = _get_session(serial.strip())
    if not session:
        return {"ok": True, "serial": serial, "running": False}
    running = session.thread is not None and session.thread.is_alive()
    return {
        "ok": True,
        "serial": serial,
        "running": running,
        "width": session.width,
        "height": session.height,
        "fps": session.fps,
        "frames": session.frames,
        "error": session.error,
        "has_pillow": _HAS_PIL,
    }


def iter_mjpeg_frames(serial: str):
    """生成 multipart MJPEG 流。"""
    session = _get_session(serial.strip())
    if not session:
        return
    boundary = b"--frame"
    # 等待首帧
    for _ in range(50):
        with session.frame_lock:
            frame = session.latest_frame
            ctype = session.content_type
        if frame:
            break
        time.sleep(0.05)
    while not session.stop_event.is_set():
        with session.frame_lock:
            frame = session.latest_frame
            ctype = session.content_type
        if frame:
            yield boundary + b"\r\nContent-Type: " + ctype.encode() + b"\r\n\r\n" + frame + b"\r\n"
        time.sleep(0.08)


def inject_tap(serial: str, x: int, y: int) -> dict:
    x, y = max(0, int(x)), max(0, int(y))
    code, out, err = run_adb(["shell", "input", "tap", str(x), str(y)], timeout=10, serial=serial)
    ok = code == 0
    return {"ok": ok, "error": "" if ok else (err or out or "tap failed")}


def inject_swipe(
    serial: str,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    duration_ms: int = 280,
) -> dict:
    args = ["shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(max(50, int(duration_ms)))]
    code, out, err = run_adb(args, timeout=15, serial=serial)
    ok = code == 0
    return {"ok": ok, "error": "" if ok else (err or out or "swipe failed")}


def inject_key(serial: str, key: str) -> dict:
    key = (key or "").strip().lower()
    code_val = KEYCODES.get(key)
    if code_val is None:
        return {"ok": False, "error": f"未知按键: {key}"}
    code, out, err = run_adb(["shell", "input", "keyevent", str(code_val)], timeout=10, serial=serial)
    ok = code == 0
    return {"ok": ok, "error": "" if ok else (err or out or "keyevent failed")}
