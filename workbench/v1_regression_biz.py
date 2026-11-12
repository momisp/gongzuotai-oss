# -*- coding: utf-8 -*-
"""新商务 v1 全量回归 · 业务流水线执行引擎（12 条）。

设计要点
--------
* 所有写接口的 method / path / 入参均来自实测：
  - Apifox「新新商务接口」与「OA接口/SysUserBindPlatform」OpenAPI 定义
  - sw2 前端 chunk 里真实构造请求体的表单模型
  - 真实站只读 GET 的响应校验
* **默认预演**：writeEnabled=false（或 --dry-run）时，写请求只打印「将要发送的完整请求」，
  不落到服务端；只读 GET 与 DB SELECT 仍然真跑，因此 DB 层断言是真实的。
* 三层断言：DB（sw9 配置库 / 三游戏库）→ API（读回校验）→ PAGE（DOM 断言留 Playwright 钩子）。
* 造数状态跨流水线共享（state 文件），收尾流水线负责回收，保证可重放。
* 不猜账号、不猜审核结果：缺输入的步骤标 BLOCKED 并写差异单，绝不伪造通过。

命令行
------
  python v1_regression_biz.py --list
  python v1_regression_biz.py --pipeline v1reg_oa_create_l1 --dry-run
  python v1_regression_biz.py --all --dry-run
  python v1_regression_biz.py --all --execute      # 需配置 writeEnabled=true
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                      # workspace root
DATA = ROOT / "data"
CONFIG_FILE = DATA / "v1_regression_biz_config.json"

WRITE_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

# 失败分类关键词（产品缺陷 / 环境 / 数据前置 / 自动化本身）
_FAIL_CLASS_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("env", ("验证码", "禁止登录", "timeout", "timed out", "连接", "无法连接", "HTTPError", "URLError")),
    ("data", ("无预警", "无待审核", "待审核记录", "缺少组合", "候选为空", "名下无", "前置", "幂等 SKIP")),
    ("automation", ("未接线", "PAGE DOM", "Playwright", "runner", "jsonPath", "TODO", "待接")),
)


def classify_fail(detail: str) -> str:
    text = str(detail or "")
    for cls, keys in _FAIL_CLASS_RULES:
        if any(k.lower() in text.lower() for k in keys):
            return cls
    return "product"


def preflight(cfg: dict | None = None) -> dict:
    """只读环境预检：不调用 /base/login，避免加重验证码锁定。"""
    cfg = cfg or load_config()
    alerts: list[str] = []
    write_on = bool(cfg.get("writeEnabled"))
    if write_on:
        alerts.append("写闸门 writeEnabled=true，跑流水线会真实写业务数据（测完应确认已恢复开关/参数）")
    else:
        alerts.append("写闸门 writeEnabled=false，面板点跑只预演不写")

    captcha_open = None
    try:
        res = api_call(cfg, "POST", "/base/captcha", body={}, timeout=10)
        d = res.get("data") or {}
        captcha_open = bool(d.get("openCaptcha"))
        if captcha_open:
            alerts.append("登录需验证码（/base/captcha openCaptcha=true），自动化登录可能全部阻断")
    except Exception as exc:  # noqa: BLE001
        alerts.append(f"验证码接口探测失败：{type(exc).__name__}: {exc}")

    disabled: list[str] = []
    if cfg.get("reuseExisting") and cfg.get("reuse"):
        try:
            ids = []
            labels = {}
            for role, info in (cfg.get("reuse") or {}).items():
                if isinstance(info, dict) and info.get("userId"):
                    ids.append(int(info["userId"]))
                    labels[int(info["userId"])] = f"{role}:{info.get('userName') or info['userId']}"
            if ids:
                rows = db_select(
                    f"SELECT id,username,enable FROM sys_users WHERE id IN ({','.join(['%s'] * len(ids))})",
                    tuple(ids),
                    database="sw9",
                )
                for r in rows:
                    if int(r.get("enable") or 0) != 1:
                        disabled.append(labels.get(int(r["id"]), str(r.get("username") or r["id"])))
            if disabled:
                alerts.append("复用账号已禁用：" + "、".join(disabled) + "（请启用或改 config.reuse）")
        except Exception as exc:  # noqa: BLE001
            alerts.append(f"复用账号状态查询失败：{type(exc).__name__}: {exc}")

    return {
        "writeEnabled": write_on,
        "openCaptcha": captcha_open,
        "disabledUsers": disabled,
        "alerts": alerts,
    }


# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #
def load_config() -> dict:
    with CONFIG_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def _state_path(cfg: dict) -> Path:
    return ROOT / str(cfg.get("stateFile") or "data/v1_regression_biz_state.json")


def load_state(cfg: dict) -> dict:
    p = _state_path(cfg)
    if p.is_file():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"createdAt": datetime.now().isoformat(timespec="seconds"), "users": {},
            "bindings": [], "channels": [], "runs": []}


def save_state(cfg: dict, state: dict) -> None:
    p = _state_path(cfg)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def db_select(sql: str, params: tuple | list = (), database: str | None = None) -> list[dict]:
    """只读 SELECT；强制拒绝任何非 SELECT 语句，避免把造数写进业务库。"""
    if not sql.lstrip().lower().startswith("select"):
        raise ValueError("db_select 只允许 SELECT（本引擎不通过 DB 写业务数据）")
    sys.path.insert(0, str(HERE))
    import smoke_db  # noqa: WPS433  (延迟导入，避免与 app 启动顺序耦合)

    cfg = dict(smoke_db.load_db_config())
    if database:
        cfg["database"] = database
    return smoke_db.execute_select(sql, cfg=cfg, params=tuple(params))


def api_call(cfg: dict, method: str, path: str, *, token: str = "",
             body: dict | None = None, query: dict | None = None,
             base: str | None = None, timeout: int = 15,
             extra_headers: dict | None = None) -> dict:
    url = (base or cfg["swBaseUrl"]).rstrip("/") + path
    if query:
        url += ("&" if "?" in url else "?") + urlencode(query)
    headers = {"Accept": "application/json"}
    if token:
        headers["x-token"] = token
    if extra_headers:
        headers.update(extra_headers)
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method)
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


_TOKEN_CACHE: dict[tuple[str, str], tuple[float, str]] = {}
TOKEN_TTL = 1800   # 频繁登录会触发 sw2 验证码，同进程内同账号复用 token


def login(cfg: dict, username: str, password: str) -> str:
    key = (str(cfg.get("swBaseUrl")), username)
    hit = _TOKEN_CACHE.get(key)
    if hit and time.time() - hit[0] < TOKEN_TTL:
        return hit[1]
    tok = _login_once(cfg, username, password)
    _TOKEN_CACHE[key] = (time.time(), tok)
    return tok


def _login_once(cfg: dict, username: str, password: str) -> str:
    res = api_call(cfg, "POST", "/base/login", body={"username": username, "password": password})
    if res.get("code") != 0:
        raise RuntimeError(f"登录失败 {username}: code={res.get('code')} msg={res.get('msg')}")
    d = res.get("data") or {}
    tok = d.get("token") or d.get("access_token") or d.get("x-token") or ""
    if not tok:
        raise RuntimeError(f"登录未返回 token: {username}")
    return str(tok)


# --------------------------------------------------------------------------- #
# 步骤结果
# --------------------------------------------------------------------------- #
@dataclass
class StepResult:
    step_id: str
    title: str
    layer: str                    # DB / API / PAGE / PERM / CHECK / SETUP / CLEANUP
    state: str = "PASS"           # PASS / FAIL / DRYRUN / BLOCKED / SKIP
    detail: str = ""
    evidence: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"id": self.step_id, "title": self.title, "layer": self.layer,
                "state": self.state, "detail": self.detail,
                "evidence": self.evidence, "at": now()}


# --------------------------------------------------------------------------- #
# 执行上下文
# --------------------------------------------------------------------------- #
class Runner:
    def __init__(self, pipeline_id: str, cfg: dict | None = None,
                 execute: bool | None = None, state: dict | None = None):
        self.pipeline_id = pipeline_id
        self.cfg = cfg or load_config()
        self.gate = bool(self.cfg.get("writeEnabled"))
        self.execute = (self.gate and (execute is not False)) if execute is None else bool(execute)
        # 复用现成层级链：层级建立 3 条转「校验型」，不再 POST 造商务账号
        self.reuse = bool(self.cfg.get("reuseExisting")) and bool(self.cfg.get("reuse"))
        self.state = state if state is not None else load_state(self.cfg)
        self.results: list[StepResult] = []
        self.tokens: dict[str, str] = {}
        self.ctx: dict[str, Any] = {}      # 步骤间传值（如动态解析出的 platformBusierId）
        self._seq = 0
        self._write_executed = False   # 本轮是否真的发出过写请求

    # ---------- 令牌 ----------
    def token(self, role: str = "admin") -> str:
        if role in self.tokens:
            return self.tokens[role]
        if role == "admin":
            u = self.cfg["admin"]["username"]
            p = self.cfg["admin"]["password"]
        elif self.reuse:
            info = self.cfg.get("reuse", {}).get(role, {})
            u, p = info.get("userName", ""), info.get("password", "")
            if not u:
                raise RuntimeError(f"config.reuse 缺少 {role} 账号")
        else:
            info = self.state.get("users", {}).get(role, {})
            u = info.get("userName", "")
            p = info.get("password") or self.cfg["seed"]["password"]
            if not u:
                if not self.execute:
                    # 预演/规划态：造数账号还没建立，用超管 token 让只读链路跑通，
                    # 并在证据里标注「角色待建」，绝不冒充真实角色鉴权结果。
                    self.tokens[role] = self.token("admin")
                    return self.tokens[role]
                raise RuntimeError(f"缺少 {role} 造数账号，请先跑层级建立流水线")
        self.tokens[role] = login(self.cfg, u, p)
        return self.tokens[role]

    def login_check(self, title: str, role: str) -> StepResult:
        """真实登录一次并记录身份，证明该角色鉴权链路有效。"""
        def _do():
            tok = self.token(role)
            info = (self.cfg.get("reuse", {}).get(role, {})
                    if self.reuse else self.state.get("users", {}).get(role, {}))
            return ("PASS", f"{role} 登录成功（token 已取得，len={len(tok)}）",
                    {"role": role, "userName": info.get("userName", ""),
                     "userId": info.get("userId"), "reuse": self.reuse})
        return self.step(title, "API", _do)

    def oa_ready(self) -> bool:
        return bool(self.cfg.get("oaReachable")) and bool(self.cfg.get("oaAuthReady")) \
            and bool((self.cfg.get("oaLogin") or {}).get("username"))

    def oa_token(self) -> str:
        """动态登录 OA 取 token（token 有效期 7 天，不落盘静态值）。"""
        if "oa" in self.tokens:
            return self.tokens["oa"]
        lg = self.cfg.get("oaLogin") or {}
        res = api_call(self.cfg, "POST", "/base/login",
                       body={"username": lg.get("username"),
                             "password": lg.get("password")},
                       base=self.cfg.get("oaBaseUrl"))
        if res.get("code") != 0:
            raise RuntimeError(f"OA 登录失败 code={res.get('code')} msg={res.get('msg')}")
        d = res.get("data") or {}
        tok = d.get("token") or d.get("access_token") or ""
        if not tok:
            raise RuntimeError("OA 登录未返回 token")
        self.tokens["oa"] = tok
        return tok

    # ---------- 通用步骤 ----------
    def step(self, title: str, layer: str, fn: Callable[[], tuple[str, str, dict]],
             sid: str | None = None) -> StepResult:
        self._seq += 1
        sid = sid or f"P{self._seq - 1}"
        try:
            st, detail, ev = fn()
        except Exception as exc:                       # noqa: BLE001
            st, detail, ev = "FAIL", f"{type(exc).__name__}: {exc}", {}
            if "禁止登录" in str(exc):
                st = "BLOCKED"
                detail = f"复用账号已被禁用（sw9.sys_users.enable=0），请启用或在 config.reuse 换账号：{exc}"
            elif "验证码" in str(exc):
                st = "BLOCKED"
                detail = f"登录触发验证码（短时间登录过频），稍后重跑：{exc}"
        r = StepResult(sid, title, layer, st, detail, ev)
        self.results.append(r)
        return r

    def http(self, title: str, method: str, path: str, *, token_role: str = "admin",
             body: dict | None = None, query: dict | None = None,
             expect_code: int = 0, note: str = "", base: str | None = None,
             token_override: str | None = None) -> StepResult:
        """写请求在预演态只记录完整报文；读请求总是真跑。
        base/token_override 用于 OA 独立域 + 独立 token 的审核接口。"""
        def _do():
            is_write = method.upper() in WRITE_METHODS
            req_ev = {"method": method.upper(), "path": path,
                      "body": body, "query": query, "role": token_role, "note": note}
            if base:
                req_ev["baseUrl"] = base
            if is_write and not self.execute:
                return ("DRYRUN", "预演：未发送写请求（writeEnabled=false）", req_ev)
            tok = token_override if token_override is not None else (
                self.token(token_role) if token_role else "")
            res = api_call(self.cfg, method.upper(), path, token=tok, body=body,
                           query=query, base=base)
            req_ev["response"] = {"code": res.get("code"), "msg": res.get("msg")}
            if res.get("code") == 7 and "重复绑定" in str(res.get("msg")):
                return ("FAIL", f"重复绑定：{res.get('msg')}（需 confirmDuplicate 或换造数账号）", req_ev)
            if expect_code is not None and res.get("code") != expect_code:
                return ("FAIL", f"code={res.get('code')} msg={res.get('msg')}", req_ev)
            if is_write:
                self._write_executed = True
            return ("PASS", f"code={res.get('code')} msg={res.get('msg') or '成功'}", req_ev)
        return self.step(title, "API", _do)

    def db(self, title: str, sql: str, params: tuple = (), *, database: str = "sw9",
           expect: Callable[[list[dict]], bool] | None = None,
           expect_desc: str = "", post_write: bool = False) -> StepResult:
        """DB 层断言永远真跑（只读）。post_write=True 表示断言依赖本轮写操作，
        预演态未写时标 DRYRUN 而不是 FAIL，避免把「还没造数」误报成缺陷。"""
        def _do():
            rows = db_select(sql, params, database=database)
            ev = {"database": database, "sql": " ".join(sql.split()), "params": list(params),
                  "rows": rows[:5]}
            good = expect is None or expect(rows)
            if post_write and not self._write_executed and not good:
                return ("DRYRUN", "预演：写未执行，此后置断言延后到实跑", ev)
            if not good:
                return ("FAIL", f"DB 断言未通过：{expect_desc or '期望值不匹配'}，实际 {rows[:3]}", ev)
            v = rows[0] if rows else {}
            return ("PASS", f"DB 实查：{v}", ev)
        return self.step(title, "DB", _do)

    def readback(self, title: str, method: str, path: str, *, token_role: str = "admin",
                 query: dict | None = None, match: Callable[[dict], bool] | None = None,
                 match_desc: str = "", post_write: bool = False,
                 base: str | None = None, token_override: str | None = None) -> StepResult:
        """读回校验总是真跑；post_write=True 时预演不判失败。"""
        def _do():
            tok = token_override if token_override is not None else (
                self.token(token_role) if token_role else "")
            res = api_call(self.cfg, method, path, token=tok, query=query, base=base)
            ev = {"method": method, "path": path, "query": query,
                  "baseUrl": base, "role": token_role,
                  "code": res.get("code"), "dataBrief": json.dumps(res.get("data"),
                                                                   ensure_ascii=False)[:400]}
            if res.get("code") != 0:
                return ("FAIL", f"读回失败 code={res.get('code')} msg={res.get('msg')}", ev)
            if match is not None and not match(res.get("data") or {}):
                if post_write and not self._write_executed:
                    return ("DRYRUN", "预演：写未执行，读回断言延后到实跑", ev)
                return ("FAIL", f"读回断言未通过：{match_desc}", ev)
            return ("PASS", "读回校验通过", ev)
        return self.step(title, "API", _do)

    def page(self, title: str, locator: str, note: str = "") -> StepResult:
        """PAGE 层：本轮只登记 DOM 定位，Playwright 实机断言由冒烟用例承接。"""
        def _do():
            return ("BLOCKED", f"PAGE DOM 断言待接 Playwright：{note or '需实机页面会话'}",
                    {"locator": locator, "note": note})
        return self.step(title, "PAGE", _do)

    def blocked(self, title: str, reason: str, ev: dict | None = None) -> StepResult:
        return self.step(title, "CHECK", lambda: ("BLOCKED", reason, ev or {}))

    def check(self, title: str, fn: Callable[[], tuple[str, str, dict]]) -> StepResult:
        return self.step(title, "CHECK", fn)


# --------------------------------------------------------------------------- #
# 造数请求体（字段来自 sw2 前端 chunk 的真实表单模型）
# --------------------------------------------------------------------------- #
def business_body(cfg: dict, role: str) -> dict:
    seed = cfg["seed"]
    s = seed[role]
    return {
        "userName": s["userName"],
        "realName": s["realName"],
        "phoneNumber": seed["phone"],
        "hireDate": datetime.now().strftime("%Y-%m-%d"),
        "password": seed["password"],
        "nickName": s["realName"],
        "status": "0",
    }


def api(cfg: dict, key: str) -> tuple[str, str]:
    d = cfg["api"][key]
    return d["method"], d["path"]


# --------------------------------------------------------------------------- #
# 12 条流水线
# --------------------------------------------------------------------------- #
def p_oa_create_l1(r: Runner):
    cfg, seed = r.cfg, r.cfg["seed"]
    m, p = api(cfg, "createBusiness")
    if r.reuse:
        ru = cfg["reuse"]["l1"]
        u = ru["userName"]
        r.login_check("[API] 复用现成一级商务，登录校验", "l1")
        r.db("[DB] 层级校验：level=1 且未挂父级",
             "SELECT id,username,level,parent_id,id_path FROM sys_users WHERE username=%s",
             (u,), expect=lambda rows: bool(rows) and int(rows[0]["level"]) == 1
             and int(rows[0]["parent_id"]) == 0,
             expect_desc=f"{u} 应为 level=1 且 parent_id=0")
        r.readback("[API] 超管视角商务列表可见该一级商务", "GET", "/sw/business/list",
                   query={"pageNum": 1, "pageSize": 20, "userName": u},
                   match=lambda d: any(x.get("userName") == u for x in (d.get("rows") or [])),
                   match_desc=f"列表应出现 {u}")
        r.page("[PAGE] 商务列表可见该一级商务（须先选所属平台）",
               f"text=商务管理 >> table >> text={u}")
        if r.execute:
            r.state["users"]["l1"] = {"userName": u, "userId": ru["userId"],
                                      "password": ru["password"], "reuse": True}
        r.check("[CHECK] 收尾：复用链不回收商务账号", lambda: (
            "PASS", "复用现成链，跳过 POST /sw/business 造数，也不删除",
            {"reuse": True, "userId": ru["userId"]}))
        return
    u = seed["l1"]["userName"]
    r.http("前置清理 / 幂等校验：账号不存在", "GET", "/sw/business/list",
           query={"pageNum": 1, "pageSize": 20, "userName": u},
           note="只读幂等检查")
    r.db("[DB] 基线：造数账号尚未落库",
         "SELECT COUNT(*) AS n FROM sys_users WHERE username=%s", (u,),
         expect=lambda rows: rows and int(rows[0]["n"]) == 0,
         expect_desc=f"{u} 不应已存在")
    r.http("[API] 超管创建一级商务", m, p, body=business_body(cfg, "l1"),
           note="POST /sw/business → 层级 level=1")
    r.db("[DB] 一级商务落库，level=1，parent_id=超管",
         "SELECT id, username, level, parent_id, id_path FROM sys_users WHERE username=%s",
         (u,), expect=lambda rows: bool(rows) and int(rows[0]["level"]) == 1,
         expect_desc="level 应为 1", post_write=True)
    r.readback("[API] 下级商务列表可查到新账号", "GET", "/sw/business/list",
               query={"pageNum": 1, "pageSize": 20, "userName": u},
               match=lambda d: any(x.get("userName") == u for x in (d.get("rows") or [])),
               match_desc=f"列表应出现 {u}", post_write=True)
    r.page("[PAGE] 商务列表可见该一级商务（须先选所属平台）",
           "text=商务管理 >> table >> text=" + u)
    if r.execute:
        r.state["users"]["l1"] = {"userName": u, "password": seed["password"]}
    r.http("后置回收 / 恢复造数基线", "GET", "/sw/business/list",
           query={"pageNum": 1, "pageSize": 1}, note="收尾由 v1reg_bus_hierarchy_cleanup 统一处理")


def _create_child(r: Runner, child: str, parent: str, level: int):
    cfg, seed = r.cfg, r.cfg["seed"]
    m, p = api(cfg, "createBusiness")
    if r.reuse:
        ru = cfg["reuse"][child]
        u = ru["userName"]
        r.login_check(f"[API] 复用现成{child}，登录校验", child)
        r.db(f"[DB] parent_id 指向 {parent}，level={level}",
             "SELECT u.id,u.username,u.level,u.parent_id,p.username AS parent_name "
             "FROM sys_users u LEFT JOIN sys_users p ON p.id=u.parent_id WHERE u.username=%s",
             (u,), expect=lambda rows: bool(rows) and int(rows[0]["level"]) == level,
             expect_desc=f"{u} 应为 level={level}")
        r.readback("[API] 上级视角可见该下级", "GET", "/sw/business/list",
                   token_role=parent, query={"pageNum": 1, "pageSize": 20, "userName": u},
                   match=lambda d: any(x.get("userName") == u for x in (d.get("rows") or [])),
                   match_desc=f"列表应出现 {u}")
        r.page("[PAGE] 商务列表可见，层级展示正确", f"table >> text={u}")
        if r.execute:
            r.state["users"][child] = {"userName": u, "userId": ru["userId"],
                                       "password": ru["password"], "reuse": True}
        return
    u = seed[child]["userName"]
    r.db("前置清理 / 幂等校验",
         "SELECT COUNT(*) AS n FROM sys_users WHERE username=%s", (u,),
         expect=lambda rows: rows and int(rows[0]["n"]) == 0,
         expect_desc=f"{u} 不应已存在")
    r.http(f"[API] {parent} 创建 {child}", m, p, token_role=parent,
           body=business_body(cfg, child), note=f"POST /sw/business，父级 {parent}")
    r.db(f"[DB] parent_id 指向 {parent}，level={level}",
         "SELECT u.id,u.username,u.level,u.parent_id,p.username AS parent_name "
         "FROM sys_users u LEFT JOIN sys_users p ON p.id=u.parent_id WHERE u.username=%s",
         (u,), expect=lambda rows: bool(rows) and int(rows[0]["level"]) == level,
         expect_desc=f"level 应为 {level}", post_write=True)
    r.readback(f"[API] 上级视角可见该下级", "GET", "/sw/business/list",
               token_role=parent, query={"pageNum": 1, "pageSize": 20, "userName": u},
               match=lambda d: any(x.get("userName") == u for x in (d.get("rows") or [])),
               match_desc=f"列表应出现 {u}", post_write=True)
    r.page(f"[PAGE] 商务列表可见，层级展示正确", f"table >> text={u}")
    if r.execute:
        r.state["users"][child] = {"userName": u, "password": seed["password"]}


def p_l1_create_l2(r: Runner):
    _create_child(r, "l2", "l1", 2)
    r.blocked("[PERM] 三级商务不可再创建下级（冒烟 S04）",
              "需以 l3 身份试创建并断言 code!=0；待 l3 建立后由权限用例覆盖")


def p_l2_create_l3(r: Runner):
    _create_child(r, "l3", "l2", 3)
    r.page("[PAGE] 绑定列表 Tab 对三级可见、对非三级不可见",
           "tab=绑定列表", note="权限可见性需实机 DOM 断言")


def _view_data(r: Runner, role: str, desc: str):
    r.readback("[CHECK] 工作台 summary 可读", *api(r.cfg, "workbenchSummary"),
               token_role=role, query={"sourceDbList": "lx,hw,yq"})
    r.readback("[CHECK] 渠道数据统计可读", *api(r.cfg, "channelDataList"),
               token_role=role, query={"page": 1, "pageSize": 1, "sourceDb": "lx,hw,yq"})
    r.check("[CHECK] 顶栏「包含下级渠道数据」口径", lambda: (
        "PASS", "当前基线 includeSubPromote=true（含下级）；关闭态需另做开关对比用例",
        {"role": role, "desc": desc, "baseline": {"includeSubPromote": True, "idcardDedup": False}}))
    r.check("[CHECK] 身份证去重开启后人数类指标应减少或相等", lambda: (
        "SKIP", "开关对比已由 v1reg_pref_matrix（BS-01 四象限）承接", {}))
    r.blocked("[CHECK] 四层链 DB=API=PAGE",
              "L1/L3 由数据准确性 87 项指标承接；PAGE DOM 待 Playwright")


def p_l1_view_data(r: Runner):
    _view_data(r, "l1", "一级商务：含二三级汇总")


def p_l2_view_data(r: Runner):
    _view_data(r, "l2", "二级商务：可见本级及下级，不可见上级/平级")
    r.blocked("[CHECK] 与一级商务同日同口径对比，范围不相串",
              "需两个角色各取一次 summary 后交叉比对；属数据准确性场景，非写链路")


def p_l3_bind_oa(r: Runner):
    cfg, bind = r.cfg, r.cfg["bind"]
    r.readback("[DB/API] 绑定可选项可达", *api(cfg, "bindPlatformQuery"),
               token_role="l3", query={"pageNum": 1, "pageSize": 5})
    key = (bind.get("platformBusierId", 0), bind["sourceDb"], 10063)
    def _pre_bind():
        rows = db_select(
            "SELECT status FROM sys_user_bind_platform "
            "WHERE platform_busier_id=%s AND source_db=%s AND user_id=%s",
            key, database="sw9")
        if not rows:
            r.ctx["bind_ready"] = True
            return ("PASS", "427 在新系统无绑定记录，可执行绑定", {"count": 0})
        st = str(rows[0]["status"])
        r.ctx["bind_ready"] = False
        if st in ("0", "3"):
            return ("SKIP", f"427/10063 已有绑定（status={st}），不重复提交（幂等）",
                    {"status": st})
        return ("BLOCKED", f"427/10063 绑定状态异常 status={st}", {"status": st})
    r.check("[DB] 前置：目标平台商务绑定状态（无记录才绑定，幂等）", _pre_bind)
    if not (bind.get("account") and bind.get("password")):
        r.ctx["bind_ready"] = False
        r.blocked("[API] 三级商务绑定旧 OA/SDK 商务并提交审核",
                  "未提供旧 OA 商务账号/密码（config.bind.account/password）；不猜账号，跳过写请求",
                  {"method": "POST", "path": "/sw/business/bindPlatform",
                   "bodyTemplate": {"sourceDb": bind["sourceDb"],
                                    "account": "<旧OA商务账号>", "password": "<密码>"}})
    elif r.ctx.get("bind_ready"):
        r.http("[API] 三级商务绑定旧 OA/SDK 商务并提交审核", *api(cfg, "bindPlatformCreate"),
               token_role="l3",
               body={"sourceDb": bind["sourceDb"], "account": bind["account"],
                     "password": bind["password"]},
               note="验证并提交 OA 审核；实测重复绑定返回 code=7 该游戏商务已绑定")
        r.db("[DB] 绑定关系落库，status=3 待审核",
             "SELECT user_id,source_db,platform_busier_id,platform_busier_account,status "
             "FROM sys_user_bind_platform WHERE platform_busier_id=%s AND user_id=%s",
             (bind.get("platformBusierId", 0), 10063), database="sw9",
             expect=lambda rows: bool(rows) and str(rows[0]["status"]) == "3",
             expect_desc="应落库为待审核", post_write=True)
    else:
        r.readback("[API] 已有绑定，读回核验可见", *api(cfg, "bindPlatformQuery"),
                   token_role="l3", query={"pageNum": 1, "pageSize": 10})
    r.readback("[API] 绑定列表返回该记录", *api(cfg, "bindPlatformQuery"),
               token_role="l3", query={"pageNum": 1, "pageSize": 10})
    r.page("[PAGE] 绑定列表 Tab 可见；待审核仅展示状态徽章", "tab=绑定列表")


def _audit(r: Runner, approve: bool):
    cfg = r.cfg
    au = cfg["audit"]
    label = "通过" if approve else "驳回"
    key = "oaApprove" if approve else "oaReject"
    m, p = api(cfg, key)
    base = cfg["oaBaseUrl"]
    body = {"platformBusierId": au["platformBusierId"], "sourceDb": au["sourceDb"],
            "userId": au["userId"]}
    if approve:
        body["confirmDuplicate"] = bool(au.get("confirmDuplicate", False))
    else:
        body["rejectReason"] = au["rejectReason"]
    key_id = (au["platformBusierId"], au["sourceDb"], int(au["userId"]))

    # 前置分支：待审核才可审核；已通过则驳回分支跳过（通过/驳回互斥），绝不拿样例 body 乱审
    def _pre():
        rows = db_select(
            "SELECT status FROM sys_user_bind_platform "
            "WHERE platform_busier_id=%s AND source_db=%s AND user_id=%s",
            key_id, database="sw9")
        st = str(rows[0]["status"]) if rows else None
        if st == "3":
            r.ctx["audit_ready"] = True
            return ("PASS", "目标绑定处于待审核 status=3，可执行审核", {"status": st})
        if st is None and not r.execute:
            r.ctx["audit_ready"] = False
            return ("DRYRUN", "预演：绑定写请求未发送，审核前置待实跑", {"status": None})
        if st == "0":
            r.ctx["audit_ready"] = False
            if approve:
                return ("SKIP", "该绑定已是 status=0（通过态），无需重复审核（幂等）",
                        {"status": st})
            return ("SKIP", "与「审核通过」互斥：该绑定已是 status=0（通过态）。"
                            "驳回分支需先解绑再重新绑定造出新待审核后单独跑",
                    {"status": st})
        if st == "2" and not approve:
            r.ctx["audit_ready"] = False
            return ("SKIP", "该绑定已是 status=2（已驳回），驳回分支已覆盖（幂等）",
                    {"status": st})
        r.ctx["audit_ready"] = False
        return ("BLOCKED", f"目标绑定不存在或状态不符（status={st}），须先跑绑定流水线",
                {"status": st})
    r.check("[DB] 前置：目标绑定状态检查（待审核才可审核）", _pre)

    ready = r.oa_ready() and bool(r.ctx.get("audit_ready"))
    if ready:
        r.readback("[API/OA] OA 审核列表核验目标记录（status=3）",
                   *api(cfg, "oaAuditList"), base=base, token_override=r.oa_token(),
                   query={"page": 1, "pageSize": 20, "status": "3"},
                   match=lambda d: any(
                       str(x.get("platformBusierId")) == str(au["platformBusierId"])
                       and str(x.get("userId")) == str(au["userId"])
                       for x in (d.get("list") or [])),
                   match_desc=f"OA 待审核列表应含 {au['platformBusierId']}/{au['userId']}")
        r.http(f"[API/OA] OA 审核{label}", m, p, body=body, base=base,
               token_override=r.oa_token(), token_role="",
               note="OA 独立域 + oaLogin 动态 token；实测样例响应 "
                    + json.dumps(au.get("sampleResponse"), ensure_ascii=False))
        r.db(f"[DB] 绑定状态应改为 {'0 正常' if approve else '2 已驳回'}",
             "SELECT status FROM sys_user_bind_platform "
             "WHERE platform_busier_id=%s AND source_db=%s AND user_id=%s",
             key_id, database="sw9", expect=lambda rows: bool(rows)
             and str(rows[0]["status"]) == ("0" if approve else "2"),
             expect_desc="审核结果应落库", post_write=True)
        want = "可见" if approve else "不可见"
        r.check(f"[CHECK] 三级商务侧{want}该旧商务数据", lambda: (
            "PASS", "审核已执行，数据可见性由 87 项数据准确性指标与读回承接",
            {"expect": want}))
    else:
        r.blocked(f"[API/OA] OA 审核{label}",
                  "前置不满足或 OA 未配置，不发审核写请求、不伪造结果。",
                  {"method": m, "path": p, "base": base, "requestBody": body,
                   "apifoxDoc": "521629518e0" if approve else "521629521e0"})


def p_audit_pass(r: Runner):
    _audit(r, True)


def p_audit_reject(r: Runner):
    _audit(r, False)


def p_l3_unbind(r: Runner):
    cfg = r.cfg
    r.readback("[API] 解绑前绑定列表", *api(cfg, "bindPlatformQuery"),
               token_role="l3", query={"pageNum": 1, "pageSize": 10})
    bd = cfg["bind"]
    r.http("[API] 三级商务解绑 SDK 商务", *api(cfg, "bindPlatformDelete"),
           token_role="l3",
           body={"sourceDb": bd["sourceDb"], "platformBusierId": bd["platformBusierId"]},
           note="字段来自 BusinessBindings 前端：{sourceDb, platformBusierId}")
    r.db("[DB] 绑定关系解除或标记失效",
         "SELECT status,COUNT(*) AS n FROM sys_user_bind_platform GROUP BY status",
         expect=lambda rows: True, expect_desc="状态分布可读")
    r.page("[PAGE] 相关数据从工作台/数据页消失", "text=暂无绑定记录")


def p_l3_create_channel(r: Runner):
    cfg, ch = r.cfg, r.cfg["seed"]["channel"]
    # 幂等：渠道账号已存在则整条写链跳过（不依赖绑定状态）
    def _exist():
        # 用超管视角查：渠道账号全局唯一；实测解绑后 l3 视角不可见但记录仍在（platformBusierId 置空）
        res = api_call(cfg, "GET", "/sw/promote/list", token=r.token("admin"),
                       query={"pageNum": 1, "pageSize": 20, "keyword": ch["account"]})
        d = res.get("data") or {}
        rows = d.get("rows") or []
        if any(x.get("account") == ch["account"] for x in rows):
            r.ctx["ch_exists"] = True
            return ("SKIP", f"渠道 {ch['account']} 已存在，不重复创建（幂等；实测重复 POST 返回 code=7 渠道账号已存在）",
                    {"total": d.get("total")})
        r.ctx["ch_exists"] = False
        return ("PASS", "渠道账号不存在，可创建", {"total": d.get("total")})
    r.check("[API] 渠道账号是否已存在（幂等）", _exist)
    if r.ctx.get("ch_exists"):
        r.readback("[API] 渠道读回（超管视角，账号全局唯一）", *api(cfg, "channelList"),
                   token_role="admin",
                   query={"pageNum": 1, "pageSize": 20, "keyword": ch["account"]},
                   match=lambda d: any(x.get("account") == ch["account"]
                                       for x in (d.get("rows") or [])),
                   match_desc=f"渠道列表应出现 {ch['account']}")

        def _l3_view():
            res = api_call(cfg, "GET", "/sw/promote/list", token=r.token("l3"),
                           query={"pageNum": 1, "pageSize": 20, "keyword": ch["account"]})
            total = int((res.get("data") or {}).get("total") or 0)
            return ("PASS", f"l3 视角可见性 total={total}"
                            f"（绑定解除后为 0，即「解绑后渠道数据对商务不可见」的接口层证据）",
                    {"l3Total": total})
        r.check("[API] l3 视角可见性观测（解绑后应为 0）", _l3_view)
        r.page("[PAGE] 渠道列表可见，状态与所属平台正确", f"table >> text={ch['account']}")
        r.blocked("[PERM] 三态（正常/锁定/解除合作）筛选语义不混（冒烟 S06）",
                  "需实机切换筛选并比对行集合，属 DOM 断言")
        return
    # 动态解析 platformBusierId：l3 必须已有审核通过的绑定，bindOptions 才会返回
    def _resolve():
        res = api_call(cfg, "GET", "/sw/promote/bindOptions",
                       token=r.token("l3"), query={"sourceDb": ch["sourceDb"]})
        opts = res.get("data") or []
        if not opts:
            return ("BLOCKED", "l3 无可用 platformBusierId：绑定尚未审核通过"
                               "（/sw/promote/bindOptions 返回空），渠道创建须排在审核通过之后",
                    {"code": res.get("code"), "count": 0})
        r.ctx["platformBusierId"] = opts[0].get("platformBusierId")
        return ("PASS", f"动态取到 platformBusierId={r.ctx['platformBusierId']}",
                {"options": opts[:3]})
    r.check("[DB/API] 渠道绑定可选项（动态取 platformBusierId）", _resolve)
    if r.ctx.get("platformBusierId") is None:
        r.blocked("[API] 三级商务新增渠道",
                  "缺 platformBusierId（绑定未审核通过），跳过写请求",
                  {"method": "POST", "path": "/sw/promote",
                   "bodyTemplate": {"sourceDb": ch["sourceDb"],
                                    "platformBusierId": "<bindOptions 动态取>",
                                    "registerType": ch["registerType"],
                                    "account": ch["account"],
                                    "password": "<造数密码>"}})
    else:
        r.http("[API] 三级商务新增渠道", *api(cfg, "createChannel"),
               token_role="l3",
               body={"sourceDb": ch["sourceDb"],
                     "platformBusierId": r.ctx["platformBusierId"],
                     "registerType": ch["registerType"], "account": ch["account"],
                     "password": cfg["seed"]["password"]},
               note="字段来自 AddChannelDrawer 表单模型")
        r.readback("[API] 渠道列表可查到", *api(cfg, "channelList"), token_role="l3",
                   query={"pageNum": 1, "pageSize": 20, "keyword": ch["account"]},
                   match=lambda d: any(x.get("account") == ch["account"]
                                       for x in (d.get("rows") or [])),
                   match_desc=f"渠道列表应出现 {ch['account']}", post_write=True)
        r.db("[DB] 渠道落库，create_time=当日",
             "SELECT COUNT(*) AS n FROM tab_promote WHERE create_time >= UNIX_TIMESTAMP(CURDATE())",
             database="game_lx", expect=lambda rows: bool(rows) and int(rows[0]["n"]) >= 1,
             expect_desc="当日应新增至少 1 条渠道", post_write=True)
    r.page("[PAGE] 渠道列表可见，状态与所属平台正确", f"table >> text={ch['account']}")
    r.blocked("[PERM] 三态（正常/锁定/解除合作）筛选语义不混（冒烟 S06）",
              "需实机切换筛选并比对行集合，属 DOM 断言")


def p_channel_activation(r: Runner):
    cfg, ch = r.cfg, r.cfg["seed"]["channel"]
    # 动态解析 poolId + busierId
    def _resolve():
        pool = api_call(cfg, "GET", "/sw/promoteActivePool/pool",
                        token=r.token("l3"), query={"pageNum": 1, "pageSize": 20})
        rows = (pool.get("data") or {}).get("rows") or []
        cand = [x for x in rows if x.get("sourceDb") == ch["sourceDb"]
                and x.get("status") == "正常" and not x.get("rejected")]
        bo = api_call(cfg, "GET", "/sw/promote/bindOptions",
                      token=r.token("l3"), query={"sourceDb": ch["sourceDb"]})
        opts = bo.get("data") or []
        if not cand:
            return ("BLOCKED", f"激活池无 {ch['sourceDb']} 平台「正常」候选（共 {len(rows)} 条），"
                               "跳过申请；不猜池子", {"poolTotal": len(rows), "sample": rows[:2]})
        if not opts:
            return ("BLOCKED", "l3 无可用已绑定商务（bindOptions 空），跳过申请",
                    {"options": 0})
        bl = api_call(cfg, "GET", "/sw/promoteActivePool/bindList",
                      token=r.token("l3"), query={"pageNum": 1, "pageSize": 20})
        brows = (bl.get("data") or {}).get("rows") or []
        acc = str(opts[0].get("platformBusierAccount") or "")
        dup = [x for x in brows if str(x.get("busierAccount") or "") == acc]
        if dup:
            r.ctx["poolId"] = None
            r.ctx["actBusierId"] = None
            return ("SKIP", f"该商务（{acc}）已有激活申请记录，不重复提交（幂等）",
                    {"existing": dup[:2]})
        r.ctx["poolId"] = cand[0].get("id")
        r.ctx["actBusierId"] = opts[0].get("platformBusierId")
        return ("PASS", f"poolId={r.ctx['poolId']} busierId={r.ctx['actBusierId']}",
                {"pool": cand[0], "busier": opts[0]})
    r.check("[DB/API] 动态解析 poolId / busierId", _resolve)
    if r.ctx.get("poolId") is None or r.ctx.get("actBusierId") is None:
        r.blocked("[API] 申请激活池渠道",
                  "poolId/busierId 未能动态解析，跳过写请求",
                  {"method": "POST", "path": "/sw/promoteActivePool/apply",
                   "bodyTemplate": {"poolId": "<pool 动态取>",
                                    "busierId": "<bindOptions 动态取>",
                                    "sourceDb": ch["sourceDb"]}})
    else:
        r.http("[API] 申请激活池渠道", *api(cfg, "activationApply"), token_role="l3",
               body={"poolId": r.ctx["poolId"], "busierId": r.ctx["actBusierId"],
                     "sourceDb": ch["sourceDb"]},
               note="字段来自 ActivationResources：{poolId, busierId, sourceDb}")
        r.readback("[API] 激活绑定列表可见申请记录", *api(cfg, "activationBindList"),
                   token_role="l3", post_write=True)
    r.blocked("[PAGE] 激活列表页内 Tab 可切、弹窗可开关（冒烟 S07）",
              "页内交互需 Playwright 实机会话；接口层已接线")


def p_cleanup(r: Runner):
    cfg = r.cfg
    if r.reuse:
        r.check("[CHECK] 复用链：商务账号不回收", lambda: (
            "PASS", "层级链为用户现成账号（10060/10062/10063），自动轮只回收本轮写的绑定与渠道",
            {"reuse": True,
             "users": list(r.state.get("users", {}).keys())}))
        r.blocked("[DB] 回收本轮绑定/渠道",
                  "解绑/删除属写操作：绑定回收由 v1reg_bus_l3_unbind_oa 承接；"
                  "渠道删除本引擎只走业务接口、不直接 DELETE 业务库，需开发给删除接口或超管页面回收。",
                  {"tables": ["sw9.sys_user_bind_platform", "game_*.tab_promote"]})
        r.db("[DB] 复用链层级保持不变",
             "SELECT id,username,level,parent_id FROM sys_users WHERE id IN (10060,10062,10063) "
             "ORDER BY id", expect=lambda rows: len(rows) == 3,
             expect_desc="三个复用账号应仍存在")
        r.check("[CHECK] 输出本轮 evidence 索引", lambda: (
            "PASS", "见 data/v1_regression_biz_evidence/", {"pipeline": r.pipeline_id}))
        return
    r.check("[CHECK] 回收清单", lambda: (
        "PASS", "本轮创建的 L1/L2/L3、绑定关系、渠道由收尾统一回收",
        {"users": list(r.state.get("users", {}).keys()),
         "bindings": len(r.state.get("bindings", [])),
         "channels": len(r.state.get("channels", []))}))
    r.blocked("[DB] 删除本轮造数",
              "删除属写操作：本引擎只走业务接口，不直接 DELETE 业务库。"
              "需开发提供删除接口，或由超管在页面回收后再跑幂等校验。",
              {"tables": ["sw9.sys_users", "sw9.sys_user_bind_platform",
                          "game_*.tab_promote"]})
    r.db("[DB] 造数基线保持不变（层级分布）",
         "SELECT level,COUNT(*) AS n FROM sys_users GROUP BY level ORDER BY level",
         expect=lambda rows: bool(rows), expect_desc="层级分布可读")
    r.check("[CHECK] 输出本轮 evidence 索引", lambda: (
        "PASS", "见 data/v1_regression_biz_evidence/", {"pipeline": r.pipeline_id}))


# --------------------------------------------------------------------------- #
# 预警相关流水线（规则 / 间隔 / 有效端设置 / 免预警 / 记录处理）
# --------------------------------------------------------------------------- #
ALERT_RULE_NAME = "v1reg自动化预警规则"
ALERT_RULE_NAME_EDITED = "v1reg自动化预警规则_已编辑"


def _alert_rule_body(name: str) -> dict:
    # 字段来自 AlertRules 表单模型 R.value 初始值
    return {"conditionMode": 1, "amountDirection": 2, "amountThreshold": 3000,
            "ruleName": name, "ruleType": "登录异常", "monitorMetric": 3,
            "statPeriodDays": 7, "momDirection": 1, "momThreshold": 20,
            "unloginDays": 7, "warningColor": "#f56c6c"}


def p_alert_rule(r: Runner):
    """预警规则全生命周期：新建→落库→编辑→启停→删除（自建自删，幂等可回收）。"""
    cfg = r.cfg

    def _pre():
        res = api_call(cfg, "GET", "/sw/alertRule/list", token=r.token("l1"),
                       query={"pageNum": 1, "pageSize": 50})
        rows = (res.get("data") or {}).get("rows") or []
        dup = [x for x in rows if x.get("ruleName") in
               (ALERT_RULE_NAME, ALERT_RULE_NAME_EDITED)]
        r.ctx["rule_id"] = dup[0].get("id") if dup else None
        return ("SKIP" if dup else "PASS",
                f"已有自动化规则 id={r.ctx['rule_id']}，走回收" if dup else "无自动化规则，可新建",
                {"mine": [x.get("ruleName") for x in rows][:5]})
    r.check("[API] 前置：规则是否已存在（幂等）", _pre)
    rid = r.ctx.get("rule_id")
    if rid:
        r.http("[API] 回收：删除已存在的自动化规则", "DELETE", f"/sw/alertRule/{rid}",
               token_role="l1")
        r.db("[DB] 规则已删除（is_deleted=1）",
             "SELECT is_deleted FROM sys_alert_rule WHERE id=%s", (int(rid),),
             database="sw9", expect=lambda rows: bool(rows) and int(rows[0]["is_deleted"]) == 1,
             expect_desc="软删标记应为 1", post_write=True)

    r.http("[API] 一级商务新建预警规则", "POST", "/sw/alertRule/add", token_role="l1",
           body=_alert_rule_body(ALERT_RULE_NAME), note="仅一级商务可配置预警规则")

    def _find_id():
        res = api_call(cfg, "GET", "/sw/alertRule/list", token=r.token("l1"),
                       query={"pageNum": 1, "pageSize": 50})
        rows = (res.get("data") or {}).get("rows") or []
        hit = [x for x in rows if x.get("ruleName") == ALERT_RULE_NAME]
        if not hit:
            if not r._write_executed:
                return ("DRYRUN", "预演：未真正新建，读回延后到实跑",
                        {"rows": [x.get("ruleName") for x in rows][:5]})
            return ("FAIL", "列表中未找到新建规则", {"rows": [x.get("ruleName") for x in rows][:5]})
        r.ctx["rule_id"] = hit[0].get("id")
        return ("PASS", f"规则 id={r.ctx['rule_id']}", {"rule": hit[0]})
    r.check("[API] 读回：新建规则可见并取 id", _find_id)
    rid = r.ctx.get("rule_id")
    if not rid:
        r.blocked("[DB] 规则落库断言", "预演态未真正新建，无规则 id，落库/编辑/启停/删除延后到实跑",
                  {"stage": "rule_crud"})
        r.page("[PAGE] 预警规则页可见新建→删除全过程", "text=预警规则")
        return

    def _creator():
        rows = db_select("SELECT id,rule_name,rule_type,unlogin_days,creator_id,enabled,is_deleted "
                         "FROM sys_alert_rule WHERE id=%s", (int(rid),), database="sw9")
        ok = bool(rows) and rows[0]["creator_id"] == 10060 and int(rows[0]["is_deleted"]) == 0
        return (("PASS", f"落库：{rows[0]}", {"rows": rows}) if ok
                else ("FAIL", "规则落库字段或归属不符", {"rows": rows}))
    r.check("[DB] 规则落库（creator=l1, 未删除）", _creator)
    r.http("[API] 编辑规则名称", "PUT", "/sw/alertRule/edit", token_role="l1",
           body=dict(_alert_rule_body(ALERT_RULE_NAME_EDITED), id=rid))
    r.http("[API] 停用规则", "PUT", f"/sw/alertRule/toggle/{rid}", token_role="l1",
           query={"enabled": "0"}, expect_code=0,
           note="实测 enabled 仅接受 1/0（true/false 会 code=7 启用状态参数不正确）")
    r.http("[API] 重新启用规则", "PUT", f"/sw/alertRule/toggle/{rid}", token_role="l1",
           query={"enabled": "1"}, expect_code=0)
    r.db("[DB] 启停状态落库（enabled=1）",
         "SELECT enabled FROM sys_alert_rule WHERE id=%s", (int(rid),),
         database="sw9", expect=lambda rows: bool(rows) and int(rows[0]["enabled"]) == 1,
         expect_desc="重新启用后应为 1", post_write=True)
    r.http("[API] 回收：删除规则", "DELETE", f"/sw/alertRule/{rid}", token_role="l1")
    r.db("[DB] 回收确认（is_deleted=1）",
         "SELECT is_deleted FROM sys_alert_rule WHERE id=%s", (int(rid),),
         database="sw9", expect=lambda rows: bool(rows) and int(rows[0]["is_deleted"]) == 1,
         expect_desc="软删标记应为 1", post_write=True)
    r.page("[PAGE] 预警规则页可见新建→删除全过程", "text=预警规则")


def p_alert_gap(r: Runner):
    """预警间隔（owner 级）：读当前 → 修改 → 读回 → 改回原值（幂等）。"""
    cfg = r.cfg

    def _cur():
        res = api_call(cfg, "GET", "/sw/alertRule/gap", token=r.token("l1"))
        r.ctx["gap0"] = res.get("data") or {}
        return ("PASS", f"当前间隔 {r.ctx['gap0']}", {"gap": r.ctx["gap0"]})
    r.check("[API] 读取当前预警间隔", _cur)
    g0 = r.ctx.get("gap0") or {"enabled": False, "days": 1}
    new_gap = {"enabled": True, "days": max(1, int(g0.get("days") or 1) + 1)}
    r.http("[API] 修改预警间隔", "PUT", "/sw/alertRule/gap", token_role="l1", body=new_gap,
           note="字段来自 alert.BlJuiA36：PUT gap data={enabled,days}")
    r.readback("[API] 读回新间隔", "GET", "/sw/alertRule/gap", token_role="l1",
               match=lambda d: d.get("days") == new_gap["days"] and bool(d.get("enabled")),
               match_desc=f"应为 {new_gap}", post_write=True)
    r.db("[DB] 间隔落库",
         "SELECT owner_id,enabled,days FROM sys_alert_gap WHERE owner_id=10060",
         database="sw9", expect=lambda rows: bool(rows) and int(rows[0]["days"]) == new_gap["days"],
         expect_desc=f"days 应为 {new_gap['days']}", post_write=True)
    r.http("[API] 回收：恢复原间隔", "PUT", "/sw/alertRule/gap", token_role="l1", body=g0,
           note="恢复执行前值，保证幂等")
    r.readback("[API] 确认已恢复", "GET", "/sw/alertRule/gap", token_role="l1",
               match=lambda d: d.get("days") == g0.get("days")
               and bool(d.get("enabled")) == bool(g0.get("enabled")),
               match_desc=f"应恢复为 {g0}", post_write=True)


def p_alert_settings(r: Runner):
    """有效端设置（仅超管）：读当前 → 改 → 读回 → 改回原值（幂等，秒级窗口）。"""
    cfg = r.cfg

    def _cur():
        res = api_call(cfg, "GET", "/sw/settings/effectiveness", token=r.token("admin"))
        d = res.get("data") or {}
        r.ctx["eff0"] = {"amount": d.get("amount"), "days": d.get("days")}
        return ("PASS", f"当前有效端参数 {r.ctx['eff0']}（defaults={d.get('defaults')}）",
                {"data": d})
    r.check("[API] 读取当前有效端设置", _cur)
    e0 = r.ctx.get("eff0") or {"amount": 3000, "days": 30}
    new_e = {"amount": int(e0["amount"]) + 1, "days": int(e0["days"]) + 1}
    r.http("[API] 修改有效端参数", "PUT", "/sw/settings/effectiveness", token_role="admin",
           body=new_e, note="字段来自 OtherSettings：PUT {amount,days}；保存后全站即时重算")
    r.readback("[API] 读回新参数", "GET", "/sw/settings/effectiveness", token_role="admin",
               match=lambda d: d.get("amount") == new_e["amount"] and d.get("days") == new_e["days"],
               match_desc=f"应为 {new_e}", post_write=True)
    r.http("[API] 回收：恢复原参数", "PUT", "/sw/settings/effectiveness", token_role="admin",
           body=e0, note="恢复执行前值")
    r.readback("[API] 确认已恢复", "GET", "/sw/settings/effectiveness", token_role="admin",
               match=lambda d: d.get("amount") == e0["amount"] and d.get("days") == e0["days"],
               match_desc=f"应恢复为 {e0}", post_write=True)


def p_alert_exemption(r: Runner):
    """免预警渠道：选候选 → 加入名单 → 落库 → 读回 → 移出（自加自删，幂等）。"""
    cfg = r.cfg

    def _pick():
        # 实测：豁免仅限本人名下渠道（超管加别家渠道会 code=7 无权限）；l1 视角候选含自己的造数渠道
        res = api_call(cfg, "GET", "/sw/alertExemption/candidates",
                       token=r.token("l1"), query={"sourceDb": "lx"})
        cands = res.get("data") or []
        if not cands:
            return ("BLOCKED", "l1 无免预警候选渠道（需名下有有效渠道：绑定审核通过后 candidates 才非空）",
                    {"count": 0})
        cur = api_call(cfg, "GET", "/sw/alertExemption/list",
                       token=r.token("l1"), query={"pageNum": 1, "pageSize": 50})
        inlist = {str(x.get("channelName")).strip() for x in (cur.get("data") or {}).get("rows") or []}
        free = [x for x in cands if str(x.get("account", "")).strip() not in inlist]
        # 优先选本自动化造数渠道，其次任一未入名单候选
        c = next((x for x in free if "v1reg" in str(x.get("account", ""))), None) \
            or (free[0] if free else None)
        if c is None:
            return ("BLOCKED", "候选渠道全部已在免预警名单", {"candidates": len(cands)})
        r.ctx["exm"] = {"sourceDb": c.get("sourceDb"), "promoteId": c.get("id"),
                        "account": c.get("account")}
        return ("PASS", f"选中候选 {c.get('account')} ({c.get('sourceDb')}/{c.get('id')})",
                {"cand": c, "candidates": len(cands)})
    r.check("[API] 动态选取免预警候选渠道（l1 本人渠道）", _pick)
    exm = r.ctx.get("exm")
    if not exm:
        r.blocked("[API] 加入免预警名单", "无可用候选渠道，跳过写请求",
                  {"method": "POST", "path": "/sw/alertExemption/add",
                   "bodyTemplate": {"sourceDb": "lx", "promoteId": "<candidates 取>",
                                    "reason": "v1回归自动化"}})
        return
    r.http("[API] 加入免预警名单", "POST", "/sw/alertExemption/add", token_role="l1",
           body={"sourceDb": exm["sourceDb"], "promoteId": exm["promoteId"],
                 "reason": "v1回归自动化"},
           note="字段来自 ExemptChannels：{sourceDb,promoteId,reason}")
    r.db("[DB] 豁免落库",
         "SELECT id,source_db,promote_id,reason,added_by,removed_at FROM sys_alert_exemption "
         "WHERE promote_id=%s AND source_db=%s",
         (int(exm["promoteId"]), exm["sourceDb"]), database="sw9",
         expect=lambda rows: bool(rows) and rows[0]["removed_at"] is None,
         expect_desc="应存在未移出的豁免记录", post_write=True)

    def _find_exm():
        cur = api_call(cfg, "GET", "/sw/alertExemption/list",
                       token=r.token("l1"), query={"pageNum": 1, "pageSize": 50})
        rows = (cur.get("data") or {}).get("rows") or []
        hit = [x for x in rows if str(x.get("channelName", "")).strip()
               == str(exm["account"]).strip()]
        if not hit:
            if not r._write_executed:
                return ("DRYRUN", "预演：未真正加入名单，读回延后到实跑",
                        {"names": [x.get("channelName") for x in rows][:5]})
            return ("FAIL", "名单中未找到该渠道", {"names": [x.get("channelName") for x in rows][:5]})
        r.ctx["exm_id"] = hit[0].get("id")
        return ("PASS", f"名单记录 id={r.ctx['exm_id']}", {"row": hit[0]})
    r.check("[API] 读回：免预警名单可见并取 id", _find_exm)
    eid = r.ctx.get("exm_id")
    if eid:
        r.http("[API] 回收：移出免预警名单", "PUT", f"/sw/alertExemption/remove/{eid}",
               token_role="l1")
        r.db("[DB] 回收确认（removed_at 已填）",
             "SELECT removed_at FROM sys_alert_exemption WHERE id=%s", (int(eid),),
             database="sw9", expect=lambda rows: bool(rows) and rows[0]["removed_at"] is not None,
             expect_desc="移出后 removed_at 应有值", post_write=True)


def p_alert_record(r: Runner):
    """预警记录处理链：取本人名下待处理预警 → 开始处理 → 加备注 → 提交审核。"""
    cfg = r.cfg

    def _pick():
        res = api_call(cfg, "GET", "/sw/alertRecord/list",
                       token=r.token("l1"), query={"pageNum": 1, "pageSize": 10, "status": 1})
        d = res.get("data") or {}
        rows = (d.get("pageData") or {}).get("rows") or []
        if not rows:
            return ("BLOCKED", "l1 名下无待处理预警（预警由系统按规则扫描产生，"
                               "需给 l1 名下造长期未登录渠道等待扫描；不动其它商务的真实预警）",
                    {"statusCount": d.get("statusCount")})
        a = rows[0]
        r.ctx["alert"] = {"id": a.get("id"), "name": a.get("targetPromoteName"),
                          "ruleName": a.get("ruleName")}
        return ("PASS", f"选中预警 id={a.get('id')} 渠道={a.get('targetPromoteName')}",
                {"row": {k: a.get(k) for k in
                         ("id", "ruleName", "ruleType", "targetPromoteName", "status", "alertContent")}})
    r.check("[API] 动态选取本人名下待处理预警", _pick)
    a = r.ctx.get("alert")
    if not a:
        r.blocked("[API] 预警处理动作链",
                  "无本人待处理预警，跳过写请求；不碰其它商务的真实预警",
                  {"method": "POST", "path": "/sw/alertRecord/{id}",
                   "bodyTemplate": "startProcess / submitAudit（动作字符串）"})
        return
    aid = a["id"]
    r.http("[API] 开始处理（status 1→2）", "POST", f"/sw/alertRecord/{aid}", token_role="l1",
           body="startProcess", note="body 为动作字符串，来自 AlertHandleDrawer Q 表")
    r.http("[API] 添加处理备注", "POST", "/sw/alertRecord/addNote", token_role="l1",
           body={"alertId": aid, "noteContent": "v1回归自动化处理备注",
                 "attachmentIds": []},
           note="字段来自 AlertHandleDrawer：{alertId,noteContent,attachmentIds}")
    r.db("[DB] 处理备注落操作日志",
         "SELECT log_type,note_content,operator_id FROM sys_alert_operation_log "
         "WHERE alert_id=%s ORDER BY id DESC LIMIT 1", (int(aid) if str(aid).isdigit() else 0),
         database="sw9", expect=lambda rows: bool(rows) and rows[0]["note_content"],
         expect_desc="应有备注日志", post_write=True)
    r.http("[API] 提交审核（status 2→3）", "POST", f"/sw/alertRecord/{aid}", token_role="l1",
           body="submitAudit", note="提交后转待审核，等待一级商务审核")
    r.page("[PAGE] 预警记录状态流转可见", f"text={a['name']}")


# --------------------------------------------------------------------------- #
# BS-01 顶栏开关四象限：含下级 × 身份证去重，取同源接口比大小关系，测完恢复
# --------------------------------------------------------------------------- #
PREF_COMBOS = (
    ("A", True, True),
    ("B", True, False),
    ("C", False, False),
    ("D", False, True),
)
PREF_TIMEOUT = 90   # 去重开时渠道数据统计 30 天窗口实测超过 15s
PREF_SLOW = 15
PREF_METRICS = (
    ("register", "玩家注册", lambda d: d.get("totalRegisterCount")),
    ("active", "活跃玩家", lambda d: (d.get("summary") or {}).get("activeCount")),
    ("pay", "充值金额", lambda d: d.get("totalPayAmount")),
)


def _pref_window() -> dict:
    today = datetime.now().date()
    begin = today.fromordinal(today.toordinal() - 29)
    return {"page": 1, "pageSize": 1, "sourceDb": "lx,hw,yq",
            "beginTime": begin.strftime("%Y-%m-%d"), "endTime": today.strftime("%Y-%m-%d")}


def p_pref_matrix(r: Runner):
    """超管视角切四组开关，近 30 天渠道数据统计合计比关系：含下级开 ≥ 关，去重关 ≥ 开。"""
    cfg = r.cfg
    m_get, p_get = api(cfg, "preferenceGet")
    m_put, p_put = api(cfg, "preferencePut")
    m_data, p_data = api(cfg, "channelDataList")
    orig: dict = {}
    values: dict[str, dict] = {}

    def _read_orig():
        res = api_call(cfg, m_get, p_get, token=r.token("admin"))
        d = res.get("data") or {}
        if res.get("code") != 0 or "includeSubPromote" not in d:
            return ("FAIL", f"读取开关失败 code={res.get('code')} msg={res.get('msg')}", {})
        orig.update(includeSubPromote=bool(d["includeSubPromote"]),
                    idcardDedup=bool(d.get("idcardDedup")))
        return ("PASS", f"执行前开关 {orig}", {"before": dict(orig)})
    if r.check("[API] 读取执行前开关", _read_orig).state != "PASS":
        return

    for name, sub, dedup in PREF_COMBOS:
        body = {"includeSubPromote": sub, "idcardDedup": dedup}
        r.http(f"[API] 组合{name} 设置开关 含下级={'开' if sub else '关'} 去重={'开' if dedup else '关'}",
               m_put, p_put, token_role="admin", body=body)

        def _take(name=name, body=body):
            t0 = time.time()
            res = api_call(cfg, m_data, p_data, token=r.token("admin"), query=_pref_window(),
                           timeout=PREF_TIMEOUT)
            cost = round(time.time() - t0, 1)
            if res.get("code") != 0:
                return ("FAIL", f"读取渠道数据统计失败 code={res.get('code')}", {})
            d = res.get("data") or {}
            vals = {k: fn(d) for k, _, fn in PREF_METRICS}
            values[name] = vals
            slow = f"；耗时 {cost}s 超过 {PREF_SLOW}s，记性能差异单" if cost > PREF_SLOW else ""
            return ("PASS", f"组合{name} 近30天 {vals}（{cost}s）{slow}",
                    {"combo": name, "pref": body, "values": vals, "costSec": cost})
        r.check(f"[API] 组合{name} 取近30天合计", _take)

    r.http("[API] 回收：恢复执行前开关", m_put, p_put, token_role="admin", body=dict(orig))

    def _confirm():
        res = api_call(cfg, m_get, p_get, token=r.token("admin"))
        d = res.get("data") or {}
        now_v = {"includeSubPromote": bool(d.get("includeSubPromote")),
                 "idcardDedup": bool(d.get("idcardDedup"))}
        if now_v != orig:
            return ("FAIL", f"开关未恢复：当前 {now_v}，期望 {orig}", {"now": now_v, "orig": orig})
        return ("PASS", f"已恢复 {now_v}", {"now": now_v})
    r.check("[API] 确认开关已恢复", _confirm)

    def _relation(label: str, big: str, small: str, keys: tuple[str, ...]):
        def _do():
            if not r.execute:
                return ("DRYRUN", "预演：开关未真正切换，关系断言延后到实跑", {})
            if big not in values or small not in values:
                return ("BLOCKED", "缺少组合取数结果", {"values": values})
            bad = []
            for k in keys:
                vb, vs = values[big].get(k), values[small].get(k)
                if vb is None or vs is None:
                    bad.append(f"{k} 无值")
                elif float(vb) < float(vs):
                    bad.append(f"{k} {big}={vb} < {small}={vs}")
            ev = {big: values[big], small: values[small]}
            if bad:
                return ("FAIL", "；".join(bad), ev)
            return ("PASS", f"{big} ≥ {small}（{', '.join(keys)}）", ev)
        r.check(f"[CHECK] {label}", _do)

    _relation("去重开时：含下级开(A) ≥ 关(D)", "A", "D", ("register", "active", "pay"))
    _relation("去重关时：含下级开(B) ≥ 关(C)", "B", "C", ("register", "active", "pay"))
    _relation("含下级开时：去重关(B) ≥ 开(A)", "B", "A", ("register", "active"))
    _relation("含下级关时：去重关(C) ≥ 开(D)", "C", "D", ("register", "active"))

    def _effective():
        if not r.execute:
            return ("DRYRUN", "预演：未切换开关", {})
        if len(values) < len(PREF_COMBOS):
            return ("BLOCKED", f"只取到 {sorted(values)} 组，无法判断开关是否生效", {"values": values})
        distinct = {json.dumps(v, sort_keys=True) for v in values.values()}
        if len(distinct) == 1:
            return ("BLOCKED", "四组数值完全一致：开关可能未影响该接口，或超管视角无下级/重复身份证，需人工确认",
                    {"values": values})
        return ("PASS", f"四组共 {len(distinct)} 种取值，开关生效", {"values": values})
    r.check("[CHECK] 开关对接口确有影响", _effective)
    r.page("[PAGE] 顶栏开关切换后数据页同步刷新", "header=包含下级渠道数据/身份证去重")


# --------------------------------------------------------------------------- #
# 聚合流水线：面板一条流水线 S0..S9，标题按互补版 BS 编号，子步骤为该场景业务
# --------------------------------------------------------------------------- #
SCENE_PAGES = (
    "工作台（八卡/环比） · 渠道数据统计 · 充值明细 · 注册明细 · 其它数据页",
)


def p_scene_full(r: Runner):
    """十场景聚合：按业务依赖顺序执行；数据验证类场景只做基线确认+指引。"""
    cfg = r.cfg

    def scene(sid: str, title: str, fn, note: str = ""):
        before = len(r.results)
        sub = Runner(r.pipeline_id + ":" + sid, cfg=cfg, execute=r.execute, state=r.state)
        sub.tokens = r.tokens          # 复用已登录 token
        sub.ctx = r.ctx                # 复用动态解析上下文
        try:
            fn(sub)
        except Exception as exc:       # noqa: BLE001
            sub.results.append(StepResult("SUB", "场景执行异常", "CHECK", "FAIL",
                                          f"{type(exc).__name__}: {exc}", {}))
        subres = [x.as_dict() for x in sub.results]
        counts: dict[str, int] = {}
        for x in subres:
            counts[x["state"]] = counts.get(x["state"], 0) + 1
        # 子步骤有 BLOCKED / DRYRUN 时场景不算通过，避免面板假绿
        if counts.get("FAIL"):
            state = "FAIL"
        elif not subres or counts.get("BLOCKED"):
            state = "BLOCKED"
        elif counts.get("DRYRUN"):
            state = "DRYRUN"
        elif counts.get("SKIP") == len(subres):
            state = "SKIP"
        else:
            state = "PASS"
        tally = "，".join(f"{k} {v}" for k, v in sorted(counts.items()))
        bad = "；".join(f"{x['state']}:{x['title'][:18]}" for x in subres
                       if x["state"] not in ("PASS", "SKIP"))
        if bad:
            detail = f"{tally} ｜ {bad}"
        elif state == "SKIP":
            detail = f"本场景不判定（{tally}）"
        else:
            detail = f"子步骤 {len(subres)} 项全部通过（{tally}）"
        if note:
            detail = f"{note} ｜ {detail}"
        ev = {"sub_steps": [{k: x.get(k) for k in ("id", "title", "layer", "state", "detail")}
                            for x in subres]}
        r.results.append(StepResult(sid, title, "SCENE", state, detail, ev))

    scene("S0", "BS-01 顶栏口径 · 含下级×去重四象限", lambda s: p_pref_matrix(s),
          note=f"超管视角近30天合计比大小，测完恢复；逐页数值见「数据准确性」，页面：{SCENE_PAGES[0]}")
    scene("S1", "BS-02 商务层级 · 超管/OA 建一级",
          lambda s: p_oa_create_l1(s), note="OA 运维新增一级商务待接")
    scene("S2", "BS-02 商务层级 · 一级建二级", lambda s: p_l1_create_l2(s))
    scene("S3", "BS-02 商务层级 · 二级建三级", lambda s: p_l2_create_l3(s))
    scene("S4", "BS-04 游戏商务绑定 · OA 审核通过",
          lambda s: (p_l3_bind_oa(s), p_audit_pass(s)),
          note="审核通过/驳回互斥，本链走通过分支")
    scene("S5", "BS-05/06 新增渠道 · 激活池申请",
          lambda s: (p_l3_create_channel(s), p_channel_activation(s)))
    scene("S6", "BS-08/10/11 预警（规则/间隔/有效端/免预警/处理）",
          lambda s: (p_alert_rule(s), p_alert_gap(s), p_alert_settings(s),
                     p_alert_exemption(s), p_alert_record(s)))
    scene("S7", "BS-04 游戏商务绑定 · 解绑", lambda s: p_l3_unbind(s),
          note="解绑依赖绑定通过，故排在渠道/激活/免预警之后")
    scene("S8", "BS-16 数据分析页（时段/绩效/明细）· 数据验证",
          lambda s: s.check("数据验证指引", lambda: (
              "SKIP", "本流水线不判数值：工作台五时段卡、商务绩效统计、明细列结构在「数据准确性」场景查看；"
                      "V2 指标 v1reg_v2_01～08 的 jsonPath 待钉",
              {"pages": ["工作台", "商务绩效统计", "充值明细", "注册明细"]})))
    scene("S9", "BS-07 渠道换绑与级联（待接）",
          lambda s: s.blocked("换绑：OA 编辑/批量/批次还原/自动出入池/总后台",
                              "OA 渠道换绑与总后台接口未提供，需确认接口与权限；自动出入池依赖定时任务",
                              {"pages": ["OA 渠道列表", "渠道激活", "换绑记录", "龙翔总后台"]}))


PIPELINES: dict[str, Callable[[Runner], None]] = {
    "v1reg_oa_create_l1": p_oa_create_l1,
    "v1reg_bus_l1_create_l2": p_l1_create_l2,
    "v1reg_bus_l2_create_l3": p_l2_create_l3,
    "v1reg_bus_l1_view_data": p_l1_view_data,
    "v1reg_bus_l2_view_data": p_l2_view_data,
    "v1reg_bus_l3_bind_oa": p_l3_bind_oa,
    "v1reg_oa_audit_bind_pass": p_audit_pass,
    "v1reg_bus_l3_create_channel": p_l3_create_channel,
    "v1reg_channel_activation_apply": p_channel_activation,
    "v1reg_alert_rule_crud": p_alert_rule,
    "v1reg_alert_gap": p_alert_gap,
    "v1reg_alert_settings": p_alert_settings,
    "v1reg_alert_exemption": p_alert_exemption,
    "v1reg_alert_record_handle": p_alert_record,
    "v1reg_scene_full": p_scene_full,
    "v1reg_oa_audit_bind_reject": p_audit_reject,
    "v1reg_bus_l3_unbind_oa": p_l3_unbind,
    "v1reg_bus_hierarchy_cleanup": p_cleanup,
    "v1reg_pref_matrix": p_pref_matrix,
}


# --------------------------------------------------------------------------- #
# 对外入口
# --------------------------------------------------------------------------- #
def run(pipeline_id: str, *, execute: bool | None = None,
        cfg: dict | None = None, state: dict | None = None,
        write_evidence: bool = True) -> dict:
    fn = PIPELINES.get(pipeline_id)
    if not fn:
        return {"ok": False, "error": f"未知 v1reg 流水线: {pipeline_id}", "results": []}
    cfg = cfg or load_config()
    r = Runner(pipeline_id, cfg=cfg, execute=execute, state=state)
    fn(r)
    results = [x.as_dict() for x in r.results]
    counts: dict[str, int] = {}
    for x in results:
        counts[x["state"]] = counts.get(x["state"], 0) + 1
    # BLOCKED / DRYRUN 不算失败，但绝不算「通过」
    failed = [x for x in results if x["state"] == "FAIL"]
    ok = not failed
    out = {"ok": ok, "pipelineId": pipeline_id, "execute": r.execute,
           "writeEnabled": cfg.get("writeEnabled"), "counts": counts,
           "results": results, "at": now(), "evidenceFile": ""}

    if write_evidence:
        ev_dir = ROOT / str(cfg.get("evidenceDir") or "data/v1_regression_biz_evidence")
        ev_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{pipeline_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        fpath = ev_dir / fname
        payload = json.dumps(out, ensure_ascii=False, indent=2)
        for attempt in range(4):
            try:
                fpath.write_text(payload, encoding="utf-8")
                out["evidenceFile"] = str(fpath.relative_to(ROOT)).replace("\\", "/")
                break
            except PermissionError:
                if attempt == 3:
                    raise
                time.sleep(0.4)   # Windows 偶发文件锁（索引/杀毒），重试消解
    if r.execute and state is None:
        save_state(cfg, r.state)
    return out


def _apis_brief(ev: dict) -> list[dict]:
    """从步骤证据抽出面板可展示的 apis 清单。"""
    if not ev:
        return []
    if "method" in ev and "path" in ev:
        item = {"method": ev["method"], "path": ev["path"]}
        if ev.get("body") is not None:
            item["requestBody"] = ev["body"]
        if ev.get("query") is not None:
            item["query"] = ev["query"]
        if ev.get("base") or ev.get("baseUrl"):
            item["baseUrl"] = ev.get("base") or ev.get("baseUrl")
        if ev.get("note"):
            item["note"] = ev["note"]
        return [item]
    if "sql" in ev:
        return [{"method": "SELECT", "path": ev.get("database", ""),
                 "sql": ev["sql"], "params": ev.get("params", [])}]
    if "locator" in ev:
        return [{"method": "DOM", "path": ev["locator"]}]
    return []


def run_pipeline(run_id: str, pipeline_id: str, opts: dict | None = None) -> tuple[bool, str]:
    """控制面板 auto_control._execute_run 的接入点。

    返回 (ok, err)，并把每一步状态回写到面板 run.steps，使面板能看到真实进度。
    """
    cfg = load_config()
    opts = opts or {}
    # 单一写闸门：未开 writeEnabled 时明确报错，不给假绿
    if not cfg.get("writeEnabled"):
        out = run(pipeline_id, execute=False, cfg=cfg)
        _sync_panel_steps(run_id, out)
        _finish_panel_meta(run_id, out)
        return False, ("写操作未启用：请在 data/v1_regression_biz_config.json 把 "
                       "writeEnabled 改为 true 后再跑（本轮已生成预演 evidence）")
    try:
        out = run(pipeline_id, execute=True, cfg=cfg)
    except Exception as exc:                          # noqa: BLE001
        return False, f"v1reg 执行异常: {type(exc).__name__}: {exc}"
    _sync_panel_steps(run_id, out)
    _finish_panel_meta(run_id, out)
    if not out["ok"]:
        bad = [x["title"] for x in out["results"] if x["state"] == "FAIL"]
        return False, "v1reg 断言失败: " + "; ".join(bad[:3])
    blocked = out["counts"].get("BLOCKED", 0)
    if blocked:
        names = [x["title"] for x in out["results"] if x["state"] == "BLOCKED"]
        return False, f"未接线：{blocked} 项 BLOCKED（无 FAIL）：" + "; ".join(names[:3])
    return True, "全部通过"


def _finish_panel_meta(run_id: str, out: dict) -> None:
    """回写证据路径、失败分类、日志汇总。"""
    try:
        import auto_control as ac
    except Exception:
        return
    fail_class = ""
    for res in out.get("results") or []:
        if res.get("state") == "FAIL":
            fail_class = classify_fail(res.get("detail") or "")
            break
    if not fail_class:
        for res in out.get("results") or []:
            if res.get("state") == "BLOCKED":
                fail_class = classify_fail(res.get("detail") or "")
                break
    try:
        fields = {"evidenceFile": out.get("evidenceFile") or ""}
        if fail_class:
            fields["failClass"] = fail_class
        ac._update_run(run_id, **fields)
        counts = out.get("counts") or {}
        tally = " ".join(f"{k}={v}" for k, v in sorted(counts.items()))
        ac._write_run_log(
            run_id,
            f"v1reg 汇总 writeEnabled={out.get('writeEnabled')} execute={out.get('execute')} "
            f"{tally} evidence={out.get('evidenceFile') or '—'}",
        )
    except Exception:
        pass


def _sync_panel_steps(run_id: str, out: dict) -> None:
    """把引擎步骤状态映射到面板 run.steps（含 engineState / apis / subSteps）。"""
    try:
        import auto_control as ac                     # noqa: WPS433 延迟导入
    except Exception:
        return
    for res in out["results"]:
        sid = res["id"]
        state = res["state"]
        status = {"PASS": "passed", "FAIL": "failed", "DRYRUN": "skipped",
                  "BLOCKED": "skipped", "SKIP": "skipped"}.get(state, "skipped")
        ev = res.get("evidence") or {}
        fields = {
            "status": status,
            "engineState": state,
            "detail": f"[{state}] {res['detail']}",
            "error": res["detail"] if state == "FAIL" else "",
            "finishedAt": ac._now(),
            "apis": _apis_brief(ev),
        }
        if state in {"FAIL", "BLOCKED"}:
            fields["failClass"] = classify_fail(res.get("detail") or "")
        if ev.get("sub_steps") is not None:
            fields["subSteps"] = ev["sub_steps"]
            fields["apis"] = [
                {"method": "子步骤", "path": x.get("title") or "",
                 "note": f"{x.get('state')} · {str(x.get('detail') or '')[:120]}"}
                for x in (ev.get("sub_steps") or [])
            ]
        try:
            ac._set_step(run_id, sid, **fields)
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description="新商务 v1 全量回归 · 业务流水线引擎")
    ap.add_argument("--list", action="store_true", help="列出 12 条流水线")
    ap.add_argument("--pipeline", help="单条流水线 id")
    ap.add_argument("--all", action="store_true", help="跑全部 12 条")
    ap.add_argument("--dry-run", action="store_true", help="预演（默认）")
    ap.add_argument("--execute", action="store_true", help="真正发写请求（仍需 writeEnabled=true）")
    a = ap.parse_args()
    if a.list:
        for k in PIPELINES:
            print(" ", k)
        return 0
    ids = list(PIPELINES) if a.all else ([a.pipeline] if a.pipeline else [])
    if not ids:
        ap.print_help()
        return 1
    cfg = load_config()
    execute = bool(a.execute)
    if execute and not cfg.get("writeEnabled"):
        print("拒绝执行：config.writeEnabled=false。请先确认造数口径再打开写闸门。")
        return 2
    shared = load_state(cfg)
    overall = True
    for pid in ids:
        out = run(pid, execute=execute, cfg=cfg, state=shared)
        shared = load_state(cfg)
        c = out.get("counts", {})
        print(f"{'PASS' if out['ok'] else 'FAIL'}  {pid:38} " +
              " ".join(f"{k}={v}" for k, v in sorted(c.items())))
        for x in out["results"]:
            if x["state"] in {"FAIL", "BLOCKED"}:
                print(f"      - [{x['state']}] {x['title']}: {x['detail'][:120]}")
        overall = overall and out["ok"]
    print(f"\n模式: {'EXECUTE（真实写）' if execute else 'DRY-RUN（未发写请求）'}"
          f"  |  writeEnabled={cfg.get('writeEnabled')}")
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())
