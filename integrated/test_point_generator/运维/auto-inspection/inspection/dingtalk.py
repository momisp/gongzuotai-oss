"""钉钉群机器人：Markdown 推送（与钉钉报告推送逻辑一致）"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
import urllib.parse

import requests


def sign_webhook_url(webhook: str, secret: str | None) -> str:
    if not secret:
        return webhook
    ts = str(round(time.time() * 1000))
    s = f"{ts}\n{secret}".encode("utf-8")
    sign = base64.b64encode(hmac.new(secret.encode("utf-8"), s, hashlib.sha256).digest()).decode()
    sign_enc = urllib.parse.quote_plus(sign)
    sep = "&" if "?" in webhook else "?"
    return f"{webhook}{sep}timestamp={ts}&sign={sign_enc}"


def send_markdown(webhook_signed: str, title: str, text: str) -> None:
    r = requests.post(
        webhook_signed,
        json={"msgtype": "markdown", "markdown": {"title": title[:128], "text": text}},
        headers={"Content-Type": "application/json; charset=utf-8"},
        timeout=30,
    )
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text}
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {body}")
    if body.get("errcode") != 0:
        raise RuntimeError(f"钉钉错误 errcode={body.get('errcode')} errmsg={body.get('errmsg')}")


def load_webhook_from_env() -> tuple[str, str | None]:
    w = (os.environ.get("DINGTALK_WEBHOOK") or "").strip()
    s = (os.environ.get("DINGTALK_SECRET") or "").strip() or None
    return w, s
