# -*- coding: utf-8 -*-
"""可选：只读抓取 /sw/* 接口真实响应，用来把 jsonPath 从 TODO 钉成真实字段。

只发 GET + 一次登录 POST /base/login；不执行任何业务写操作。
产出：data/data_assert/fixtures/v1reg_<接口>.json（响应结构，不是业务数据副本）

用法： python tools/v1_regression_sniff.py
"""
from __future__ import annotations
import csv, json, os, re, sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
CSV = Path(os.environ.get(
    "V1REG_CSV",
    str(ROOT.parent / "data" / "v1reg_workspace" / "v1回归-数据准确性指标清单.csv"),
))
OUT = ROOT / "data" / "data_assert" / "fixtures"
BASE = os.environ.get("SW_API_BASE", "http://sw2.example.com/api")
USER = os.environ.get("SW_ADMIN_USER", "admin")
PWD = os.environ.get("SW_ADMIN_PASSWORD", "CHANGE_ME")


def call(path, token="", body=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["x-token"] = token
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode()
        headers["Content-Type"] = "application/json"
    req = Request(BASE.rstrip("/") + path, data=data, headers=headers,
                  method="POST" if body is not None else "GET")
    with urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main():
    login = call("/base/login", body={"username": USER, "password": PWD})
    d = login.get("data") if isinstance(login, dict) else None
    token = str((d or {}).get("token") or (d or {}).get("access_token")
                or (d or {}).get("x-token") or "") if isinstance(d, dict) else ""
    if not token:
        print("登录未取到 token：", json.dumps(login, ensure_ascii=False)[:400])
        return 1
    paths = []
    with CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            for p in re.findall(r"(/sw/[\w${}/.\-]+)", row.get("接口_当前sw2") or ""):
                if "${" not in p and p not in paths:
                    paths.append(p)
    paths += ["/sw/workbench/summary", "/sw/spend/list", "/sw/register/list"]
    paths = list(dict.fromkeys(paths))
    OUT.mkdir(parents=True, exist_ok=True)
    ok = 0
    for p in paths:
        try:
            res = call(p, token=token)
            name = re.sub(r"[^\w]+", "_", p).strip("_")
            (OUT / f"v1reg_{name}.json").write_text(
                json.dumps({"path": p, "response": res}, ensure_ascii=False, indent=2),
                encoding="utf-8")
            ok += 1
            print("OK ", p)
        except Exception as e:
            print("ERR", p, str(e)[:120])
    print(f"完成 {ok}/{len(paths)}，输出 {OUT}")
    print("下一步：按响应结构把 metrics/v1reg_*.yaml 的 api.jsonPath 从 $.data.TODO 改为真实路径。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
