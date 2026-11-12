# -*- coding: utf-8 -*-
"""业务自动化 · 角色台（按角色分框：系统 / 账号 / 对应主流程步骤）。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CATALOG_FILE = DATA_DIR / "biz_role_catalog.json"

SCOPE_FROM_FLOW = {
    "OA·渠道商务": "l1",
    "商务网页": "l1",
    "会长网页": "l1",
    "一级会长": "l1",
    "二级会长": "l2",
    "三级会长": "l3",
    "游戏 SDK": "l1",
    "支付": "l1",
    "游戏 SDK·二级": "l2",
    "支付·二级": "l2",
    "游戏 SDK·三级": "l3",
    "支付·三级": "l3",
}


def _read_json(path: Path, default: Any):
    if not path.is_file():
        return default
    try:
        import json

        data = json.loads(path.read_text(encoding="utf-8"))
        return data if data is not None else default
    except (OSError, json.JSONDecodeError):
        return default


def load_catalog() -> dict:
    raw = _read_json(CATALOG_FILE, {})
    return raw if isinstance(raw, dict) else {}


def _resolve_url(urls: dict, target: str) -> str:
    if not isinstance(urls, dict):
        return ""
    return str(urls.get(target) or urls.get("all") or urls.get("lx") or "")


def _pick_account(accounts: list, target: str) -> dict | None:
    items = [a for a in (accounts or []) if isinstance(a, dict)]
    if not items:
        return None
    for acc in items:
        targets = acc.get("targets")
        if not targets or target in targets or "all" in targets:
            return acc
    return items[0]


def _top_steps(plan: dict | None) -> list[dict]:
    steps = (plan or {}).get("steps") or []
    return [s for s in steps if isinstance(s, dict) and not s.get("parentId")]


def _attach_steps(role: dict, plan_steps: list[dict]) -> list[dict]:
    keys = set(role.get("flowRoleKeys") or [])
    out = []
    for step in plan_steps:
        flow_role = str(step.get("role") or "")
        if flow_role not in keys:
            continue
        out.append({
            "id": step.get("id"),
            "title": step.get("title"),
            "role": flow_role,
            "enabled": step.get("enabled", True),
            "note": step.get("note") or "",
            "scopeId": SCOPE_FROM_FLOW.get(flow_role),
        })
    return out


def _decorate_systems(systems: list, target: str) -> list[dict]:
    out = []
    for raw in systems or []:
        if not isinstance(raw, dict):
            continue
        item = dict(raw)
        urls = item.get("urls") if isinstance(item.get("urls"), dict) else {}
        item["url"] = _resolve_url(urls, target)
        acc = _pick_account(item.get("accounts") or [], target)
        item["account"] = acc
        out.append(item)
    return out


def build_view(target: str | None = None) -> dict:
    catalog = load_catalog()
    targets = catalog.get("targets") or []
    target_ids = [str(t.get("id")) for t in targets if isinstance(t, dict)]
    chosen = target or catalog.get("defaultTarget") or (target_ids[0] if target_ids else "lx")
    if chosen not in target_ids and target_ids:
        chosen = target_ids[0]

    import biz_flow

    plan = biz_flow.get_plan()
    plan_steps = _top_steps(plan)

    roles = []
    for role in catalog.get("roles") or []:
        if not isinstance(role, dict):
            continue
        item = dict(role)
        item["systems"] = _decorate_systems(role.get("systems") or [], chosen)
        item["flowSteps"] = _attach_steps(role, plan_steps)
        roles.append(item)

    return {
        "ok": True,
        "catalog": {
            "id": catalog.get("id"),
            "name": catalog.get("name") or "角色业务台",
            "knowledgeUrl": catalog.get("knowledgeUrl") or "",
            "note": catalog.get("note") or "",
            "defaultTarget": chosen,
        },
        "target": chosen,
        "targets": targets,
        "roles": roles,
        "plan": {
            "id": (plan or {}).get("id"),
            "name": (plan or {}).get("name"),
        },
    }
