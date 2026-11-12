# -*- coding: utf-8 -*-
"""微信链接申诉 — 列表持久化、后台任务、截图管理"""
from __future__ import annotations

import json
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import wechat_appeal_runner as runner

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "wechat_appeal"
INDEX_FILE = DATA_DIR / "index.json"
SCREENSHOT_DIR = DATA_DIR / "screenshots"

_lock = threading.Lock()
_stop_event = threading.Event()
_job: dict = {}
_items_cache: list[dict] | None = None

STATUS_LABEL = {
    "pending": "未申诉",
    "checking": "检测中",
    "skipped": "可直接打开",
    "appealing": "申诉中",
    "done": "已申诉",
    "failed": "失败",
}


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def _load_items() -> list[dict]:
    global _items_cache
    _ensure_dirs()
    if not INDEX_FILE.exists():
        _items_cache = []
        return _items_cache
    try:
        raw = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        _items_cache = raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        _items_cache = []
    return _items_cache


def _save_items(items: list[dict]) -> None:
    global _items_cache
    _ensure_dirs()
    INDEX_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _items_cache = items


def _find_item(items: list[dict], item_id: str) -> dict | None:
    for it in items:
        if it.get("id") == item_id:
            return it
    return None


def reset_stuck_items() -> int:
    """任务未运行时，把卡住的「检测中/申诉中」恢复为「未申诉」。"""
    with _lock:
        running = _job.get("status") == "running"
        current_id = str(_job.get("current_id") or "") if running else ""
    if running and current_id:
        # 仅保留当前正在跑的那条，其余卡住的都回退
        pass
    items = _load_items()
    changed = 0
    for it in items:
        st = it.get("status")
        if st not in ("checking", "appealing"):
            continue
        if running and it.get("id") == current_id:
            continue
        it["status"] = "pending"
        it["remark"] = "已恢复为未申诉"
        it["updated_at"] = _now()
        changed += 1
    if changed:
        _save_items(items)
    return changed


def list_items() -> dict:
    reset_stuck_items()
    items = _load_items()
    ok, err = runner._check_airtest()
    return {
        "ok": True,
        "items": items,
        "count": len(items),
        "airtest_ok": ok,
        "airtest_error": err,
        "job": _job_snapshot(),
        "status_labels": STATUS_LABEL,
    }


def _job_snapshot() -> dict:
    with _lock:
        return dict(_job) if _job else {}


def _update_item(item_id: str, **kwargs) -> None:
    items = _load_items()
    it = _find_item(items, item_id)
    if not it:
        return
    it.update(kwargs)
    it["updated_at"] = _now()
    _save_items(items)


def add_urls(urls: list[str]) -> dict:
    items = _load_items()
    existing = {it.get("url", "").strip().lower() for it in items}
    added: list[dict] = []
    dupes: list[str] = []

    for raw in urls:
        url = (raw or "").strip()
        if not url:
            continue
        key = url.lower()
        if key in existing:
            dupes.append(url)
            continue
        item = {
            "id": uuid.uuid4().hex[:12],
            "url": url,
            "status": "pending",
            "remark": "",
            "screenshots": {"wechat": "", "browser": "", "submit": ""},
            "created_at": _now(),
            "updated_at": _now(),
        }
        items.append(item)
        existing.add(key)
        added.append(item)

    _save_items(items)
    return {
        "ok": True,
        "added": added,
        "duplicates": dupes,
        "message": f"新增 {len(added)} 条"
        + (f"，{len(dupes)} 条已在列表" if dupes else ""),
    }


def delete_item(item_id: str) -> dict:
    items = _load_items()
    before = len(items)
    items = [it for it in items if it.get("id") != item_id]
    if len(items) == before:
        return {"ok": False, "error": "记录不存在"}
    _save_items(items)
    shot_dir = SCREENSHOT_DIR / item_id
    if shot_dir.is_dir():
        import shutil

        shutil.rmtree(shot_dir, ignore_errors=True)
    return {"ok": True}


def resolve_screenshot(rel_path: str) -> Path | None:
    if not rel_path or ".." in rel_path:
        return None
    p = (ROOT / rel_path.replace("/", "\\")).resolve()
    try:
        p.relative_to(ROOT.resolve())
    except ValueError:
        return None
    return p if p.is_file() else None


def stop_job(source: str = "按钮") -> dict:
    _stop_event.set()
    current_id = ""
    with _lock:
        if _job.get("status") == "running":
            _job["stop_requested"] = True
            _job["stop_source"] = source
            current_id = str(_job.get("current_id") or "")
            logs = list(_job.get("logs") or [])
            logs.append(f"收到停止指令（{source}），正在中断…")
            _job["logs"] = logs[-200:]
    if current_id:
        items = _load_items()
        it = _find_item(items, current_id)
        if it and it.get("status") in ("checking", "appealing"):
            it["status"] = "pending"
            it["remark"] = "已手动停止"
            it["updated_at"] = _now()
            _save_items(items)
    return {"ok": True, "message": f"已强制停止（{source}）"}


STOP_HOTKEY_ID = 0xA911
STOP_HOTKEY_VK = 0x50  # P
MOD_NOREPEAT = 0x4000
WM_HOTKEY = 0x0312


def _hotkey_watch_loop() -> None:
    """任务运行期间全局监听 P 键：无论焦点在哪个窗口，按下即强制停止。"""
    import ctypes
    from ctypes import wintypes

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

    user32 = ctypes.windll.user32
    # 不覆盖全局 PeekMessageW.argtypes，避免和其他热键线程冲突
    user32.UnregisterHotKey(None, STOP_HOTKEY_ID)
    if not user32.RegisterHotKey(None, STOP_HOTKEY_ID, MOD_NOREPEAT, STOP_HOTKEY_VK):
        with _lock:
            _job["hotkey_ok"] = False
        return
    with _lock:
        _job["hotkey_ok"] = True

    msg = _MSG()
    try:
        while not _stop_event.is_set():
            with _lock:
                if _job.get("status") != "running":
                    break
            while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 1):
                if msg.message == WM_HOTKEY and msg.wParam == STOP_HOTKEY_ID:
                    stop_job("P 键")
            time.sleep(0.05)
    finally:
        user32.UnregisterHotKey(None, STOP_HOTKEY_ID)
        with _lock:
            _job["hotkey_ok"] = False


def get_job(job_id: str | None = None) -> dict | None:
    with _lock:
        if not _job:
            return None
        if job_id and _job.get("id") != job_id:
            return None
        return dict(_job)


def start_run(item_ids: list[str] | None = None) -> dict:
    with _lock:
        if _job.get("status") == "running":
            return {"ok": False, "error": "已有任务在运行，请先停止或等待完成"}

    items = _load_items()
    if item_ids:
        id_set = set(item_ids)
        queue = [it for it in items if it.get("id") in id_set]
    else:
        queue = [it for it in items if it.get("status") in ("pending", "failed")]

    if not queue:
        return {"ok": False, "error": "没有可执行的链接"}

    ok, err = runner._check_airtest()
    if not ok:
        return {"ok": False, "error": err}

    job_id = uuid.uuid4().hex[:12]
    _stop_event.clear()
    with _lock:
        _job.clear()
        _job.update(
            {
                "id": job_id,
                "status": "running",
                "total": len(queue),
                "done": 0,
                "current_id": "",
                "current_url": "",
                "logs": [],
                "started_at": time.time(),
                "stop_requested": False,
                "stop_source": "",
                "hotkey": "P",
                "hotkey_ok": False,
            }
        )

    def worker():
        logs: list[str] = []

        def append_log(msg: str) -> None:
            logs.append(msg)
            with _lock:
                _job["logs"] = list(logs[-200:])

        append_log(f"后台线程已启动，共 {len(queue)} 条")
        try:
            for idx, it in enumerate(queue):
                if _stop_event.is_set():
                    append_log("用户停止，剩余链接未处理")
                    break

                item_id = it["id"]
                url = it.get("url", "")
                with _lock:
                    _job["current_id"] = item_id
                    _job["current_url"] = url
                append_log(f"[{idx + 1}/{len(queue)}] 开始: {url}")
                _update_item(item_id, status="checking", remark="检测中…")

                work_dir = SCREENSHOT_DIR / item_id
                try:
                    result = runner.run_one(
                        url,
                        work_dir=work_dir,
                        stop_check=_stop_event.is_set,
                        log=append_log,
                    )
                except Exception as exc:
                    result = {"ok": False, "error": str(exc), "logs": [str(exc)]}

                for line in result.get("logs") or []:
                    if line not in logs:
                        append_log(line)

                if result.get("stopped"):
                    _update_item(
                        item_id,
                        status="pending",
                        remark="已手动停止",
                        screenshots=result.get("screenshots") or {},
                    )
                    append_log("已强制停止")
                    break

                if not result.get("ok"):
                    _update_item(
                        item_id,
                        status="failed",
                        remark=result.get("error") or "执行失败",
                        screenshots=result.get("screenshots") or {},
                    )
                    append_log(f"失败: {result.get('error')}")
                elif result.get("skipped"):
                    _update_item(
                        item_id,
                        status="skipped",
                        remark=result.get("remark") or "微信能直接打开",
                        screenshots=result.get("screenshots") or {},
                    )
                    append_log("跳过申诉（可直接打开）")
                else:
                    _update_item(
                        item_id,
                        status="done",
                        remark=result.get("remark") or "已申诉",
                        screenshots=result.get("screenshots") or {},
                    )
                    append_log("申诉已提交")

                with _lock:
                    _job["done"] = idx + 1
        finally:
            current_id = str(_job.get("current_id") or "")
            if current_id:
                items = _load_items()
                it = _find_item(items, current_id)
                if it and it.get("status") in ("checking", "appealing"):
                    it["status"] = "pending" if _stop_event.is_set() else "failed"
                    it["remark"] = "已手动停止" if _stop_event.is_set() else (it.get("remark") or "执行异常中断")
                    it["updated_at"] = _now()
                    _save_items(items)

            with _lock:
                _job["status"] = "stopped" if _stop_event.is_set() else "done"
                _job["finished_at"] = time.time()
                _job["current_id"] = ""
                _job["current_url"] = ""

    threading.Thread(target=worker, name="wechat-appeal", daemon=True).start()
    threading.Thread(target=_hotkey_watch_loop, name="wechat-appeal-hotkey", daemon=True).start()
    return {"ok": True, "job_id": job_id, "total": len(queue)}


def preflight() -> dict:
    ok, err = runner._check_airtest()
    cert_ok = Path(runner.CERT_DIR).is_dir()
    game_ok = Path(runner.GAME_SCREENSHOT_DIR).is_dir()
    tpl_count = len(list(runner.AIR_DIR.glob("tpl*.png"))) if runner.AIR_DIR.is_dir() else 0
    win32ui_ok = True
    win32ui_note = ""
    try:
        import win32ui  # noqa: F401
    except ImportError as exc:
        win32ui_ok = False
        win32ui_note = f"win32ui 不可用（已改用 mss 截图）: {exc}"
    return {
        "ok": ok and cert_ok,
        "airtest_ok": ok,
        "airtest_error": err,
        "win32ui_ok": win32ui_ok,
        "win32ui_note": win32ui_note,
        "cert_dir_ok": cert_ok,
        "game_screenshot_dir_ok": game_ok,
        "template_count": tpl_count,
        "air_dir": str(runner.AIR_DIR),
        "similarity_threshold": runner.SIMILARITY_SKIP_THRESHOLD,
        "hint": "请保持双屏 3840×1080、微信 PC 已登录，执行期间勿操作键鼠；随时按 P 键强制停止",
    }
