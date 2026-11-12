"""本机 iOS（pymobiledevice3）：列设备 + 安装 IPA + AFC 传文件 + 截屏 + 应用管理 + 无线"""
from __future__ import annotations

import asyncio
import json
import os
import plistlib
import re
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "ios_config.json"
EXCHANGE_DIR = DATA_DIR / "ios_exchange"
THUMB_DIR = EXCHANGE_DIR / "_thumbs"
DEFAULT_CONFIG = {
    "ipa_share_dir": "",
    "wireless_hosts": {},  # udid -> hostname/IP
}
PUSH_REMOTE_DIR = "/Downloads/Workbench"

_install_lock = threading.Lock()
_install_jobs: dict[str, dict] = {}


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    cfg["wireless_hosts"] = {}
    if CONFIG_FILE.exists():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cfg.update(raw)
        except (OSError, json.JSONDecodeError):
            pass
    cfg["ipa_share_dir"] = str(cfg.get("ipa_share_dir") or "").strip()
    hosts = cfg.get("wireless_hosts") or {}
    cfg["wireless_hosts"] = {
        str(k): str(v).strip() for k, v in hosts.items() if str(k).strip() and str(v).strip()
    }
    return cfg


def save_config(updates: dict) -> dict:
    cfg = load_config()
    if "ipa_share_dir" in updates:
        cfg["ipa_share_dir"] = str(updates["ipa_share_dir"] or "").strip()
    if "wireless_hosts" in updates and isinstance(updates["wireless_hosts"], dict):
        cfg["wireless_hosts"] = {
            str(k): str(v).strip()
            for k, v in updates["wireless_hosts"].items()
            if str(k).strip() and str(v).strip()
        }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def _remember_wireless_host(udid: str, host: str) -> None:
    udid = (udid or "").strip()
    host = (host or "").strip()
    if not udid or not host:
        return
    cfg = load_config()
    hosts = dict(cfg.get("wireless_hosts") or {})
    hosts[udid] = host
    save_config({"wireless_hosts": hosts, "ipa_share_dir": cfg.get("ipa_share_dir", "")})


def _run(coro):
    """在同步 Flask 线程里跑 async（每次新建 loop，避免 Windows SSL 残留）。"""
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        try:
            loop.run_until_complete(loop.shutdown_asyncgens())
        except Exception:
            pass
        asyncio.set_event_loop(None)
        loop.close()


def _pmd_import_error() -> str | None:
    try:
        import pymobiledevice3  # noqa: F401

        return None
    except ImportError:
        return (
            "未安装 pymobiledevice3。请在工作台目录执行："
            "python -m pip install pymobiledevice3"
        )


def ios_status() -> dict:
    err = _pmd_import_error()
    if err:
        return {
            "ok": False,
            "available": False,
            "version": "",
            "error": err,
            "hint": "安装依赖后重启工作台；Windows 还需 Apple 移动设备支持（iTunes 组件）。",
        }
    try:
        import pymobiledevice3

        try:
            from importlib.metadata import version as pkg_version

            ver = pkg_version("pymobiledevice3")
        except Exception:
            ver = getattr(pymobiledevice3, "__version__", "") or ""
        devices = _run(_async_list_mux())
        return {
            "ok": True,
            "available": True,
            "version": f"pymobiledevice3 {ver}".strip(),
            "error": "",
            "device_count": len(devices),
            "hint": "" if devices else "未检测到 USB 设备。请插线、解锁手机并点「信任此电脑」。",
        }
    except Exception as exc:
        return {
            "ok": False,
            "available": False,
            "version": "",
            "error": str(exc),
            "hint": "请确认已安装 Apple Mobile Device Support，且手机已信任本机。",
        }


async def _async_list_mux() -> list:
    from pymobiledevice3 import usbmux

    return list(await usbmux.list_devices())


async def _create_lockdown(udid: str):
    """USB / usbmux Network 优先；失败则用已保存的无线 IP。"""
    from pymobiledevice3.lockdown import create_using_tcp, create_using_usbmux

    udid = (udid or "").strip()
    if not udid:
        raise ValueError("未指定设备 udid")
    last_err: Exception | None = None
    try:
        return await create_using_usbmux(serial=udid)
    except Exception as exc:
        last_err = exc
    host = (load_config().get("wireless_hosts") or {}).get(udid) or ""
    if host:
        return await create_using_tcp(hostname=host, identifier=udid)
    raise last_err or RuntimeError("无法连接设备")


def _parse_ver(s: str) -> list[int]:
    parts = [int(x) for x in re.findall(r"\d+", str(s or ""))]
    return parts or [0]


def version_lt(a: str, b: str) -> bool:
    """True if a < b (e.g. device 15.0 < min 16.0)."""
    pa, pb = _parse_ver(a), _parse_ver(b)
    n = max(len(pa), len(pb))
    pa += [0] * (n - len(pa))
    pb += [0] * (n - len(pb))
    return pa < pb


def inspect_ipa(ipa_path: str | Path) -> dict:
    """读取 IPA 内 Info.plist：bundleId / 版本 / 最低系统等。"""
    path = Path(ipa_path)
    out: dict = {
        "ok": False,
        "path": str(path),
        "name": path.name,
        "bundle_id": "",
        "app_name": "",
        "version": "",
        "build": "",
        "min_os": "",
    }
    if not path.is_file():
        out["error"] = f"IPA 不存在: {path}"
        return out
    try:
        with zipfile.ZipFile(path, "r") as zf:
            info_name = ""
            for n in zf.namelist():
                # Payload/Foo.app/Info.plist（一层）
                parts = n.replace("\\", "/").split("/")
                if (
                    len(parts) == 3
                    and parts[0] == "Payload"
                    and parts[1].endswith(".app")
                    and parts[2] == "Info.plist"
                ):
                    info_name = n
                    break
            if not info_name:
                for n in zf.namelist():
                    nn = n.replace("\\", "/")
                    if nn.startswith("Payload/") and nn.endswith(".app/Info.plist"):
                        # 取最短路径（顶层 Info.plist）
                        if not info_name or nn.count("/") < info_name.count("/"):
                            info_name = n
            if not info_name:
                out["error"] = "IPA 内未找到 Info.plist"
                return out
            raw = zf.read(info_name)
            try:
                plist = plistlib.loads(raw)
            except Exception:
                out["error"] = "Info.plist 解析失败"
                return out
        out.update(
            {
                "ok": True,
                "bundle_id": str(plist.get("CFBundleIdentifier") or ""),
                "app_name": str(
                    plist.get("CFBundleDisplayName")
                    or plist.get("CFBundleName")
                    or ""
                ),
                "version": str(plist.get("CFBundleShortVersionString") or ""),
                "build": str(plist.get("CFBundleVersion") or ""),
                "min_os": str(plist.get("MinimumOSVersion") or ""),
            }
        )
        return out
    except zipfile.BadZipFile:
        out["error"] = "不是有效的 IPA/ZIP"
        return out
    except Exception as exc:
        out["error"] = str(exc)
        return out


def check_ipa_against_device(ipa_meta: dict, device_version: str) -> dict:
    """装前校验：最低系统版本。"""
    min_os = (ipa_meta or {}).get("min_os") or ""
    device_version = (device_version or "").strip()
    if min_os and device_version and version_lt(device_version, min_os):
        return {
            "ok": False,
            "compatible": False,
            "error": f"设备 iOS {device_version} 低于 IPA 最低要求 {min_os}",
            "hint": "请换更高系统的真机，或使用适配该系统的包。",
            "device_version": device_version,
            "min_os": min_os,
        }
    return {
        "ok": True,
        "compatible": True,
        "device_version": device_version,
        "min_os": min_os,
    }


async def _async_device_info(udid: str) -> dict:
    ld = await _create_lockdown(udid)
    return {
        "udid": getattr(ld, "udid", None) or udid,
        "name": getattr(ld, "display_name", None) or "",
        "product": getattr(ld, "product_type", None) or "",
        "version": getattr(ld, "product_version", None) or "",
    }


def get_device_info(udid: str) -> dict:
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备"}
    try:
        info = _run(_async_device_info(udid))
        info["ok"] = True
        return info
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def _async_list_devices() -> list[dict]:
    mux_devs = await _async_list_mux()
    out: list[dict] = []
    seen: set[str] = set()
    for d in mux_devs:
        udid = getattr(d, "serial", None) or ""
        conn = getattr(d, "connection_type", None) or "USB"
        item = {
            "udid": udid,
            "name": "",
            "product": "",
            "version": "",
            "connection": str(conn),
            "state": "device",
            "host": "",
            "error": "",
        }
        try:
            ld = await _create_lockdown(udid) if udid else None
            if ld is None:
                raise RuntimeError("无序列号")
            item["name"] = getattr(ld, "display_name", None) or ""
            item["product"] = getattr(ld, "product_type", None) or ""
            item["version"] = getattr(ld, "product_version", None) or ""
            item["udid"] = getattr(ld, "udid", None) or udid
        except Exception as exc:
            item["state"] = "pairing"
            item["error"] = str(exc)
        seen.add(item["udid"])
        out.append(item)

    # 已保存无线主机（可能不在 usbmux 列表）
    for udid, host in (load_config().get("wireless_hosts") or {}).items():
        if udid in seen:
            for it in out:
                if it["udid"] == udid and not it.get("host"):
                    it["host"] = host
            continue
        item = {
            "udid": udid,
            "name": "",
            "product": "",
            "version": "",
            "connection": "Network",
            "state": "device",
            "host": host,
            "error": "",
        }
        try:
            from pymobiledevice3.lockdown import create_using_tcp

            ld = await create_using_tcp(hostname=host, identifier=udid)
            item["name"] = getattr(ld, "display_name", None) or ""
            item["product"] = getattr(ld, "product_type", None) or ""
            item["version"] = getattr(ld, "product_version", None) or ""
            item["udid"] = getattr(ld, "udid", None) or udid
            try:
                await ld.service.close()
            except Exception:
                pass
        except Exception as exc:
            item["state"] = "offline"
            item["error"] = str(exc)
        out.append(item)
    return out


def list_devices() -> dict:
    status = ios_status()
    if not status.get("available"):
        return {"ok": False, "error": status.get("error"), "devices": [], "status": status}
    try:
        devices = _run(_async_list_devices())
        return {"ok": True, "devices": devices, "status": status}
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "devices": [],
            "status": status,
            "hint": "请确认手机已解锁并信任此电脑。",
        }


def find_latest_ipa(share_dir: str | None = None) -> dict:
    cfg = load_config()
    raw = (share_dir if share_dir is not None else cfg["ipa_share_dir"]).strip()
    if not raw:
        return {"ok": False, "error": "未配置共享 IPA 目录（可在面板中设置）"}
    folder = Path(raw)
    if not folder.is_absolute():
        folder = (ROOT / folder).resolve()
    if not folder.is_dir():
        return {"ok": False, "error": f"共享目录不存在: {folder}"}
    ipas = list(folder.rglob("*.ipa")) + list(folder.rglob("*.IPA"))
    uniq = {p.resolve(): p for p in ipas}
    ipas = list(uniq.values())
    if not ipas:
        return {"ok": False, "error": f"共享目录下没有 IPA: {folder}"}
    latest = max(ipas, key=lambda p: p.stat().st_mtime)
    size = latest.stat().st_size
    meta = inspect_ipa(latest)
    result = {
        "ok": True,
        "path": str(latest),
        "name": latest.name,
        "size": size,
        "size_mb": round(size / (1024 * 1024), 2),
        "mtime": datetime.fromtimestamp(latest.stat().st_mtime).isoformat(timespec="seconds"),
        "ipa": meta if meta.get("ok") else None,
    }
    return result


def _hint_for_install(exc_text: str) -> str:
    t = (exc_text or "").lower()
    if "provision" in t or "签名" in t or "sign" in t or "0xe8008015" in t or "0xe8008016" in t:
        return "IPA 签名/描述文件可能无效，请确认企业签或开发签仍有效，并在设置中信任证书。"
    if "pair" in t or "trust" in t or "lockdown" in t:
        return "请解锁手机并重新点「信任此电脑」。"
    if "space" in t or "storage" in t:
        return "手机存储空间可能不足。"
    if "minimum" in t or "compatible" in t or "os version" in t:
        return "系统版本可能不满足 IPA 最低要求。"
    return ""


def _ipa_meta_log_lines(meta: dict) -> list[str]:
    if not meta or not meta.get("ok"):
        return [f"IPA 元信息读取失败: {(meta or {}).get('error') or '未知'}"]
    lines = [
        f"包名: {meta.get('app_name') or '—'}  ({meta.get('bundle_id') or '—'})",
        f"版本: {meta.get('version') or '—'} ({meta.get('build') or '—'})  最低系统: {meta.get('min_os') or '—'}",
    ]
    return lines


async def _async_install_ipa(udid: str, ipa_path: Path, job_id: str | None = None) -> dict:
    from pymobiledevice3.services.installation_proxy import InstallationProxyService

    logs: list[str] = []
    size = ipa_path.stat().st_size
    logs.append(f"安装文件: {ipa_path.name}（{round(size / (1024 * 1024), 2)} MB）")
    logs.append(f"目标设备: {udid}")
    if job_id:
        _set_job(job_id, progress=0, progress_text="连接设备…")
    ld = await _create_lockdown(udid)
    last_pct = [-1]

    def handler(complete, total, **kwargs):
        try:
            if not total:
                return
            pct = int(100 * float(complete) / float(total))
            pct = max(0, min(100, pct))
            if pct == last_pct[0]:
                return
            last_pct[0] = pct
            if job_id:
                _set_job(job_id, progress=pct, progress_text=f"安装中 {pct}%")
        except Exception:
            pass

    if job_id:
        _set_job(job_id, progress=0, progress_text="开始传输/安装…")
    async with InstallationProxyService(lockdown=ld) as iproxy:
        await iproxy.install_from_local(ipa_path, handler=handler)
    if last_pct[0] >= 0:
        logs.append(f"进度 {last_pct[0]}%")
    if job_id:
        _set_job(job_id, progress=100, progress_text="安装完成")
    logs.append("安装成功")
    return {"ok": True, "logs": logs, "path": str(ipa_path)}


def install_ipa(ipa_path: str, udid: str, job_id: str | None = None) -> dict:
    logs: list[str] = []
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备 udid", "logs": logs}
    path = Path(ipa_path)
    if not path.is_file():
        return {"ok": False, "error": f"IPA 不存在: {path}", "logs": logs}
    if path.suffix.lower() != ".ipa":
        return {"ok": False, "error": "仅支持 .ipa 文件", "logs": logs}
    try:
        return _run(_async_install_ipa(udid, path, job_id=job_id))
    except Exception as exc:
        text = str(exc)
        hint = _hint_for_install(text)
        logs.append(text)
        if hint:
            logs.append(hint)
        return {"ok": False, "error": text, "hint": hint, "logs": logs, "path": str(path)}


def _set_job(job_id: str, **kwargs):
    with _install_lock:
        job = _install_jobs.setdefault(job_id, {})
        job.update(kwargs)
        job["updated_at"] = time.time()


def get_install_job(job_id: str) -> dict | None:
    with _install_lock:
        job = _install_jobs.get(job_id)
        return dict(job) if job else None


def start_install_job(
    *,
    source: str,
    udid: str | None = None,
    ipa_path: str | None = None,
    share_dir: str | None = None,
    force: bool = False,
    uninstall_first: bool = False,
) -> dict:
    logs: list[str] = []
    resolved = ""
    udid = (udid or "").strip()

    if source == "latest":
        info = find_latest_ipa(share_dir)
        if not info.get("ok"):
            return {"ok": False, "error": info.get("error")}
        resolved = info["path"]
        logs.append(f"选用共享目录最新包: {info['name']}（{info['size_mb']} MB）")
    elif source in ("path", "upload"):
        if not ipa_path:
            return {"ok": False, "error": "缺少 IPA 路径"}
        resolved = ipa_path
    else:
        return {"ok": False, "error": f"未知 source: {source}"}

    if not udid:
        return {"ok": False, "error": "请先选择 iOS 设备"}

    meta = inspect_ipa(resolved)
    logs.extend(_ipa_meta_log_lines(meta))

    device_version = ""
    try:
        dinfo = _run(_async_device_info(udid))
        device_version = dinfo.get("version") or ""
        if device_version:
            logs.append(f"设备系统: iOS {device_version}")
    except Exception as exc:
        logs.append(f"读取设备信息失败（仍尝试安装）: {exc}")

    if meta.get("ok") and not force:
        compat = check_ipa_against_device(meta, device_version)
        if not compat.get("compatible"):
            return {
                "ok": False,
                "error": compat.get("error"),
                "hint": compat.get("hint"),
                "ipa": meta,
                "logs": logs,
            }

    job_id = uuid.uuid4().hex[:12]
    _set_job(
        job_id,
        id=job_id,
        status="running",
        ok=None,
        logs=list(logs),
        path=resolved,
        udid=udid,
        error="",
        hint="",
        progress=0,
        progress_text="排队中…",
        ipa=meta if meta.get("ok") else None,
        started_at=time.time(),
    )

    bundle_id = (meta.get("bundle_id") or "") if meta.get("ok") else ""

    def worker():
        worker_logs = list(logs)
        try:
            if uninstall_first and bundle_id:
                worker_logs.append(f"先卸载已装应用: {bundle_id}")
                _set_job(job_id, progress_text="卸载旧包…", logs=list(worker_logs))
                u = uninstall_app(udid, bundle_id)
                worker_logs.extend(u.get("logs") or [])
                if not u.get("ok"):
                    # 未安装时继续装
                    worker_logs.append(f"卸载跳过/失败（继续安装）: {u.get('error') or ''}")
            _set_job(job_id, logs=list(worker_logs), progress_text="开始安装…")
            result = install_ipa(resolved, udid=udid, job_id=job_id)
            merged = worker_logs + list(result.get("logs") or [])
            prev = get_install_job(job_id) or {}
            _set_job(
                job_id,
                status="done" if result.get("ok") else "failed",
                ok=bool(result.get("ok")),
                logs=merged,
                error=result.get("error") or "",
                hint=result.get("hint") or "",
                progress=100 if result.get("ok") else int(prev.get("progress") or 0),
                progress_text="安装完成" if result.get("ok") else "安装失败",
                finished_at=time.time(),
            )
        except Exception as exc:
            worker_logs.append(str(exc))
            _set_job(
                job_id,
                status="failed",
                ok=False,
                logs=worker_logs,
                error=str(exc),
                progress_text="安装失败",
                finished_at=time.time(),
            )

    threading.Thread(target=worker, daemon=True).start()
    return {
        "ok": True,
        "job_id": job_id,
        "path": resolved,
        "logs": logs,
        "ipa": meta if meta.get("ok") else None,
    }


# ---------- 应用列表 / 卸载 ----------


async def _async_list_apps(udid: str, application_type: str = "User") -> dict:
    from pymobiledevice3.services.installation_proxy import InstallationProxyService

    ld = await _create_lockdown(udid)
    items: list[dict] = []
    async with InstallationProxyService(lockdown=ld) as iproxy:
        apps = await iproxy.get_apps(application_type=application_type or "User")
    if isinstance(apps, dict):
        for bid, info in apps.items():
            info = info or {}
            items.append(
                {
                    "bundle_id": bid,
                    "name": str(
                        info.get("CFBundleDisplayName")
                        or info.get("CFBundleName")
                        or bid
                    ),
                    "version": str(
                        info.get("CFBundleShortVersionString")
                        or info.get("CFBundleVersion")
                        or ""
                    ),
                    "type": str(info.get("ApplicationType") or application_type or ""),
                }
            )
    items.sort(key=lambda x: (x.get("name") or "").lower())
    return {"ok": True, "items": items, "count": len(items)}


def list_apps(udid: str, application_type: str = "User") -> dict:
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备", "items": []}
    try:
        return _run(_async_list_apps(udid, application_type=application_type))
    except Exception as exc:
        return {"ok": False, "error": str(exc), "items": [], "logs": [str(exc)]}


async def _async_uninstall(udid: str, bundle_id: str) -> dict:
    from pymobiledevice3.services.installation_proxy import InstallationProxyService

    logs: list[str] = []
    logs.append(f"卸载 {bundle_id}")
    ld = await _create_lockdown(udid)
    async with InstallationProxyService(lockdown=ld) as iproxy:
        await iproxy.uninstall(bundle_id)
    logs.append("卸载成功")
    return {"ok": True, "logs": logs, "bundle_id": bundle_id}


def uninstall_app(udid: str, bundle_id: str) -> dict:
    udid = (udid or "").strip()
    bundle_id = (bundle_id or "").strip()
    logs: list[str] = []
    if not udid:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    if not bundle_id:
        return {"ok": False, "error": "未指定 bundle_id", "logs": logs}
    try:
        return _run(_async_uninstall(udid, bundle_id))
    except Exception as exc:
        text = str(exc)
        # 未安装也算可继续
        soft = "not found" in text.lower() or "no such" in text.lower()
        return {
            "ok": soft,
            "error": "" if soft else text,
            "logs": logs + [text],
            "bundle_id": bundle_id,
        }


# ---------- 无线 ----------


def _apple_pair_records_dir() -> Path:
    """Windows 上 iTunes/Apple Mobile Device 的配对目录（含 WiFiMACAddress）。"""
    try:
        from pymobiledevice3.osu.os_utils import get_os_utils

        p = get_os_utils().pair_record_path
        if p and Path(p).is_dir():
            return Path(p)
    except Exception:
        pass
    return Path(os.environ.get("ALLUSERSPROFILE", r"C:\ProgramData")) / "Apple" / "Lockdown"


def _load_pair_record(udid: str) -> dict | None:
    udid = (udid or "").strip()
    if not udid:
        return None
    path = _apple_pair_records_dir() / f"{udid}.plist"
    if not path.is_file():
        return None
    try:
        return plistlib.loads(path.read_bytes())
    except Exception:
        return None


def _normalize_mac(mac: str) -> str:
    return re.sub(r"[^0-9a-f]", "", (mac or "").lower())


def _arp_ips_for_mac(mac: str) -> list[str]:
    """从本机 ARP 表按 MAC 反查 IP（Windows 上 Bonjour 常失败时的兜底）。"""
    mac_n = _normalize_mac(mac)
    if len(mac_n) != 12:
        return []
    try:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
        proc = subprocess.run(
            ["arp", "-a"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            creationflags=flags,
        )
        text = (proc.stdout or "") + "\n" + (proc.stderr or "")
    except Exception:
        return []
    ips: list[str] = []
    for line in text.splitlines():
        m = re.search(
            r"(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}"
            r"[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2})",
            line,
            re.I,
        )
        if not m:
            continue
        if _normalize_mac(m.group(2)) == mac_n:
            ip = m.group(1)
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    return ips


def _ping_host(ip: str, timeout_ms: int = 400) -> None:
    """轻量 ping，促使 ARP 表出现条目。"""
    try:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
        if sys.platform == "win32":
            subprocess.run(
                ["ping", "-n", "1", "-w", str(timeout_ms), ip],
                capture_output=True,
                timeout=2,
                creationflags=flags,
            )
        else:
            subprocess.run(["ping", "-c", "1", "-W", "1", ip], capture_output=True, timeout=2)
    except Exception:
        pass


def _guess_subnet_hosts(limit: int = 40) -> list[str]:
    """根据本机网卡推断同网段若干 IP，用于唤醒 ARP。"""
    import socket

    hosts: list[str] = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            local = s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        local = ""
    if not local or local.startswith("127."):
        return hosts
    parts = local.split(".")
    if len(parts) != 4:
        return hosts
    prefix = ".".join(parts[:3])
    candidates = list(range(1, 255))
    try:
        me = int(parts[3])
        candidates = list(range(max(1, me - 20), min(254, me + 20))) + candidates
    except ValueError:
        pass
    seen: set[str] = set()
    for n in candidates:
        ip = f"{prefix}.{n}"
        if ip == local or ip in seen:
            continue
        seen.add(ip)
        hosts.append(ip)
        if len(hosts) >= limit:
            break
    return hosts


async def _async_probe_tcp(host: str, udid: str | None, pair_record: dict | None) -> dict | None:
    from pymobiledevice3.lockdown import create_using_tcp

    try:
        ld = await create_using_tcp(
            hostname=host,
            identifier=udid or None,
            autopair=False,
            pair_record=pair_record,
        )
    except Exception:
        return None
    info = {
        "udid": getattr(ld, "udid", None) or (udid or ""),
        "host": host,
        "name": getattr(ld, "display_name", None) or "",
        "product": getattr(ld, "product_type", None) or "",
        "version": getattr(ld, "product_version", None) or "",
        "connection": "Network",
    }
    try:
        await ld.service.close()
    except Exception:
        pass
    return info


async def _async_enable_wifi(udid: str) -> dict:
    from pymobiledevice3.lockdown import create_using_usbmux

    logs: list[str] = []
    logs.append("通过 USB 开启无线锁屏连接（EnableWifiConnections）…")
    ld = await create_using_usbmux(serial=udid)
    await ld.set_enable_wifi_connections(True)
    enabled = await ld.get_enable_wifi_connections()
    wifi_mac = ""
    try:
        wifi_mac = getattr(ld, "wifi_mac_address", None) or ""
        if not wifi_mac:
            wifi_mac = (await ld.get_value(key="WiFiAddress")) or ""
    except Exception:
        pass
    if not wifi_mac:
        wifi_mac = (_load_pair_record(udid) or {}).get("WiFiMACAddress") or ""
    logs.append(f"无线锁屏: {'已开启' if enabled else '状态未知'}")
    if wifi_mac:
        logs.append(f"设备 Wi‑Fi MAC: {wifi_mac}")
    pair_dir = _apple_pair_records_dir()
    logs.append(f"配对目录: {pair_dir}")
    if not (pair_dir / f"{udid}.plist").is_file():
        logs.append("警告: 未在配对目录找到该机 plist，无线发现可能失败。")
    logs.append("请保持手机与电脑同一 Wi‑Fi（不要开「无线隔离」），然后点「发现无线」。")
    auto = None
    if wifi_mac:
        logs.append("尝试按 MAC 从 ARP 表定位 IP…")
        for ip in _arp_ips_for_mac(wifi_mac):
            logs.append(f"ARP 命中 {ip}，探测 lockdown…")
            rec = _load_pair_record(udid)
            auto = await _async_probe_tcp(ip, udid, rec)
            if auto:
                _remember_wireless_host(udid, ip)
                logs.append(f"已自动连上无线: {auto.get('name') or udid} @ {ip}")
                break
        if not auto:
            logs.append("ARP 暂无记录。可点「发现无线」（会扫局域网并再试 Bonjour）。")
    return {
        "ok": True,
        "logs": logs,
        "enabled": bool(enabled),
        "wifi_mac": wifi_mac,
        "device": auto,
    }


def enable_wifi(udid: str) -> dict:
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备（需先 USB 连接）", "logs": []}
    try:
        return _run(_async_enable_wifi(udid))
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "logs": [str(exc)],
            "hint": "需 USB 已配对；部分系统版本需在电脑端曾开启「通过 Wi‑Fi 同步」。",
        }


async def _async_discover_wireless(timeout: float = 10.0, udid: str | None = None) -> dict:
    from pymobiledevice3.bonjour import browse_mobdev2
    from pymobiledevice3.lockdown import get_mobdev2_lockdowns

    logs: list[str] = []
    found: list[dict] = []
    seen: set[str] = set()
    pair_dir = _apple_pair_records_dir()
    logs.append(f"配对目录: {pair_dir}（{'存在' if pair_dir.is_dir() else '不存在'}）")
    udid = (udid or "").strip() or None

    # 1) Bonjour（必须带上 Apple Lockdown 配对记录，否则 only_paired 永远为空）
    logs.append(f"Bonjour 发现无线设备（约 {timeout:.0f}s）…")
    try:
        async for host, lockdown in get_mobdev2_lockdowns(
            udid=udid,
            pair_records=pair_dir,
            only_paired=True,
            timeout=timeout,
        ):
            try:
                did = getattr(lockdown, "udid", None) or ""
                if not did or did in seen:
                    continue
                seen.add(did)
                item = {
                    "udid": did,
                    "host": host,
                    "name": getattr(lockdown, "display_name", None) or "",
                    "product": getattr(lockdown, "product_type", None) or "",
                    "version": getattr(lockdown, "product_version", None) or "",
                    "connection": "Network",
                    "via": "bonjour",
                }
                found.append(item)
                _remember_wireless_host(did, host)
                logs.append(f"[Bonjour] {item['name'] or did} @ {host}")
            finally:
                try:
                    await lockdown.service.close()
                except Exception:
                    pass
    except Exception as exc:
        logs.append(f"Bonjour 失败: {exc}")

    if not found:
        try:
            answers = await browse_mobdev2(timeout=min(4.0, timeout))
            logs.append(f"mDNS 原始结果: {len(answers)} 条")
            for a in answers[:5]:
                addrs = ", ".join(x.full_ip for x in (a.addresses or [])[:3])
                logs.append(f"  · {a.instance} → {addrs or '无地址'}")
            if not answers:
                logs.append(
                    "本机未收到 _apple-mobdev2._tcp 广播。Windows 常见原因："
                    "未装 Bonjour、防火墙拦 UDP 5353、手机与电脑不在同一二层网络。"
                )
        except Exception as exc:
            logs.append(f"mDNS 诊断失败: {exc}")

    # 2) ARP / 网段探测兜底
    if udid:
        targets = [udid]
    else:
        try:
            targets = [
                p.stem
                for p in pair_dir.glob("*.plist")
                if not p.name.endswith(".tmp") and p.stem != "SystemConfiguration"
            ]
        except Exception:
            targets = []

    for did in targets:
        if did in seen:
            continue
        rec = _load_pair_record(did)
        mac = (rec or {}).get("WiFiMACAddress") or ""
        if not mac:
            continue
        logs.append(f"按 MAC 定位 {did}（{mac}）…")
        for tip in _guess_subnet_hosts(limit=30):
            _ping_host(tip, 200)
        ips = _arp_ips_for_mac(mac)
        if not ips:
            logs.append("  ARP 表无此 MAC。可在手机上打开一下网页后再试，或手动填 IP。")
            continue
        for ip in ips:
            logs.append(f"  ARP 命中 {ip}，探测 lockdown…")
            info = await _async_probe_tcp(ip, did, rec)
            if info:
                info["via"] = "arp"
                found.append(info)
                seen.add(did)
                _remember_wireless_host(did, ip)
                logs.append(f"[ARP] {info.get('name') or did} @ {ip}")
                break
            logs.append(f"  {ip} 无法建立无线 lockdown（是否已点「开启无线」？）")

    if not found:
        logs.append(
            "仍未发现无线设备。建议：①手机与电脑同一 Wi‑Fi；②再点一次「开启无线」；"
            "③在手机「设置→Wi‑Fi→已连热点→IP 地址」看 IP，填到左侧手动连接；"
            "④关闭路由器 AP 隔离 / 访客网络。"
        )
    return {"ok": True, "devices": found, "logs": logs}


def discover_wireless(timeout: float = 10.0, udid: str | None = None) -> dict:
    try:
        return _run(
            _async_discover_wireless(
                timeout=float(timeout or 10),
                udid=(udid or "").strip() or None,
            )
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "devices": [], "logs": [str(exc)]}


async def _async_connect_wireless(host: str, udid: str | None = None) -> dict:
    logs: list[str] = []
    host = (host or "").strip()
    logs.append(f"连接无线设备 {host} …")
    rec = _load_pair_record(udid) if udid else None
    info = await _async_probe_tcp(host, udid, rec)
    if not info:
        from pymobiledevice3.lockdown import create_using_tcp

        ld = await create_using_tcp(hostname=host, identifier=(udid or None))
        info = {
            "udid": getattr(ld, "udid", None) or (udid or ""),
            "name": getattr(ld, "display_name", None) or "",
            "product": getattr(ld, "product_type", None) or "",
            "version": getattr(ld, "product_version", None) or "",
            "host": host,
            "connection": "Network",
        }
        try:
            await ld.service.close()
        except Exception:
            pass
    if info.get("udid"):
        _remember_wireless_host(info["udid"], host)
    logs.append(f"已连接 {info.get('name') or info.get('udid')}")
    return {"ok": True, "device": info, "logs": logs}


def connect_wireless(host: str, udid: str | None = None) -> dict:
    host = (host or "").strip()
    if not host:
        return {"ok": False, "error": "请填写设备 IP / 主机名", "logs": []}
    try:
        return _run(_async_connect_wireless(host, udid=(udid or "").strip() or None))
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "logs": [str(exc)],
            "hint": "需曾 USB 配对；并已开启无线锁屏；电脑与手机同一 Wi‑Fi。可在手机 Wi‑Fi 详情里查看 IP。",
        }


def _safe_udid_dir(udid: str) -> str:
    return re.sub(r"[^\w.\-]+", "_", (udid or "device").strip()) or "device"


def exchange_dir_for(udid: str) -> Path:
    d = EXCHANGE_DIR / _safe_udid_dir(udid)
    d.mkdir(parents=True, exist_ok=True)
    return d


def resolve_exchange_file(rel_or_abs: str) -> Path | None:
    raw = str(rel_or_abs or "").strip()
    if not raw:
        return None
    try:
        EXCHANGE_DIR.mkdir(parents=True, exist_ok=True)
        root = EXCHANGE_DIR.resolve()
        p = Path(raw)
        if not p.is_absolute():
            p = (EXCHANGE_DIR / raw).resolve()
        else:
            p = p.resolve()
        p.relative_to(root)
        if not p.is_file():
            return None
        return p
    except (OSError, ValueError):
        return None


async def _maybe(val):
    if inspect_isawaitable(val):
        return await val
    return val


def inspect_isawaitable(obj) -> bool:
    import inspect

    return inspect.isawaitable(obj)


async def _async_push(udid: str, local_path: Path) -> dict:
    from pymobiledevice3.services.afc import AfcService

    logs: list[str] = []
    remote_dir = PUSH_REMOTE_DIR
    remote_path = f"{remote_dir}/{local_path.name}"
    logs.append(f"推送 {local_path.name} → {remote_path}")
    ld = await _create_lockdown(udid)
    async with AfcService(lockdown=ld) as afc:
        await _maybe(afc.makedirs(remote_dir))
        await _maybe(afc.push(str(local_path), remote_path))
    logs.append("推送成功（可在「文件」App → 下载 / Downloads / Workbench 查看）")
    return {"ok": True, "logs": logs, "remote_path": remote_path}


def push_file_to_device(udid: str, local_path: str | Path) -> dict:
    udid = (udid or "").strip()
    logs: list[str] = []
    if not udid:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    path = Path(local_path)
    if not path.is_file():
        return {"ok": False, "error": f"本地文件不存在: {path}", "logs": logs}
    try:
        return _run(_async_push(udid, path))
    except Exception as exc:
        return {"ok": False, "error": str(exc), "logs": logs + [str(exc)]}


async def _async_listdir(udid: str, remote_path: str) -> dict:
    from pymobiledevice3.services.afc import AfcService

    remote_path = (remote_path or "/").strip() or "/"
    ld = await _create_lockdown(udid)
    items: list[dict] = []
    async with AfcService(lockdown=ld) as afc:
        names = await _maybe(afc.listdir(remote_path))
        for name in sorted(names or []):
            if name in (".", ".."):
                continue
            full = remote_path.rstrip("/") + "/" + name if remote_path != "/" else "/" + name
            is_dir = False
            size = 0
            try:
                st = await _maybe(afc.stat(full)) if hasattr(afc, "stat") else None
                if st is not None:
                    st_mode = getattr(st, "st_ifmt", None) or (
                        st.get("st_ifmt") if isinstance(st, dict) else None
                    )
                    is_dir = str(st_mode or "").endswith("DIR") or bool(
                        getattr(st, "is_directory", False)
                    )
                    size = int(
                        getattr(st, "st_size", None)
                        or (st.get("st_size") if isinstance(st, dict) else 0)
                        or 0
                    )
            except Exception:
                is_dir = "." not in name
            items.append(
                {
                    "name": name,
                    "path": full,
                    "is_dir": is_dir,
                    "size": size,
                }
            )
    return {
        "ok": True,
        "path": remote_path,
        "items": items,
        "logs": [f"列出 {remote_path}（{len(items)} 项）"],
    }


def list_remote(udid: str, remote_path: str = "/") -> dict:
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备", "items": []}
    try:
        return _run(_async_listdir(udid, remote_path))
    except Exception as exc:
        return {"ok": False, "error": str(exc), "items": [], "logs": [str(exc)]}


async def _async_pull(udid: str, remote_paths: list[str]) -> dict:
    from pymobiledevice3.services.afc import AfcService

    logs: list[str] = []
    files: list[dict] = []
    local_dir = exchange_dir_for(udid)
    ld = await _create_lockdown(udid)
    async with AfcService(lockdown=ld) as afc:
        for remote in remote_paths:
            remote = (remote or "").strip()
            if not remote or ".." in remote.split("/"):
                logs.append(f"跳过非法路径: {remote}")
                continue
            name = Path(remote).name or f"file_{uuid.uuid4().hex[:6]}"
            local = local_dir / name
            if local.exists():
                local = local_dir / f"{uuid.uuid4().hex[:6]}_{name}"
            logs.append(f"拉取 {remote} → {local.name}")
            try:
                await _maybe(afc.pull(remote, str(local), progress_bar=False))
            except TypeError:
                await _maybe(afc.pull(remote, str(local)))
            if not local.is_file():
                logs.append(f"拉取后未找到文件: {local}")
                continue
            rel = str(local.relative_to(EXCHANGE_DIR)).replace("\\", "/")
            files.append(
                {
                    "name": local.name,
                    "path": str(local),
                    "rel": rel,
                    "size": local.stat().st_size,
                }
            )
            logs.append(f"完成 {local.name}（{round(local.stat().st_size / 1024, 1)} KB）")
    ok = bool(files)
    return {
        "ok": ok,
        "files": files,
        "logs": logs,
        "error": "" if ok else "没有成功拉取的文件",
    }


def pull_files(udid: str, remote_paths: list[str]) -> dict:
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备", "files": [], "logs": []}
    paths = [str(p).strip() for p in (remote_paths or []) if str(p).strip()]
    if not paths:
        return {"ok": False, "error": "未指定远程路径", "files": [], "logs": []}
    try:
        return _run(_async_pull(udid, paths))
    except Exception as exc:
        return {"ok": False, "error": str(exc), "files": [], "logs": [str(exc)]}


def _screenshot_bytes_to_png(raw: bytes) -> bytes:
    """设备可能返回 PNG 或 TIFF；统一写成 PNG 便于预览。"""
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return raw
    try:
        from io import BytesIO

        from PIL import Image

        img = Image.open(BytesIO(raw))
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return raw


async def _async_take_screenshot_bytes(udid: str, logs: list[str]) -> bytes:
    """优先 screenshotr，失败再试 DVT Instruments。"""
    from pymobiledevice3.services.screenshot import ScreenshotService

    errors: list[str] = []

    try:
        ld = await _create_lockdown(udid)
        async with ScreenshotService(lockdown=ld) as ss:
            data = await ss.take_screenshot()
        if data:
            logs.append("方式: screenshotr")
            return data
    except Exception as exc:
        errors.append(f"screenshotr: {exc}")
        logs.append(f"screenshotr 失败: {exc}")

    try:
        from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
        from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot

        ld = await _create_lockdown(udid)
        async with DvtProvider(ld) as dvt, Screenshot(dvt) as shot:
            data = await shot.get_screenshot()
        if data:
            logs.append("方式: DVT Instruments")
            return data
    except Exception as exc:
        errors.append(f"dvt: {exc}")
        logs.append(f"DVT 截屏失败: {exc}")

    hint = (
        "截屏失败。请确认手机已解锁、已开启「开发者模式」，"
        "并在本机信任此电脑。iOS 17+ 若仍失败，可能需先挂载开发者镜像"
        "（pymobiledevice3 mounter auto-mount）。"
    )
    detail = "；".join(errors) if errors else "无有效截屏数据"
    raise RuntimeError(f"{hint}（{detail}）")


async def _async_screencap(udid: str) -> dict:
    logs: list[str] = []
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    local_dir = exchange_dir_for(udid)
    local = local_dir / f"screencap_{stamp}.png"
    logs.append("正在截屏…")
    raw = await _async_take_screenshot_bytes(udid, logs)
    png = _screenshot_bytes_to_png(raw)
    local.write_bytes(png)
    rel = str(local.relative_to(EXCHANGE_DIR)).replace("\\", "/")
    logs.append(f"截屏已保存: {local.name}（{round(local.stat().st_size / 1024, 1)} KB）")
    return {
        "ok": True,
        "logs": logs,
        "path": str(local),
        "rel": rel,
        "name": local.name,
        "size": local.stat().st_size,
    }


def screencap_to_pc(udid: str) -> dict:
    """截取当前屏幕并保存到 data/ios_exchange/<udid>/。"""
    udid = (udid or "").strip()
    logs: list[str] = []
    if not udid:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    try:
        return _run(_async_screencap(udid))
    except Exception as exc:
        return {"ok": False, "error": str(exc), "logs": logs + [str(exc)]}


def _afc_is_dir(st) -> bool:
    if st is None:
        return False
    st_mode = getattr(st, "st_ifmt", None) or (st.get("st_ifmt") if isinstance(st, dict) else None)
    return str(st_mode or "").endswith("DIR") or bool(getattr(st, "is_directory", False))


def _afc_mtime_size(st) -> tuple[float, int]:
    if st is None:
        return 0.0, 0
    mtime = float(
        getattr(st, "st_mtime", None) or (st.get("st_mtime") if isinstance(st, dict) else 0) or 0
    )
    size = int(
        getattr(st, "st_size", None) or (st.get("st_size") if isinstance(st, dict) else 0) or 0
    )
    return mtime, size


async def _async_list_recent_media(udid: str, limit: int = 40) -> dict:
    """扫描 /DCIM/*APPLE + Downloads/Workbench 等，按 mtime 取最近。"""
    from pymobiledevice3.services.afc import AfcService

    logs: list[str] = []
    media_ext = {".jpg", ".jpeg", ".png", ".heic", ".gif", ".mov", ".mp4", ".webp"}
    candidates: list[tuple[float, dict]] = []
    dirs: list[str] = [PUSH_REMOTE_DIR, "/Downloads"]

    ld = await _create_lockdown(udid)
    async with AfcService(lockdown=ld) as afc:
        # 动态发现 DCIM 下 *APPLE / 其它相册目录
        try:
            dcim_names = await _maybe(afc.listdir("/DCIM"))
            for name in sorted(dcim_names or []):
                if name in (".", ".."):
                    continue
                upper = name.upper()
                if "APPLE" in upper or upper.startswith("100") or upper.startswith("101"):
                    dirs.append(f"/DCIM/{name}")
                elif re.match(r"^\d{3}", name):
                    dirs.append(f"/DCIM/{name}")
            logs.append(f"DCIM 子目录: {len([d for d in dirs if d.startswith('/DCIM/')])} 个")
        except Exception as exc:
            logs.append(f"列出 /DCIM 失败，回退默认目录: {exc}")
            dirs.extend(["/DCIM/100APPLE", "/DCIM/101APPLE"])

        # 去重保序
        seen_dirs: set[str] = set()
        uniq_dirs: list[str] = []
        for d in dirs:
            if d not in seen_dirs:
                seen_dirs.add(d)
                uniq_dirs.append(d)

        for d in uniq_dirs:
            try:
                names = await _maybe(afc.listdir(d))
            except Exception:
                continue
            logs.append(f"扫描 {d}")
            for name in names or []:
                if name in (".", ".."):
                    continue
                ext = Path(name).suffix.lower()
                if ext not in media_ext:
                    continue
                full = f"{d.rstrip('/')}/{name}"
                mtime, size = 0.0, 0
                try:
                    st = await _maybe(afc.stat(full))
                    mtime, size = _afc_mtime_size(st)
                except Exception:
                    pass
                candidates.append(
                    (
                        mtime,
                        {
                            "name": name,
                            "path": full,
                            "dir": d,
                            "size": size,
                            "thumbable": ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"},
                        },
                    )
                )

    candidates.sort(key=lambda x: x[0], reverse=True)
    lim = max(1, min(int(limit or 40), 120))
    items = [c[1] for c in candidates[:lim]]
    if not items:
        logs.append("未找到最近图片。可先拍照/截图，或把文件推到 Downloads/Workbench。")
    else:
        logs.append(f"共候选 {len(candidates)}，返回最近 {len(items)} 张")
    return {"ok": True, "items": items, "logs": logs}


def list_recent_media(udid: str, limit: int = 40) -> dict:
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备", "items": []}
    try:
        return _run(_async_list_recent_media(udid, limit=limit))
    except Exception as exc:
        return {"ok": False, "error": str(exc), "items": [], "logs": [str(exc)]}


async def _async_fetch_thumb(udid: str, remote_path: str, max_bytes: int = 8 * 1024 * 1024) -> dict:
    """拉取远程图片到缩略图缓存（原图直出，小文件优先）。"""
    from pymobiledevice3.services.afc import AfcService

    remote_path = (remote_path or "").strip()
    if not remote_path or ".." in remote_path.split("/"):
        return {"ok": False, "error": "非法路径"}
    ext = Path(remote_path).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}:
        return {"ok": False, "error": "不支持预览的类型"}

    safe = re.sub(r"[^\w.\-]+", "_", f"{_safe_udid_dir(udid)}_{remote_path}")
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    local = THUMB_DIR / safe
    if local.is_file() and local.stat().st_size > 0:
        rel = str(local.relative_to(EXCHANGE_DIR)).replace("\\", "/")
        return {"ok": True, "path": str(local), "rel": rel, "cached": True}

    ld = await _create_lockdown(udid)
    async with AfcService(lockdown=ld) as afc:
        try:
            st = await _maybe(afc.stat(remote_path))
            _, size = _afc_mtime_size(st)
            if size and size > max_bytes:
                return {"ok": False, "error": f"文件过大（{round(size / 1024 / 1024, 1)} MB），跳过预览"}
        except Exception:
            pass
        tmp = local.with_suffix(local.suffix + ".part")
        try:
            await _maybe(afc.pull(remote_path, str(tmp), progress_bar=False))
        except TypeError:
            await _maybe(afc.pull(remote_path, str(tmp)))
        if not tmp.is_file():
            return {"ok": False, "error": "拉取失败"}
        tmp.replace(local)
    rel = str(local.relative_to(EXCHANGE_DIR)).replace("\\", "/")
    return {"ok": True, "path": str(local), "rel": rel, "cached": False}


def fetch_thumb(udid: str, remote_path: str) -> dict:
    udid = (udid or "").strip()
    if not udid:
        return {"ok": False, "error": "未指定设备"}
    try:
        return _run(_async_fetch_thumb(udid, remote_path))
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
