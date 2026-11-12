"""本机 adb：无线连接 + 安装 APK（Web / CLI 共用）"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "adb_config.json"
DEFAULT_CONFIG = {
    "tcp_port": 28866,
    "apk_share_dir": "",
    "disconnect_before_connect": True,
    "scrcpy_path": "",
    "proxy_host": "192.168.0.101",
    "proxy_port": 9000,
    "proxy_history": [],
    # 已成功转无线的 IP:端口，切页回来自动 adb connect
    "remembered_wireless": [],
}
REMEMBERED_WIRELESS_MAX = 12
PROXY_HISTORY_MAX = 20

_install_lock = threading.Lock()
_install_jobs: dict[str, dict] = {}
_scrcpy_lock = threading.Lock()
_scrcpy_procs: dict[str, subprocess.Popen] = {}
# serial / model -> {brand, manufacturer, market_name, brand_cn}
_device_props_cache: dict[str, dict] = {}
_device_props_lock = threading.Lock()

_BRAND_CN = {
    "HONOR": "荣耀",
    "HUAWEI": "华为",
    "XIAOMI": "小米",
    "REDMI": "红米",
    "OPPO": "OPPO",
    "VIVO": "vivo",
    "REALME": "realme",
    "ONEPLUS": "一加",
    "SAMSUNG": "三星",
    "GOOGLE": "Google",
    "MOTOROLA": "摩托罗拉",
    "MEIZU": "魅族",
    "IQOO": "iQOO",
}


def _subprocess_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def _parse_proxy_port(value) -> int | None:
    try:
        port = int(value)
    except (TypeError, ValueError):
        return None
    if port < 1 or port > 65535:
        return None
    return port


def _normalize_proxy_history(raw) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return items
    for it in raw:
        if not isinstance(it, dict):
            continue
        host = str(it.get("host") or "").strip()
        port = _parse_proxy_port(it.get("port"))
        if not host or port is None:
            continue
        key = f"{host}:{port}"
        if key in seen:
            continue
        seen.add(key)
        items.append({
            "host": host,
            "port": port,
            "note": str(it.get("note") or "").strip()[:80],
        })
        if len(items) >= PROXY_HISTORY_MAX:
            break
    return items


def _remember_proxy(history, host: str, port, note: str | None = None) -> list[dict]:
    host = str(host or "").strip()
    port_n = _parse_proxy_port(port)
    items = _normalize_proxy_history(history)
    if not host or port_n is None:
        return items
    kept_note = ""
    rest = []
    for it in items:
        if it["host"] == host and it["port"] == port_n:
            kept_note = it.get("note") or ""
        else:
            rest.append(it)
    final_note = kept_note if note is None else str(note or "").strip()[:80]
    return [{"host": host, "port": port_n, "note": final_note}] + rest[: PROXY_HISTORY_MAX - 1]


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cfg.update(raw)
        except (OSError, json.JSONDecodeError):
            pass
    cfg["tcp_port"] = int(cfg.get("tcp_port") or 28866)
    cfg["apk_share_dir"] = str(cfg.get("apk_share_dir") or "").strip()
    cfg["disconnect_before_connect"] = bool(cfg.get("disconnect_before_connect", True))
    cfg["proxy_host"] = str(cfg.get("proxy_host") or DEFAULT_CONFIG["proxy_host"]).strip() or DEFAULT_CONFIG["proxy_host"]
    cfg["proxy_port"] = int(cfg.get("proxy_port") or DEFAULT_CONFIG["proxy_port"])
    cfg["proxy_history"] = _normalize_proxy_history(cfg.get("proxy_history"))
    cfg["remembered_wireless"] = _normalize_remembered_wireless(cfg.get("remembered_wireless"))
    return cfg


def save_config(updates: dict) -> dict:
    cfg = load_config()
    if "tcp_port" in updates and updates["tcp_port"] is not None:
        cfg["tcp_port"] = int(updates["tcp_port"])
    if "apk_share_dir" in updates:
        cfg["apk_share_dir"] = str(updates["apk_share_dir"] or "").strip()
    if "disconnect_before_connect" in updates:
        cfg["disconnect_before_connect"] = bool(updates["disconnect_before_connect"])
    if "scrcpy_path" in updates:
        cfg["scrcpy_path"] = str(updates["scrcpy_path"] or "").strip()
    if "proxy_host" in updates:
        cfg["proxy_host"] = str(updates["proxy_host"] or DEFAULT_CONFIG["proxy_host"]).strip() or DEFAULT_CONFIG["proxy_host"]
    if "proxy_port" in updates and updates["proxy_port"] is not None:
        parsed = _parse_proxy_port(updates["proxy_port"])
        cfg["proxy_port"] = parsed if parsed is not None else DEFAULT_CONFIG["proxy_port"]
    if "proxy_history" in updates:
        cfg["proxy_history"] = _normalize_proxy_history(updates.get("proxy_history"))
    else:
        cfg["proxy_history"] = _normalize_proxy_history(cfg.get("proxy_history"))
    if "proxy_host" in updates or "proxy_port" in updates:
        cfg["proxy_history"] = _remember_proxy(cfg.get("proxy_history"), cfg["proxy_host"], cfg["proxy_port"])
    if "remembered_wireless" in updates:
        cfg["remembered_wireless"] = _normalize_remembered_wireless(updates.get("remembered_wireless"))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def _normalize_remembered_wireless(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        t = str(item or "").strip()
        if not t or ":" not in t or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= REMEMBERED_WIRELESS_MAX:
            break
    return out


def remember_wireless_targets(*targets: str) -> list[str]:
    """把成功的无线串号写入配置（靠前优先）。"""
    cfg = load_config()
    cur = list(cfg.get("remembered_wireless") or [])
    for t in reversed([str(x or "").strip() for x in targets if str(x or "").strip()]):
        if ":" not in t:
            continue
        cur = [t] + [x for x in cur if x != t]
    cfg["remembered_wireless"] = _normalize_remembered_wireless(cur)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg["remembered_wireless"]


def forget_wireless_targets(*targets: str, clear_all: bool = False) -> list[str]:
    cfg = load_config()
    if clear_all:
        cfg["remembered_wireless"] = []
    else:
        drop = {str(x or "").strip() for x in targets if str(x or "").strip()}
        cfg["remembered_wireless"] = [x for x in (cfg.get("remembered_wireless") or []) if x not in drop]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg["remembered_wireless"]


def run_adb(args: list[str], timeout: float | None = 60, serial: str | None = None) -> tuple[int, str, str]:
    cmd = ["adb"]
    if serial:
        cmd.extend(["-s", serial])
    cmd.extend(args)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=_subprocess_flags(),
        )
        return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()
    except FileNotFoundError:
        return 127, "", "adb 未找到（请安装 Android platform-tools 并加入 PATH）"
    except subprocess.TimeoutExpired:
        return 124, "", f"命令超时: adb {' '.join(args)}"


def adb_status() -> dict:
    code, out, err = run_adb(["version"], timeout=10)
    ok = code == 0
    text = out or err
    version_line = ""
    for line in text.splitlines():
        if line.strip():
            version_line = line.strip()
            break
    return {
        "ok": ok,
        "available": ok,
        "version": version_line if ok else "",
        "error": "" if ok else (err or out or "adb 不可用"),
    }


def parse_devices(raw: str) -> list[dict]:
    devices = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("List of devices"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        serial, state = parts[0], parts[1]
        info = {
            "serial": serial,
            "state": state,
            "transport": "unknown",
            "model": "",
            "product": "",
            "brand": "",
            "manufacturer": "",
            "market_name": "",
            "brand_cn": "",
        }
        if ":" in serial and state == "device":
            info["transport"] = "wireless"
        elif state == "device":
            info["transport"] = "usb"
        for token in parts[2:]:
            if ":" in token:
                k, v = token.split(":", 1)
                if k == "model":
                    info["model"] = v
                elif k == "product":
                    info["product"] = v
                elif k == "transport_id":
                    info["transport_id"] = v
        devices.append(info)
    return devices


def _brand_cn(brand: str) -> str:
    key = (brand or "").strip().upper()
    return _BRAND_CN.get(key, brand or "")


def _read_device_props(serial: str) -> dict:
    """读品牌/市场名；失败也返回空字段，避免拖垮列表。"""
    props = {"brand": "", "manufacturer": "", "market_name": "", "brand_cn": ""}
    if not serial:
        return props
    keys = [
        ("ro.product.brand", "brand"),
        ("ro.product.manufacturer", "manufacturer"),
        ("ro.config.marketing_name", "market_name"),
        ("ro.product.marketname", "market_name"),
        ("ro.oppo.market.name", "market_name"),
    ]
    for prop, field in keys:
        if field == "market_name" and props["market_name"]:
            continue
        code, out, _err = run_adb(["shell", "getprop", prop], timeout=3, serial=serial)
        val = (out or "").strip()
        if code == 0 and val and val not in ("", "unknown"):
            props[field] = val
    props["brand_cn"] = _brand_cn(props["brand"] or props["manufacturer"])
    return props


def _enrich_devices(devices: list[dict]) -> list[dict]:
    """为在线设备补品牌信息（带缓存，避免每次刷新都 shell）。"""
    need: list[dict] = []
    with _device_props_lock:
        for d in devices:
            if d.get("state") != "device":
                continue
            serial = d.get("serial") or ""
            model = d.get("model") or ""
            cached = _device_props_cache.get(serial) or (
                _device_props_cache.get(f"model:{model}") if model else None
            )
            if cached:
                d.update(cached)
            else:
                need.append(d)

    if not need:
        return devices

    def _fill(d: dict) -> None:
        serial = d.get("serial") or ""
        props = _read_device_props(serial)
        d.update(props)
        with _device_props_lock:
            _device_props_cache[serial] = props
            model = d.get("model") or ""
            if model and (props.get("brand") or props.get("market_name")):
                _device_props_cache[f"model:{model}"] = props

    with ThreadPoolExecutor(max_workers=min(6, len(need))) as pool:
        list(pool.map(_fill, need))
    return devices


def list_devices() -> dict:
    status = adb_status()
    if not status["available"]:
        return {"ok": False, "error": status["error"], "devices": [], "status": status}
    code, out, err = run_adb(["devices", "-l"], timeout=20)
    if code != 0:
        return {"ok": False, "error": err or out or "adb devices 失败", "devices": [], "status": status}
    devices = _enrich_devices(parse_devices(out))
    return {"ok": True, "devices": devices, "status": status, "raw": out}


def _pick_usb_device(devices: list[dict]) -> dict | None:
    ready = [d for d in devices if d.get("state") == "device"]
    usb = [d for d in ready if d.get("transport") == "usb" or ":" not in d.get("serial", "")]
    if usb:
        return usb[0]
    return ready[0] if ready else None


def _parse_ip_from_shell(text: str) -> str:
    text = text or ""
    # inet 192.168.x.x/24
    m = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", text)
    if m:
        ip = m.group(1)
        if not ip.startswith("127."):
            return ip
    # plain IP
    for m in re.finditer(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b", text):
        ip = m.group(1)
        if ip.startswith("127.") or ip.startswith("0."):
            continue
        return ip
    return ""


def get_device_ip(serial: str, logs: list[str] | None = None) -> str:
    log = logs if logs is not None else []
    commands = [
        ["shell", "ip", "-f", "inet", "addr", "show", "wlan0"],
        ["shell", "ip", "-f", "inet", "addr", "show", "wlan1"],
        ["shell", "ifconfig", "wlan0"],
        ["shell", "getprop", "dhcp.wlan0.ipaddress"],
        ["shell", "ip", "route"],
    ]
    for args in commands:
        code, out, err = run_adb(args, timeout=15, serial=serial)
        blob = out or err
        ip = _parse_ip_from_shell(blob)
        if ip:
            log.append(f"检测到设备 IP: {ip}（via {' '.join(args[1:])}）")
            return ip
    # ip route get 默认网关侧
    code, out, err = run_adb(["shell", "ip", "route", "get", "1.1.1.1"], timeout=10, serial=serial)
    ip = _parse_ip_from_shell(out or err)
    if ip:
        log.append(f"检测到设备 IP: {ip}（via ip route get）")
        return ip
    log.append("未能自动获取设备局域网 IP，请确认手机已连 Wi‑Fi")
    return ""


def _wireless_connect_one(
    serial: str,
    port: int,
    logs: list[str],
    *,
    model: str = "",
) -> dict:
    """对单台 USB 设备执行 tcpip + connect，结果写入 logs。"""
    label = f"{serial}" + (f" ({model})" if model else "")
    logs.append(f"—— 处理设备: {label} ——")
    ip = get_device_ip(serial, logs)
    if not ip:
        return {"ok": False, "error": "无法获取设备 IP", "serial": serial}

    logs.append(f"切换 TCP/IP 模式，端口 {port}…")
    code, out, err = run_adb(["tcpip", str(port)], timeout=20, serial=serial)
    if out:
        logs.append(out)
    if err:
        logs.append(err)
    if code != 0:
        msg = err or out or "tcpip 失败"
        logs.append(msg)
        return {"ok": False, "error": msg, "serial": serial, "ip": ip, "port": port}

    time.sleep(1.0)
    target = f"{ip}:{port}"
    logs.append(f"正在连接 {target} …")
    code, out, err = run_adb(["connect", target], timeout=30)
    msg = out or err
    if msg:
        logs.append(msg)
    ok = code == 0 and "connected" in (msg or "").lower()
    if not ok and code == 0 and "already connected" in (msg or "").lower():
        ok = True
    if not ok:
        listed2 = list_devices()
        wireless = [
            d
            for d in listed2.get("devices", [])
            if d.get("serial") == target and d.get("state") == "device"
        ]
        ok = bool(wireless)
        if ok:
            logs.append(f"已确认无线设备在线: {target}")

    if ok:
        logs.append(f"无线连接成功: {target}")
        return {
            "ok": True,
            "serial": serial,
            "ip": ip,
            "port": port,
            "target": target,
        }

    err_msg = msg or "无线连接失败"
    logs.append(err_msg)
    return {
        "ok": False,
        "error": err_msg,
        "serial": serial,
        "ip": ip,
        "port": port,
        "target": target,
    }


def wireless_connect(
    port: int | None = None,
    disconnect_first: bool | None = None,
    serial: str | None = None,
    all_usb: bool = False,
) -> dict:
    """USB → tcpip → 无线连接。

    - serial: 指定 USB 序列号（多设备时用）
    - all_usb: 对当前所有 USB 设备依次转无线
    """
    cfg = load_config()
    port = int(port if port is not None else cfg["tcp_port"])
    if disconnect_first is None:
        # 指定单机时默认不断开其它无线设备，避免多机互相踢
        disconnect_first = False if (serial or all_usb) else cfg["disconnect_before_connect"]

    logs: list[str] = []
    logs.append("=" * 48)
    logs.append("一键远程 ADB 连接安卓测试机")
    logs.append("=" * 48)

    status = adb_status()
    if not status["available"]:
        logs.append(status["error"])
        return {"ok": False, "error": status["error"], "logs": logs}

    if disconnect_first:
        logs.append("清理已有 TCP 连接…")
        run_adb(["disconnect"], timeout=15)
        time.sleep(0.3)

    listed = list_devices()
    if not listed.get("ok"):
        logs.append(listed.get("error") or "无法列出设备")
        return {"ok": False, "error": listed.get("error"), "logs": logs}

    devices = listed["devices"]
    ready_usb = [
        d
        for d in devices
        if d.get("state") == "device" and (d.get("transport") == "usb" or ":" not in d.get("serial", ""))
    ]

    if all_usb:
        if not ready_usb:
            logs.append("未发现 USB 设备。请用 USB 连接并开启调试。")
            return {"ok": False, "error": "未发现 USB 设备", "logs": logs, "devices": devices}
        results = []
        for d in ready_usb:
            results.append(
                _wireless_connect_one(d["serial"], port, logs, model=d.get("model") or "")
            )
            time.sleep(0.4)
        ok_n = sum(1 for r in results if r.get("ok"))
        logs.append(f"完成：成功 {ok_n}/{len(results)}")
        targets = [r.get("target") for r in results if r.get("ok") and r.get("target")]
        if targets:
            remember_wireless_targets(*targets)
        return {
            "ok": ok_n > 0,
            "error": "" if ok_n else "全部失败",
            "logs": logs,
            "results": results,
            "targets": targets,
            "devices": list_devices().get("devices", []),
        }

    if serial:
        match = next((d for d in devices if d.get("serial") == serial), None)
        if not match:
            logs.append(f"设备不在列表中: {serial}")
            return {"ok": False, "error": "设备不在列表中", "logs": logs, "devices": devices}
        if match.get("state") != "device":
            logs.append(f"设备未就绪: {serial} ({match.get('state')})")
            return {"ok": False, "error": "设备未就绪", "logs": logs, "serial": serial, "devices": devices}
        # 已是无线：直接视为成功
        if ":" in serial:
            logs.append(f"已是无线连接: {serial}")
            remember_wireless_targets(serial)
            return {
                "ok": True,
                "serial": serial,
                "target": serial,
                "logs": logs,
                "devices": devices,
            }
        one = _wireless_connect_one(serial, port, logs, model=match.get("model") or "")
        if one.get("ok") and one.get("target"):
            remember_wireless_targets(one["target"])
        one["logs"] = logs
        one["devices"] = list_devices().get("devices", [])
        return one

    usb = _pick_usb_device(devices)
    if not usb:
        logs.append("未发现已连接设备。请用 USB 连接并开启 USB 调试。")
        return {"ok": False, "error": "未发现 USB 设备", "logs": logs, "devices": devices}

    one = _wireless_connect_one(usb["serial"], port, logs, model=usb.get("model") or "")
    if one.get("ok") and one.get("target"):
        remember_wireless_targets(one["target"])
    one["logs"] = logs
    one["devices"] = list_devices().get("devices", [])
    return one


def disconnect(target: str | None = None) -> dict:
    logs: list[str] = []
    if target:
        code, out, err = run_adb(["disconnect", target], timeout=15)
        logs.append(out or err or f"disconnect {target}")
        forget_wireless_targets(str(target).strip())
    else:
        code, out, err = run_adb(["disconnect"], timeout=15)
        logs.append(out or err or "disconnect all")
        forget_wireless_targets(clear_all=True)
    return {"ok": code == 0, "logs": logs, "error": "" if code == 0 else (err or out)}


def _is_auto_reconnect_target(target: str) -> bool:
    """跳过本机模拟器端口等，避免每次打开装包页都去 connect 死地址。"""
    t = (target or "").strip().lower()
    if not t or ":" not in t:
        return False
    host, _, port = t.partition(":")
    if host in ("127.0.0.1", "localhost", "::1"):
        return False
    # MuMu / 常见本机 ADB 端口也不自动补连
    if port in ("16384", "16416", "16448", "7555", "5555"):
        return False
    return True


def reconnect_remembered() -> dict:
    """对配置中记忆的无线设备执行 adb connect（仅补连离线的）。

    注意：离线 IP 的 ``adb connect`` 在 Windows 上常要 20s+ 才失败。
    这里用短超时，且不在循环里反复 ``devices``，避免装包页卡在「加载中」。
    """
    listed = list_devices()
    devices = listed.get("devices") or []
    # 已在线的无线也写入记忆，避免升级前连上的机子丢记录
    online_wireless = [
        d.get("serial")
        for d in devices
        if d.get("state") == "device" and ":" in str(d.get("serial") or "")
    ]
    if online_wireless:
        remember_wireless_targets(*online_wireless)

    cfg = load_config()
    remembered = list(cfg.get("remembered_wireless") or [])
    if not remembered:
        return {
            "ok": True,
            "attempted": False,
            "logs": [],
            "remembered": remembered,
            "devices": devices,
        }

    online = {
        d.get("serial")
        for d in devices
        if d.get("state") == "device" and d.get("serial")
    }
    missing = [
        t for t in remembered if t not in online and _is_auto_reconnect_target(t)
    ]
    skipped = [
        t for t in remembered if t not in online and not _is_auto_reconnect_target(t)
    ]
    if not missing:
        return {
            "ok": True,
            "attempted": False,
            "logs": ([f"跳过本机/模拟器地址: {', '.join(skipped)}"] if skipped else []),
            "remembered": remembered,
            "devices": devices,
            "skipped": skipped,
        }

    logs: list[str] = []
    logs.append(f"自动重连已记忆无线设备（缺 {len(missing)}/{len(remembered)}）…")
    if skipped:
        logs.append(f"跳过本机/模拟器地址: {', '.join(skipped)}")
    # 短超时 + 并行：宁可漏连，也不阻塞刷新；用户可手动点「刷新」或转无线
    connect_timeout = 4.0

    def _try_connect(target: str) -> tuple[str, int, str, bool]:
        code, out, err = run_adb(["connect", target], timeout=connect_timeout)
        msg = (out or err or "").strip()
        if code == 124:
            msg = msg or f"连接超时（>{int(connect_timeout)}s，已跳过）"
        low = msg.lower()
        ok = code == 0 and ("connected" in low or "already" in low)
        return target, code, msg, ok

    ok_n = 0
    with ThreadPoolExecutor(max_workers=min(6, len(missing))) as pool:
        futures = [pool.submit(_try_connect, t) for t in missing]
        for fut in as_completed(futures):
            target, _code, msg, ok = fut.result()
            logs.append(f"{target}: {msg or ('ok' if ok else '失败')}")
            if ok:
                ok_n += 1

    final = list_devices().get("devices") or []
    return {
        "ok": ok_n > 0,
        "attempted": True,
        "reconnected": ok_n,
        "missing": missing,
        "skipped": skipped,
        "logs": logs,
        "remembered": remembered,
        "devices": final,
        "error": "" if ok_n > 0 else "记忆设备重连失败（手机可能已休眠或换了 IP）",
    }


def find_latest_apk(share_dir: str | None = None) -> dict:
    cfg = load_config()
    raw = (share_dir if share_dir is not None else cfg["apk_share_dir"]).strip()
    if not raw:
        return {"ok": False, "error": "未配置共享 APK 目录（可在面板中设置）"}
    folder = Path(raw)
    if not folder.is_absolute():
        folder = (ROOT / folder).resolve()
    if not folder.is_dir():
        return {"ok": False, "error": f"共享目录不存在: {folder}"}
    apks = list(folder.rglob("*.apk")) + list(folder.rglob("*.APK"))
    # rglob 可能重复大小写无关；去重
    uniq = {p.resolve(): p for p in apks}
    apks = list(uniq.values())
    if not apks:
        return {"ok": False, "error": f"共享目录下没有 APK: {folder}"}
    latest = max(apks, key=lambda p: p.stat().st_mtime)
    size = latest.stat().st_size
    return {
        "ok": True,
        "path": str(latest),
        "name": latest.name,
        "size": size,
        "size_mb": round(size / (1024 * 1024), 2),
        "mtime": datetime.fromtimestamp(latest.stat().st_mtime).isoformat(timespec="seconds"),
    }


def _normalize_proxy_value(raw: str) -> str:
    value = (raw or "").strip()
    if value in ("null", "None", ":0", ""):
        return ""
    return value


def get_proxy(serial: str | None = None) -> dict:
    code, out, err = run_adb(["shell", "settings", "get", "global", "http_proxy"], timeout=15, serial=serial)
    value = _normalize_proxy_value(out or err)
    return {
        "ok": code == 0,
        "value": value,
        "enabled": bool(value),
        "error": "" if code == 0 else (err or out or "读取代理失败"),
    }


def set_proxy(host: str, port: int | str, serial: str | None = None) -> dict:
    host = (host or "").strip()
    try:
        port_n = int(port)
    except (TypeError, ValueError):
        return {"ok": False, "error": "端口无效", "logs": []}
    if not host:
        return {"ok": False, "error": "代理 IP 不能为空", "logs": []}
    if port_n < 1 or port_n > 65535:
        return {"ok": False, "error": "端口须在 1–65535", "logs": []}
    proxy = f"{host}:{port_n}"
    logs = [f"设置系统 HTTP 代理: {proxy}"]
    code, out, err = run_adb(
        ["shell", "settings", "put", "global", "http_proxy", proxy],
        timeout=15,
        serial=serial,
    )
    text = "\n".join(x for x in (out, err) if x)
    if text:
        logs.append(text)
    if code != 0:
        return {"ok": False, "error": text or "设置代理失败", "logs": logs}
    current = get_proxy(serial=serial)
    if current.get("value") == proxy:
        logs.append("代理已生效")
        return {"ok": True, "value": proxy, "logs": logs}
    logs.append(f"当前代理: {current.get('value') or '未开启'}")
    return {
        "ok": bool(current.get("enabled")),
        "value": current.get("value") or "",
        "error": "" if current.get("enabled") else "设置后未检测到代理，请确认设备在线",
        "logs": logs,
    }


def clear_proxy(serial: str | None = None) -> dict:
    logs = ["关闭系统 HTTP 代理"]
    code, out, err = run_adb(
        ["shell", "settings", "put", "global", "http_proxy", ":0"],
        timeout=15,
        serial=serial,
    )
    text = "\n".join(x for x in (out, err) if x)
    if text:
        logs.append(text)
    if code != 0:
        return {"ok": False, "error": text or "关闭代理失败", "logs": logs}
    current = get_proxy(serial=serial)
    if not current.get("enabled"):
        logs.append("代理已关闭")
        return {"ok": True, "value": "", "logs": logs}
    logs.append(f"当前代理仍为: {current.get('value')}")
    return {
        "ok": False,
        "error": "关闭后仍检测到代理",
        "value": current.get("value") or "",
        "logs": logs,
    }


def _hint_for_install_output(text: str) -> str:
    t = text or ""
    if "INSTALL_FAILED_ABORTED" in t or "User rejected" in t:
        return "请在手机屏幕上点「允许/安装」，不要拒绝权限。"
    if "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in t:
        return "已安装版本签名不一致，可先卸载旧包再装。"
    if "INSTALL_FAILED_INSUFFICIENT_STORAGE" in t:
        return "手机存储空间不足。"
    if "device offline" in t.lower() or "no devices" in t.lower():
        return "设备离线，请重新一键无线连接。"
    return ""


def install_apk(apk_path: str, serial: str | None = None) -> dict:
    path = Path(apk_path)
    logs: list[str] = []
    if not path.is_file():
        return {"ok": False, "error": f"APK 不存在: {path}", "logs": logs}
    size = path.stat().st_size
    logs.append(f"安装文件: {path.name}（{round(size / (1024 * 1024), 2)} MB）")
    # 大包：放宽超时（约 30 分钟）
    timeout = max(600, int(size / (1024 * 50)) + 120)
    logs.append("Performing Streamed Install …")
    args = ["install", "-r", str(path)]
    code, out, err = run_adb(args, timeout=timeout, serial=serial)
    text = "\n".join(x for x in (out, err) if x)
    if text:
        logs.append(text)
    ok = code == 0 and ("Success" in text or not text)
    if code == 0 and "Failure" in text:
        ok = False
    hint = _hint_for_install_output(text)
    if hint:
        logs.append(hint)
    if ok:
        logs.append("安装成功")
        return {"ok": True, "logs": logs, "path": str(path)}
    return {
        "ok": False,
        "error": text or "安装失败",
        "hint": hint,
        "logs": logs,
        "path": str(path),
    }


def _set_job(job_id: str, **kwargs):
    with _install_lock:
        job = _install_jobs.setdefault(job_id, {})
        job.update(kwargs)
        job["updated_at"] = time.time()


def _resolve_scrcpy_candidate(p: Path) -> str:
    """接受 exe 路径或所在目录，返回可用的 scrcpy.exe。"""
    if p.is_file() and p.name.lower() in ("scrcpy.exe", "scrcpy"):
        return str(p.resolve())
    if p.is_dir():
        for name in ("scrcpy.exe", "scrcpy"):
            cand = p / name
            if cand.is_file():
                return str(cand.resolve())
    # 配置写成目录名但末尾带了多余空格/引号后仍可能是文件
    if p.is_file():
        return str(p.resolve())
    return ""


def find_scrcpy() -> str:
    """查找 scrcpy 可执行文件（配置路径 → PATH → 常见安装位置）。"""
    import shutil

    cfg = load_config()
    custom = str(cfg.get("scrcpy_path") or "").strip().strip('"')
    if custom:
        resolved = _resolve_scrcpy_candidate(Path(custom))
        if resolved:
            return resolved
    found = shutil.which("scrcpy") or shutil.which("scrcpy.exe")
    if found:
        return found
    if sys.platform == "win32":
        candidates = [
            Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / "scrcpy.exe",
            Path(os.environ.get("ProgramFiles", "")) / "scrcpy" / "scrcpy.exe",
            Path(os.environ.get("ProgramFiles(x86)", "")) / "scrcpy" / "scrcpy.exe",
            Path(r"F:\Download\scrcpy-win64-v4.1\scrcpy.exe"),
            Path(r"D:\Download\scrcpy-win64-v4.1\scrcpy.exe"),
            Path(r"C:\scrcpy\scrcpy.exe"),
        ]
        # F:\Download\scrcpy-* 解压目录
        for base in (Path(r"F:\Download"), Path(r"D:\Download"), Path.home() / "Downloads"):
            if not base.is_dir():
                continue
            try:
                for d in base.glob("scrcpy*"):
                    if d.is_dir():
                        candidates.append(d / "scrcpy.exe")
            except OSError:
                pass
        for c in candidates:
            resolved = _resolve_scrcpy_candidate(c)
            if resolved:
                return resolved
    return ""


def scrcpy_status(serial: str | None = None) -> dict:
    with _scrcpy_lock:
        if serial:
            proc = _scrcpy_procs.get(serial)
            running = proc is not None and proc.poll() is None
            return {
                "ok": True,
                "serial": serial,
                "running": running,
                "pid": proc.pid if running else None,
            }
        active = {}
        dead = []
        for s, proc in _scrcpy_procs.items():
            if proc.poll() is None:
                active[s] = proc.pid
            else:
                dead.append(s)
        for s in dead:
            del _scrcpy_procs[s]
        return {"ok": True, "running": active}


def start_scrcpy(serial: str) -> dict:
    serial = (serial or "").strip()
    if not serial:
        return {"ok": False, "error": "未指定设备 serial"}
    exe = find_scrcpy()
    if not exe:
        return {
            "ok": False,
            "error": "未找到 scrcpy。请安装 https://github.com/Genymobile/scrcpy 并加入 PATH，或在 adb 配置中填写 scrcpy_path",
        }
    with _scrcpy_lock:
        proc = _scrcpy_procs.get(serial)
        if proc and proc.poll() is None:
            return {"ok": True, "serial": serial, "pid": proc.pid, "already_running": True}
        try:
            cwd = str(Path(exe).parent)
            proc = subprocess.Popen(
                [exe, "-s", serial, "--window-title", f"Workbench · {serial}"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=cwd,
            )
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
        _scrcpy_procs[serial] = proc
        return {"ok": True, "serial": serial, "pid": proc.pid, "path": exe}


def stop_scrcpy(serial: str | None = None) -> dict:
    with _scrcpy_lock:
        if not serial:
            stopped = []
            for s, proc in list(_scrcpy_procs.items()):
                if proc.poll() is None:
                    proc.terminate()
                    stopped.append(s)
                del _scrcpy_procs[s]
            return {"ok": True, "stopped": stopped}
        serial = serial.strip()
        proc = _scrcpy_procs.pop(serial, None)
        if not proc:
            return {"ok": True, "serial": serial, "was_running": False}
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        return {"ok": True, "serial": serial, "was_running": True}


def get_install_job(job_id: str) -> dict | None:
    with _install_lock:
        job = _install_jobs.get(job_id)
        return dict(job) if job else None


def start_install_job(
    *,
    source: str,
    serial: str | None = None,
    apk_path: str | None = None,
    share_dir: str | None = None,
) -> dict:
    """source: upload | latest | path"""
    logs: list[str] = []
    resolved = ""

    if source == "latest":
        info = find_latest_apk(share_dir)
        if not info.get("ok"):
            return {"ok": False, "error": info.get("error")}
        resolved = info["path"]
        logs.append(f"选用共享目录最新包: {info['name']}（{info['size_mb']} MB）")
    elif source in ("path", "upload"):
        if not apk_path:
            return {"ok": False, "error": "缺少 APK 路径"}
        resolved = apk_path
    else:
        return {"ok": False, "error": f"未知 source: {source}"}

    job_id = uuid.uuid4().hex[:12]
    _set_job(
        job_id,
        id=job_id,
        status="running",
        ok=None,
        logs=list(logs),
        path=resolved,
        serial=serial or "",
        error="",
        hint="",
        started_at=time.time(),
    )

    def worker():
        result = install_apk(resolved, serial=serial or None)
        merged_logs = logs + list(result.get("logs") or [])
        _set_job(
            job_id,
            status="done" if result.get("ok") else "failed",
            ok=bool(result.get("ok")),
            logs=merged_logs,
            error=result.get("error") or "",
            hint=result.get("hint") or "",
            finished_at=time.time(),
        )

    threading.Thread(target=worker, daemon=True).start()
    return {"ok": True, "job_id": job_id, "path": resolved, "logs": logs}


# ---------- 电脑 ↔ 手机 交换 ----------

EXCHANGE_DIR = DATA_DIR / "adb_exchange"
_MEDIA_DIRS = (
    "/sdcard/DCIM/Camera",
    "/sdcard/DCIM/Screenshots",
    "/sdcard/Pictures/Screenshots",
    "/sdcard/Pictures",
    "/sdcard/Download",
)
_MEDIA_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".bmp"}


def _safe_serial_dir(serial: str) -> str:
    return re.sub(r"[^\w.\-]+", "_", (serial or "device").strip()) or "device"


def exchange_dir_for(serial: str) -> Path:
    d = EXCHANGE_DIR / _safe_serial_dir(serial)
    d.mkdir(parents=True, exist_ok=True)
    return d


def resolve_exchange_file(rel_or_abs: str) -> Path | None:
    """仅允许 data/adb_exchange 下的文件。"""
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


def _sh_single_quote(s: str) -> str:
    """给 adb shell 用的单引号包裹（保护 & ? = 等特殊字符）。"""
    return "'" + str(s).replace("'", "'\"'\"'") + "'"


def open_url_on_device(serial: str, url: str) -> dict:
    serial = (serial or "").strip()
    url = (url or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    if not re.match(r"^https?://", url, re.I):
        return {"ok": False, "error": "仅支持 http:// 或 https:// 链接", "logs": logs}
    logs.append(f"完整链接（{len(url)} 字）: {url}")
    # adb shell 会经设备 sh 解析：URL 里的 & 会被当成后台符，必须整段加引号
    q = _sh_single_quote(url)
    cmd = f"am start -a android.intent.action.VIEW -d {q}"
    code, out, err = run_adb(["shell", cmd], timeout=20, serial=serial)
    for chunk in (out, err):
        if not chunk:
            continue
        # am 自己的 Starting: Intent { dat=... } 会省略长 URI，勿当成真实截断
        cleaned = []
        for line in chunk.splitlines():
            if "Starting: Intent" in line and "dat=" in line:
                cleaned.append("（系统 Intent 日志会省略长链接，以上「完整链接」为准）")
            else:
                cleaned.append(line)
        logs.append("\n".join(cleaned))
    ok = code == 0 and "Error" not in (out or "") and "Error" not in (err or "")
    if not ok:
        cmd2 = f"am start -a android.intent.action.VIEW -d {q} -t text/html"
        code2, out2, err2 = run_adb(["shell", cmd2], timeout=20, serial=serial)
        for chunk in (out2, err2):
            if chunk:
                logs.append(chunk)
        ok = code2 == 0 and "Error" not in (out2 or "") and "Error" not in (err2 or "")
        code, out, err = code2, out2, err2
    if ok:
        logs.append("已触发手机打开链接（默认浏览器）")
        return {"ok": True, "logs": logs, "url": url}
    return {
        "ok": False,
        "error": err or out or "打开链接失败",
        "logs": logs,
        "url": url,
    }


def share_text_on_device(serial: str, text: str) -> dict:
    """尝试用系统分享面板发送纯文字（机型差异较大）。"""
    serial = (serial or "").strip()
    text = (text or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    if not text:
        return {"ok": False, "error": "文字为空", "logs": logs}
    if len(text) > 2000:
        return {"ok": False, "error": "文字过长（最多 2000 字）", "logs": logs}
    logs.append(f"分享文本到手机（{len(text)} 字）")
    # 参数列表形式交给 adb，避免 shell 二次转义；换行改空格更稳
    safe = text.replace("\r", " ").replace("\n", " ")
    code, out, err = run_adb(
        [
            "shell",
            "am",
            "start",
            "-a",
            "android.intent.action.SEND",
            "-t",
            "text/plain",
            "--es",
            "android.intent.extra.TEXT",
            safe,
        ],
        timeout=20,
        serial=serial,
    )
    if out:
        logs.append(out)
    if err:
        logs.append(err)
    ok = code == 0 and "Error" not in (out or "") and "Error" not in (err or "")
    if ok:
        logs.append("已打开系统分享面板，请在手机上选择目标应用")
        return {"ok": True, "logs": logs}
    return {"ok": False, "error": err or out or "分享失败", "logs": logs}


def _parse_dumpsys_clipboard(raw: str) -> str:
    """从 dumpsys clipboard 尽力提取纯文本。"""
    text = raw or ""
    if not text.strip():
        return ""
    # 常见：ClipData { text/plain {T:内容} } 或 Primary clip: ...
    patterns = [
        r"\{T:([^}]*)\}",
        r"text/plain[^:]*:\s*(.+)$",
        r"mText[=:]\s*(.+)$",
        r"ClipData\s*\{[^}]*text/plain[^}]*\}\s*(.+)$",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, re.I | re.M):
            val = (m.group(1) or "").strip()
            if val and val not in ("null", "NULL"):
                return val
    # 退化：找带引号的长字符串
    m = re.search(r'"([^"\n]{1,4000})"', text)
    if m:
        return m.group(1)
    return ""


def _ensure_devicekit(serial: str, logs: list[str]) -> Path | None:
    """确保设备上有 devicekit.dex（仅 push，不安装 App）。"""
    local = Path(__file__).resolve().parent / "tools" / "devicekit.dex"
    if not local.is_file():
        logs.append(f"本地缺少 helper: {local}")
        return None
    remote = "/data/local/tmp/devicekit.dex"
    code, out, err = run_adb(["shell", "ls", remote], timeout=10, serial=serial)
    need_push = code != 0 or "No such file" in (out + err) or "No such" in (out + err)
    if not need_push:
        # 粗略比大小
        code2, out2, _ = run_adb(["shell", "stat", "-c", "%s", remote], timeout=10, serial=serial)
        try:
            remote_size = int((out2 or "").strip().splitlines()[-1])
            if remote_size != local.stat().st_size:
                need_push = True
        except (ValueError, IndexError, OSError):
            need_push = True
    if need_push:
        logs.append("推送剪贴板 helper → 手机 /data/local/tmp/devicekit.dex")
        code, out, err = run_adb(["push", str(local), remote], timeout=60, serial=serial)
        if code != 0:
            logs.append(err or out or "push 失败")
            return None
    return local


def _clipboard_via_devicekit(serial: str, logs: list[str]) -> str | None:
    if not _ensure_devicekit(serial, logs):
        return None
    code, out, err = run_adb(
        [
            "shell",
            "env",
            "CLASSPATH=/data/local/tmp/devicekit.dex",
            "app_process",
            "/",
            "com.mobilenext.devicekit.Clipboard",
            "get",
        ],
        timeout=20,
        serial=serial,
    )
    text = (out or "").strip()
    # devicekit 失败时常把错误打在 stderr
    if code != 0:
        logs.append(err or out or "devicekit Clipboard get 失败")
        return None
    if err and not text:
        logs.append(err)
        return None
    # 去掉可能的日志前缀行
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return ""
    return "\n".join(lines)


def _clipboard_via_adb_clip(serial: str, logs: list[str]) -> str | None:
    base = Path(__file__).resolve().parent / "tools" / "adb-clip"
    jar = base / "clip.jar"
    script = base / "clip"
    if not jar.is_file() or not script.is_file():
        return None
    for local, remote in ((jar, "/data/local/tmp/clip.jar"), (script, "/data/local/tmp/clip")):
        code, _, _ = run_adb(["shell", "ls", remote], timeout=8, serial=serial)
        if code != 0:
            logs.append(f"推送 {local.name}")
            c2, o2, e2 = run_adb(["push", str(local), remote], timeout=30, serial=serial)
            if c2 != 0:
                logs.append(e2 or o2 or "push 失败")
                return None
    run_adb(["shell", "chmod", "755", "/data/local/tmp/clip"], timeout=8, serial=serial)
    code, out, err = run_adb(["shell", "/data/local/tmp/clip"], timeout=20, serial=serial)
    if code != 0 and not (out or "").strip():
        logs.append(err or out or "adb-clip 失败")
        return None
    return (out or "").strip()


def get_clipboard_from_device(serial: str) -> dict:
    """读取手机剪贴板文本（尽量不装 App；部分机型需亮屏解锁）。"""
    serial = (serial or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs, "text": ""}

    logs.append("读取手机剪贴板…")

    # 1) cmd clipboard（部分系统有）
    code, out, err = run_adb(["shell", "cmd", "clipboard", "get"], timeout=15, serial=serial)
    text = (out or "").strip()
    if code == 0 and text and "No shell command" not in text and "Exception" not in text:
        logs.append("方式: cmd clipboard get")
        return {"ok": True, "text": text, "logs": logs}

    # 2) devicekit.dex（无需安装）
    dk = _clipboard_via_devicekit(serial, logs)
    if dk is not None:
        logs.append("方式: devicekit Clipboard get")
        if dk == "":
            return {
                "ok": False,
                "error": "剪贴板为空。请先在手机上复制一段文字，并保持亮屏解锁后再试。",
                "text": "",
                "logs": logs,
            }
        return {"ok": True, "text": dk, "logs": logs}

    # 3) adb-clip
    ac = _clipboard_via_adb_clip(serial, logs)
    if ac is not None:
        logs.append("方式: adb-clip")
        if ac == "":
            return {
                "ok": False,
                "error": "剪贴板为空。请先在手机上复制文字后再试。",
                "text": "",
                "logs": logs,
            }
        return {"ok": True, "text": ac, "logs": logs}

    # 4) dumpsys（老机型偶发可用）
    code, out, err = run_adb(["shell", "dumpsys", "clipboard"], timeout=15, serial=serial)
    parsed = _parse_dumpsys_clipboard(out or "")
    if parsed:
        logs.append("方式: dumpsys clipboard")
        return {"ok": True, "text": parsed, "logs": logs}

    hint = (
        "无法读取剪贴板。Android 10+ 常限制后台读取："
        "请亮屏解锁 → 在手机里重新复制一次 → 再点本按钮。"
        "若仍失败，可改用「分享文字」反向传。"
    )
    if err:
        logs.append(err)
    if out:
        logs.append(out[:500])
    return {"ok": False, "error": hint, "text": "", "logs": logs}


def screencap_to_pc(serial: str) -> dict:
    serial = (serial or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    remote = f"/sdcard/Download/wb_cap_{stamp}.png"
    local_dir = exchange_dir_for(serial)
    local = local_dir / f"screencap_{stamp}.png"
    logs.append("正在截屏…")
    code, out, err = run_adb(["shell", "screencap", "-p", remote], timeout=30, serial=serial)
    if out:
        logs.append(out)
    if err:
        logs.append(err)
    if code != 0:
        return {"ok": False, "error": err or out or "screencap 失败", "logs": logs}
    logs.append(f"拉取到电脑: {local}")
    code, out, err = run_adb(["pull", remote, str(local)], timeout=60, serial=serial)
    if out:
        logs.append(out)
    if err:
        logs.append(err)
    run_adb(["shell", "rm", "-f", remote], timeout=10, serial=serial)
    if code != 0 or not local.is_file():
        return {"ok": False, "error": err or out or "pull 失败", "logs": logs}
    rel = str(local.relative_to(EXCHANGE_DIR)).replace("\\", "/")
    logs.append("截屏已保存")
    return {
        "ok": True,
        "logs": logs,
        "path": str(local),
        "rel": rel,
        "name": local.name,
        "size": local.stat().st_size,
    }


def list_recent_media(serial: str, limit: int = 20) -> dict:
    serial = (serial or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs, "items": []}
    limit = max(1, min(50, int(limit or 20)))
    items: list[dict] = []
    seen: set[str] = set()
    for folder in _MEDIA_DIRS:
        code, out, err = run_adb(
            ["shell", "ls", "-1t", folder],
            timeout=20,
            serial=serial,
        )
        if code != 0:
            continue
        for line in (out or "").splitlines():
            name = line.strip()
            if not name or name.startswith("ls:"):
                continue
            ext = Path(name).suffix.lower()
            if ext not in _MEDIA_EXT:
                continue
            remote = f"{folder.rstrip('/')}/{name}"
            if remote in seen:
                continue
            seen.add(remote)
            items.append({"path": remote, "name": name, "dir": folder})
            if len(items) >= limit:
                break
        if len(items) >= limit:
            break
    if not items:
        logs.append("未在常见相册/截图目录找到图片，可先「截屏到电脑」")
    else:
        logs.append(f"找到 {len(items)} 张最近图片")
    return {"ok": True, "logs": logs, "items": items[:limit]}


def pull_files(serial: str, remote_paths: list[str]) -> dict:
    serial = (serial or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs, "files": []}
    paths = [str(p or "").strip() for p in (remote_paths or []) if str(p or "").strip()]
    if not paths:
        return {"ok": False, "error": "未选择文件", "logs": logs, "files": []}
    if len(paths) > 20:
        return {"ok": False, "error": "一次最多拉取 20 个文件", "logs": logs, "files": []}
    local_dir = exchange_dir_for(serial)
    files: list[dict] = []
    for remote in paths:
        if ".." in remote or not remote.startswith("/"):
            logs.append(f"跳过非法路径: {remote}")
            continue
        name = Path(remote).name
        if not name:
            continue
        stamp = datetime.now().strftime("%H%M%S")
        local = local_dir / f"pull_{stamp}_{name}"
        logs.append(f"拉取 {remote}")
        code, out, err = run_adb(["pull", remote, str(local)], timeout=120, serial=serial)
        if out:
            logs.append(out)
        if err:
            logs.append(err)
        if code != 0 or not local.is_file():
            logs.append(f"失败: {name}")
            continue
        rel = str(local.relative_to(EXCHANGE_DIR)).replace("\\", "/")
        files.append(
            {
                "path": str(local),
                "rel": rel,
                "name": local.name,
                "size": local.stat().st_size,
                "remote": remote,
            }
        )
    ok = bool(files)
    if ok:
        logs.append(f"已拉取 {len(files)} 个文件 → {local_dir}")
    return {
        "ok": ok,
        "error": "" if ok else "全部拉取失败",
        "logs": logs,
        "files": files,
        "dir": str(local_dir),
    }


def push_file_to_device(serial: str, local_path: str | Path) -> dict:
    serial = (serial or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    path = Path(local_path)
    if not path.is_file():
        return {"ok": False, "error": f"本地文件不存在: {path}", "logs": logs}
    remote = f"/sdcard/Download/{path.name}"
    logs.append(f"推送 {path.name} → {remote}")
    code, out, err = run_adb(["push", str(path), remote], timeout=300, serial=serial)
    if out:
        logs.append(out)
    if err:
        logs.append(err)
    if code != 0:
        return {"ok": False, "error": err or out or "push 失败", "logs": logs}
    logs.append("推送成功（手机 Download 目录）")
    return {"ok": True, "logs": logs, "remote": remote, "name": path.name, "size": path.stat().st_size}


# ---------- logcat（崩溃排查） ----------

_CRASH_LINE_RE = re.compile(
    r"(FATAL EXCEPTION|AndroidRuntime|ANR in|BEGIN TOMBSTONE|Process:\s|"
    r"Caused by:|java\.lang\.|Fatal signal|tombstone|crash_dump|"
    r"DEBUG\s*:|libc\s*:|Abort message|Signal Catcher)",
    re.I,
)


def clear_logcat(serial: str) -> dict:
    """清空设备 logcat 缓冲区，便于复现崩溃后抓干净日志。"""
    serial = (serial or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    logs.append(f"清除设备 logcat → {serial}")
    code, out, err = run_adb(["logcat", "-c"], timeout=20, serial=serial)
    if out:
        logs.append(out)
    if err:
        logs.append(err)
    if code != 0:
        return {"ok": False, "error": err or out or "logcat -c 失败", "logs": logs}
    logs.append("设备日志缓冲区已清空（可复现崩溃后再点「抓取日志」）")
    return {"ok": True, "logs": logs}


def extract_crash_excerpt(log_text: str, max_chars: int = 28000) -> str:
    """从完整 logcat 中抽出崩溃相关片段，供大模型分析。"""
    text = str(log_text or "")
    if not text.strip():
        return ""
    lines = text.splitlines()
    hit_idxs = [i for i, ln in enumerate(lines) if _CRASH_LINE_RE.search(ln)]
    if hit_idxs:
        chunks: list[str] = []
        seen: set[tuple[int, int]] = set()
        for i in hit_idxs[-10:]:
            start = max(0, i - 40)
            end = min(len(lines), i + 100)
            key = (start, end)
            if key in seen:
                continue
            seen.add(key)
            chunks.append("\n".join(lines[start:end]))
        excerpt = "\n\n----------\n\n".join(chunks)
    else:
        excerpt = "\n".join(lines[-900:])
    if len(excerpt) > max_chars:
        excerpt = excerpt[-max_chars:]
    return excerpt


def dump_logcat(serial: str) -> dict:
    """导出当前 logcat 缓冲区到 data/adb_exchange，返回可下载路径。"""
    serial = (serial or "").strip()
    logs: list[str] = []
    if not serial:
        return {"ok": False, "error": "未指定设备", "logs": logs}
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    local_dir = exchange_dir_for(serial)
    local = local_dir / f"logcat_{stamp}.txt"
    logs.append(f"抓取 logcat → {serial}")
    # 不经 run_adb 的 strip，直接写文件，避免大缓冲被裁切语义不清
    cmd = ["adb", "-s", serial, "logcat", "-d", "-v", "threadtime"]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            creationflags=_subprocess_flags(),
        )
    except FileNotFoundError:
        return {"ok": False, "error": "adb 未找到", "logs": logs}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "logcat 导出超时", "logs": logs}

    raw = proc.stdout or ""
    err = (proc.stderr or "").strip()
    if proc.returncode != 0 and not raw.strip():
        if err:
            logs.append(err)
        return {"ok": False, "error": err or "logcat -d 失败", "logs": logs}
    if err:
        logs.append(err)

    header = (
        f"# logcat dump\n"
        f"# serial: {serial}\n"
        f"# time: {datetime.now().isoformat(timespec='seconds')}\n"
        f"# lines: {len(raw.splitlines())}\n"
        f"#\n"
    )
    local.write_text(header + raw, encoding="utf-8", errors="replace")
    rel = str(local.relative_to(EXCHANGE_DIR)).replace("\\", "/")
    line_count = len(raw.splitlines())
    excerpt = extract_crash_excerpt(raw)
    logs.append(f"已保存 {local.name}（{line_count} 行，{local.stat().st_size} 字节）")
    logs.append("可下载 txt；右侧将尝试 AI 分析崩溃原因")
    return {
        "ok": True,
        "logs": logs,
        "path": str(local),
        "rel": rel,
        "name": local.name,
        "size": local.stat().st_size,
        "line_count": line_count,
        "excerpt": excerpt,
        "has_crash_hint": bool(_CRASH_LINE_RE.search(raw)),
    }


# ---------- CLI ----------

def _cli_print_logs(logs: list[str]):
    for line in logs:
        print(line)


def cli_main(argv: list[str] | None = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    cfg = load_config()
    print("=" * 48)
    print("一键远程 ADB 连接安卓测试机")
    print("=" * 48)

    result = wireless_connect()
    _cli_print_logs(result.get("logs") or [])
    if not result.get("ok"):
        print(result.get("error") or "连接失败")
        return 1

    target = result.get("target") or ""
    while True:
        print()
        print("安装菜单:")
        print("  1) 自动安装共享目录下的最新 APK")
        print("  2) 手动指定 APK 路径进行安装")
        print("  q) 退出安装")
        print("（8 秒无选择将自动选 1）")
        choice = _input_with_timeout("请选择: ", 8, default="1")
        choice = (choice or "1").strip().lower()
        if choice in ("q", "quit", "exit"):
            return 0
        if choice == "2":
            path = input("请输入 APK 完整路径: ").strip().strip('"')
            if not path:
                print("路径为空")
                continue
            install_result = install_apk(path, serial=target or None)
        else:
            latest = find_latest_apk()
            if not latest.get("ok"):
                print(latest.get("error"))
                print(f"当前共享目录: {cfg.get('apk_share_dir') or '(未配置)'}")
                again = input("安装失败，是否重试？(y/n): ").strip().lower()
                if again != "y":
                    return 1
                continue
            install_result = install_apk(latest["path"], serial=target or None)

        _cli_print_logs(install_result.get("logs") or [])
        if install_result.get("ok"):
            return 0
        again = input("安装失败，是否重试？(y/n): ").strip().lower()
        if again != "y":
            return 1


def _input_with_timeout(prompt: str, timeout: float, default: str = "") -> str:
    result = {"value": None}

    def reader():
        try:
            result["value"] = input(prompt)
        except EOFError:
            result["value"] = default

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        print(f"\n超时，自动选择: {default}")
        return default
    return result["value"] if result["value"] is not None else default


if __name__ == "__main__":
    raise SystemExit(cli_main())
