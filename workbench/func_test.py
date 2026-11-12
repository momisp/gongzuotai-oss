# -*- coding: utf-8 -*-
"""项目功能测试：从测试点生成同步页面功能用例，并驱动 Playwright 跑测。"""
from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
FUNC_PLANS_FILE = DATA_DIR / "func_plans.json"

# 页面关键词 → 路由（对照新商务实测菜单）
ROUTE_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"忘记密码|找回密码|登录表单|登录界面|^登录$"), "/login"),
    (re.compile(r"渠道数据统计"), "/DataAnalysis/ChannelDataStatistics"),
    (re.compile(r"充值明细"), "/DataAnalysis/RechargeDetails"),
    (re.compile(r"注册明细"), "/DataAnalysis/RegistrationDetails"),
    (re.compile(r"游戏数据"), "/DataAnalysis/GameAnalytics"),
    (re.compile(r"区服分析"), "/DataAnalysis/ServerAnalysis"),
    (re.compile(r"排行榜"), "/DataAnalysis/RankingAnalysis"),
    (re.compile(r"预警规则|AI 预警规则"), "/AlertCenter/AlertRules"),
    (re.compile(r"预警列表|AI 实时预警|处理预警"), "/AlertCenter/AlertList"),
    (re.compile(r"渠道列表"), "/BusMgmt/ChannelList"),
    (re.compile(r"商务列表|绑定列表|添加子商务"), "/BusMgmt/BusinessList"),
    (re.compile(r"工作台|核心指标|今日渠道|包含下级|身份证去重|未登录渠道|充值金额最低"), "/index"),
    (re.compile(r"数据分析"), "/DataAnalysis/ChannelDataStatistics"),
    (re.compile(r"预警中心"), "/AlertCenter/AlertList"),
    (re.compile(r"商务管理"), "/BusMgmt/BusinessList"),
    (re.compile(r"(?<!未)登录"), "/login"),
]


def _load_json(path: Path, fallback: Any) -> Any:
    if not path.is_file():
        return fallback
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except (OSError, json.JSONDecodeError):
        return fallback


def _save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_func_plans() -> list[dict]:
    data = _load_json(FUNC_PLANS_FILE, [])
    return data if isinstance(data, list) else []


def save_func_plans(plans: list[dict]) -> None:
    _save_json(FUNC_PLANS_FILE, plans)


def plan_for_project(project_id: str) -> dict | None:
    return next(
        (
            item
            for item in load_func_plans()
            if str(item.get("projectId") or "") == str(project_id) and item.get("enabled", True)
        ),
        None,
    )


def resolve_route(module: str, title: str) -> str:
    blob = f"{module} {title}"
    for pat, route in ROUTE_HINTS:
        if pat.search(blob):
            return route
    return "/index"


def parse_func_cases_from_markdown(
    md: str,
    *,
    source_title: str = "",
    max_cases: int = 80,
    max_hints: int = 80,
) -> list[dict]:
    """把页面功能测试点 markdown 解析为用例。

    - `###` 小节 → 一条用例（标题=小节名，模块=最近的 `##`）
    - `##` 下若直接挂列表（无 `###`），也生成一条用例（标题=模块名）
      例：「## 登录界面」下的空校验 / 记住账号等不会再被漏掉
    """
    text = str(md or "").replace("\r\n", "\n")
    if not text.strip():
        return []
    cases: list[dict] = []
    module = "未分类"
    title = ""
    bullets: list[str] = []
    hint_cap = max(1, int(max_hints or 80))

    def flush() -> None:
        nonlocal title, bullets
        if not title:
            bullets = []
            return
        clean = [b for b in bullets if b]
        # ## 仅作分组、下面立刻跟 ### 时，不要生成空用例
        if not clean:
            title = ""
            bullets = []
            return
        idx = len(cases) + 1
        cid = f"F{idx:02d}"
        cases.append(
            {
                "id": cid,
                "module": module,
                "title": title,
                "enabled": True,
                "route": resolve_route(module, title),
                "hints": clean[:hint_cap],
                "source": source_title,
                "note": "",
            }
        )
        title = ""
        bullets = []

    for raw in text.split("\n"):
        line = raw.rstrip()
        if re.match(r"^##\s+[^#]", line):
            flush()
            module = line.lstrip("#").strip() or module
            # 允许 ## 直挂列表：先挂上同名标题，有 bullet 才会 flush 成用例
            title = module
            continue
        if re.match(r"^###\s+", line):
            flush()
            title = line.lstrip("#").strip()
            continue
        if title and re.match(r"^\s*[-*]\s+", line):
            bullet = re.sub(r"^\s*[-*]\s+", "", line).strip()
            if bullet:
                bullets.append(bullet[:200])
            continue
    flush()
    return cases[:max_cases]


def pick_test_point_record(project_id: str, load_state: Callable[[], dict]) -> dict | None:
    """同步「该项目最新保存」的测试点（优先有页面功能 markdown 的记录）。"""
    records = [
        item
        for item in (load_state().get("records") or [])
        if isinstance(item, dict) and str(item.get("projectId") or "") == str(project_id)
    ]
    if not records:
        return None

    with_md = [item for item in records if str(item.get("markdown") or "").strip()]
    pool = with_md or records

    def score(item: dict) -> str:
        # 最新优先：updatedAt > createdAt
        return str(item.get("updatedAt") or item.get("createdAt") or "")

    return max(pool, key=score)


def ensure_plan_shell(project_id: str, project_name: str = "", smoke_plan: dict | None = None) -> dict:
    plans = load_func_plans()
    existing = next((p for p in plans if str(p.get("projectId") or "") == str(project_id)), None)
    smoke_plan = smoke_plan or {}
    base = {
        "id": f"func_{project_id}",
        "projectId": project_id,
        "projectName": project_name or smoke_plan.get("projectName") or project_id,
        "name": f"{project_name or smoke_plan.get('projectName') or '项目'} · 功能测试",
        "reportTitle": f"功能测试报告 — {project_name or smoke_plan.get('projectName') or '业务后台'}",
        "moduleId": f"pw_func_{project_id}",
        "specPath": "integrated/agile-sim-demo/tests/business-automation/xinshangwu_func.spec.ts",
        "prototypeUrl": smoke_plan.get("prototypeUrl") or "",
        "baseUrl": smoke_plan.get("baseUrl") or "",
        "accounts": smoke_plan.get("accounts") if isinstance(smoke_plan.get("accounts"), dict) else {},
        "defaultHeaded": True,
        "enabled": True,
        "cases": [],
        "syncedAt": "",
        "sourceRecordId": "",
        "sourceTitle": "",
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
    }
    if existing:
        for key, value in base.items():
            if key in {"cases", "syncedAt", "sourceRecordId", "sourceTitle"}:
                continue
            if key == "accounts" and existing.get("accounts"):
                continue
            if key in {"prototypeUrl", "baseUrl"} and existing.get(key):
                continue
            if not existing.get(key):
                existing[key] = value
        plan = existing
    else:
        plans.append(base)
        plan = base
    save_func_plans(plans)
    return plan


def sync_from_test_points(
    project_id: str,
    *,
    project_name: str = "",
    smoke_plan: dict | None = None,
    load_state: Callable[[], dict],
) -> dict:
    plan = ensure_plan_shell(project_id, project_name=project_name, smoke_plan=smoke_plan)
    record = pick_test_point_record(project_id, load_state)
    if not record:
        return {"ok": False, "error": "该项目尚无测试点生成记录", "plan": plan}
    md = str(record.get("markdown") or "").strip()
    if not md:
        # 回退 framework / businessScenarios 不够「页面功能」；仍尝试 framework
        md = str(record.get("framework") or "").strip()
    if not md:
        return {"ok": False, "error": "测试点记录没有页面功能 markdown", "plan": plan}

    cases = parse_func_cases_from_markdown(md, source_title=str(record.get("title") or ""))
    if not cases:
        return {"ok": False, "error": "未能从测试点解析出功能用例（需要 ## 直挂列表或 ### 小节）", "plan": plan}

    plans = load_func_plans()
    for item in plans:
        if str(item.get("projectId") or "") != str(project_id):
            continue
        item["cases"] = cases
        item["syncedAt"] = datetime.now().isoformat(timespec="seconds")
        item["sourceRecordId"] = str(record.get("id") or "")
        item["sourceTitle"] = str(record.get("title") or "")
        item["updatedAt"] = item["syncedAt"]
        if smoke_plan:
            if smoke_plan.get("baseUrl"):
                item["baseUrl"] = smoke_plan.get("baseUrl")
            if smoke_plan.get("prototypeUrl"):
                item["prototypeUrl"] = smoke_plan.get("prototypeUrl")
            if isinstance(smoke_plan.get("accounts"), dict) and not item.get("accounts"):
                item["accounts"] = smoke_plan.get("accounts")
        plan = item
        break
    save_func_plans(plans)
    return {
        "ok": True,
        "plan": plan,
        "caseCount": len(cases),
        "sourceTitle": plan.get("sourceTitle"),
        "sourceRecordId": plan.get("sourceRecordId"),
    }


def write_cases_file(plan: dict, run_dir: Path | None = None) -> Path:
    """把完整用例（含全部 hints）写到文件，避免 Windows 环境变量长度限制。"""
    target_dir = Path(run_dir) if run_dir else DATA_DIR / "func_runtime"
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / "func_cases.json"
    payload = {
        "projectId": plan.get("projectId") or "",
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "cases": plan.get("cases") or [],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def env_from_plan(plan: dict, *, run_dir: Path | None = None) -> dict:
    accounts = plan.get("accounts") if isinstance(plan.get("accounts"), dict) else {}
    admin = accounts.get("admin") if isinstance(accounts.get("admin"), dict) else {}
    l1 = accounts.get("l1") if isinstance(accounts.get("l1"), dict) else {}
    cases_path = write_cases_file(plan, run_dir=run_dir)
    # 仍附带精简 JSON（仅 id/title/route）作兜底；完整 hints 走文件
    slim = [
        {
            "id": c.get("id"),
            "module": c.get("module"),
            "title": c.get("title"),
            "route": c.get("route"),
            "enabled": c.get("enabled", True),
        }
        for c in (plan.get("cases") or [])
        if isinstance(c, dict)
    ]
    return {
        "SMOKE_BASE_URL": plan.get("baseUrl") or "",
        "PLAYWRIGHT_BASE_URL": plan.get("baseUrl") or "",
        "SMOKE_ADMIN_USER": admin.get("username") or "admin",
        "SMOKE_ADMIN_PASS": admin.get("password") or "admin123",
        "SMOKE_L1_USER": l1.get("username") or "",
        "SMOKE_L1_PASS": l1.get("password") or "111111",
        "FUNC_CASES_FILE": str(cases_path.resolve()),
        "FUNC_CASES_JSON": json.dumps(slim, ensure_ascii=False),
    }


def ensure_module(plan: dict, *, load_modules: Callable, save_modules: Callable) -> dict:
    modules = load_modules()
    if not isinstance(modules, list):
        modules = []
    module_id = str(plan.get("moduleId") or f"pw_func_{plan.get('projectId')}")
    existing = next((item for item in modules if item.get("id") == module_id), None)
    module = {
        "id": module_id,
        "name": plan.get("name") or f"{plan.get('projectName') or '项目'} · 功能测试",
        "businessLine": "biz-web",
        "engine": "playwright",
        "kind": "func",
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
    save_modules(modules)
    return module


def seed_cases(plan: dict, selected_ids: list[str] | None = None) -> list[dict]:
    raw = [c for c in (plan.get("cases") or []) if isinstance(c, dict) and c.get("enabled", True)]
    if selected_ids:
        want = {str(x) for x in selected_ids}
        raw = [c for c in raw if str(c.get("id") or "") in want]
    out = []
    for item in raw:
        out.append(
            {
                "id": str(item.get("id") or ""),
                "title": f"{item.get('module') or ''} · {item.get('title') or item.get('id')}",
                "module": item.get("module") or "",
                "role": "功能",
                "route": item.get("route") or "",
                "hints": item.get("hints") or [],
                "status": "pending",
                "screenshot": "",
                "error": "",
                "note": "",
            }
        )
    return out
