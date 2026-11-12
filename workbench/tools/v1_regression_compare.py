# -*- coding: utf-8 -*-
"""四层对拍：L1（三库直查 liveSql） vs L3（真站接口 jsonPath），逐指标输出差异。

用法： python tools/v1_regression_compare.py [--scene xinshangwu_go|v1_full_regression|all]

只读：登录一次 POST /base/login，其余全部 GET；不写任何业务数据。
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import yaml
import pymysql

ROOT = Path(__file__).resolve().parent.parent
METRICS = ROOT / "data" / "data_assert" / "metrics"
CFG = ROOT.parent / "data" / "smoke_db_config.json"
BASE = os.environ.get("SW_API_BASE", "http://sw2.example.com/api")


def login() -> str:
    user = os.environ.get("SW_ADMIN_USER", "admin")
    pwd = os.environ.get("SW_ADMIN_PASSWORD", "CHANGE_ME")
    body = json.dumps({"username": user, "password": pwd}, ensure_ascii=False).encode()
    req = Request(BASE + "/base/login", data=body,
                  headers={"Content-Type": "application/json", "Accept": "application/json"},
                  method="POST")
    with urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))["data"]["token"]


def jget(obj, json_path: str):
    if not json_path or "TODO" in json_path:
        return None
    s = json_path[2:] if json_path.startswith("$.") else json_path.lstrip("$")
    cur = obj
    for tok in re.findall(r"[^.\[\]]+|\[\d+\]", s):
        if tok.startswith("["):
            cur = cur[int(tok[1:-1])] if isinstance(cur, list) and len(cur) > int(tok[1:-1]) else None
        else:
            cur = cur.get(tok) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur


def api_value(token: str, api: dict):
    path = str(api.get("path") or "")
    if not path.startswith("/"):
        return None, "无 path"
    q = api.get("query") if isinstance(api.get("query"), dict) else {}
    url = str(api.get("baseUrl") or BASE).rstrip("/") + path
    if q:
        url += "?" + urlencode(q)
    try:
        req = Request(url, headers={"Accept": "application/json", "x-token": token})
        with urlopen(req, timeout=25) as r:
            payload = json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        return None, f"请求失败 {str(e)[:60]}"
    if payload.get("code") not in (0, "0", None):
        return None, f"code={payload.get('code')} {str(payload.get('msg'))[:40]}"
    return jget(payload, str(api.get("jsonPath") or "")), ""


def num(v):
    try:
        return float(str(v).replace(",", "").replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def main() -> int:
    scene = "all"
    if "--scene" in sys.argv:
        scene = sys.argv[sys.argv.index("--scene") + 1]
    cfg = json.loads(CFG.read_text(encoding="utf-8"))
    conn = pymysql.connect(host=cfg["host"], port=int(cfg.get("port", 3306)), user=cfg["user"],
                           password=cfg["password"], database="game_lx", charset="utf8mb4",
                           connect_timeout=20, cursorclass=pymysql.cursors.DictCursor, autocommit=True)
    cur = conn.cursor()
    token = login()
    print(f"登录 OK ｜ 场景 {scene} ｜ 只发 GET，不写业务数据\n")

    results = []
    for p in sorted(METRICS.glob("*.yaml")):
        d = yaml.safe_load(p.read_text(encoding="utf-8"))
        if scene != "all" and str(d.get("scene")) != scene:
            continue
        src, api = d.get("source") or {}, d.get("api") or {}
        sql = src.get("liveSql")
        if not sql:
            continue
        try:
            cur.execute(sql)
            l1 = cur.fetchone().get(str(src.get("liveSqlValueKey") or "v"))
        except Exception as e:
            l1 = f"SQL ERR {str(e)[:50]}"
        l3, err = api_value(token, api)
        a, b = num(l1), num(l3)
        if isinstance(l1, str) and l1.startswith("SQL ERR"):
            state = "ERR"
        elif err:
            state = "API_ERR"
        elif a is None or b is None:
            state = "TODO"
        else:
            tol_pct = d.get("tolerancePct")
            tol_abs = d.get("toleranceAbs")
            if tol_pct is not None:
                limit = max(abs(b) * float(tol_pct), 0.5)
            elif tol_abs is not None:
                limit = float(tol_abs)
            else:
                limit = 0.11 if str(d.get("format")) == "percent" else max(0.01, abs(b) * 0.001)
            if abs(a - b) <= limit:
                state = "PASS"
            else:
                state = "DIFF"
        results.append((state, p.name, l1, l3 if not err else err, str(api.get("path") or "")))

    conn.close()
    order = {"PASS": 0, "DIFF": 1, "TODO": 2, "API_ERR": 3, "ERR": 4}
    results.sort(key=lambda x: (order[x[0]], x[1]))
    for state, name, l1, l3, path in results:
        mark = {"PASS": "✅", "DIFF": "⚠️ ", "TODO": "⬜", "API_ERR": "❌", "ERR": "❌"}[state]
        print(f"{mark} {state:7s} {name:42s} L1={str(l1):>14s}  L3={str(l3):>14s}  {path}")
    from collections import Counter
    c = Counter(r[0] for r in results)
    print(f"\n合计 {len(results)} 项：" + "  ".join(f"{k}={c[k]}" for k in ["PASS", "DIFF", "TODO", "API_ERR", "ERR"]))
    print("PASS=L1/L3 已对上；DIFF=口径差异待确认（回归要抓的差异单）；TODO=jsonPath 待钉；API_ERR=接口未返回")
    return 0


if __name__ == "__main__":
    sys.exit(main())
