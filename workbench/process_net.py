"""本机进程网络流量采集（Windows 为主）。"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "integrated" / "static_tools_web" / "scripts"
WIN_TCP_SCRIPT = SCRIPTS / "win_process_net.ps1"
WIN_IO_SCRIPT = SCRIPTS / "win_process_io_estimate.ps1"


def _subprocess_flags():
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def _run_ps1(script: Path, sample_ms: int) -> dict | None:
    if not script.exists():
        return None
    try:
        proc = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
                "-SampleMs",
                str(sample_ms),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(30, sample_ms // 1000 + 25),
            creationflags=_subprocess_flags(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    raw = (proc.stdout or "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _build_name_pid_map() -> tuple[dict[str, int], dict[str, int]]:
    import psutil

    exact: dict[str, int] = {}
    base: dict[str, int] = {}
    try:
        for proc in psutil.process_iter(["pid", "name"]):
            info = proc.info
            pid = info.get("pid")
            name = (info.get("name") or "").lower()
            if pid is None or not name:
                continue
            exact[name] = pid
            stem = name[:-4] if name.endswith(".exe") else name
            if stem not in base:
                base[stem] = pid
    except Exception:
        pass
    return exact, base


def _normalize_proc_name(name: str) -> str:
    if not name:
        return "—"
    if name.endswith(".exe"):
        return name
    if re.match(r"^[\w.-]+$", name):
        return name + ".exe"
    return name


def _resolve_process_names(rows: list[dict]) -> list[dict]:
    import psutil

    pid_map = {}
    try:
        for proc in psutil.process_iter(["pid", "name"]):
            info = proc.info
            pid = info.get("pid")
            if pid is not None:
                pid_map[pid] = info.get("name") or ""
    except Exception:
        pass

    exact, base = _build_name_pid_map()

    out = []
    for row in rows:
        item = dict(row)
        pid = item.get("pid")
        name = item.get("name") or ""
        if pid is not None and not name:
            name = pid_map.get(pid, "")
        item["name"] = _normalize_proc_name(name)
        if not item.get("pid"):
            key = item["name"].lower()
            stem = key[:-4] if key.endswith(".exe") else key
            item["pid"] = exact.get(key) or base.get(stem)
        item.setdefault("bytesRecv", 0)
        item.setdefault("bytesSent", 0)
        item.setdefault("bytesTotal", item.get("bytesRecv", 0) + item.get("bytesSent", 0))
        item.setdefault("rxSec", 0)
        item.setdefault("txSec", 0)
        item.setdefault("totalSec", item.get("rxSec", 0) + item.get("txSec", 0))
        out.append(item)
    return out


def _merge_by_name(rows: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for row in rows:
        key = (row.get("name") or "—").lower()
        if key not in merged:
            merged[key] = dict(row)
            continue
        cur = merged[key]
        for field in ("rxSec", "txSec", "totalSec", "bytesRecv", "bytesSent", "bytesTotal", "connections"):
            cur[field] = cur.get(field, 0) + row.get(field, 0)
        if row.get("pid") and not cur.get("pid"):
            cur["pid"] = row["pid"]
    return list(merged.values())


def _connection_fallback(sample_ms: int) -> tuple[list[dict], str]:
    import psutil

    by_pid: dict[int, dict] = {}
    try:
        for conn in psutil.net_connections(kind="inet"):
            pid = conn.pid
            if pid is None:
                continue
            status = (conn.status or "").upper()
            if status and status not in ("ESTABLISHED", "LISTEN"):
                continue
            row = by_pid.get(pid) or {"pid": pid, "name": "", "connections": 0}
            row["connections"] = row.get("connections", 0) + 1
            by_pid[pid] = row
    except (psutil.AccessDenied, PermissionError):
        pass

    rows = []
    for row in by_pid.values():
        cnt = row.get("connections", 0)
        rows.append(
            {
                "pid": row["pid"],
                "name": row.get("name") or "",
                "connections": cnt,
                "rxSec": 0,
                "txSec": 0,
                "totalSec": cnt,
                "bytesRecv": 0,
                "bytesSent": 0,
                "bytesTotal": 0,
            }
        )
    rows = _resolve_process_names(rows)
    rows.sort(key=lambda x: x.get("connections", 0), reverse=True)
    return rows[:30], "connections-only"


def _linux_process_traffic(sample_ms: int) -> tuple[list[dict], str]:
    """Linux：/proc/PID/io 无网络字段，用连接数 + socket 缓冲区粗估。"""
    return _connection_fallback(sample_ms)


def get_process_traffic(sample_ms: int = 1000) -> tuple[list[dict], str, str | None]:
    """
    返回 (processes, method, note)。
    method: tcp-estats | io-counter-estimate | connections-only
    """
    note = None
    if sys.platform == "win32":
        payload = _run_ps1(WIN_TCP_SCRIPT, sample_ms)
        if payload and payload.get("processes"):
            rows = _resolve_process_names(payload["processes"])
            rows.sort(key=lambda x: x.get("totalSec", 0), reverse=True)
            return rows[:30], payload.get("method") or "tcp-estats", None

        payload = _run_ps1(WIN_IO_SCRIPT, sample_ms)
        if payload and payload.get("processes"):
            rows = _merge_by_name(_resolve_process_names(payload["processes"]))
            rows.sort(key=lambda x: x.get("totalSec", 0), reverse=True)
            note = "速率来自系统 I/O 计数器（含磁盘）；「累计/总数」列请在页面开启自查后由会话累计（见下方说明）"
            return rows[:30], payload.get("method") or "io-counter-estimate", note

        rows, method = _connection_fallback(sample_ms)
        note = "未能读取 TCP 字节统计，仅展示活跃连接数（可尝试以管理员运行工作台）"
        return rows, method, note

    if sys.platform == "linux":
        rows, method = _linux_process_traffic(sample_ms)
        note = "Linux 下暂以连接数排行；精确字节需 nethogs 等工具"
        return rows, method, note

    rows, method = _connection_fallback(sample_ms)
    return rows, method, "当前系统仅支持连接数参考排行"
