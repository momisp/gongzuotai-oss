"""系统剪贴板历史：监听、持久化、回写、全局热键弹窗。"""
from __future__ import annotations

import hashlib
import json
import os
import struct
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STORE_DIR = DATA_DIR / "clipboard_history"
FILES_DIR = STORE_DIR / "files"
INDEX_FILE = STORE_DIR / "index.json"
CONFIG_FILE = DATA_DIR / "clipboard_config.json"
ACCOUNT_REGISTRY_FILE = DATA_DIR / "account_registry.json"

DEFAULT_CONFIG = {
    "enabled": True,
    "hotkey": "ctrl+shift+v",
    "max_items": 100,
    "popup_port": 8765,
}

# Win32 constants
CF_TEXT = 1
CF_BITMAP = 2
CF_DIB = 8
CF_UNICODETEXT = 13
CF_HDROP = 15
GMEM_MOVEABLE = 0x0002
BI_RGB = 0

MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
MOD_NOREPEAT = 0x4000
WM_HOTKEY = 0x0312
WM_QUIT = 0x0012

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
    "insert": 0x2D,
    "delete": 0x2E,
    "home": 0x24,
    "end": 0x23,
    "pageup": 0x21,
    "pagedown": 0x22,
    "up": 0x26,
    "down": 0x28,
    "left": 0x25,
    "right": 0x27,
}

_lock = threading.RLock()
_state = {
    "running": False,
    "watcher": None,
    "hotkey": None,
    "last_seq": 0,
    "skip_until": 0.0,
    "popup_proc": None,
    "error": "",
}


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_dirs() -> None:
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


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
        cfg["max_items"] = max(10, min(500, int(cfg.get("max_items") or 100)))
    except (TypeError, ValueError):
        cfg["max_items"] = 100
    try:
        cfg["popup_port"] = int(cfg.get("popup_port") or 8765)
    except (TypeError, ValueError):
        cfg["popup_port"] = 8765
    return cfg


def save_config(updates: dict) -> dict:
    cfg = load_config()
    if "enabled" in updates:
        cfg["enabled"] = bool(updates["enabled"])
    if "hotkey" in updates:
        hk = str(updates.get("hotkey") or "").strip().lower()
        if not hk or not parse_hotkey(hk):
            raise ValueError("无效快捷键，示例：ctrl+shift+v")
        cfg["hotkey"] = hk
    if "max_items" in updates:
        cfg["max_items"] = max(10, min(500, int(updates["max_items"])))
    _ensure_dirs()
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


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


def _load_index() -> list[dict]:
    _ensure_dirs()
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


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:24]


def _trim(items: list[dict], max_items: int) -> list[dict]:
    if len(items) <= max_items:
        return items
    drop = items[max_items:]
    keep = items[:max_items]
    for it in drop:
        _delete_payload(it)
    return keep


def _delete_payload(item: dict) -> None:
    for key in ("file", "thumb"):
        rel = item.get(key)
        if not rel:
            continue
        path = STORE_DIR / rel
        try:
            if path.is_file():
                path.unlink()
        except OSError:
            pass


def list_items(limit: int | None = None, q: str = "") -> list[dict]:
    items = _load_index()
    q = (q or "").strip().lower()
    if q:
        filtered = []
        for it in items:
            blob = " ".join(
                [
                    str(it.get("preview") or ""),
                    str(it.get("type") or ""),
                    " ".join(it.get("paths") or []),
                ]
            ).lower()
            if q in blob:
                filtered.append(it)
        items = filtered
    if limit is not None:
        items = items[: max(0, int(limit))]
    return items


def load_account_registry() -> dict:
    """账号记录体系：整理后的角色/网址/账号，供弹窗上层展示与历史高亮。"""
    empty = {"source": "", "updated_at": "", "note": "", "entries": [], "highlights": []}
    if not ACCOUNT_REGISTRY_FILE.is_file():
        return empty
    try:
        raw = json.loads(ACCOUNT_REGISTRY_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return empty
    if not isinstance(raw, dict):
        return empty
    entries = raw.get("entries") if isinstance(raw.get("entries"), list) else []
    cleaned: list[dict] = []
    for it in entries:
        if not isinstance(it, dict):
            continue
        entry = {
            "id": str(it.get("id") or "").strip() or uuid.uuid4().hex[:10],
            "role": str(it.get("role") or "").strip(),
            "name": str(it.get("name") or "").strip(),
            "platform": str(it.get("platform") or "").strip(),
            "url": str(it.get("url") or "").strip(),
            "username": str(it.get("username") or "").strip(),
            "password": str(it.get("password") or "").strip(),
            "note": str(it.get("note") or "").strip(),
        }
        # 至少要有名称或网址，否则跳过空占位以外的脏数据
        if not (entry["name"] or entry["url"] or entry["note"]):
            continue
        cleaned.append(entry)
    highlights = _account_highlight_tokens(cleaned)
    return {
        "source": str(raw.get("source") or ""),
        "updated_at": str(raw.get("updated_at") or ""),
        "note": str(raw.get("note") or ""),
        "entries": cleaned,
        "highlights": highlights,
    }


def _account_highlight_tokens(entries: list[dict]) -> list[str]:
    """收集用于历史预览高亮的特征值（网址/账号/密码），长词优先。"""
    seen: set[str] = set()
    tokens: list[str] = []
    for it in entries:
        for key in ("url", "username", "password"):
            val = str(it.get(key) or "").strip()
            if len(val) < 4:
                continue
            low = val.lower()
            if low in seen:
                continue
            seen.add(low)
            tokens.append(val)
    tokens.sort(key=len, reverse=True)
    return tokens


def list_account_entries(q: str = "") -> dict:
    reg = load_account_registry()
    entries = list(reg.get("entries") or [])
    q = (q or "").strip().lower()
    if q:
        filtered = []
        for it in entries:
            blob = " ".join(
                [
                    str(it.get("role") or ""),
                    str(it.get("name") or ""),
                    str(it.get("platform") or ""),
                    str(it.get("url") or ""),
                    str(it.get("username") or ""),
                    str(it.get("password") or ""),
                    str(it.get("note") or ""),
                ]
            ).lower()
            if q in blob:
                filtered.append(it)
        entries = filtered
    return {
        "ok": True,
        "entries": entries,
        "count": len(entries),
        "highlights": reg.get("highlights") or [],
        "source": reg.get("source") or "",
        "updated_at": reg.get("updated_at") or "",
        "note": reg.get("note") or "",
    }


def copy_plain_text(text: str) -> dict:
    """弹窗内复制账号字段：写入系统剪贴板并短暂跳过监听，避免刷进历史。"""
    text = str(text or "")
    if not text:
        return {"ok": False, "error": "无内容可复制"}
    if sys.platform != "win32":
        return {"ok": False, "error": "仅支持 Windows"}
    mark_skip_next(1.5)
    ok = _set_clipboard_text(text)
    if not ok:
        return {"ok": False, "error": "写入剪贴板失败（可能被其他程序占用）"}
    return {"ok": True, "chars": len(text)}


def get_item(item_id: str) -> dict | None:
    for it in _load_index():
        if it.get("id") == item_id:
            return it
    return None


def delete_item(item_id: str) -> bool:
    with _lock:
        items = _load_index()
        keep = []
        found = False
        for it in items:
            if it.get("id") == item_id:
                found = True
                _delete_payload(it)
            else:
                keep.append(it)
        if found:
            _save_index(keep)
        return found


def clear_all() -> int:
    with _lock:
        items = _load_index()
        for it in items:
            _delete_payload(it)
        _save_index([])
        return len(items)


def resolve_store_file(rel: str) -> Path | None:
    raw = str(rel or "").replace("\\", "/").lstrip("/")
    if not raw or ".." in raw.split("/"):
        return None
    path = (STORE_DIR / raw).resolve()
    try:
        path.relative_to(STORE_DIR.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def _user32():
    return ctypes.windll.user32


def _kernel32():
    return ctypes.windll.kernel32


def _shell32():
    return ctypes.windll.shell32


_WIN32_READY = False


def _setup_win32() -> None:
    global _WIN32_READY
    if _WIN32_READY or sys.platform != "win32":
        return
    user32 = _user32()
    kernel32 = _kernel32()
    shell32 = _shell32()

    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = wintypes.BOOL
    user32.EmptyClipboard.argtypes = []
    user32.EmptyClipboard.restype = wintypes.BOOL
    user32.IsClipboardFormatAvailable.argtypes = [wintypes.UINT]
    user32.IsClipboardFormatAvailable.restype = wintypes.BOOL
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.GetClipboardData.restype = wintypes.HANDLE
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    user32.GetClipboardSequenceNumber.argtypes = []
    user32.GetClipboardSequenceNumber.restype = wintypes.DWORD
    user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
    user32.RegisterHotKey.restype = wintypes.BOOL
    user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.UnregisterHotKey.restype = wintypes.BOOL
    # 不绑定 PeekMessageW.argtypes：多模块各自有 _MSG，强绑会互相踩崩热键线程
    user32.PeekMessageW.argtypes = None
    user32.PeekMessageW.restype = wintypes.BOOL
    user32.TranslateMessage.argtypes = None
    user32.TranslateMessage.restype = wintypes.BOOL
    user32.DispatchMessageW.argtypes = None
    user32.DispatchMessageW.restype = ctypes.c_ssize_t

    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalUnlock.restype = wintypes.BOOL
    kernel32.GlobalSize.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalSize.restype = ctypes.c_size_t
    kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalFree.restype = wintypes.HGLOBAL

    shell32.DragQueryFileW.argtypes = [wintypes.HANDLE, wintypes.UINT, wintypes.LPWSTR, wintypes.UINT]
    shell32.DragQueryFileW.restype = wintypes.UINT

    _WIN32_READY = True


# delay ctypes import for non-Windows safety
import ctypes
from ctypes import wintypes


class DROPFILES(ctypes.Structure):
    _fields_ = [
        ("pFiles", wintypes.DWORD),
        ("pt_x", wintypes.LONG),
        ("pt_y", wintypes.LONG),
        ("fNC", wintypes.BOOL),
        ("fWide", wintypes.BOOL),
    ]


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD),
        ("biWidth", wintypes.LONG),
        ("biHeight", wintypes.LONG),
        ("biPlanes", wintypes.WORD),
        ("biBitCount", wintypes.WORD),
        ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD),
        ("biXPelsPerMeter", wintypes.LONG),
        ("biYPelsPerMeter", wintypes.LONG),
        ("biClrUsed", wintypes.DWORD),
        ("biClrImportant", wintypes.DWORD),
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


def _open_clipboard(retries: int = 8) -> bool:
    _setup_win32()
    user32 = _user32()
    for _ in range(retries):
        if user32.OpenClipboard(None):
            return True
        time.sleep(0.03)
    return False


def _close_clipboard() -> None:
    try:
        _user32().CloseClipboard()
    except Exception:
        pass


def _read_unicode_text() -> str | None:
    user32 = _user32()
    if not user32.IsClipboardFormatAvailable(CF_UNICODETEXT):
        return None
    handle = user32.GetClipboardData(CF_UNICODETEXT)
    if not handle:
        return None
    ptr = _kernel32().GlobalLock(handle)
    if not ptr:
        return None
    try:
        return ctypes.wstring_at(ptr)
    finally:
        _kernel32().GlobalUnlock(handle)


def _read_hdrop_paths() -> list[str] | None:
    user32 = _user32()
    shell32 = _shell32()
    if not user32.IsClipboardFormatAvailable(CF_HDROP):
        return None
    handle = user32.GetClipboardData(CF_HDROP)
    if not handle:
        return None
    count = shell32.DragQueryFileW(handle, 0xFFFFFFFF, None, 0)
    if count <= 0:
        return []
    paths = []
    buf = ctypes.create_unicode_buffer(1024)
    for i in range(count):
        shell32.DragQueryFileW(handle, i, buf, 1024)
        p = buf.value
        if p:
            paths.append(p)
    return paths


def _read_dib_png_bytes() -> bytes | None:
    user32 = _user32()
    if not user32.IsClipboardFormatAvailable(CF_DIB):
        return None
    handle = user32.GetClipboardData(CF_DIB)
    if not handle:
        return None
    size = _kernel32().GlobalSize(handle)
    ptr = _kernel32().GlobalLock(handle)
    if not ptr or size < ctypes.sizeof(BITMAPINFOHEADER):
        if ptr:
            _kernel32().GlobalUnlock(handle)
        return None
    try:
        dib = ctypes.string_at(ptr, size)
    finally:
        _kernel32().GlobalUnlock(handle)
    try:
        from io import BytesIO

        from PIL import Image

        # CF_DIB is BITMAPINFOHEADER + pixels (no BITMAPFILEHEADER)
        header = BITMAPINFOHEADER.from_buffer_copy(dib[: ctypes.sizeof(BITMAPINFOHEADER)])
        # Build BMP file in memory
        file_header = struct.pack(
            "<2sIHHI",
            b"BM",
            14 + len(dib),
            0,
            0,
            14 + header.biSize + (header.biClrUsed * 4 if header.biBitCount <= 8 else 0),
        )
        img = Image.open(BytesIO(file_header + dib))
        img.load()
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        out = BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()
    except Exception:
        return None


def _capture_clipboard() -> dict | None:
    if sys.platform != "win32":
        return None
    if not _open_clipboard():
        return None
    try:
        paths = _read_hdrop_paths()
        if paths is not None and paths:
            names = [Path(p).name for p in paths]
            preview = "、".join(names[:3])
            if len(names) > 3:
                preview += f" 等 {len(names)} 个文件"
            payload = "\n".join(paths).encode("utf-8")
            return {
                "type": "files",
                "preview": preview,
                "paths": paths,
                "hash": _hash_bytes(payload),
            }

        png = _read_dib_png_bytes()
        if png:
            return {
                "type": "image",
                "preview": f"图片 {len(png) // 1024} KB",
                "png": png,
                "hash": _hash_bytes(png),
            }

        text = _read_unicode_text()
        if text is not None and text != "":
            preview = text.replace("\r\n", "\n").replace("\r", "\n")
            if len(preview) > 120:
                preview = preview[:117] + "…"
            return {
                "type": "text",
                "preview": preview.replace("\n", " "),
                "text": text,
                "hash": _hash_bytes(text.encode("utf-8", errors="replace")),
            }
        return None
    finally:
        _close_clipboard()


def _add_item(capture: dict) -> dict | None:
    cfg = load_config()
    with _lock:
        items = _load_index()
        h = capture.get("hash")
        if h and items and items[0].get("hash") == h:
            items[0]["created_at"] = _now_iso()
            items[0]["count"] = int(items[0].get("count") or 1) + 1
            _save_index(items)
            return items[0]

        item_id = uuid.uuid4().hex[:12]
        item = {
            "id": item_id,
            "type": capture["type"],
            "preview": capture.get("preview") or "",
            "created_at": _now_iso(),
            "hash": h,
            "count": 1,
        }

        if capture["type"] == "text":
            rel = f"files/{item_id}.txt"
            (STORE_DIR / rel).write_text(capture["text"], encoding="utf-8")
            item["file"] = rel
            item["chars"] = len(capture["text"])
        elif capture["type"] == "image":
            rel = f"files/{item_id}.png"
            (STORE_DIR / rel).write_bytes(capture["png"])
            item["file"] = rel
            item["size"] = len(capture["png"])
            # tiny thumb via pillow
            try:
                from io import BytesIO

                from PIL import Image

                img = Image.open(BytesIO(capture["png"]))
                img.thumbnail((160, 160))
                thumb_rel = f"files/{item_id}_thumb.png"
                buf = BytesIO()
                img.save(buf, format="PNG")
                (STORE_DIR / thumb_rel).write_bytes(buf.getvalue())
                item["thumb"] = thumb_rel
            except Exception:
                item["thumb"] = rel
        elif capture["type"] == "files":
            item["paths"] = capture.get("paths") or []
            item["names"] = [Path(p).name for p in item["paths"]]

        items.insert(0, item)
        items = _trim(items, cfg["max_items"])
        _save_index(items)
        return item


def mark_skip_next(seconds: float = 1.2) -> None:
    with _lock:
        _state["skip_until"] = time.time() + seconds


def _watcher_loop() -> None:
    user32 = _user32()
    _state["last_seq"] = int(user32.GetClipboardSequenceNumber() or 0)
    while _state["running"]:
        try:
            cfg = load_config()
            if not cfg.get("enabled", True):
                time.sleep(0.8)
                continue
            seq = int(user32.GetClipboardSequenceNumber() or 0)
            if seq != _state["last_seq"]:
                _state["last_seq"] = seq
                if time.time() < _state["skip_until"]:
                    time.sleep(0.2)
                    continue
                time.sleep(0.08)  # let clipboard settle
                cap = _capture_clipboard()
                if cap:
                    _add_item(cap)
            time.sleep(0.35)
        except Exception as exc:
            _state["error"] = str(exc)
            time.sleep(1.0)


def _set_clipboard_text(text: str) -> bool:
    _setup_win32()
    user32 = _user32()
    kernel32 = _kernel32()
    if not _open_clipboard():
        return False
    try:
        user32.EmptyClipboard()
        data = text.encode("utf-16-le") + b"\x00\x00"
        handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(data))
        if not handle:
            return False
        ptr = kernel32.GlobalLock(handle)
        if not ptr:
            kernel32.GlobalFree(handle)
            return False
        ctypes.memmove(ptr, data, len(data))
        kernel32.GlobalUnlock(handle)
        if not user32.SetClipboardData(CF_UNICODETEXT, handle):
            kernel32.GlobalFree(handle)
            return False
        return True
    finally:
        _close_clipboard()


def _set_clipboard_files(paths: list[str]) -> bool:
    _setup_win32()
    user32 = _user32()
    kernel32 = _kernel32()
    existing = [p for p in paths if Path(p).exists()]
    if not existing:
        return False
    # DROPFILES + double-null-terminated wide path list
    offset = ctypes.sizeof(DROPFILES)
    path_blob = ("\0".join(existing) + "\0\0").encode("utf-16-le")
    total = offset + len(path_blob)
    if not _open_clipboard():
        return False
    try:
        user32.EmptyClipboard()
        handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, total)
        if not handle:
            return False
        ptr = kernel32.GlobalLock(handle)
        if not ptr:
            kernel32.GlobalFree(handle)
            return False
        df = DROPFILES()
        df.pFiles = offset
        df.pt_x = 0
        df.pt_y = 0
        df.fNC = False
        df.fWide = True
        ctypes.memmove(ptr, ctypes.byref(df), offset)
        ctypes.memmove(ptr + offset, path_blob, len(path_blob))
        kernel32.GlobalUnlock(handle)
        if not user32.SetClipboardData(CF_HDROP, handle):
            kernel32.GlobalFree(handle)
            return False
        return True
    finally:
        _close_clipboard()


def _set_clipboard_image_png(png_path: Path) -> bool:
    try:
        from PIL import Image
    except ImportError:
        return False
    img = Image.open(png_path)
    if img.mode != "RGB":
        img = img.convert("RGB")
    # Build CF_DIB (BITMAPINFOHEADER + BGRX bottom-up)
    w, h = img.size
    row_stride = ((w * 3 + 3) // 4) * 4
    pixels = bytearray()
    raw = img.tobytes()
    for y in range(h - 1, -1, -1):
        row = bytearray()
        base = y * w * 3
        for x in range(w):
            i = base + x * 3
            r, g, b = raw[i], raw[i + 1], raw[i + 2]
            row.extend((b, g, r))
        row.extend(b"\x00" * (row_stride - w * 3))
        pixels.extend(row)
    header = BITMAPINFOHEADER()
    header.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    header.biWidth = w
    header.biHeight = h
    header.biPlanes = 1
    header.biBitCount = 24
    header.biCompression = BI_RGB
    header.biSizeImage = len(pixels)
    dib = bytes(header) + bytes(pixels)

    user32 = _user32()
    kernel32 = _kernel32()
    if not _open_clipboard():
        return False
    try:
        user32.EmptyClipboard()
        handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(dib))
        if not handle:
            return False
        ptr = kernel32.GlobalLock(handle)
        if not ptr:
            kernel32.GlobalFree(handle)
            return False
        ctypes.memmove(ptr, dib, len(dib))
        kernel32.GlobalUnlock(handle)
        if not user32.SetClipboardData(CF_DIB, handle):
            kernel32.GlobalFree(handle)
            return False
        return True
    finally:
        _close_clipboard()


def restore_item(item_id: str) -> dict:
    item = get_item(item_id)
    if not item:
        return {"ok": False, "error": "记录不存在"}
    if sys.platform != "win32":
        return {"ok": False, "error": "仅支持 Windows"}

    mark_skip_next(1.5)
    ok = False
    t = item.get("type")
    if t == "text":
        path = resolve_store_file(item.get("file") or "")
        if not path:
            return {"ok": False, "error": "文本文件丢失"}
        text = path.read_text(encoding="utf-8")
        ok = _set_clipboard_text(text)
    elif t == "image":
        path = resolve_store_file(item.get("file") or "")
        if not path:
            return {"ok": False, "error": "图片文件丢失"}
        ok = _set_clipboard_image_png(path)
    elif t == "files":
        paths = item.get("paths") or []
        ok = _set_clipboard_files(paths)
        if not ok:
            # 文件可能已移动：退化为复制路径文本
            ok = _set_clipboard_text("\n".join(paths))
            return {
                "ok": ok,
                "warning": "原文件可能已移动/删除，已改为复制路径文本",
                "item": item,
            }
    else:
        return {"ok": False, "error": f"未知类型: {t}"}

    if not ok:
        return {"ok": False, "error": "写入剪贴板失败（可能被其他程序占用）"}
    return {"ok": True, "item": item}


def open_popup(port: int | None = None) -> dict:
    cfg = load_config()
    port = port or cfg.get("popup_port") or 8765
    url = f"http://127.0.0.1:{port}/clipboard-popup"
    # Prefer Edge/Chrome app window
    candidates = []
    local_app = os.environ.get("LOCALAPPDATA", "")
    program_files = os.environ.get("PROGRAMFILES", r"C:\Program Files")
    program_files_x86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
    for base in (local_app, program_files, program_files_x86):
        if not base:
            continue
        candidates.extend(
            [
                Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
                Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe",
            ]
        )
    # also common install path under LOCALAPPDATA\Google
    if local_app:
        candidates.append(Path(local_app) / "Google" / "Chrome" / "Application" / "chrome.exe")

    for exe in candidates:
        if exe.is_file():
            try:
                proc = subprocess.Popen(
                    [
                        str(exe),
                        f"--app={url}",
                        "--window-size=500,760",
                        "--window-position=80,80",
                        "--disable-features=TranslateUI",
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0,
                )
                _state["popup_proc"] = proc
                return {"ok": True, "url": url, "via": exe.name}
            except OSError:
                continue
    webbrowser.open(url)
    return {"ok": True, "url": url, "via": "browser"}


def _hotkey_loop() -> None:
    _setup_win32()
    user32 = _user32()
    HOTKEY_ID = 0xC11B
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
        # Peek so we can re-check config
        while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 1):
            if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
                try:
                    open_popup()
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
        return {"ok": False, "error": "剪贴板历史仅支持 Windows"}
    _setup_win32()
    with _lock:
        if _state["running"]:
            return status()
        _ensure_dirs()
        _state["running"] = True
        _state["error"] = ""
        w = threading.Thread(target=_watcher_loop, name="clipboard-watcher", daemon=True)
        h = threading.Thread(target=_hotkey_loop, name="clipboard-hotkey", daemon=True)
        _state["watcher"] = w
        _state["hotkey"] = h
        w.start()
        h.start()
    return status()


def stop() -> dict:
    with _lock:
        _state["running"] = False
    return status()


def status() -> dict:
    cfg = load_config()
    items = _load_index()
    return {
        "ok": True,
        "running": bool(_state["running"]),
        "enabled": bool(cfg.get("enabled", True)),
        "hotkey": cfg.get("hotkey"),
        "max_items": cfg.get("max_items"),
        "count": len(items),
        "error": _state.get("error") or "",
        "config": cfg,
    }


def apply_config(updates: dict) -> dict:
    cfg = save_config(updates)
    # hotkey thread picks up changes; restart watcher flags if needed
    return {"ok": True, "config": cfg, "status": status()}
