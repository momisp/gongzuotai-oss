"""个人工作台本地服务"""
from __future__ import annotations

import http.client
import json
import logging
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_file,
    send_from_directory,
    stream_with_context,
)

from xmind_titles import parse_xmind_titles
import adb_service
import clipboard_service
import ios_service
import mirror_service
import region_record_service
import maker_lab
import test_info
import timelapse_service
import video_swap_service
import wallpaper_service
import wechat_appeal_service
from network_capture_service import bp as net_capture_bp

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
ADB_UPLOAD_DIR = DATA_DIR / "adb_uploads"
IOS_UPLOAD_DIR = DATA_DIR / "ios_uploads"
INTEGRATED_DIR = ROOT / "integrated"
TOOLS_SITE_DIR = INTEGRATED_DIR / "static_tools_web"
TOOLS_DESKTOP_DIR = TOOLS_SITE_DIR / "desktop"
AGILE_SIM_DIR = INTEGRATED_DIR / "agile-sim-demo"
AGILE_SIM_API_PORT = int(os.environ.get("AGILE_SIM_PORT", "5180"))
AGILE_SIM_VITE_PORT = int(os.environ.get("AGILE_SIM_VITE_PORT", "5173"))
AGILE_SIM_API_BASE = f"http://127.0.0.1:{AGILE_SIM_API_PORT}"
AGILE_SIM_VITE_BASE = f"http://127.0.0.1:{AGILE_SIM_VITE_PORT}"
DATA_BACKUP_DIR = DATA_DIR / "backups"
DATA_BACKUP_FILES = (
    "projects.json",
    "project_assets.json",
    "project_round_results.json",
    "project_iteration_refs.json",
    "tools.json",
    "qa_notes.json",
    "test_point_gen.json",
    "data_verify.json",
    "smoke_plans.json",
    "gantt_project_index.json",
    "test_info_config.json",
    "xmind_sessions.json",
    "ops_snapshot.json",
    "auto_qa_modules.json",
    "auto_qa_plans.json",
    "biz_role_catalog.json",
    "project_install_history.json",
    "project_release_checklists.json",
    "workbench_runtime.json",
    "video_swap_projects.json",
    "video_swap_jobs.json",
)
RECHARGE_CALLBACK_DIR = INTEGRATED_DIR / "test_point_generator" / "改包系统" / "充值回调模拟"
RECHARGE_CALLBACK_PORT = int(os.environ.get("RECHARGE_CALLBACK_PORT", "3780"))
RECHARGE_CALLBACK_BASE = f"http://127.0.0.1:{RECHARGE_CALLBACK_PORT}"
AUTO_INSPECTION_DIR = INTEGRATED_DIR / "test_point_generator" / "运维" / "auto-inspection"
OPS_REPORTS_DIR = DATA_DIR / "ops_reports"
OPS_SNAPSHOT_FILE = DATA_DIR / "ops_snapshot.json"
AUTO_QA_MODULES_FILE = DATA_DIR / "auto_qa_modules.json"
AUTO_QA_RUNS_FILE = DATA_DIR / "auto_qa_runs.json"
AUTO_QA_RUNS_DIR = DATA_DIR / "auto_qa_runs"
AUTO_QA_SPRITE_FILE = DATA_DIR / "auto_qa_sprite.json"
SMOKE_PLANS_FILE = DATA_DIR / "smoke_plans.json"
FUNC_PLANS_FILE = DATA_DIR / "func_plans.json"
SPRITE_LLM_CONFIG_FILE = DATA_DIR / "sprite_llm_config.json"
DAILY_REPORT_SCRIPT = AUTO_INSPECTION_DIR / "daily_report.py"
MONITOR_ELECTRON_DIR = INTEGRATED_DIR / "test_point_generator" / "运维" / "monitor-electron"
MONITOR_WEB_DIR = MONITOR_ELECTRON_DIR / "web"
GANTT_CHART_DIR = INTEGRATED_DIR / "gantt-chart"
METRIC_REMARKS_FILE = DATA_DIR / "metric_remarks.json"
METRICS_FILE = MONITOR_ELECTRON_DIR / "metrics.json"
ELECTRON_REMARKS_FILE = Path(os.environ.get("APPDATA", "")) / "ops-monitor-shell" / "metric-remarks.json"
TIMELINE_SYNC_SCRIPT = TOOLS_SITE_DIR / "scripts" / "game-events.mjs"
TIMELINE_META_FILE = TOOLS_SITE_DIR / "assets" / "timeline-meta.json"
PORT = 8765

RELAX_GAMES_DIR = INTEGRATED_DIR / "relax-games"
RELAX_GAME_MODES = [
    {"id": "launcher", "name": "启动器（选模式）", "script": "run.py", "cwd": "."},
    {"id": "circle_ball", "name": "游戏模式一 · 圆内双球", "script": "modes/circle_ball/main.py", "cwd": "modes/circle_ball"},
    {"id": "circle_taiji_evolve", "name": "游戏模式二 · 太极进化", "script": "modes/circle_taiji_evolve/main.py", "cwd": "modes/circle_taiji_evolve"},
    {"id": "projectile_demo", "name": "游戏模式三 · 抛射回合制 Demo", "script": "抛射类回合制demo/main.py", "cwd": "抛射类回合制demo"},
    {"id": "star_rail_duel", "name": "游戏模式四 · 星铁双球对决", "script": "modes/star_rail_duel/main.py", "cwd": "modes/star_rail_duel"},
    {"id": "circle_survivor", "name": "游戏模式五 · 圆内幸存者（实验）", "script": "modes/circle_survivor/main.py", "cwd": "modes/circle_survivor"},
]

INTEGRATED_ALIASES = {
    "monitor-electron": MONITOR_ELECTRON_DIR,
    "agile-sim-demo": AGILE_SIM_DIR,
    "gantt-chart": INTEGRATED_DIR / "gantt-chart",
    "test_point_generator": AGILE_SIM_DIR,
    "data_verify": AGILE_SIM_DIR,
    "relax-games": RELAX_GAMES_DIR,
}

WEB_SITES = {
    "static_tools_web": "/tools-site/",
    "monitor-electron": "/ops-monitor/",
    "agile-sim-demo": "/agile-sim/",
    "test_point_generator": "/agile-sim/?embed=standalone-qa",
    "data_verify": "/agile-sim/?embed=data-verify",
    "gantt-chart": "/gantt-chart/",
}

app = Flask(__name__, static_folder="static", template_folder="templates")
app.register_blueprint(net_capture_bp)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
# 允许上传大型 APK（与远程装包场景对齐）
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024
logging.getLogger("werkzeug").setLevel(logging.ERROR)

_timeline_sync_lock = threading.Lock()
_timeline_sync_state = {"running": False, "last_result": None}

_daily_report_lock = threading.Lock()
_daily_report_state = {"running": False, "last_result": None}

_ecs_live_lock = threading.Lock()
_ecs_live_state = {"running": False, "last_result": None, "updated_at": None}

_agile_sim_lock = threading.Lock()
_agile_sim_proc = None
_recharge_callback_lock = threading.Lock()
_recharge_callback_proc = None
_business_sprite_proc = None

_HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    }
)
_STRIP_RESP_HEADERS = frozenset({"x-frame-options", "content-security-policy"})


def _subprocess_flags():
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def _kill_process_tree(pid: int) -> bool:
    if not pid:
        return False
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F", "/T"],
                capture_output=True,
                timeout=15,
                creationflags=_subprocess_flags(),
            )
        else:
            os.kill(pid, 9)
        return True
    except Exception:
        return False


def _kill_smoke_playwright_orphans() -> int:
    """杀掉残留的冒烟 Playwright/node 进程，避免新一轮一直卡在「冒烟中」。"""
    killed = 0
    if sys.platform != "win32":
        return 0
    try:
        ps = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | "
                "Where-Object { $_.CommandLine -match 'xinshangwu_smoke|playwright test.*business-automation' } | "
                "ForEach-Object { $_.ProcessId }",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
            creationflags=_subprocess_flags(),
        )
        pids: list[int] = []
        for line in (ps.stdout or "").splitlines():
            line = line.strip()
            if line.isdigit():
                pids.append(int(line))
        for pid in sorted(set(pids)):
            if _kill_process_tree(pid):
                killed += 1
    except Exception:
        pass
    return killed


def _agile_sim_path_info() -> dict:
    """钉死并诊断 agile-sim 实际路径（junction / 缺失 / 缺 package.json）。"""
    nominal = str(AGILE_SIM_DIR)
    exists = AGILE_SIM_DIR.exists()
    try:
        resolved = str(AGILE_SIM_DIR.resolve())
    except OSError:
        resolved = nominal
    is_link = False
    try:
        is_link = bool(AGILE_SIM_DIR.is_symlink())
    except OSError:
        is_link = False
    # Windows junction：resolve 后路径常不同于配置路径
    path_diverged = exists and (
        nominal.replace("\\", "/").lower().rstrip("/")
        != resolved.replace("\\", "/").lower().rstrip("/")
    )
    has_pkg = (AGILE_SIM_DIR / "package.json").exists() if exists else False
    has_app = (AGILE_SIM_DIR / "src" / "App.jsx").exists() if exists else False
    warning = ""
    if not exists:
        warning = "integrated/agile-sim-demo 不存在"
    elif not has_pkg or not has_app:
        warning = "目录存在但缺少 package.json 或 src/App.jsx，路径可能指错"
    elif path_diverged or is_link:
        warning = "当前为 junction/symlink：改测点代码请编辑「真实路径」目录"
    return {
        "nominal": nominal,
        "resolved": resolved,
        "exists": exists,
        "isLink": is_link or path_diverged,
        "hasPackageJson": has_pkg,
        "hasAppJsx": has_app,
        "ok": bool(exists and has_pkg and has_app),
        "warning": warning,
    }


def log_agile_sim_path_boot() -> None:
    info = _agile_sim_path_info()
    print(f"[agile-sim] 配置路径: {info['nominal']}")
    print(f"[agile-sim] 真实路径: {info['resolved']}")
    if info.get("warning"):
        print(f"[agile-sim] 警告: {info['warning']}")
    elif info.get("ok"):
        print("[agile-sim] 路径校验通过（package.json + App.jsx）")


def _create_data_backup(note: str = "") -> dict:
    """备份关键 data/*.json 到 data/backups/<timestamp>/，保留最近 20 份。"""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = DATA_BACKUP_DIR / stamp
    dest.mkdir(parents=True, exist_ok=True)
    copied = []
    missing = []
    for name in DATA_BACKUP_FILES:
        src = DATA_DIR / name
        if not src.is_file():
            missing.append(name)
            continue
        target = dest / name
        target.write_bytes(src.read_bytes())
        copied.append(name)
    meta = {
        "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "note": (note or "").strip(),
        "copied": copied,
        "missing": missing,
        "dir": str(dest.relative_to(ROOT)).replace("\\", "/"),
    }
    (dest / "_backup_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    # 清理旧备份
    if DATA_BACKUP_DIR.exists():
        dirs = sorted(
            [p for p in DATA_BACKUP_DIR.iterdir() if p.is_dir()],
            key=lambda p: p.name,
            reverse=True,
        )
        for old in dirs[20:]:
            try:
                for child in old.iterdir():
                    child.unlink(missing_ok=True)
                old.rmdir()
            except OSError:
                pass
    return {"ok": True, **meta}


def _list_data_backups(limit: int = 12) -> list[dict]:
    if not DATA_BACKUP_DIR.exists():
        return []
    items = []
    dirs = sorted(
        [p for p in DATA_BACKUP_DIR.iterdir() if p.is_dir()],
        key=lambda p: p.name,
        reverse=True,
    )
    for d in dirs[: max(1, min(limit, 50))]:
        meta_path = d / "_backup_meta.json"
        meta = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                meta = {}
        items.append(
            {
                "id": d.name,
                "dir": str(d.relative_to(ROOT)).replace("\\", "/"),
                "createdAt": meta.get("createdAt") or d.name,
                "note": meta.get("note") or "",
                "fileCount": len(meta.get("copied") or []),
            }
        )
    return items


def _agile_sim_health_payload(timeout=2) -> dict | None:
    if not AGILE_SIM_DIR.exists():
        return None
    try:
        req = Request(f"{AGILE_SIM_API_BASE}/api/health")
        with urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
    except (URLError, OSError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def _agile_sim_health_ok(timeout=2):
    data = _agile_sim_health_payload(timeout=timeout)
    if not data or not data.get("ok"):
        return False
    feats = data.get("features") if isinstance(data.get("features"), dict) else {}
    # 旧进程无此标记：强制走重启，避免桌面残留 Node 仍跑静态抓取逻辑
    if not feats.get("prototypeRender"):
        print("[agile-sim] API 进程过旧（无 prototypeRender），将重启")
        return False
    if not feats.get("funcReview"):
        print("[agile-sim] API 进程过旧（无 funcReview 评审），将重启")
        return False
    if not feats.get("cursorQaAgentReuse"):
        print("[agile-sim] API 进程过旧（无 cursorQaAgentReuse），将重启")
        return False
    if not feats.get("gamePipeline"):
        print("[agile-sim] API 进程过旧（无 gamePipeline），将重启")
        return False
    return True


def _kill_listeners_on_port(port: int) -> list[int]:
    """结束占用指定端口的进程（Windows）。返回被杀 PID 列表。"""
    killed: list[int] = []
    if sys.platform != "win32":
        return killed
    try:
        out = subprocess.check_output(
            ["netstat", "-ano"],
            text=True,
            errors="replace",
            creationflags=_subprocess_flags(),
        )
    except (OSError, subprocess.CalledProcessError):
        return killed
    pids = set()
    needle = f":{port}"
    for line in out.splitlines():
        if "LISTENING" not in line or needle not in line:
            continue
        parts = line.split()
        if not parts:
            continue
        try:
            pid = int(parts[-1])
        except ValueError:
            continue
        if pid > 0:
            pids.add(pid)
    for pid in pids:
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F", "/T"],
                capture_output=True,
                creationflags=_subprocess_flags(),
            )
            killed.append(pid)
        except OSError:
            pass
    return killed


def _agile_sim_vite_ok(timeout=2):
    """Vite 须以 workbench 模式启动（base=/agile-sim/，资源路径带前缀）。"""
    try:
        req = Request(f"{AGILE_SIM_VITE_BASE}/agile-sim/")
        with urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = resp.read(4096).decode("utf-8", errors="replace")
            return "/agile-sim/" in body and "@vite/client" in body
    except (URLError, OSError, TimeoutError, ValueError):
        return False


def _stop_agile_sim_proc():
    global _agile_sim_proc
    proc = _agile_sim_proc
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    _agile_sim_proc = None
    # 并清理可能残留的端口占用（含桌面旧实例）
    killed = _kill_listeners_on_port(AGILE_SIM_API_PORT) + _kill_listeners_on_port(AGILE_SIM_VITE_PORT)
    if killed:
        print(f"[agile-sim] 已结束占用端口的进程: {killed}")
        time.sleep(0.8)


def _recharge_callback_health_ok(timeout=2) -> bool:
    try:
        req = Request(f"{RECHARGE_CALLBACK_BASE}/api/health")
        with urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except (URLError, OSError, TimeoutError, ValueError):
        return False


def _ensure_recharge_npm_deps() -> tuple[bool, str]:
    if not RECHARGE_CALLBACK_DIR.is_dir():
        return False, f"目录不存在: {RECHARGE_CALLBACK_DIR}"
    marker = RECHARGE_CALLBACK_DIR / "node_modules" / "dotenv"
    if marker.exists():
        return True, ""
    try:
        proc = subprocess.run(
            ["npm", "install"],
            cwd=str(RECHARGE_CALLBACK_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            creationflags=_subprocess_flags(),
            shell=(sys.platform == "win32"),
        )
    except FileNotFoundError:
        return False, "未找到 npm，请先安装 Node.js"
    except subprocess.TimeoutExpired:
        return False, "npm install 超时"
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "npm install 失败").strip()
        return False, err[:500]
    return True, ""


def ensure_recharge_callback_running(timeout=45, force_restart: bool = False) -> tuple[bool, str]:
    """确保充值回调模拟服务在 3780 端口运行。force_restart=True 时杀掉旧进程再启，避免代码改了仍跑旧服务。"""
    global _recharge_callback_proc
    if not force_restart and _recharge_callback_health_ok():
        return True, "already_running"

    ok, err = _ensure_recharge_npm_deps()
    if not ok:
        return False, err

    with _recharge_callback_lock:
        if not force_restart and _recharge_callback_health_ok():
            return True, "already_running"
        # 结束本工具拉起的进程
        if _recharge_callback_proc and _recharge_callback_proc.poll() is None:
            _recharge_callback_proc.terminate()
            try:
                _recharge_callback_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                _recharge_callback_proc.kill()
        # 强制重启时，顺带清掉占用 3780 的残留进程（Windows）
        if force_restart and sys.platform == "win32":
            try:
                subprocess.run(
                    f'for /f "tokens=5" %a in (\'netstat -ano ^| findstr ":{RECHARGE_CALLBACK_PORT}.*LISTENING"\') do taskkill /PID %a /F',
                    shell=True,
                    capture_output=True,
                    timeout=8,
                    creationflags=_subprocess_flags(),
                )
            except (OSError, subprocess.TimeoutExpired):
                pass
            time.sleep(0.5)
        try:
            _recharge_callback_proc = subprocess.Popen(
                ["npm", "start"],
                cwd=str(RECHARGE_CALLBACK_DIR),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=_subprocess_flags(),
                shell=(sys.platform == "win32"),
            )
        except FileNotFoundError:
            return False, "未找到 npm，请先安装 Node.js"
        except OSError as exc:
            return False, str(exc)

    deadline = time.time() + timeout
    while time.time() < deadline:
        if _recharge_callback_health_ok():
            return True, "restarted" if force_restart else "started"
        if _recharge_callback_proc and _recharge_callback_proc.poll() is not None:
            return False, "服务启动后立刻退出，请检查目录下 .env 与依赖"
        time.sleep(0.4)
    return False, "等待服务就绪超时（端口 3780）"


def open_recharge_callback_page() -> dict:
    ok, status = ensure_recharge_callback_running(force_restart=True)
    url = f"{RECHARGE_CALLBACK_BASE}/launcher"
    if not ok:
        return {"ok": False, "error": status, "url": url}
    try:
        if sys.platform == "win32":
            os.startfile(url)
        elif sys.platform == "darwin":
            subprocess.run(["open", url], check=False)
        else:
            subprocess.run(["xdg-open", url], check=False)
    except OSError as exc:
        return {"ok": True, "status": status, "url": url, "opened": False, "warn": str(exc)}
    return {"ok": True, "status": status, "url": url, "opened": True}


def _encode_upstream_uri(uri: str) -> str:
    """将含中文等非 ASCII 字符的路径编码为 http.client 可发送的请求目标。"""
    if not uri.startswith("/"):
        uri = "/" + uri
    parts = urlsplit(uri)
    path = quote(parts.path, safe="/:@!$&'()*+,;=-._~")
    if parts.query:
        query = quote(parts.query, safe="=&;:/?@!$&'()*+,;=-._~%")
        return f"{path}?{query}"
    return path


def _proxy_http(host: str, port: int, upstream_path: str, timeout: float = 120):
    """反向代理；流式转发，避免长耗时/SSE 被整包缓冲后超时。"""
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP and k.lower() != "host"
    }
    body = request.get_data()
    try:
        conn.request(
            request.method,
            _encode_upstream_uri(upstream_path),
            body=body,
            headers=headers,
        )
        resp = conn.getresponse()
    except Exception:
        conn.close()
        raise

    out_headers = [
        (k, v)
        for k, v in resp.getheaders()
        if k.lower() not in _HOP_BY_HOP and k.lower() not in _STRIP_RESP_HEADERS
    ]
    # 禁止中间层缓冲 SSE
    ct = (resp.getheader("Content-Type") or "").lower()
    if "text/event-stream" in ct:
        out_headers = [(k, v) for k, v in out_headers if k.lower() != "content-length"]
        out_headers.append(("X-Accel-Buffering", "no"))
        out_headers.append(("Cache-Control", "no-cache, no-transform"))

    @stream_with_context
    def generate():
        try:
            while True:
                chunk = resp.read(16384)
                if not chunk:
                    break
                yield chunk
        finally:
            conn.close()

    return Response(generate(), status=resp.status, headers=out_headers)


def _proxy_to_vite(upstream_path):
    # 静态/页面走 Vite；长耗时 API 见 agile_sim_proxy 直连 5180
    return _proxy_http("127.0.0.1", AGILE_SIM_VITE_PORT, upstream_path, timeout=120)


def ensure_agile_sim_dev_running(timeout=90):
    """确保 agile-sim 开发服务（Vite /agile-sim/ + Express API 5180）已启动。"""
    global _agile_sim_proc
    if _agile_sim_vite_ok() and _agile_sim_health_ok():
        return True
    if not (AGILE_SIM_DIR / "package.json").exists():
        return False
    with _agile_sim_lock:
        if _agile_sim_vite_ok() and _agile_sim_health_ok():
            return True
        # 端口被旧 Node 占用、或 API 过旧时，先清端口再拉起
        print("[agile-sim] 准备重启开发服务（清理 5173/5180）…")
        _stop_agile_sim_proc()
        env = os.environ.copy()
        env.setdefault("AGILE_SIM_PORT", str(AGILE_SIM_API_PORT))
        env.setdefault("AGILE_SIM_HOST", "127.0.0.1")
        env.setdefault("AGILE_SIM_VITE_PORT", str(AGILE_SIM_VITE_PORT))
        _agile_sim_proc = subprocess.Popen(
            ["npm", "run", "dev:workbench"],
            cwd=str(AGILE_SIM_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            shell=True,
            creationflags=_subprocess_flags(),
        )
        deadline = time.time() + timeout
        while time.time() < deadline:
            if _agile_sim_vite_ok() and _agile_sim_health_ok():
                print(f"[agile-sim] workbench 模式已就绪 → /agile-sim/ (Vite {AGILE_SIM_VITE_BASE})")
                return True
            if _agile_sim_proc.poll() is not None:
                break
            time.sleep(0.5)
    return _agile_sim_vite_ok() and _agile_sim_health_ok()


def run_timeline_sync(trigger="manual"):
    """拉取全部游戏活动并写入 assets/timeline-*.json（一次性 node 进程，无需常驻桥接）。"""
    if not TIMELINE_SYNC_SCRIPT.exists():
        result = {"ok": False, "trigger": trigger, "error": "game-events.mjs 不存在", "updated_at": datetime.now().isoformat(timespec="seconds")}
        _timeline_sync_state["last_result"] = result
        return result

    with _timeline_sync_lock:
        if _timeline_sync_state["running"]:
            return {"ok": False, "trigger": trigger, "error": "同步正在进行中", "running": True}
        _timeline_sync_state["running"] = True

    print(f"[timeline] 开始同步游戏活动数据（{trigger}）…")
    try:
        proc = subprocess.run(
            ["node", str(TIMELINE_SYNC_SCRIPT), "--all"],
            cwd=str(TOOLS_SITE_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=300,
            encoding="utf-8",
            errors="replace",
            creationflags=_subprocess_flags(),
        )
        meta = None
        if TIMELINE_META_FILE.exists():
            with open(TIMELINE_META_FILE, encoding="utf-8") as f:
                meta = json.load(f)
        result = {
            "ok": proc.returncode == 0,
            "trigger": trigger,
            "returncode": proc.returncode,
            "updated_at": (meta or {}).get("updated_at") or datetime.now().isoformat(timespec="seconds"),
            "games": (meta or {}).get("games"),
            "stderr": (proc.stderr or "")[-800:],
        }
        if proc.returncode != 0:
            result["error"] = "node 进程退出异常"
            print(f"[timeline] 同步异常（exit {proc.returncode}）：{(proc.stderr or '')[-200:]}")
        else:
            print(f"[timeline] 同步完成：{result['updated_at']}（trigger={trigger}）")
        _timeline_sync_state["last_result"] = result
        return result
    except subprocess.TimeoutExpired:
        result = {"ok": False, "trigger": trigger, "error": "同步超时（>5分钟）", "updated_at": datetime.now().isoformat(timespec="seconds")}
        _timeline_sync_state["last_result"] = result
        print("[timeline] 同步超时")
        return result
    except OSError as exc:
        result = {"ok": False, "trigger": trigger, "error": str(exc), "updated_at": datetime.now().isoformat(timespec="seconds")}
        _timeline_sync_state["last_result"] = result
        print(f"[timeline] 同步失败：{exc}")
        return result
    finally:
        _timeline_sync_state["running"] = False


def _seconds_until(hour, minute):
    now = datetime.now()
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def _timeline_scheduler_loop():
    while True:
        wait = _seconds_until(3, 0)
        print(f"[timeline] 下次定时同步：{wait / 3600:.1f} 小时后（凌晨 3:00）")
        time.sleep(wait)
        run_timeline_sync(trigger="scheduled")
        time.sleep(65)


def start_timeline_background_tasks():
    threading.Thread(target=lambda: run_timeline_sync(trigger="startup"), daemon=True).start()
    threading.Thread(target=_timeline_scheduler_loop, daemon=True).start()


@app.after_request
def disable_cache(response):
    if response.content_type and ("text/html" in response.content_type or "javascript" in response.content_type or "css" in response.content_type):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response

DATA_FILES = {
    "file-paths": "file_paths.json",
    "links": "links.json",
    "projects": "projects.json",
    "project-assets": "project_assets.json",
    "xmind-sessions": "xmind_sessions.json",
    "tools": "tools.json",
    "commands": "commands.json",
    "report-templates": "report_templates.json",
    "qa-notes": "qa_notes.json",
    "auto-qa-plans": "auto_qa_plans.json",
    "project-iteration-refs": "project_iteration_refs.json",
}

WORKBENCH_DOCS_DIR = ROOT / "workbench" / "docs"


def load_json(name: str):
    path = DATA_DIR / DATA_FILES[name]
    if not path.exists():
        return [] if name != "report-templates" else {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(name: str, data):
    path = DATA_DIR / DATA_FILES[name]
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _project_asset_matches(item: dict, project: dict) -> bool:
    if (item.get("project_id") or "") == (project.get("id") or ""):
        return True
    names = set(project.get("asset_projects") or [])
    return bool(names and (item.get("project") or "") in names)


def _apply_project_links(project: dict) -> dict:
    """按资产分组和原型 URL 回填项目外键；旧字段原样保留。"""
    project_id = str(project.get("id") or "").strip()
    project_name = str(project.get("name") or "").strip()
    if not project_id or not project_name:
        return {"assets": 0, "testPoints": 0, "dataVerify": 0}

    assets = load_json("project-assets")
    matched_assets = []
    changed_assets = False
    gantt_ids = project.get("gantt_project_ids") or []
    default_gantt_id = gantt_ids[0] if len(gantt_ids) == 1 else ""
    for item in assets:
        if not _project_asset_matches(item, project):
            continue
        matched_assets.append(item)
        if item.get("project_id") != project_id:
            item["project_id"] = project_id
            changed_assets = True
        if default_gantt_id and item.get("gantt_project_id") != default_gantt_id:
            item["gantt_project_id"] = default_gantt_id
            changed_assets = True
    if changed_assets:
        save_json("project-assets", assets)

    url_assets = [
        item for item in matched_assets
        if str(item.get("url") or "").strip()
    ]

    def match_asset(material: str):
        text = str(material or "")
        for item in url_assets:
            url = str(item.get("url") or "").strip()
            if url and url in text:
                return item
        return None

    tp_state = load_test_point_gen_state()
    tp_count = 0
    tp_changed = False
    for rec in tp_state.get("records") or []:
        asset = match_asset(rec.get("material"))
        if not asset:
            continue
        tp_count += 1
        if rec.get("projectId") != project_id:
            rec["projectId"] = project_id
            rec["projectName"] = project_name
            rec["assetId"] = asset.get("id") or ""
            tp_changed = True
    if tp_changed:
        save_test_point_gen_state(tp_state)

    dv_state = load_data_verify_state()
    dv_count = 0
    dv_changed = False
    for rec in dv_state.get("records") or []:
        asset = match_asset(rec.get("material"))
        if not asset:
            continue
        dv_count += 1
        if rec.get("projectId") != project_id:
            rec["projectId"] = project_id
            rec["projectName"] = project_name
            rec["assetId"] = asset.get("id") or ""
            dv_changed = True
    if dv_changed:
        save_data_verify_state(dv_state)

    return {
        "assets": len(matched_assets),
        "testPoints": tp_count,
        "dataVerify": dv_count,
    }


def load_metric_remarks() -> dict:
    if not METRIC_REMARKS_FILE.exists():
        migrate_electron_remarks()
    if not METRIC_REMARKS_FILE.exists():
        return {}
    with open(METRIC_REMARKS_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def save_metric_remarks(data: dict):
    METRIC_REMARKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRIC_REMARKS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def migrate_electron_remarks():
    """首次启动时从 Electron userData 导入备注（若工作台尚无数据）。"""
    if METRIC_REMARKS_FILE.exists() or not ELECTRON_REMARKS_FILE.exists():
        return
    try:
        with open(ELECTRON_REMARKS_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data:
            save_metric_remarks(data)
            print(f"[ops-monitor] 已从 Electron 导入备注：{ELECTRON_REMARKS_FILE}")
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[ops-monitor] 导入 Electron 备注失败：{exc}")


def resolve_path(raw: str) -> Path:
    p = Path(raw)
    if p.is_absolute():
        return p
    return ROOT / raw


FOCUS_OPEN_SCRIPT = Path(__file__).resolve().parent / "scripts" / "focus_open.ps1"


def open_path_target(target: Path) -> None:
    path_str = str(target.resolve())
    is_dir = target.is_dir()

    if sys.platform == "win32":
        if FOCUS_OPEN_SCRIPT.exists():
            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(FOCUS_OPEN_SCRIPT),
                    "-Path",
                    path_str,
                ] + (["-IsDir"] if is_dir else []),
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
            )
        else:
            os.startfile(path_str)
        return

    if sys.platform == "darwin":
        subprocess.run(["open", path_str], check=False)
    else:
        subprocess.run(["xdg-open", path_str], check=False)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/biz-role")
def biz_role_page():
    """角色业务台：独立页，新开浏览器标签，不走弹窗。"""
    return render_template("biz_role.html")


@app.route("/video-swap")
def video_swap_page():
    """视频替换工作台：独立页，新开浏览器标签，更大工作区。"""
    return render_template("video_swap.html")


@app.route("/seed-script")
def seed_script_page():
    """造数脚本：独立页，按角色分框造数。"""
    return render_template("seed_script.html")


def _load_auto_control():
    """热加载，避免改接线后进程仍用内存旧代码（S7 误判 stub）。"""
    import importlib
    import sys

    for name in ("platform_env", "game_sdk_api", "money_settlement_pw", "money_flow", "auto_control"):
        mod = sys.modules.get(name)
        if mod is not None:
            importlib.reload(mod)
    import auto_control

    return auto_control


@app.route("/auto-control")
def auto_control_page():
    """自动化控制面板：独立页，进度总览 / 排队 / 钱链路编排。"""
    return render_template("auto_control.html")


@app.route("/auto-control/report/<run_id>")
def auto_control_report_page(run_id):
    """测试报告 HTML（打开时按最新模板重生成）。"""
    auto_control = _load_auto_control()
    run = auto_control.get_run(run_id)
    if not run:
        return ("运行不存在", 404)
    try:
        auto_control._write_report_html(run_id)
    except Exception as exc:  # noqa: BLE001
        return (f"生成报告失败: {exc}", 500)
    path = auto_control.RUNS_DIR / run_id / "report.html"
    if not path.is_file():
        return ("报告不存在", 404)
    return send_file(path, mimetype="text/html", as_attachment=False, download_name=f"{run_id}_report.html")


@app.route("/cpu-monitor")
def cpu_monitor_page():
    """CPU 占用监控：独立页，实时进程列表与结束进程。"""
    return render_template("cpu_monitor.html")


@app.route("/api/test-process", methods=["GET"])
def api_test_process_get():
    """今日工作台右侧：测试流程阶段定义 + 近期项目进度。"""
    path = DATA_DIR / "test_process.json"
    if not path.exists():
        return jsonify({"stages": [], "tracks": [], "updatedAt": None})
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500
    if not isinstance(data, dict):
        return jsonify({"error": "test_process.json 格式须为对象"}), 500
    return jsonify(data)


@app.route("/api/test-process/tracks/<track_id>", methods=["PATCH", "PUT"])
def api_test_process_track_patch(track_id: str):
    """更新某条测试流程轨道的阶段/备注。"""
    path = DATA_DIR / "test_process.json"
    if not path.exists():
        return jsonify({"ok": False, "error": "无 test_process.json"}), 404
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": str(exc)}), 500
    tracks = data.get("tracks") if isinstance(data, dict) else None
    if not isinstance(tracks, list):
        return jsonify({"ok": False, "error": "tracks 无效"}), 500
    body = request.json or {}
    hit = None
    for t in tracks:
        if str(t.get("id") or "") == str(track_id):
            hit = t
            break
    if not hit:
        return jsonify({"ok": False, "error": "未找到轨道"}), 404
    for key in ("stageId", "status", "note", "artifactDir", "prototypeUrl", "name"):
        if key in body:
            hit[key] = body[key]
    from datetime import datetime, timezone, timedelta

    hit["updatedAt"] = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    data["updatedAt"] = hit["updatedAt"] + "T00:00:00+08:00"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return jsonify({"ok": True, "track": hit})


@app.route("/api/workbench-health")
def workbench_health():
    """今日工作台服务健康检查（PRD DEV-02）。须在 /api/<collection> 之前注册。"""
    vite_ok = _agile_sim_vite_ok(timeout=1.5)
    api_payload = _agile_sim_health_payload(timeout=1.5) or {}
    api_ok = bool(api_payload.get("ok"))
    path_info = _agile_sim_path_info()
    try:
        adb = adb_service.list_devices()
    except Exception as exc:  # noqa: BLE001 — 诊断接口需吞掉本地环境异常
        adb = {"ok": False, "error": str(exc), "devices": []}
    devices = adb.get("devices") if isinstance(adb, dict) else []
    return jsonify(
        {
            "ok": True,
            "workbench": {"ok": True},
            "agileSim": {
                "dir": path_info.get("resolved") or path_info.get("nominal"),
                "nominal": path_info.get("nominal"),
                "resolved": path_info.get("resolved"),
                "exists": path_info.get("exists"),
                "isLink": path_info.get("isLink"),
                "pathOk": path_info.get("ok"),
                "pathWarning": path_info.get("warning") or "",
                "vite": {"ok": vite_ok, "base": AGILE_SIM_VITE_BASE},
                "api": {
                    "ok": api_ok,
                    "base": AGILE_SIM_API_BASE,
                    "features": api_payload.get("features") if isinstance(api_payload, dict) else None,
                },
            },
            "adb": {
                "ok": bool(adb.get("ok")) if isinstance(adb, dict) else False,
                "deviceCount": len(devices or []),
                "devices": devices or [],
                "error": adb.get("error") if isinstance(adb, dict) else None,
            },
            "backups": _list_data_backups(limit=5),
            "hint": "改后端需重启 start.bat；嵌入白屏可 Ctrl+F5 / 新窗口打开 / 看 Vite·API 状态。",
        }
    )


@app.route("/api/data-backup", methods=["GET"])
def data_backup_list():
    return jsonify({"ok": True, "items": _list_data_backups(limit=20)})


@app.route("/api/data-backup", methods=["POST"])
def data_backup_create():
    body = request.json or {}
    result = _create_data_backup(note=str(body.get("note") or ""))
    return jsonify(result), 201


RUNTIME_CONFIG_FILE = DATA_DIR / "workbench_runtime.json"
RUNTIME_DEFAULTS = {
    "timelineSync": True,
    "clipboardHistory": True,
    "regionRecord": True,
    "cpuMonitor": True,
}
RELEASE_CHECKLIST_FILE = DATA_DIR / "project_release_checklists.json"
DEFAULT_RELEASE_CHECKS = [
    {"id": "func_smoke", "group": "功能", "title": "主流程冒烟通过"},
    {"id": "func_blockers", "group": "功能", "title": "无未关闭阻塞缺陷"},
    {"id": "perf_baseline", "group": "性能", "title": "关键接口/页面有基线或本轮压测结论"},
    {"id": "perf_error", "group": "性能", "title": "目标并发下错误率可接受"},
    {"id": "sec_auth", "group": "安全", "title": "未登录/越权抽测通过"},
    {"id": "sec_input", "group": "安全", "title": "关键输入与上传无低级注入/脚本执行"},
    {"id": "sec_sensitive", "group": "安全", "title": "无密钥/明文密码泄露"},
    {"id": "sec_pay", "group": "安全", "title": "支付/积分回调验签与幂等已确认（如适用）"},
]


def load_runtime_config() -> dict:
    data = {}
    if RUNTIME_CONFIG_FILE.exists():
        try:
            raw = json.loads(RUNTIME_CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except (OSError, json.JSONDecodeError):
            data = {}
    out = dict(RUNTIME_DEFAULTS)
    for key in RUNTIME_DEFAULTS:
        if key in data:
            out[key] = bool(data[key])
    return out


def save_runtime_config(updates: dict) -> dict:
    cfg = load_runtime_config()
    for key in RUNTIME_DEFAULTS:
        if key in updates:
            cfg[key] = bool(updates[key])
    RUNTIME_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return cfg


def _load_release_checklists() -> dict:
    if not RELEASE_CHECKLIST_FILE.exists():
        return {}
    try:
        data = json.loads(RELEASE_CHECKLIST_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_release_checklists(data: dict) -> None:
    RELEASE_CHECKLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    RELEASE_CHECKLIST_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _match_text(hay: str, q: str) -> bool:
    return q in (hay or "").lower()


@app.route("/api/global-search")
def global_search():
    q = str(request.args.get("q") or "").strip().lower()
    if len(q) < 1:
        return jsonify({"ok": True, "q": "", "groups": []})
    limit = 8
    groups = []

    projects = []
    for p in load_json("projects"):
        blob = " ".join(
            [
                str(p.get("name") or ""),
                str(p.get("id") or ""),
                " ".join(p.get("aliases") or []),
            ]
        ).lower()
        if _match_text(blob, q):
            projects.append(
                {
                    "id": p.get("id"),
                    "title": p.get("name") or p.get("id"),
                    "subtitle": p.get("id"),
                    "action": {"type": "project", "projectId": p.get("id")},
                }
            )
            if len(projects) >= limit:
                break
    if projects:
        groups.append({"key": "projects", "label": "项目", "items": projects})

    notes = []
    for item in load_json("qa-notes"):
        blob = " ".join(
            [
                str(item.get("title") or ""),
                str(item.get("problem") or ""),
                str(item.get("solution") or ""),
                " ".join(item.get("tags") or []),
                str(item.get("category") or ""),
            ]
        ).lower()
        if _match_text(blob, q):
            notes.append(
                {
                    "id": item.get("id"),
                    "title": item.get("title") or "未命名问题",
                    "subtitle": item.get("category") or "",
                    "action": {"type": "tool", "toolId": "qa-notes", "noteId": item.get("id")},
                }
            )
            if len(notes) >= limit:
                break
    if notes:
        groups.append({"key": "qa-notes", "label": "QA 问题集", "items": notes})

    links = []
    for item in load_json("links"):
        blob = " ".join(
            [
                str(item.get("name") or ""),
                str(item.get("url") or ""),
                str(item.get("problem") or ""),
                str(item.get("category") or ""),
                " ".join(item.get("tags") or []),
            ]
        ).lower()
        if _match_text(blob, q):
            links.append(
                {
                    "id": item.get("id"),
                    "title": item.get("name") or item.get("url"),
                    "subtitle": item.get("url") or "",
                    "action": {"type": "url", "url": item.get("url")},
                }
            )
            if len(links) >= limit:
                break
    if links:
        groups.append({"key": "links", "label": "常用网址", "items": links})

    try:
        catalog = test_info.catalog()
        ti_items = []
        for doc in catalog.get("items") or []:
            blob = " ".join(
                [
                    str(doc.get("title") or ""),
                    str(doc.get("name") or ""),
                    str(doc.get("note") or ""),
                    str(doc.get("desc") or ""),
                    str(doc.get("path") or ""),
                    str(doc.get("category") or ""),
                ]
            ).lower()
            if not _match_text(blob, q):
                continue
            ti_items.append(
                {
                    "id": doc.get("id") or doc.get("path"),
                    "title": doc.get("title") or doc.get("name") or "测试资料",
                    "subtitle": doc.get("category") or "",
                    "action": {
                        "type": "tool",
                        "toolId": "test-info",
                        "docId": doc.get("id"),
                        "path": doc.get("path"),
                    },
                }
            )
            if len(ti_items) >= limit:
                break
        if ti_items:
            groups.append({"key": "test-info", "label": "测试信息", "items": ti_items})
    except Exception:
        pass

    try:
        ml = maker_lab.catalog()
        ml_items = []
        for doc in ml.get("items") or []:
            blob = " ".join(
                [
                    str(doc.get("title") or ""),
                    str(doc.get("summary") or ""),
                    str(doc.get("fileName") or ""),
                    str(doc.get("rel") or ""),
                ]
            ).lower()
            if not _match_text(blob, q):
                continue
            ml_items.append(
                {
                    "id": doc.get("id") or doc.get("path"),
                    "title": doc.get("title") or doc.get("fileName") or "硬件笔记",
                    "subtitle": "硬件制作",
                    "action": {
                        "type": "tool",
                        "toolId": "maker-lab",
                        "docId": doc.get("id"),
                        "path": doc.get("path"),
                    },
                }
            )
            if len(ml_items) >= limit:
                break
        if ml_items:
            groups.append({"key": "maker-lab", "label": "硬件制作", "items": ml_items})
    except Exception:
        pass

    return jsonify({"ok": True, "q": q, "groups": groups})


@app.route("/api/workbench-runtime", methods=["GET"])
def workbench_runtime_get():
    return jsonify({"ok": True, "config": load_runtime_config()})


@app.route("/api/workbench-runtime", methods=["PUT"])
def workbench_runtime_put():
    body = request.json or {}
    cfg = save_runtime_config(body if isinstance(body, dict) else {})
    return jsonify({"ok": True, "config": cfg, "hint": "部分开关需重启 start.bat 后生效"})


@app.route("/api/projects/<project_id>/context-pack", methods=["GET"])
def project_context_pack(project_id):
    """QA-03：从项目资产里提炼账号/环境/域名/包路径，便于带入装包与自动化。"""
    projects = load_json("projects")
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    assets = [a for a in load_json("project-assets") if _project_asset_matches(a, project)]
    keywords = ("账号", "账户", "密码", "环境", "域名", "url", "包", "apk", "ipa", "提测")
    pack = {"accounts": [], "envs": [], "urls": [], "packages": [], "others": []}
    for item in assets:
        text = " ".join(
            [
                str(item.get("name") or ""),
                str(item.get("note") or ""),
                str(item.get("env_group") or ""),
                " ".join(item.get("tags") or []),
                str(item.get("path") or ""),
                str(item.get("url") or ""),
            ]
        ).lower()
        entry = {
            "id": item.get("id"),
            "name": item.get("name"),
            "note": item.get("note") or "",
            "path": item.get("path") or "",
            "url": item.get("url") or "",
            "env": item.get("env_group") or item.get("iter_group") or "",
        }
        if any(k in text for k in ("账号", "账户", "密码", "account")):
            pack["accounts"].append(entry)
        elif any(k in text for k in ("apk", "ipa", "包", "提测")):
            pack["packages"].append(entry)
        elif item.get("url") or "域名" in text or "http" in text:
            pack["urls"].append(entry)
        elif any(k in text for k in ("环境", "env", "测试服", "正式")):
            pack["envs"].append(entry)
        elif any(k in text for k in keywords):
            pack["others"].append(entry)
    return jsonify({"ok": True, "projectId": project_id, "projectName": project.get("name"), "pack": pack})


@app.route("/api/projects/<project_id>/bug-template", methods=["GET"])
def project_bug_template(project_id):
    """QA-04：根据最近冒烟失败用例生成可贴禅道的缺陷 Markdown。"""
    projects = load_json("projects")
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        return jsonify({"ok": False, "error": "项目不存在"}), 404

    failed = []
    env_hint = ""
    smoke_plans_path = DATA_DIR / "smoke_plans.json"
    plan = None
    if smoke_plans_path.exists():
        try:
            plans = json.loads(smoke_plans_path.read_text(encoding="utf-8"))
            if isinstance(plans, list):
                plan = next((p for p in plans if str(p.get("projectId")) == str(project_id)), None)
        except (OSError, json.JSONDecodeError):
            plan = None
    if isinstance(plan, dict):
        env_hint = str(plan.get("baseUrl") or "")

    runs = []
    try:
        runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    except Exception:
        runs = []
    latest = None
    for run in reversed(runs):
        if str(run.get("projectId") or "") == str(project_id) and run.get("kind") == "smoke":
            latest = run
            break
    if latest:
        run_dir = AUTO_QA_RUNS_DIR / str(latest.get("id") or "")
        report = _smoke_read_report(run_dir, plan, latest)
        for case in report.get("cases") or []:
            if case.get("status") == "failed":
                failed.append(case)

    try:
        pack_assets = [a for a in load_json("project-assets") if _project_asset_matches(a, project)]
        urls = [a.get("url") for a in pack_assets if a.get("url")]
        if urls:
            env_hint = env_hint or urls[0]
    except Exception:
        pass

    lines = [
        f"【缺陷】{project.get('name') or project_id} - 冒烟失败",
        "",
        "## 环境",
        f"- 项目：{project.get('name') or ''}（`{project_id}`）",
        f"- 地址：{env_hint or '（请补充）'}",
        f"- 账号：（请补充）",
        f"- 包版本/构建号：（请补充）",
        "",
        "## 复现步骤",
    ]
    if failed:
        for i, case in enumerate(failed[:8], 1):
            title = case.get("title") or case.get("name") or case.get("id") or "失败用例"
            err = case.get("error") or case.get("note") or case.get("phenomenon") or ""
            lines.append(f"{i}. {title}")
            if err:
                lines.append(f"   - 现象：{err}")
    else:
        lines.append("1. （暂无冒烟失败记录，请手工填写步骤）")
        lines.append("2. ")
        lines.append("3. ")

    lines += [
        "",
        "## 期望结果",
        "- （请补充）",
        "",
        "## 实际结果",
        "- 冒烟用例失败，详见上方步骤/现象",
        "",
        "## 附件",
        "- [ ] 截图 / 录屏",
        "- [ ] 日志 / 网络请求",
        "",
        f"> 由工作台自动生成 · {datetime.now().strftime('%Y-%m-%d %H:%M')}",
    ]
    markdown = "\n".join(lines)
    return jsonify({"ok": True, "markdown": markdown, "failedCount": len(failed)})


@app.route("/api/projects/<project_id>/release-checklist", methods=["GET"])
def project_release_checklist_get(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    store = _load_release_checklists()
    saved = store.get(project_id) if isinstance(store.get(project_id), dict) else {}
    checked = set(saved.get("checked") or [])
    items = []
    for item in DEFAULT_RELEASE_CHECKS:
        items.append({**item, "checked": item["id"] in checked})
    return jsonify(
        {
            "ok": True,
            "items": items,
            "updatedAt": saved.get("updatedAt") or "",
            "note": saved.get("note") or "",
        }
    )


@app.route("/api/projects/<project_id>/release-checklist", methods=["PUT"])
def project_release_checklist_put(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    body = request.json or {}
    checked = body.get("checked") or []
    if not isinstance(checked, list):
        checked = []
    valid_ids = {x["id"] for x in DEFAULT_RELEASE_CHECKS}
    checked = [str(x) for x in checked if str(x) in valid_ids]
    store = _load_release_checklists()
    store[project_id] = {
        "checked": checked,
        "note": str(body.get("note") or "").strip(),
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    _save_release_checklists(store)
    return jsonify({"ok": True, **store[project_id]})


INSTALL_HISTORY_FILE = DATA_DIR / "project_install_history.json"


def _load_install_history() -> dict:
    if not INSTALL_HISTORY_FILE.exists():
        return {}
    try:
        data = json.loads(INSTALL_HISTORY_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_install_history(data: dict) -> None:
    INSTALL_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    INSTALL_HISTORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


@app.route("/api/projects/<project_id>/install-history", methods=["GET"])
def project_install_history_get(project_id):
    store = _load_install_history()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    items = sorted(items, key=lambda x: str(x.get("at") or ""), reverse=True)
    return jsonify({"ok": True, "items": items[:30], "latest": items[0] if items else None})


@app.route("/api/projects/<project_id>/install-history", methods=["POST"])
def project_install_history_post(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    body = request.json or {}
    item = {
        "id": "ins_" + uuid.uuid4().hex[:10],
        "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "ok": bool(body.get("ok", True)),
        "serial": str(body.get("serial") or "").strip(),
        "apkName": str(body.get("apkName") or body.get("name") or "").strip(),
        "apkPath": str(body.get("apkPath") or body.get("path") or "").strip(),
        "note": str(body.get("note") or "").strip()[:200],
        "error": str(body.get("error") or "").strip()[:300],
    }
    store = _load_install_history()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    items.append(item)
    store[project_id] = items[-40:]
    _save_install_history(store)
    return jsonify({"ok": True, "item": item}), 201


@app.route("/api/projects/<project_id>/regression-suggest", methods=["GET"])
def project_regression_suggest(project_id):
    """QA-05：根据关联甘特未完成任务，给出回归模块建议。"""
    projects = load_json("projects")
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    gantt_ids = set(project.get("gantt_project_ids") or [])
    suggestions = []
    gantt_path = DATA_DIR / "gantt_project_index.json"
    if gantt_path.exists() and gantt_ids:
        try:
            raw = json.loads(gantt_path.read_text(encoding="utf-8"))
            entries = raw if isinstance(raw, list) else []
        except (OSError, json.JSONDecodeError):
            entries = []
        for entry in entries:
            if entry.get("gantt_project_id") not in gantt_ids:
                continue
            for task in entry.get("tasks") or []:
                if not isinstance(task, dict):
                    continue
                status = str(task.get("status") or "todo").lower()
                if status in ("done", "completed", "closed", "归档"):
                    continue
                name = str(task.get("name") or "").strip()
                if not name:
                    continue
                suggestions.append(
                    {
                        "module": name,
                        "status": status,
                        "start": task.get("start") or "",
                        "end": task.get("end") or "",
                        "ganttName": entry.get("project_name") or "",
                        "reason": "甘特任务未完成，建议纳入回归",
                        "checked": False,
                    }
                )
    # 去重按模块名
    seen = set()
    uniq = []
    for s in suggestions:
        key = s["module"].lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(s)
    # 补充默认主流程
    if not any("冒烟" in s["module"] or "主流程" in s["module"] for s in uniq):
        uniq.insert(
            0,
            {
                "module": "主流程冒烟",
                "status": "suggest",
                "start": "",
                "end": "",
                "ganttName": "",
                "reason": "发版前默认建议",
                "checked": True,
            },
        )
    return jsonify({"ok": True, "items": uniq[:40], "count": len(uniq)})


@app.route("/api/workbench-selfcheck")
def workbench_selfcheck():
    """DEV-08：最小自检（首页/健康/ADB/测点路径）。"""
    checks = []
    checks.append({"id": "workbench", "name": "工作台 API", "ok": True, "detail": "本接口可达"})

    path_info = _agile_sim_path_info()
    checks.append(
        {
            "id": "agile-path",
            "name": "测点目录",
            "ok": bool(path_info.get("ok")),
            "detail": path_info.get("warning") or path_info.get("resolved") or "",
        }
    )
    vite_ok = _agile_sim_vite_ok(timeout=1.2)
    checks.append(
        {
            "id": "vite",
            "name": "Vite :5173",
            "ok": vite_ok,
            "detail": "workbench 模式就绪" if vite_ok else "未启动或非 /agile-sim/ 模式",
        }
    )
    api_payload = _agile_sim_health_payload(timeout=1.2) or {}
    api_ok = bool(api_payload.get("ok"))
    checks.append(
        {
            "id": "agile-api",
            "name": "测点 API :5180",
            "ok": api_ok,
            "detail": "健康" if api_ok else "未就绪（打开测点会 warmup）",
        }
    )
    try:
        adb = adb_service.list_devices()
        adb_ok = bool(adb.get("ok"))
        n = len(adb.get("devices") or [])
        detail = f"{n} 台设备" if adb_ok else (adb.get("error") or "ADB 不可用")
    except Exception as exc:  # noqa: BLE001
        adb_ok = False
        detail = str(exc)
    checks.append({"id": "adb", "name": "ADB devices", "ok": adb_ok, "detail": detail})

    # 关键数据文件
    for label, name in (("projects.json", "projects.json"), ("tools.json", "tools.json")):
        p = DATA_DIR / name
        checks.append(
            {
                "id": f"data-{name}",
                "name": label,
                "ok": p.is_file(),
                "detail": str(p) if p.is_file() else "缺失",
            }
        )

    passed = sum(1 for c in checks if c.get("ok"))
    return jsonify(
        {
            "ok": passed == len(checks),
            "passed": passed,
            "total": len(checks),
            "checks": checks,
            "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@app.route("/api/<collection>", methods=["GET"])
def get_collection(collection):
    if collection not in DATA_FILES:
        return jsonify({"error": "not found"}), 404
    return jsonify(load_json(collection))


@app.route("/api/<collection>", methods=["POST"])
def create_item(collection):
    if collection not in DATA_FILES or collection in ("tools", "report-templates", "auto-qa-plans"):
        return jsonify({"error": "not allowed"}), 400
    items = load_json(collection)
    item = request.json or {}
    item["id"] = item.get("id") or str(uuid.uuid4())[:8]
    if collection == "project-assets" and not item.get("project_id"):
        for project in load_json("projects"):
            if (item.get("project") or "") in (project.get("asset_projects") or []):
                item["project_id"] = project.get("id") or ""
                break
    items.append(item)
    save_json(collection, items)
    return jsonify(item), 201


@app.route("/api/<collection>/<item_id>", methods=["PUT"])
def update_item(collection, item_id):
    if collection not in DATA_FILES or collection in ("tools", "report-templates", "auto-qa-plans"):
        return jsonify({"error": "not allowed"}), 400
    items = load_json(collection)
    updated = request.json or {}
    if collection == "project-assets" and not updated.get("project_id"):
        for project in load_json("projects"):
            if (updated.get("project") or "") in (project.get("asset_projects") or []):
                updated["project_id"] = project.get("id") or ""
                break
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            updated["id"] = item_id
            items[i] = updated
            save_json(collection, items)
            return jsonify(updated)
    return jsonify({"error": "not found"}), 404


@app.route("/api/<collection>/<item_id>", methods=["DELETE"])
def delete_item(collection, item_id):
    if collection not in DATA_FILES or collection in ("tools", "report-templates", "auto-qa-plans"):
        return jsonify({"error": "not allowed"}), 400
    items = load_json(collection)
    new_items = [i for i in items if i.get("id") != item_id]
    if len(new_items) == len(items):
        return jsonify({"error": "not found"}), 404
    save_json(collection, new_items)
    return jsonify({"ok": True})


@app.route("/api/projects/options", methods=["GET"])
def project_link_options():
    assets = load_json("project-assets")
    asset_projects = sorted({
        str(item.get("project") or "").strip()
        for item in assets
        if str(item.get("project") or "").strip()
    })
    gantt = []
    gantt_path = DATA_DIR / "gantt_project_index.json"
    if gantt_path.exists():
        try:
            with open(gantt_path, encoding="utf-8") as f:
                raw = json.load(f)
            gantt = raw if isinstance(raw, list) else []
        except (OSError, json.JSONDecodeError):
            gantt = []
    return jsonify({
        "assetProjects": asset_projects,
        "ganttProjects": [
            {
                "id": str(item.get("gantt_project_id") or ""),
                "name": str(item.get("project_name") or ""),
                "zentaoLabel": str(item.get("zentao_label") or ""),
            }
            for item in gantt
            if item.get("gantt_project_id")
        ],
    })


@app.route("/api/projects/<project_id>/apply-links", methods=["POST"])
def project_apply_links(project_id):
    projects = load_json("projects")
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    counts = _apply_project_links(project)
    return jsonify({"ok": True, "counts": counts})


@app.route("/api/projects/<project_id>/overview", methods=["GET"])
def project_overview(project_id):
    projects = load_json("projects")
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        return jsonify({"ok": False, "error": "项目不存在"}), 404

    assets = [
        item for item in load_json("project-assets")
        if _project_asset_matches(item, project)
    ]
    tp_records = [
        item for item in (load_test_point_gen_state().get("records") or [])
        if item.get("projectId") == project_id
    ]
    dv_records = [
        item for item in (load_data_verify_state().get("records") or [])
        if item.get("projectId") == project_id
    ]
    gantt_ids = set(project.get("gantt_project_ids") or [])
    gantt_entries = []
    gantt_path = DATA_DIR / "gantt_project_index.json"
    if gantt_path.exists():
        try:
            with open(gantt_path, encoding="utf-8") as f:
                raw = json.load(f)
            gantt_entries = [
                item for item in (raw if isinstance(raw, list) else [])
                if item.get("gantt_project_id") in gantt_ids
            ]
        except (OSError, json.JSONDecodeError):
            gantt_entries = []

    iteration_refs = load_project_iteration_refs().get(project_id) or []
    if not isinstance(iteration_refs, list):
        iteration_refs = []

    return jsonify({
        "ok": True,
        "project": project,
        "counts": {
            "assets": len(assets),
            "gantt": len(gantt_entries),
            "testPoints": len(tp_records),
            "dataVerify": len(dv_records),
            "iterationRefs": len(iteration_refs),
        },
        "assets": assets[:20],
        "ganttProjects": gantt_entries,
        "testPoints": tp_records[:10],
        "dataVerify": dv_records[:10],
        "iterationRefs": iteration_refs,
    })


ROUND_RESULTS_FILE = DATA_DIR / "project_round_results.json"
ROUND_STATUS_LABELS = {
    "pass": "通过",
    "blocked": "阻塞",
    "fail": "未通过",
    "wip": "进行中",
}


def _load_round_results() -> dict:
    if not ROUND_RESULTS_FILE.exists():
        return {}
    try:
        with open(ROUND_RESULTS_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_round_results(data: dict) -> None:
    ROUND_RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(ROUND_RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@app.route("/api/projects/<project_id>/rounds", methods=["GET"])
def project_rounds_list(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    store = _load_round_results()
    rounds = store.get(project_id) or []
    if not isinstance(rounds, list):
        rounds = []
    # 新到旧
    rounds_sorted = sorted(
        rounds,
        key=lambda r: str(r.get("createdAt") or r.get("updatedAt") or ""),
        reverse=True,
    )
    return jsonify({"ok": True, "rounds": rounds_sorted, "latest": rounds_sorted[0] if rounds_sorted else None})


@app.route("/api/projects/<project_id>/rounds", methods=["POST"])
def project_rounds_create(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    body = request.json or {}
    status = str(body.get("status") or "").strip().lower()
    if status not in ROUND_STATUS_LABELS:
        return jsonify({"ok": False, "error": "status 须为 pass / blocked / fail / wip"}), 400
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    item = {
        "id": "rnd_" + uuid.uuid4().hex[:10],
        "status": status,
        "statusLabel": ROUND_STATUS_LABELS[status],
        "note": str(body.get("note") or "").strip(),
        "blocker": str(body.get("blocker") or "").strip(),
        "createdAt": now,
        "updatedAt": now,
    }
    store = _load_round_results()
    rounds = store.get(project_id) or []
    if not isinstance(rounds, list):
        rounds = []
    rounds.append(item)
    # 保留最近 50 条
    store[project_id] = rounds[-50:]
    _save_round_results(store)
    return jsonify({"ok": True, "item": item}), 201


@app.route("/api/projects/<project_id>/rounds/<round_id>", methods=["DELETE"])
def project_rounds_delete(project_id, round_id):
    store = _load_round_results()
    rounds = store.get(project_id) or []
    if not isinstance(rounds, list):
        rounds = []
    next_rounds = [r for r in rounds if str(r.get("id")) != str(round_id)]
    if len(next_rounds) == len(rounds):
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    store[project_id] = next_rounds
    _save_round_results(store)
    return jsonify({"ok": True})


# ---------- 小版本验证（线上单修 / 热修验证留档） ----------
PATCH_VERIFY_FILE = DATA_DIR / "project_patch_verifications.json"
PATCH_VERIFY_UPLOAD_DIR = DATA_DIR / "patch_verify_uploads"
PATCH_STATUS_LABELS = ROUND_STATUS_LABELS


def _load_patch_verifications() -> dict:
    if not PATCH_VERIFY_FILE.exists():
        return {}
    try:
        with open(PATCH_VERIFY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_patch_verifications(data: dict) -> None:
    PATCH_VERIFY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PATCH_VERIFY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _patch_title_from(title: str, content: str, bugs_fixed: str) -> str:
    t = (title or "").strip()
    if t:
        return t[:80]
    for line in (content or "").splitlines():
        line = line.strip()
        if line:
            # 去掉常见前缀标签，让列表标题更干净
            line = re.sub(r"^\[(?:BUG|FIX|热修|验证)\]\s*", "", line, flags=re.I)
            return line[:60]
    for part in re.split(r"[\n,，;；]", bugs_fixed or ""):
        part = part.strip()
        if part:
            return part[:60]
    return "小版本验证"


def _save_optional_patch_package(project_id: str, file_storage):
    """可选包体上传；无文件返回 (None, None)。"""
    if not file_storage or not getattr(file_storage, "filename", None):
        return None, None
    name = file_storage.filename
    ext = Path(name).suffix.lower()
    if ext and ext not in ALLOWED_UPLOAD_EXT:
        raise ValueError(f"不支持的文件类型: {ext}")
    dest_dir = PATCH_VERIFY_UPLOAD_DIR / safe_segment(project_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = safe_filename(name)
    dest = dest_dir / f"{uuid.uuid4().hex[:8]}_{filename}"
    file_storage.save(dest)
    try:
        rel = str(dest.relative_to(ROOT))
    except ValueError:
        rel = str(dest)
    return name, rel


@app.route("/api/projects/<project_id>/patch-verifications", methods=["GET"])
def project_patch_verifications_list(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    store = _load_patch_verifications()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    items_sorted = sorted(
        items,
        key=lambda r: str(r.get("createdAt") or r.get("updatedAt") or ""),
        reverse=True,
    )
    return jsonify({
        "ok": True,
        "items": items_sorted,
        "latest": items_sorted[0] if items_sorted else None,
    })


@app.route("/api/projects/<project_id>/patch-verifications", methods=["POST"])
def project_patch_verifications_create(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404

    # 支持 JSON 或 multipart（带可选包体）
    if request.content_type and "multipart/form-data" in request.content_type:
        title = str(request.form.get("title") or "").strip()
        bugs_fixed = str(request.form.get("bugsFixed") or request.form.get("bugs_fixed") or "").strip()
        content = str(request.form.get("content") or "").strip()
        remark = str(request.form.get("remark") or "").strip()
        status = str(request.form.get("status") or "wip").strip().lower()
        package_file = request.files.get("package") or request.files.get("file")
    else:
        body = request.json or {}
        title = str(body.get("title") or "").strip()
        bugs_fixed = str(body.get("bugsFixed") or body.get("bugs_fixed") or "").strip()
        content = str(body.get("content") or "").strip()
        remark = str(body.get("remark") or "").strip()
        status = str(body.get("status") or "wip").strip().lower()
        package_file = None

    if status not in PATCH_STATUS_LABELS:
        return jsonify({"ok": False, "error": "status 须为 pass / blocked / fail / wip"}), 400
    if not content and not bugs_fixed and not title:
        return jsonify({"ok": False, "error": "请填写验证内容、已修复 bug 或标题"}), 400

    package_name = None
    package_path = None
    try:
        package_name, package_path = _save_optional_patch_package(project_id, package_file)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except OSError as exc:
        return jsonify({"ok": False, "error": f"包体保存失败: {exc}"}), 500

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    item = {
        "id": "pv_" + uuid.uuid4().hex[:10],
        "title": _patch_title_from(title, content, bugs_fixed),
        "bugsFixed": bugs_fixed,
        "content": content,
        "remark": remark,
        "status": status,
        "statusLabel": PATCH_STATUS_LABELS[status],
        "packageName": package_name or "",
        "packagePath": package_path or "",
        "createdAt": now,
        "updatedAt": now,
    }
    store = _load_patch_verifications()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    items.append(item)
    store[project_id] = items[-50:]
    _save_patch_verifications(store)
    return jsonify({"ok": True, "item": item}), 201


@app.route("/api/projects/<project_id>/patch-verifications/<item_id>", methods=["GET"])
def project_patch_verifications_get(project_id, item_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    store = _load_patch_verifications()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    item = next((r for r in items if str(r.get("id")) == str(item_id)), None)
    if not item:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    return jsonify({"ok": True, "item": item})


@app.route("/api/projects/<project_id>/patch-verifications/<item_id>", methods=["PUT", "PATCH"])
def project_patch_verifications_update(project_id, item_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    store = _load_patch_verifications()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    idx = next((i for i, r in enumerate(items) if str(r.get("id")) == str(item_id)), None)
    if idx is None:
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    cur = dict(items[idx])

    if request.content_type and "multipart/form-data" in request.content_type:
        title = str(request.form.get("title") if "title" in request.form else cur.get("title") or "").strip()
        if "bugsFixed" in request.form or "bugs_fixed" in request.form:
            bugs_fixed = str(request.form.get("bugsFixed") or request.form.get("bugs_fixed") or "").strip()
        else:
            bugs_fixed = str(cur.get("bugsFixed") or "").strip()
        content = str(request.form.get("content") if "content" in request.form else cur.get("content") or "").strip()
        remark = str(request.form.get("remark") if "remark" in request.form else cur.get("remark") or "").strip()
        status = str(request.form.get("status") if "status" in request.form else cur.get("status") or "wip").strip().lower()
        package_file = request.files.get("package") or request.files.get("file")
    else:
        body = request.json or {}
        title = str(body["title"] if "title" in body else cur.get("title") or "").strip()
        if "bugsFixed" in body:
            bugs_fixed = str(body.get("bugsFixed") or "").strip()
        elif "bugs_fixed" in body:
            bugs_fixed = str(body.get("bugs_fixed") or "").strip()
        else:
            bugs_fixed = str(cur.get("bugsFixed") or "").strip()
        content = str(body["content"] if "content" in body else cur.get("content") or "").strip()
        remark = str(body["remark"] if "remark" in body else cur.get("remark") or "").strip()
        status = str(body["status"] if "status" in body else cur.get("status") or "wip").strip().lower()
        package_file = None

    if status not in PATCH_STATUS_LABELS:
        return jsonify({"ok": False, "error": "status 须为 pass / blocked / fail / wip"}), 400
    if not content and not bugs_fixed and not title:
        return jsonify({"ok": False, "error": "请填写验证内容、已修复 bug 或标题"}), 400

    package_name = cur.get("packageName") or ""
    package_path = cur.get("packagePath") or ""
    if package_file and getattr(package_file, "filename", None):
        try:
            new_name, new_path = _save_optional_patch_package(project_id, package_file)
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except OSError as exc:
            return jsonify({"ok": False, "error": f"包体保存失败: {exc}"}), 500
        # 换包后尽量删旧文件
        old_pkg = package_path
        package_name = new_name or ""
        package_path = new_path or ""
        if old_pkg and old_pkg != package_path:
            try:
                uploads_root = PATCH_VERIFY_UPLOAD_DIR.resolve()
                target = Path(old_pkg)
                if not target.is_absolute():
                    target = (ROOT / old_pkg).resolve()
                else:
                    target = target.resolve()
                if str(target).startswith(str(uploads_root)) and target.is_file():
                    target.unlink()
            except OSError:
                pass

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.update({
        "title": _patch_title_from(title, content, bugs_fixed),
        "bugsFixed": bugs_fixed,
        "content": content,
        "remark": remark,
        "status": status,
        "statusLabel": PATCH_STATUS_LABELS[status],
        "packageName": package_name,
        "packagePath": package_path,
        "updatedAt": now,
    })
    items[idx] = cur
    store[project_id] = items
    _save_patch_verifications(store)
    return jsonify({"ok": True, "item": cur})


@app.route("/api/projects/<project_id>/patch-verifications/<item_id>", methods=["DELETE"])
def project_patch_verifications_delete(project_id, item_id):
    store = _load_patch_verifications()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    next_items = [r for r in items if str(r.get("id")) != str(item_id)]
    if len(next_items) == len(items):
        return jsonify({"ok": False, "error": "记录不存在"}), 404
    # 尽量清理可选包体文件（仅限 patch_verify_uploads，失败忽略）
    removed = next((r for r in items if str(r.get("id")) == str(item_id)), None)
    pkg = (removed or {}).get("packagePath") or ""
    if pkg:
        try:
            uploads_root = PATCH_VERIFY_UPLOAD_DIR.resolve()
            target = Path(pkg)
            if not target.is_absolute():
                target = (ROOT / pkg).resolve()
            else:
                target = target.resolve()
            if str(target).startswith(str(uploads_root)) and target.is_file():
                target.unlink()
        except OSError:
            pass
    store[project_id] = next_items
    _save_patch_verifications(store)
    return jsonify({"ok": True})


def _resolve_patch_package_file(project_id: str, item_id: str) -> tuple:
    """返回 (Path, download_name)；失败抛 FileNotFoundError / PermissionError / ValueError。"""
    store = _load_patch_verifications()
    items = store.get(project_id) or []
    if not isinstance(items, list):
        items = []
    item = next((r for r in items if str(r.get("id")) == str(item_id)), None)
    if not item:
        raise FileNotFoundError("记录不存在")
    pkg = (item.get("packagePath") or "").strip()
    if not pkg:
        raise FileNotFoundError("该记录没有包体")
    uploads_root = PATCH_VERIFY_UPLOAD_DIR.resolve()
    target = Path(pkg)
    if not target.is_absolute():
        target = (ROOT / pkg).resolve()
    else:
        target = target.resolve()
    try:
        allowed = target.is_relative_to(uploads_root)
    except AttributeError:
        allowed = str(target).startswith(str(uploads_root))
    if not allowed:
        raise PermissionError("无权访问该包体")
    if not target.is_file():
        raise FileNotFoundError("包体文件不存在或已被删除")
    name = (item.get("packageName") or target.name or "package.bin").strip() or target.name
    return target, name


@app.route("/api/projects/<project_id>/patch-verifications/<item_id>/package", methods=["GET"])
def project_patch_verifications_download_package(project_id, item_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    try:
        target, name = _resolve_patch_package_file(project_id, item_id)
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 403
    mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return send_file(
        target,
        mimetype=mime,
        as_attachment=True,
        download_name=name,
    )


PATCH_REMARK_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


def _patch_remark_dir(project_id: str) -> Path:
    return PATCH_VERIFY_UPLOAD_DIR / safe_segment(project_id) / "remarks"


@app.route("/api/projects/<project_id>/patch-remark-images", methods=["POST"])
def project_patch_remark_image_upload(project_id):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    file = request.files.get("file") or request.files.get("image")
    if not file or not file.filename:
        return jsonify({"ok": False, "error": "请粘贴或选择图片"}), 400
    ext = Path(file.filename).suffix.lower()
    # 剪贴板常给 image/png 且文件名无扩展名
    if not ext:
        mime = (file.mimetype or "").lower()
        ext = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/bmp": ".bmp",
        }.get(mime, ".png")
    if ext not in PATCH_REMARK_IMAGE_EXT:
        return jsonify({"ok": False, "error": f"不支持的图片类型: {ext}"}), 400
    dest_dir = _patch_remark_dir(project_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}{ext}"
    dest = dest_dir / fname
    try:
        file.save(dest)
    except OSError as exc:
        return jsonify({"ok": False, "error": f"保存失败: {exc}"}), 500
    url = f"/api/projects/{project_id}/patch-remark-images/{fname}"
    try:
        rel = str(dest.relative_to(ROOT))
    except ValueError:
        rel = str(dest)
    return jsonify({"ok": True, "url": url, "name": fname, "path": rel}), 201


@app.route("/api/projects/<project_id>/patch-remark-images/<filename>", methods=["GET"])
def project_patch_remark_image_get(project_id, filename):
    projects = load_json("projects")
    if not any(p.get("id") == project_id for p in projects):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        return jsonify({"ok": False, "error": "非法文件名"}), 400
    ext = Path(safe_name).suffix.lower()
    if ext not in PATCH_REMARK_IMAGE_EXT:
        return jsonify({"ok": False, "error": "不支持的文件类型"}), 400
    target = (_patch_remark_dir(project_id) / safe_name).resolve()
    try:
        allowed = target.is_relative_to(_patch_remark_dir(project_id).resolve())
    except AttributeError:
        allowed = str(target).startswith(str(_patch_remark_dir(project_id).resolve()))
    if not allowed or not target.is_file():
        return jsonify({"ok": False, "error": "图片不存在"}), 404
    mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return send_file(target, mimetype=mime, as_attachment=False, download_name=safe_name)


@app.route("/api/project-docs/content", methods=["GET"])
def project_doc_content():
    raw = request.args.get("path", "").strip()
    if not raw:
        return jsonify({"ok": False, "error": "缺少 path"}), 400
    try:
        target = assert_workbench_doc_access(raw)
        content = target.read_text(encoding="utf-8")
        mtime = datetime.fromtimestamp(target.stat().st_mtime)
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 403
    except OSError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({
        "ok": True,
        "title": target.stem,
        "path": str(target.relative_to(ROOT)),
        "markdown": content,
        "updatedAt": mtime.strftime("%Y-%m-%d %H:%M"),
    })


PROJECT_UPLOADS_DIR = DATA_DIR / "project_uploads"
ALLOWED_UPLOAD_EXT = {
    ".exe", ".apk", ".ipa", ".aab", ".app", ".dmg", ".txt", ".md", ".log",
    ".zip", ".rar", ".7z", ".json", ".csv", ".mobileprovision", ".plist",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".xmind",
}
XMIND_EXT = {".xmind"}
EDITABLE_TEXT_EXT = {".txt", ".md", ".log", ".json", ".csv", ".env", ".ini", ".yaml", ".yml", ".plist"}
IMAGE_PREVIEW_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


def safe_segment(name: str) -> str:
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", (name or "").strip())
    return s[:80] or "未命名"


def safe_filename(name: str) -> str:
    stem = Path(name).stem
    ext = Path(name).suffix.lower()
    safe_stem = safe_segment(stem)
    return f"{safe_stem}{ext}" if ext else safe_stem


def assert_registered_file_access(raw: str, allowed_ext=None) -> Path:
    target = resolve_path(raw).resolve()
    if not target.is_file():
        raise FileNotFoundError(f"文件不存在: {target}")
    if allowed_ext and target.suffix.lower() not in allowed_ext:
        raise PermissionError("该文件类型不支持此操作")
    uploads_root = PROJECT_UPLOADS_DIR.resolve()
    try:
        if target.is_relative_to(uploads_root):
            return target
    except AttributeError:
        if str(target).startswith(str(uploads_root)):
            return target
    for item in load_json("project-assets"):
        item_path = item.get("path", "")
        if item_path and resolve_path(item_path).resolve() == target:
            return target
    raise PermissionError("无权访问该路径")


def assert_text_file_access(raw: str) -> Path:
    return assert_registered_file_access(raw, EDITABLE_TEXT_EXT)


def load_project_iteration_refs() -> dict:
    try:
        data = load_json("project-iteration-refs")
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def assert_workbench_doc_access(raw: str) -> Path:
    target = resolve_path(raw).resolve()
    if not target.is_file():
        raise FileNotFoundError(f"文件不存在: {target}")
    if target.suffix.lower() != ".md":
        raise PermissionError("仅支持 Markdown 文档")
    docs_root = WORKBENCH_DOCS_DIR.resolve()
    try:
        allowed = target.is_relative_to(docs_root)
    except AttributeError:
        allowed = str(target).startswith(str(docs_root))
    if not allowed:
        raise PermissionError("文档路径不在 workbench/docs 目录内")
    return target


@app.route("/api/project-assets/upload", methods=["POST"])
def upload_project_asset():
    file = request.files.get("file")
    project = (request.form.get("project") or "").strip()
    group = (request.form.get("group") or "").strip()
    dim = (request.form.get("dim") or "env").strip()
    note = (request.form.get("note") or "").strip()

    if not file or not file.filename:
        return jsonify({"error": "请选择文件"}), 400
    if not project or not group:
        return jsonify({"error": "缺少项目或分组"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        return jsonify({"error": f"不支持的文件类型: {ext}"}), 400

    dest_dir = PROJECT_UPLOADS_DIR / safe_segment(project) / safe_segment(group)
    dest_dir.mkdir(parents=True, exist_ok=True)

    filename = safe_filename(file.filename)
    dest = dest_dir / filename
    if dest.exists():
        dest = dest_dir / f"{Path(filename).stem}_{uuid.uuid4().hex[:6]}{ext}"

    file.save(dest)
    rel_path = str(dest.relative_to(ROOT))

    item = {
        "id": str(uuid.uuid4())[:8],
        "name": file.filename,
        "project": project,
        "env_group": group if dim != "iter" else "",
        "iter_group": group if dim == "iter" else "",
        "kind": "file",
        "path": rel_path,
        "url": "",
        "note": note or f"上传于 {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "tags": ["上传"],
    }

    items = load_json("project-assets")
    items.append(item)
    save_json("project-assets", items)
    return jsonify(item), 201


@app.route("/api/project-assets/text-file", methods=["GET"])
def read_project_text_file():
    raw = request.args.get("path", "")
    if not raw:
        return jsonify({"error": "缺少 path"}), 400
    try:
        target = assert_text_file_access(raw)
        content = target.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except OSError as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"path": str(target.relative_to(ROOT)), "content": content})


@app.route("/api/project-assets/text-file", methods=["PUT"])
def save_project_text_file():
    data = request.json or {}
    raw = data.get("path", "")
    content = data.get("content")
    if not raw:
        return jsonify({"error": "缺少 path"}), 400
    if content is None:
        return jsonify({"error": "缺少 content"}), 400
    try:
        target = assert_text_file_access(raw)
        target.write_text(content, encoding="utf-8", newline="\n")
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except OSError as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True, "path": str(target.relative_to(ROOT))})


@app.route("/api/project-assets/preview-file", methods=["GET"])
def preview_project_file():
    raw = request.args.get("path", "")
    if not raw:
        return jsonify({"error": "缺少 path"}), 400
    try:
        target = assert_registered_file_access(raw, IMAGE_PREVIEW_EXT)
        mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        return send_file(target, mimetype=mime)
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except OSError as exc:
        return jsonify({"error": str(exc)}), 500


    except OSError as exc:
        return jsonify({"error": str(exc)}), 500


def _save_xmind_session(session: dict) -> dict:
    sessions = load_json("xmind-sessions")
    sessions.append(session)
    save_json("xmind-sessions", sessions)
    return session


def _link_asset_xmind_session(asset_id: str, session_id: str) -> None:
    if not asset_id:
        return
    items = load_json("project-assets")
    for i, item in enumerate(items):
        if item.get("id") == asset_id:
            items[i]["xmind_session_id"] = session_id
            save_json("project-assets", items)
            return


def _paginate_titles(titles: list, page: int, page_size: int) -> dict:
    total = len(titles)
    page = max(1, page)
    page_size = max(1, min(500, page_size))
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "titles": titles[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
        "page_count": max(1, (total + page_size - 1) // page_size) if total else 1,
    }


@app.route("/api/project-assets/xmind/parse", methods=["POST"])
def parse_xmind_api():
    json_body = request.get_json(silent=True) or {}
    project = (request.form.get("project") or json_body.get("project") or "").strip()
    group = (request.form.get("group") or json_body.get("group") or "").strip()
    dim = (request.form.get("dim") or json_body.get("dim") or "env").strip()
    asset_id = (request.form.get("asset_id") or json_body.get("asset_id") or "").strip()
    raw_path = (request.form.get("path") or json_body.get("path") or "").strip()

    target = None
    file_name = ""

    upload = request.files.get("file")
    if upload and upload.filename:
        ext = Path(upload.filename).suffix.lower()
        if ext not in XMIND_EXT:
            return jsonify({"error": "请上传 .xmind 文件"}), 400
        if project and group:
            dest_dir = PROJECT_UPLOADS_DIR / safe_segment(project) / safe_segment(group)
            dest_dir.mkdir(parents=True, exist_ok=True)
            filename = safe_filename(upload.filename)
            target = dest_dir / filename
            if target.exists():
                target = dest_dir / f"{Path(filename).stem}_{uuid.uuid4().hex[:6]}{ext}"
            upload.save(target)
            rel_path = str(target.relative_to(ROOT))
            if not asset_id:
                item = {
                    "id": str(uuid.uuid4())[:8],
                    "name": upload.filename,
                    "project": project,
                    "env_group": group if dim != "iter" else "",
                    "iter_group": group if dim == "iter" else "",
                    "kind": "file",
                    "path": rel_path,
                    "url": "",
                    "note": f"XMind 测试点 · 上传于 {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                    "tags": ["xmind", "测试点"],
                }
                items = load_json("project-assets")
                items.append(item)
                save_json("project-assets", items)
                asset_id = item["id"]
        else:
            tmp_dir = DATA_DIR / "xmind_tmp"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            target = tmp_dir / f"{uuid.uuid4().hex[:8]}{ext}"
            upload.save(target)
        file_name = upload.filename
    elif raw_path:
        try:
            target = assert_registered_file_access(raw_path, XMIND_EXT)
            file_name = target.name
            if not asset_id:
                for item in load_json("project-assets"):
                    if item.get("path") and resolve_path(item["path"]).resolve() == target:
                        asset_id = item.get("id", "")
                        if not project:
                            project = item.get("project", "")
                        break
        except (FileNotFoundError, PermissionError) as exc:
            return jsonify({"error": str(exc)}), 400
    else:
        return jsonify({"error": "请上传 xmind 文件或指定 path"}), 400

    try:
        parsed = parse_xmind_titles(str(target))
    except Exception as exc:
        return jsonify({"error": f"解析失败: {exc}"}), 500

    session_id = str(uuid.uuid4())[:8]
    try:
        rel = str(target.resolve().relative_to(ROOT.resolve()))
    except ValueError:
        rel = str(target)
    session = {
        "id": session_id,
        "asset_id": asset_id,
        "project": project or "未分类",
        "env_group": group if dim != "iter" else "",
        "iter_group": group if dim == "iter" else "",
        "dim": dim,
        "file_path": rel,
        "file_name": file_name or target.name,
        "sheet": parsed["sheet"],
        "titles": parsed["titles"],
        "total": parsed["total"],
        "parsed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    _save_xmind_session(session)
    _link_asset_xmind_session(asset_id, session_id)

    page_data = _paginate_titles(parsed["titles"], 1, 100)
    return jsonify({
        "id": session_id,
        "asset_id": asset_id,
        "project": session["project"],
        "env_group": session["env_group"],
        "iter_group": session["iter_group"],
        "file_name": session["file_name"],
        "sheet": session["sheet"],
        "total": session["total"],
        "parsed_at": session["parsed_at"],
        **page_data,
    })


@app.route("/api/project-assets/xmind/sessions/<session_id>", methods=["GET"])
def get_xmind_session(session_id):
    sessions = load_json("xmind-sessions")
    session = next((s for s in sessions if s.get("id") == session_id), None)
    if not session:
        return jsonify({"error": "会话不存在"}), 404
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 100))
    page_data = _paginate_titles(session.get("titles") or [], page, page_size)
    return jsonify({
        "id": session["id"],
        "asset_id": session.get("asset_id", ""),
        "project": session.get("project", ""),
        "env_group": session.get("env_group", ""),
        "iter_group": session.get("iter_group", ""),
        "file_name": session.get("file_name", ""),
        "sheet": session.get("sheet", ""),
        "total": session.get("total", 0),
        "parsed_at": session.get("parsed_at", ""),
        **page_data,
    })


@app.route("/api/open-path", methods=["POST"])
def open_path():
    data = request.json or {}
    raw = data.get("path", "")
    target = resolve_path(raw)
    if not target.exists():
        return jsonify({"error": f"路径不存在: {target}"}), 404
    try:
        open_path_target(target)
    except OSError as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True, "path": str(target.resolve())})


@app.route("/api/adb/status")
def api_adb_status():
    return jsonify(adb_service.adb_status())


@app.route("/api/adb/config", methods=["GET"])
def api_adb_config_get():
    return jsonify({"ok": True, "config": adb_service.load_config()})


@app.route("/api/adb/config", methods=["PUT"])
def api_adb_config_put():
    data = request.json or {}
    cfg = adb_service.save_config(data)
    return jsonify({"ok": True, "config": cfg})


@app.route("/api/adb/proxy", methods=["GET"])
def api_adb_proxy_get():
    serial = (request.args.get("serial") or "").strip() or None
    status = adb_service.adb_status()
    if not status.get("available"):
        return jsonify({"ok": False, "error": status.get("error") or "adb 不可用"}), 400
    result = adb_service.get_proxy(serial=serial)
    cfg = adb_service.load_config()
    result["config"] = {"host": cfg["proxy_host"], "port": cfg["proxy_port"]}
    return jsonify(result)


@app.route("/api/adb/proxy", methods=["POST"])
def api_adb_proxy_set():
    data = request.json or {}
    serial = (data.get("serial") or "").strip() or None
    action = (data.get("action") or "set").strip().lower()
    status = adb_service.adb_status()
    if not status.get("available"):
        return jsonify({"ok": False, "error": status.get("error") or "adb 不可用"}), 400
    if action == "clear":
        result = adb_service.clear_proxy(serial=serial)
    else:
        host = data.get("host")
        port = data.get("port")
        updates = {}
        if host is not None:
            updates["proxy_host"] = host
        if port is not None:
            updates["proxy_port"] = port
        if updates:
            adb_service.save_config(updates)
        cfg = adb_service.load_config()
        result = adb_service.set_proxy(
            str(host if host is not None else cfg["proxy_host"]),
            port if port is not None else cfg["proxy_port"],
            serial=serial,
        )
    status_code = 200 if result.get("ok") else 400
    return jsonify(result), status_code


@app.route("/api/adb/devices")
def api_adb_devices():
    return jsonify(adb_service.list_devices())


@app.route("/api/adb/wireless-connect", methods=["POST"])
def api_adb_wireless_connect():
    data = request.json or {}
    port = data.get("port")
    disconnect_first = data.get("disconnect_first")
    serial = (data.get("serial") or "").strip() or None
    all_usb = bool(data.get("all_usb"))
    result = adb_service.wireless_connect(
        port=int(port) if port is not None else None,
        disconnect_first=disconnect_first if disconnect_first is not None else None,
        serial=serial,
        all_usb=all_usb,
    )
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/adb/disconnect", methods=["POST"])
def api_adb_disconnect():
    data = request.json or {}
    result = adb_service.disconnect(data.get("target") or None)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/adb/reconnect-remembered", methods=["POST"])
def api_adb_reconnect_remembered():
    """装包页切回时：按配置记忆的 IP:端口自动 adb connect。"""
    status = adb_service.adb_status()
    if not status.get("available"):
        return jsonify({"ok": False, "attempted": False, "error": status.get("error") or "adb 不可用"}), 400
    result = adb_service.reconnect_remembered()
    return jsonify(result)


@app.route("/api/maker-lab/catalog")
def api_maker_lab_catalog():
    return jsonify(maker_lab.catalog())


@app.route("/api/maker-lab/content")
def api_maker_lab_content():
    raw = (request.args.get("path") or "").strip()
    if not raw:
        return jsonify({"ok": False, "error": "缺少 path"}), 400
    try:
        return jsonify(maker_lab.read_text_doc(raw))
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 403
    except OSError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/test-info/catalog")
def api_test_info_catalog():
    return jsonify(test_info.catalog())


@app.route("/api/test-info/scan", methods=["POST"])
def api_test_info_scan():
    try:
        return jsonify(test_info.scan_local())
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/test-info/rebuild-course", methods=["POST"])
def api_test_info_rebuild_course():
    """按配置 course_root 重建 2022 软测课程索引。"""
    try:
        return jsonify(test_info.rebuild_course_index())
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/test-info/rebuild-backend", methods=["POST"])
def api_test_info_rebuild_backend():
    """按配置 backend_root 重建后端知识索引。"""
    try:
        return jsonify(test_info.rebuild_backend_index())
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/test-info/rebuild-frontend", methods=["POST"])
def api_test_info_rebuild_frontend():
    """按配置 frontend_root 重建前端知识索引。"""
    try:
        return jsonify(test_info.rebuild_frontend_index())
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/test-info/content")
def api_test_info_content():
    raw = (request.args.get("path") or "").strip()
    if not raw:
        return jsonify({"ok": False, "error": "缺少 path"}), 400
    try:
        return jsonify(test_info.read_text_doc(raw))
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 403
    except OSError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/test-info/file")
def api_test_info_file():
    """浏览器直接打开 PDF 等二进制资料。"""
    raw = (request.args.get("path") or "").strip()
    if not raw:
        return jsonify({"ok": False, "error": "缺少 path"}), 400
    try:
        target = test_info.assert_readable(raw)
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 403
    mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return send_file(target, mimetype=mime, as_attachment=False, download_name=target.name)


@app.route("/api/adb/latest-apk")
def api_adb_latest_apk():
    share = request.args.get("dir")
    return jsonify(adb_service.find_latest_apk(share))


@app.route("/api/adb/install", methods=["POST"])
def api_adb_install():
    """启动安装任务。JSON: source=latest|path + path/serial；或 multipart: file + serial。"""
    serial = None
    if request.content_type and "multipart/form-data" in request.content_type:
        serial = (request.form.get("serial") or "").strip() or None
        f = request.files.get("file")
        if not f or not f.filename:
            return jsonify({"ok": False, "error": "未选择 APK 文件"}), 400
        name = Path(f.filename).name
        if not name.lower().endswith(".apk"):
            return jsonify({"ok": False, "error": "仅支持 .apk 文件"}), 400
        ADB_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        dest = ADB_UPLOAD_DIR / f"{uuid.uuid4().hex[:8]}_{name}"
        f.save(dest)
        result = adb_service.start_install_job(source="upload", serial=serial, apk_path=str(dest))
    else:
        data = request.json or {}
        source = (data.get("source") or "latest").strip()
        serial = (data.get("serial") or "").strip() or None
        share_dir = data.get("share_dir")
        apk_path = data.get("path")
        result = adb_service.start_install_job(
            source=source,
            serial=serial,
            apk_path=apk_path,
            share_dir=share_dir,
        )
    if not result.get("ok"):
        return jsonify(result), 400
    return jsonify(result)


@app.route("/api/adb/install/<job_id>")
def api_adb_install_job(job_id):
    job = adb_service.get_install_job(job_id)
    if not job:
        return jsonify({"ok": False, "error": "任务不存在"}), 404
    return jsonify({"ok": True, "job": job})


@app.route("/api/adb/scrcpy/start", methods=["POST"])
def api_adb_scrcpy_start():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    result = adb_service.start_scrcpy(serial)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/adb/scrcpy/stop", methods=["POST"])
def api_adb_scrcpy_stop():
    data = request.json or {}
    serial = (data.get("serial") or "").strip() or None
    return jsonify(adb_service.stop_scrcpy(serial))


@app.route("/api/adb/scrcpy/status")
def api_adb_scrcpy_status():
    serial = (request.args.get("serial") or "").strip() or None
    return jsonify(adb_service.scrcpy_status(serial))


@app.route("/api/adb/mirror/start", methods=["POST"])
def api_adb_mirror_start():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    result = mirror_service.start_mirror(serial)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/adb/mirror/stop", methods=["POST"])
def api_adb_mirror_stop():
    data = request.json or {}
    serial = (data.get("serial") or "").strip() or None
    return jsonify(mirror_service.stop_mirror(serial))


@app.route("/api/adb/mirror/status")
def api_adb_mirror_status():
    serial = (request.args.get("serial") or "").strip() or None
    return jsonify(mirror_service.mirror_status(serial))


@app.route("/api/adb/mirror/stream")
def api_adb_mirror_stream():
    serial = (request.args.get("serial") or "").strip()
    if not serial:
        return jsonify({"ok": False, "error": "缺少 serial"}), 400
    st = mirror_service.mirror_status(serial)
    if not st.get("running"):
        mirror_service.start_mirror(serial)
    return Response(
        mirror_service.iter_mjpeg_frames(serial),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.route("/api/adb/mirror/tap", methods=["POST"])
def api_adb_mirror_tap():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    try:
        x = int(data.get("x", 0))
        y = int(data.get("y", 0))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "坐标无效"}), 400
    result = mirror_service.inject_tap(serial, x, y)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/adb/mirror/swipe", methods=["POST"])
def api_adb_mirror_swipe():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    try:
        x1, y1 = int(data.get("x1", 0)), int(data.get("y1", 0))
        x2, y2 = int(data.get("x2", 0)), int(data.get("y2", 0))
        duration = int(data.get("duration_ms", 280))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "坐标无效"}), 400
    result = mirror_service.inject_swipe(serial, x1, y1, x2, y2, duration)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/adb/mirror/key", methods=["POST"])
def api_adb_mirror_key():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    key = (data.get("key") or "").strip()
    result = mirror_service.inject_key(serial, key)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/adb/exchange/open-url", methods=["POST"])
def api_adb_exchange_open_url():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    url = (data.get("url") or "").strip()
    result = adb_service.open_url_on_device(serial, url)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/exchange/share-text", methods=["POST"])
def api_adb_exchange_share_text():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    text = data.get("text") or ""
    result = adb_service.share_text_on_device(serial, text)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/exchange/clipboard", methods=["POST"])
def api_adb_exchange_clipboard():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    result = adb_service.get_clipboard_from_device(serial)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/exchange/screencap", methods=["POST"])
def api_adb_exchange_screencap():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    result = adb_service.screencap_to_pc(serial)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/exchange/recent-media")
def api_adb_exchange_recent_media():
    serial = (request.args.get("serial") or "").strip()
    try:
        limit = int(request.args.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    result = adb_service.list_recent_media(serial, limit=limit)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/exchange/pull", methods=["POST"])
def api_adb_exchange_pull():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    paths = data.get("paths") or []
    if not isinstance(paths, list):
        return jsonify({"ok": False, "error": "paths 须为数组"}), 400
    result = adb_service.pull_files(serial, paths)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/exchange/push", methods=["POST"])
def api_adb_exchange_push():
    serial = (request.form.get("serial") or "").strip()
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "未选择文件"}), 400
    name = Path(f.filename).name
    if not name or ".." in name:
        return jsonify({"ok": False, "error": "文件名无效"}), 400
    ADB_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = ADB_UPLOAD_DIR / f"push_{uuid.uuid4().hex[:8]}_{name}"
    f.save(dest)
    result = adb_service.push_file_to_device(serial, dest)
    try:
        dest.unlink(missing_ok=True)
    except OSError:
        pass
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/exchange/file")
def api_adb_exchange_file():
    rel = (request.args.get("path") or "").strip()
    target = adb_service.resolve_exchange_file(rel)
    if not target:
        return jsonify({"ok": False, "error": "文件不存在或路径非法"}), 404
    mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    as_attachment = (request.args.get("download") or "").strip() in ("1", "true", "yes")
    return send_file(
        target,
        mimetype=mime,
        as_attachment=as_attachment,
        download_name=target.name,
    )


@app.route("/api/adb/logcat/clear", methods=["POST"])
def api_adb_logcat_clear():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    result = adb_service.clear_logcat(serial)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/logcat/dump", methods=["POST"])
def api_adb_logcat_dump():
    data = request.json or {}
    serial = (data.get("serial") or "").strip()
    result = adb_service.dump_logcat(serial)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/adb/logcat/analyze", methods=["POST"])
def api_adb_logcat_analyze():
    """复用测试点生成（agile-sim）同源 OpenAI 兼容 Key，分析 logcat 崩溃原因。"""
    data = request.json or {}
    base_url = str(data.get("baseUrl") or "").strip().rstrip("/") or "https://api.openai.com/v1"
    api_key = str(data.get("apiKey") or "").strip()
    model = str(data.get("model") or "").strip() or "gpt-4o-mini"
    if not api_key:
        return jsonify({
            "ok": False,
            "error": "未找到 API Key。请先在「测试点生成」页配置 OpenAI 兼容 Key（与那边共用，无需在此重复设置）。",
        }), 400

    excerpt = str(data.get("excerpt") or data.get("text") or "").strip()
    rel = str(data.get("rel") or "").strip()
    if not excerpt and rel:
        target = adb_service.resolve_exchange_file(rel)
        if not target:
            return jsonify({"ok": False, "error": "日志文件不存在"}), 404
        raw = target.read_text(encoding="utf-8", errors="replace")
        excerpt = adb_service.extract_crash_excerpt(raw)
    if not excerpt:
        return jsonify({"ok": False, "error": "无日志内容可分析"}), 400

    system = (
        "你是资深 Android 测试/研发工程师，擅长从 logcat 定位 App 崩溃与 ANR 原因。"
        "请用简体中文输出，结构清晰、可直接贴到缺陷单。"
        "若日志不足以判断，请明确说明缺什么信息。"
    )
    user = (
        "请分析下面 logcat 片段中的崩溃/ANR 原因，按以下结构回答：\n"
        "1. 结论（一句话）\n"
        "2. 崩溃类型（Java 异常 / Native / ANR / 其他）\n"
        "3. 关键异常与堆栈（摘录最关键几行）\n"
        "4. 可能原因与排查建议\n"
        "5. 建议给开发的复现/修复方向\n\n"
        f"----- logcat excerpt -----\n{excerpt}\n----- end -----"
    )
    url = f"{base_url}/chat/completions"
    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "stream": False,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8", errors="replace"))
    except URLError as exc:
        return jsonify({"ok": False, "error": f"调用大模型失败: {exc}"}), 502
    except Exception as exc:
        return jsonify({"ok": False, "error": f"调用大模型失败: {exc}"}), 502

    content = (
        (((body.get("choices") or [{}])[0]).get("message") or {}).get("content")
        if isinstance(body, dict)
        else ""
    )
    if not content:
        err = body.get("error") if isinstance(body, dict) else None
        msg = err.get("message") if isinstance(err, dict) else str(body)[:400]
        return jsonify({"ok": False, "error": msg or "模型未返回内容"}), 502
    return jsonify({"ok": True, "analysis": content, "model": model})


@app.route("/api/ios/status")
def api_ios_status():
    return jsonify(ios_service.ios_status())


@app.route("/api/ios/config", methods=["GET"])
def api_ios_config_get():
    return jsonify({"ok": True, "config": ios_service.load_config()})


@app.route("/api/ios/config", methods=["PUT"])
def api_ios_config_put():
    data = request.json or {}
    cfg = ios_service.save_config(data)
    return jsonify({"ok": True, "config": cfg})


@app.route("/api/ios/devices")
def api_ios_devices():
    return jsonify(ios_service.list_devices())


@app.route("/api/ios/latest-ipa")
def api_ios_latest_ipa():
    share = request.args.get("dir")
    return jsonify(ios_service.find_latest_ipa(share))


@app.route("/api/ios/inspect-ipa")
def api_ios_inspect_ipa():
    path = (request.args.get("path") or "").strip()
    if not path:
        return jsonify({"ok": False, "error": "缺少 path"}), 400
    return jsonify(ios_service.inspect_ipa(path))


@app.route("/api/ios/install", methods=["POST"])
def api_ios_install():
    """启动 IPA 安装。JSON: source=latest|path + path/udid；或 multipart: file + udid。"""
    udid = None
    if request.content_type and "multipart/form-data" in request.content_type:
        udid = (request.form.get("udid") or "").strip() or None
        force = str(request.form.get("force") or "").lower() in ("1", "true", "yes")
        uninstall_first = str(request.form.get("uninstall_first") or "").lower() in (
            "1",
            "true",
            "yes",
        )
        f = request.files.get("file")
        if not f or not f.filename:
            return jsonify({"ok": False, "error": "未选择 IPA 文件"}), 400
        name = Path(f.filename).name
        if not name.lower().endswith(".ipa"):
            return jsonify({"ok": False, "error": "仅支持 .ipa 文件"}), 400
        IOS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        dest = IOS_UPLOAD_DIR / f"{uuid.uuid4().hex[:8]}_{name}"
        f.save(dest)
        result = ios_service.start_install_job(
            source="upload",
            udid=udid,
            ipa_path=str(dest),
            force=force,
            uninstall_first=uninstall_first,
        )
    else:
        data = request.json or {}
        source = (data.get("source") or "latest").strip()
        udid = (data.get("udid") or "").strip() or None
        share_dir = data.get("share_dir")
        ipa_path = data.get("path")
        force = bool(data.get("force"))
        uninstall_first = bool(data.get("uninstall_first"))
        result = ios_service.start_install_job(
            source=source,
            udid=udid,
            ipa_path=ipa_path,
            share_dir=share_dir,
            force=force,
            uninstall_first=uninstall_first,
        )
    if not result.get("ok"):
        return jsonify(result), 400
    return jsonify(result)


@app.route("/api/ios/install/<job_id>")
def api_ios_install_job(job_id):
    job = ios_service.get_install_job(job_id)
    if not job:
        return jsonify({"ok": False, "error": "任务不存在"}), 404
    return jsonify({"ok": True, "job": job})


@app.route("/api/ios/ls")
def api_ios_ls():
    udid = (request.args.get("udid") or "").strip()
    path = (request.args.get("path") or "/").strip() or "/"
    result = ios_service.list_remote(udid, path)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/recent-media")
def api_ios_recent_media():
    udid = (request.args.get("udid") or "").strip()
    try:
        limit = int(request.args.get("limit") or 40)
    except (TypeError, ValueError):
        limit = 40
    result = ios_service.list_recent_media(udid, limit=limit)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/pull", methods=["POST"])
def api_ios_pull():
    data = request.json or {}
    udid = (data.get("udid") or "").strip()
    paths = data.get("paths") or []
    if not isinstance(paths, list):
        return jsonify({"ok": False, "error": "paths 须为数组"}), 400
    result = ios_service.pull_files(udid, paths)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/screencap", methods=["POST"])
def api_ios_screencap():
    data = request.json or {}
    udid = (data.get("udid") or "").strip()
    result = ios_service.screencap_to_pc(udid)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/push", methods=["POST"])
def api_ios_push():
    udid = (request.form.get("udid") or "").strip()
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "未选择文件"}), 400
    name = Path(f.filename).name
    if not name or ".." in name:
        return jsonify({"ok": False, "error": "文件名无效"}), 400
    IOS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = IOS_UPLOAD_DIR / f"push_{uuid.uuid4().hex[:8]}_{name}"
    f.save(dest)
    result = ios_service.push_file_to_device(udid, dest)
    try:
        dest.unlink(missing_ok=True)
    except OSError:
        pass
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/file")
def api_ios_file():
    rel = (request.args.get("path") or "").strip()
    target = ios_service.resolve_exchange_file(rel)
    if not target:
        return jsonify({"ok": False, "error": "文件不存在或路径非法"}), 404
    mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return send_file(target, mimetype=mime, as_attachment=False, download_name=target.name)


@app.route("/api/ios/thumb")
def api_ios_thumb():
    """拉取远程图片到缓存并返回；已缓存则直接返回。"""
    udid = (request.args.get("udid") or "").strip()
    remote = (request.args.get("path") or "").strip()
    result = ios_service.fetch_thumb(udid, remote)
    if not result.get("ok"):
        return jsonify(result), 400
    target = ios_service.resolve_exchange_file(result.get("rel") or "")
    if not target:
        return jsonify({"ok": False, "error": "缩略图缓存丢失"}), 404
    mime = mimetypes.guess_type(str(target))[0] or "image/jpeg"
    return send_file(target, mimetype=mime, as_attachment=False, download_name=target.name)


@app.route("/api/ios/apps")
def api_ios_apps():
    udid = (request.args.get("udid") or "").strip()
    app_type = (request.args.get("type") or "User").strip() or "User"
    result = ios_service.list_apps(udid, application_type=app_type)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/uninstall", methods=["POST"])
def api_ios_uninstall():
    data = request.json or {}
    udid = (data.get("udid") or "").strip()
    bundle_id = (data.get("bundle_id") or "").strip()
    result = ios_service.uninstall_app(udid, bundle_id)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/wifi/enable", methods=["POST"])
def api_ios_wifi_enable():
    data = request.json or {}
    udid = (data.get("udid") or "").strip()
    result = ios_service.enable_wifi(udid)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/wifi/discover", methods=["POST"])
def api_ios_wifi_discover():
    data = request.json or {}
    try:
        timeout = float(data.get("timeout") or 10)
    except (TypeError, ValueError):
        timeout = 10.0
    udid = (data.get("udid") or "").strip() or None
    result = ios_service.discover_wireless(timeout=timeout, udid=udid)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/ios/wifi/connect", methods=["POST"])
def api_ios_wifi_connect():
    data = request.json or {}
    host = (data.get("host") or "").strip()
    udid = (data.get("udid") or "").strip() or None
    result = ios_service.connect_wireless(host, udid=udid)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/test-scripts/info")
def api_test_scripts_info():
    """脚本入口页用的路径元数据。"""
    tool_dir = INTEGRATED_DIR / "test_tool"
    files = []
    if tool_dir.is_dir():
        for name in ("excel2cast.py", "xmind2csv.py", "快捷启动.bat"):
            p = tool_dir / name
            if p.is_file():
                files.append({"name": name, "path": str(p.relative_to(ROOT))})

    recharge_dir = INTEGRATED_DIR / "test_point_generator" / "改包系统" / "充值回调模拟"
    recharge_bat = recharge_dir / "启动充值模拟.bat"
    recharge = None
    if recharge_bat.is_file():
        recharge = {
            "name": "充值回调模拟",
            "path": str(recharge_bat.relative_to(ROOT)),
            "dir": str(recharge_dir.relative_to(ROOT)),
            "url": "http://127.0.0.1:3780/launcher",
        }

    return jsonify({
        "ok": True,
        "path": str(tool_dir.relative_to(ROOT)) if tool_dir.exists() else "integrated/test_tool",
        "abs_path": str(tool_dir),
        "files": files,
        "recharge_callback": recharge,
    })


@app.route("/api/test-scripts/recharge-callback/launch", methods=["POST"])
def api_recharge_callback_launch():
    """启动充值回调模拟服务并打开浏览器。"""
    result = open_recharge_callback_page()
    status = 200 if result.get("ok") else 500
    return jsonify(result), status


@app.route("/api/integrated/<name>")
def integrated_info(name):
    proj_dir = INTEGRATED_ALIASES.get(name) or (INTEGRATED_DIR / name)
    if not proj_dir.exists():
        return jsonify({"error": "not found"}), 404
    files = []
    for f in sorted(proj_dir.iterdir()):
        if f.is_file() and f.suffix.lower() in (".bat", ".py", ".html", ".md", ".json"):
            files.append({"name": f.name, "path": str(f.relative_to(ROOT))})
        if len(files) >= 20:
            break
    return jsonify({
        "name": name,
        "path": str(proj_dir.relative_to(ROOT)),
        "abs_path": str(proj_dir),
        "web_url": WEB_SITES.get(name),
        "files": files,
    })


@app.route("/tools-site/")
@app.route("/tools-site/<path:filename>")
def tools_site(filename="index.html"):
    if not TOOLS_SITE_DIR.exists():
        return jsonify({"error": "静态工具网站未安装"}), 404
    return send_from_directory(TOOLS_SITE_DIR, filename)


@app.route("/ops-monitor/")
@app.route("/ops-monitor/<path:filename>")
def ops_monitor_site(filename="index.html"):
    if not MONITOR_WEB_DIR.exists():
        return jsonify({"error": "运维监控 Web 版未安装"}), 404
    return send_from_directory(MONITOR_WEB_DIR, filename)


@app.route("/gantt-chart/")
@app.route("/gantt-chart/<path:filename>")
def gantt_chart_site(filename="index.html"):
    if not GANTT_CHART_DIR.exists():
        return jsonify({"error": "甘特图排期表未安装"}), 404
    return send_from_directory(GANTT_CHART_DIR, filename)


@app.route("/agile-sim/", defaults={"subpath": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
@app.route("/agile-sim/<path:subpath>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
def agile_sim_proxy(subpath):
    """同源反向代理 → Vite dev（/agile-sim/），供 iframe 内嵌。"""
    if not AGILE_SIM_DIR.exists():
        return jsonify({"error": "agile-sim-demo 未安装"}), 404
    if not _agile_sim_vite_ok():
        ready = ensure_agile_sim_dev_running(timeout=30)
        if not ready:
            return (
                "<!DOCTYPE html><meta charset=utf-8>"
                "<p>敏捷模拟平台未就绪。请确认 Node.js 已安装，且 5173/5180 端口未被其他程序占用。</p>"
                "<p>若你曾单独运行 <code>npm run dev</code>，请先关闭该窗口再刷新。</p>",
                502,
                {"Content-Type": "text/html; charset=utf-8"},
            )
    qs = ("?" + request.query_string.decode("latin-1")) if request.query_string else ""
    # 数据验证 / 流水线等长请求：直连 Express 5180，避免 Vite 中转 + 120s 超时
    if subpath == "api" or subpath.startswith("api/"):
        api_path = "/" + subpath + qs  # /api/...
        try:
            return _proxy_http("127.0.0.1", AGILE_SIM_API_PORT, api_path, timeout=600)
        except OSError as exc:
            err = str(exc)
            if "timed out" in err.lower() or "timeout" in err.lower():
                return jsonify({
                    "ok": False,
                    "error": "请求超时（超过 10 分钟）。原型抓取或模型较慢，请稍后重试；也可先去掉截图只靠链接提取。",
                }), 504
            return jsonify({"error": f"代理失败: {exc}"}), 502

    upstream = f"/agile-sim/{subpath}" if subpath else "/agile-sim/"
    upstream += qs
    try:
        return _proxy_to_vite(upstream)
    except OSError as exc:
        return jsonify({"error": f"代理失败: {exc}"}), 502


GANTT_INDEX_FILE = DATA_DIR / "gantt_project_index.json"


def load_gantt_index() -> list:
    if not GANTT_INDEX_FILE.exists():
        return []
    with open(GANTT_INDEX_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_gantt_index(data: list) -> None:
    GANTT_INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(GANTT_INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _summarize_gantt_tasks(task_list: list) -> dict:
    tasks = []
    starts = []
    ends = []
    for tk in task_list or []:
        name = (tk.get("name") or "").strip()
        start = tk.get("start") or ""
        end = tk.get("end") or ""
        status = tk.get("status") or "todo"
        if not name:
            continue
        tasks.append({"name": name, "start": start, "end": end, "status": status})
        if start:
            starts.append(start)
        if end:
            ends.append(end)
    return {
        "tasks": tasks,
        "task_count": len(tasks),
        "date_start": min(starts) if starts else "",
        "date_end": max(ends) if ends else "",
    }


def _normalize_prototype_links(raw) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return items
    for it in raw:
        if not isinstance(it, dict):
            continue
        url = str(it.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        items.append({
            "label": str(it.get("label") or "").strip() or url,
            "url": url,
        })
    return items


def _find_gantt_entry(project_name: str, gantt_project_id: str = ""):
    entries = load_gantt_index()
    if gantt_project_id:
        hit = next((e for e in entries if e.get("gantt_project_id") == gantt_project_id), None)
        if hit:
            return hit
    name = (project_name or "").strip()
    if not name:
        return None
    for entry in entries:
        if (entry.get("project_name") or "").strip() == name:
            return entry
    for entry in entries:
        pn = (entry.get("project_name") or "").strip()
        if pn and (name in pn or pn in name):
            return entry
    return None


@app.route("/api/project-assets/for-test-point-gen", methods=["GET"])
def project_assets_for_test_point_gen():
    """测试点生成：可导入的原型 URL / 文本说明资产。"""
    q = (request.args.get("q") or "").strip().lower()
    project = (request.args.get("project") or "").strip()
    items = load_json("project-assets")
    result = []
    for item in items:
        if project and (item.get("project") or "") != project:
            continue
        kind = item.get("kind") or "file"
        url = (item.get("url") or "").strip()
        path = (item.get("path") or "").strip()
        note = (item.get("note") or "").strip()
        name = item.get("name") or ""
        usable = False
        asset_type = kind
        if kind == "url" and url:
            usable = True
        elif url.startswith("http"):
            usable = True
            asset_type = "url"
        elif path.lower().endswith((".txt", ".md")):
            usable = True
            asset_type = "text"
        elif note and ("原型" in name or "原型" in note or "http" in note.lower()):
            usable = True
            asset_type = "note"
        if not usable:
            continue
        blob = f"{name} {item.get('project','')} {note} {url} {path}".lower()
        if q and q not in blob:
            continue
        result.append({
            "id": item.get("id", ""),
            "name": name,
            "project": item.get("project") or "未分类",
            "env_group": item.get("env_group") or "",
            "iter_group": item.get("iter_group") or "",
            "kind": asset_type,
            "url": url,
            "path": path,
            "note": note,
        })
    result.sort(key=lambda x: (x["project"], x["name"]))
    return jsonify({"ok": True, "items": result[:80]})


@app.route("/api/project-assets/for-gantt", methods=["GET"])
def project_assets_for_gantt():
    project = (request.args.get("project") or "").strip()
    if not project:
        return jsonify({"error": "缺少 project"}), 400
    items = load_json("project-assets")
    result = []
    for item in items:
        if (item.get("project") or "未分类") != project:
            continue
        url = (item.get("url") or "").strip()
        if item.get("kind") == "url" and url:
            result.append({
                "id": item.get("id", ""),
                "name": item.get("name", ""),
                "url": url,
                "env_group": item.get("env_group", ""),
                "iter_group": item.get("iter_group", ""),
                "note": item.get("note", ""),
                "kind": "url",
            })
        elif url and item.get("kind") != "directory":
            result.append({
                "id": item.get("id", ""),
                "name": item.get("name", ""),
                "url": url,
                "env_group": item.get("env_group", ""),
                "iter_group": item.get("iter_group", ""),
                "note": item.get("note", ""),
                "kind": item.get("kind", "file"),
            })
    return jsonify(result)


@app.route("/api/gantt/project-sync", methods=["POST"])
def gantt_project_sync():
    body = request.get_json(silent=True) or {}
    incoming = body.get("projects")
    if not isinstance(incoming, list):
        return jsonify({"error": "缺少 projects 数组"}), 400

    entries = load_gantt_index()
    by_id = {e.get("gantt_project_id"): e for e in entries if e.get("gantt_project_id")}
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for proj in incoming:
        pid = (proj.get("id") or "").strip()
        name = (proj.get("name") or "").strip()
        if not pid or not name:
            continue
        proto_links = _normalize_prototype_links(proj.get("prototypeLinks"))
        summary = _summarize_gantt_tasks(proj.get("tasks") or [])
        entry = {
            "gantt_project_id": pid,
            "project_name": name,
            "archived": bool(proj.get("archived")),
            "zentao_execution_id": proj.get("zentaoExecutionId"),
            "zentao_label": proj.get("zentaoLabel") or "",
            "prototype_links": proto_links,
            "prototype_link_count": len(proto_links),
            "updated_at": now,
            **summary,
        }
        by_id[pid] = entry

    merged = list(by_id.values())
    merged.sort(key=lambda x: x.get("project_name", ""))
    save_gantt_index(merged)

    assets = load_json("project-assets")
    changed = False
    for i, item in enumerate(assets):
        item_project = (item.get("project") or "").strip()
        for entry in merged:
            if item_project == entry.get("project_name"):
                if item.get("gantt_project_id") != entry.get("gantt_project_id"):
                    assets[i]["gantt_project_id"] = entry.get("gantt_project_id")
                    changed = True
                break
    if changed:
        save_json("project-assets", assets)

    return jsonify({"ok": True, "count": len(merged)})


@app.route("/api/gantt/project-summary", methods=["GET"])
def gantt_project_summary():
    project = (request.args.get("project") or "").strip()
    gantt_id = (request.args.get("gantt_project_id") or "").strip()
    if not project and not gantt_id:
        return jsonify({"error": "缺少 project"}), 400
    entry = _find_gantt_entry(project, gantt_id)
    if not entry:
        return jsonify({"found": False})
    return jsonify({"found": True, **entry})


@app.route("/api/projects/<project_id>/prototypes")
def project_prototypes(project_id):
    """项目中心关联排期里保存的原型链接。"""
    projects = load_json("projects")
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        return jsonify({"ok": False, "error": "项目不存在", "items": []}), 404
    gantt_ids = set(project.get("gantt_project_ids") or [])
    items = []
    seen = set()
    for entry in load_gantt_index():
        if entry.get("gantt_project_id") not in gantt_ids:
            continue
        gantt_name = str(entry.get("project_name") or "")
        for link in _normalize_prototype_links(entry.get("prototype_links")):
            url = link.get("url") or ""
            if not url or url in seen:
                continue
            seen.add(url)
            items.append({
                "label": link.get("label") or url,
                "url": url,
                "ganttName": gantt_name,
            })
    return jsonify({
        "ok": True,
        "projectId": project_id,
        "projectName": project.get("name") or "",
        "items": items,
    })


@app.route("/api/gantt/zentao/test-login", methods=["POST"])
def gantt_zentao_test_login():
    from gantt_zentao import test_zentao_login

    body = request.json or {}
    url = (body.get("url") or "").strip()
    user = (body.get("user") or "").strip()
    password = body.get("password") or ""
    path_prefix = (body.get("pathPrefix") or "").strip()
    if not url or not user or not password:
        return jsonify({"ok": False, "message": "请填写禅道地址、账号和密码"}), 400
    try:
        ok, message = test_zentao_login(url, user, password, path_prefix)
        return jsonify({"ok": ok, "message": message})
    except RuntimeError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 502


@app.route("/api/gantt/zentao/execution-info", methods=["POST"])
def gantt_zentao_execution_info():
    from gantt_zentao import fetch_execution_info

    body = request.json or {}
    url = (body.get("url") or "").strip()
    user = (body.get("user") or "").strip()
    password = body.get("password") or ""
    path_prefix = (body.get("pathPrefix") or "").strip()
    try:
        execution_id = int(body.get("executionId") or body.get("execution_id") or 0)
    except (TypeError, ValueError):
        execution_id = 0
    if not url or not user or not password:
        return jsonify({"ok": False, "message": "请先配置禅道账号"}), 400
    if execution_id < 1:
        return jsonify({"ok": False, "message": "执行 ID 无效"}), 400
    try:
        info = fetch_execution_info(url, user, password, path_prefix, execution_id)
        return jsonify({"ok": True, "data": info})
    except RuntimeError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 502


TEST_POINT_GEN_FILE = DATA_DIR / "test_point_gen.json"
STANDALONE_QA_SKILL_FILE = AGILE_SIM_DIR / "skills" / "standalone-qa" / "SKILL.md"


def load_test_point_gen_state():
    if not TEST_POINT_GEN_FILE.exists():
        return {"skill": "", "records": []}
    try:
        with open(TEST_POINT_GEN_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        app.logger.error("load_test_point_gen_state failed: %s", exc)
        return {"skill": "", "records": []}
    if not isinstance(data, dict):
        return {"skill": "", "records": []}
    return {
        "skill": str(data.get("skill") or ""),
        "records": data.get("records") if isinstance(data.get("records"), list) else [],
    }


def save_test_point_gen_state(data: dict):
    TEST_POINT_GEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = TEST_POINT_GEN_FILE.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass
    os.replace(tmp, TEST_POINT_GEN_FILE)


def default_test_point_skill():
    if STANDALONE_QA_SKILL_FILE.exists():
        return STANDALONE_QA_SKILL_FILE.read_text(encoding="utf-8")
    return ""


@app.route("/api/test-point-gen/state", methods=["GET"])
def test_point_gen_state():
    state = load_test_point_gen_state()
    return jsonify({
        "skill": state.get("skill", ""),
        "defaultSkill": default_test_point_skill(),
        "records": state.get("records", []),
    })


@app.route("/api/test-point-gen/skill", methods=["PUT"])
def test_point_gen_skill_save():
    body = request.json or {}
    state = load_test_point_gen_state()
    state["skill"] = str(body.get("skill") or "")
    save_test_point_gen_state(state)
    return jsonify({"ok": True})


@app.route("/api/test-point-gen/records", methods=["POST"])
def test_point_gen_record_add():
    body = request.json or {}
    md = str(body.get("markdown") or "").strip()
    framework = str(body.get("framework") or "").strip()
    business = str(body.get("businessScenarios") or "").strip()
    special = str(body.get("specialMd") or body.get("special") or "").strip()
    md = re.sub(r"^(正在[^\n]*\n)+", "", md, flags=re.M).strip()
    framework = re.sub(r"^(正在[^\n]*\n)+", "", framework, flags=re.M).strip()
    business = re.sub(r"^(正在[^\n]*\n)+", "", business, flags=re.M).strip()
    special = re.sub(r"^(正在[^\n]*\n)+", "", special, flags=re.M).strip()
    if not md and not framework and not business and not special:
        return jsonify({"ok": False, "error": "无内容可保存（需至少有框架/业务场景/页面测试点/专项之一）"}), 400
    state = load_test_point_gen_state()
    records = state.get("records") or []
    title = str(body.get("title") or "").strip()
    if not title:
        skip_line = re.compile(r"^(正在|继续|请稍|生成中)")
        for blob in (framework, business, md, special, str(body.get("material") or "")):
            cleaned = re.sub(r"^(正在[^\n]*\n)+", "", str(blob or ""), flags=re.M).strip()
            for line in cleaned.splitlines():
                line = line.strip()
                if not line or line.startswith(">"):
                    continue
                if skip_line.match(line):
                    continue
                if line.startswith("# "):
                    title = re.sub(
                        r"[·•]\s*(页面框架|业务场景测试点|页面功能测试点|专项测试点|测试点)\s*$",
                        "",
                        line[2:].strip(),
                    ).strip()[:48]
                    break
            if title:
                break
        if not title:
            material = str(body.get("material") or "").strip()
            title = (material.split("\n")[0] or "测试点")[:48]
    # 统一附带时间点，便于列表区分（前端已带时不再重复）
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    if not re.search(r"·\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}", title):
        title = f"{title} · {stamp}"
    rec = {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "theme": str(body.get("theme") or "").strip(),
        "prototypeUrl": str(body.get("prototypeUrl") or "").strip(),
        "projectId": str(body.get("projectId") or ""),
        "projectName": str(body.get("projectName") or ""),
        "assetId": str(body.get("assetId") or ""),
        "material": str(body.get("material") or ""),
        "markdown": md,
        "framework": framework,
        "businessScenarios": business,
        "specialMd": special,
        "playwrightSpec": str(body.get("playwrightSpec") or "").strip(),
        "reviewReport": str(body.get("reviewReport") or "").strip(),
        "reviewHistory": body.get("reviewHistory")
        if isinstance(body.get("reviewHistory"), list)
        else [],
        "sessionId": str(body.get("sessionId") or ""),
        "createdAt": datetime.now().isoformat(timespec="seconds"),
    }
    records.insert(0, rec)
    state["records"] = records[:100]
    save_test_point_gen_state(state)
    return jsonify({"ok": True, "record": rec, "records": state["records"]})


@app.route("/api/test-point-gen/export-xmind", methods=["POST"])
def test_point_gen_export_xmind():
    """将 Markdown 树导出为 .xmind（XMind Zen / 2020 可打开）。"""
    from md_to_xmind_export import build_xmind_bytes

    body = request.json or {}
    md = str(body.get("markdown") or "").strip()
    if not md:
        return jsonify({"ok": False, "error": "无内容可导出"}), 400
    filename = str(body.get("filename") or "导出.xmind").strip()
    if not filename.lower().endswith(".xmind"):
        filename += ".xmind"
    # 防路径穿越
    filename = Path(filename).name
    sheet = str(body.get("title") or "画布 1").strip() or "画布 1"
    try:
        data = build_xmind_bytes(md, sheet_title=sheet)
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    from urllib.parse import quote

    return Response(
        data,
        mimetype="application/vnd.xmind.workbook",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
        },
    )


@app.route("/api/test-point-gen/export-zentao-csv", methods=["POST"])
def test_point_gen_export_zentao_csv():
    """将框架/场景/功能测试点导出为禅道导入 CSV；可同步模块，并可一键上传导入禅道。"""
    from urllib.parse import quote

    from gantt_zentao import import_cases_csv, login_zentao, sync_framework_modules
    from zentao_case_export import build_export, sync_module_paths

    body = request.json or {}
    framework = str(body.get("framework") or "").strip()
    business = str(body.get("businessScenarios") or body.get("business") or "").strip()
    func_md = str(body.get("markdown") or body.get("functional") or "").strip()
    special_md = str(body.get("specialMd") or body.get("special") or "").strip()
    if not framework and not business and not func_md and not special_md:
        return jsonify({"ok": False, "error": "无内容可导出"}), 400

    sync = bool(body.get("syncModules", True))
    push = bool(body.get("pushToZentao") or body.get("importToZentao"))
    module_root = str(
        body.get("moduleRoot")
        or body.get("prototypeLabel")
        or body.get("module_root")
        or ""
    ).strip()
    path_to_id: dict = {(): 0}
    sync_info: dict = {"synced": False, "modules": []}
    import_info: dict = {"imported": False}

    url = str(body.get("url") or "").strip()
    user = str(body.get("user") or "").strip()
    password = body.get("password") or ""
    path_prefix = str(body.get("pathPrefix") or "").strip()
    try:
        product_id = int(body.get("productId") or body.get("product_id") or 0)
    except (TypeError, ValueError):
        product_id = 0

    session = None
    if sync or push:
        if not url or not user or not password:
            return jsonify({"ok": False, "error": "同步/导入需要禅道地址、账号、密码"}), 400
        if product_id < 1:
            return jsonify({"ok": False, "error": "请填写禅道产品 ID（不可固定，每次可改）"}), 400
        try:
            session = login_zentao(url, user, password, path_prefix, ssl_verify=False)
        except RuntimeError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 502

    if sync and session is not None:
        module_paths = sync_module_paths(
            framework_md=framework,
            business_md=business,
            func_md=func_md,
            special_md=special_md,
            module_root=module_root,
        )
        try:
            path_to_id = sync_framework_modules(
                url,
                user,
                password,
                path_prefix,
                product_id,
                module_paths,
                session=session,
            )
        except RuntimeError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 502
        sync_info = {
            "synced": True,
            "productId": product_id,
            "moduleRoot": module_root,
            "modules": [{"path": "/".join(p), "id": i} for p, i in path_to_id.items() if p],
        }

    built = build_export(
        framework_md=framework,
        business_md=business,
        func_md=func_md,
        special_md=special_md,
        path_to_id=path_to_id,
        module_root=module_root,
    )
    filename = str(body.get("filename") or "禅道用例.csv").strip()
    if not filename.lower().endswith(".csv"):
        filename += ".csv"
    filename = Path(filename).name
    data = built["csv"].encode("utf-8")

    if push:
        if session is None:
            return jsonify({"ok": False, "error": "导入需要已登录禅道会话"}), 400
        try:
            import_info = import_cases_csv(
                session,
                url,
                path_prefix,
                product_id,
                built["csv"],
                filename=filename,
            )
            import_info["imported"] = True
            # 以确认写入条数为准，勿用本地 CSV 行数冒充「已导入」
            imported_n = int(
                import_info.get("importedTitles")
                or import_info.get("caseCount")
                or 0
            )
            import_info["caseCount"] = imported_n
        except RuntimeError as exc:
            return jsonify(
                {
                    "ok": False,
                    "error": str(exc),
                    "caseCount": built["case_count"],
                    "sync": sync_info,
                }
            ), 502
        return jsonify(
            {
                "ok": True,
                "caseCount": import_info.get("caseCount") or built["case_count"],
                "builtCaseCount": built["case_count"],
                "modules": built["modules"],
                "sync": sync_info,
                "import": import_info,
            }
        )

    if body.get("previewOnly"):
        return jsonify(
            {
                "ok": True,
                "caseCount": built["case_count"],
                "modules": built["modules"],
                "sync": sync_info,
            }
        )

    return Response(
        data,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
            "X-Zentao-Case-Count": str(built["case_count"]),
            "X-Zentao-Module-Count": str(len(sync_info.get("modules") or [])),
        },
    )


@app.route("/api/test-point-gen/import-zentao-stream", methods=["POST"])
def test_point_gen_import_zentao_stream():
    """一键导入禅道（SSE 真实进度）：同步模块 → 生成 CSV → 上传确认。"""
    import json as _json

    from gantt_zentao import import_cases_csv, login_zentao, sync_framework_modules
    from zentao_case_export import build_export, sync_module_paths

    body = request.json or {}
    framework = str(body.get("framework") or "").strip()
    business = str(body.get("businessScenarios") or body.get("business") or "").strip()
    func_md = str(body.get("markdown") or body.get("functional") or "").strip()
    special_md = str(body.get("specialMd") or body.get("special") or "").strip()
    if not framework and not business and not func_md and not special_md:
        return jsonify({"ok": False, "error": "无内容可导出"}), 400

    url = str(body.get("url") or "").strip()
    user = str(body.get("user") or "").strip()
    password = body.get("password") or ""
    path_prefix = str(body.get("pathPrefix") or "").strip()
    try:
        product_id = int(body.get("productId") or body.get("product_id") or 0)
    except (TypeError, ValueError):
        product_id = 0
    if not url or not user or not password:
        return jsonify({"ok": False, "error": "需要禅道地址、账号、密码"}), 400
    if product_id < 1:
        return jsonify({"ok": False, "error": "请填写禅道产品 ID"}), 400

    filename = str(body.get("filename") or "禅道用例.csv").strip()
    if not filename.lower().endswith(".csv"):
        filename += ".csv"
    filename = Path(filename).name
    sync = bool(body.get("syncModules", True))
    module_root = str(
        body.get("moduleRoot")
        or body.get("prototypeLabel")
        or body.get("module_root")
        or ""
    ).strip()

    def generate():
        def send(obj: dict):
            return f"data: {_json.dumps(obj, ensure_ascii=False)}\n\n"

        try:
            yield send({"type": "progress", "step": "登录禅道", "percent": 8})
            session = login_zentao(url, user, password, path_prefix, ssl_verify=False)
            path_to_id: dict = {(): 0}
            sync_info: dict = {"synced": False, "modules": []}
            if sync:
                step_label = (
                    f"同步用例模块树（{module_root}）" if module_root else "同步用例模块树"
                )
                yield send({"type": "progress", "step": step_label, "percent": 18})
                module_paths = sync_module_paths(
                    framework_md=framework,
                    business_md=business,
                    func_md=func_md,
                    special_md=special_md,
                    module_root=module_root,
                )
                path_to_id = sync_framework_modules(
                    url,
                    user,
                    password,
                    path_prefix,
                    product_id,
                    module_paths,
                    session=session,
                )
                sync_info = {
                    "synced": True,
                    "productId": product_id,
                    "moduleRoot": module_root,
                    "modules": [
                        {"path": "/".join(p), "id": i}
                        for p, i in path_to_id.items()
                        if p
                    ],
                }
                yield send(
                    {
                        "type": "progress",
                        "step": f"已同步 {len(sync_info['modules'])} 个模块",
                        "percent": 28,
                    }
                )

            yield send({"type": "progress", "step": "生成禅道 CSV", "percent": 32})
            built = build_export(
                framework_md=framework,
                business_md=business,
                func_md=func_md,
                special_md=special_md,
                path_to_id=path_to_id,
                module_root=module_root,
            )
            if built["case_count"] < 1:
                yield send(
                    {
                        "type": "error",
                        "message": "没有可导入的用例行（请先生成场景或功能测试点）",
                    }
                )
                yield send({"type": "done", "ok": False})
                return

            yield send(
                {
                    "type": "progress",
                    "step": f"CSV 已生成（{built['case_count']} 条），开始上传",
                    "percent": 36,
                    "builtCaseCount": built["case_count"],
                }
            )

            progress_q: list[dict] = []

            def on_progress(evt: dict):
                progress_q.append(dict(evt or {}))

            # 用生成器边导入边刷进度：import 内同步回调写入队列，外层轮询 yield
            import_holder: dict = {}
            err_holder: dict = {}

            def runner():
                try:
                    import_holder["info"] = import_cases_csv(
                        session,
                        url,
                        path_prefix,
                        product_id,
                        built["csv"],
                        filename=filename,
                        on_progress=on_progress,
                    )
                except Exception as exc:  # noqa: BLE001
                    err_holder["error"] = str(exc)

            import threading

            th = threading.Thread(target=runner, daemon=True)
            th.start()
            while th.is_alive() or progress_q:
                while progress_q:
                    p = progress_q.pop(0)
                    yield send(
                        {
                            "type": "progress",
                            "step": p.get("step") or "导入中",
                            "percent": int(p.get("percent") or 0),
                            "page": p.get("page"),
                            "pageTitles": p.get("pageTitles"),
                        }
                    )
                th.join(timeout=0.2)

            if err_holder.get("error"):
                yield send({"type": "error", "message": err_holder["error"]})
                yield send(
                    {
                        "type": "done",
                        "ok": False,
                        "sync": sync_info,
                        "builtCaseCount": built["case_count"],
                    }
                )
                return

            info = import_holder.get("info") or {}
            info["imported"] = True
            imported_n = int(info.get("importedTitles") or 0)
            info["caseCount"] = imported_n
            yield send(
                {
                    "type": "done",
                    "ok": True,
                    "caseCount": imported_n,
                    "builtCaseCount": built["case_count"],
                    "modules": built["modules"],
                    "sync": sync_info,
                    "import": info,
                    "browseUrl": info.get("browseUrl") or "",
                }
            )
        except Exception as exc:  # noqa: BLE001
            yield send({"type": "error", "message": str(exc)})
            yield send({"type": "done", "ok": False})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/api/test-point-gen/product-system-status", methods=["GET"])
def test_point_gen_product_system_status():
    """查询服务端是否已配置产品系统写密钥（不回传密钥明文）。"""
    from product_system_client import has_server_write_key, normalize_base_url, resolve_write_key

    has_key = has_server_write_key()
    return jsonify(
        {
            "ok": True,
            "hasWriteKey": has_key,
            "baseUrl": normalize_base_url(""),
            "writeKeyHint": (f"…{resolve_write_key('')[-6:]}" if has_key else ""),
        }
    )


@app.route("/api/test-point-gen/import-product-cases-stream", methods=["POST"])
def test_point_gen_import_product_cases_stream():
    """将框架/场景/功能测试点导入灵巅云产品系统（SSE 进度）。"""
    import json as _json

    from product_system_client import post_batches, resolve_write_key
    from xmind_product_bugs import cases_to_product_payloads
    from zentao_case_export import build_export

    body = request.json or {}
    framework = str(body.get("framework") or "").strip()
    business = str(body.get("businessScenarios") or body.get("business") or "").strip()
    func_md = str(body.get("markdown") or body.get("functional") or "").strip()
    special_md = str(body.get("specialMd") or body.get("special") or "").strip()
    if not framework and not business and not func_md and not special_md:
        return jsonify({"ok": False, "error": "无内容可导出"}), 400

    write_key = resolve_write_key(body.get("writeKey") or body.get("apiKey"))
    if not write_key:
        return jsonify({"ok": False, "error": "缺少写密钥（writeKey / OPEN_API_WRITE_KEY）"}), 400
    suite_id = str(body.get("suiteId") or "").strip()
    if not suite_id:
        return jsonify({"ok": False, "error": "suiteId 必填（用例须挂在测试套件下）"}), 400
    base_url = str(body.get("baseUrl") or body.get("url") or "").strip()
    module_root = str(
        body.get("moduleRoot") or body.get("prototypeLabel") or body.get("module_root") or ""
    ).strip()
    dry_run = bool(body.get("dryRun"))

    def generate():
        def send(obj: dict):
            return f"data: {_json.dumps(obj, ensure_ascii=False)}\n\n"

        try:
            yield send({"type": "progress", "step": "解析测试点 → 用例", "percent": 10})
            built = build_export(
                framework_md=framework,
                business_md=business,
                func_md=func_md,
                special_md=special_md,
                module_root=module_root,
            )
            cases = built.get("cases") or []
            if not cases:
                yield send({"type": "error", "message": "没有可导入的用例"})
                yield send({"type": "done", "ok": False})
                return
            payloads = cases_to_product_payloads(cases, suite_id=suite_id)
            yield send(
                {
                    "type": "progress",
                    "step": f"已生成 {len(payloads)} 条，开始写入产品系统",
                    "percent": 22,
                    "builtCaseCount": len(payloads),
                }
            )

            progress_q: list[dict] = []

            def on_progress(evt: dict):
                progress_q.append(dict(evt or {}))

            holder: dict = {}
            err_holder: dict = {}

            def runner():
                try:
                    holder["agg"] = post_batches(
                        write_key=write_key,
                        base_url=base_url,
                        kind="testCases",
                        items=payloads,
                        dry_run=dry_run,
                        on_progress=on_progress,
                    )
                except Exception as exc:  # noqa: BLE001
                    err_holder["error"] = str(exc)

            th = threading.Thread(target=runner, daemon=True)
            th.start()
            while th.is_alive() or progress_q:
                while progress_q:
                    p = progress_q.pop(0)
                    yield send(
                        {
                            "type": "progress",
                            "step": p.get("step") or "导入中",
                            "percent": int(p.get("percent") or 0),
                        }
                    )
                th.join(timeout=0.2)

            if err_holder.get("error"):
                yield send({"type": "error", "message": err_holder["error"]})
                yield send({"type": "done", "ok": False, "builtCaseCount": len(payloads)})
                return

            agg = holder.get("agg") or {}
            yield send(
                {
                    "type": "done",
                    "ok": True,
                    "dryRun": dry_run,
                    "caseCount": int(agg.get("created") or 0),
                    "updated": int(agg.get("updated") or 0),
                    "skipped": int(agg.get("skipped") or 0),
                    "builtCaseCount": len(payloads),
                    "import": agg,
                    "browseUrl": "https://product.example.com",
                }
            )
        except Exception as exc:  # noqa: BLE001
            yield send({"type": "error", "message": str(exc)})
            yield send({"type": "done", "ok": False})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/api/test-point-gen/import-product-bugs-stream", methods=["POST"])
def test_point_gen_import_product_bugs_stream():
    """上传测后 XMind → 解析粉红 Bug（含截图）→ 写入产品系统（SSE）。"""
    import json as _json

    from product_system_client import (
        fetch_existing_bug_titles,
        login_session,
        norm_bug_title,
        post_batches,
        resolve_product_pass,
        resolve_write_key,
    )
    from xmind_product_bugs import build_bug_payload, extract_bugs_from_xmind_bytes

    # 支持 multipart（文件）或 JSON（xmindBase64）
    write_key = ""
    base_url = ""
    version_id = ""
    reporter_name = os.environ.get("ZENTAO_REPORTER_NAME", "测试同学")
    source = "工作台XMind"
    dry_run = False
    assignee_map: dict = {}
    xmind_bytes: bytes | None = None
    filename = "upload.xmind"

    if request.files:
        f = request.files.get("file") or request.files.get("xmind")
        if f:
            xmind_bytes = f.read()
            filename = Path(f.filename or filename).name
        write_key = resolve_write_key(request.form.get("writeKey") or request.form.get("apiKey"))
        base_url = str(request.form.get("baseUrl") or request.form.get("url") or "").strip()
        version_id = str(request.form.get("versionId") or "").strip()
        reporter_name = str(request.form.get("reporterName") or reporter_name).strip() or "测试"
        source = str(request.form.get("source") or source).strip() or "工作台XMind"
        dry_run = str(request.form.get("dryRun") or "").lower() in ("1", "true", "yes")
        am_raw = request.form.get("assigneeMap") or "{}"
        try:
            assignee_map = json.loads(am_raw) if am_raw else {}
        except json.JSONDecodeError:
            assignee_map = {}
    else:
        body = request.json or {}
        write_key = resolve_write_key(body.get("writeKey") or body.get("apiKey"))
        base_url = str(body.get("baseUrl") or body.get("url") or "").strip()
        version_id = str(body.get("versionId") or "").strip()
        reporter_name = str(body.get("reporterName") or reporter_name).strip() or "测试"
        source = str(body.get("source") or source).strip() or "工作台XMind"
        dry_run = bool(body.get("dryRun"))
        am = body.get("assigneeMap") or {}
        assignee_map = am if isinstance(am, dict) else {}
        b64 = str(body.get("xmindBase64") or "").strip()
        if b64:
            import base64 as _b64

            if "," in b64:
                b64 = b64.split(",", 1)[1]
            try:
                xmind_bytes = _b64.b64decode(b64)
            except Exception:
                return jsonify({"ok": False, "error": "xmindBase64 解码失败"}), 400
            filename = Path(str(body.get("filename") or filename)).name

    if not write_key:
        return jsonify({"ok": False, "error": "缺少写密钥（writeKey / OPEN_API_WRITE_KEY）"}), 400
    if not xmind_bytes:
        return jsonify({"ok": False, "error": "请上传 .xmind 文件"}), 400

    def generate():
        def send(obj: dict):
            return f"data: {_json.dumps(obj, ensure_ascii=False)}\n\n"

        try:
            yield send({"type": "progress", "step": f"解析 {filename}", "percent": 8})
            bugs, resources = extract_bugs_from_xmind_bytes(xmind_bytes)
            if not bugs:
                yield send({"type": "error", "message": "未找到粉红（#FF9595）Bug 节点"})
                yield send({"type": "done", "ok": False})
                return
            yield send(
                {
                    "type": "progress",
                    "step": f"解析到 {len(bugs)} 条 Bug，组装问题/预期（截图走图片附件）",
                    "percent": 18,
                    "bugCount": len(bugs),
                }
            )
            payloads = []
            pending_list: list[list] = []
            with_img = 0
            for i, bug in enumerate(bugs):
                pl = build_bug_payload(
                    bug,
                    resources,
                    reporter_name=reporter_name,
                    version_id=version_id,
                    source=source,
                    assignee_map=assignee_map,
                )
                pending = pl.pop("_pending_images", None) or []
                if pending:
                    with_img += 1
                payloads.append(pl)
                pending_list.append(pending)
                if i % 5 == 0:
                    yield send(
                        {
                            "type": "progress",
                            "step": f"组装描述 {i + 1}/{len(bugs)}（待挂图 {with_img}）",
                            "percent": 18 + int(20 * (i + 1) / max(len(bugs), 1)),
                        }
                    )

            dup_skipped: list[dict] = []
            try:
                if resolve_product_pass() and not dry_run:
                    yield send({"type": "progress", "step": "登录拉取已有标题做同标题去重", "percent": 35})
                    sess = login_session(base_url=base_url)
                    existing = fetch_existing_bug_titles(sess, base_url=base_url, version_id=version_id)
                    kept_payloads = []
                    kept_pending = []
                    seen_batch: set[str] = set()

                    for pl, pend in zip(payloads, pending_list):
                        key = norm_bug_title(str(pl.get("title") or ""))
                        if not key:
                            dup_skipped.append({"title": pl.get("title"), "reason": "空标题"})
                            continue
                        if key in seen_batch:
                            dup_skipped.append({"title": pl.get("title"), "reason": "本批次标题重复"})
                            continue
                        hit = existing.get(key)
                        if hit:
                            dup_skipped.append(
                                {
                                    "title": pl.get("title"),
                                    "reason": "同标题已存在",
                                    "bugNo": hit.get("bugNo"),
                                    "id": hit.get("id"),
                                    "status": hit.get("status"),
                                }
                            )
                            continue
                        seen_batch.add(key)
                        kept_payloads.append(pl)
                        kept_pending.append(pend)
                    payloads = kept_payloads
                    pending_list = kept_pending
                    with_img = sum(1 for p in pending_list if p)
                    yield send(
                        {
                            "type": "progress",
                            "step": f"同标题跳过 {len(dup_skipped)}，待写入 {len(payloads)}",
                            "percent": 38,
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                yield send({"type": "progress", "step": f"去重检查失败，继续写入：{exc}", "percent": 38})

            yield send(
                {
                    "type": "progress",
                    "step": f"开始写入产品系统（{len(payloads)} 条，{with_img} 条待挂图）",
                    "percent": 40,
                }
            )

            if not payloads and not dry_run:
                yield send(
                    {
                        "type": "done",
                        "ok": True,
                        "dryRun": dry_run,
                        "bugCount": 0,
                        "updated": 0,
                        "skipped": len(dup_skipped),
                        "builtBugCount": len(bugs),
                        "withScreenshot": with_img,
                        "dupSkipped": dup_skipped,
                        "browseUrl": "https://product.example.com",
                    }
                )
                return

            progress_q: list[dict] = []

            def on_progress(evt: dict):
                progress_q.append(dict(evt or {}))

            holder: dict = {}
            err_holder: dict = {}

            def runner():
                try:
                    holder["agg"] = post_batches(
                        write_key=write_key,
                        base_url=base_url,
                        kind="bugs",
                        items=payloads,
                        dry_run=dry_run,
                        on_progress=on_progress,
                    )
                except Exception as exc:  # noqa: BLE001
                    err_holder["error"] = str(exc)

            th = threading.Thread(target=runner, daemon=True)
            th.start()
            while th.is_alive() or progress_q:
                while progress_q:
                    p = progress_q.pop(0)
                    yield send(
                        {
                            "type": "progress",
                            "step": p.get("step") or "导入中",
                            "percent": int(p.get("percent") or 0),
                        }
                    )
                th.join(timeout=0.2)

            if err_holder.get("error"):
                yield send({"type": "error", "message": err_holder["error"]})
                yield send({"type": "done", "ok": False, "builtBugCount": len(payloads)})
                return

            agg = holder.get("agg") or {}
            preview = [
                {
                    "title": b.get("bug"),
                    "assignee": b.get("assignee_name"),
                    "images": len(b.get("image_srcs") or []),
                }
                for b in bugs[:30]
            ]
            yield send(
                {
                    "type": "done",
                    "ok": True,
                    "dryRun": dry_run,
                    "bugCount": int(agg.get("created") or 0),
                    "updated": int(agg.get("updated") or 0),
                    "skipped": int(agg.get("skipped") or 0) + len(dup_skipped),
                    "builtBugCount": len(bugs),
                    "withScreenshot": with_img,
                    "dupSkipped": dup_skipped,
                    "import": agg,
                    "preview": preview,
                    "browseUrl": "https://product.example.com",
                }
            )
        except Exception as exc:  # noqa: BLE001
            yield send({"type": "error", "message": str(exc)})
            yield send({"type": "done", "ok": False})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/api/test-point-gen/records/<rec_id>", methods=["DELETE"])
def test_point_gen_record_delete(rec_id):
    state = load_test_point_gen_state()
    records = [r for r in (state.get("records") or []) if r.get("id") != rec_id]
    state["records"] = records
    save_test_point_gen_state(state)
    return jsonify({"ok": True, "records": records})


# ---------- 数据验证 ----------
DATA_VERIFY_FILE = DATA_DIR / "data_verify.json"
DATA_VERIFY_SKILL_FILE = AGILE_SIM_DIR / "skills" / "data-verify" / "SKILL.md"
DATA_VERIFY_SQL_SKILL_FILE = AGILE_SIM_DIR / "skills" / "data-verify-sql" / "SKILL.md"


def load_data_verify_state():
    if not DATA_VERIFY_FILE.exists():
        return {"skill": "", "sqlSkill": "", "records": []}
    with open(DATA_VERIFY_FILE, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return {"skill": "", "sqlSkill": "", "records": []}
    return {
        "skill": str(data.get("skill") or ""),
        "sqlSkill": str(data.get("sqlSkill") or ""),
        "records": data.get("records") if isinstance(data.get("records"), list) else [],
    }


def save_data_verify_state(data: dict):
    DATA_VERIFY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_VERIFY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _read_skill_file(path: Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


@app.route("/api/data-verify/state", methods=["GET"])
def data_verify_state():
    state = load_data_verify_state()
    return jsonify({
        "skill": state.get("skill", ""),
        "sqlSkill": state.get("sqlSkill", ""),
        "defaultSkill": _read_skill_file(DATA_VERIFY_SKILL_FILE),
        "defaultSqlSkill": _read_skill_file(DATA_VERIFY_SQL_SKILL_FILE),
        "records": state.get("records", []),
    })


@app.route("/api/data-verify/skill", methods=["PUT"])
def data_verify_skill_save():
    body = request.json or {}
    state = load_data_verify_state()
    if "skill" in body:
        state["skill"] = str(body.get("skill") or "")
    if "sqlSkill" in body:
        state["sqlSkill"] = str(body.get("sqlSkill") or "")
    save_data_verify_state(state)
    return jsonify({"ok": True})


@app.route("/api/data-verify/records", methods=["POST"])
def data_verify_record_add():
    body = request.json or {}
    fields = body.get("fields") if isinstance(body.get("fields"), list) else []
    if not fields:
        return jsonify({"ok": False, "error": "无字段可保存"}), 400
    state = load_data_verify_state()
    records = state.get("records") or []
    title = str(body.get("title") or "").strip() or "数据验证"
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    if not re.search(r"·\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}", title):
        title = f"{title} · {stamp}"
    rec = {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "projectId": str(body.get("projectId") or ""),
        "projectName": str(body.get("projectName") or ""),
        "assetId": str(body.get("assetId") or ""),
        "material": str(body.get("material") or ""),
        "fields": fields,
        "confirmed": bool(body.get("confirmed")),
        "createdAt": datetime.now().isoformat(timespec="seconds"),
    }
    records.insert(0, rec)
    state["records"] = records[:80]
    save_data_verify_state(state)
    return jsonify({"ok": True, "record": rec, "records": state["records"]})


@app.route("/api/data-verify/records/<rec_id>", methods=["DELETE"])
def data_verify_record_delete(rec_id):
    state = load_data_verify_state()
    records = [r for r in (state.get("records") or []) if r.get("id") != rec_id]
    state["records"] = records
    save_data_verify_state(state)
    return jsonify({"ok": True, "records": records})


@app.route("/api/data-verify/export-excel", methods=["POST"])
def data_verify_export_excel():
    from data_verify_export import build_data_verify_xlsx

    body = request.json or {}
    fields = body.get("fields") if isinstance(body.get("fields"), list) else []
    if not fields:
        return jsonify({"ok": False, "error": "无字段可导出"}), 400
    filename = str(body.get("filename") or "数据验证.xlsx").strip()
    if not filename.lower().endswith(".xlsx"):
        filename += ".xlsx"
    filename = Path(filename).name
    try:
        data = build_data_verify_xlsx({
            "title": str(body.get("title") or "数据验证"),
            "fields": fields,
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    from urllib.parse import quote

    return Response(
        data,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
        },
    )


@app.route("/api/data-verify/sql/execute", methods=["POST"])
def data_verify_sql_execute():
    """只读 SQL：优先请求体 conn，否则用 data/smoke_db_config.json 测试库。"""
    from data_verify_db import DbNotConfiguredError, execute_select

    body = request.json or {}
    sql = str(body.get("sql") or "").strip()
    if not sql:
        return jsonify({"ok": False, "error": "SQL 为空"}), 400
    try:
        rows = execute_select(body.get("conn"), sql)
        return jsonify({"ok": True, "rows": rows})
    except DbNotConfiguredError as exc:
        return jsonify({"ok": False, "reserved": True, "error": str(exc)}), 501
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


# ---------- AI 辅助验证（工作台指标对验） ----------
@app.route("/api/ai-assist-verify/state", methods=["GET"])
def ai_assist_verify_state():
    import ai_assist_verify

    project_id = str(request.args.get("projectId") or "").strip() or None
    return jsonify(ai_assist_verify.get_state(project_id))


@app.route("/api/ai-assist-verify/runs", methods=["GET"])
def ai_assist_verify_runs():
    import ai_assist_verify

    limit = int(request.args.get("limit") or 30)
    project_id = str(request.args.get("projectId") or "").strip() or None
    return jsonify({"ok": True, "runs": ai_assist_verify.list_runs(limit, project_id)})


@app.route("/api/ai-assist-verify/ensure-context", methods=["POST"])
def ai_assist_verify_ensure_context():
    import ai_assist_verify

    body = request.json or {}
    result = ai_assist_verify.ensure_l3_context(
        source_db=str(body.get("sourceDb") or "lx"),
        sdk_business_account=str(body.get("sdkBusinessAccount") or "") or None,
    )
    return jsonify(result)


@app.route("/api/ai-assist-verify/seed", methods=["POST"])
def ai_assist_verify_seed():
    import ai_assist_verify

    body = request.json or {}
    try:
        result = ai_assist_verify.seed_players(
            source_db=str(body.get("sourceDb") or "lx"),
            promote_id=body.get("promoteId"),
            sdk_business_account=str(body.get("sdkBusinessAccount") or "") or None,
            today_n=int(body.get("todayCount") or 10),
            yesterday_n=int(body.get("yesterdayCount") or 20),
            project_id=str(body.get("projectId") or "proj_xinshangwu"),
            project_name=str(body.get("projectName") or "新商务"),
            l3_user=str(body.get("l3User") or "") or None,
            l3_pass=str(body.get("l3Pass") or "") or None,
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/ai-assist-verify/seed-login", methods=["POST"])
def ai_assist_verify_seed_login():
    import ai_assist_verify

    body = request.json or {}
    try:
        result = ai_assist_verify.seed_login_group(
            source_db=str(body.get("sourceDb") or "lx"),
            promote_id=body.get("promoteId"),
            sdk_business_account=str(body.get("sdkBusinessAccount") or "") or None,
            today_n=int(body.get("todayCount") or 10),
            yesterday_n=int(body.get("yesterdayCount") or 20),
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/ai-assist-verify/seed-top10-reg", methods=["POST"])
def ai_assist_verify_seed_top10_reg():
    """渠道注册 TOP10 造数：11 渠道；今10→1 / 昨20→11 / 近7天30→21 / 近30天40→31。"""
    body = request.json or {}
    clear = body.get("clear")
    if clear is None:
        clear = True
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
        from _seed_top10_reg_once import seed_top10_reg

        result = seed_top10_reg(clear=bool(clear))
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/ai-assist-verify/seed-top10-pay", methods=["POST"])
def ai_assist_verify_seed_top10_pay():
    """渠道充值 TOP10：wb_top 玩家各充 10万→5千；pay_time 覆盖今/昨/近7/近30。"""
    body = request.json or {}
    clear = body.get("clear")
    if clear is None:
        clear = True
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
        from _seed_top10_pay_once import seed_top10_pay

        result = seed_top10_pay(clear=bool(clear))
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/ai-assist-verify/seed-channel-mom", methods=["POST"])
def ai_assist_verify_seed_channel_mom():
    """活跃/新增渠道环比：昨2今4，页上应为 +100%（差值会是 +2）。"""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
        from _seed_channel_mom_once import seed_channel_mom

        result = seed_channel_mom()
        import ai_assist_verify

        result["dbStats"] = ai_assist_verify.query_db_stats(
            source_db="lx",
            sdk_business_account="龙翔一级商务",
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/ai-assist-verify/seed-last-month-pay", methods=["POST"])
def ai_assist_verify_seed_last_month_pay():
    import ai_assist_verify

    body = request.json or {}
    try:
        result = ai_assist_verify.seed_last_month_pay(
            source_db=str(body.get("sourceDb") or "lx"),
            promote_id=body.get("promoteId"),
            sdk_business_account=str(body.get("sdkBusinessAccount") or "") or None,
            amount=float(body.get("amount") or 2370),
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/ai-assist-verify/db-stats", methods=["GET", "POST"])
def ai_assist_verify_db_stats():
    import ai_assist_verify

    body = request.json if request.method == "POST" else {}
    body = body if isinstance(body, dict) else {}
    source_db = str(body.get("sourceDb") or request.args.get("sourceDb") or "lx")
    promote_id = body.get("promoteId") if "promoteId" in body else request.args.get("promoteId")
    sdk_biz = str(body.get("sdkBusinessAccount") or request.args.get("sdkBusinessAccount") or "") or None
    include_sub = body.get("includeSubChannels")
    if include_sub is None:
        include_sub = request.args.get("includeSubChannels")
    include_sub = str(include_sub).lower() in ("1", "true", "yes", "on") if include_sub is not None else False
    if isinstance(body.get("includeSubChannels"), bool):
        include_sub = body["includeSubChannels"]
    try:
        result = ai_assist_verify.query_db_stats(
            source_db=source_db,
            promote_id=promote_id,
            sdk_business_account=sdk_biz,
            include_sub_channels=bool(include_sub),
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/ai-assist-verify/compare", methods=["POST"])
def ai_assist_verify_compare():
    import ai_assist_verify

    body = request.json or {}
    include_sub = body.get("includeSubChannels")
    if isinstance(include_sub, bool):
        include_sub_channels = include_sub
    else:
        include_sub_channels = str(include_sub).lower() in ("1", "true", "yes", "on")
    try:
        result = ai_assist_verify.compare_metrics(
            l3_user=str(body.get("l3User") or "") or None,
            l3_pass=str(body.get("l3Pass") or "") or None,
            base_url=str(body.get("baseUrl") or "") or None,
            source_db=str(body.get("sourceDb") or "lx"),
            promote_id=body.get("promoteId"),
            sdk_business_account=str(body.get("sdkBusinessAccount") or "") or None,
            project_id=str(body.get("projectId") or "proj_xinshangwu"),
            project_name=str(body.get("projectName") or "新商务"),
            headed=bool(body.get("headed")),
            include_sub_channels=include_sub_channels,
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify(result)


@app.route("/api/smoke/db/ping", methods=["GET", "POST"])
def smoke_db_ping():
    """探测冒烟测试库是否已配置并可连接。"""
    from smoke_db import ping_db

    return jsonify(ping_db())


@app.route("/api/smoke/db/seed", methods=["POST"])
def smoke_db_seed():
    """造数入口（表结构确认前会返回 pending）。"""
    from smoke_db import seed_smoke_metrics

    body = request.json or {}
    result = seed_smoke_metrics(body if isinstance(body, dict) else {})
    code = 200 if result.get("ok") else (501 if result.get("pending") else 400)
    return jsonify(result), code


@app.route("/api/smoke/oa/audit", methods=["POST"])
def smoke_oa_audit_api():
    """OA 绑定审核（接口版）。支持 approve/reject；可按 promoteAccount 自动定位待审单。"""
    from smoke_oa_audit import audit_bind, load_oa_audit_config, list_pending_audits

    body = request.json or {}
    action = str(body.get("action") or "").strip()
    cfg = load_oa_audit_config()
    # 允许请求临时覆盖 enabled（仅本地联调）
    if "enabled" in body:
        cfg = {**cfg, "enabled": bool(body.get("enabled"))}
    if action in {"list", "pending", "getAuditList"}:
        result = list_pending_audits(cfg)
        return jsonify(result), (200 if result.get("ok") else 400)
    result = audit_bind(
        action,
        str(body.get("bindId") or body.get("id") or body.get("platformBusierId") or "").strip(),
        cfg=cfg,
        platform_busier_id=body.get("platformBusierId") or body.get("bindId") or body.get("id"),
        user_id=str(body.get("userId") or "").strip() or None,
        source_db=str(body.get("sourceDb") or "").strip() or None,
        promote_account=str(body.get("promoteAccount") or body.get("account") or "").strip() or None,
        reject_reason=str(body.get("rejectReason") or body.get("remark") or "").strip() or None,
    )
    if result.get("skipped"):
        return jsonify(result), 501
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/smoke/sdk/temp-promote", methods=["POST"])
def smoke_sdk_temp_promote():
    """为 S9 驳回路径临时创建一条龙翔一级游戏商务，避免与已通过绑定冲突。"""
    from oa_promote_api import create_level1_business

    body = request.json or {}
    db_name = str(body.get("sourceDb") or body.get("dbName") or "lx").strip().lower() or "lx"
    result = create_level1_business(
        db_name=db_name,
        account=str(body.get("account") or "").strip() or None,
        password=str(body.get("password") or "111111"),
        real_name=str(body.get("realName") or "冒烟驳回用"),
    )
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/agile-sim/warmup", methods=["POST", "GET"])
def agile_sim_warmup():
    if not AGILE_SIM_DIR.exists():
        return jsonify({"ok": False, "error": "agile-sim-demo 未安装"}), 404
    ready = ensure_agile_sim_dev_running()
    return jsonify({
        "ok": ready,
        "web_url": WEB_SITES.get("agile-sim-demo"),
        "vite": AGILE_SIM_VITE_BASE,
        "api": AGILE_SIM_API_BASE,
    })


@app.route("/api/ops-monitor/metrics")
def ops_monitor_metrics():
    if not METRICS_FILE.exists():
        return jsonify({"error": "metrics.json 不存在"}), 404
    with open(METRICS_FILE, encoding="utf-8") as f:
        return jsonify(json.load(f))


@app.route("/api/ops-monitor/remarks/<metric_id>", methods=["GET", "PUT"])
def ops_monitor_remark(metric_id):
    remarks = load_metric_remarks()
    if request.method == "GET":
        return jsonify({"id": metric_id, "text": remarks.get(metric_id, "")})
    body = request.json or {}
    text = body.get("text", "")
    remarks[metric_id] = str(text) if text is not None else ""
    save_metric_remarks(remarks)
    return jsonify({"id": metric_id, "text": remarks[metric_id]})


INSTANCE_ORDER = {
    "大派对2-空间": 1,
    "宙包小程序": 2,
    "大派对1-空间": 3,
    "大派对": 4,
}


def _sort_ecs_instances(instances):
    return sorted(
        instances,
        key=lambda x: (INSTANCE_ORDER.get(x.get("name") or "", 99), x.get("name") or ""),
    )


def _load_ops_snapshot():
    if OPS_SNAPSHOT_FILE.exists():
        with open(OPS_SNAPSHOT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_ops_snapshot(**parts):
    snap = _load_ops_snapshot()
    snap.update(parts)
    OPS_SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OPS_SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)


def _fetch_ecs_live():
    config_path = AUTO_INSPECTION_DIR / "config.yaml"
    if not config_path.exists():
        return {"ok": False, "error": "auto-inspection 未配置（缺少 config.yaml）"}
    sys.path.insert(0, str(AUTO_INSPECTION_DIR))
    from inspection.config import load_config
    from inspection.runner import run_inspection

    cfg = load_config(config_path)
    summary, _ = run_inspection(cfg)
    dashboard = summary.dashboard or {}
    instances = _sort_ecs_instances(dashboard.get("instances") or [])
    now = datetime.now().isoformat(timespec="seconds")
    result = {"ok": True, "instances": instances, "updated_at": now}
    _save_ops_snapshot(ecs=result)
    return result


def _fetch_certs_live():
    cert_script = AUTO_INSPECTION_DIR / "scripts" / "check_cert_expiry.py"
    if not cert_script.exists():
        return {"ok": False, "error": "证书查询脚本不存在"}
    import importlib.util

    spec = importlib.util.spec_from_file_location("check_cert_expiry", cert_script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    rows = [mod.check_one(h, b) for h, b in mod.CERT_DOMAINS]
    ok = [r for r in rows if r["status"] == "ok"]
    err = [r for r in rows if r["status"] != "ok"]
    ok.sort(key=lambda x: x["days_left"])
    certs = ok + err
    now = datetime.now().isoformat(timespec="seconds")
    result = {"ok": True, "certs": certs, "updated_at": now}
    _save_ops_snapshot(certs=result)
    return result


def _run_ecs_live_job():
    with _ecs_live_lock:
        _ecs_live_state["running"] = True
    try:
        result = _fetch_ecs_live()
    except Exception as exc:  # noqa: BLE001
        result = {"ok": False, "error": str(exc), "updated_at": datetime.now().isoformat(timespec="seconds")}
    with _ecs_live_lock:
        _ecs_live_state["running"] = False
        _ecs_live_state["last_result"] = result
        if result.get("ok"):
            _ecs_live_state["updated_at"] = result.get("updated_at")
    return result


def _persist_daily_snapshot(result):
    if not result.get("ok"):
        return
    parts = {}
    if result.get("instances") is not None:
        parts["ecs"] = {
            "ok": True,
            "instances": result["instances"],
            "updated_at": result.get("generated_at") or result.get("updated_at"),
        }
    if result.get("certs") is not None:
        parts["certs"] = {
            "ok": True,
            "certs": result["certs"],
            "updated_at": result.get("generated_at") or result.get("updated_at"),
        }
    if parts:
        _save_ops_snapshot(**parts)


def run_daily_report_job(trigger="manual"):
    """后台执行 daily_report.py，结果写入 _daily_report_state。"""
    if not DAILY_REPORT_SCRIPT.exists():
        result = {
            "ok": False,
            "trigger": trigger,
            "error": "daily_report.py 不存在",
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
        _daily_report_state["last_result"] = result
        return result

    OPS_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("PYTHONUTF8", "1")
    try:
        proc = subprocess.run(
            [sys.executable, str(DAILY_REPORT_SCRIPT), "--out", str(OPS_REPORTS_DIR), "--json"],
            cwd=str(AUTO_INSPECTION_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300,
            encoding="utf-8",
            errors="replace",
            env=env,
            creationflags=_subprocess_flags(),
        )
        stdout = (proc.stdout or "").strip()
        stderr = (proc.stderr or "").strip()
        result = None
        if stdout:
            try:
                result = json.loads(stdout.splitlines()[-1])
            except json.JSONDecodeError:
                pass
        if not result:
            result = {
                "ok": proc.returncode == 0,
                "error": stderr[-500:] or stdout[-500:] or "未知错误",
            }
        result.setdefault("trigger", trigger)
        result.setdefault("updated_at", datetime.now().isoformat(timespec="seconds"))
        result["returncode"] = proc.returncode
        if stderr and not result.get("ok"):
            result["stderr"] = stderr[-800:]
        _daily_report_state["last_result"] = result
        _persist_daily_snapshot(result)
        return result
    except subprocess.TimeoutExpired:
        result = {
            "ok": False,
            "trigger": trigger,
            "error": "巡检超时（>5分钟）",
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
        _daily_report_state["last_result"] = result
        return result
    except OSError as exc:
        result = {
            "ok": False,
            "trigger": trigger,
            "error": str(exc),
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
        _daily_report_state["last_result"] = result
        return result


@app.route("/api/ops/daily-report/status")
def ops_daily_report_status():
    reports = []
    if OPS_REPORTS_DIR.exists():
        files = list(OPS_REPORTS_DIR.glob("巡检报告_*.md")) + list(OPS_REPORTS_DIR.glob("ECS_*.xlsx"))
        for f in sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)[:20]:
            reports.append({
                "name": f.name,
                "path": str(f.relative_to(ROOT)),
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds"),
            })
    return jsonify({
        "running": _daily_report_state["running"],
        "last_result": _daily_report_state["last_result"],
        "reports": reports,
        "output_dir": str(OPS_REPORTS_DIR.relative_to(ROOT)),
    })


@app.route("/api/ops/daily-report", methods=["POST"])
def ops_daily_report_trigger():
    with _daily_report_lock:
        if _daily_report_state["running"]:
            return jsonify({"ok": False, "error": "巡检正在进行中", "running": True}), 409

        def _job():
            with _daily_report_lock:
                _daily_report_state["running"] = True
            try:
                run_daily_report_job(trigger="api")
            finally:
                with _daily_report_lock:
                    _daily_report_state["running"] = False

        threading.Thread(target=_job, daemon=True).start()
    return jsonify({"ok": True, "message": "已开始生成每日巡检报告"})


@app.route("/api/ops/ecs-live")
def ops_ecs_live():
    snap = _load_ops_snapshot().get("ecs")
    if snap and snap.get("instances"):
        return jsonify({
            "running": _ecs_live_state["running"],
            "cached": True,
            **snap,
        })
    return jsonify({
        "running": _ecs_live_state["running"],
        "last_result": _ecs_live_state["last_result"],
        "ok": False,
        "error": "暂无 ECS 数据，请点击刷新",
        "instances": [],
    })


@app.route("/api/ops/ecs-live/refresh", methods=["POST"])
def ops_ecs_live_refresh():
    with _ecs_live_lock:
        if _ecs_live_state["running"]:
            return jsonify({"ok": False, "error": "正在拉取 ECS 数据", "running": True}), 409

        def _job():
            _run_ecs_live_job()

        threading.Thread(target=_job, daemon=True).start()
    return jsonify({"ok": True, "message": "已开始拉取 ECS 云监控数据"})


@app.route("/api/ops/ecs-live/status")
def ops_ecs_live_status():
    snap = _load_ops_snapshot().get("ecs") or {}
    return jsonify({
        "running": _ecs_live_state["running"],
        "last_result": _ecs_live_state["last_result"],
        "updated_at": snap.get("updated_at") or _ecs_live_state.get("updated_at"),
        "instances": snap.get("instances") or [],
        "ok": bool(snap.get("instances")),
    })


@app.route("/api/ops/certs")
def ops_certs():
    snap = _load_ops_snapshot().get("certs")
    if snap and snap.get("certs") is not None:
        return jsonify(snap)
    return jsonify({
        "ok": False,
        "error": "暂无证书数据，请先生成每日巡检报告",
        "certs": [],
        "updated_at": None,
    })


@app.route("/api/timeline/sync-status")
def timeline_sync_status():
    meta = None
    if TIMELINE_META_FILE.exists():
        with open(TIMELINE_META_FILE, encoding="utf-8") as f:
            meta = json.load(f)
    return jsonify({
        "meta": meta,
        "running": _timeline_sync_state["running"],
        "last_result": _timeline_sync_state["last_result"],
    })


@app.route("/api/timeline/sync", methods=["POST"])
def timeline_sync_trigger():
    if _timeline_sync_state["running"]:
        return jsonify({"ok": False, "error": "同步正在进行中", "running": True}), 409
    threading.Thread(target=lambda: run_timeline_sync(trigger="api"), daemon=True).start()
    return jsonify({"ok": True, "message": "已开始后台同步"})


def _load_auto_qa_file(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data
    except (OSError, json.JSONDecodeError):
        return fallback


def _save_auto_qa_file(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _auto_qa_first_url(text: str) -> str:
    hit = re.search(r"https?://[^\s，。；;]+", str(text or ""))
    return hit.group(0).rstrip(".,)") if hit else ""


def _auto_qa_record(record_id: str):
    return next(
        (
            item
            for item in (load_test_point_gen_state().get("records") or [])
            if item.get("id") == record_id
        ),
        None,
    )


def _auto_qa_save_run(run: dict):
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    runs = [item for item in runs if item.get("id") != run.get("id")]
    runs.insert(0, run)
    _save_auto_qa_file(AUTO_QA_RUNS_FILE, runs[:100])


def _smoke_cases_seed(plan_or_cases, selected_ids: list[str] | None = None) -> list[dict]:
    """从方案或 cases 列表生成初始用例状态。selected_ids 非空时，未选中的标为 skipped。
    case.enabled=false（筹备用例）默认 skipped，不进 Playwright。
    """
    if isinstance(plan_or_cases, dict):
        raw = plan_or_cases.get("cases")
        if not isinstance(raw, list) or not raw:
            raw = [
                {"id": f"S{i + 1}", "title": str(title)}
                for i, title in enumerate(plan_or_cases.get("scenarios") or [])
            ]
    else:
        raw = plan_or_cases if isinstance(plan_or_cases, list) else []
    selected = {str(x).strip().upper() for x in (selected_ids or []) if str(x).strip()}
    cases = []
    for idx, item in enumerate(raw):
        note = ""
        role = ""
        enabled = True
        if isinstance(item, str):
            cid = f"S{idx + 1}"
            title = item
        elif isinstance(item, dict):
            cid = str(item.get("id") or f"S{idx + 1}").strip() or f"S{idx + 1}"
            title = str(item.get("title") or cid)
            note = str(item.get("note") or "")
            role = str(item.get("role") or "")
            if "enabled" in item:
                enabled = bool(item.get("enabled"))
        else:
            continue
        if not enabled and not selected:
            cases.append({
                "id": cid,
                "title": title,
                "role": role,
                "status": "skipped",
                "screenshot": "",
                "error": note or "筹备中，尚未接入本次冒烟",
                "note": note,
                "enabled": False,
            })
            continue
        if selected and cid.upper() not in selected:
            cases.append({
                "id": cid,
                "title": title,
                "role": role,
                "status": "skipped",
                "screenshot": "",
                "error": "本次未选中重跑",
                "note": note,
                "enabled": enabled,
            })
        else:
            cases.append({
                "id": cid,
                "title": title,
                "role": role,
                "status": "pending",
                "screenshot": "",
                "error": "",
                "note": note,
                "enabled": enabled,
            })
    return cases


def _smoke_grep_from_case_ids(case_ids: list[str]) -> str:
    """Playwright --grep：按用例 ID 匹配标题开头，如 ^S1\\b|^S5\\b"""
    parts = []
    for raw in case_ids:
        cid = str(raw or "").strip()
        if not cid:
            continue
        parts.append(rf"^{re.escape(cid)}\b")
    return "|".join(parts)


def _smoke_write_cases(run_dir: Path, cases: list[dict], status: str = "running") -> Path:
    path = run_dir / "cases.json"
    path.write_text(
        json.dumps({"status": status, "cases": cases}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def _smoke_read_cases(run_dir: Path) -> dict:
    path = run_dir / "cases.json"
    if not path.is_file():
        return {"status": "pending", "cases": [], "accounts": _smoke_load_created_accounts(run_dir)}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "pending", "cases": [], "accounts": _smoke_load_created_accounts(run_dir)}
    if not isinstance(data, dict):
        return {"status": "pending", "cases": [], "accounts": []}
    cases = data.get("cases") if isinstance(data.get("cases"), list) else []
    accounts = data.get("accounts") if isinstance(data.get("accounts"), list) else _smoke_load_created_accounts(run_dir)
    return {
        "status": str(data.get("status") or "pending"),
        "cases": cases,
        "accounts": accounts,
    }


def _auto_qa_run_playwright(module: dict, run_dir: Path, options: dict | None = None) -> dict:
    options = options or {}
    headed = bool(options.get("headed"))
    env_extra = options.get("env") if isinstance(options.get("env"), dict) else {}
    seed_cases = options.get("cases") if isinstance(options.get("cases"), list) else None
    if seed_cases is not None:
        _smoke_write_cases(run_dir, seed_cases, status="running")
    elif not (run_dir / "cases.json").is_file():
        _smoke_write_cases(run_dir, [], status="running")

    fixed_spec = str(module.get("specPath") or "").strip()
    if fixed_spec:
        spec_path = resolve_path(fixed_spec).resolve()
        if not spec_path.is_file():
            return {"ok": False, "error": f"冒烟脚本不存在：{spec_path}"}
    else:
        record = _auto_qa_record(str(module.get("sourceRecordId") or ""))
        spec = str((record or {}).get("playwrightSpec") or "").strip()
        if not spec:
            return {"ok": False, "error": "关联测试点没有 Playwright 脚本"}
        tests_dir = AGILE_SIM_DIR / "tests" / "business-automation"
        tests_dir.mkdir(parents=True, exist_ok=True)
        safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", str(module.get("id") or "module"))
        spec_path = tests_dir / f"{safe_id}.spec.ts"
        spec_path.write_text(spec, encoding="utf-8")

    report_dir = run_dir / "playwright-report"
    env = os.environ.copy()
    # headed 时不要强制 CI，否则 Playwright 可能强制 headless
    if not headed:
        env["CI"] = "1"
    else:
        env.pop("CI", None)
    env["PLAYWRIGHT_HTML_REPORT"] = str(report_dir)
    env["SMOKE_RUN_DIR"] = str(run_dir.resolve())
    # 禁止 HTML reporter 自动打开/挂起 serve（否则一点冒烟就弹报告页并卡住）
    env["PW_TEST_HTML_REPORT_OPEN"] = "never"
    if module.get("baseUrl"):
        env["PLAYWRIGHT_BASE_URL"] = str(module.get("baseUrl"))
        env.setdefault("SMOKE_BASE_URL", str(module.get("baseUrl")))
    for key, value in env_extra.items():
        if value is None:
            continue
        env[str(key)] = str(value)

    executable = "npx.cmd" if sys.platform == "win32" else "npx"
    agile_root = AGILE_SIM_DIR.resolve()
    try:
        rel_spec = str(spec_path.resolve().relative_to(agile_root)).replace("\\", "/")
    except ValueError:
        # 回退：拷到 agile tests 目录再跑，避免跨盘符/junction 导致路径对不上
        tests_dir = agile_root / "tests" / "business-automation"
        tests_dir.mkdir(parents=True, exist_ok=True)
        copied = tests_dir / spec_path.name
        if spec_path.resolve() != copied.resolve():
            copied.write_text(spec_path.read_text(encoding="utf-8"), encoding="utf-8")
        spec_path = copied
        rel_spec = str(spec_path.relative_to(agile_root)).replace("\\", "/")
    # Playwright 把文件参数当正则，转义点号保证精确匹配
    rel_spec_arg = rel_spec.replace(".", r"\.")
    cmd = [
        executable,
        "playwright",
        "test",
        rel_spec_arg,
        "--reporter=line,html",
        "--trace=retain-on-failure",
    ]
    if headed:
        cmd.append("--headed")
    cmd.extend(["--workers", "1"])
    # 失败后仍继续后续用例（如 S7），避免一条失败整轮被掐掉
    # 卡住问题改由前端终态解锁 + 后端 stale finalize 收尾
    cmd.extend(["--retries", "0"])
    grep = str(options.get("grep") or "").strip()
    if grep:
        cmd.extend(["--grep", grep])

    timeout_s = int(options.get("timeoutSec") or 0) or (720 if headed else 420)
    # 开跑前清掉残留有头进程，否则新任务常卡在 pending、前端一直「冒烟中」
    _kill_smoke_playwright_orphans()
    creationflags = 0 if headed else _subprocess_flags()
    if sys.platform == "win32":
        creationflags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(AGILE_SIM_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            creationflags=creationflags,
            shell=False,
        )
        try:
            stdout, stderr = proc.communicate(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            _kill_process_tree(proc.pid)
            _kill_smoke_playwright_orphans()
            try:
                stdout, stderr = proc.communicate(timeout=5)
            except Exception:
                stdout, stderr = "", ""
            output = ((stdout or "") + "\n" + (stderr or ""))[-12000:]
            return {"ok": False, "error": f"Playwright 执行超过 {timeout_s} 秒", "output": output}
    except FileNotFoundError:
        return {"ok": False, "error": "未找到 Node.js/npx，请先安装 Playwright 运行环境"}
    except Exception as exc:
        if proc and proc.poll() is None:
            _kill_process_tree(proc.pid)
            _kill_smoke_playwright_orphans()
        return {"ok": False, "error": f"Playwright 启动失败：{exc}"}

    output = ((stdout or "") + "\n" + (stderr or "")).strip()
    summary_path = run_dir / "summary.md"
    status_label = "通过" if proc.returncode == 0 else "失败"
    cases_payload = _smoke_read_cases(run_dir)
    cases = cases_payload.get("cases") or []
    overall_case_status = "passed" if proc.returncode == 0 else "failed"
    _smoke_write_cases(run_dir, cases, status=overall_case_status)
    case_lines = []
    for item in cases:
        case_lines.append(
            f"- `{item.get('id')}` {item.get('title') or ''} → **{item.get('status') or 'pending'}**"
            + (f" · 截图 `{item.get('screenshot')}`" if item.get("screenshot") else "")
            + (f" · {item.get('error')}" if item.get("error") else "")
        )
    summary_path.write_text(
        "\n".join(
            [
                f"# 冒烟结果 · {module.get('name') or module.get('id')}",
                "",
                f"- 结果：**{status_label}**",
                f"- 模式：{'有头可视化' if headed else '无头'}",
                f"- 退出码：`{proc.returncode}`",
                f"- 脚本：`{spec_path}`",
                "",
                "## 用例",
                *(case_lines or ["(无用例进度)"]),
                "",
                "## 控制台摘要",
                "```",
                output[-4000:] or "(无输出)",
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return {
        "ok": proc.returncode == 0,
        "exitCode": proc.returncode,
        "output": output[-20000:],
        "headed": headed,
        "cases": cases,
        "report": str((report_dir / "index.html").relative_to(ROOT)).replace("\\", "/")
        if (report_dir / "index.html").exists()
        else "",
        "summary": str(summary_path.relative_to(ROOT)).replace("\\", "/"),
        "specPath": str(spec_path.relative_to(ROOT)).replace("\\", "/")
        if str(spec_path).startswith(str(ROOT))
        else str(spec_path),
    }


def _auto_qa_run_airtest(module: dict, run_dir: Path) -> dict:
    raw_path = str(module.get("scriptPath") or "").strip()
    if not raw_path:
        return {"ok": False, "error": "未配置 .air 脚本路径"}
    script_path = resolve_path(raw_path).resolve()
    if not script_path.exists() or script_path.suffix.lower() != ".air":
        return {"ok": False, "error": f"Airtest 脚本不存在：{script_path}"}

    executable = shutil.which("airtest") or shutil.which("airtest.exe")
    if not executable:
        return {"ok": False, "error": "未找到 airtest 命令，请先安装 Airtest CLI"}
    log_dir = run_dir / "airtest"
    cmd = [executable, "run", str(script_path), "--log", str(log_dir)]
    device = str(module.get("device") or "").strip()
    if device:
        cmd.extend(["--device", device])
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(script_path.parent),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=300,
            creationflags=_subprocess_flags(),
        )
    except subprocess.TimeoutExpired as exc:
        output = ((exc.stdout or "") + "\n" + (exc.stderr or ""))[-12000:]
        return {"ok": False, "error": "Airtest 执行超过 300 秒", "output": output}
    output = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    return {
        "ok": proc.returncode == 0,
        "exitCode": proc.returncode,
        "output": output[-20000:],
        "report": str(log_dir.relative_to(ROOT)).replace("\\", "/") if log_dir.exists() else "",
    }


@app.route("/api/auto-qa/modules", methods=["GET"])
def auto_qa_modules():
    modules = _load_auto_qa_file(AUTO_QA_MODULES_FILE, [])
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    latest = {}
    for run in runs:
        module_id = run.get("moduleId")
        if module_id and module_id not in latest:
            latest[module_id] = run
    return jsonify({
        "ok": True,
        "modules": modules,
        "runs": runs[:30],
        "latestByModule": latest,
    })


@app.route("/api/auto-qa/modules", methods=["POST"])
def auto_qa_module_add():
    body = request.json or {}
    engine = str(body.get("engine") or "").strip().lower()
    if engine not in {"playwright", "airtest"}:
        return jsonify({"ok": False, "error": "引擎仅支持 playwright 或 airtest"}), 400
    name = str(body.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "请填写模块名称"}), 400
    module = {
        "id": f"{'pw' if engine == 'playwright' else 'air'}_{uuid.uuid4().hex[:10]}",
        "name": name,
        "businessLine": str(body.get("businessLine") or "overview"),
        "engine": engine,
        "projectId": str(body.get("projectId") or ""),
        "projectName": str(body.get("projectName") or ""),
        "sourceRecordId": str(body.get("sourceRecordId") or ""),
        "baseUrl": str(body.get("baseUrl") or ""),
        "scriptPath": str(body.get("scriptPath") or ""),
        "device": str(body.get("device") or ""),
        "packageName": str(body.get("packageName") or ""),
        "enabled": True,
        "createdAt": datetime.now().isoformat(timespec="seconds"),
    }
    modules = _load_auto_qa_file(AUTO_QA_MODULES_FILE, [])
    modules.append(module)
    _save_auto_qa_file(AUTO_QA_MODULES_FILE, modules)
    return jsonify({"ok": True, "module": module}), 201


@app.route("/api/auto-qa/modules/sync-playwright", methods=["POST"])
def auto_qa_sync_playwright():
    records = load_test_point_gen_state().get("records") or []
    modules = _load_auto_qa_file(AUTO_QA_MODULES_FILE, [])
    existing_sources = {
        str(item.get("sourceRecordId") or "")
        for item in modules
        if item.get("engine") == "playwright"
    }
    existing_keys = {
        f"{item.get('projectId') or ''}|{item.get('baseUrl') or ''}"
        for item in modules
        if item.get("engine") == "playwright"
    }
    added = []
    for rec in records:
        record_id = str(rec.get("id") or "")
        spec = str(rec.get("playwrightSpec") or "").strip()
        base_url = _auto_qa_first_url(rec.get("material") or "")
        key = f"{rec.get('projectId') or ''}|{base_url}"
        if not record_id or not spec or record_id in existing_sources or key in existing_keys:
            continue
        raw_title = re.sub(r"\s*·\s*\d{4}-\d{2}-\d{2}.*$", "", str(rec.get("title") or "网页自动化"))
        project_name = str(rec.get("projectName") or "")
        module = {
            "id": f"pw_{record_id}",
            "name": f"{project_name or raw_title} · 浏览器主路径",
            "businessLine": "biz-web",
            "engine": "playwright",
            "projectId": str(rec.get("projectId") or ""),
            "projectName": project_name,
            "sourceRecordId": record_id,
            "baseUrl": base_url,
            "enabled": True,
            "createdAt": datetime.now().isoformat(timespec="seconds"),
        }
        modules.append(module)
        added.append(module)
        existing_keys.add(key)
    _save_auto_qa_file(AUTO_QA_MODULES_FILE, modules)
    return jsonify({"ok": True, "added": len(added), "modules": modules})


@app.route("/api/auto-qa/modules/<module_id>/run", methods=["POST"])
def auto_qa_module_run(module_id):
    modules = _load_auto_qa_file(AUTO_QA_MODULES_FILE, [])
    module = next((item for item in modules if item.get("id") == module_id), None)
    if not module:
        return jsonify({"ok": False, "error": "自动化模块不存在"}), 404
    body = request.json or {}
    headed = bool(body.get("headed"))
    run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    run_dir = AUTO_QA_RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    run = {
        "id": run_id,
        "moduleId": module_id,
        "moduleName": module.get("name") or module_id,
        "engine": module.get("engine"),
        "kind": module.get("kind") or "",
        "projectId": module.get("projectId") or "",
        "headed": headed,
        "status": "running",
        "startedAt": datetime.now().isoformat(timespec="seconds"),
    }
    _auto_qa_save_run(run)
    options = {"headed": headed, "env": body.get("env") if isinstance(body.get("env"), dict) else {}}
    try:
        if module.get("engine") == "playwright":
            result = _auto_qa_run_playwright(module, run_dir, options)
        elif module.get("engine") == "airtest":
            result = _auto_qa_run_airtest(module, run_dir)
        else:
            result = {"ok": False, "error": "不支持的执行引擎"}
    except Exception as exc:
        result = {"ok": False, "error": str(exc)}

    output = str(result.get("output") or "")
    (run_dir / "run.log").write_text(output or str(result.get("error") or ""), encoding="utf-8")
    run.update({
        "status": "passed" if result.get("ok") else "failed",
        "finishedAt": datetime.now().isoformat(timespec="seconds"),
        "exitCode": result.get("exitCode"),
        "error": str(result.get("error") or ""),
        "output": output[-8000:],
        "report": str(result.get("report") or ""),
        "summary": str(result.get("summary") or ""),
        "specPath": str(result.get("specPath") or ""),
        "logPath": str((run_dir / "run.log").relative_to(ROOT)).replace("\\", "/"),
    })
    _auto_qa_save_run(run)
    return jsonify({"ok": result.get("ok", False), "run": run}), 200


def _load_smoke_plans() -> list:
    return _load_auto_qa_file(SMOKE_PLANS_FILE, [])


def _smoke_plan_for_project(project_id: str) -> dict | None:
    return next(
        (
            item
            for item in _load_smoke_plans()
            if str(item.get("projectId") or "") == str(project_id) and item.get("enabled", True)
        ),
        None,
    )


def _ensure_smoke_module(plan: dict) -> dict:
    modules = _load_auto_qa_file(AUTO_QA_MODULES_FILE, [])
    module_id = str(plan.get("moduleId") or f"pw_smoke_{plan.get('projectId')}")
    existing = next((item for item in modules if item.get("id") == module_id), None)
    module = {
        "id": module_id,
        "name": plan.get("name") or f"{plan.get('projectName') or '项目'} · 业务冒烟",
        "businessLine": "biz-web",
        "engine": "playwright",
        "kind": "smoke",
        "projectId": plan.get("projectId") or "",
        "projectName": plan.get("projectName") or "",
        "specPath": plan.get("specPath") or "",
        "baseUrl": plan.get("baseUrl") or "",
        "enabled": True,
        "createdAt": (existing or {}).get("createdAt") or datetime.now().isoformat(timespec="seconds"),
    }
    if existing:
        existing.update({k: v for k, v in module.items() if k != "createdAt"})
        module = existing
    else:
        modules.append(module)
    _save_auto_qa_file(AUTO_QA_MODULES_FILE, modules)
    return module


def _smoke_env_from_plan(plan: dict) -> dict:
    accounts = plan.get("accounts") if isinstance(plan.get("accounts"), dict) else {}
    admin = accounts.get("admin") if isinstance(accounts.get("admin"), dict) else {}
    l1 = accounts.get("l1") if isinstance(accounts.get("l1"), dict) else {}
    l2 = accounts.get("l2") if isinstance(accounts.get("l2"), dict) else {}
    l3 = accounts.get("l3") if isinstance(accounts.get("l3"), dict) else {}
    sdk = accounts.get("sdk") if isinstance(accounts.get("sdk"), dict) else {}
    oa = accounts.get("oa") if isinstance(accounts.get("oa"), dict) else {}
    oa_audit = plan.get("oaAudit") if isinstance(plan.get("oaAudit"), dict) else {}
    airtest = plan.get("airtest") if isinstance(plan.get("airtest"), dict) else {}
    metrics = plan.get("dataMetrics") if isinstance(plan.get("dataMetrics"), dict) else {}
    enable_sdk = plan.get("enableSdk")
    if enable_sdk is None:
        enable_sdk = bool(sdk.get("username"))
    return {
        "SMOKE_BASE_URL": plan.get("baseUrl") or "",
        "SMOKE_CLIENT_ID": plan.get("clientId") or "",
        "SMOKE_ADMIN_USER": admin.get("username") or "",
        "SMOKE_ADMIN_PASS": admin.get("password") or "",
        "SMOKE_L1_USER": l1.get("username") or "",
        "SMOKE_L1_PASS": l1.get("password") or "",
        "SMOKE_L2_USER": l2.get("username") or "",
        "SMOKE_L2_PASS": l2.get("password") or "",
        "SMOKE_L3_USER": l3.get("username") or "",
        "SMOKE_L3_PASS": l3.get("password") or "",
        "SMOKE_SDK_USER": sdk.get("username") or "",
        "SMOKE_SDK_PASS": sdk.get("password") or "",
        "SMOKE_SDK_USER_2": (accounts.get("sdk2") or {}).get("username") or "",
        "SMOKE_SDK_PASS_2": (accounts.get("sdk2") or {}).get("password") or "",
        "SMOKE_SDK_SOURCE_DB": sdk.get("sourceDb") or plan.get("sdkSourceDb") or "lx",
        "SMOKE_ENABLE_SDK": "1" if enable_sdk else "0",
        "SMOKE_WORKBENCH_URL": "http://127.0.0.1:8765",
        "SMOKE_BUSINESS_ROLE_ID": plan.get("businessRoleId") or "2083497078545207297",
        "SMOKE_OA_USER": oa.get("username") or "",
        "SMOKE_OA_PASS": oa.get("password") or "",
        "SMOKE_OA_AUDIT_ENABLED": "1" if oa_audit.get("enabled") else "0",
        "SMOKE_OA_AUDIT_MODE": str(oa_audit.get("mode") or "api"),
        "SMOKE_AIRTEST_ENABLED": "1" if airtest.get("enabled") else "0",
        "SMOKE_AIRTEST_SCRIPT": str(airtest.get("scriptPath") or ""),
        "SMOKE_DATA_METRICS_ENABLED": "1" if metrics.get("enabled") else "0",
        "PLAYWRIGHT_BASE_URL": plan.get("baseUrl") or "",
    }


def _smoke_result_symbol(status: str) -> str:
    return {
        "passed": "✅",
        "failed": "❌",
        "skipped": "➖",
        "running": "⏳",
        "pending": "⬜",
    }.get(str(status or ""), str(status or ""))


def _smoke_load_created_accounts(run_dir: Path) -> list[dict]:
    for name in ("accounts.json", "cases.json"):
        path = run_dir / name
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if name == "accounts.json" and isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(data, dict) and isinstance(data.get("accounts"), list):
            return [item for item in data["accounts"] if isinstance(item, dict)]
    return []


def _smoke_build_report(plan: dict | None, run: dict, cases: list, accounts: list | None = None) -> dict:
    plan = plan or {}
    cases = [item for item in (cases or []) if isinstance(item, dict)]
    accounts = accounts if isinstance(accounts, list) else []
    passed = sum(1 for c in cases if c.get("status") == "passed")
    failed = sum(1 for c in cases if c.get("status") == "failed")
    skipped = sum(1 for c in cases if c.get("status") in {"skipped", "pending"})
    running = sum(1 for c in cases if c.get("status") == "running")
    total = len(cases)
    if run.get("status") == "passed":
        conclusion = "主流程通过"
    elif run.get("status") == "running":
        conclusion = "执行中"
    elif failed:
        conclusion = "存在失败项，请看用例明细与建议"
    elif skipped == total:
        conclusion = "用例均未执行或已跳过"
    else:
        conclusion = "未完全通过"

    plan_cases = {
        str(item.get("id")): item
        for item in (plan.get("cases") or [])
        if isinstance(item, dict)
    }
    detail = []
    issues = []
    pending = []
    for item in cases:
        cid = str(item.get("id") or "")
        meta = plan_cases.get(cid) or {}
        status = str(item.get("status") or "pending")
        note = str(item.get("note") or item.get("error") or "")
        role = str(item.get("role") or meta.get("role") or "")
        title = str(item.get("title") or meta.get("title") or cid)
        detail.append({
            "id": cid,
            "role": role,
            "title": title,
            "status": status,
            "result": _smoke_result_symbol(status),
            "note": note,
            "screenshot": item.get("screenshot") or "",
            "error": item.get("error") or "",
        })
        if status == "failed":
            issues.append({
                "id": cid,
                "role": role,
                "step": title,
                "phenomenon": note or item.get("error") or "失败",
                "impact": "阻断该步骤后续或影响验收",
                "advice": "结合截图与 HTML 报告排查权限/路由/接口",
            })
        if status == "skipped":
            pending.append(f"{cid} {title}" + (f"：{note}" if note else ""))

    seed_accounts = []
    acc_map = plan.get("accounts") if isinstance(plan.get("accounts"), dict) else {}
    for key, acc in acc_map.items():
        if not isinstance(acc, dict):
            continue
        seed_accounts.append({
            "level": acc.get("label") or key,
            "username": acc.get("username") or "",
            "password": acc.get("password") or "",
            "note": acc.get("note") or "方案配置账号",
        })

    return {
        "title": plan.get("reportTitle") or f"冒烟报告 — {plan.get('projectName') or plan.get('name') or '业务后台'}",
        "env": plan.get("baseUrl") or "",
        "prototypeUrl": plan.get("prototypeUrl") or "",
        "scope": "主流程（忽略样式细节）；S7 页面绑定 SDK（龙翔一级商务），提交后等 OA 审核",
        "runId": run.get("id") or "",
        "status": run.get("status") or "",
        "headed": bool(run.get("headed")),
        "startedAt": run.get("startedAt") or "",
        "finishedAt": run.get("finishedAt") or "",
        "overview": {
            "total": total,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "running": running,
            "conclusion": conclusion,
        },
        "accounts": accounts or seed_accounts,
        "cases": detail,
        "issues": issues,
        "pending": pending,
    }


def _smoke_write_report(run_dir: Path, report: dict) -> Path:
    path = run_dir / "report.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    # 同步一份可读 markdown，兼容原「摘要」入口
    ov = report.get("overview") or {}
    lines = [
        f"# {report.get('title') or '冒烟报告'}",
        f"- 环境：`{report.get('env') or ''}`",
        f"- 原型：`{report.get('prototypeUrl') or ''}`",
        f"- 范围：{report.get('scope') or ''}",
        "",
        "## 总览",
        f"| 用例 | 通过 | 失败 | 跳过 | 结论 |",
        f"|---|---|---|---|---|",
        f"| {ov.get('total', 0)} | {ov.get('passed', 0)} | {ov.get('failed', 0)} | {ov.get('skipped', 0)} | {ov.get('conclusion') or ''} |",
        "",
        "## 本次账号",
    ]
    for acc in report.get("accounts") or []:
        lines.append(
            f"- {acc.get('level') or ''}: `{acc.get('username') or ''}` / `{acc.get('password') or ''}`"
            + (f"（{acc.get('note')}）" if acc.get("note") else "")
        )
    if not report.get("accounts"):
        lines.append("- （无）")
    lines += ["", "## 用例明细", "| ID | 角色 | 场景 | 结果 | 备注 |", "|---|---|---|---|---|"]
    for item in report.get("cases") or []:
        lines.append(
            f"| {item.get('id')} | {item.get('role') or ''} | {item.get('title') or ''} | "
            f"{item.get('result') or item.get('status')} | {item.get('note') or ''} |"
        )
    if report.get("issues"):
        lines += ["", "## 失败与建议"]
        for issue in report["issues"]:
            lines.append(
                f"- `{issue.get('id')}` {issue.get('step')}: {issue.get('phenomenon')} → {issue.get('advice')}"
            )
    if report.get("pending"):
        lines += ["", "## 未测 / 跳过"]
        for item in report["pending"]:
            lines.append(f"- {item}")
    (run_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _smoke_read_report(run_dir: Path, plan: dict | None = None, run: dict | None = None) -> dict:
    path = run_dir / "report.json"
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("cases") is not None:
                return data
        except (OSError, json.JSONDecodeError):
            pass
    progress = _smoke_read_cases(run_dir)
    cases = progress.get("cases") or (run or {}).get("cases") or []
    accounts = _smoke_load_created_accounts(run_dir)
    return _smoke_build_report(plan, run or {}, cases, accounts)


def _smoke_parse_started_at(value: str | None) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text[:19], fmt)
        except ValueError:
            continue
    return None


def _smoke_finalize_stale_runs(max_age_minutes: int = 12) -> int:
    """把卡住的 running 冒烟标记失败，避免前端一直显示「冒烟中」。"""
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    now = datetime.now()
    changed = 0
    for run in runs:
        if run.get("status") != "running":
            continue
        if not (run.get("kind") == "smoke" or str(run.get("moduleId") or "").startswith("pw_smoke_")):
            continue
        started = _smoke_parse_started_at(run.get("startedAt"))
        age_sec = (now - started).total_seconds() if started else 10**9
        run_dir = AUTO_QA_RUNS_DIR / str(run.get("id") or "")
        cases_file = run_dir / "cases.json"
        progress = _smoke_read_cases(run_dir)
        cases = progress.get("cases") or run.get("cases") or []
        has_running_case = any(isinstance(c, dict) and c.get("status") == "running" for c in cases)
        has_failed_case = any(isinstance(c, dict) and c.get("status") == "failed" for c in cases)
        has_passed_case = any(isinstance(c, dict) and c.get("status") == "passed" for c in cases)
        all_pending = bool(cases) and all(
            isinstance(c, dict) and (c.get("status") or "pending") in {"pending", "skipped"}
            for c in cases
        )
        last_finished = None
        for item in cases:
            if not isinstance(item, dict):
                continue
            ft = _smoke_parse_started_at(item.get("finishedAt"))
            if ft and (last_finished is None or ft > last_finished):
                last_finished = ft
        idle_after_fail = (
            has_failed_case
            and not has_running_case
            and last_finished is not None
            and (now - last_finished).total_seconds() >= 45
        )
        # 一直全是 pending：多半 Playwright 起不来或旧进程占着，90 秒就收尾
        no_progress = all_pending and not has_running_case and not has_passed_case and age_sec >= 90
        orphan = not cases_file.is_file() and not run.get("finishedAt")
        too_old = age_sec >= max_age_minutes * 60
        if not (too_old or orphan or idle_after_fail or no_progress):
            continue
        _kill_smoke_playwright_orphans()
        run["status"] = "failed"
        run["finishedAt"] = now.isoformat(timespec="seconds")
        if idle_after_fail:
            run["error"] = str(run.get("error") or "已有用例失败且任务未正常收尾，已自动结束")
        elif no_progress:
            run["error"] = str(run.get("error") or "长时间无用例进度（可能 Playwright 卡住），已自动结束")
        else:
            run["error"] = str(run.get("error") or "任务超时或中断，已自动结束")
        if cases:
            for item in cases:
                if isinstance(item, dict) and item.get("status") in {"pending", "running"}:
                    item["status"] = "skipped" if has_failed_case else "failed"
                    item["error"] = item.get("error") or ("因前置失败未执行" if has_failed_case else "任务中断")
            _smoke_write_cases(run_dir, cases, status="failed")
            run["cases"] = cases
        changed += 1
    if changed:
        _save_auto_qa_file(AUTO_QA_RUNS_FILE, runs[:100])
    return changed


@app.route("/api/projects/<project_id>/smoke", methods=["GET"])
def project_smoke_status(project_id):
    _smoke_finalize_stale_runs()
    plan = _smoke_plan_for_project(project_id)
    runs = [
        item
        for item in _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
        if str(item.get("projectId") or "") == str(project_id)
        and (item.get("kind") == "smoke" or str(item.get("moduleId") or "").startswith("pw_smoke_"))
    ][:20]
    latest = runs[0] if runs else None
    seed = _smoke_cases_seed(plan) if plan else []
    cases = seed
    if latest:
        progress = _smoke_read_cases(AUTO_QA_RUNS_DIR / str(latest.get("id") or ""))
        if progress.get("cases"):
            cases = progress["cases"]
        elif isinstance(latest.get("cases"), list) and latest.get("cases"):
            cases = latest["cases"]
        else:
            # 历史无进度文件时，仍展示方案用例（状态未执行）
            cases = seed
    return jsonify({
        "ok": True,
        "plan": plan,
        "runs": runs,
        "latest": latest,
        "cases": cases,
    })


@app.route("/api/projects/<project_id>/smoke/plan", methods=["PUT", "POST"])
def project_smoke_plan_update(project_id):
    """更新冒烟方案中的环境/测试账号，供冒烟台直接改种子数据。"""
    plans = _load_smoke_plans()
    plan = next(
        (
            item
            for item in plans
            if str(item.get("projectId") or "") == str(project_id) and item.get("enabled", True)
        ),
        None,
    )
    if not plan:
        return jsonify({"ok": False, "error": "该项目尚未配置冒烟方案"}), 404
    body = request.json or {}
    if "prototypeUrl" in body:
        plan["prototypeUrl"] = str(body.get("prototypeUrl") or "").strip()
    if "baseUrl" in body:
        plan["baseUrl"] = str(body.get("baseUrl") or "").strip()
    if "sdkSourceDb" in body:
        plan["sdkSourceDb"] = str(body.get("sdkSourceDb") or "").strip() or "lx"
    if "enableSdk" in body:
        plan["enableSdk"] = bool(body.get("enableSdk"))

    accounts_in = body.get("accounts")
    if isinstance(accounts_in, dict):
        accounts = plan.get("accounts") if isinstance(plan.get("accounts"), dict) else {}
        for key, patch in accounts_in.items():
            if not isinstance(patch, dict):
                continue
            key = str(key).strip()
            if not key:
                continue
            cur = accounts.get(key) if isinstance(accounts.get(key), dict) else {}
            next_acc = dict(cur)
            if "username" in patch:
                next_acc["username"] = str(patch.get("username") or "").strip()
            if "password" in patch:
                next_acc["password"] = str(patch.get("password") or "")
            if "label" in patch:
                next_acc["label"] = str(patch.get("label") or "").strip() or next_acc.get("label") or key
            if "note" in patch:
                next_acc["note"] = str(patch.get("note") or "").strip()
            if "sourceDb" in patch:
                next_acc["sourceDb"] = str(patch.get("sourceDb") or "").strip()
            if not next_acc.get("label"):
                next_acc["label"] = key
            accounts[key] = next_acc
        plan["accounts"] = accounts
        # sdk 账号的 sourceDb 与方案 sdkSourceDb 对齐
        sdk = accounts.get("sdk") if isinstance(accounts.get("sdk"), dict) else None
        if sdk and sdk.get("sourceDb"):
            plan["sdkSourceDb"] = sdk.get("sourceDb") or plan.get("sdkSourceDb") or "lx"

    plan["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    _save_auto_qa_file(SMOKE_PLANS_FILE, plans)
    # 环境变更时同步 module baseUrl
    try:
        _ensure_smoke_module(plan)
    except Exception:
        pass
    return jsonify({"ok": True, "plan": plan})


@app.route("/api/projects/<project_id>/smoke/run", methods=["POST"])
def project_smoke_run(project_id):
    plan = _smoke_plan_for_project(project_id)
    if not plan:
        return jsonify({"ok": False, "error": "该项目尚未配置冒烟方案（data/smoke_plans.json）"}), 404
    body = request.json or {}
    headed = bool(body.get("headed")) if "headed" in body else bool(plan.get("defaultHeaded", True))
    raw_case_ids = body.get("caseIds") or body.get("cases") or []
    if isinstance(raw_case_ids, str):
        case_ids = [x.strip() for x in re.split(r"[,|\s]+", raw_case_ids) if x.strip()]
    elif isinstance(raw_case_ids, list):
        case_ids = [str(x).strip() for x in raw_case_ids if str(x).strip()]
    else:
        case_ids = []
    grep = str(body.get("grep") or "").strip() or (_smoke_grep_from_case_ids(case_ids) if case_ids else "")
    module = _ensure_smoke_module(plan)
    modules = _load_auto_qa_file(AUTO_QA_MODULES_FILE, [])
    # 确保内存里拿到最新 module
    module = next((item for item in modules if item.get("id") == module["id"]), module)

    # 同一项目已有 running 冒烟时拒绝并发，避免进度互相覆盖
    for item in _load_auto_qa_file(AUTO_QA_RUNS_FILE, []):
        if (
            str(item.get("projectId") or "") == str(project_id)
            and item.get("kind") == "smoke"
            and item.get("status") == "running"
        ):
            return jsonify({
                "ok": False,
                "error": "已有冒烟任务执行中",
                "run": item,
                "cases": _smoke_read_cases(AUTO_QA_RUNS_DIR / str(item.get("id") or "")).get("cases") or [],
            }), 409

    run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    run_dir = AUTO_QA_RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    seed_cases = _smoke_cases_seed(plan, case_ids if case_ids else None)
    _smoke_write_cases(run_dir, seed_cases, status="running")
    run = {
        "id": run_id,
        "moduleId": module.get("id"),
        "moduleName": module.get("name") or module.get("id"),
        "engine": "playwright",
        "kind": "smoke",
        "projectId": project_id,
        "headed": headed,
        "status": "running",
        "startedAt": datetime.now().isoformat(timespec="seconds"),
        "cases": seed_cases,
        "caseIds": case_ids,
        "grep": grep,
    }
    _auto_qa_save_run(run)

    def _job():
        try:
            result = _auto_qa_run_playwright(
                module,
                run_dir,
                {
                    "headed": headed,
                    "env": _smoke_env_from_plan(plan),
                    "cases": seed_cases,
                    "grep": grep,
                },
            )
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}

        output = str(result.get("output") or "")
        (run_dir / "run.log").write_text(output or str(result.get("error") or ""), encoding="utf-8")
        cases = result.get("cases") if isinstance(result.get("cases"), list) else _smoke_read_cases(run_dir).get("cases")
        if result.get("error") and not cases:
            cases = [{**c, "status": "failed", "error": str(result.get("error") or "")} for c in seed_cases]
            _smoke_write_cases(run_dir, cases, status="failed")
        elif result.get("error"):
            _smoke_write_cases(run_dir, cases or seed_cases, status="failed")
        accounts = _smoke_load_created_accounts(run_dir)
        run_update = {
            "id": run_id,
            "moduleId": module.get("id"),
            "moduleName": module.get("name") or module.get("id"),
            "engine": "playwright",
            "kind": "smoke",
            "projectId": project_id,
            "headed": headed,
            "status": "passed" if result.get("ok") else "failed",
            "startedAt": run["startedAt"],
            "finishedAt": datetime.now().isoformat(timespec="seconds"),
            "exitCode": result.get("exitCode"),
            "error": str(result.get("error") or ""),
            "output": output[-8000:],
            "report": str(result.get("report") or ""),
            "summary": str(result.get("summary") or ""),
            "specPath": str(result.get("specPath") or ""),
            "logPath": str((run_dir / "run.log").relative_to(ROOT)).replace("\\", "/"),
            "cases": cases or seed_cases,
            "accounts": accounts,
            "caseIds": case_ids,
            "grep": grep,
        }
        report_data = _smoke_build_report(plan, run_update, cases or seed_cases, accounts)
        report_path = _smoke_write_report(run_dir, report_data)
        run_update["summary"] = str((run_dir / "summary.md").relative_to(ROOT)).replace("\\", "/")
        run_update["reportJson"] = str(report_path.relative_to(ROOT)).replace("\\", "/")
        _auto_qa_save_run(run_update)

    threading.Thread(target=_job, daemon=True, name=f"smoke-{run_id}").start()
    return jsonify({
        "ok": True,
        "accepted": True,
        "run": run,
        "plan": plan,
        "cases": seed_cases,
    })


@app.route("/api/projects/<project_id>/smoke/stop", methods=["POST"])
def project_smoke_stop(project_id):
    """强制结束当前项目冒烟：杀残留 Playwright + 标记 running 失败。"""
    killed = _kill_smoke_playwright_orphans()
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    now = datetime.now()
    changed = 0
    for run in runs:
        if str(run.get("projectId") or "") != str(project_id):
            continue
        if run.get("status") != "running":
            continue
        if not (run.get("kind") == "smoke" or str(run.get("moduleId") or "").startswith("pw_smoke_")):
            continue
        run["status"] = "failed"
        run["finishedAt"] = now.isoformat(timespec="seconds")
        run["error"] = "用户强制结束冒烟"
        run_dir = AUTO_QA_RUNS_DIR / str(run.get("id") or "")
        progress = _smoke_read_cases(run_dir)
        cases = progress.get("cases") or run.get("cases") or []
        for item in cases:
            if isinstance(item, dict) and item.get("status") in {"pending", "running"}:
                item["status"] = "failed"
                item["error"] = item.get("error") or "用户强制结束"
        if cases:
            _smoke_write_cases(run_dir, cases, status="failed")
            run["cases"] = cases
        changed += 1
    if changed:
        _save_auto_qa_file(AUTO_QA_RUNS_FILE, runs[:100])
    return jsonify({"ok": True, "stopped": changed, "killedProcesses": killed})


# ---------- 功能测试（对照测试点生成 · 页面功能测试点）----------

@app.route("/api/projects/<project_id>/func", methods=["GET"])
def project_func_status(project_id):
    import func_test

    plan = func_test.plan_for_project(project_id)
    runs = [
        item
        for item in _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
        if str(item.get("projectId") or "") == str(project_id)
        and (item.get("kind") == "func" or str(item.get("moduleId") or "").startswith("pw_func_"))
    ][:20]
    latest = runs[0] if runs else None
    seed = func_test.seed_cases(plan) if plan else []
    cases = seed
    if latest:
        progress = _smoke_read_cases(AUTO_QA_RUNS_DIR / str(latest.get("id") or ""))
        if progress.get("cases"):
            cases = progress["cases"]
        elif isinstance(latest.get("cases"), list) and latest.get("cases"):
            cases = latest["cases"]
    skills = [
        {
            "id": "func-qa-engineer",
            "name": "功能测试工程师",
            "path": "workbench/skills/func-qa-engineer/SKILL.md",
            "role": "细项判定与加深策略",
        },
        {
            "id": "playwright-skill",
            "name": "Playwright Skill (TestDino)",
            "path": "workbench/skills/playwright-skill/SKILL.md",
            "role": "定位/断言黄金法则",
            "source": "https://github.com/testdino-hq/playwright-skill",
        },
        {
            "id": "business-smoke-test",
            "name": "业务冒烟+功能台",
            "path": "cursor-skills/business-smoke-test",
            "role": "冒烟与功能台入口说明",
        },
    ]
    return jsonify(
        {
            "ok": True,
            "plan": plan,
            "runs": runs,
            "latest": latest,
            "cases": cases,
            "skills": skills,
            "passRule": "可见性细项≥3条时命中率<40%判失败；样例假数据可跳过",
        }
    )


@app.route("/api/projects/<project_id>/func/sync", methods=["POST"])
def project_func_sync(project_id):
    """从测试点生成同步页面功能用例到功能测试列表。"""
    import func_test

    projects = load_json("projects")
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    smoke = _smoke_plan_for_project(project_id) or {}
    result = func_test.sync_from_test_points(
        project_id,
        project_name=str(project.get("name") or ""),
        smoke_plan=smoke,
        load_state=load_test_point_gen_state,
    )
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/api/projects/<project_id>/func/run", methods=["POST"])
def project_func_run(project_id):
    import func_test

    plan = func_test.plan_for_project(project_id)
    if not plan or not (plan.get("cases") or []):
        # 自动尝试同步一次
        projects = load_json("projects")
        project = next((p for p in projects if p.get("id") == project_id), None) or {}
        synced = func_test.sync_from_test_points(
            project_id,
            project_name=str(project.get("name") or ""),
            smoke_plan=_smoke_plan_for_project(project_id) or {},
            load_state=load_test_point_gen_state,
        )
        if not synced.get("ok"):
            return jsonify({"ok": False, "error": synced.get("error") or "请先同步测试点"}), 400
        plan = synced.get("plan") or func_test.plan_for_project(project_id)
    if not plan:
        return jsonify({"ok": False, "error": "功能测试方案不存在"}), 404

    body = request.json or {}
    headed = bool(body.get("headed")) if "headed" in body else bool(plan.get("defaultHeaded", True))
    raw_case_ids = body.get("caseIds") or body.get("cases") or []
    if isinstance(raw_case_ids, str):
        case_ids = [x.strip() for x in re.split(r"[,|\s]+", raw_case_ids) if x.strip()]
    elif isinstance(raw_case_ids, list):
        case_ids = [str(x).strip() for x in raw_case_ids if str(x).strip()]
    else:
        case_ids = []

    for item in _load_auto_qa_file(AUTO_QA_RUNS_FILE, []):
        if (
            str(item.get("projectId") or "") == str(project_id)
            and item.get("kind") == "func"
            and item.get("status") == "running"
        ):
            return jsonify({
                "ok": False,
                "error": "已有功能测试任务执行中",
                "run": item,
                "cases": _smoke_read_cases(AUTO_QA_RUNS_DIR / str(item.get("id") or "")).get("cases") or [],
            }), 409

    module = func_test.ensure_module(
        plan,
        load_modules=lambda: _load_auto_qa_file(AUTO_QA_MODULES_FILE, []),
        save_modules=lambda mods: _save_auto_qa_file(AUTO_QA_MODULES_FILE, mods),
    )
    run_id = f"func_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    run_dir = AUTO_QA_RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    seed_cases = func_test.seed_cases(plan, case_ids if case_ids else None)
    _smoke_write_cases(run_dir, seed_cases, status="running")
    run = {
        "id": run_id,
        "moduleId": module.get("id"),
        "moduleName": module.get("name") or module.get("id"),
        "engine": "playwright",
        "kind": "func",
        "projectId": project_id,
        "headed": headed,
        "status": "running",
        "startedAt": datetime.now().isoformat(timespec="seconds"),
        "cases": seed_cases,
        "caseIds": case_ids,
    }
    _auto_qa_save_run(run)

    def _job():
        try:
            result = _auto_qa_run_playwright(
                module,
                run_dir,
                {
                    "headed": headed,
                    "env": func_test.env_from_plan(plan, run_dir=run_dir),
                    "cases": seed_cases,
                    "timeoutSec": 1800,
                },
            )
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}
        output = str(result.get("output") or "")
        (run_dir / "run.log").write_text(output or str(result.get("error") or ""), encoding="utf-8")
        cases = result.get("cases") if isinstance(result.get("cases"), list) else _smoke_read_cases(run_dir).get("cases")
        if result.get("error") and not cases:
            cases = [{**c, "status": "failed", "error": str(result.get("error") or "")} for c in seed_cases]
            _smoke_write_cases(run_dir, cases, status="failed")
        run_update = {
            "id": run_id,
            "moduleId": module.get("id"),
            "moduleName": module.get("name") or module.get("id"),
            "engine": "playwright",
            "kind": "func",
            "projectId": project_id,
            "headed": headed,
            "status": "passed" if result.get("ok") else "failed",
            "startedAt": run["startedAt"],
            "finishedAt": datetime.now().isoformat(timespec="seconds"),
            "exitCode": result.get("exitCode"),
            "error": str(result.get("error") or ""),
            "output": output[-8000:],
            "report": str(result.get("report") or ""),
            "summary": str(result.get("summary") or ""),
            "specPath": str(result.get("specPath") or ""),
            "logPath": str((run_dir / "run.log").relative_to(ROOT)).replace("\\", "/"),
            "cases": cases or seed_cases,
            "caseIds": case_ids,
        }
        report_data = _smoke_build_report(plan, run_update, cases or seed_cases, [])
        report_data["title"] = plan.get("reportTitle") or report_data.get("title")
        report_data["scope"] = "页面功能测试（对照测试点生成 markdown）；截图与失败说明见用例明细"
        report_path = _smoke_write_report(run_dir, report_data)
        run_update["summary"] = str((run_dir / "summary.md").relative_to(ROOT)).replace("\\", "/")
        run_update["reportJson"] = str(report_path.relative_to(ROOT)).replace("\\", "/")
        _auto_qa_save_run(run_update)

    threading.Thread(target=_job, daemon=True, name=f"func-{run_id}").start()
    return jsonify({"ok": True, "accepted": True, "run": run, "plan": plan, "cases": seed_cases})


@app.route("/api/projects/<project_id>/func/stop", methods=["POST"])
def project_func_stop(project_id):
    killed = _kill_smoke_playwright_orphans()
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    now = datetime.now()
    changed = 0
    for run in runs:
        if str(run.get("projectId") or "") != str(project_id):
            continue
        if run.get("status") != "running":
            continue
        if not (run.get("kind") == "func" or str(run.get("moduleId") or "").startswith("pw_func_")):
            continue
        run["status"] = "failed"
        run["finishedAt"] = now.isoformat(timespec="seconds")
        run["error"] = "用户强制结束功能测试"
        run_dir = AUTO_QA_RUNS_DIR / str(run.get("id") or "")
        progress = _smoke_read_cases(run_dir)
        cases = progress.get("cases") or run.get("cases") or []
        for item in cases:
            if isinstance(item, dict) and item.get("status") in {"pending", "running"}:
                item["status"] = "failed"
                item["error"] = item.get("error") or "用户强制结束"
        if cases:
            _smoke_write_cases(run_dir, cases, status="failed")
            run["cases"] = cases
        changed += 1
    if changed:
        _save_auto_qa_file(AUTO_QA_RUNS_FILE, runs[:100])
    return jsonify({"ok": True, "stopped": changed, "killedProcesses": killed})


@app.route("/api/projects/<project_id>/func/cases/result", methods=["POST"])
def project_func_case_result(project_id):
    """人工/Agent 回写单条功能用例结果（含说明；截图可传相对路径）。"""
    body = request.json or {}
    run_id = str(body.get("runId") or "").strip()
    case_id = str(body.get("caseId") or body.get("id") or "").strip()
    status = str(body.get("status") or "").strip() or "failed"
    if not run_id or not case_id:
        return jsonify({"ok": False, "error": "缺少 runId 或 caseId"}), 400
    run_dir = AUTO_QA_RUNS_DIR / run_id
    if not run_dir.is_dir():
        return jsonify({"ok": False, "error": "run 不存在"}), 404
    progress = _smoke_read_cases(run_dir)
    cases = progress.get("cases") or []
    found = False
    for item in cases:
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "") != case_id:
            continue
        item["status"] = status
        if "note" in body:
            item["note"] = str(body.get("note") or "")
        if "error" in body:
            item["error"] = str(body.get("error") or "")
        if "screenshot" in body:
            item["screenshot"] = str(body.get("screenshot") or "")
        item["finishedAt"] = datetime.now().isoformat(timespec="seconds")
        found = True
        break
    if not found:
        return jsonify({"ok": False, "error": f"用例不存在: {case_id}"}), 404
    overall = "passed" if all(c.get("status") == "passed" for c in cases if isinstance(c, dict)) else (
        "running" if any(c.get("status") in {"pending", "running"} for c in cases if isinstance(c, dict)) else "failed"
    )
    _smoke_write_cases(run_dir, cases, status=overall)
    return jsonify({"ok": True, "cases": cases, "status": overall})


@app.route("/api/auto-qa/runs/<run_id>/progress")
def auto_qa_run_progress(run_id):
    _smoke_finalize_stale_runs()
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    run = next((item for item in runs if item.get("id") == run_id), None)
    if not run:
        return jsonify({"ok": False, "error": "运行记录不存在"}), 404
    progress = _smoke_read_cases(AUTO_QA_RUNS_DIR / run_id)
    cases = progress.get("cases") or run.get("cases") or []
    return jsonify({
        "ok": True,
        "run": run,
        "status": run.get("status") or progress.get("status") or "pending",
        "cases": cases,
        "accounts": progress.get("accounts") or run.get("accounts") or _smoke_load_created_accounts(AUTO_QA_RUNS_DIR / run_id),
    })


@app.route("/api/auto-qa/runs/<run_id>/smoke-report")
def auto_qa_run_smoke_report(run_id):
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    run = next((item for item in runs if item.get("id") == run_id), None)
    if not run:
        return jsonify({"ok": False, "error": "运行记录不存在"}), 404
    plan = _smoke_plan_for_project(str(run.get("projectId") or ""))
    report = _smoke_read_report(AUTO_QA_RUNS_DIR / run_id, plan, run)
    return jsonify({"ok": True, "report": report, "run": run})


@app.route("/api/auto-qa/runs/<run_id>/artifact/<path:asset_path>")
def auto_qa_run_artifact(run_id, asset_path):
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    run = next((item for item in runs if item.get("id") == run_id), None)
    if not run:
        return jsonify({"error": "运行记录不存在"}), 404
    run_dir = (AUTO_QA_RUNS_DIR / run_id).resolve()
    target = (run_dir / asset_path).resolve()
    try:
        target.relative_to(run_dir)
    except ValueError:
        return jsonify({"error": "非法路径"}), 403
    if not target.is_file():
        return jsonify({"error": "文件不存在"}), 404
    return send_file(target)


@app.route("/api/auto-qa/runs/<run_id>/summary")
def auto_qa_run_summary(run_id):
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    run = next((item for item in runs if item.get("id") == run_id), None)
    if not run:
        return jsonify({"error": "运行记录不存在"}), 404
    summary = resolve_path(str(run.get("summary") or ""))
    if summary.is_file():
        return Response(summary.read_text(encoding="utf-8"), mimetype="text/markdown; charset=utf-8")
    # fallback：用 output 拼一份
    text = "\n".join(
        [
            f"# 冒烟结果 · {run.get('moduleName') or run_id}",
            "",
            f"- 结果：**{'通过' if run.get('status') == 'passed' else '失败'}**",
            f"- 模式：{'有头可视化' if run.get('headed') else '无头'}",
            "",
            "```",
            str(run.get("output") or run.get("error") or "(无输出)"),
            "```",
        ]
    )
    return Response(text, mimetype="text/markdown; charset=utf-8")


@app.route("/api/auto-qa/runs/<run_id>/report/")
@app.route("/api/auto-qa/runs/<run_id>/report/<path:asset_path>")
def auto_qa_run_report(run_id, asset_path="index.html"):
    runs = _load_auto_qa_file(AUTO_QA_RUNS_FILE, [])
    run = next((item for item in runs if item.get("id") == run_id), None)
    if not run or run.get("engine") != "playwright":
        return jsonify({"error": "报告不存在"}), 404
    report = resolve_path(str(run.get("report") or ""))
    if not report.is_file() or report.name.lower() != "index.html":
        return jsonify({"error": "Playwright HTML 报告尚未生成"}), 404
    return send_from_directory(report.parent, asset_path)


def _sprite_recommend_modules(question: str, modules: list[dict]) -> list[dict]:
    text = str(question or "").lower()
    scored = []
    for module in modules:
        haystack = " ".join([
            str(module.get("name") or ""),
            str(module.get("projectName") or ""),
            str(module.get("businessLine") or ""),
            str(module.get("engine") or ""),
        ]).lower()
        score = 0
        for word in re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z0-9_-]+", text):
            if len(word) >= 2 and word in haystack:
                score += 3
        if any(k in text for k in ("网页", "浏览器", "playwright")) and module.get("engine") == "playwright":
            score += 2
        if any(k in text for k in ("软件", "客户端", "游戏", "airtest")) and module.get("engine") == "airtest":
            score += 2
        if any(k in text for k in ("商务", "会长")) and module.get("businessLine") in {"biz-web", "guild-web"}:
            score += 1
        scored.append((score, module))
    scored.sort(key=lambda item: item[0], reverse=True)
    picked = [item for score, item in scored if score > 0][:3]
    if not picked and any(k in text for k in ("运行", "执行", "自动化", "测试")):
        picked = [item for _, item in scored[:3]]
    return [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "engine": item.get("engine"),
            "projectName": item.get("projectName"),
        }
        for item in picked
    ]


def _sprite_local_answer(question: str, recommendations: list[dict]) -> str:
    text = str(question or "")
    if "分享" in text and ("归属" in text or "玩家" in text):
        answer = "会长生成推广链接后，玩家通过该链接下载或打开游戏，完成注册登录后建立渠道归属。建议同时在 SDK 侧验证注册链路，并到总后台核对玩家、渠道和会长关系。"
    elif "分佣" in text:
        answer = "分佣验证建议以充值订单号串联：先完成充值，再在总后台和会长端核对金额与比例。接口断言优先，页面截图作为证据；文档中的 27%/73% 只是示意，执行前要以实际配置为准。"
    elif any(k in text.lower() for k in ("playwright", "网页", "浏览器")):
        answer = "浏览器网页优先使用 Playwright。测试点生成的 playwrightSpec 可以同步成业务模块，工作台负责执行、日志、HTML 报告和 Trace。"
    elif any(k in text.lower() for k in ("airtest", "软件", "客户端", "游戏")):
        answer = "桌面软件、游戏客户端和移动端继续使用 Airtest。先在 Airtest IDE 录制 .air 脚本，再到工作台登记脚本路径和设备串即可执行。"
    elif any(k in text for k in ("运行", "执行", "测试")):
        answer = "我不会直接替你执行写操作。请从下方推荐模块中确认一个，再点击“运行”触发；执行结果、日志和报告会回到业务自动化页面。"
    else:
        answer = "我可以回答 OA、商务、会长、总后台、SDK、充值与分佣流程，也能判断场景应走 Playwright、Airtest 还是 Apifox，并推荐现有自动化模块。"
    if recommendations:
        answer += " 我已在下方列出可用模块，你确认后可直接运行。"
    return answer


def _sprite_llm_config_from_file() -> dict:
    data = _load_auto_qa_file(SPRITE_LLM_CONFIG_FILE, {})
    if not isinstance(data, dict):
        return {}
    return {
        "baseUrl": str(data.get("baseUrl") or "").strip(),
        "model": str(data.get("model") or "").strip(),
        "apiKey": str(data.get("apiKey") or "").strip(),
        "source": str(data.get("source") or "").strip(),
    }


def _sprite_merge_llm_config(client_config: dict | None) -> dict:
    client = client_config if isinstance(client_config, dict) else {}
    if str(client.get("apiKey") or "").strip():
        return client
    shared = _sprite_llm_config_from_file()
    if str(shared.get("apiKey") or "").strip():
        return {
            "baseUrl": shared.get("baseUrl") or client.get("baseUrl") or "https://api.openai.com/v1",
            "model": shared.get("model") or client.get("model") or "gpt-4o-mini",
            "apiKey": shared.get("apiKey"),
            "source": shared.get("source") or "agile-sim",
        }
    return client


def _sprite_llm_answer(question: str, history: list, config: dict, recommendations: list[dict]) -> tuple[str, str]:
    config = _sprite_merge_llm_config(config)
    api_key = str(config.get("apiKey") or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return _sprite_local_answer(question, recommendations), "local"
    base_url = str(
        config.get("baseUrl")
        or os.environ.get("OPENAI_BASE_URL")
        or "https://api.openai.com/v1"
    ).strip().rstrip("/")
    model = str(config.get("model") or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini").strip()
    skill_path = ROOT / "workbench" / "skills" / "game-biz-sprite" / "SKILL.md"
    req_path = ROOT / "workbench" / "docs" / "业务自动化需求.md"
    skill = skill_path.read_text(encoding="utf-8") if skill_path.exists() else ""
    requirement = req_path.read_text(encoding="utf-8") if req_path.exists() else ""
    system = (
        f"{skill}\n\n【需求基线】\n{requirement[:16000]}\n\n"
        "【执行约束】你只能答疑、推荐模块。不得声称已经执行；必须等用户点击模块按钮确认。"
        "回答使用简体中文，先结论，控制在 300 字内。"
    )
    messages = []
    for item in (history or [])[-10:]:
        role = item.get("role")
        content = str(item.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content[:3000]})
    if not messages or messages[-1].get("role") != "user" or messages[-1].get("content") != question[:5000]:
        messages.append({"role": "user", "content": question[:5000]})
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system}, *messages],
        "temperature": 0.3,
        "max_tokens": 800,
    }, ensure_ascii=False).encode("utf-8")
    req = Request(
        f"{base_url}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        answer = str(content or "").strip() or _sprite_local_answer(question, recommendations)
        return answer, "llm" if answer and content else "local"
    except Exception as exc:
        return (
            _sprite_local_answer(question, recommendations)
            + f"\n\n模型暂不可用，已切换本地知识回答（{str(exc)[:120]}）。",
            "local",
        )


@app.route("/api/auto-qa/sprite/llm-config", methods=["GET"])
def auto_qa_sprite_llm_config_get():
    config = _sprite_llm_config_from_file()
    api_key = str(config.get("apiKey") or "").strip()
    return jsonify({
        "ok": True,
        "configured": bool(api_key),
        "config": {
            "baseUrl": config.get("baseUrl") or "https://api.openai.com/v1",
            "model": config.get("model") or "gpt-4o-mini",
            "apiKey": api_key,
            "source": config.get("source") or "",
        },
    })


@app.route("/api/auto-qa/sprite/llm-config", methods=["PUT"])
def auto_qa_sprite_llm_config_put():
    body = request.json or {}
    api_key = str(body.get("apiKey") or "").strip()
    if not api_key:
        return jsonify({"ok": False, "error": "缺少 apiKey"}), 400
    config = {
        "baseUrl": str(body.get("baseUrl") or "https://api.openai.com/v1").strip().rstrip("/"),
        "model": str(body.get("model") or "gpt-4o-mini").strip(),
        "apiKey": api_key,
        "source": str(body.get("source") or "agile-sim").strip(),
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
    }
    _save_auto_qa_file(SPRITE_LLM_CONFIG_FILE, config)
    return jsonify({"ok": True, "configured": True, "source": config["source"]})


@app.route("/api/auto-qa/sprite/state", methods=["GET"])
def auto_qa_sprite_state():
    state = _load_auto_qa_file(AUTO_QA_SPRITE_FILE, {"history": []})
    history = state.get("history") if isinstance(state, dict) else []
    return jsonify({"ok": True, "history": history if isinstance(history, list) else []})


@app.route("/api/auto-qa/sprite/chat", methods=["POST"])
def auto_qa_sprite_chat():
    body = request.json or {}
    question = str(body.get("message") or "").strip()
    if not question:
        return jsonify({"ok": False, "error": "请输入问题"}), 400
    modules = _load_auto_qa_file(AUTO_QA_MODULES_FILE, [])
    recommendations = _sprite_recommend_modules(question, modules)
    state = _load_auto_qa_file(AUTO_QA_SPRITE_FILE, {"history": []})
    stored_history = state.get("history") if isinstance(state, dict) else []
    if not isinstance(stored_history, list):
        stored_history = []
    client_history = body.get("history") if isinstance(body.get("history"), list) else []
    prompt_history = client_history or stored_history
    raw_config = body.get("config") if isinstance(body.get("config"), dict) else {}
    config = _sprite_merge_llm_config(raw_config)
    reply, mode = _sprite_llm_answer(question, prompt_history, config, recommendations)
    api_key = str(config.get("apiKey") or os.environ.get("OPENAI_API_KEY") or "").strip()
    config_source = str(config.get("source") or "").strip()
    shared_history = [
        *stored_history,
        {"role": "user", "content": question},
        {"role": "assistant", "content": reply},
    ][-40:]
    _save_auto_qa_file(AUTO_QA_SPRITE_FILE, {
        "history": shared_history,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
    })
    return jsonify({
        "ok": True,
        "reply": reply,
        "mode": mode,
        "llmConfigured": bool(api_key),
        "configSource": config_source,
        "hint": (
            "未配置 API Key，当前使用内置知识库回答。可在测试点生成里配置后自动复用，或在「模型设置」单独填写。"
            if not api_key else (
                "已复用测试点生成的模型配置。"
                if config_source == "agile-sim" and not str(raw_config.get("apiKey") or "").strip()
                else ""
            )
        ),
        "recommendations": recommendations,
        "history": shared_history,
    })


@app.route("/api/auto-qa/sprite/launch", methods=["POST"])
def auto_qa_sprite_launch():
    global _business_sprite_proc
    if _business_sprite_proc and _business_sprite_proc.poll() is None:
        return jsonify({"ok": True, "status": "already_running"})
    package_file = TOOLS_DESKTOP_DIR / "package.json"
    sprite_main = TOOLS_DESKTOP_DIR / "sprite-main.js"
    if not package_file.exists() or not sprite_main.exists():
        return jsonify({"ok": False, "error": "桌面精灵文件不完整"}), 404
    electron_bin = TOOLS_DESKTOP_DIR / "node_modules" / ".bin" / (
        "electron.cmd" if sys.platform == "win32" else "electron"
    )
    if not electron_bin.exists():
        try:
            install = subprocess.run(
                ["npm", "install"],
                cwd=str(TOOLS_DESKTOP_DIR),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=300,
                shell=(sys.platform == "win32"),
                creationflags=_subprocess_flags(),
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
            return jsonify({"ok": False, "error": f"安装 Electron 依赖失败：{exc}"}), 500
        if install.returncode != 0:
            detail = (install.stderr or install.stdout or "")[-800:]
            return jsonify({"ok": False, "error": f"安装 Electron 依赖失败：{detail}"}), 500
    try:
        _business_sprite_proc = subprocess.Popen(
            ["npm", "run", "sprite"],
            cwd=str(TOOLS_DESKTOP_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=(sys.platform == "win32"),
            creationflags=_subprocess_flags(),
        )
    except (FileNotFoundError, OSError) as exc:
        return jsonify({"ok": False, "error": f"启动失败：{exc}"}), 500
    time.sleep(0.8)
    if _business_sprite_proc.poll() is not None:
        return jsonify({"ok": False, "error": "桌面精灵启动后立即退出，请检查 Electron 依赖"}), 500
    return jsonify({"ok": True, "status": "started"})


@app.route("/api/auto-qa/requirements")
def auto_qa_requirements():
    """业务自动化长期需求文档（Markdown）。"""
    path = ROOT / "workbench" / "docs" / "业务自动化需求.md"
    if not path.is_file():
        return jsonify({"error": "需求文档不存在", "path": str(path)}), 404
    text = path.read_text(encoding="utf-8")
    skill = ROOT / "workbench" / "skills" / "game-biz-sprite" / "SKILL.md"
    return jsonify({
        "ok": True,
        "title": "业务自动化 · 长期需求文档",
        "markdown": text,
        "path": str(path.relative_to(ROOT)),
        "skillPath": str(skill.relative_to(ROOT)) if skill.is_file() else None,
        "updatedAt": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
    })


@app.route("/api/auto-control/health", methods=["GET"])
def auto_control_health():
    return jsonify(_load_auto_control().health())


@app.route("/api/auto-control/settings", methods=["GET"])
def auto_control_settings_get():
    return jsonify(_load_auto_control().get_settings())


@app.route("/api/auto-control/settings", methods=["PUT", "POST"])
def auto_control_settings_put():
    auto_control = _load_auto_control()
    body = request.json or {}
    if "apifoxToken" in body:
        out = auto_control.save_apifox_token(str(body.get("apifoxToken") or ""))
        return jsonify(out), (200 if out.get("ok") else 400)
    if any(
        k in body
        for k in (
            "webhookUrl",
            "webhookSecret",
            "webhookKeyword",
            "notifyFailed",
            "notifyStub",
            "notifyPassed",
            "dedupeMinutes",
            "oaUseChildSession",
        )
    ):
        out = auto_control.save_panel_settings(body)
        return jsonify(out), (200 if out.get("ok") else 400)
    return jsonify({"ok": False, "error": "请传 apifoxToken 或 webhook 相关字段"}), 400


@app.route("/api/auto-control/child-session", methods=["GET"])
def auto_control_child_session_get():
    """桌面分身是否已连接（OA 图形自动化进分身用）。"""
    return jsonify(_load_auto_control().get_child_session_info())


@app.route("/api/auto-control/child-session/start", methods=["POST"])
def auto_control_child_session_start():
    """打开工作台自带的桌面分身窗口（不依赖 BetterGI）。"""
    out = _load_auto_control().start_child_session_host()
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/child-session/stop", methods=["POST"])
def auto_control_child_session_stop():
    """关闭工作台开的桌面分身窗口。"""
    out = _load_auto_control().stop_child_session_host()
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/webhook", methods=["PUT", "POST"])
def auto_control_webhook_put():
    """单独保存 Webhook，与 Apifox Token 互不影响。"""
    out = _load_auto_control().save_panel_settings(request.json or {})
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/webhook/test", methods=["POST"])
def auto_control_webhook_test():
    """测试推送一条到钉钉/企微/飞书。"""
    body = request.json or {}
    out = _load_auto_control().test_webhook(str(body.get("message") or ""))
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/schedule", methods=["GET"])
def auto_control_schedule_get():
    return jsonify(_load_auto_control().schedule_payload())


@app.route("/api/auto-control/schedule", methods=["PUT", "POST"])
def auto_control_schedule_put():
    out = _load_auto_control().save_schedule(request.json or {})
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/overview", methods=["GET"])
def auto_control_overview():
    return jsonify(_load_auto_control().overview())


@app.route("/api/auto-control/hotspots", methods=["GET"])
def auto_control_hotspots():
    auto_control = _load_auto_control()
    days = int(request.args.get("days") or 7)
    limit = int(request.args.get("limit") or 10)
    return jsonify(auto_control.compute_hotspots(days=days, limit=limit))


@app.route("/api/auto-control/pipelines", methods=["GET"])
def auto_control_pipelines():
    auto_control = _load_auto_control()
    return jsonify({"ok": True, "pipelines": auto_control.list_pipelines()})


@app.route("/api/auto-control/runs", methods=["GET"])
def auto_control_runs_list():
    auto_control = _load_auto_control()
    return jsonify(
        auto_control.list_runs(
            status=request.args.get("status") or "",
            q=request.args.get("q") or "",
            day=request.args.get("day") or "",
            step_id=request.args.get("stepId") or "",
            stop_reason=request.args.get("stopReason") or "",
            exclude_stop_reason=request.args.get("excludeStopReason") or "",
            limit=int(request.args.get("limit") or 50),
            offset=int(request.args.get("offset") or 0),
        )
    )


@app.route("/api/auto-control/runs", methods=["POST"])
def auto_control_runs_create():
    try:
        auto_control = _load_auto_control()
        body = request.json or {}
        out = auto_control.enqueue_run(
            profile=str(body.get("profile") or "A"),
            target=str(body.get("target") or "lx"),
            pipeline_id=str(body.get("pipelineId") or auto_control.PIPELINE_ID),
            options=body.get("options") if isinstance(body.get("options"), dict) else {},
            source=str(body.get("source") or "manual"),
        )
        code = 200 if out.get("ok") else 400
        return jsonify(out), code
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": f"入队异常: {exc}"}), 500


@app.route("/api/auto-control/runs/<run_id>", methods=["GET"])
def auto_control_run_get(run_id):
    auto_control = _load_auto_control()
    run = auto_control.get_run(run_id)
    if not run:
        return jsonify({"ok": False, "error": "运行不存在"}), 404
    run["evidence"] = auto_control.inspect_evidence_pack(run_id)
    tail = auto_control.log_tail(run_id, lines=int(request.args.get("lines") or 200))
    return jsonify({"ok": True, "run": run, "logTail": tail.get("lines") or [], "logPath": tail.get("path") or ""})


@app.route("/api/auto-control/runs/<run_id>/ticket", methods=["POST"])
def auto_control_run_ticket(run_id):
    auto_control = _load_auto_control()
    body = request.json or {}
    out = auto_control.create_ticket(
        run_id,
        system=str(body.get("system") or "product"),
        dry_run=bool(body.get("dryRun")),
    )
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/v1reg-evidence/<path:filename>", methods=["GET"])
def auto_control_v1reg_evidence(filename):
    """只读下载新商务业务证据 JSON（限 data/v1_regression_biz_evidence/ 下文件名）。"""
    from flask import send_from_directory
    from pathlib import Path as _Path

    name = _Path(str(filename or "")).name
    if not name or not name.endswith(".json") or ".." in name:
        return jsonify({"ok": False, "error": "非法文件名"}), 400
    root = _Path(__file__).resolve().parent.parent / "data" / "v1_regression_biz_evidence"
    fpath = root / name
    if not fpath.is_file():
        return jsonify({"ok": False, "error": "证据文件不存在"}), 404
    return send_from_directory(str(root), name, as_attachment=True)


@app.route("/api/auto-control/runs/<run_id>/cancel", methods=["POST"])
def auto_control_run_cancel(run_id):
    out = _load_auto_control().cancel_run(run_id)
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/runs/<run_id>/retry", methods=["POST"])
def auto_control_run_retry(run_id):
    """从失败步骤续跑（不重跑整链）。"""
    auto_control = _load_auto_control()
    out = auto_control.enqueue_retry_of(run_id, source="retry", bump_auto_retry=False)
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/runs/<run_id>/log", methods=["GET"])
def auto_control_run_log(run_id):
    auto_control = _load_auto_control()
    path = auto_control.RUNS_DIR / run_id / "run.log"
    if not path.is_file():
        return jsonify({"ok": False, "error": "日志不存在"}), 404
    return send_file(path, as_attachment=True, download_name=f"{run_id}.log")


@app.route("/api/auto-control/runs/<run_id>/shots/<path:rel>", methods=["GET"])
def auto_control_run_shot(run_id, rel):
    """Playwright 步骤截图（仅允许 runs/<id>/shots/ 下 png）。"""
    auto_control = _load_auto_control()
    base = (auto_control.RUNS_DIR / run_id / "shots").resolve()
    target = (base / str(rel or "")).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return jsonify({"ok": False, "error": "非法路径"}), 400
    if not target.is_file() or target.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        return jsonify({"ok": False, "error": "截图不存在"}), 404
    return send_file(target, mimetype="image/png" if target.suffix.lower() == ".png" else None)


@app.route("/api/auto-control/runs/<run_id>/traces/<path:rel>", methods=["GET"])
def auto_control_run_trace(run_id, rel):
    """Playwright Trace zip（仅允许 runs/<id>/trace/ 下）。"""
    auto_control = _load_auto_control()
    base = (auto_control.RUNS_DIR / run_id / "trace").resolve()
    target = (base / str(rel or "")).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return jsonify({"ok": False, "error": "非法路径"}), 400
    if not target.is_file() or target.suffix.lower() != ".zip":
        return jsonify({"ok": False, "error": "Trace 不存在"}), 404
    return send_file(target, as_attachment=True, download_name=target.name, mimetype="application/zip")


@app.route("/api/auto-control/runs/<run_id>/report", methods=["GET"])
def auto_control_run_report(run_id):
    auto_control = _load_auto_control()
    run = auto_control.get_run(run_id)
    if not run:
        return jsonify({"ok": False, "error": "运行不存在"}), 404
    try:
        auto_control._write_report_html(run_id)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": f"生成报告失败: {exc}"}), 500
    path = auto_control.RUNS_DIR / run_id / "report.html"
    if not path.is_file():
        return jsonify({"ok": False, "error": "报告不存在"}), 404
    return send_file(path, mimetype="text/html", as_attachment=False, download_name=f"{run_id}_report.html")


@app.route("/api/auto-control/apifox-bridge", methods=["GET"])
def auto_control_apifox_bridge_get():
    auto_control = _load_auto_control()
    path = auto_control.APIFOX_BRIDGE_FILE
    if not path.is_file():
        out = auto_control.write_apifox_bridge()
        return jsonify(out)
    try:
        vars_map = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify(
        {
            "ok": True,
            "path": str(path.relative_to(auto_control.ROOT)).replace("\\", "/"),
            "vars": vars_map,
            "cliHint": f'apifox run ... --variables "@{path}"',
        }
    )


@app.route("/api/auto-control/apifox-bridge", methods=["POST"])
def auto_control_apifox_bridge_refresh():
    body = request.json or {}
    out = _load_auto_control().write_apifox_bridge(str(body.get("runId") or "") or None)
    return jsonify(out)


@app.route("/api/auto-control/webhook/preview", methods=["GET"])
def auto_control_webhook_preview():
    run_id = str(request.args.get("runId") or "")
    return jsonify(_load_auto_control().preview_webhook_message(run_id))


@app.route("/api/auto-control/cleanup", methods=["POST"])
def auto_control_cleanup():
    body = request.json or {}
    out = _load_auto_control().cleanup_runs(
        keep_days=int(body.get("keepDays") or 14),
        keep_min=int(body.get("keepMin") or 20),
    )
    return jsonify(out)


def _data_assert_mod():
    """每次请求热加载，避免 app.py 长驻时改 YAML/逻辑不生效。"""
    import importlib
    import data_assert as data_assert_mod

    return importlib.reload(data_assert_mod)


@app.route("/api/auto-control/data-assert/overview", methods=["GET"])
def auto_control_data_assert_overview():
    data_assert_mod = _data_assert_mod()
    return jsonify(data_assert_mod.overview())


@app.route("/api/auto-control/data-assert/scenes/<scene_id>", methods=["GET"])
def auto_control_data_assert_scene(scene_id):
    data_assert_mod = _data_assert_mod()
    scene = data_assert_mod.load_scene(scene_id)
    if not scene:
        return jsonify({"ok": False, "error": "场景不存在"}), 404
    return jsonify({"ok": True, "scene": scene, "metrics": data_assert_mod.list_metrics(scene_id)})


@app.route("/api/auto-control/data-assert/metrics/<metric_id>", methods=["GET"])
def auto_control_data_assert_metric(metric_id):
    data_assert_mod = _data_assert_mod()
    use_fixture = str(request.args.get("fixture") or "1") != "0"
    out = data_assert_mod.metric_detail(metric_id, use_fixture=use_fixture)
    return jsonify(out), (200 if out.get("ok") else 404)


@app.route("/api/auto-control/data-assert/metrics/<metric_id>/assert", methods=["POST"])
def auto_control_data_assert_run(metric_id):
    data_assert_mod = _data_assert_mod()
    body = request.json or {}
    use_fixture = body.get("fixture", True)
    if isinstance(use_fixture, str):
        use_fixture = use_fixture not in ("0", "false", "False")
    out = data_assert_mod.run_assert(metric_id, use_fixture=bool(use_fixture))
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/data-assert/scenes/<scene_id>/assert", methods=["POST"])
def auto_control_data_assert_run_scene(scene_id):
    data_assert_mod = _data_assert_mod()
    body = request.json or {}
    use_fixture = body.get("fixture", True)
    if isinstance(use_fixture, str):
        use_fixture = use_fixture not in ("0", "false", "False")
    out = data_assert_mod.run_assert_scene(scene_id, use_fixture=bool(use_fixture))
    return jsonify(out), (200 if out.get("ok") else 404)


@app.route("/api/auto-control/data-assert/asset", methods=["GET"])
def auto_control_data_assert_asset():
    data_assert_mod = _data_assert_mod()

    rel = str(request.args.get("path") or "")
    path = data_assert_mod.resolve_asset(rel)
    if not path and rel and not rel.startswith("scenes/"):
        # 允许场景相对路径：prototypes/xxx.png
        scene = str(request.args.get("scene") or "liushui_verify")
        path = data_assert_mod.resolve_asset(f"scenes/{scene}/{rel}")
    if not path or not path.is_file():
        return jsonify({"ok": False, "error": "文件不存在"}), 404
    return send_file(path)


@app.route("/api/auto-control/batch-retry", methods=["POST"])
def auto_control_batch_retry():
    body = request.json or {}
    out = _load_auto_control().batch_retry_failed(limit=int(body.get("limit") or 20))
    return jsonify(out), (200 if out.get("ok") else 400)


@app.route("/api/auto-control/recover", methods=["POST"])
def auto_control_recover():
    out = _load_auto_control().recover_on_startup()
    return jsonify(out)


@app.route("/api/biz-flow/plans", methods=["GET"])
def biz_flow_plans():
    import biz_flow

    plans = biz_flow.load_plans()
    plan = biz_flow.get_plan(request.args.get("id"))
    return jsonify({"ok": True, "plans": plans, "plan": plan})


@app.route("/api/biz-role/catalog", methods=["GET"])
def biz_role_catalog():
    """角色台底稿：角色分框 + 系统/账号 + 对照主流程步骤。"""
    import biz_role

    view = biz_role.build_view(request.args.get("target"))
    return jsonify(view)


@app.route("/api/seed-script/catalog", methods=["GET"])
def seed_script_catalog():
    import seed_script

    return jsonify(seed_script.catalog())


@app.route("/api/seed-script/run", methods=["POST"])
def seed_script_run():
    import seed_script

    body = request.json or {}
    result = seed_script.run_action(str(body.get("actionId") or ""), body.get("params") if isinstance(body.get("params"), dict) else body)
    if result.get("needSms"):
        return jsonify(result), 200
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/seed-script/http-log", methods=["GET"])
def seed_script_http_log():
    import seed_script

    return jsonify(seed_script.get_http_log(str(request.args.get("actionId") or "")))


@app.route("/api/game-sdk/access-key", methods=["GET"])
def api_game_sdk_access_key():
    """按 game_id 查 tab_game_set.access_key，供 Apifox 前置脚本自动验签。"""
    from game_sdk_api import resolve_access_key, resolve_game_meta

    game_id = (request.args.get("game_id") or "").strip()
    source_db = (request.args.get("source_db") or "lx").strip() or "lx"
    if not game_id:
        return jsonify({"ok": False, "error": "缺少 game_id"}), 400
    meta = resolve_game_meta(game_id, source_db=source_db)
    key = resolve_access_key(game_id, source_db=source_db)
    if not key:
        return jsonify({
            "ok": False,
            "error": f"未找到 game_id={game_id} 的 access_key（source_db={source_db}）",
            "gameId": game_id,
            "gameAppId": meta.get("gameAppId") or "",
            "gameName": meta.get("gameName") or "",
        }), 404
    return jsonify({
        "ok": True,
        "gameId": str(game_id),
        "accessKey": key,
        "gameAppId": meta.get("gameAppId") or "",
        "gameName": meta.get("gameName") or "",
        "sourceDb": source_db,
    })


@app.route("/api/seed-script/db", methods=["POST"])
def seed_script_db():
    import seed_script

    body = request.json or {}
    action = str(body.get("action") or "query").strip().lower()
    kind = str(body.get("kind") or "")
    account = str(body.get("account") or "")
    source_db = str(body.get("sourceDb") or body.get("target") or "lx")
    database = str(body.get("database") or "")
    if action == "update":
        result = seed_script.update_times(
            kind,
            account,
            str(body.get("field") or ""),
            str(body.get("value") or ""),
            source_db=source_db,
            database=database,
            confirm=bool(body.get("confirm") or body.get("confirmSyncRegister")),
        )
    else:
        result = seed_script.query_times(kind, account, source_db=source_db, database=database)
    return jsonify(result), (200 if result.get("ok") or result.get("needConfirm") else 400)


@app.route("/api/biz-flow/meta", methods=["GET"])
def biz_flow_meta_get():
    """主流程台左侧：可展示/修改的测试数据（含商务 deviceId）。"""
    import biz_flow
    from biz_web_api import DEFAULT_DEVICE_ID, load_biz_web_config
    from channel_web_api import load_channel_web_config
    from oa_promote_api import load_oa_promote_config

    plan = biz_flow.get_plan()
    biz_cfg = load_biz_web_config()
    ch_cfg = load_channel_web_config()
    oa_cfg = load_oa_promote_config()
    defaults = biz_cfg.get("createDefaults") if isinstance(biz_cfg.get("createDefaults"), dict) else {}
    profile = ch_cfg.get("profileDefaults") if isinstance(ch_cfg.get("profileDefaults"), dict) else {}
    return jsonify({
        "ok": True,
        "plan": {
            "id": (plan or {}).get("id"),
            "name": (plan or {}).get("name"),
            "defaultTarget": (plan or {}).get("defaultTarget"),
            "defaultMode": (plan or {}).get("defaultMode"),
            "urls": (plan or {}).get("urls") or {},
        },
        "fields": {
            "deviceId": biz_cfg.get("deviceId") or DEFAULT_DEVICE_ID,
            "bizWebBaseUrl": biz_cfg.get("baseUrl") or "http://dev.example.com",
            "oaBaseUrl": oa_cfg.get("baseUrl") or "http://oa.example.com",
            "oaUser": oa_cfg.get("username") or "",
            "oaPassword": oa_cfg.get("password") or "",
            "businessPrefix": (oa_cfg.get("createDefaults") or {}).get("accountPrefix") or "商务L1",
            "businessPassword": (oa_cfg.get("createDefaults") or {}).get("password") or "111111",
            "presidentPrefix": defaults.get("accountPrefix") or "会长L1",
            "presidentPassword": defaults.get("password") or "111111",
            "channelDeviceId": ch_cfg.get("deviceId") or "",
            "channelNewPassword": ch_cfg.get("newPassword") or "CHANGE_ME",
            "idCardFront": ch_cfg.get("idCardFront") or "",
            "idCardBack": ch_cfg.get("idCardBack") or "",
            "profileMobile": profile.get("mobile_phone") or "",
            "profileRealName": profile.get("real_name") or "",
            "profileIdCardNo": profile.get("id_card_no") or "",
            "gameId": str(ch_cfg.get("gameId") or "659"),
        },
        "hints": {
            "deviceId": "商务登录设备码；固定后可降低短信验证码触发",
            "bizWebBaseUrl": "商务网页根地址",
            "oaBaseUrl": "OA 接口根地址",
            "oaUser": "OA 登录账号",
            "oaPassword": "OA 登录密码（测试环境可改）",
            "businessPrefix": "一级渠道商务账号前缀（创建时自动加序号）",
            "businessPassword": "一级渠道商务默认密码",
            "presidentPrefix": "新增会长：游趣会长自动 / 龙翔会长自动（序号接在后缀，如游趣会长自动1）",
            "presidentPassword": "一级会长默认密码（F2 创建）",
            "channelDeviceId": "会长端登录设备码",
            "channelNewPassword": "F3-2 会长改密后的新密码",
            "idCardFront": "固定证件正面路径（跳过上传/OCR）",
            "idCardBack": "固定证件背面路径（跳过上传/OCR）",
            "profileMobile": "完善信息手机号（会发短信，弹窗手填验证码）",
            "profileRealName": "完善信息实名",
            "profileIdCardNo": "完善信息身份证号",
            "gameId": "F5 申请游戏 ID（HAR 样例 659）",
        },
    })


@app.route("/api/biz-flow/meta", methods=["PUT", "POST"])
def biz_flow_meta_put():
    from biz_web_api import save_biz_web_config
    from channel_web_api import save_channel_web_config
    from oa_promote_api import save_oa_promote_config

    body = request.json or {}
    fields = body.get("fields") if isinstance(body.get("fields"), dict) else body
    updates = {}
    if fields.get("deviceId") is not None:
        updates["deviceId"] = fields.get("deviceId")
    if fields.get("bizWebBaseUrl") is not None:
        updates["baseUrl"] = fields.get("bizWebBaseUrl")
        updates["origin"] = str(fields.get("bizWebBaseUrl") or "").rstrip("/")
    create_defaults = {}
    if fields.get("presidentPrefix") is not None:
        create_defaults["accountPrefix"] = fields.get("presidentPrefix")
    if fields.get("presidentPassword") is not None:
        create_defaults["password"] = fields.get("presidentPassword")
    if create_defaults:
        updates["createDefaults"] = create_defaults
    cfg = save_biz_web_config(updates)

    oa_updates = {}
    if fields.get("oaUser") is not None:
        oa_updates["username"] = fields.get("oaUser")
    if fields.get("oaPassword") is not None:
        oa_updates["password"] = fields.get("oaPassword")
    if fields.get("oaBaseUrl") is not None:
        oa_updates["baseUrl"] = fields.get("oaBaseUrl")
    oa_defaults = {}
    if fields.get("businessPrefix") is not None:
        oa_defaults["accountPrefix"] = fields.get("businessPrefix")
    if fields.get("businessPassword") is not None:
        oa_defaults["password"] = fields.get("businessPassword")
    if oa_defaults:
        oa_updates["createDefaults"] = oa_defaults
    oa_cfg = save_oa_promote_config(oa_updates) if oa_updates else None

    ch_updates = {}
    if fields.get("channelDeviceId") is not None:
        ch_updates["deviceId"] = fields.get("channelDeviceId")
    if fields.get("channelNewPassword") is not None:
        ch_updates["newPassword"] = fields.get("channelNewPassword")
    if fields.get("idCardFront") is not None:
        ch_updates["idCardFront"] = fields.get("idCardFront")
    if fields.get("idCardBack") is not None:
        ch_updates["idCardBack"] = fields.get("idCardBack")
    if fields.get("gameId") is not None:
        ch_updates["gameId"] = fields.get("gameId")
    profile = {}
    if fields.get("profileMobile") is not None:
        profile["mobile_phone"] = fields.get("profileMobile")
        profile["alipay_account"] = fields.get("profileMobile")
    if fields.get("profileRealName") is not None:
        profile["real_name"] = fields.get("profileRealName")
        profile["alipay_name"] = fields.get("profileRealName")
    if fields.get("profileIdCardNo") is not None:
        profile["id_card_no"] = fields.get("profileIdCardNo")
    if profile:
        ch_updates["profileDefaults"] = profile
    ch_cfg = save_channel_web_config(ch_updates) if ch_updates else None

    return jsonify({"ok": True, "bizWeb": {
        "deviceId": cfg.get("deviceId"),
        "baseUrl": cfg.get("baseUrl"),
        "createDefaults": cfg.get("createDefaults"),
    }, "oaPromote": {
        "username": (oa_cfg or {}).get("username"),
        "baseUrl": (oa_cfg or {}).get("baseUrl"),
        "createDefaults": (oa_cfg or {}).get("createDefaults"),
    } if oa_cfg else None, "channelWeb": {
        "deviceId": (ch_cfg or {}).get("deviceId"),
        "newPassword": (ch_cfg or {}).get("newPassword"),
        "idCardFront": (ch_cfg or {}).get("idCardFront"),
        "idCardBack": (ch_cfg or {}).get("idCardBack"),
        "profileDefaults": (ch_cfg or {}).get("profileDefaults"),
    } if ch_cfg else None})


BF_ENV_VARS = {
    "oa": [
        {"key": "oaBaseUrl", "label": "baseUrl", "hint": "OA 接口根地址", "readonly": True},
        {"key": "oaUser", "label": "username", "hint": "OA 登录账号"},
        {"key": "oaPassword", "label": "password", "hint": "OA 登录密码", "secret": True},
        {"key": "businessPrefix", "label": "accountPrefix", "hint": "一级渠道商务账号前缀"},
        {"key": "businessPassword", "label": "bizPassword", "hint": "一级渠道商务默认密码", "secret": True},
    ],
    "biz": [
        {"key": "bizWebBaseUrl", "label": "baseUrl", "hint": "商务网页根地址"},
        {"key": "deviceId", "label": "deviceId", "hint": "商务登录设备码"},
        {"key": "presidentPrefix", "label": "accountPrefix", "hint": "一级会长账号前缀"},
        {"key": "presidentPassword", "label": "password", "hint": "一级会长默认密码", "secret": True},
    ],
    "channel": [
        {"key": "channelDeviceId", "label": "deviceId", "hint": "会长端登录设备码"},
        {"key": "channelNewPassword", "label": "newPassword", "hint": "会长改密后的新密码", "secret": True},
        {"key": "gameId", "label": "gameId", "hint": "申请游戏 ID（F5 / F8 共用）"},
        {"key": "profileMobile", "label": "mobile_phone", "hint": "完善信息手机号"},
        {"key": "profileRealName", "label": "real_name", "hint": "完善信息实名"},
        {"key": "profileIdCardNo", "label": "id_card_no", "hint": "完善信息身份证号"},
        {"key": "idCardFront", "label": "idCardFront", "hint": "证件正面路径"},
        {"key": "idCardBack", "label": "idCardBack", "hint": "证件背面路径"},
    ],
    "sdk": [
        {"key": "sdkBaseUrl", "label": "baseUrl", "hint": "游戏 SDK 根地址"},
        {"key": "sdkGameId", "label": "gameId", "hint": "游戏 ID"},
        {"key": "sdkAccountPrefix", "label": "accountPrefix", "hint": "玩家账号前缀"},
        {"key": "sdkPassword", "label": "password", "hint": "玩家默认密码", "secret": True},
        {"key": "sdkEquipmentNum", "label": "equipmentNum", "hint": "设备码"},
        {"key": "sdkDeviceName", "label": "deviceName", "hint": "设备名"},
        {"key": "sdkPrice", "label": "price", "hint": "下单金额"},
        {"key": "sdkRealName", "label": "real_name", "hint": "玩家实名"},
        {"key": "sdkIdcard", "label": "idcard", "hint": "玩家身份证号"},
    ],
}

BF_ENV_LIST = [
    {"id": "oa", "name": "OA 渠道", "group": "全局", "desc": "F1 / F4"},
    {"id": "biz", "name": "商务网页", "group": "全局", "desc": "F2"},
    {"id": "channel", "name": "会长端", "group": "全局", "desc": "F3 / F5"},
    {"id": "sdk", "name": "游戏 SDK", "group": "环境", "desc": "F8 注册登录 / 实名 / 下单"},
]


def _biz_flow_env_fields():
    from biz_web_api import DEFAULT_DEVICE_ID, load_biz_web_config
    from channel_web_api import load_channel_web_config
    from game_sdk_api import load_game_sdk_config
    from oa_promote_api import load_oa_promote_config

    biz_cfg = load_biz_web_config()
    ch_cfg = load_channel_web_config()
    oa_cfg = load_oa_promote_config()
    sdk_cfg = load_game_sdk_config()
    defaults = biz_cfg.get("createDefaults") if isinstance(biz_cfg.get("createDefaults"), dict) else {}
    profile = ch_cfg.get("profileDefaults") if isinstance(ch_cfg.get("profileDefaults"), dict) else {}
    real_name = sdk_cfg.get("realName") if isinstance(sdk_cfg.get("realName"), dict) else {}
    return {
        "oaBaseUrl": oa_cfg.get("baseUrl") or "http://oa.example.com",
        "oaUser": oa_cfg.get("username") or "",
        "oaPassword": oa_cfg.get("password") or "",
        "businessPrefix": (oa_cfg.get("createDefaults") or {}).get("accountPrefix") or "商务L1",
        "businessPassword": (oa_cfg.get("createDefaults") or {}).get("password") or "111111",
        "deviceId": biz_cfg.get("deviceId") or DEFAULT_DEVICE_ID,
        "bizWebBaseUrl": biz_cfg.get("baseUrl") or "http://dev.example.com",
        "presidentPrefix": defaults.get("accountPrefix") or "会长L1",
        "presidentPassword": defaults.get("password") or "111111",
        "channelDeviceId": ch_cfg.get("deviceId") or "",
        "channelNewPassword": ch_cfg.get("newPassword") or "CHANGE_ME",
        "idCardFront": ch_cfg.get("idCardFront") or "",
        "idCardBack": ch_cfg.get("idCardBack") or "",
        "profileMobile": profile.get("mobile_phone") or "",
        "profileRealName": profile.get("real_name") or "",
        "profileIdCardNo": profile.get("id_card_no") or "",
        "gameId": str(ch_cfg.get("gameId") or sdk_cfg.get("gameId") or "659"),
        "sdkBaseUrl": sdk_cfg.get("baseUrl") or "http://dev.example.com",
        "sdkGameId": str(sdk_cfg.get("gameId") or "659"),
        "sdkAccountPrefix": sdk_cfg.get("accountPrefix") or "lxautotest",
        "sdkPassword": sdk_cfg.get("password") or "123456",
        "sdkEquipmentNum": sdk_cfg.get("equipmentNum") or "",
        "sdkDeviceName": sdk_cfg.get("deviceName") or "",
        "sdkPrice": sdk_cfg.get("price") or "2.00",
        "sdkRealName": real_name.get("real_name") or "",
        "sdkIdcard": real_name.get("idcard") or "",
    }


@app.route("/api/biz-flow/env", methods=["GET"])
def biz_flow_env_get():
    fields = _biz_flow_env_fields()
    environments = []
    for item in BF_ENV_LIST:
        env_id = item["id"]
        variables = []
        for spec in BF_ENV_VARS.get(env_id, []):
            variables.append({
                **spec,
                "value": "" if fields.get(spec["key"]) is None else str(fields.get(spec["key"])),
            })
        environments.append({**item, "variables": variables})
    return jsonify({"ok": True, "environments": environments})


@app.route("/api/biz-flow/env", methods=["PUT", "POST"])
def biz_flow_env_put():
    from biz_web_api import save_biz_web_config
    from channel_web_api import save_channel_web_config
    from game_sdk_api import save_game_sdk_config
    from oa_promote_api import save_oa_promote_config

    body = request.json or {}
    env_id = str(body.get("envId") or "").strip()
    values = body.get("values") if isinstance(body.get("values"), dict) else {}
    if env_id not in BF_ENV_VARS:
        return jsonify({"ok": False, "error": "未知环境"}), 400
    allowed = {spec["key"] for spec in BF_ENV_VARS[env_id] if not spec.get("readonly")}
    fields = {k: values[k] for k in values if k in allowed}

    if env_id == "oa":
        oa_updates = {}
        if "oaUser" in fields:
            oa_updates["username"] = fields["oaUser"]
        if "oaPassword" in fields:
            oa_updates["password"] = fields["oaPassword"]
        oa_defaults = {}
        if "businessPrefix" in fields:
            oa_defaults["accountPrefix"] = fields["businessPrefix"]
        if "businessPassword" in fields:
            oa_defaults["password"] = fields["businessPassword"]
        if oa_defaults:
            oa_updates["createDefaults"] = oa_defaults
        if oa_updates:
            save_oa_promote_config(oa_updates)
    elif env_id == "biz":
        updates = {}
        if "deviceId" in fields:
            updates["deviceId"] = fields["deviceId"]
        if "bizWebBaseUrl" in fields:
            updates["baseUrl"] = fields["bizWebBaseUrl"]
            updates["origin"] = str(fields["bizWebBaseUrl"] or "").rstrip("/")
        create_defaults = {}
        if "presidentPrefix" in fields:
            create_defaults["accountPrefix"] = fields["presidentPrefix"]
        if "presidentPassword" in fields:
            create_defaults["password"] = fields["presidentPassword"]
        if create_defaults:
            updates["createDefaults"] = create_defaults
        if updates:
            save_biz_web_config(updates)
    elif env_id == "channel":
        ch_updates = {}
        if "channelDeviceId" in fields:
            ch_updates["deviceId"] = fields["channelDeviceId"]
        if "channelNewPassword" in fields:
            ch_updates["newPassword"] = fields["channelNewPassword"]
        if "idCardFront" in fields:
            ch_updates["idCardFront"] = fields["idCardFront"]
        if "idCardBack" in fields:
            ch_updates["idCardBack"] = fields["idCardBack"]
        if "gameId" in fields:
            ch_updates["gameId"] = fields["gameId"]
        profile = {}
        if "profileMobile" in fields:
            profile["mobile_phone"] = fields["profileMobile"]
            profile["alipay_account"] = fields["profileMobile"]
        if "profileRealName" in fields:
            profile["real_name"] = fields["profileRealName"]
            profile["alipay_name"] = fields["profileRealName"]
        if "profileIdCardNo" in fields:
            profile["id_card_no"] = fields["profileIdCardNo"]
        if profile:
            ch_updates["profileDefaults"] = profile
        if ch_updates:
            save_channel_web_config(ch_updates)
        if "gameId" in fields:
            save_game_sdk_config({"gameId": fields["gameId"]})
    elif env_id == "sdk":
        sdk_updates = {}
        for src, dst in (
            ("sdkBaseUrl", "baseUrl"),
            ("sdkGameId", "gameId"),
            ("sdkAccountPrefix", "accountPrefix"),
            ("sdkPassword", "password"),
            ("sdkEquipmentNum", "equipmentNum"),
            ("sdkDeviceName", "deviceName"),
            ("sdkPrice", "price"),
        ):
            if src in fields:
                sdk_updates[dst] = fields[src]
        real_name = {}
        if "sdkRealName" in fields:
            real_name["real_name"] = fields["sdkRealName"]
        if "sdkIdcard" in fields:
            real_name["idcard"] = fields["sdkIdcard"]
        if real_name:
            sdk_updates["realName"] = real_name
        if sdk_updates:
            save_game_sdk_config(sdk_updates)
        if "sdkGameId" in fields:
            save_channel_web_config({"gameId": fields["sdkGameId"]})

    return jsonify({"ok": True, "envId": env_id})


@app.route("/api/biz-flow/runs", methods=["GET"])
def biz_flow_runs_list():
    import biz_flow

    limit = min(int(request.args.get("limit") or 30), 100)
    runs = biz_flow.list_runs(limit)
    return jsonify({"ok": True, "runs": runs})


@app.route("/api/biz-flow/runs", methods=["POST"])
def biz_flow_runs_create():
    import biz_flow

    body = request.json or {}
    try:
        run = biz_flow.create_run(
            plan_id=body.get("planId"),
            mode=str(body.get("mode") or "silent"),
            target=str(body.get("target") or "lx"),
            note=str(body.get("note") or ""),
        )
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({"ok": True, "run": run})


@app.route("/api/biz-flow/runs/<run_id>", methods=["GET"])
def biz_flow_run_get(run_id):
    import biz_flow

    run = biz_flow.get_run(run_id)
    if not run:
        return jsonify({"ok": False, "error": "运行不存在"}), 404
    arts = biz_flow.query_artifacts(run_id=run_id)
    return jsonify({"ok": True, "run": run, "artifacts": arts})


@app.route("/api/biz-flow/runs/<run_id>/steps/<step_id>", methods=["PATCH", "POST"])
def biz_flow_run_step_update(run_id, step_id):
    import biz_flow

    body = request.json or {}
    try:
        run = biz_flow.update_step(
            run_id,
            step_id,
            status=body.get("status"),
            detail=body.get("detail"),
            error=body.get("error"),
        )
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    return jsonify({"ok": True, "run": run})


@app.route("/api/biz-flow/runs/<run_id>/execute/<step_id>", methods=["POST"])
def biz_flow_run_execute_step(run_id, step_id):
    """自动执行步骤（F1 OA / F2 商务 / F3 会长）。支持 body.smsCode；未传时可用测试万能码。"""
    import biz_flow
    from channel_web_api import get_universal_sms_code

    body = request.json or {}
    sms_code = str(body.get("smsCode") or body.get("sms_code") or "").strip()
    try:
        result = biz_flow.execute_step(
            run_id,
            step_id,
            mode=body.get("mode"),
            sms_code=sms_code,
            extras=body,
        )
        # 需要短信且未手填：自动用测试万能码再跑一次，免看手机
        if result.get("needSms") and not sms_code:
            uni = get_universal_sms_code()
            if uni:
                result = biz_flow.execute_step(
                    run_id,
                    step_id,
                    mode=body.get("mode"),
                    sms_code=uni,
                    extras={**body, "smsCode": uni},
                )
                result = dict(result or {})
                result["usedUniversalSms"] = uni
                if result.get("ok"):
                    result["smsNote"] = f"已自动使用测试万能验证码 {uni}"
                elif result.get("needSms"):
                    result["smsNote"] = f"万能码 {uni} 未生效，仍需手填短信"
                else:
                    result["smsNote"] = f"已尝试万能码 {uni}，步骤未通过"
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500

    # 剥掉内部 urllib opener 等不可 JSON 序列化对象，避免 500 HTML 把前端炸成 Unexpected token '<'
    def _strip_unserializable(obj):
        if isinstance(obj, dict):
            return {
                k: _strip_unserializable(v)
                for k, v in obj.items()
                if k != "_opener" and not type(v).__name__.endswith("OpenerDirector")
            }
        if isinstance(obj, list):
            return [_strip_unserializable(x) for x in obj]
        return obj

    result = _strip_unserializable(result if isinstance(result, dict) else {"ok": False, "error": "空结果"})
    # needSms 用 200，方便前端弹窗后续续跑，不当成硬失败
    if result.get("needSms"):
        return jsonify(result), 200
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/biz-flow/oa/login-test", methods=["POST", "GET"])
def biz_flow_oa_login_test():
    """探测 OA 登录是否可用（不创建账号）。"""
    from oa_promote_api import oa_login

    result = oa_login()
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/biz-flow/artifacts", methods=["GET"])
def biz_flow_artifacts_list():
    import biz_flow

    items = biz_flow.query_artifacts(
        q=str(request.args.get("q") or ""),
        run_id=str(request.args.get("runId") or ""),
        target=str(request.args.get("target") or ""),
    )
    return jsonify({"ok": True, "items": items, "tsv": biz_flow.artifacts_tsv(items)})


@app.route("/api/biz-flow/artifacts", methods=["POST"])
def biz_flow_artifacts_create():
    import biz_flow

    body = request.json or {}
    if not str(body.get("account") or body.get("role") or "").strip():
        return jsonify({"ok": False, "error": "至少填写账号或角色"}), 400
    item = biz_flow.add_artifact(body)
    return jsonify({"ok": True, "item": item})


AI_STORY_DIR = INTEGRATED_DIR / "ai_story"
AI_STORY_URL = os.environ.get("AI_STORY_URL", "http://127.0.0.1:3000").rstrip("/")


def _ai_story_probe(timeout=2.0) -> dict:
    try:
        req = Request(AI_STORY_URL + "/", method="GET")
        with urlopen(req, timeout=timeout) as resp:
            code = getattr(resp, "status", None) or resp.getcode()
            return {"ok": 200 <= int(code) < 500, "statusCode": int(code)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}


@app.route("/api/ai-story/status")
def ai_story_status():
    probe = _ai_story_probe()
    compose = AI_STORY_DIR / "docker-compose.yml"
    start_bat = AI_STORY_DIR / "start.bat"
    return jsonify({
        "ok": True,
        "running": bool(probe.get("ok")),
        "url": AI_STORY_URL,
        "probe": probe,
        "composeExists": compose.is_file(),
        "startBat": str(start_bat.relative_to(ROOT)).replace("\\", "/") if start_bat.is_file() else "",
        "dir": str(AI_STORY_DIR.relative_to(ROOT)).replace("\\", "/"),
        "upstream": "https://github.com/xhongc/ai_story",
        "license": "CC BY-NC-SA 4.0（仅个人/非商业）",
    })


@app.route("/api/ai-story/start", methods=["POST"])
def ai_story_start():
    start_bat = AI_STORY_DIR / "start.bat"
    if not start_bat.is_file():
        return jsonify({"ok": False, "error": "未找到 start.bat"}), 404
    try:
        subprocess.Popen(
            ["cmd", "/c", "start", "", str(start_bat)],
            cwd=str(AI_STORY_DIR),
            creationflags=_subprocess_flags(),
        )
        return jsonify({"ok": True, "message": "已启动 start.bat，请等待 Docker 拉起服务"})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/ai-story/whitebox-previz/save", methods=["POST"])
def ai_story_whitebox_previz_save():
    """保存白模预演 WebM + JSON 到 AI Story storage（V5b）。"""
    out_dir = AI_STORY_DIR / "storage" / "video" / "whitebox_previz"
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return jsonify({"ok": False, "error": f"无法创建目录: {exc}"}), 500

    video = request.files.get("video")
    meta = request.files.get("meta")
    shot_id = (request.form.get("shotId") or "shot").strip() or "shot"
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in shot_id)[:64]
    stamp = time.strftime("%Y%m%d_%H%M%S")
    base = f"{safe}_{stamp}"

    video_rel = ""
    meta_rel = ""
    try:
        if video and video.filename:
            ext = Path(video.filename).suffix.lower() or ".webm"
            if ext not in (".webm", ".mp4", ".mov"):
                ext = ".webm"
            vpath = out_dir / f"{base}{ext}"
            video.save(str(vpath))
            video_rel = str(vpath.relative_to(ROOT)).replace("\\", "/")
        if meta and meta.filename:
            mpath = out_dir / f"{base}.json"
            meta.save(str(mpath))
            meta_rel = str(mpath.relative_to(ROOT)).replace("\\", "/")
        if not video_rel and not meta_rel:
            return jsonify({"ok": False, "error": "未收到 video/meta 文件"}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:300]}), 500

    return jsonify({
        "ok": True,
        "dir": str(out_dir.relative_to(ROOT)).replace("\\", "/"),
        "videoRel": video_rel,
        "metaRel": meta_rel,
    })


def _relax_games_pygame_ok() -> bool:
    try:
        import pygame  # noqa: F401
        return True
    except ImportError:
        return False


def _relax_games_install_pygame() -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pip", "install", "pygame>=2.5.0", "-q"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            creationflags=_subprocess_flags(),
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return False, f"安装 pygame 失败：{exc}"
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "")[-400:]
        return False, f"安装 pygame 失败：{detail}"
    return _relax_games_pygame_ok(), ""


@app.route("/api/relax-games/status")
def relax_games_status():
    run_py = RELAX_GAMES_DIR / "run.py"
    start_bat = RELAX_GAMES_DIR / "start.bat"
    modes = []
    for item in RELAX_GAME_MODES:
        script = RELAX_GAMES_DIR / item["script"]
        modes.append({
            "id": item["id"],
            "name": item["name"],
            "ready": script.is_file(),
        })
    return jsonify({
        "ok": True,
        "dir": str(RELAX_GAMES_DIR.relative_to(ROOT)).replace("\\", "/"),
        "runScript": str(run_py.relative_to(ROOT)).replace("\\", "/") if run_py.is_file() else "",
        "startBat": str(start_bat.relative_to(ROOT)).replace("\\", "/") if start_bat.is_file() else "",
        "pygameInstalled": _relax_games_pygame_ok(),
        "modes": modes,
    })


@app.route("/api/relax-games/install", methods=["POST"])
def relax_games_install():
    if _relax_games_pygame_ok():
        return jsonify({"ok": True, "message": "pygame 已安装"})
    ok, err = _relax_games_install_pygame()
    if not ok:
        return jsonify({"ok": False, "error": err or "安装 pygame 失败"}), 500
    return jsonify({"ok": True, "message": "pygame 安装完成"})


@app.route("/api/relax-games/launch", methods=["POST"])
def relax_games_launch():
    data = request.json or {}
    mode_id = str(data.get("mode") or "launcher").strip() or "launcher"
    mode = next((m for m in RELAX_GAME_MODES if m["id"] == mode_id), None)
    if not mode:
        return jsonify({"ok": False, "error": "未知游戏模式"}), 400
    script = RELAX_GAMES_DIR / mode["script"]
    if not script.is_file():
        return jsonify({"ok": False, "error": f"未找到脚本：{mode['script']}"}), 404
    cwd = RELAX_GAMES_DIR / mode["cwd"]
    if not _relax_games_pygame_ok():
        return jsonify({
            "ok": False,
            "error": "未安装 pygame，请点「安装依赖」或运行 integrated/relax-games/start.bat",
            "needPygame": True,
        }), 400
    try:
        if sys.platform == "win32":
            start_bat = RELAX_GAMES_DIR / "start.bat"
            if mode_id == "launcher" and start_bat.is_file():
                subprocess.Popen(
                    ["cmd", "/c", "start", "", str(start_bat)],
                    cwd=str(RELAX_GAMES_DIR),
                )
            else:
                subprocess.Popen(
                    ["cmd", "/c", "start", "", sys.executable, str(script)],
                    cwd=str(cwd if cwd.is_dir() else script.parent),
                )
        else:
            subprocess.Popen([sys.executable, str(script)], cwd=str(cwd if cwd.is_dir() else script.parent))
    except OSError as exc:
        return jsonify({"ok": False, "error": f"启动失败：{exc}"}), 500
    return jsonify({"ok": True, "message": f"已启动：{mode['name']}"})


@app.route("/api/reports/generate", methods=["POST"])
def generate_report():
    data = request.json or {}
    template_id = data.get("template_id", "test_report")
    fields = data.get("fields", {})
    templates = load_json("report-templates")
    tpl = templates.get(template_id)
    if not tpl:
        return jsonify({"error": "模板不存在"}), 404
    content = tpl["template"]
    for key, val in fields.items():
        content = content.replace("{{" + key + "}}", str(val))
    content = content.replace("{{date}}", datetime.now().strftime("%Y-%m-%d"))
    return jsonify({"content": content, "name": tpl["name"]})


@app.route("/api/wallpaper/status")
def api_wallpaper_status():
    return jsonify(wallpaper_service.status())


@app.route("/api/wallpaper/config", methods=["GET"])
def api_wallpaper_config_get():
    return jsonify({"ok": True, "config": wallpaper_service.load_config()})


@app.route("/api/wallpaper/config", methods=["PUT"])
def api_wallpaper_config_put():
    data = request.json or {}
    cfg = wallpaper_service.save_config(data)
    return jsonify({"ok": True, "config": cfg})


@app.route("/api/wallpaper/images")
def api_wallpaper_images():
    folder = request.args.get("folder")
    items = wallpaper_service.list_images(folder)
    return jsonify({"ok": True, "items": items, "count": len(items)})


@app.route("/api/wallpaper/file")
def api_wallpaper_file():
    path = request.args.get("path", "")
    img = wallpaper_service.resolve_image(path)
    if not img:
        return jsonify({"ok": False, "error": "文件不存在或不在壁纸目录内"}), 404
    return send_file(img, conditional=True)


@app.route("/api/wallpaper/set", methods=["POST"])
def api_wallpaper_set():
    data = request.json or {}
    path = data.get("path") or ""
    targets = data.get("targets") or ["desktop"]
    style = data.get("style")
    result = wallpaper_service.apply_wallpaper(path, targets=targets, style=style)
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/wallpaper/random", methods=["POST"])
def api_wallpaper_random():
    data = request.json or {}
    quiet = data.get("quiet", True)
    result = wallpaper_service.run_random_script(quiet=bool(quiet))
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/wallpaper/lock-sync", methods=["POST"])
def api_wallpaper_lock_sync():
    """加入 / 移出「锁屏同步」目录。body: { path, action: add|remove }"""
    data = request.json or {}
    path = data.get("path") or ""
    action = str(data.get("action") or "add").strip().lower()
    if action == "remove":
        result = wallpaper_service.remove_from_lock_sync(path)
    else:
        result = wallpaper_service.add_to_lock_sync(path)
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/wallpaper/diagnose")
def api_wallpaper_diagnose():
    return jsonify(wallpaper_service.diagnose_interference())


@app.route("/api/wallpaper/disable-360", methods=["POST"])
def api_wallpaper_disable_360():
    return jsonify(wallpaper_service.disable_360_huabao())


@app.route("/clipboard-popup")
def clipboard_popup_page():
    return render_template("clipboard_popup.html")


@app.route("/api/clipboard/status")
def api_clipboard_status():
    return jsonify(clipboard_service.status())


@app.route("/api/clipboard/config", methods=["GET"])
def api_clipboard_config_get():
    return jsonify({"ok": True, "config": clipboard_service.load_config()})


@app.route("/api/clipboard/config", methods=["PUT"])
def api_clipboard_config_put():
    data = request.json or {}
    try:
        result = clipboard_service.apply_config(data)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/clipboard/items")
def api_clipboard_items():
    q = request.args.get("q") or ""
    limit = request.args.get("limit")
    try:
        lim = int(limit) if limit not in (None, "") else None
    except ValueError:
        lim = None
    items = clipboard_service.list_items(limit=lim, q=q)
    return jsonify({"ok": True, "items": items, "count": len(items)})


@app.route("/api/clipboard/accounts")
def api_clipboard_accounts():
    q = request.args.get("q") or ""
    return jsonify(clipboard_service.list_account_entries(q=q))


@app.route("/api/clipboard/copy-text", methods=["POST"])
def api_clipboard_copy_text():
    data = request.json or {}
    text = data.get("text")
    if text is None:
        text = ""
    result = clipboard_service.copy_plain_text(str(text))
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/clipboard/items/<item_id>", methods=["DELETE"])
def api_clipboard_delete(item_id):
    ok = clipboard_service.delete_item(item_id)
    return jsonify({"ok": ok, "error": "" if ok else "记录不存在"}), (200 if ok else 404)


@app.route("/api/clipboard/clear", methods=["POST"])
def api_clipboard_clear():
    n = clipboard_service.clear_all()
    return jsonify({"ok": True, "cleared": n})


@app.route("/api/clipboard/restore", methods=["POST"])
def api_clipboard_restore():
    data = request.json or {}
    item_id = (data.get("id") or "").strip()
    result = clipboard_service.restore_item(item_id)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/clipboard/file")
def api_clipboard_file():
    rel = request.args.get("path") or ""
    path = clipboard_service.resolve_store_file(rel)
    if not path:
        return jsonify({"ok": False, "error": "文件不存在"}), 404
    return send_file(path, conditional=True)


@app.route("/api/clipboard/popup", methods=["POST"])
def api_clipboard_popup():
    return jsonify(clipboard_service.open_popup(PORT))


@app.route("/api/clipboard/start", methods=["POST"])
def api_clipboard_start():
    return jsonify(clipboard_service.start())


@app.route("/api/timelapse/status")
def api_timelapse_status():
    return jsonify(timelapse_service.status())


@app.route("/api/timelapse/config", methods=["GET"])
def api_timelapse_config_get():
    return jsonify({"ok": True, "config": timelapse_service.load_config()})


@app.route("/api/timelapse/config", methods=["PUT"])
def api_timelapse_config_put():
    data = request.json or {}
    try:
        return jsonify(timelapse_service.apply_config(data))
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/timelapse/probe", methods=["POST"])
def api_timelapse_probe():
    data = request.json or {}
    base = (data.get("base_url") or "").strip() or None
    return jsonify(timelapse_service.camera_status(base))


@app.route("/api/timelapse/ensure-stream", methods=["POST"])
def api_timelapse_ensure_stream():
    data = request.json or {}
    base = (data.get("base_url") or "").strip() or None
    result = timelapse_service.ensure_stream(base)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/timelapse/preview", methods=["POST"])
def api_timelapse_preview():
    data = request.json or {}
    base = (data.get("base_url") or "").strip() or None
    ensure = data.get("ensure", True)
    result = timelapse_service.preview_frame(base, ensure=bool(ensure))
    # 不把 jpeg 字节塞进 JSON
    if "jpeg" in result:
        result = {k: v for k, v in result.items() if k != "jpeg"}
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/timelapse/start", methods=["POST"])
def api_timelapse_start():
    data = request.json or {}
    result = timelapse_service.start_job(data if isinstance(data, dict) else None)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/timelapse/stop", methods=["POST"])
def api_timelapse_stop():
    result = timelapse_service.stop_job()
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/timelapse/jobs")
def api_timelapse_jobs():
    limit = request.args.get("limit")
    try:
        lim = int(limit) if limit not in (None, "") else 50
    except ValueError:
        lim = 50
    items = timelapse_service.list_jobs(limit=lim)
    return jsonify({"ok": True, "items": items, "count": len(items)})


@app.route("/api/timelapse/jobs/<job_id>/compose", methods=["POST"])
def api_timelapse_compose(job_id):
    data = request.json or {}
    fps = data.get("fps")
    try:
        fps_i = int(fps) if fps not in (None, "") else None
    except (TypeError, ValueError):
        fps_i = None
    result = timelapse_service.compose_job(job_id, fps=fps_i)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/timelapse/jobs/<job_id>", methods=["DELETE"])
def api_timelapse_delete(job_id):
    result = timelapse_service.delete_job(job_id)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/timelapse/clear", methods=["POST"])
def api_timelapse_clear():
    result = timelapse_service.clear_all()
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/timelapse/file")
def api_timelapse_file():
    rel = (request.args.get("path") or "").strip()
    path = timelapse_service.resolve_file(rel)
    if not path:
        return jsonify({"ok": False, "error": "文件不存在"}), 404
    return send_file(path, conditional=True)


@app.route("/api/timelapse/open-folder", methods=["POST"])
def api_timelapse_open_folder():
    return jsonify(timelapse_service.open_store_folder())


@app.route("/api/region-record/status")
def api_region_record_status():
    return jsonify(region_record_service.status())


@app.route("/api/region-record/config", methods=["GET"])
def api_region_record_config_get():
    return jsonify({"ok": True, "config": region_record_service.load_config()})


@app.route("/api/region-record/config", methods=["PUT"])
def api_region_record_config_put():
    data = request.json or {}
    try:
        result = region_record_service.apply_config(data)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/region-record/items")
def api_region_record_items():
    limit = request.args.get("limit")
    try:
        lim = int(limit) if limit not in (None, "") else None
    except ValueError:
        lim = None
    items = region_record_service.list_items(limit=lim)
    return jsonify({"ok": True, "items": items, "count": len(items)})


@app.route("/api/region-record/items/<item_id>", methods=["DELETE"])
def api_region_record_delete(item_id):
    ok = region_record_service.delete_item(item_id)
    return jsonify({"ok": ok, "error": "" if ok else "记录不存在"}), (200 if ok else 404)


@app.route("/api/region-record/clear", methods=["POST"])
def api_region_record_clear():
    n = region_record_service.clear_all()
    return jsonify({"ok": True, "cleared": n})


@app.route("/api/region-record/file")
def api_region_record_file():
    rel = request.args.get("path") or ""
    path = region_record_service.resolve_store_file(rel)
    if not path:
        return jsonify({"ok": False, "error": "文件不存在"}), 404
    return send_file(path, conditional=True)


@app.route("/api/region-record/start", methods=["POST"])
def api_region_record_start():
    return jsonify(region_record_service.start())


@app.route("/api/region-record/select", methods=["POST"])
def api_region_record_select():
    return jsonify(region_record_service.begin_select())


@app.route("/api/region-record/stop", methods=["POST"])
def api_region_record_stop():
    return jsonify(region_record_service.stop_recording())


@app.route("/api/region-record/open-folder", methods=["POST"])
def api_region_record_open_folder():
    return jsonify(region_record_service.open_store_folder())


# ---------- 视频替换人物 ----------

@app.route("/api/video-swap/projects")
def api_video_swap_projects():
    return jsonify(video_swap_service.list_projects())


@app.route("/api/video-swap/projects", methods=["POST"])
def api_video_swap_projects_create():
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.create_project(data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/guide")
def api_video_swap_guide():
    return jsonify(video_swap_service.get_guide())


@app.route("/api/video-swap/manual")
def api_video_swap_manual():
    """工作台界面使用说明书（S1～S4 怎么点）。"""
    return jsonify(video_swap_service.get_manual())


@app.route("/api/video-swap/projects/<project_id>")
def api_video_swap_project(project_id):
    result = video_swap_service.project_detail(project_id)
    return jsonify(result), (200 if result.get("ok") else 404)


@app.route("/api/video-swap/projects/<project_id>/baseline", methods=["POST"])
def api_video_swap_baseline(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.set_baseline(
        project_id,
        str(data.get("version") or ""),
        notes=data.get("notes"),
    )
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/compare", methods=["POST"])
def api_video_swap_compare(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.build_compare(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/shots")
def api_video_swap_shots(project_id):
    result = video_swap_service.list_shot_pairs(project_id)
    code = 200 if result.get("ok") is not False else 404
    return jsonify(result), code


@app.route("/api/video-swap/projects/<project_id>/shots/issues", methods=["POST"])
def api_video_swap_shot_issues(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.save_shot_issues(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/shots/descs", methods=["GET"])
def api_video_swap_shot_descs_get(project_id):
    result = video_swap_service.load_shot_descs(project_id)
    return jsonify(result), (200 if result.get("ok") else 404)


@app.route("/api/video-swap/projects/<project_id>/shots/descs", methods=["POST"])
def api_video_swap_shot_descs_post(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.save_shot_descs(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/shots/describe", methods=["POST"])
def api_video_swap_shot_describe(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.auto_describe_shots(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/prompts", methods=["GET"])
def api_video_swap_prompts_get(project_id):
    result = video_swap_service.load_prompts(project_id)
    return jsonify(result), (200 if result.get("ok") else 404)


@app.route("/api/video-swap/projects/<project_id>/prompts", methods=["POST"])
def api_video_swap_prompts_post(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.save_prompts(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/shots/reswap", methods=["POST"])
def api_video_swap_shot_reswap(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.queue_shot_reswap(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/shots/reswap/cancel", methods=["POST"])
def api_video_swap_shot_reswap_cancel(project_id):
    result = video_swap_service.cancel_shot_reswap(project_id)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/ark-packs", methods=["GET"])
def api_video_swap_ark_packs_list(project_id):
    result = video_swap_service.list_ark_send_packs(project_id)
    return jsonify(result), (200 if result.get("ok") else 404)


@app.route("/api/video-swap/projects/<project_id>/ark-packs", methods=["POST"])
def api_video_swap_ark_packs_build(project_id):
    """第五步：按人工判断拼包合成送方舟参考片（不调用方舟）。"""
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.build_ark_send_packs(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/ark-packs/coverage", methods=["GET"])
def api_video_swap_ark_packs_coverage(project_id):
    """送方舟包与「原片分镜」的覆盖一致性校验（缺段/重复/过期）。

    注意：不一致现在是「警告」而非硬错误，一律返回 200，由前端决定呈现为黄条还是红条。
    """
    result = video_swap_service.validate_pack_coverage(project_id)
    return jsonify(result), 200


@app.route("/api/video-swap/projects/<project_id>/ark-packs/send", methods=["POST"])
def api_video_swap_ark_packs_send(project_id):
    """用已拼好的包直接送 Seedance（不重拼）。body 可带 only_pack 走单包补送。"""
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.start_ark_send_packs(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/gates")
def api_video_swap_gates(project_id):
    result = video_swap_service.get_workflow_gates(project_id)
    return jsonify(result), (200 if result.get("ok") else 404)


@app.route("/api/video-swap/projects/<project_id>/gates/shot-review", methods=["POST"])
def api_video_swap_confirm_shot_review(project_id):
    result = video_swap_service.confirm_shot_review(project_id)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/gates/ark-review", methods=["POST"])
def api_video_swap_confirm_ark_review(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.confirm_ark_review(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/ark-packs/qa", methods=["POST"])
def api_video_swap_ark_pack_qa(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.save_ark_pack_qa(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/ark-packs/resend", methods=["POST"])
def api_video_swap_ark_pack_resend(project_id):
    """重送入队：写入 resend_queue.json（look/补丁/整包|逐段），供前端「重送抽屉」使用。
    单包立即补送请走 /ark-packs/send，body 带 only_pack。"""
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.queue_ark_resend(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/demo", methods=["POST"])
def api_video_swap_demo(project_id):
    result = video_swap_service.start_demo_progress(project_id)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/mark", methods=["POST"])
def api_video_swap_mark(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.mark_job(project_id, str(data.get("action") or ""))
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/progress", methods=["GET"])
def api_video_swap_progress_get(project_id):
    if not video_swap_service.get_project(project_id):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    return jsonify({"ok": True, "job": video_swap_service.get_job(project_id)})


@app.route("/api/video-swap/projects/<project_id>/progress", methods=["POST"])
def api_video_swap_progress_post(project_id):
    data = request.json if isinstance(request.json, dict) else {}
    result = video_swap_service.update_progress(project_id, data)
    return jsonify(result), (200 if result.get("ok") else 404)


@app.route("/api/video-swap/projects/<project_id>/progress/reset", methods=["POST"])
def api_video_swap_progress_reset(project_id):
    """手动复位卡住的任务（running/stale → idle），保留日志与 error_code 供追溯。"""
    if not video_swap_service.get_project(project_id):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    result = video_swap_service.reset_stuck_job(project_id)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/video-swap/projects/<project_id>/progress", methods=["DELETE"])
def api_video_swap_progress_clear(project_id):
    if not video_swap_service.get_project(project_id):
        return jsonify({"ok": False, "error": "项目不存在"}), 404
    return jsonify(video_swap_service.clear_progress(project_id))


@app.route("/api/video-swap/file")
def api_video_swap_file():
    project_id = (request.args.get("project") or "").strip()
    rel = (request.args.get("path") or "").strip()
    path = video_swap_service.resolve_project_file(project_id, rel)
    if not path:
        return jsonify({"ok": False, "error": "文件不存在或不在项目目录内"}), 404
    return send_file(path, conditional=True)


@app.route("/api/video-swap/projects/<project_id>/open-folder", methods=["POST"])
def api_video_swap_open_folder(project_id):
    result = video_swap_service.open_project_folder(project_id)
    return jsonify(result), (200 if result.get("ok") else 400)


# ---------- 微信链接申诉 ----------

@app.route("/api/wechat-appeal/items")
def api_wechat_appeal_items():
    return jsonify(wechat_appeal_service.list_items())


@app.route("/api/wechat-appeal/items", methods=["POST"])
def api_wechat_appeal_add():
    data = request.json or {}
    urls = data.get("urls") or data.get("url") or ""
    if isinstance(urls, str):
        urls = [u.strip() for u in urls.replace("\r", "").split("\n") if u.strip()]
    if not isinstance(urls, list):
        return jsonify({"ok": False, "error": "urls 格式错误"}), 400
    return jsonify(wechat_appeal_service.add_urls(urls))


@app.route("/api/wechat-appeal/items/<item_id>", methods=["DELETE"])
def api_wechat_appeal_delete(item_id):
    return jsonify(wechat_appeal_service.delete_item(item_id))


@app.route("/api/wechat-appeal/run", methods=["POST"])
def api_wechat_appeal_run():
    data = request.json or {}
    ids = data.get("ids")
    if ids is not None and not isinstance(ids, list):
        return jsonify({"ok": False, "error": "ids 须为数组"}), 400
    return jsonify(wechat_appeal_service.start_run(ids))


@app.route("/api/wechat-appeal/stop", methods=["POST"])
def api_wechat_appeal_stop():
    source = (request.get_json(silent=True) or {}).get("source") or "按钮"
    return jsonify(wechat_appeal_service.stop_job(str(source)[:20]))


@app.route("/api/wechat-appeal/job")
@app.route("/api/wechat-appeal/job/<job_id>")
def api_wechat_appeal_job(job_id=None):
    job = wechat_appeal_service.get_job(job_id)
    if not job:
        return jsonify({"ok": True, "job": None})
    return jsonify({"ok": True, "job": job})


@app.route("/api/wechat-appeal/preflight")
def api_wechat_appeal_preflight():
    return jsonify(wechat_appeal_service.preflight())


@app.route("/api/wechat-appeal/screenshot")
def api_wechat_appeal_screenshot():
    rel = request.args.get("path", "")
    p = wechat_appeal_service.resolve_screenshot(rel)
    if not p:
        return jsonify({"error": "not found"}), 404
    return send_file(p, mimetype="image/png")


_SKIP_IFACE = re.compile(
    r"^(lo|loopback|docker|veth|br-|vmware|virtualbox|hyper-v|npcap|wintun|tailscale|zerotier)",
    re.I,
)


def _build_traffic_rank_snapshot():
    import psutil

    sample_ms = 1000
    nics1 = psutil.net_io_counters(pernic=True)
    time.sleep(sample_ms / 1000.0)
    nics2 = psutil.net_io_counters(pernic=True)

    interfaces = []
    for name, s2 in nics2.items():
        if not name or _SKIP_IFACE.search(name):
            continue
        s1 = nics1.get(name)
        if not s1:
            continue
        rx_sec = max(0, s2.bytes_recv - s1.bytes_recv)
        tx_sec = max(0, s2.bytes_sent - s1.bytes_sent)
        total = rx_sec + tx_sec
        if total <= 0 and s2.bytes_recv <= 0 and s2.bytes_sent <= 0:
            continue
        interfaces.append(
            {
                "name": name,
                "rxSec": rx_sec,
                "txSec": tx_sec,
                "totalSec": total,
                "bytesRecv": s2.bytes_recv,
                "bytesSent": s2.bytes_sent,
                "bytesTotal": s2.bytes_recv + s2.bytes_sent,
            }
        )
    interfaces.sort(key=lambda x: x["totalSec"], reverse=True)

    total_recv = sum(i["bytesRecv"] for i in interfaces)
    total_sent = sum(i["bytesSent"] for i in interfaces)

    from process_net import get_process_traffic

    processes, proc_method, proc_note = get_process_traffic(sample_ms)

    return {
        "interfaces": interfaces,
        "processes": processes,
        "processTrafficMethod": proc_method,
        "processTrafficNote": proc_note,
        "totals": {
            "bytesRecv": total_recv,
            "bytesSent": total_sent,
            "bytesTotal": total_recv + total_sent,
        },
        "sampleMs": sample_ms,
        "ts": int(time.time() * 1000),
    }


@app.route("/api/cpu-monitor/processes")
def cpu_monitor_processes():
    import cpu_monitor

    cpu_monitor.start_background_sampler()
    return jsonify(cpu_monitor.get_snapshot())


@app.route("/api/cpu-monitor/kill", methods=["POST"])
def cpu_monitor_kill():
    import cpu_monitor

    body = request.json or {}
    result = cpu_monitor.kill_process(body.get("pid"))
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/cpu-monitor/mumu-cleanup", methods=["POST"])
def cpu_monitor_mumu_cleanup():
    import cpu_monitor

    result = cpu_monitor.cleanup_mumu_orphans()
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@app.route("/api/sys/traffic-rank")
def sys_traffic_rank():
    try:
        import psutil  # noqa: F401 — 未安装时给出明确提示

        data = _build_traffic_rank_snapshot()
        return jsonify({"ok": True, "data": data})
    except ImportError:
        return jsonify({"ok": False, "error": "缺少 psutil，请在工作台目录执行 pip install -r requirements.txt"}), 503
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


if __name__ == "__main__":
    print(f"工作台根目录: {ROOT}")
    print(f"访问 http://127.0.0.1:{PORT}")
    try:
        import threading as _ac_threading
        import time as _ac_time

        def _auto_control_boot_and_schedule():
            try:
                import auto_control as _ac0

                rec = _ac0.recover_on_startup()
                z = rec.get("zombied") or []
                q = rec.get("queued") or 0
                print(f"自动化启动恢复 · 僵尸标失败 {len(z)} · 排队 {q}")
            except Exception as boot_exc:  # noqa: BLE001
                print(f"自动化启动恢复跳过: {boot_exc}")
            _ac_time.sleep(8)
            while True:
                try:
                    import auto_control as _ac

                    _ac.tick_schedule()
                except Exception as exc:  # noqa: BLE001
                    print(f"定时跑检查失败: {exc}")
                _ac_time.sleep(30)

        _ac_threading.Thread(
            target=_auto_control_boot_and_schedule,
            name="auto-control-schedule",
            daemon=True,
        ).start()
        print("自动化定时跑已启动 · 在面板「设置」里填写时间")
    except Exception as exc:  # noqa: BLE001
        print(f"定时跑未启动: {exc}")
    log_agile_sim_path_boot()
    runtime_cfg = load_runtime_config()
    print(
        "[runtime] "
        f"timeline={runtime_cfg['timelineSync']} "
        f"clipboard={runtime_cfg['clipboardHistory']} "
        f"regionRecord={runtime_cfg['regionRecord']} "
        f"cpu={runtime_cfg['cpuMonitor']}"
    )
    if runtime_cfg.get("timelineSync", True):
        start_timeline_background_tasks()
    else:
        print("[timeline] 已按配置跳过启动同步")
    try:
        if runtime_cfg.get("cpuMonitor", True):
            import cpu_monitor

            cpu_monitor.start_background_sampler()
            print("CPU 监控采样已启动 · 首页入口或 /cpu-monitor")
        else:
            print("CPU 监控已按配置关闭")
    except Exception as exc:
        print(f"CPU 监控启动提示: {exc}")
    try:
        if runtime_cfg.get("clipboardHistory", True):
            cb = clipboard_service.start()
            hk = (cb.get("hotkey") or "ctrl+shift+v").upper().replace("+", " + ")
            print(f"剪贴板历史已启动 · 快捷键 {hk} 可弹出列表")
            if cb.get("error"):
                print(f"剪贴板历史提示: {cb['error']}")
        else:
            print("剪贴板历史已按配置关闭")
    except Exception as exc:
        print(f"剪贴板历史启动失败: {exc}")
    try:
        if runtime_cfg.get("regionRecord", True):
            rr = region_record_service.start()
            rhk = (rr.get("hotkey") or "ctrl+shift+r").upper().replace("+", " + ")
            engine = rr.get("engine") or "gdi-avi"
            print(f"区域录屏已启动 · 快捷键 {rhk} 框选录制 · 引擎 {engine}")
            if rr.get("error"):
                print(f"区域录屏提示: {rr['error']}")
        else:
            print("区域录屏已按配置关闭")
    except Exception as exc:
        print(f"区域录屏启动失败: {exc}")
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False, threaded=True)
