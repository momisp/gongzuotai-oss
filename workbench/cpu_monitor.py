"""CPU 进程监控：后台采样、列表、结束进程（含系统/工作台风险提示）。"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import psutil

_lock = threading.RLock()
_state: dict = {
    "processes": [],
    "total_cpu": 0.0,
    "updated_at": None,
    "sample_count": 0,
    "sampling": False,
    "watch_until": 0.0,
}
# 只有 CPU 监控页在看时才全量扫进程。空转扫描会占住 GIL，点其它页面会卡。
_WATCH_TTL = 25.0
_started = False
_own_pid = os.getpid()
_core_count = psutil.cpu_count() or 1

BLOCKED_PIDS = frozenset({0, 4})
SKIP_NAMES = frozenset({"System Idle Process"})

BLOCKED_NAMES = frozenset({"System", "Registry", "Memory Compression"})

SYSTEM_CRITICAL: dict[str, str] = {
    "csrss.exe": "客户端/服务器运行时子系统。强制结束可能导致蓝屏或立即重启。",
    "wininit.exe": "Windows 启动进程。结束可能导致系统服务异常或崩溃。",
    "services.exe": "Windows 服务控制管理器。结束可能导致系统立即崩溃或蓝屏。",
    "lsass.exe": "本地安全认证进程。Windows 通常会在约 1 分钟内自动重启电脑。",
    "smss.exe": "会话管理器。结束可能导致系统崩溃。",
    "winlogon.exe": "登录管理进程。结束将注销当前会话。",
    "System": "系统内核进程，无法结束。",
    "Registry": "系统注册表进程，无法结束。",
}

SYSTEM_WARN: dict[str, str] = {
    "svchost.exe": "Windows 服务宿主。结束可能导致网络、音频、Windows Update 等服务异常。",
    "dwm.exe": "桌面窗口管理器。结束会导致窗口短暂黑屏或闪烁。",
    "explorer.exe": "资源管理器（桌面与任务栏）。结束后桌面消失，需在任务管理器中重新运行 explorer.exe。",
    "MsMpEng.exe": "Windows Defender 实时防护。结束后病毒防护暂停，建议尽快恢复。",
    "SearchIndexer.exe": "Windows 搜索索引停止，文件搜索会变慢。",
    "spoolsv.exe": "打印后台服务停止，打印功能不可用。",
    "ctfmon.exe": "输入法框架停止，可能导致输入法异常。",
    "sihost.exe": "Shell 基础结构宿主，结束可能导致开始菜单/通知异常。",
    "taskhostw.exe": "任务宿主，结束可能影响计划任务与后台作业。",
    "WmiPrvSE.exe": "WMI 提供程序，结束可能影响系统管理与监控工具。",
}

# 模拟器/虚拟机：普通权限常无法 taskkill，需客户端退出或管理员
ELEVATED_HINT: dict[str, str] = {
    "MuMuVMMHeadless.exe": "MuMu 模拟器虚拟机进程。请在 MuMu 托盘图标右键 → 退出；或右键「以管理员身份运行」工作台后再结束。",
    "MuMuVMMSVC.exe": "MuMu 模拟器服务。建议从 MuMu 客户端正常退出。",
    "MuMuNxService.exe": "MuMu 模拟器服务。建议从 MuMu 客户端正常退出。",
    "MuMuPlayer.exe": "MuMu 模拟器主程序。建议从 MuMu 客户端正常退出。",
    "HD-Player.exe": "雷电/BlueStacks 类模拟器。请从模拟器客户端正常退出。",
    "Nox.exe": "夜神模拟器。请从模拟器客户端正常退出。",
}


MUMU_CLI_CANDIDATES = [
    Path(r"C:\Program Files\Netease\MuMu Player 12\nx_main\mumu-cli.exe"),
    Path(r"C:\Program Files\Netease\MuMuPlayer 12\nx_main\mumu-cli.exe"),
    Path(r"D:\Program Files\Netease\MuMu Player 12\nx_main\mumu-cli.exe"),
]


def _find_mumu_cli() -> Path | None:
    for p in MUMU_CLI_CANDIDATES:
        if p.is_file():
            return p
    return None


def cleanup_mumu_orphans() -> dict:
    """通过 MuMu 官方 CLI 关闭残留虚拟机（崩溃双开后的 Headless 僵尸进程）。"""
    cli = _find_mumu_cli()
    if not cli:
        return {
            "ok": False,
            "error": "未找到 mumu-cli.exe。请确认已安装 MuMu Player 12，或在 MuMu 安装目录 nx_main 下手动运行：mumu-cli control --vmindex all shutdown",
        }

    before = {p.pid for p in psutil.process_iter(["pid", "name"]) if (p.info.get("name") or "").startswith("MuMu")}
    try:
        proc = subprocess.run(
            [str(cli), "control", "--vmindex", "all", "shutdown"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            creationflags=_subprocess_flags(),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "MuMu 关闭命令超时（60s）"}
    except OSError as exc:
        return {"ok": False, "error": f"无法运行 mumu-cli：{exc}"}

    time.sleep(1.5)
    after = {p.pid for p in psutil.process_iter(["pid", "name"]) if (p.info.get("name") or "").startswith("MuMu")}
    killed = len(before - after)

    stdout = (proc.stdout or "").strip()
    if proc.returncode != 0 and killed == 0 and before:
        detail = (proc.stderr or stdout or f"exit {proc.returncode}").strip()
        return {"ok": False, "error": f"MuMu 关闭失败：{detail}"}

    return {
        "ok": True,
        "message": f"已通过 MuMu CLI 下发关闭指令（清理 {killed} 个残留 MuMu 进程）",
        "cli_output": stdout[:2000] if stdout else "",
        "mumu_before": len(before),
        "mumu_after": len(after),
    }


def _subprocess_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def _process_alive(pid: int) -> bool:
    try:
        psutil.Process(pid)
        return True
    except psutil.NoSuchProcess:
        return False


def _kill_pid_tree(pid: int) -> tuple[bool, str]:
    if not pid:
        return False, "无效 PID"

    # 1) psutil 结束（含子进程）
    try:
        proc = psutil.Process(pid)
        for child in proc.children(recursive=True):
            try:
                child.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        proc.kill()
        try:
            proc.wait(timeout=5)
        except psutil.TimeoutExpired:
            pass
        if not _process_alive(pid):
            return True, ""
    except psutil.NoSuchProcess:
        return True, ""
    except psutil.AccessDenied:
        pass
    except Exception as exc:
        pass

    # 2) Windows taskkill
    if sys.platform == "win32":
        try:
            proc = subprocess.run(
                ["taskkill", "/PID", str(pid), "/F", "/T"],
                capture_output=True,
                timeout=15,
                creationflags=_subprocess_flags(),
            )
            if proc.returncode == 0 or not _process_alive(pid):
                return True, ""
            detail = (proc.stderr or proc.stdout or b"").decode("utf-8", errors="replace").strip()
            if "拒绝" in detail or "Access is denied" in detail:
                return False, "拒绝访问"
            return False, detail or f"taskkill 退出码 {proc.returncode}"
        except Exception as exc:
            if not _process_alive(pid):
                return True, ""
            return False, str(exc)

    try:
        psutil.Process(pid).kill()
        return True, ""
    except psutil.NoSuchProcess:
        return True, ""
    except Exception as exc:
        return False, str(exc)


def _classify(name: str, pid: int) -> dict:
    if pid in BLOCKED_PIDS or name in BLOCKED_NAMES:
        return {
            "category": "blocked",
            "killable": False,
            "consequence": SYSTEM_CRITICAL.get(name, "系统关键进程，无法结束。"),
        }
    if pid == _own_pid:
        return {
            "category": "protected",
            "killable": False,
            "consequence": "这是个人工作台服务进程，结束将关闭本页面及所有工作台功能。",
        }
    if name in SYSTEM_CRITICAL:
        return {"category": "system", "killable": True, "consequence": SYSTEM_CRITICAL[name]}
    if name in SYSTEM_WARN:
        return {"category": "system", "killable": True, "consequence": SYSTEM_WARN[name]}
    if name in ELEVATED_HINT:
        return {
            "category": "normal",
            "killable": True,
            "consequence": ELEVATED_HINT[name],
            "elevated": True,
        }
    if (name or "").lower() == "python.exe":
        return {
            "category": "normal",
            "killable": True,
            "consequence": "Python 进程结束后，对应脚本/服务将停止。",
        }
    return {
        "category": "normal",
        "killable": True,
        "consequence": "进程结束后，该程序将关闭，未保存的数据可能丢失。",
    }


def _sample_processes() -> tuple[float, list[dict]]:
    total = psutil.cpu_percent(interval=None)
    rows: list[dict] = []
    attrs = ["pid", "name", "cpu_percent", "memory_info", "num_threads"]
    for proc in psutil.process_iter(attrs):
        try:
            info = proc.info
            pid = int(info["pid"])
            name = (info.get("name") or "?").strip() or "?"
            if pid in BLOCKED_PIDS or name in SKIP_NAMES:
                continue
            raw_cpu = info.get("cpu_percent")
            cpu = round(float(raw_cpu or 0.0) / _core_count, 1)
            mem = info.get("memory_info")
            mem_mb = round(mem.rss / 1048576, 1) if mem else 0.0
            meta = _classify(name, pid)
            rows.append(
                {
                    "pid": pid,
                    "name": name,
                    "cpu": cpu,
                    "memory_mb": mem_mb,
                    "threads": int(info.get("num_threads") or 0),
                    **meta,
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    rows.sort(key=lambda x: (-x["cpu"], -x["memory_mb"], x["name"].lower()))
    return round(total, 1), rows


def note_watch() -> None:
    """CPU 监控页拉过列表后的一小段时间里才采样。"""
    with _lock:
        _state["watch_until"] = time.time() + _WATCH_TTL


def _sampler_loop() -> None:
    psutil.cpu_percent(interval=None)
    while True:
        with _lock:
            watched = time.time() < float(_state.get("watch_until") or 0)
        if not watched:
            time.sleep(2.0)
            continue
        with _lock:
            _state["sampling"] = True
        t0 = time.time()
        try:
            total, rows = _sample_processes()
            with _lock:
                _state["processes"] = rows
                _state["total_cpu"] = total
                _state["updated_at"] = int(time.time() * 1000)
                _state["sample_count"] += 1
        except Exception:
            pass
        finally:
            with _lock:
                _state["sampling"] = False
        # 全量扫描在 Windows 上常要数秒，并占住 GIL。页面没打开时上面已直接跳过。
        elapsed = time.time() - t0
        time.sleep(max(15.0, 20.0 - elapsed))


def start_background_sampler() -> None:
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_sampler_loop, name="cpu-monitor-sampler", daemon=True).start()


def get_snapshot() -> dict:
    note_watch()
    with _lock:
        return {
            "ok": True,
            "total_cpu": _state["total_cpu"],
            "processes": list(_state["processes"]),
            "updated_at": _state["updated_at"],
            "sample_count": _state["sample_count"],
            "sampling": _state["sampling"],
            "own_pid": _own_pid,
            "count": len(_state["processes"]),
            "refresh_hint": "后台约每 15～20 秒扫一轮进程；打开本页会刷新快照",
        }


def kill_process(pid: int) -> dict:
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return {"ok": False, "error": "无效的 PID"}

    if pid in BLOCKED_PIDS:
        return {"ok": False, "error": "系统关键进程，无法结束"}
    if pid == _own_pid:
        return {"ok": False, "error": "不能结束工作台自身进程"}

    try:
        proc = psutil.Process(pid)
        name = proc.name()
    except psutil.NoSuchProcess:
        return {"ok": True, "message": "进程已不存在"}
    except psutil.AccessDenied:
        return {"ok": False, "error": "无法读取进程信息（权限不足）"}

    meta = _classify(name, pid)
    if not meta["killable"]:
        return {"ok": False, "error": meta["consequence"]}

    ok, detail = _kill_pid_tree(pid)
    if not ok:
        hint = ELEVATED_HINT.get(name) or meta.get("consequence", "")
        if detail == "拒绝访问" or "拒绝" in detail:
            err = "结束失败：权限不足（拒绝访问）。"
            if hint:
                err += f"\n\n{hint}"
            else:
                err += "\n\n可尝试：右键以管理员身份运行工作台，或在对应软件客户端中正常退出。"
            return {"ok": False, "error": err}
        err = f"结束失败：{detail or '进程受保护'}"
        if hint:
            err += f"\n\n{hint}"
        return {"ok": False, "error": err}

    return {
        "ok": True,
        "message": f"已结束 {name} (PID {pid})",
        "consequence": meta["consequence"],
        "category": meta["category"],
    }
