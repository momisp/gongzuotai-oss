#!/usr/bin/env python3
"""Reproduce duplicate game-spend with concurrent requests + auto refresh.

Default each round:
  1) new unique extend (shared by both concurrent requests)
  2) refresh t to current ms
  3) recompute md5_sign (ksort values + access_key)

Examples:
  python reproduce_duplicate_spend.py \\
    --url http://dev.example.com/index.php/sdk/Pay/platform_coin_pay \\
    --payload payload.json --mode sdk --i-understand-test-only
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import random
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Concurrently submit one test payment request twice."
    )
    parser.add_argument("--url", required=True, help="Test payment endpoint URL")
    parser.add_argument(
        "--payload",
        required=True,
        type=Path,
        help="JSON file containing one valid captured test request payload",
    )
    parser.add_argument(
        "--mode",
        choices=("sdk", "sdkh5"),
        default="sdk",
        help="sdk=base64(JSON) body; sdkh5=form-urlencoded body",
    )
    parser.add_argument(
        "--cookie",
        default="",
        help="Optional Cookie header, mainly for sdkh5 session authentication",
    )
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--rounds", type=int, default=1)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument(
        "--access-key",
        default="",
        help="Game access_key for md5_sign; empty = try workbench then fail",
    )
    parser.add_argument(
        "--workbench-url",
        default="http://127.0.0.1:8765",
        help="Workbench base URL used to fetch access_key by game_id",
    )
    parser.add_argument(
        "--source-db",
        default="lx",
        help="source_db query param when fetching access_key from workbench",
    )
    parser.add_argument(
        "--no-refresh",
        action="store_true",
        help="Do not refresh extend/t/md5_sign; send payload as-is",
    )
    parser.add_argument(
        "--i-understand-test-only",
        action="store_true",
        help="Required safety acknowledgement; never use real-money production data",
    )
    return parser.parse_args()


def load_payload(path: Path) -> Dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8-sig")
        value = json.loads(text)
    except FileNotFoundError:
        raise SystemExit(f"payload file not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"payload is not valid JSON: {exc}")
    if not isinstance(value, dict):
        raise SystemExit("payload JSON must be an object")
    return value


def validate_safety(args: argparse.Namespace, payload: Dict[str, Any]) -> None:
    if not args.i_understand_test_only:
        raise SystemExit(
            "Refusing to run without --i-understand-test-only. "
            "Use a test account/game and a small amount."
        )

    host = (urlparse(args.url).hostname or "").lower()
    suspicious = ("fuhua95", "ccnete", "lxpaynotify")
    if any(part in host for part in suspicious):
        raise SystemExit(
            f"URL looks like a production host ({host}). Use a staging host."
        )

    if args.rounds < 1 or args.rounds > 20:
        raise SystemExit("--rounds must be between 1 and 20")
    if args.concurrency != 2:
        raise SystemExit("This reproducer intentionally sends exactly two requests")

    extend = payload.get("extend") or payload.get("trade_no")
    if not extend and args.no_refresh:
        print(
            "warning: payload has no extend/trade_no; duplicate-order behavior "
            "may not be reproduced",
            file=sys.stderr,
        )


def now_ms() -> str:
    return str(int(time.time() * 1000))


def new_extend() -> str:
    return f"{now_ms()}{random.randint(10000, 99999)}"


def encrypt_md5(data: Dict[str, Any], access_key: str) -> str:
    items = sorted(
        (str(k), "" if v is None else str(v))
        for k, v in (data or {}).items()
        if str(k) != "md5_sign"
    )
    raw = "".join(v for _, v in items) + str(access_key or "")
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def fetch_access_key(
    game_id: str,
    *,
    workbench_url: str,
    source_db: str,
    timeout: float,
) -> str:
    base = (workbench_url or "").rstrip("/")
    if not base or not game_id:
        return ""
    url = (
        f"{base}/api/game-sdk/access-key"
        f"?game_id={game_id}&source_db={source_db}"
    )
    try:
        with urlopen(url, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as exc:
        print(f"warning: fetch access_key failed: {exc}", file=sys.stderr)
        return ""
    if not isinstance(data, dict) or not data.get("ok"):
        print(
            f"warning: workbench did not return access_key: {data}",
            file=sys.stderr,
        )
        return ""
    return str(data.get("accessKey") or "").strip()


def resolve_access_key(args: argparse.Namespace, payload: Dict[str, Any]) -> str:
    key = str(args.access_key or "").strip()
    if key:
        return key
    game_id = str(payload.get("game_id") or "").strip()
    key = fetch_access_key(
        game_id,
        workbench_url=args.workbench_url,
        source_db=args.source_db,
        timeout=args.timeout,
    )
    if not key:
        raise SystemExit(
            "Need --access-key, or start workbench so "
            f"/api/game-sdk/access-key?game_id={game_id} works."
        )
    return key


def refresh_payload(payload: Dict[str, Any], access_key: str) -> Dict[str, Any]:
    out = dict(payload)
    out["t"] = now_ms()
    out["extend"] = new_extend()
    out.pop("md5_sign", None)
    out["md5_sign"] = encrypt_md5(out, access_key)
    return out


def decode_sdk_response(text: str) -> Any:
    raw = (text or "").strip().strip('"').strip("'")
    try:
        plain = base64.b64decode(raw).decode("utf-8")
    except Exception:
        plain = text or ""
    try:
        return json.loads(plain)
    except json.JSONDecodeError:
        return {"_raw": plain}


def request_body(payload: Dict[str, Any], mode: str) -> Tuple[bytes, str]:
    if mode == "sdk":
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        return base64.b64encode(raw), "text/plain; charset=utf-8"
    encoded = urlencode({k: str(v) for k, v in payload.items()})
    return encoded.encode(), "application/x-www-form-urlencoded; charset=utf-8"


def send_one(
    sequence: int,
    url: str,
    payload: Dict[str, Any],
    mode: str,
    cookie: str,
    timeout: float,
    barrier: threading.Barrier,
) -> Dict[str, Any]:
    barrier.wait()
    body, content_type = request_body(payload, mode)
    headers = {
        "Content-Type": content_type,
        "User-Agent": "duplicate-spend-reproducer/1.0",
        "Accept": "application/json, text/plain, */*",
    }
    if cookie:
        headers["Cookie"] = cookie

    started = time.time()
    request = Request(url, data=body, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            status = response.status
    except HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        status = exc.code
    except (URLError, TimeoutError, OSError) as exc:
        response_body = f"{type(exc).__name__}: {exc}"
        status = None

    decoded: Optional[Any] = None
    if mode == "sdk" and response_body and not str(response_body).startswith(
        ("URLError", "TimeoutError", "OSError", "HTTPError")
    ):
        decoded = decode_sdk_response(response_body)

    return {
        "sequence": sequence,
        "http_status": status,
        "elapsed_ms": round((time.time() - started) * 1000, 1),
        "response": response_body[:4000],
        "response_decoded": decoded,
    }


def run_round(
    round_no: int,
    args: argparse.Namespace,
    payload: Dict[str, Any],
) -> None:
    barrier = threading.Barrier(2)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(
                send_one,
                sequence,
                args.url,
                payload,
                args.mode,
                args.cookie,
                args.timeout,
                barrier,
            )
            for sequence in (1, 2)
        ]
        results = [future.result() for future in futures]

    print(f"round {round_no}: both requests released together")
    print(
        f"  shared extend={payload.get('extend')} t={payload.get('t')} "
        f"md5_sign={payload.get('md5_sign')}"
    )
    for result in results:
        print(json.dumps(result, ensure_ascii=False))


def main() -> int:
    args = parse_args()
    template = load_payload(args.payload)
    validate_safety(args, template)

    access_key = ""
    if not args.no_refresh:
        access_key = resolve_access_key(args, template)
        masked = "****" if len(access_key) <= 4 else ("****" + access_key[-4:])
        print(f"access_key: {masked}")

    print(f"target: {args.url}")
    print(
        f"mode: {args.mode}; rounds: {args.rounds}; "
        f"refresh: {not args.no_refresh}; same payload per round: yes"
    )
    print("This script sends two concurrent TEST requests and does not query the DB.")

    last_extend = ""
    for round_no in range(1, args.rounds + 1):
        if args.no_refresh:
            payload = dict(template)
        else:
            payload = refresh_payload(template, access_key)
        last_extend = str(payload.get("extend") or "")
        run_round(round_no, args, payload)

    print(
        "Next: query tab_spend by the payload's extend/trade_no. "
        "A reproduction is two different SP_ numbers with the same extend, "
        "and exactly one balance deduction."
    )
    if last_extend:
        print(f"Last shared extend to query: {last_extend}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())