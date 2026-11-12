# -*- coding: utf-8 -*-
"""在 Windows 桌面分身（Child Session）里启动进程。

主桌面的工作台只负责下发；真正点鼠标的程序必须跑在分身会话里，
否则还是会抢你眼前的鼠标。启动方式跟 BetterGI 一样：任务计划
RunEx + TASK_RUN_USE_SESSION_ID。
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

TASK_NAME = "OAWorkbenchChildLaunch"
TASK_RUN_USE_SESSION_ID = 4
TASK_LOGON_INTERACTIVE_TOKEN = 3
TASK_CREATE_OR_UPDATE = 6
TASK_ACTION_EXEC = 0

_JOB_ROOT = Path(os.environ.get("TEMP") or os.environ.get("TMP") or ".") / "oa-child-jobs"


def child_sessions_enabled() -> bool:
    import ctypes
    from ctypes import wintypes

    wts = ctypes.WinDLL("wtsapi32", use_last_error=True)
    flag = wintypes.BOOL()
    wts.WTSIsChildSessionsEnabled.argtypes = [ctypes.POINTER(wintypes.BOOL)]
    wts.WTSIsChildSessionsEnabled.restype = wintypes.BOOL
    if not wts.WTSIsChildSessionsEnabled(ctypes.byref(flag)):
        return False
    return bool(flag.value)


def get_child_session_id() -> int | None:
    """分身已连接时返回会话号；没有分身则返回 None。"""
    import ctypes
    from ctypes import wintypes

    wts = ctypes.WinDLL("wtsapi32", use_last_error=True)
    wts.WTSGetChildSessionId.argtypes = [ctypes.POINTER(wintypes.DWORD)]
    wts.WTSGetChildSessionId.restype = wintypes.BOOL
    sid = wintypes.DWORD()
    if not wts.WTSGetChildSessionId(ctypes.byref(sid)):
        return None
    value = int(sid.value)
    if value in (0, 0xFFFFFFFF):
        return None
    return value


def status() -> dict[str, Any]:
    sid = get_child_session_id()
    return {
        "enabled": child_sessions_enabled(),
        "sessionId": sid,
        "ready": sid is not None,
    }


class ChildJob:
    """分身里跑的一次任务：stdout 写到共享文件，主桌面这边读。"""

    def __init__(self, job_dir: Path, session_id: int):
        self.job_dir = job_dir
        self.session_id = session_id
        self.stdout_path = job_dir / "stdout.txt"
        self.exit_path = job_dir / "exitcode.txt"
        self._byte_offset = 0
        self._buf = ""
        self._exit: int | None = None

    @property
    def returncode(self) -> int | None:
        return self._exit

    def poll(self) -> int | None:
        if self._exit is not None:
            return self._exit
        if self.exit_path.is_file():
            text = self.exit_path.read_text(encoding="utf-8", errors="replace").strip()
            try:
                self._exit = int(text.splitlines()[0].strip())
            except (ValueError, IndexError):
                self._exit = 1
        return self._exit

    def read_new_lines(self) -> list[str]:
        if not self.stdout_path.is_file():
            return []
        data = self.stdout_path.read_bytes()
        if len(data) <= self._byte_offset:
            return []
        chunk = data[self._byte_offset :]
        self._byte_offset = len(data)
        self._buf += chunk.decode("utf-8", errors="replace")
        lines: list[str] = []
        while True:
            nl = self._buf.find("\n")
            if nl < 0:
                break
            line = self._buf[:nl].rstrip("\r")
            self._buf = self._buf[nl + 1 :]
            lines.append(line)
        if self._exit is not None and self._buf:
            lines.append(self._buf.rstrip("\r"))
            self._buf = ""
        return lines

    def wait(self, timeout: float | None = None, on_line=None) -> int:
        deadline = None if timeout is None else (time.time() + timeout)
        while True:
            for line in self.read_new_lines():
                if on_line:
                    on_line(line)
            code = self.poll()
            if code is not None:
                for line in self.read_new_lines():
                    if on_line:
                        on_line(line)
                return code
            if deadline is not None and time.time() >= deadline:
                raise TimeoutError(f"分身任务超时（会话 {self.session_id}）")
            time.sleep(0.2)

    def cleanup(self) -> None:
        try:
            for p in self.job_dir.glob("*"):
                try:
                    p.unlink()
                except OSError:
                    pass
            self.job_dir.rmdir()
        except OSError:
            pass


def _worker_source() -> str:
    return r"""
import json, os, subprocess, sys
from pathlib import Path
job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
stdout_path = Path(job["stdout"])
exit_path = Path(job["exitcode"])
env = os.environ.copy()
for k, v in (job.get("env") or {}).items():
    env[str(k)] = str(v)
argv = list(job["argv"])
cwd = job.get("cwd") or None
code = 1
try:
    with stdout_path.open("w", encoding="utf-8", errors="replace", newline="\n") as fh:
        proc = subprocess.Popen(
            argv,
            stdout=fh,
            stderr=subprocess.STDOUT,
            cwd=cwd,
            env=env,
        )
        code = proc.wait()
except Exception as exc:
    stdout_path.write_text(f"WORKER_FATAL\t{exc}\n", encoding="utf-8")
    code = 1
exit_path.write_text(str(code) + "\n", encoding="utf-8")
"""


def launch_in_child_session(
    argv: list[str],
    *,
    env: dict[str, str] | None = None,
    cwd: str | None = None,
    session_id: int | None = None,
) -> ChildJob:
    """在分身会话里启动 argv，返回可读 stdout 的 ChildJob。"""
    sid = session_id if session_id is not None else get_child_session_id()
    if sid is None:
        raise RuntimeError("桌面分身还没连上。请先用 BetterGI 打开并保持「启动并连接」。")
    if not argv:
        raise ValueError("argv 为空")

    try:
        import win32com.client  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("本机 Python 缺少 pywin32，无法往分身里启动程序") from exc

    # 工作台 worker 线程里调 COM 前必须 CoInitialize，否则会 -2147221008
    try:
        import pythoncom

        pythoncom.CoInitialize()
    except Exception:
        pass

    _JOB_ROOT.mkdir(parents=True, exist_ok=True)
    job_dir = _JOB_ROOT / f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    job_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = job_dir / "stdout.txt"
    exit_path = job_dir / "exitcode.txt"
    worker_path = job_dir / "worker.py"
    job_path = job_dir / "job.json"
    stdout_path.write_text("", encoding="utf-8")
    worker_path.write_text(_worker_source().lstrip("\n"), encoding="utf-8")
    job = {
        "argv": [str(x) for x in argv],
        "env": {str(k): str(v) for k, v in (env or {}).items()},
        "cwd": cwd,
        "stdout": str(stdout_path),
        "exitcode": str(exit_path),
    }
    job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")

    python_exe = sys_executable_for_worker()
    import win32com.client

    svc = win32com.client.Dispatch("Schedule.Service")
    svc.Connect()
    root = svc.GetFolder("\\")
    try:
        root.DeleteTask(TASK_NAME, 0)
    except Exception:
        pass
    td = svc.NewTask(0)
    td.RegistrationInfo.Description = "工作台：在桌面分身里跑图形自动化"
    td.Settings.Enabled = True
    td.Settings.StartWhenAvailable = True
    td.Settings.AllowDemandStart = True
    td.Settings.DisallowStartIfOnBatteries = False
    td.Settings.StopIfGoingOnBatteries = False
    td.Settings.Hidden = True
    td.Principal.LogonType = TASK_LOGON_INTERACTIVE_TOKEN
    td.Principal.RunLevel = 0
    action = td.Actions.Create(TASK_ACTION_EXEC)
    action.Path = str(python_exe)
    action.Arguments = f'-u "{worker_path}" "{job_path}"'
    action.WorkingDirectory = str(job_dir)
    root.RegisterTaskDefinition(
        TASK_NAME, td, TASK_CREATE_OR_UPDATE, None, None, TASK_LOGON_INTERACTIVE_TOKEN
    )
    task = root.GetTask(TASK_NAME)
    task.RunEx(None, TASK_RUN_USE_SESSION_ID, int(sid), "")
    return ChildJob(job_dir, int(sid))


def sys_executable_for_worker() -> str:
    """worker 本身用系统/当前 Python 即可；真正业务解释器在 argv 里。"""
    import sys

    return sys.executable


def prepare_child_oa(*, force_login: bool = False, timeout: float = 180.0) -> dict[str, Any]:
    """在分身里清启动项、开 OA、登录。主桌面这边读日志。"""
    sid = get_child_session_id()
    if sid is None:
        return {"ok": False, "error": "桌面分身还没连上"}
    prep = Path(__file__).resolve().parent / "oa_child_prep.py"
    if not prep.is_file():
        return {"ok": False, "error": f"缺少 {prep}"}
    # 用 OA 同一套 venv，里面有 airtest / psutil / pywin32
    py = Path(r"F:\yzdpd_uiauto_test\.venv\Scripts\python.exe")
    if not py.is_file():
        py = Path(sys_executable_for_worker())
    argv = [str(py), "-u", str(prep)]
    if force_login:
        argv.append("--force-login")
    lines: list[str] = []
    job = launch_in_child_session(argv, session_id=sid)
    try:
        code = job.wait(timeout=timeout, on_line=lambda ln: lines.append(ln))
        ok = code == 0 and any(x.startswith("PREP_DONE") for x in lines)
        return {
            "ok": ok,
            "exit": code,
            "sessionId": sid,
            "lines": lines[-40:],
            "error": None if ok else next(
                (x for x in reversed(lines) if x.startswith("PREP_FAIL") or "失败" in x or "Error" in x),
                "分身前置准备未完成",
            ),
        }
    except TimeoutError as exc:
        return {"ok": False, "error": str(exc), "lines": lines[-40:], "sessionId": sid}
    finally:
        job.cleanup()


def probe_launch(timeout: float = 15.0) -> dict[str, Any]:
    """自检：在分身里写一个标记文件。"""
    sid = get_child_session_id()
    if sid is None:
        return {"ok": False, "error": "没有分身会话"}
    marker = _JOB_ROOT / f"probe_{uuid.uuid4().hex[:8]}.txt"
    _JOB_ROOT.mkdir(parents=True, exist_ok=True)
    py = sys_executable_for_worker()
    code = (
        "import ctypes; from ctypes import wintypes; "
        "w=ctypes.WinDLL('kernel32'); "
        "open(r'%s','w',encoding='utf-8').write('sid-ok\\n')"
    ) % str(marker).replace("\\", "\\\\")
    job = launch_in_child_session([py, "-c", code], session_id=sid)
    try:
        job.wait(timeout=timeout)
        text = marker.read_text(encoding="utf-8") if marker.is_file() else ""
        ok = "sid-ok" in text and job.returncode == 0
        return {"ok": ok, "sessionId": sid, "exit": job.returncode, "marker": text.strip()}
    finally:
        try:
            marker.unlink()
        except OSError:
            pass
        job.cleanup()


# ----- 工作台自带分身窗口（不依赖 BetterGI）-----

_HOST_DIR = Path(os.environ.get("TEMP") or os.environ.get("TMP") or ".") / "oa-child-host"
_HOST_PID = _HOST_DIR / "host.pid"
_HOST_STATUS = _HOST_DIR / "host.status.json"
_HOST_EXE = Path(__file__).resolve().parent / "tools" / "child_session_host" / "ChildSessionHost.exe"


def rdp_door_open() -> bool:
    """3389 有人守，或会话列表里有 rdp-tcp。"""
    import subprocess

    try:
        out = subprocess.check_output(
            ["cmd", "/c", "netstat -ano | findstr :3389"],
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
        )
        if "LISTENING" in out.upper() or "侦听" in out:
            return True
    except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired):
        pass
    try:
        q = subprocess.check_output(
            ["query", "session"],
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
        )
        return "rdp-tcp" in q.lower()
    except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired):
        return False


def host_exe_path() -> Path:
    return _HOST_EXE


def _read_host_status_file() -> dict[str, Any]:
    if not _HOST_STATUS.is_file():
        return {}
    try:
        raw = json.loads(_HOST_STATUS.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _host_pid_running() -> int | None:
    if not _HOST_PID.is_file():
        return None
    try:
        pid = int(_HOST_PID.read_text(encoding="utf-8").strip().splitlines()[0])
    except (OSError, ValueError, IndexError):
        return None
    try:
        import ctypes

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        SYNCHRONIZE = 0x00100000
        handle = kernel.OpenProcess(SYNCHRONIZE, 0, pid)
        if handle:
            kernel.CloseHandle(handle)
            return pid
    except Exception:
        pass
    # fallback
    try:
        os.kill(pid, 0)
        return pid
    except OSError:
        return None


def host_status() -> dict[str, Any]:
    pid = _host_pid_running()
    file_st = _read_host_status_file()
    sid = get_child_session_id()
    return {
        "hostRunning": pid is not None,
        "hostPid": pid,
        "hostState": file_st.get("state") if pid else ("stopped" if not sid else "external"),
        "hostDetail": file_st.get("detail") or "",
        "hostExe": str(_HOST_EXE),
        "hostExeExists": _HOST_EXE.is_file(),
        "doorOpen": rdp_door_open(),
        "sessionId": sid,
        "ready": sid is not None,
        "enabled": child_sessions_enabled(),
        "ownedByWorkbench": pid is not None,
    }


def _logoff_child_session(sid: int | None) -> None:
    """踢掉孤儿分身会话，方便重新弹出可见的 Host 窗口。"""
    import subprocess

    if sid is None:
        return
    try:
        subprocess.run(
            ["logoff", str(int(sid))],
            capture_output=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired, ValueError):
        pass
    time.sleep(1.2)


def ensure_host_visible(*, wait_seconds: float = 30.0) -> dict[str, Any]:
    """保证「工作台·桌面分身」窗口在、能看见。

    会话还在但 Host 已关时（常见：关掉预览窗后会话变孤儿），自动化仍能跑，
    人眼却看不到分身——这里会 logoff 再拉起 Host。
    """
    st = host_status()
    if st.get("ownedByWorkbench") and st.get("ready") and st.get("hostRunning"):
        return {
            "ok": True,
            "already": True,
            "sessionId": st.get("sessionId"),
            "message": f"分身窗口已在（会话 {st.get('sessionId')}）",
            **host_status(),
        }
    if st.get("ready") and not st.get("hostRunning"):
        sid = st.get("sessionId")
        _logoff_child_session(int(sid) if sid is not None else None)
    return start_host(wait_seconds=wait_seconds)


def start_host(*, wait_seconds: float = 25.0) -> dict[str, Any]:
    """打开工作台自己的分身窗口。已有可见分身则直接复用。"""
    import subprocess

    st = host_status()
    # 仅当「我们的 Host 窗口还在」时才算已复用；孤儿会话不算（否则人看不见预览）
    if st.get("ready") and st.get("sessionId") is not None and st.get("hostRunning"):
        return {
            "ok": True,
            "already": True,
            "sessionId": st["sessionId"],
            "message": f"分身已在（会话 {st['sessionId']}），无需再开。"
            + (" 当前是工作台窗口。" if st.get("ownedByWorkbench") else " 可能是 BetterGI 或其他客户端开的。"),
            **host_status(),
        }
    if st.get("ready") and not st.get("hostRunning"):
        _logoff_child_session(st.get("sessionId"))
        st = host_status()
    if st.get("hostRunning"):
        return {"ok": True, "already": True, "message": "分身窗口已在运行，正在等待连上。", **host_status()}
    if not _HOST_EXE.is_file():
        return {
            "ok": False,
            "error": f"找不到分身程序：{_HOST_EXE}。请先编译 tools/child_session_host。",
            **host_status(),
        }
    if not rdp_door_open():
        return {
            "ok": False,
            "error": "远程桌面门没开（3389 没人守）。请先用管理员跑 workbench/docs/放开开关.ps1，门开了再点启动。",
            **host_status(),
        }

    _HOST_DIR.mkdir(parents=True, exist_ok=True)
    try:
        if _HOST_STATUS.is_file():
            _HOST_STATUS.unlink()
    except OSError:
        pass
    proc = subprocess.Popen(
        [str(_HOST_EXE)],
        cwd=str(_HOST_EXE.parent),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + wait_seconds
    last = host_status()
    while time.time() < deadline:
        time.sleep(0.4)
        last = host_status()
        if last.get("ready") and last.get("sessionId") is not None:
            return {
                "ok": True,
                "sessionId": last["sessionId"],
                "message": f"分身已连接 · 会话 {last['sessionId']}",
                "pid": proc.pid,
                **last,
            }
        file_st = _read_host_status_file()
        if file_st.get("state") == "error":
            return {
                "ok": False,
                "error": str(file_st.get("detail") or "分身连接失败"),
                "pid": proc.pid,
                **host_status(),
            }
        if proc.poll() is not None and not last.get("hostRunning"):
            return {
                "ok": False,
                "error": "分身窗口已退出，没连上。请看是否弹了错误框，或远程桌面门是否开着。",
                **host_status(),
            }
    return {
        "ok": False,
        "error": "等了较久仍没拿到分身会话。窗口可能还在连，或被安全软件拦住。",
        "pid": proc.pid,
        **host_status(),
    }


def stop_host() -> dict[str, Any]:
    """关掉工作台开的分身窗口。不是工作台开的，只提示去原窗口断开。"""
    import ctypes
    import subprocess

    st = host_status()
    pid = st.get("hostPid")
    if not pid:
        if st.get("ready"):
            return {
                "ok": False,
                "error": "分身还在，但不是工作台这个窗口开的。请到 BetterGI 或对应窗口里断开。",
                **host_status(),
            }
        return {"ok": True, "message": "没有工作台分身窗口在跑。", **host_status()}

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    WM_CLOSE = 0x0010

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def enum_proc(hwnd, _lparam):
        pid_out = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid_out))
        if int(pid_out.value) == int(pid):
            user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
        return True

    user32.EnumWindows(enum_proc, 0)
    deadline = time.time() + 8
    while time.time() < deadline:
        if _host_pid_running() is None:
            break
        time.sleep(0.3)
    if _host_pid_running() is not None:
        try:
            subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, timeout=8)
        except (OSError, subprocess.TimeoutExpired):
            pass
    try:
        if _HOST_PID.is_file():
            _HOST_PID.unlink()
    except OSError:
        pass
    return {"ok": True, "message": "已关闭工作台分身窗口。", **host_status()}
