"""桌面 / 锁屏壁纸：图库、设置、随机轮换、关闭 360 画报干扰。"""
from __future__ import annotations

import ctypes
import json
import os
import subprocess
import sys
import time
import winreg
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "wallpaper_config.json"
CACHE_DIR = DATA_DIR / "wallpaper_cache"

DEFAULT_FOLDER = ""
DEFAULT_LOCK_SYNC = str(Path(DEFAULT_FOLDER) / "锁屏同步")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# WallpaperStyle: 填充 / 适应 / 拉伸 / 平铺 / 居中 / 跨区
STYLE_MAP = {
    "fill": ("10", "0"),
    "fit": ("6", "0"),
    "stretch": ("2", "0"),
    "tile": ("0", "1"),
    "center": ("0", "0"),
    "span": ("22", "0"),
}

DEFAULT_CONFIG = {
    "folder": DEFAULT_FOLDER,
    "style": "fill",
    "script_path": str(Path(DEFAULT_FOLDER) / "Set-RandomWallpaper.ps1"),
    # 加入此目录的图：桌面随机更换时同步设锁屏（Win+L / 睡眠唤醒锁屏）
    "lock_sync_folder": DEFAULT_LOCK_SYNC,
    "lock_follow_random": True,
}


def _subprocess_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cfg.update(raw)
        except (OSError, json.JSONDecodeError):
            pass
    cfg["folder"] = str(cfg.get("folder") or DEFAULT_FOLDER).strip()
    style = str(cfg.get("style") or "fill").strip().lower()
    cfg["style"] = style if style in STYLE_MAP else "fill"
    cfg["script_path"] = str(cfg.get("script_path") or DEFAULT_CONFIG["script_path"]).strip()
    return cfg


def save_config(updates: dict) -> dict:
    cfg = load_config()
    if "folder" in updates:
        cfg["folder"] = str(updates.get("folder") or "").strip() or DEFAULT_FOLDER
    if "style" in updates:
        style = str(updates.get("style") or "fill").strip().lower()
        cfg["style"] = style if style in STYLE_MAP else "fill"
    if "script_path" in updates:
        cfg["script_path"] = str(updates.get("script_path") or "").strip()
    if "lock_sync_folder" in updates:
        cfg["lock_sync_folder"] = (
            str(updates.get("lock_sync_folder") or "").strip() or DEFAULT_LOCK_SYNC
        )
    if "lock_follow_random" in updates:
        cfg["lock_follow_random"] = bool(updates.get("lock_follow_random"))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def _folder_path(folder: str | None = None) -> Path:
    raw = (folder or load_config()["folder"]).strip()
    return Path(raw).expanduser()


def _lock_sync_path(folder: str | None = None) -> Path:
    cfg = load_config()
    raw = (folder or cfg.get("lock_sync_folder") or DEFAULT_LOCK_SYNC).strip()
    return Path(raw).expanduser()


def ensure_lock_sync_dir() -> Path:
    sync = _lock_sync_path()
    sync.mkdir(parents=True, exist_ok=True)
    return sync


def list_lock_sync_names() -> set[str]:
    sync = _lock_sync_path()
    if not sync.is_dir():
        return set()
    names: set[str] = set()
    for p in sync.iterdir():
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
            names.add(p.name.lower())
    return names


def add_to_lock_sync(path: str, folder: str | None = None) -> dict:
    """把选中壁纸复制进「锁屏同步」目录，供随机换桌面时一起换锁屏。"""
    import shutil

    img = resolve_image(path, folder)
    if not img:
        return {"ok": False, "error": "图片不在壁纸目录内或不存在"}
    sync = ensure_lock_sync_dir()
    dest = sync / img.name
    try:
        if dest.resolve() != img.resolve():
            shutil.copy2(img, dest)
    except OSError as exc:
        return {"ok": False, "error": f"加入同步目录失败: {exc}"}
    return {
        "ok": True,
        "name": img.name,
        "syncPath": str(dest),
        "lockSyncCount": len(list_lock_sync_names()),
    }


def remove_from_lock_sync(path: str, folder: str | None = None) -> dict:
    """从锁屏同步目录移除（按文件名；可传壁纸路径或同步目录内路径）。"""
    raw = str(path or "").strip()
    if not raw:
        return {"ok": False, "error": "缺少 path"}
    name = Path(raw).name
    sync = ensure_lock_sync_dir()
    dest = sync / name
    # 也允许 resolve 到壁纸目录后用同名删
    img = resolve_image(path, folder)
    if img:
        dest = sync / img.name
    if not dest.is_file():
        return {"ok": True, "removed": False, "message": "本来就不在同步目录", "lockSyncCount": len(list_lock_sync_names())}
    try:
        dest.unlink()
    except OSError as exc:
        return {"ok": False, "error": f"移出失败: {exc}"}
    return {"ok": True, "removed": True, "name": dest.name, "lockSyncCount": len(list_lock_sync_names())}


def resolve_image(path: str, folder: str | None = None) -> Path | None:
    """仅允许壁纸目录内的图片（或绝对路径且在目录下）。"""
    raw = str(path or "").strip()
    if not raw:
        return None
    root = _folder_path(folder).resolve()
    try:
        p = Path(raw)
        if not p.is_absolute():
            p = (root / raw).resolve()
        else:
            p = p.resolve()
        p.relative_to(root)
    except (OSError, ValueError):
        return None
    if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
        return None
    return p


def list_images(folder: str | None = None) -> list[dict]:
    root = _folder_path(folder)
    if not root.is_dir():
        return []
    sync_names = list_lock_sync_names()
    items = []
    for p in sorted(root.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
            continue
        try:
            st = p.stat()
        except OSError:
            continue
        items.append(
            {
                "name": p.name,
                "path": str(p),
                "size": st.st_size,
                "mtime": int(st.st_mtime),
                "inLockSync": p.name.lower() in sync_names,
            }
        )
    return items


def _reg_get(path: str, name: str, default=None):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, path)
        try:
            val, _ = winreg.QueryValueEx(key, name)
            return val
        finally:
            winreg.CloseKey(key)
    except OSError:
        return default


def _reg_set(path: str, name: str, value, typ=winreg.REG_SZ):
    key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, path)
    try:
        winreg.SetValueEx(key, name, 0, typ, value)
    finally:
        winreg.CloseKey(key)


def _reg_delete_value(path: str, name: str) -> bool:
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_SET_VALUE)
        try:
            winreg.DeleteValue(key, name)
            return True
        finally:
            winreg.CloseKey(key)
    except OSError:
        return False


def get_desktop_wallpaper() -> str:
    return str(_reg_get(r"Control Panel\Desktop", "Wallpaper", "") or "")


def diagnose_interference() -> dict:
    """检测 360 画报 / 屏保 / Windows 聚焦 等会抢锁屏观感的来源。"""
    huabao_dir = Path(os.environ.get("APPDATA", "")) / "360huabao"
    huabao_exe = huabao_dir / "360huabao.exe"
    running = []
    try:
        import psutil

        for proc in psutil.process_iter(["pid", "name", "exe", "cmdline"]):
            try:
                name = (proc.info.get("name") or "").lower()
                if "360huabao" in name or "huabao" in name:
                    running.append(
                        {
                            "pid": proc.info.get("pid"),
                            "name": proc.info.get("name"),
                            "exe": proc.info.get("exe") or "",
                        }
                    )
            except (psutil.Error, OSError):
                continue
    except ImportError:
        pass

    run_cmd = _reg_get(r"Software\Microsoft\Windows\CurrentVersion\Run", "360huabao", "")
    scr = str(_reg_get(r"Control Panel\Desktop", "SCRNSAVE.EXE", "") or "")
    active = str(_reg_get(r"Control Panel\Desktop", "ScreenSaveActive", "0") or "0")
    timeout = _reg_get(r"Control Panel\Desktop", "ScreenSaveTimeOut", 0)
    spotlight = int(_reg_get(r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager", "RotatingLockScreenEnabled", 0) or 0)

    reasons = []
    if running or run_cmd:
        reasons.append(
            "检测到 360画报（360huabao）正在运行或已写入开机启动："
            "空闲时会弹出类似锁屏的画报壁纸，这不是 Windows 锁屏，也不是你脚本设的桌面壁纸。"
        )
    elif huabao_exe.exists():
        reasons.append(
            "本机仍残留 360画报程序文件（当前未运行、未开机启动）。"
            "若以后又出现，可在 360 浏览器 → 设置 → 实验室 关闭「360画报」。"
        )
    if str(active) in ("1", "01") and timeout:
        try:
            sec = int(timeout)
        except (TypeError, ValueError):
            sec = 0
        if sec and sec <= 300:
            reasons.append(f"系统屏保已开启，空闲约 {sec} 秒触发（当前 SCRNSAVE={scr or '未指定'}）。")
    if spotlight:
        reasons.append("Windows 聚焦锁屏（RotatingLockScreen）已开启，锁屏图可能被系统轮换覆盖。")

    if running or run_cmd:
        likely = reasons[0]
    elif reasons:
        likely = reasons[0]
    else:
        likely = "未发现明显的第三方锁屏/屏保干扰。"

    return {
        "ok": True,
        "huabao": {
            "installed": huabao_exe.exists(),
            "dir": str(huabao_dir) if huabao_dir.exists() else "",
            "startup": bool(run_cmd),
            "startup_cmd": str(run_cmd or ""),
            "running": running,
        },
        "screensaver": {
            "active": str(active) in ("1", "01"),
            "timeout": int(timeout) if str(timeout).isdigit() else timeout,
            "exe": scr,
        },
        "spotlight": {"enabled": bool(spotlight)},
        "desktop_wallpaper": get_desktop_wallpaper(),
        "reasons": reasons,
        "likely_cause": likely,
    }


def disable_360_huabao() -> dict:
    """结束 360画报进程、去掉开机启动、关闭过短屏保，避免再抢锁屏观感。"""
    actions = []
    errors = []

    try:
        import psutil

        for proc in psutil.process_iter(["pid", "name"]):
            try:
                name = (proc.info.get("name") or "").lower()
                if "360huabao" in name:
                    proc.terminate()
                    actions.append(f"已结束进程 {proc.info.get('name')} (pid={proc.info.get('pid')})")
            except (psutil.Error, OSError) as exc:
                errors.append(str(exc))
        time.sleep(0.4)
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                name = (proc.info.get("name") or "").lower()
                if "360huabao" in name:
                    proc.kill()
                    actions.append(f"已强制结束 {proc.info.get('name')} (pid={proc.info.get('pid')})")
            except (psutil.Error, OSError):
                pass
    except ImportError:
        errors.append("未安装 psutil，跳过结束进程")

    if _reg_delete_value(r"Software\Microsoft\Windows\CurrentVersion\Run", "360huabao"):
        actions.append("已删除开机启动项 360huabao")
    else:
        actions.append("开机启动项 360huabao 不存在或已删除")

    try:
        _reg_set(r"Control Panel\Desktop", "ScreenSaveActive", "0")
        actions.append("已关闭系统屏保（ScreenSaveActive=0）")
    except OSError as exc:
        errors.append(f"关闭屏保失败: {exc}")

    try:
        _reg_set(
            r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
            "RotatingLockScreenEnabled",
            0,
            winreg.REG_DWORD,
        )
        _reg_set(
            r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
            "RotatingLockScreenOverlayEnabled",
            0,
            winreg.REG_DWORD,
        )
        actions.append("已关闭 Windows 聚焦锁屏轮换")
    except OSError as exc:
        errors.append(f"关闭聚焦失败: {exc}")

    return {"ok": len(errors) == 0, "actions": actions, "errors": errors, "diagnose": diagnose_interference()}


def set_desktop_wallpaper(image_path: Path, style: str = "fill") -> dict:
    image_path = Path(image_path).resolve()
    if not image_path.is_file():
        return {"ok": False, "error": f"图片不存在: {image_path}"}

    style_key = (style or "fill").lower()
    if style_key not in STYLE_MAP:
        style_key = "fill"
    wallpaper_style, tile = STYLE_MAP[style_key]

    try:
        _reg_set(r"Control Panel\Desktop", "WallpaperStyle", wallpaper_style)
        _reg_set(r"Control Panel\Desktop", "TileWallpaper", tile)
        try:
            _reg_set(r"Control Panel\Desktop", "JPEGQualityFactor", 100, winreg.REG_DWORD)
        except OSError:
            pass
    except OSError as exc:
        return {"ok": False, "error": f"写注册表失败: {exc}"}

    SPI_SETDESKWALLPAPER = 20
    SPIF_UPDATEINIFILE = 0x01
    SPIF_SENDWININICHANGE = 0x02
    flags = SPIF_UPDATEINIFILE | SPIF_SENDWININICHANGE

    ok = ctypes.windll.user32.SystemParametersInfoW(
        SPI_SETDESKWALLPAPER, 0, str(image_path), flags
    )
    if not ok:
        return {"ok": False, "error": f"SystemParametersInfo 失败: {ctypes.get_last_error()}"}
    return {"ok": True, "path": str(image_path), "style": style_key, "target": "desktop"}


def _set_lock_screen_winrt(image_path: Path) -> dict:
    """通过 Windows Runtime LockScreen API 设置锁屏（无需管理员）。"""
    abs_path = str(image_path.resolve())
    # 路径中的单引号转义
    safe = abs_path.replace("'", "''")
    ps = f"""
$ErrorActionPreference = 'Stop'
$path = '{safe}'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {{ $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 }}) |
  Where-Object {{ $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }} |
  Select-Object -First 1
function Await-WinRT($op, [Type]$resultType) {{
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait() | Out-Null
  if ($task.IsFaulted) {{ throw $task.Exception.InnerException }}
  return $task.Result
}}
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.System.UserProfile.LockScreen,Windows.System.UserProfile,ContentType=WindowsRuntime]
$file = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
$op = [Windows.System.UserProfile.LockScreen]::SetImageFileAsync($file)
# IAsyncAction
$asAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {{ $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 }}) |
  Where-Object {{ $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' }} |
  Select-Object -First 1
$task2 = $asAction.Invoke($null, @($op))
$task2.Wait() | Out-Null
if ($task2.IsFaulted) {{ throw $task2.Exception.InnerException }}
Write-Output 'OK'
"""
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            creationflags=_subprocess_flags(),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "设置锁屏超时"}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0 or "OK" not in out:
        return {"ok": False, "error": err or out or f"exit={proc.returncode}"}
    return {"ok": True, "path": abs_path, "target": "lock", "method": "winrt"}


def _set_lock_screen_fallback(image_path: Path) -> dict:
    """回退：复制到用户 Themes 目录并关闭聚焦。"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest_dir = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Windows" / "Themes"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"WorkbenchLock{image_path.suffix.lower() or '.jpg'}"
    try:
        import shutil

        shutil.copy2(image_path, dest)
    except OSError as exc:
        return {"ok": False, "error": f"复制锁屏图失败: {exc}"}

    try:
        _reg_set(
            r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
            "RotatingLockScreenEnabled",
            0,
            winreg.REG_DWORD,
        )
        _reg_set(
            r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
            "RotatingLockScreenOverlayEnabled",
            0,
            winreg.REG_DWORD,
        )
    except OSError:
        pass

    # 部分版本会读 Creative 路径
    try:
        _reg_set(
            r"Software\Microsoft\Windows\CurrentVersion\Lock Screen\Creative",
            "LandscapeAssetPath",
            str(dest),
        )
        _reg_set(
            r"Software\Microsoft\Windows\CurrentVersion\Lock Screen\Creative",
            "PortraitAssetPath",
            str(dest),
        )
    except OSError:
        pass

    return {
        "ok": True,
        "path": str(dest),
        "target": "lock",
        "method": "fallback",
        "hint": "若锁屏未立即变化，请 Win+L 查看；或先点「关闭 360画报干扰」。",
    }


def set_lock_screen(image_path: Path) -> dict:
    image_path = Path(image_path).resolve()
    if not image_path.is_file():
        return {"ok": False, "error": f"图片不存在: {image_path}"}
    if image_path.suffix.lower() not in IMAGE_EXTS:
        return {"ok": False, "error": "不支持的图片格式"}

    result = _set_lock_screen_winrt(image_path)
    if result.get("ok"):
        try:
            _reg_set(
                r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager",
                "RotatingLockScreenEnabled",
                0,
                winreg.REG_DWORD,
            )
        except OSError:
            pass
        return result
    fb = _set_lock_screen_fallback(image_path)
    if fb.get("ok"):
        fb["winrt_error"] = result.get("error")
        return fb
    return {"ok": False, "error": result.get("error") or fb.get("error") or "设置锁屏失败"}


def apply_wallpaper(
    path: str,
    *,
    targets: list[str] | None = None,
    style: str | None = None,
    folder: str | None = None,
) -> dict:
    cfg = load_config()
    img = resolve_image(path, folder or cfg["folder"])
    if not img:
        return {"ok": False, "error": "图片不在壁纸目录内或不存在"}

    style = (style or cfg["style"] or "fill").lower()
    targets = targets or ["desktop"]
    targets = [t for t in targets if t in ("desktop", "lock")]
    if not targets:
        return {"ok": False, "error": "请至少选择 desktop 或 lock"}

    results = {}
    ok = True
    if "desktop" in targets:
        r = set_desktop_wallpaper(img, style)
        results["desktop"] = r
        ok = ok and bool(r.get("ok"))
    if "lock" in targets:
        r = set_lock_screen(img)
        results["lock"] = r
        ok = ok and bool(r.get("ok"))

    return {"ok": ok, "path": str(img), "results": results}


def sync_lock_from_pool(*, prefer_names: list[str] | None = None) -> dict:
    """从锁屏同步目录选一张设锁屏；优先与桌面同名，否则随机。"""
    import random

    sync = ensure_lock_sync_dir()
    files = [
        p
        for p in sync.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    ]
    if not files:
        return {"ok": False, "skipped": True, "error": "锁屏同步目录为空，请先在壁纸页「加入锁屏同步」"}

    pick = None
    name_map = {p.name.lower(): p for p in files}
    for n in prefer_names or []:
        key = Path(str(n)).name.lower()
        if key in name_map:
            pick = name_map[key]
            break
    if pick is None:
        # 尝试匹配当前桌面文件名
        desk = get_desktop_wallpaper()
        if desk:
            key = Path(desk).name.lower()
            pick = name_map.get(key)
    if pick is None:
        pick = random.choice(files)
    return set_lock_screen(pick)


def run_random_script(quiet: bool = True) -> dict:
    """调用现有 Set-RandomWallpaper.ps1（支持多屏跨区）；可顺带同步锁屏。"""
    cfg = load_config()
    script = Path(cfg.get("script_path") or "")
    follow = bool(cfg.get("lock_follow_random", True))
    sync_dir = str(cfg.get("lock_sync_folder") or DEFAULT_LOCK_SYNC)

    if not script.is_file():
        # 回退：目录内随机一张设桌面
        images = list_images(cfg["folder"])
        if not images:
            return {"ok": False, "error": "壁纸目录无图片，且找不到轮换脚本"}
        import random

        pick = random.choice(images)
        targets = ["desktop"]
        if follow and pick.get("inLockSync"):
            targets.append("lock")
        elif follow:
            # 桌面随机后，再从同步池换锁屏
            r = apply_wallpaper(pick["path"], targets=["desktop"], style=cfg["style"])
            if not r.get("ok"):
                return r
            lock_r = sync_lock_from_pool(prefer_names=[pick["name"]])
            r["results"] = {**(r.get("results") or {}), "lock": lock_r}
            if lock_r.get("ok"):
                r["message"] = "已随机更换桌面，并同步锁屏"
            elif lock_r.get("skipped"):
                r["message"] = "已随机更换桌面（锁屏同步目录为空，未改锁屏）"
            return r
        return apply_wallpaper(pick["path"], targets=targets, style=cfg["style"])

    ensure_lock_sync_dir()
    args = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script),
        "-WallpaperFolder",
        cfg["folder"],
        "-LockSyncFolder",
        sync_dir,
    ]
    if quiet:
        args.append("-Quiet")
    if not follow:
        args.append("-SkipLockSync")
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            creationflags=_subprocess_flags(),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "轮换脚本超时"}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0:
        return {"ok": False, "error": err or out or f"exit={proc.returncode}", "stdout": out}

    msg = out or "已随机更换桌面壁纸"
    lock_info = None
    # 定时任务走 PS1 已设锁屏；此处再兜底一次，兼容旧脚本 / WinRT 偶发失败
    if follow:
        lock_info = sync_lock_from_pool()
        if lock_info.get("ok"):
            msg = "已随机更换桌面，并同步锁屏"
        elif lock_info.get("skipped"):
            msg = "已随机更换桌面（锁屏同步目录为空，未改锁屏）"

    return {
        "ok": True,
        "message": msg,
        "desktop_wallpaper": get_desktop_wallpaper(),
        "script": str(script),
        "lock": lock_info,
        "lockSyncCount": len(list_lock_sync_names()),
        "lockFollowRandom": follow,
    }


def status() -> dict:
    cfg = load_config()
    folder = _folder_path(cfg["folder"])
    images = list_images(cfg["folder"]) if folder.is_dir() else []
    sync = _lock_sync_path(cfg.get("lock_sync_folder"))
    return {
        "ok": True,
        "config": cfg,
        "folder_exists": folder.is_dir(),
        "image_count": len(images),
        "lock_sync_folder": str(sync),
        "lock_sync_count": len(list_lock_sync_names()),
        "lock_follow_random": bool(cfg.get("lock_follow_random", True)),
        "desktop_wallpaper": get_desktop_wallpaper(),
        "script_exists": Path(cfg.get("script_path") or "").is_file(),
        "diagnose": diagnose_interference(),
    }
