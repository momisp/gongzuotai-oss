# -*- coding: utf-8 -*-
"""查询业务域名 HTTPS 证书到期时间，供每日巡检报告使用。

说明栏只反映「业务侧是否配错证书」：
- 能读到证书且 CN/SAN 覆盖访问域名 → 例行监控（空 note）
- 本机 CA 过旧、杀软 HTTPS 解密等导致的校验失败 → 忽略，不写噪音
- 证书域名确实对不上访问域名 → 才写不匹配说明
"""
from __future__ import annotations

import json
import socket
import ssl
import subprocess
import sys
from datetime import datetime, timezone, timedelta

try:
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography", "-q"])
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend

TZ_CN = timezone(timedelta(hours=8))

CERT_DOMAINS = [
    ("dpd.yuzou99.com", "大派队"),
    ("res.yuzou99.com", "大派对资源"),
    ("dpd.quanyu888.com", "全域"),
    ("res.yzyzzb.com", "宙包"),
    ("open.openqy.com", "开放平台"),
    ("zhoubaoai.com", "宙包创作者平台"),
    ("open.yuzou99.com", "宙包接口"),
    ("gate-dpd.yuzou99.com", "大派对空间正式-gate"),
    ("game-dpd.yuzou99.com", "大派对空间正式-game"),
    ("space.yuzou99.com", "大派对空间测试"),
    ("gate-zb.yzyzzb.com", "宙包空间正式"),
    ("test-zb.yzyzzb.com", "宙包空间测试"),
]

TIMEOUT = 10


def level(days_left: int) -> str:
    if days_left < 0:
        return "过期"
    if days_left <= 30:
        return "紧急"
    if days_left <= 90:
        return "关注"
    return "正常"


def _dns_matches(pattern: str, host: str) -> bool:
    p = (pattern or "").lower().rstrip(".")
    h = (host or "").lower().rstrip(".")
    if not p or not h:
        return False
    if p.startswith("*."):
        # *.example.com → a.example.com（单层）
        rest = p[2:]
        if not h.endswith("." + rest):
            return False
        left = h[: -(len(rest) + 1)]
        return bool(left) and "." not in left
    return p == h


def _names_from_cert(cert: x509.Certificate) -> tuple[str, list[str]]:
    cn = ""
    for attr in cert.subject:
        if attr.oid == x509.oid.NameOID.COMMON_NAME:
            cn = str(attr.value)
            break
    sans: list[str] = []
    try:
        ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        sans = [str(v) for v in ext.value.get_values_for_type(x509.DNSName)]
    except x509.ExtensionNotFound:
        pass
    return cn, sans


def _host_covered(host: str, cn: str, sans: list[str]) -> bool:
    candidates = [n for n in ([cn] + list(sans)) if n]
    return any(_dns_matches(n, host) for n in candidates)


def _info_from_x509(cert: x509.Certificate, host: str) -> dict:
    cn, sans = _names_from_cert(cert)
    issuer = ""
    for attr in cert.issuer:
        if attr.oid == x509.oid.NameOID.ORGANIZATION_NAME:
            issuer = str(attr.value)
            break
    expire = cert.not_valid_after_utc
    issued = cert.not_valid_before_utc
    return {
        "cn": cn or host,
        "sans": sans,
        "issuer": issuer,
        "issued": issued.astimezone(TZ_CN).strftime("%Y-%m-%d %H:%M:%S"),
        "expires": expire.astimezone(TZ_CN).strftime("%Y-%m-%d %H:%M:%S"),
        "expires_date": expire.astimezone(TZ_CN).strftime("%Y-%m-%d"),
        "host_ok": _host_covered(host, cn, sans),
    }


def _fetch_peer_der(host: str, port: int = 443) -> bytes:
    """不校验证书链，只取对端叶子证书（到期巡检用）。"""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection((host, port), timeout=TIMEOUT) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as ssock:
            der = ssock.getpeercert(binary_form=True)
    if not der:
        raise RuntimeError(f"未取得对端证书: {host}")
    return der


def _mismatch_note(host: str, info: dict) -> str:
    names = []
    cn = (info.get("cn") or "").strip()
    if cn:
        names.append(cn)
    for s in info.get("sans") or []:
        if s and s not in names:
            names.append(s)
    shown = "、".join(names) if names else "（空）"
    return f"证书域名（{shown}）与访问域名 {host} 不匹配"


def fetch_cert(host: str, port: int = 443) -> tuple[dict, str]:
    """读取证书到期信息。

    本机信任链失败（CA 过旧、代理解密等）不写入说明栏；
    仅当证书 CN/SAN 确实覆盖不了访问域名时才提示。
    """
    der = _fetch_peer_der(host, port)
    cert = x509.load_der_x509_certificate(der, default_backend())
    info = _info_from_x509(cert, host)
    if info.get("host_ok"):
        return info, ""
    return info, _mismatch_note(host, info)


def check_one(host: str, biz: str) -> dict:
    try:
        info, note = fetch_cert(host)
        now = datetime.now(TZ_CN)
        expire_dt = datetime.strptime(info["expires"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=TZ_CN)
        days_left = (expire_dt.date() - now.date()).days
        lv = level(days_left)
        return {
            "domain": host,
            "biz": biz,
            "cn": info["cn"],
            "issuer": info["issuer"],
            "issued": info["issued"],
            "expires": info["expires_date"],
            "days_left": days_left,
            "level": lv,
            "status": "ok",
            "note": note,
            "error": "",
        }
    except Exception as e:
        return {
            "domain": host,
            "biz": biz,
            "cn": "",
            "issuer": "",
            "issued": "",
            "expires": "",
            "days_left": None,
            "level": "查询失败",
            "status": "error",
            "note": "",
            "error": str(e),
        }


def main(as_json: bool = False) -> int:
    results = [check_one(h, b) for h, b in CERT_DOMAINS]
    if as_json:
        sys.stdout.buffer.write(
            (json.dumps(results, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        )
        return 0
    return 0


if __name__ == "__main__":
    json_out = "--json" in sys.argv
    sys.exit(main(as_json=json_out))
