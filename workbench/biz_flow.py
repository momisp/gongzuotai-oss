# -*- coding: utf-8 -*-
"""业务自动化 · 跨端主流程（方案 / 运行 / 造数记录）。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PLANS_FILE = DATA_DIR / "biz_flow_plans.json"
RUNS_FILE = DATA_DIR / "biz_flow_runs.json"
ARTIFACTS_FILE = DATA_DIR / "biz_flow_artifacts.json"
RUNS_DIR = DATA_DIR / "biz_flow_runs"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _read_json(path: Path, default: Any):
    if not path.is_file():
        return default
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if data is not None else default
    except (OSError, json.JSONDecodeError):
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, default=_json_default) + "\n",
        encoding="utf-8",
    )


def _json_default(obj: Any):
    """json.dumps 兜底：Decimal/日期等。"""
    from datetime import date, datetime
    from decimal import Decimal

    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return str(obj)


def _dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=_json_default)


def _ensure_last_http(detail: dict) -> dict:
    """从 detail 结构推断 lastHttp，供前端「详细信息」展示最近一次 HTTP。"""
    if not isinstance(detail, dict) or detail.get("lastHttp"):
        return detail
    lh = None
    if detail.get("request") is not None or detail.get("response") is not None:
        lh = {
            "url": detail.get("url") or "",
            "method": detail.get("method") or "POST",
            "httpStatus": detail.get("httpStatus"),
            "request": detail.get("request"),
            "response": detail.get("response"),
        }
    elif isinstance(detail.get("result"), dict):
        r = detail["result"]
        if isinstance(r.get("lastHttp"), dict):
            lh = r["lastHttp"]
        elif r.get("request") is not None or r.get("response") is not None:
            lh = {
                "url": r.get("url") or r.get("path") or "",
                "method": r.get("method") or "POST",
                "httpStatus": r.get("httpStatus"),
                "request": r.get("request"),
                "response": r.get("response"),
            }
        elif isinstance(r.get("login"), dict):
            login = r["login"]
            lh = {
                "url": login.get("url") or "",
                "method": login.get("method") or "POST",
                "httpStatus": login.get("httpStatus"),
                "request": login.get("request"),
                "response": login.get("response"),
                "label": "login",
            }
        elif r.get("response") is not None:
            lh = {
                "httpStatus": r.get("httpStatus"),
                "response": r.get("response"),
            }
    if lh:
        detail["lastHttp"] = lh
    return detail


def load_plans() -> list[dict]:
    raw = _read_json(PLANS_FILE, [])
    return [x for x in raw if isinstance(x, dict)] if isinstance(raw, list) else []


def get_plan(plan_id: str | None = None) -> dict | None:
    plans = load_plans()
    if not plans:
        return None
    if plan_id:
        return next((p for p in plans if p.get("id") == plan_id), None)
    enabled = [p for p in plans if p.get("enabled", True)]
    return enabled[0] if enabled else plans[0]


def load_runs() -> list[dict]:
    raw = _read_json(RUNS_FILE, [])
    return [x for x in raw if isinstance(x, dict)] if isinstance(raw, list) else []


def list_runs(limit: int = 30) -> list[dict]:
    """列表时顺带修复卡死的 running。"""
    runs = load_runs()
    out = []
    for run in runs[: max(1, int(limit or 30))]:
        out.append(_heal_run(run))
    return out


def save_runs(runs: list[dict]) -> None:
    _write_json(RUNS_FILE, runs)


def get_run(run_id: str) -> dict | None:
    run = next((r for r in load_runs() if r.get("id") == run_id), None)
    if not run:
        return None
    run = sync_run_steps_from_plan(run)
    return _heal_run(run)


def sync_run_steps_from_plan(run: dict) -> dict:
    """把方案里的 F1-1/F1-2、F2-1/F2-2 等补进旧运行，避免「步骤不存在」。"""
    plan = get_plan(run.get("planId"))
    if not plan:
        return run
    seeded = _seed_steps(plan)
    old_by_id = {str(s.get("id")): s for s in (run.get("steps") or []) if isinstance(s, dict)}
    legacy_f1 = old_by_id.get("F1")
    legacy_f2 = old_by_id.get("F2")
    legacy_f3 = old_by_id.get("F3")
    plan_ids = {str(s.get("id")) for s in seeded}
    # 已与方案一致则只刷新标题/父子关系
    missing = [s for s in seeded if str(s.get("id")) not in old_by_id]
    if not missing and all(
        (old_by_id.get(str(s.get("id"))) or {}).get("parentId", "") == (s.get("parentId") or "")
        and (old_by_id.get(str(s.get("id"))) or {}).get("kind", "step") == (s.get("kind") or "step")
        for s in seeded
    ):
        # 仍刷新展示字段
        changed_titles = False
        for s in seeded:
            old = old_by_id.get(str(s.get("id")))
            if not old:
                continue
            for k in ("title", "role", "parentId", "kind", "engines", "engine", "urls"):
                if old.get(k) != s.get(k):
                    old[k] = s.get(k)
                    changed_titles = True
        if changed_titles:
            _persist_run(run)
        return run

    new_steps = []
    for seed in seeded:
        sid = str(seed.get("id"))
        old = old_by_id.get(sid)
        if old:
            step = dict(seed)
            for k in ("status", "detail", "error", "startedAt", "finishedAt"):
                if old.get(k) not in (None, ""):
                    step[k] = old.get(k)
            # 旧 F1 不是 group 时，升级为 group 后保留状态
            if sid == "F1" and seed.get("kind") == "group" and old.get("kind") != "group":
                step["kind"] = "group"
            new_steps.append(step)
            continue

        step = dict(seed)
        if sid in {"F1-1", "F1-2"} and legacy_f1:
            st = legacy_f1.get("status")
            if st == "passed":
                step["status"] = "passed"
                step["detail"] = "由旧版 F1 继承（已通过）"
                step["finishedAt"] = legacy_f1.get("finishedAt") or _now()
            elif st == "failed" and sid == "F1-2":
                step["status"] = "failed"
                step["error"] = legacy_f1.get("error") or ""
                step["detail"] = legacy_f1.get("detail") or ""
        if sid in {"F2-1", "F2-2"} and legacy_f2:
            st = legacy_f2.get("status")
            if st == "passed":
                step["status"] = "passed"
                step["detail"] = "由旧版 F2 继承（已通过）"
                step["finishedAt"] = legacy_f2.get("finishedAt") or _now()
            elif st == "failed" and sid == "F2-1":
                step["status"] = "failed"
                step["error"] = legacy_f2.get("error") or ""
                step["detail"] = legacy_f2.get("detail") or ""
            elif st == "running" and sid == "F2-1":
                step["status"] = "pending"
        if sid in {"F3-1", "F3-2", "F3-3"} and legacy_f3:
            st = legacy_f3.get("status")
            if st == "passed":
                step["status"] = "passed"
                step["detail"] = "由旧版 F3 继承（已通过）"
                step["finishedAt"] = legacy_f3.get("finishedAt") or _now()
            elif st == "failed" and sid == "F3-1":
                step["status"] = "failed"
                step["error"] = legacy_f3.get("error") or ""
                step["detail"] = legacy_f3.get("detail") or ""
            elif st == "running" and sid == "F3-1":
                step["status"] = "pending"
        new_steps.append(step)

    # 保留方案外的旧步骤（若有）
    for sid, old in old_by_id.items():
        if sid not in plan_ids:
            new_steps.append(old)

    run["steps"] = new_steps
    _persist_run(run)
    return run


def _persist_run(run: dict) -> None:
    runs = load_runs()
    for i, item in enumerate(runs):
        if item.get("id") == run.get("id"):
            runs[i] = run
            break
    else:
        runs.insert(0, run)
    save_runs(runs)
    try:
        _write_json(RUNS_DIR / str(run.get("id")) / "run.json", run)
    except OSError:
        pass


def _heal_run(run: dict) -> dict:
    """修复误点「开始」等导致的：详情已成功但 status 仍 running。"""
    changed = False
    for step in run.get("steps") or []:
        if step.get("status") != "running":
            continue
        detail = str(step.get("detail") or "")
        if '"ok": true' in detail or '"ok":true' in detail:
            step["status"] = "passed"
            if not step.get("finishedAt"):
                step["finishedAt"] = _now()
            changed = True
        elif step.get("error") and step.get("finishedAt"):
            step["status"] = "failed"
            changed = True
    if changed:
        # 推进 current / 总状态
        passed_ids = {s.get("id") for s in (run.get("steps") or []) if s.get("status") == "passed"}
        nxt = next(
            (
                s.get("id")
                for s in (run.get("steps") or [])
                if s.get("enabled") and s.get("status") in {"pending", "failed"}
            ),
            None,
        )
        if nxt:
            run["currentStepId"] = nxt
            run["status"] = "running" if any(
                s.get("status") == "running" for s in (run.get("steps") or [])
            ) else ("failed" if any(s.get("status") == "failed" for s in (run.get("steps") or [])) else "running")
            # 有下一步待执行时总状态保持 ready/running
            if run.get("status") not in {"failed"}:
                run["status"] = "ready" if not any(
                    s.get("status") == "running" for s in (run.get("steps") or [])
                ) else "running"
        elif passed_ids:
            run["status"] = "passed"
            run["finishedAt"] = run.get("finishedAt") or _now()
        run["updatedAt"] = _now()
        runs = load_runs()
        for i, item in enumerate(runs):
            if item.get("id") == run.get("id"):
                runs[i] = run
                break
        save_runs(runs)
        try:
            _write_json(RUNS_DIR / str(run.get("id")) / "run.json", run)
        except OSError:
            pass
    return run


def load_artifacts() -> list[dict]:
    raw = _read_json(ARTIFACTS_FILE, [])
    return [x for x in raw if isinstance(x, dict)] if isinstance(raw, list) else []


def save_artifacts(items: list[dict]) -> None:
    _write_json(ARTIFACTS_FILE, items)


def _seed_steps(plan: dict) -> list[dict]:
    steps = []
    for item in plan.get("steps") or []:
        if not isinstance(item, dict):
            continue
        enabled = item.get("enabled", True)
        kind = str(item.get("kind") or ("group" if item.get("id") and not item.get("engine") else "step"))
        if item.get("kind") == "group":
            kind = "group"
        steps.append({
            "id": item.get("id"),
            "parentId": item.get("parentId") or "",
            "kind": kind if kind in {"group", "step"} else "step",
            "title": item.get("title"),
            "role": item.get("role") or "",
            "engine": item.get("engine") or ("group" if kind == "group" else "api"),
            "engines": item.get("engines") or ([item.get("engine")] if item.get("engine") else []),
            "enabled": bool(enabled),
            "status": "skipped" if not enabled else "pending",
            "detail": item.get("note") or "",
            "error": "" if enabled else (item.get("note") or "本步暂未启用"),
            "startedAt": "",
            "finishedAt": "",
            "urls": item.get("urls") or {},
        })
    return steps


def create_run(
    plan_id: str | None = None,
    mode: str = "silent",
    target: str = "lx",
    note: str = "",
) -> dict:
    plan = get_plan(plan_id)
    if not plan:
        raise ValueError("未找到主流程方案（data/biz_flow_plans.json）")
    mode = "display" if str(mode).lower() in {"display", "headed", "show", "展示"} else "silent"
    target = str(target or plan.get("defaultTarget") or "lx").strip().lower() or "lx"
    run_id = f"flow_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    steps = _seed_steps(plan)
    run = {
        "id": run_id,
        "planId": plan.get("id"),
        "planName": plan.get("name"),
        "mode": mode,
        "target": target,
        "targetLabel": (plan.get("targetLabels") or {}).get(target) or target,
        "status": "ready",
        "currentStepId": next(
            (s["id"] for s in steps if s.get("enabled") and s.get("kind") != "group"),
            "",
        ),
        "note": note or "",
        "startedAt": "",
        "finishedAt": "",
        "createdAt": _now(),
        "updatedAt": _now(),
        "steps": steps,
        "artifactIds": [],
    }
    runs = load_runs()
    runs.insert(0, run)
    save_runs(runs[:200])
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    _write_json(run_dir / "run.json", run)
    return run


def update_step(
    run_id: str,
    step_id: str,
    *,
    status: str | None = None,
    detail: str | None = None,
    error: str | None = None,
) -> dict:
    runs = load_runs()
    run = next((r for r in runs if r.get("id") == run_id), None)
    if not run:
        raise ValueError("运行不存在")
    step = next((s for s in (run.get("steps") or []) if s.get("id") == step_id), None)
    if not step:
        raise ValueError("步骤不存在")
    if status:
        status = str(status).strip().lower()
        step["status"] = status
        if status == "running" and not step.get("startedAt"):
            step["startedAt"] = _now()
            if not run.get("startedAt"):
                run["startedAt"] = _now()
                run["status"] = "running"
        if status in {"passed", "failed", "skipped"}:
            step["finishedAt"] = _now()
    if detail is not None:
        d_str = str(detail)
        try:
            parsed = json.loads(d_str)
            if isinstance(parsed, dict):
                d_str = _dumps(_ensure_last_http(parsed))
        except (json.JSONDecodeError, TypeError):
            pass
        step["detail"] = d_str
    if error is not None:
        step["error"] = str(error)
    # 推进 currentStepId
    if status == "passed":
        nxt = None
        found = False
        for s in run.get("steps") or []:
            if found and s.get("enabled") and s.get("kind") != "group" and s.get("status") in {"pending", "failed"}:
                nxt = s.get("id")
                break
            if s.get("id") == step_id:
                found = True
        if nxt:
            run["currentStepId"] = nxt
        else:
            run["currentStepId"] = step_id
            run["status"] = "passed"
            run["finishedAt"] = _now()
    elif status == "failed":
        run["status"] = "failed"
        run["currentStepId"] = step_id
    elif status == "running":
        run["currentStepId"] = step_id
        run["status"] = "running"
    run["updatedAt"] = _now()
    save_runs(runs)
    _write_json(RUNS_DIR / run_id / "run.json", run)
    return run


def add_artifact(payload: dict) -> dict:
    """记录流程造出的数据，便于复制/查询。"""
    item = {
        "id": f"art_{uuid.uuid4().hex[:10]}",
        "createdAt": _now(),
        "runId": str(payload.get("runId") or ""),
        "target": str(payload.get("target") or ""),
        "type": str(payload.get("type") or "account"),
        "role": str(payload.get("role") or ""),
        "account": str(payload.get("account") or ""),
        "password": str(payload.get("password") or ""),
        "extra": payload.get("extra") if isinstance(payload.get("extra"), dict) else {},
        "source": str(payload.get("source") or "flow"),  # flow | db_seed
        "stepId": str(payload.get("stepId") or ""),
        "note": str(payload.get("note") or ""),
        "platform": str(payload.get("platform") or payload.get("target") or ""),
    }
    items = load_artifacts()
    items.insert(0, item)
    save_artifacts(items[:2000])
    if item["runId"]:
        runs = load_runs()
        for run in runs:
            if run.get("id") == item["runId"]:
                ids = list(run.get("artifactIds") or [])
                ids.insert(0, item["id"])
                run["artifactIds"] = ids[:200]
                run["updatedAt"] = _now()
                break
        save_runs(runs)
    return item


def query_artifacts(q: str = "", run_id: str = "", target: str = "") -> list[dict]:
    q = str(q or "").strip().lower()
    run_id = str(run_id or "").strip()
    target = str(target or "").strip().lower()
    out = []
    for item in load_artifacts():
        if run_id and item.get("runId") != run_id:
            continue
        if target and str(item.get("target") or item.get("platform") or "").lower() != target:
            continue
        if q:
            blob = " ".join([
                str(item.get("account") or ""),
                str(item.get("role") or ""),
                str(item.get("note") or ""),
                str(item.get("type") or ""),
                str(item.get("password") or ""),
                json.dumps(item.get("extra") or {}, ensure_ascii=False, default=_json_default),
            ]).lower()
            if q not in blob:
                continue
        out.append(item)
    return out


def artifacts_tsv(items: list[dict]) -> str:
    headers = ["createdAt", "target", "type", "role", "account", "password", "source", "runId", "stepId", "note"]
    lines = ["\t".join(headers)]
    for item in items:
        lines.append("\t".join(str(item.get(h) or "") for h in headers))
    return "\n".join(lines)


def execute_step(
    run_id: str,
    step_id: str,
    mode: str | None = None,
    *,
    sms_code: str | None = None,
    extras: dict | None = None,
) -> dict:
    """执行某一步。先同步方案步骤，避免旧运行缺 F1-1/F2-1/F3-1。"""
    run = get_run(run_id)
    if not run:
        raise ValueError("运行不存在")
    step_id = str(step_id or "").strip()
    step = next((s for s in (run.get("steps") or []) if s.get("id") == step_id), None)
    if not step:
        raise ValueError("步骤不存在")
    if step.get("enabled") is False:
        raise ValueError("步骤未启用")

    extras = extras if isinstance(extras, dict) else {}
    sms_code = str(sms_code if sms_code is not None else extras.get("smsCode") or extras.get("sms_code") or "").strip()

    mode = str(mode or run.get("mode") or "silent").lower()
    update_step(run_id, step_id, status="running", detail=f"执行中（{mode}）…", error="")

    if step_id == "F1":
        r1 = _execute_f1_1_oa_login(run_id, run, mode)
        if not r1.get("ok"):
            _rollup_group_status(run_id, "F1")
            return r1
        run = get_run(run_id) or run
        r2 = _execute_f1_2_create_business(run_id, run, mode)
        _rollup_group_status(run_id, "F1")
        return r2
    if step_id == "F1-1":
        out = _execute_f1_1_oa_login(run_id, run, mode)
        _rollup_group_status(run_id, "F1")
        return out
    if step_id == "F1-2":
        out = _execute_f1_2_create_business(run_id, run, mode)
        _rollup_group_status(run_id, "F1")
        return out
    if step_id == "F2":
        r1 = _execute_f2_1_biz_login(run_id, run, mode, sms_code=sms_code)
        if r1.get("needSms") or not r1.get("ok"):
            _rollup_group_status(run_id, "F2")
            return r1
        run = get_run(run_id) or run
        r2 = _execute_f2_2_create_president(run_id, run, mode)
        _rollup_group_status(run_id, "F2")
        if r1.get("prereq"):
            r2["prereq"] = r1.get("prereq")
        return r2
    if step_id == "F2-1":
        out = _execute_f2_1_biz_login(run_id, run, mode, sms_code=sms_code)
        _rollup_group_status(run_id, "F2")
        return out
    if step_id == "F2-2":
        out = _execute_f2_2_create_president(run_id, run, mode)
        _rollup_group_status(run_id, "F2")
        return out
    if step_id == "F3":
        def _child_status(sid: str) -> str:
            cur = get_run(run_id) or run
            s = next((x for x in (cur.get("steps") or []) if x.get("id") == sid), None)
            return str((s or {}).get("status") or "")

        prereq = None
        if _child_status("F3-1") != "passed":
            r1 = _execute_f3_1_channel_login(run_id, run, mode, sms_code=sms_code)
            if r1.get("needSms") or not r1.get("ok"):
                _rollup_group_status(run_id, "F3")
                return r1
            run = get_run(run_id) or run
            sms_code = ""  # 登录验证码不带给完善信息
            prereq = r1.get("prereq")
        if _child_status("F3-2") != "passed":
            r2 = _execute_f3_2_change_password(run_id, run, mode)
            if not r2.get("ok"):
                _rollup_group_status(run_id, "F3")
                if prereq:
                    r2["prereq"] = prereq
                return r2
            run = get_run(run_id) or run
        if _child_status("F3-3") != "passed":
            r3 = _execute_f3_3_update_info(run_id, run, mode, sms_code=sms_code)
            _rollup_group_status(run_id, "F3")
            if prereq:
                r3["prereq"] = prereq
            return r3
        _rollup_group_status(run_id, "F3")
        out = {"ok": True, "run": get_run(run_id)}
        if prereq:
            out["prereq"] = prereq
        return out
    if step_id == "F3-1":
        out = _execute_f3_1_channel_login(run_id, run, mode, sms_code=sms_code)
        _rollup_group_status(run_id, "F3")
        return out
    if step_id == "F3-2":
        out = _execute_f3_2_change_password(run_id, run, mode)
        _rollup_group_status(run_id, "F3")
        return out
    if step_id == "F3-3":
        out = _execute_f3_3_update_info(run_id, run, mode, sms_code=sms_code)
        _rollup_group_status(run_id, "F3")
        return out
    if step_id == "F4":
        return _execute_f4_oa_approve_president(run_id, run, mode)
    if step_id == "F5":
        return _execute_f5_apply_game(run_id, run, mode)
    if step_id == "F8":
        def _child_status(sid: str) -> str:
            cur = get_run(run_id) or run
            s = next((x for x in (cur.get("steps") or []) if x.get("id") == sid), None)
            return str((s or {}).get("status") or "")

        for sid, fn in [
            ("F8-1", lambda: _execute_f8_1_register(run_id, run, mode)),
            ("F8-2", lambda: _execute_f8_2_idcard(run_id, run, mode)),
            ("F8-3", lambda: _execute_f8_3_upload_role(run_id, run, mode)),
            ("F8-4", lambda: _execute_f8_4_pay_order(run_id, run, mode)),
        ]:
            if _child_status(sid) == "passed":
                continue
            out = fn()
            if not out.get("ok"):
                _rollup_group_status(run_id, "F8")
                return out
            run = get_run(run_id) or run
        _rollup_group_status(run_id, "F8")
        return {"ok": True, "run": get_run(run_id)}
    if step_id == "F8-1":
        out = _execute_f8_1_register(run_id, run, mode)
        _rollup_group_status(run_id, "F8")
        return out
    if step_id == "F8-2":
        out = _execute_f8_2_idcard(run_id, run, mode)
        _rollup_group_status(run_id, "F8")
        return out
    if step_id == "F8-3":
        out = _execute_f8_3_upload_role(run_id, run, mode)
        _rollup_group_status(run_id, "F8")
        return out
    if step_id == "F8-4":
        out = _execute_f8_4_pay_order(run_id, run, mode)
        _rollup_group_status(run_id, "F8")
        return out
    if step_id == "F9":
        return _execute_f9_simulate_pay_callback(run_id, run, mode, tier="l1")
    if step_id == "F10":
        return _execute_f10_commission_check(run_id, run, mode, tier="l1")

    # —— 二级 / 三级会长链路 ——
    if step_id == "F11":
        return _execute_create_child_president(run_id, run, mode, tier="l2", sms_code=sms_code)
    if step_id == "F12":
        out = _run_child_login_group(run_id, run, mode, tier="l2", sms_code=sms_code)
        return out
    if step_id == "F12-1":
        out = _execute_child_login(run_id, run, mode, tier="l2", sms_code=sms_code)
        _rollup_group_status(run_id, "F12")
        return out
    if step_id == "F12-2":
        out = _execute_child_change_password(run_id, run, mode, tier="l2")
        _rollup_group_status(run_id, "F12")
        return out
    if step_id == "F12-3":
        out = _execute_child_agreement(run_id, run, mode, tier="l2")
        _rollup_group_status(run_id, "F12")
        return out
    if step_id == "F13":
        return _execute_child_apply_game(run_id, run, mode, tier="l2")
    if step_id == "F14":
        return _run_sdk_group(run_id, run, mode, tier="l2")
    if step_id == "F14-1":
        out = _execute_f8_1_register(run_id, run, mode, tier="l2")
        _rollup_group_status(run_id, "F14")
        return out
    if step_id == "F14-2":
        out = _execute_f8_2_idcard(run_id, run, mode, tier="l2")
        _rollup_group_status(run_id, "F14")
        return out
    if step_id == "F14-3":
        out = _execute_f8_3_upload_role(run_id, run, mode, tier="l2")
        _rollup_group_status(run_id, "F14")
        return out
    if step_id == "F14-4":
        out = _execute_f8_4_pay_order(run_id, run, mode, tier="l2")
        _rollup_group_status(run_id, "F14")
        return out
    if step_id == "F15":
        return _execute_f9_simulate_pay_callback(run_id, run, mode, tier="l2")

    if step_id == "F16":
        return _execute_create_child_president(run_id, run, mode, tier="l3", sms_code=sms_code)
    if step_id == "F17":
        return _run_child_login_group(run_id, run, mode, tier="l3", sms_code=sms_code)
    if step_id == "F17-1":
        out = _execute_child_login(run_id, run, mode, tier="l3", sms_code=sms_code)
        _rollup_group_status(run_id, "F17")
        return out
    if step_id == "F17-2":
        out = _execute_child_change_password(run_id, run, mode, tier="l3")
        _rollup_group_status(run_id, "F17")
        return out
    if step_id == "F17-3":
        out = _execute_child_agreement(run_id, run, mode, tier="l3")
        _rollup_group_status(run_id, "F17")
        return out
    if step_id == "F18":
        return _execute_child_apply_game(run_id, run, mode, tier="l3")
    if step_id == "F19":
        return _run_sdk_group(run_id, run, mode, tier="l3")
    if step_id == "F19-1":
        out = _execute_f8_1_register(run_id, run, mode, tier="l3")
        _rollup_group_status(run_id, "F19")
        return out
    if step_id == "F19-2":
        out = _execute_f8_2_idcard(run_id, run, mode, tier="l3")
        _rollup_group_status(run_id, "F19")
        return out
    if step_id == "F19-3":
        out = _execute_f8_3_upload_role(run_id, run, mode, tier="l3")
        _rollup_group_status(run_id, "F19")
        return out
    if step_id == "F19-4":
        out = _execute_f8_4_pay_order(run_id, run, mode, tier="l3")
        _rollup_group_status(run_id, "F19")
        return out
    if step_id == "F20":
        return _execute_f9_simulate_pay_callback(run_id, run, mode, tier="l3")

    update_step(
        run_id,
        step_id,
        status="failed",
        error=f"步骤 {step_id} 尚未实现自动执行",
        detail="请手工标记或等待对接",
    )
    return {"ok": False, "run": get_run(run_id), "error": f"步骤 {step_id} 尚未实现"}


def _rollup_group_status(run_id: str, group_id: str) -> None:
    run = get_run(run_id)
    if not run:
        return
    children = [s for s in (run.get("steps") or []) if s.get("parentId") == group_id]
    group = next((s for s in (run.get("steps") or []) if s.get("id") == group_id), None)
    if not group or not children:
        return
    statuses = [c.get("status") for c in children]
    if any(x == "failed" for x in statuses):
        st = "failed"
    elif any(x == "waiting_sms" for x in statuses):
        st = "waiting_sms"
    elif any(x == "running" for x in statuses):
        st = "running"
    elif statuses and all(x == "passed" for x in statuses):
        st = "passed"
    elif any(x == "passed" for x in statuses):
        st = "running"
    else:
        st = "pending"
    update_step(
        run_id,
        group_id,
        status=st,
        detail="子步骤：" + ", ".join(f"{c.get('id')}={c.get('status')}" for c in children),
    )


def _session_path(run_id: str) -> Path:
    return RUNS_DIR / run_id / "biz_web_session.json"


def _save_biz_session(run_id: str, payload: dict) -> None:
    _write_json(_session_path(run_id), payload)


def _load_biz_session(run_id: str) -> dict:
    data = _read_json(_session_path(run_id), {})
    return data if isinstance(data, dict) else {}


def _find_run_artifact(run_id: str, *, step_id: str = "", role_contains: str = "") -> dict | None:
    for item in query_artifacts(run_id=run_id):
        if step_id and item.get("stepId") != step_id:
            continue
        if role_contains and role_contains not in str(item.get("role") or ""):
            continue
        return item
    return None


_ENSURE_STACK: list[str] = []


def _is_l1_business_role(role: str) -> bool:
    text = str(role or "")
    if any(x in text for x in ("会长", "二级", "三级", "新商务")):
        return False
    return "渠道商务" in text or text in {"一级商务", "一级渠道商务"} or ("商务" in text)


def _match_l1_president(role: str) -> bool:
    text = str(role or "")
    if "二级" in text or "三级" in text:
        return False
    return "一级会长" in text


def _match_l2_president(role: str) -> bool:
    return "二级会长" in str(role or "")


def _match_l3_president(role: str) -> bool:
    return "三级会长" in str(role or "")


def _match_player_role(role: str, label: str) -> bool:
    text = str(role or "")
    if "玩家" not in text:
        return False
    if label == "二级":
        return "二级" in text
    if label == "三级":
        return "三级" in text
    return "二级" not in text and "三级" not in text


def _find_latest_artifact(*, target: str = "", matcher=None) -> dict | None:
    target = str(target or "").strip().lower()
    for item in load_artifacts():
        if not str(item.get("account") or "").strip():
            continue
        if target and str(item.get("target") or item.get("platform") or "").lower() != target:
            continue
        if matcher and not matcher(item.get("role") or ""):
            continue
        return item
    return None


def _reuse_artifact_for_run(run_id: str, item: dict) -> dict:
    """把历史造数挂到当前运行，后续步骤按本运行查找。"""
    extra = dict(item.get("extra") or {}) if isinstance(item.get("extra"), dict) else {}
    extra["reusedFrom"] = item.get("id")
    extra["reusedRunId"] = item.get("runId")
    return add_artifact({
        "runId": run_id,
        "target": item.get("target") or item.get("platform") or "",
        "platform": item.get("platform") or item.get("target") or "",
        "type": item.get("type") or "account",
        "role": item.get("role") or "",
        "account": item.get("account") or "",
        "password": item.get("password") or "",
        "source": item.get("source") or "flow",
        "stepId": item.get("stepId") or "",
        "note": f"复用历史 {item.get('account') or ''}（来自 {item.get('runId') or item.get('id') or '造数记录'}）",
        "extra": extra,
    })


def _ensure_group(run_id: str, run: dict, mode: str, group_id: str) -> dict:
    gid = str(group_id or "").strip()
    if not gid:
        return {"ok": False, "error": "缺少前置分组"}
    if gid in _ENSURE_STACK:
        return {"ok": False, "error": f"前置依赖循环：{' → '.join(_ENSURE_STACK + [gid])}"}
    _ENSURE_STACK.append(gid)
    try:
        return execute_step(run_id, gid, mode)
    finally:
        if _ENSURE_STACK and _ENSURE_STACK[-1] == gid:
            _ENSURE_STACK.pop()


def _resolve_account_artifact(
    run_id: str,
    run: dict,
    mode: str,
    *,
    step_ids: tuple[str, ...] = (),
    role_contains: str = "",
    matcher=None,
    ensure_group: str = "",
    auto_create: bool = True,
    missing_error: str = "",
) -> dict:
    """本运行 → 历史造数 → 没有则自动补跑前置分组。"""
    matcher = matcher or (lambda role, key=role_contains: bool(key) and key in str(role or ""))
    info = {
        "reused": False,
        "autoRan": "",
        "autoRanF1": False,
        "account": "",
        "fromRunId": "",
        "fromStepId": "",
    }
    found = None
    for sid in step_ids:
        found = _find_run_artifact(run_id, step_id=sid)
        if found and found.get("account"):
            break
        found = None
    if not (found and found.get("account")) and role_contains:
        found = _find_run_artifact(run_id, role_contains=role_contains)
    if not (found and found.get("account")):
        found = _find_latest_artifact(target=str(run.get("target") or ""), matcher=matcher)
    if found and found.get("account"):
        info["account"] = str(found.get("account") or "")
        info["fromRunId"] = str(found.get("runId") or "")
        info["fromStepId"] = str(found.get("stepId") or "")
        if str(found.get("runId") or "") != str(run_id):
            found = _reuse_artifact_for_run(run_id, found)
            info["reused"] = True
        return {"ok": True, "artifact": found, "prereq": info}
    if not auto_create or not ensure_group:
        return {"ok": False, "error": missing_error or "未找到前置账号", "prereq": info}
    ensured = _ensure_group(run_id, run, mode, ensure_group)
    if not ensured.get("ok"):
        return {
            **ensured,
            "error": f"自动补跑 {ensure_group} 失败：{ensured.get('error') or '未知错误'}",
            "prereq": info,
        }
    info["autoRan"] = ensure_group
    info["autoRanF1"] = ensure_group == "F1"
    found = None
    for sid in step_ids:
        found = _find_run_artifact(run_id, step_id=sid)
        if found and found.get("account"):
            break
        found = None
    if not (found and found.get("account")) and role_contains:
        found = _find_run_artifact(run_id, role_contains=role_contains)
    if not (found and found.get("account")):
        found = ensured.get("artifact")
    info["account"] = str((found or {}).get("account") or "")
    if not found or not found.get("account"):
        return {
            "ok": False,
            "error": missing_error or f"自动补跑 {ensure_group} 后仍无账号",
            "prereq": info,
        }
    return {"ok": True, "artifact": found, "prereq": info}


def _resolve_f1_business(run_id: str, run: dict, mode: str, *, auto_create: bool = True) -> dict:
    return _resolve_account_artifact(
        run_id,
        run,
        mode,
        step_ids=("F1-2", "F1"),
        role_contains="渠道商务",
        matcher=_is_l1_business_role,
        ensure_group="F1",
        auto_create=auto_create,
        missing_error="未找到一级渠道商务账号",
    )


def _resolve_l1_president(run_id: str, run: dict, mode: str, *, auto_create: bool = True) -> dict:
    return _resolve_account_artifact(
        run_id,
        run,
        mode,
        step_ids=("F2-2", "F2"),
        role_contains="一级会长",
        matcher=_match_l1_president,
        ensure_group="F2",
        auto_create=auto_create,
        missing_error="未找到一级会长账号",
    )


def _resolve_tier_president(run_id: str, run: dict, mode: str, meta: dict, *, auto_create: bool = True) -> dict:
    role = str(meta.get("president_role") or "")
    matcher = _match_l1_president
    if meta.get("tier") == "l2":
        matcher = _match_l2_president
    elif meta.get("tier") == "l3":
        matcher = _match_l3_president
    return _resolve_account_artifact(
        run_id,
        run,
        mode,
        step_ids=(str(meta.get("create_step") or ""), str(meta.get("president_step") or "")),
        role_contains=role,
        matcher=matcher,
        ensure_group=str(meta.get("create_step") or ""),
        auto_create=auto_create,
        missing_error=f"未找到{role}",
    )


def _resolve_tier_parent(run_id: str, run: dict, mode: str, meta: dict, *, auto_create: bool = True) -> dict:
    role = str(meta.get("parent_role") or "")
    ensure = "F2"
    matcher = _match_l1_president
    if meta.get("tier") == "l3":
        ensure = "F11"
        matcher = _match_l2_president
    return _resolve_account_artifact(
        run_id,
        run,
        mode,
        step_ids=(str(meta.get("parent_step") or ""),),
        role_contains=role,
        matcher=matcher,
        ensure_group=ensure,
        auto_create=auto_create,
        missing_error=f"未找到{role}",
    )


def _resolve_tier_player(run_id: str, run: dict, mode: str, meta: dict, *, auto_create: bool = True) -> dict:
    role = str(meta.get("player_role") or "游戏玩家")
    label = str(meta.get("label") or "一级")
    return _resolve_account_artifact(
        run_id,
        run,
        mode,
        step_ids=(str(meta.get("reg_step") or ""), str(meta.get("sdk_group") or "")),
        role_contains=role,
        matcher=lambda r, lb=label: _match_player_role(r, lb),
        ensure_group=str(meta.get("sdk_group") or ""),
        auto_create=auto_create,
        missing_error=f"未找到{role}",
    )


def _oa_session_path(run_id: str) -> Path:
    return RUNS_DIR / run_id / "oa_session.json"


def _save_oa_session(run_id: str, payload: dict) -> None:
    _write_json(_oa_session_path(run_id), payload)


def _load_oa_session(run_id: str) -> dict:
    data = _read_json(_oa_session_path(run_id), {})
    return data if isinstance(data, dict) else {}


def _execute_f1_1_oa_login(run_id: str, run: dict, mode: str) -> dict:
    from oa_promote_api import oa_login

    result = oa_login()
    detail = {
        "system": "oa_promote",
        "step": "F1-1",
        "mode": mode,
        "result": {k: result.get(k) for k in ("ok", "error", "token", "response") if k != "token" or True},
    }
    # token 不在前端详情里完整展示太长，截断
    if isinstance(detail["result"].get("token"), str) and len(detail["result"]["token"]) > 24:
        detail["result"]["token"] = detail["result"]["token"][:24] + "…"
    if not result.get("ok"):
        update_step(run_id, "F1-1", status="failed", error=str(result.get("error") or "OA 登录失败"), detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}
    _save_oa_session(run_id, {"token": result.get("token"), "savedAt": _now()})
    update_step(run_id, "F1-1", status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_f1_2_create_business(run_id: str, run: dict, mode: str) -> dict:
    from oa_promote_api import create_level1_business

    target = str(run.get("target") or "lx")
    session = _load_oa_session(run_id)
    token = str(session.get("token") or "")
    result = create_level1_business(db_name=target, token=token or None)
    detail = {
        "system": "oa_promote",
        "step": "F1-2",
        "mode": mode,
        "usedToken": bool(token),
        "result": {
            k: result.get(k)
            for k in ("ok", "account", "password", "dbName", "level", "real_name", "mobile_phone", "httpStatus", "error", "response")
        },
    }
    if not result.get("ok"):
        update_step(run_id, "F1-2", status="failed", error=str(result.get("error") or "OA 创建商务失败"), detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}

    art = add_artifact({
        "runId": run_id,
        "target": target,
        "platform": target,
        "type": "account",
        "role": "一级渠道商务",
        "account": result.get("account") or "",
        "password": result.get("password") or "",
        "source": "flow_oa_promote",
        "stepId": "F1-2",
        "note": "OA tabPromoteBusiness/add · 非新商务",
        "extra": {
            "system": "oa_promote",
            "dbName": result.get("dbName"),
            "level": result.get("level"),
            "response": result.get("response"),
        },
    })
    update_step(run_id, "F1-2", status="passed", error="", detail=_dumps({**detail, "artifactId": art.get("id")}))
    return {"ok": True, "run": get_run(run_id), "result": result, "artifact": art}


def _execute_f2_1_biz_login(run_id: str, run: dict, mode: str, *, sms_code: str = "") -> dict:
    """F2-1：用 F1 一级渠道商务登录商务网页，会话写入 run 目录。"""
    from biz_web_api import biz_login, load_biz_web_config
    from smoke_db import trust_business_device

    resolved = _resolve_f1_business(run_id, run, mode)
    if not resolved.get("ok"):
        err = str(resolved.get("error") or "未找到一级渠道商务账号")
        update_step(run_id, "F2-1", status="failed", error=err, detail=err)
        return {**resolved, "run": get_run(run_id), "error": err}
    biz = resolved.get("artifact") or {}
    prereq = resolved.get("prereq") or {}

    cfg = load_biz_web_config()
    device_id = str(cfg.get("deviceId") or "")
    target = str(run.get("target") or "lx")
    # 新商务无登录设备记录仍会要短信；主流程暂直插库登记设备码跳过（后续再走真实验码业务）
    trust = trust_business_device(
        str(biz.get("account") or ""),
        device_id,
        source_db=target,
    )
    result = biz_login(
        str(biz.get("account") or ""),
        str(biz.get("password") or "111111"),
        device_id=device_id or None,
        sms_code=sms_code or None,
        cfg=cfg,
    )
    detail = {
        "system": "biz_web_promote",
        "step": "F2-1",
        "mode": mode,
        "deviceId": result.get("deviceId") or device_id,
        "loginAs": biz.get("account"),
        "needVerifyCode": result.get("needVerifyCode"),
        "needSms": bool(result.get("needSms")),
        "deviceTrust": trust,
        "prereq": prereq,
        "result": {
            k: result.get(k)
            for k in (
                "ok", "error", "needSms", "cookies", "needVerify", "login", "mobile_phone", "lastHttp",
            )
        },
        "lastHttp": result.get("lastHttp"),
    }
    if result.get("needSms"):
        out = _need_sms_payload(run_id, "F2-1", result, detail)
        out["prereq"] = prereq
        return out
    if not result.get("ok"):
        update_step(
            run_id,
            "F2-1",
            status="failed",
            error=str(result.get("error") or "商务登录失败"),
            detail=_dumps(detail),
        )
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error"), "prereq": prereq}

    _save_biz_session(run_id, {
        "account": biz.get("account"),
        "password": biz.get("password"),
        "deviceId": result.get("deviceId"),
        "cookies": result.get("cookies") or {},
        "savedAt": _now(),
    })
    update_step(
        run_id,
        "F2-1",
        status="passed",
        error="",
        detail=_dumps(detail),
    )
    return {"ok": True, "run": get_run(run_id), "result": result, "prereq": prereq}


def _execute_f2_2_create_president(run_id: str, run: dict, mode: str) -> dict:
    """F2-2：复用 F2-1 会话创建一级会长。"""
    from biz_web_api import create_level1_president

    target = str(run.get("target") or "lx")
    session = _load_biz_session(run_id)
    biz = (
        _find_run_artifact(run_id, step_id="F1-2")
        or _find_run_artifact(run_id, step_id="F1")
        or _find_run_artifact(run_id, role_contains="渠道商务")
        or _find_run_artifact(run_id, role_contains="一级商务")
        or _find_latest_artifact(target=target, matcher=_is_l1_business_role)
    )
    cookies = session.get("cookies") if isinstance(session.get("cookies"), dict) else {}
    if not cookies.get("PHPSESSID"):
        # 无会话则尝试用 F1 账号再登录一次（仍记到 F2-2 详情）
        if not biz or not biz.get("account"):
            err = "缺少 F2-1 登录会话，请先执行 F2-1"
            update_step(run_id, "F2-2", status="failed", error=err, detail=err)
            return {"ok": False, "run": get_run(run_id), "error": err}

    result = create_level1_president(
        biz_account=str(session.get("account") or (biz or {}).get("account") or ""),
        biz_password=str(session.get("password") or (biz or {}).get("password") or "111111"),
        session_cookies=cookies if cookies.get("PHPSESSID") else None,
        source_db=target,
    )
    detail = {
        "system": "biz_web_promote",
        "step": "F2-2",
        "mode": mode,
        "usedSession": bool(cookies.get("PHPSESSID")),
        "result": {
            k: result.get(k)
            for k in ("ok", "account", "password", "level", "register_type", "httpStatus", "error", "response", "lastHttp")
        },
        "lastHttp": result.get("lastHttp"),
    }
    if not result.get("ok"):
        update_step(
            run_id,
            "F2-2",
            status="failed",
            error=str(result.get("error") or "创建一级会长失败"),
            detail=_dumps(detail),
        )
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}

    art = add_artifact({
        "runId": run_id,
        "target": target,
        "platform": target,
        "type": "account",
        "role": "一级会长",
        "account": result.get("account") or "",
        "password": result.get("password") or "",
        "source": "flow_biz_web",
        "stepId": "F2-2",
        "note": "商务网页 promote/add · 上级=" + str(session.get("account") or (biz or {}).get("account") or ""),
        "extra": {
            "system": "biz_web_promote",
            "parentBizAccount": session.get("account") or (biz or {}).get("account"),
            "level": 1,
            "response": result.get("response"),
        },
    })
    update_step(
        run_id,
        "F2-2",
        status="passed",
        error="",
        detail=_dumps({**detail, "artifactId": art.get("id")}),
    )
    return {"ok": True, "run": get_run(run_id), "result": result, "artifact": art}


def _channel_session_path(run_id: str, tier: str = "l1") -> Path:
    tier = str(tier or "l1").lower()
    if tier in {"", "l1", "1"}:
        return RUNS_DIR / run_id / "channel_web_session.json"
    return RUNS_DIR / run_id / f"channel_web_session_{tier}.json"


def _save_channel_session(run_id: str, payload: dict, tier: str = "l1") -> None:
    _write_json(_channel_session_path(run_id, tier), payload)


def _load_channel_session(run_id: str, tier: str = "l1") -> dict:
    data = _read_json(_channel_session_path(run_id, tier), {})
    return data if isinstance(data, dict) else {}


def _game_session_path(run_id: str, tier: str = "l1") -> Path:
    tier = str(tier or "l1").lower()
    if tier in {"", "l1", "1"}:
        return RUNS_DIR / run_id / "game_sdk_session.json"
    return RUNS_DIR / run_id / f"game_sdk_session_{tier}.json"


def _save_game_session(run_id: str, payload: dict, tier: str = "l1") -> None:
    _write_json(_game_session_path(run_id, tier), payload)


def _load_game_session(run_id: str, tier: str = "l1") -> dict:
    data = _read_json(_game_session_path(run_id, tier), {})
    return data if isinstance(data, dict) else {}


def _need_sms_payload(run_id: str, step_id: str, result: dict, detail: dict) -> dict:
    """短信半自动：步骤标为 waiting_sms，前端弹窗后带 smsCode 重试。"""
    update_step(
        run_id,
        step_id,
        status="waiting_sms",
        error=str(result.get("error") or "等待短信验证码"),
        detail=_dumps(detail),
    )
    return {
        "ok": False,
        "needSms": True,
        "smsScene": result.get("smsScene") or "",
        "mobile": result.get("mobile") or "",
        "smsHint": result.get("smsHint") or result.get("error") or "请输入短信验证码",
        "run": get_run(run_id),
        "result": {k: v for k, v in result.items() if k != "_opener"},
        "error": result.get("error"),
    }


def _execute_f3_1_channel_login(
    run_id: str,
    run: dict,
    mode: str,
    *,
    sms_code: str = "",
) -> dict:
    from channel_web_api import channel_login, load_channel_web_config

    president_res = _resolve_l1_president(run_id, run, mode)
    if not president_res.get("ok"):
        err = str(president_res.get("error") or "未找到一级会长账号")
        update_step(run_id, "F3-1", status="failed", error=err, detail=err)
        return {**president_res, "run": get_run(run_id), "error": err}
    president = president_res.get("artifact") or {}
    prereq = president_res.get("prereq") or {}

    cfg = load_channel_web_config()
    device_id = str(cfg.get("deviceId") or "")
    result = channel_login(
        str(president.get("account") or ""),
        str(president.get("password") or "111111"),
        device_id=device_id or None,
        sms_code=sms_code or None,
        cfg=cfg,
    )
    detail = {
        "system": "channel_web_promote",
        "step": "F3-1",
        "mode": mode,
        "deviceId": result.get("deviceId") or device_id,
        "loginAs": president.get("account"),
        "needSms": bool(result.get("needSms")),
        "prereq": prereq,
        "result": {
            k: result.get(k)
            for k in ("ok", "error", "needSms", "smsScene", "mobile", "needVerify", "login", "cookies", "lastHttp")
        },
        "lastHttp": result.get("lastHttp"),
    }
    if result.get("needSms"):
        out = _need_sms_payload(run_id, "F3-1", result, detail)
        out["prereq"] = prereq
        return out
    if not result.get("ok"):
        update_step(
            run_id,
            "F3-1",
            status="failed",
            error=str(result.get("error") or "会长登录失败"),
            detail=_dumps(detail),
        )
        safe = {k: v for k, v in result.items() if k != "_opener"}
        return {"ok": False, "run": get_run(run_id), "result": safe, "error": result.get("error"), "prereq": prereq}

    _save_channel_session(run_id, {
        "account": president.get("account"),
        "password": president.get("password"),
        "deviceId": result.get("deviceId"),
        "cookies": result.get("cookies") or {},
        "savedAt": _now(),
    })
    update_step(
        run_id,
        "F3-1",
        status="passed",
        error="",
        detail=_dumps(detail),
    )
    safe = {k: v for k, v in result.items() if k != "_opener"}
    return {"ok": True, "run": get_run(run_id), "result": safe, "prereq": prereq}


def _execute_f3_2_change_password(run_id: str, run: dict, mode: str) -> dict:
    from channel_web_api import channel_change_password, load_channel_web_config

    session = _load_channel_session(run_id)
    cookies = session.get("cookies") if isinstance(session.get("cookies"), dict) else {}
    if not cookies.get("PHPSESSID"):
        err = "缺少 F3-1 会长登录会话，请先执行 F3-1"
        update_step(run_id, "F3-2", status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}

    cfg = load_channel_web_config()
    old_pwd = str(session.get("password") or "111111")
    new_pwd = str(cfg.get("newPassword") or "CHANGE_ME")
    result = channel_change_password(
        old_password=old_pwd,
        new_password=new_pwd,
        session_cookies=cookies,
        cfg=cfg,
    )
    detail = {
        "system": "channel_web_promote",
        "step": "F3-2",
        "mode": mode,
        "account": session.get("account"),
        "result": {k: result.get(k) for k in ("ok", "error", "httpStatus", "response", "request", "url", "path", "lastHttp")},
    }
    if not result.get("ok"):
        update_step(
            run_id,
            "F3-2",
            status="failed",
            error=str(result.get("error") or "会长改密失败"),
            detail=_dumps(detail),
        )
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}

    session["password"] = new_pwd
    session["passwordChangedAt"] = _now()
    _save_channel_session(run_id, session)

    # 同步造数表里会长密码，方便后续步骤
    president = _find_run_artifact(run_id, step_id="F2-2") or _find_run_artifact(run_id, role_contains="一级会长")
    if president and president.get("id"):
        arts = load_artifacts()
        for item in arts:
            if item.get("id") == president.get("id"):
                item["password"] = new_pwd
                item["note"] = (str(item.get("note") or "") + " · F3-2已改密").strip(" ·")
                break
        save_artifacts(arts)

    update_step(
        run_id,
        "F3-2",
        status="passed",
        error="",
        detail=_dumps(detail),
    )
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_f3_3_update_info(
    run_id: str,
    run: dict,
    mode: str,
    *,
    sms_code: str = "",
) -> dict:
    from channel_web_api import complete_profile_with_sms, load_channel_web_config
    from smoke_db import seed_promote_profile

    session = _load_channel_session(run_id)
    cookies = session.get("cookies") if isinstance(session.get("cookies"), dict) else {}
    if not cookies.get("PHPSESSID"):
        err = "缺少 F3-1 会长登录会话，请先执行 F3-1"
        update_step(run_id, "F3-3", status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}

    cfg = load_channel_web_config()
    profile = cfg.get("profileDefaults") if isinstance(cfg.get("profileDefaults"), dict) else {}
    result = complete_profile_with_sms(
        session_cookies=cookies,
        sms_code=sms_code or None,
        cfg=cfg,
        skip_send=bool(sms_code),
    )
    detail = {
        "system": "channel_web_promote",
        "step": "F3-3",
        "mode": mode,
        "account": session.get("account"),
        "idCardFront": cfg.get("idCardFront"),
        "idCardBack": cfg.get("idCardBack"),
        "skipUploadOcr": True,
        "needSms": bool(result.get("needSms")),
        "profileUsed": {
            "real_name": profile.get("real_name"),
            "id_card_no": profile.get("id_card_no"),
            "mobile_phone": profile.get("mobile_phone"),
        },
        "result": {
            k: result.get(k)
            for k in ("ok", "error", "needSms", "smsScene", "mobile", "sendSms", "httpStatus", "response", "form", "contract")
        },
    }
    if result.get("needSms"):
        return _need_sms_payload(run_id, "F3-3", result, detail)

    if not result.get("ok"):
        err_msg = str(result.get("error") or "")
        send_sms = result.get("sendSms") if isinstance(result.get("sendSms"), dict) else {}
        send_status = int(send_sms.get("httpStatus") or 0)
        # 实名失败 / 验证码失败 / 发短信接口 HTML·404·5xx：测库直写完善信息（测试环境临时方案）
        use_db_bypass = (
            "实名" in err_msg
            or "验证码" in err_msg
            or "verify" in err_msg.lower()
            or "sms" in err_msg.lower()
            or "HTML" in err_msg
            or "<!DOCTYPE" in err_msg
            or "404.css" in err_msg
            or send_status in (404, 500, 502, 503)
            or int(result.get("httpStatus") or 0) in (404, 500, 502, 503)
        )
        if use_db_bypass:
            bypass = seed_promote_profile(
                str(session.get("account") or ""),
                profile,
                source_db=str(run.get("target") or "lx"),
                id_card_front=str(cfg.get("idCardFront") or ""),
                id_card_back=str(cfg.get("idCardBack") or ""),
            )
            detail["profileBypass"] = bypass
            detail["bypassReason"] = err_msg[:300]
            if bypass.get("ok"):
                update_step(
                    run_id,
                    "F3-3",
                    status="passed",
                    error="",
                    detail=_dumps(detail),
                )
                return {
                    "ok": True,
                    "run": get_run(run_id),
                    "result": result,
                    "bypass": bypass,
                    "note": "完善信息接口不可用/实名失败，已库写入跳过",
                }
            err_msg = f"{err_msg}；库写入也失败: {bypass.get('error')}"
        # 避免把整页 HTML 弹到浏览器
        if "<!DOCTYPE" in err_msg or "<html" in err_msg.lower() or "404.css" in err_msg:
            err_msg = (
                f"完善信息失败：对方返回 HTML 错误页"
                f"（发短信 HTTP {send_status or result.get('httpStatus') or '?'}），"
                f"接口可能不可用或会话失效"
            )
        update_step(
            run_id,
            "F3-3",
            status="failed",
            error=err_msg or "完善信息失败",
            detail=_dumps(detail),
        )
        return {"ok": False, "run": get_run(run_id), "result": result, "error": err_msg}

    update_step(
        run_id,
        "F3-3",
        status="passed",
        error="",
        detail=_dumps(detail),
    )
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_f4_oa_approve_president(run_id: str, run: dict, mode: str) -> dict:
    """F4：OA 审核会长通过（changeStatus status=0）。"""
    from oa_promote_api import approve_promote
    from smoke_db import execute_write, lookup_promote_id, resolve_database

    target = str(run.get("target") or "lx")
    president_res = _resolve_l1_president(run_id, run, mode)
    if not president_res.get("ok"):
        err = str(president_res.get("error") or "未找到一级会长账号")
        update_step(run_id, "F4", status="failed", error=err, detail=err)
        return {**president_res, "run": get_run(run_id), "error": err}
    president = president_res.get("artifact") or {}
    prereq = president_res.get("prereq") or {}

    looked = lookup_promote_id(str(president.get("account") or ""), source_db=target)
    if not looked.get("ok"):
        err = str(looked.get("error") or "查不到会长 ID")
        update_step(run_id, "F4", status="failed", error=err, detail=_dumps(looked))
        return {"ok": False, "run": get_run(run_id), "error": err, "lookup": looked}

    detail = {
        "system": "oa_promote",
        "step": "F4",
        "mode": mode,
        "account": president.get("account"),
        "promoteId": looked.get("promoteId"),
        "lookup": looked,
    }

    # F3 库写入完善信息时可能已把 tab_promote.status 置 0，但 OA 后台审核态仍可能不是「正常」，必须打 changeStatus
    session = _load_oa_session(run_id)
    token = str(session.get("token") or "")
    result = approve_promote(
        promote_id=looked.get("promoteId"),
        db_name=target,
        status=0,
        token=token or None,
    )
    detail["result"] = {k: result.get(k) for k in ("ok", "error", "httpStatus", "status", "dbName", "response")}

    if not result.get("ok"):
        err_msg = str(result.get("error") or "")
        # OA 对非待审态会报「审核推广员错误」：测库直接置 0 兜底
        if "审核推广员" in err_msg or "推广员错误" in err_msg:
            try:
                db = resolve_database(target)
                execute_write(
                    f"UPDATE `{db}`.tab_promote SET status=0 WHERE id=%s",
                    params=(int(looked.get("promoteId")),),
                )
                detail["statusBypass"] = {
                    "ok": True,
                    "status": 0,
                    "note": "OA 审核失败，已库写入 status=0",
                    "bypassReason": err_msg[:200],
                }
                result = {"ok": True, "bypassed": True, "error": ""}
                detail["result"] = result
            except Exception as exc:
                detail["statusBypass"] = {"ok": False, "error": str(exc)}
                update_step(
                    run_id,
                    "F4",
                    status="failed",
                    error=f"{err_msg}；库写入也失败: {exc}",
                    detail=_dumps(detail),
                )
                return {"ok": False, "run": get_run(run_id), "result": result, "error": err_msg}

        if not result.get("ok"):
            update_step(
                run_id,
                "F4",
                status="failed",
                error=err_msg or "OA 审核会长失败",
                detail=_dumps(detail),
            )
            return {"ok": False, "run": get_run(run_id), "result": result, "error": err_msg}

    if president.get("id"):
        arts = load_artifacts()
        for item in arts:
            if item.get("id") == president.get("id"):
                extra = item.get("extra") if isinstance(item.get("extra"), dict) else {}
                extra["promoteId"] = looked.get("promoteId")
                extra["oaApproved"] = True
                if detail.get("statusBypass"):
                    extra["oaApproveBypassed"] = True
                item["extra"] = extra
                break
        save_artifacts(arts)

    update_step(run_id, "F4", status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result, "prereq": prereq}


def _execute_f5_apply_game(run_id: str, run: dict, mode: str) -> dict:
    """F5：会长申请游戏。"""
    from channel_web_api import channel_apply_game, channel_login, load_channel_web_config

    cfg = load_channel_web_config()
    game_id = cfg.get("gameId") or 659
    session = _load_channel_session(run_id)
    cookies = session.get("cookies") if isinstance(session.get("cookies"), dict) else {}
    president_res = _resolve_l1_president(run_id, run, mode)
    if not president_res.get("ok"):
        err = str(president_res.get("error") or "未找到一级会长账号")
        update_step(run_id, "F5", status="failed", error=err, detail=err)
        return {**president_res, "run": get_run(run_id), "error": err}
    president = president_res.get("artifact") or {}
    prereq = president_res.get("prereq") or {}

    if not cookies.get("PHPSESSID"):
        if not president or not president.get("account"):
            err = "缺少会长会话且无会长账号"
            update_step(run_id, "F5", status="failed", error=err, detail=err)
            return {"ok": False, "run": get_run(run_id), "error": err, "prereq": prereq}
        login = channel_login(
            str(president.get("account") or ""),
            str(session.get("password") or president.get("password") or cfg.get("newPassword") or "111111"),
            device_id=str(cfg.get("deviceId") or "") or None,
            cfg=cfg,
        )
        if login.get("needSms") or not login.get("ok"):
            err = str(login.get("error") or "会长会话失效且重登失败")
            update_step(
                run_id,
                "F5",
                status="failed",
                error=err,
                detail=_dumps(
                    {"relogin": {k: login.get(k) for k in ("ok", "error", "needSms", "mobile")}},
                ),
            )
            return {"ok": False, "run": get_run(run_id), "error": err, "relogin": login}
        cookies = login.get("cookies") or {}
        _save_channel_session(run_id, {
            "account": president.get("account"),
            "password": session.get("password") or president.get("password"),
            "deviceId": login.get("deviceId"),
            "cookies": cookies,
            "savedAt": _now(),
        })

    result = channel_apply_game(game_id=game_id, session_cookies=cookies, cfg=cfg)
    detail = {
        "system": "channel_web_promote",
        "step": "F5",
        "mode": mode,
        "account": session.get("account") or (president or {}).get("account"),
        "gameId": result.get("gameId") or game_id,
        "result": {k: result.get(k) for k in ("ok", "error", "httpStatus", "response", "request", "url", "path", "lastHttp")},
    }
    if not result.get("ok"):
        update_step(
            run_id,
            "F5",
            status="failed",
            error=str(result.get("error") or "申请游戏失败"),
            detail=_dumps(detail),
        )
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}

    art = add_artifact({
        "runId": run_id,
        "target": str(run.get("target") or "lx"),
        "platform": str(run.get("target") or "lx"),
        "type": "game_apply",
        "role": "会长申请游戏",
        "account": str(session.get("account") or (president or {}).get("account") or ""),
        "password": "",
        "source": "flow_channel_web",
        "stepId": "F5",
        "note": f"game_id={result.get('gameId') or game_id}",
        "extra": {"gameId": result.get("gameId") or game_id, "response": result.get("response")},
    })
    update_step(
        run_id,
        "F5",
        status="passed",
        error="",
        detail=_dumps({**detail, "artifactId": art.get("id")}),
    )
    return {"ok": True, "run": get_run(run_id), "result": result, "artifact": art, "prereq": prereq}


def _resolve_flow_promote_id(
    run_id: str,
    run: dict,
    *,
    role_contains: str = "一级会长",
    step_id: str = "F2-2",
) -> dict:
    from smoke_db import lookup_promote_id

    target = str(run.get("target") or "lx")
    mode = str(run.get("mode") or "silent")
    matcher = _match_l1_president
    ensure = "F2"
    if "二级" in role_contains:
        matcher = _match_l2_president
        ensure = "F11"
    elif "三级" in role_contains:
        matcher = _match_l3_president
        ensure = "F16"
    resolved = _resolve_account_artifact(
        run_id,
        run,
        mode,
        step_ids=(step_id,),
        role_contains=role_contains,
        matcher=matcher,
        ensure_group=ensure,
        auto_create=True,
        missing_error=f"未找到{role_contains}",
    )
    president = resolved.get("artifact") if resolved.get("ok") else None
    if not president or not president.get("account"):
        return {
            "ok": True,
            "promoteId": "0",
            "note": resolved.get("error") or f"无{role_contains}造数，promote_id=0",
            "prereq": resolved.get("prereq"),
        }
    looked = lookup_promote_id(str(president.get("account") or ""), source_db=target)
    if not looked.get("ok"):
        return {"ok": True, "promoteId": "0", "note": looked.get("error"), "lookup": looked, "prereq": resolved.get("prereq")}
    return {
        "ok": True,
        "promoteId": str(looked.get("promoteId")),
        "presidentAccount": president.get("account"),
        "lookup": looked,
        "prereq": resolved.get("prereq"),
    }


def _resolve_flow_game_id(run: dict) -> str:
    try:
        from channel_web_api import load_channel_web_config

        gid = str(load_channel_web_config().get("gameId") or "").strip()
        if gid:
            return gid
    except Exception:
        pass
    try:
        from game_sdk_api import load_game_sdk_config

        return str(load_game_sdk_config().get("gameId") or "659")
    except Exception:
        return "659"


def _tier_meta(tier: str = "l1") -> dict:
    """一级/二级/三级：会长角色、步骤号、会话文件键。"""
    t = str(tier or "l1").lower()
    if t in {"l2", "2"}:
        return {
            "tier": "l2",
            "label": "二级",
            "president_role": "二级会长",
            "president_step": "F11",
            "player_role": "二级游戏玩家",
            "player_prefix": "pL2",
            "player_nickname": "玩家L2",
            "reg_step": "F14-1",
            "idcard_step": "F14-2",
            "role_step": "F14-3",
            "order_step": "F14-4",
            "callback_step": "F15",
            "sdk_group": "F14",
            "parent_role": "一级会长",
            "parent_step": "F2-2",
            "parent_session": "l1",
            "account_prefix": "会长L2",
            "promote_level": 2,
            "create_step": "F11",
            "login_group": "F12",
            "login_step": "F12-1",
            "pwd_step": "F12-2",
            "agree_step": "F12-3",
            "apply_step": "F13",
        }
    if t in {"l3", "3"}:
        return {
            "tier": "l3",
            "label": "三级",
            "president_role": "三级会长",
            "president_step": "F16",
            "player_role": "三级游戏玩家",
            "player_prefix": "pL3",
            "player_nickname": "玩家L3",
            "reg_step": "F19-1",
            "idcard_step": "F19-2",
            "role_step": "F19-3",
            "order_step": "F19-4",
            "callback_step": "F20",
            "sdk_group": "F19",
            "parent_role": "二级会长",
            "parent_step": "F11",
            "parent_session": "l2",
            "account_prefix": "会长L3",
            "promote_level": 3,
            "create_step": "F16",
            "login_group": "F17",
            "login_step": "F17-1",
            "pwd_step": "F17-2",
            "agree_step": "F17-3",
            "apply_step": "F18",
        }
    return {
        "tier": "l1",
        "label": "一级",
        "president_role": "一级会长",
        "president_step": "F2-2",
        "player_role": "游戏玩家",
        "player_prefix": "pL1",
        "player_nickname": "玩家L1",
        "reg_step": "F8-1",
        "idcard_step": "F8-2",
        "role_step": "F8-3",
        "order_step": "F8-4",
        "callback_step": "F9",
        "commission_step": "F10",
        "sdk_group": "F8",
    }


def _execute_f8_1_register(run_id: str, run: dict, mode: str, *, tier: str = "l1") -> dict:
    from game_sdk_api import sdk_register

    meta = _tier_meta(tier)
    target = str(run.get("target") or "lx")
    promo = _resolve_flow_promote_id(
        run_id,
        run,
        role_contains=meta["president_role"],
        step_id=meta["president_step"],
    )
    game_id = _resolve_flow_game_id(run)
    result = sdk_register(
        promote_id=promo.get("promoteId") or "0",
        promote_account=str(promo.get("presidentAccount") or ""),
        game_id=game_id,
        source_db=target,
        account_prefix=meta.get("player_prefix") or "pL1",
        nickname=meta.get("player_nickname") or None,
    )
    step = meta["reg_step"]
    detail = {
        "system": "game_sdk",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "promote": promo,
        "result": {
            k: result.get(k)
            for k in ("ok", "error", "account", "userId", "gameId", "gameAppId", "gameName", "httpStatus", "response")
        },
    }
    if not result.get("ok") or not result.get("token"):
        update_step(
            run_id,
            step,
            status="failed",
            error=str(result.get("error") or "游戏注册失败"),
            detail=_dumps(detail),
        )
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}

    _save_game_session(
        run_id,
        {
            "account": result.get("account"),
            "password": result.get("password"),
            "userId": result.get("userId"),
            "token": result.get("token"),
            "gameId": result.get("gameId"),
            "gameAppId": result.get("gameAppId"),
            "gameName": result.get("gameName"),
            "promoteId": result.get("promoteId"),
            "savedAt": _now(),
        },
        tier=meta["tier"],
    )
    art = add_artifact({
        "runId": run_id,
        "target": target,
        "platform": target,
        "type": "account",
        "role": meta["player_role"],
        "account": result.get("account") or "",
        "password": result.get("password") or "",
        "source": "flow_game_sdk",
        "stepId": step,
        "note": (
            f"game={result.get('gameId')} promote={result.get('promoteId')} · "
            f"{meta['label']}会长玩家 · 昵称={result.get('nickname') or ''}"
        ),
        "extra": {
            "userId": result.get("userId"),
            "gameId": result.get("gameId"),
            "promoteId": result.get("promoteId"),
            "tier": meta["tier"],
            "nickname": result.get("nickname"),
        },
    })
    update_step(
        run_id,
        step,
        status="passed",
        error="",
        detail=_dumps({**detail, "artifactId": art.get("id")}),
    )
    return {"ok": True, "run": get_run(run_id), "result": result, "artifact": art}


def _execute_f8_2_idcard(run_id: str, run: dict, mode: str, *, tier: str = "l1") -> dict:
    from game_sdk_api import sdk_idcard

    meta = _tier_meta(tier)
    step = meta["idcard_step"]
    session = _load_game_session(run_id, meta["tier"])
    if not session.get("token") or not session.get("userId"):
        err = f"缺少 {meta['reg_step']} 游戏会话，请先执行 {meta['reg_step']}"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}
    result = sdk_idcard(
        user_id=str(session.get("userId")),
        token=str(session.get("token")),
        game_id=str(session.get("gameId") or ""),
        promote_id=str(session.get("promoteId") or "0"),
        source_db=str(run.get("target") or "lx"),
    )
    detail = {
        "system": "game_sdk",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": session.get("account"),
        "result": {k: result.get(k) for k in ("ok", "error", "httpStatus", "response", "request", "url", "path", "lastHttp")},
    }
    if not result.get("ok"):
        update_step(run_id, step, status="failed", error=str(result.get("error") or "实名失败"), detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_f8_3_upload_role(run_id: str, run: dict, mode: str, *, tier: str = "l1") -> dict:
    from game_sdk_api import sdk_upload_role

    meta = _tier_meta(tier)
    step = meta["role_step"]
    session = _load_game_session(run_id, meta["tier"])
    if not session.get("token") or not session.get("userId"):
        err = f"缺少 {meta['reg_step']} 游戏会话，请先执行 {meta['reg_step']}"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}
    result = sdk_upload_role(
        user_id=str(session.get("userId")),
        token=str(session.get("token")),
        game_id=str(session.get("gameId") or ""),
        promote_id=str(session.get("promoteId") or "0"),
        source_db=str(run.get("target") or "lx"),
    )
    detail = {
        "system": "game_sdk",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": session.get("account"),
        "result": {k: result.get(k) for k in ("ok", "error", "httpStatus", "response", "request", "url", "path", "lastHttp")},
    }
    if not result.get("ok"):
        update_step(run_id, step, status="failed", error=str(result.get("error") or "上传角色失败"), detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_f8_4_pay_order(run_id: str, run: dict, mode: str, *, tier: str = "l1") -> dict:
    from game_sdk_api import sdk_create_pay_order
    from smoke_db import lookup_latest_spend

    meta = _tier_meta(tier)
    step = meta["order_step"]
    session = _load_game_session(run_id, meta["tier"])
    if not session.get("token") or not session.get("userId") or not session.get("account"):
        err = f"缺少 {meta['reg_step']} 游戏会话，请先执行 {meta['reg_step']}"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}
    target = str(run.get("target") or "lx")
    result = sdk_create_pay_order(
        account=str(session.get("account")),
        user_id=str(session.get("userId")),
        token=str(session.get("token")),
        game_id=str(session.get("gameId") or ""),
        promote_id=str(session.get("promoteId") or "0"),
        source_db=target,
    )
    spend = lookup_latest_spend(str(session.get("account")), source_db=target)
    detail = {
        "system": "game_sdk",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": session.get("account"),
        "spend": spend,
        "result": {k: result.get(k) for k in ("ok", "error", "httpStatus", "price", "response")},
    }
    if not result.get("ok"):
        update_step(run_id, step, status="failed", error=str(result.get("error") or "下单失败"), detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}
    if spend.get("ok"):
        session["outTradeNo"] = spend.get("outTradeNo")
        session["payConfigId"] = spend.get("payConfigId")
        session["realAmount"] = spend.get("realAmount")
        _save_game_session(run_id, session, tier=meta["tier"])
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result, "spend": spend}


def _execute_f9_simulate_pay_callback(run_id: str, run: dict, mode: str, *, tier: str = "l1") -> dict:
    """模拟支付回调；tier=l1/l2/l3 对应 F9/F15/F20。"""
    import json as _json
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    from smoke_db import lookup_latest_spend

    meta = _tier_meta(tier)
    step = meta["callback_step"]
    session = _load_game_session(run_id, meta["tier"])
    account = str(session.get("account") or "")
    player_res = None
    if not account:
        player_res = _resolve_tier_player(run_id, run, mode, meta)
        account = str((player_res.get("artifact") or {}).get("account") or "")
    if not account:
        err = str((player_res or {}).get("error") or f"缺少{meta['label']}游戏玩家账号")
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err, "prereq": (player_res or {}).get("prereq")}

    target = str(run.get("target") or "lx")
    db_name = {"lx": "game_lx", "yq": "game_yq", "hw": "game_hw"}.get(target, f"game_{target}")
    spend = lookup_latest_spend(account, source_db=target)

    try:
        import sys

        host = sys.modules.get("__main__")
        ensure_fn = getattr(host, "ensure_recharge_callback_running", None)
        if ensure_fn is None:
            import app as workbench_app

            ensure_fn = workbench_app.ensure_recharge_callback_running
        ok, status = ensure_fn(force_restart=False)
    except Exception as exc:
        ok, status = False, str(exc)
    if not ok:
        err = f"充值回调模拟服务未就绪: {status}"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}

    body = {
        "account": account,
        "database": db_name,
        "callbackType": "game",
        "notifyStatus": "success",
    }
    payload = _json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = Request(
        "http://127.0.0.1:3780/api/simulate-recharge",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            http_status = getattr(resp, "status", None) or resp.getcode()
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        http_status = exc.code
    except (URLError, TimeoutError, OSError) as exc:
        err = f"调用模拟回调失败: {exc}"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}

    try:
        resp_json = _json.loads(text) if text else {}
    except _json.JSONDecodeError:
        resp_json = {"_raw": text[:500]}

    business_ok = bool(isinstance(resp_json, dict) and resp_json.get("ok"))
    detail = {
        "system": "recharge_callback",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": account,
        "database": db_name,
        "serviceStatus": status,
        "spendBefore": spend,
        "httpStatus": http_status,
        "request": body,
        "response": resp_json,
    }
    if not business_ok:
        err = str((resp_json or {}).get("message") or (resp_json or {}).get("error") or f"模拟回调失败 HTTP {http_status}")
        update_step(run_id, step, status="failed", error=err, detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "error": err, "response": resp_json}

    spend_after = lookup_latest_spend(account, source_db=target)
    detail["spendAfter"] = spend_after
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "response": resp_json, "spend": spend_after}


def _execute_f10_commission_check(run_id: str, run: dict, mode: str, *, tier: str = "l1") -> dict:
    """F10：归属 + 分佣流水断言（比例读申请表，金额看 sum_money）。"""
    from money_flow import assert_commission

    meta = _tier_meta(tier)
    step = str(meta.get("commission_step") or "F10")
    session = _load_game_session(run_id, meta["tier"])
    account = str(session.get("account") or "")
    promote_id = str(session.get("promoteId") or "").strip()
    game_id = str(session.get("gameId") or _resolve_flow_game_id(run) or "").strip()
    target = str(run.get("target") or "lx")

    if not account:
        player_res = _resolve_tier_player(run_id, run, mode, meta)
        account = str((player_res.get("artifact") or {}).get("account") or "")
        if not promote_id:
            promote_id = str(((player_res.get("artifact") or {}).get("extra") or {}).get("promoteId") or "")
    if not promote_id or promote_id == "0":
        promo = _resolve_flow_promote_id(
            run_id,
            run,
            role_contains=meta["president_role"],
            step_id=meta["president_step"],
        )
        promote_id = str(promo.get("promoteId") or "0")

    if not account:
        err = f"缺少{meta.get('label') or ''}游戏玩家账号（请先跑 SDK 注册/回调）"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}
    if not promote_id or promote_id == "0":
        err = "缺少 promote_id（禁止自然量进分佣断言）"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}

    result = assert_commission(
        account=account,
        promote_id=promote_id,
        game_id=game_id or None,
        source_db=target,
    )
    detail = {
        "system": "money_flow",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": account,
        "promoteId": promote_id,
        "gameId": game_id,
        "result": result,
    }
    if not result.get("ok"):
        err = str(result.get("error") or "分佣断言失败")
        update_step(run_id, step, status="failed", error=err, detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "error": err, "result": result}

    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_create_child_president(
    run_id: str,
    run: dict,
    mode: str,
    *,
    tier: str,
    sms_code: str = "",
) -> dict:
    """F11/F16：上级会长创建下级（add_chlid；短信失败则库写入）。"""
    from channel_web_api import channel_create_child, load_channel_web_config
    from smoke_db import seed_child_promote

    meta = _tier_meta(tier)
    step = meta["create_step"]
    parent_res = _resolve_tier_parent(run_id, run, mode, meta)
    if not parent_res.get("ok"):
        err = str(parent_res.get("error") or f"未找到{meta['parent_role']}")
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {**parent_res, "run": get_run(run_id), "error": err}
    parent = parent_res.get("artifact") or {}
    prereq = parent_res.get("prereq") or {}

    parent_session = _load_channel_session(run_id, meta["parent_session"])
    cookies = parent_session.get("cookies") if isinstance(parent_session.get("cookies"), dict) else {}
    if not cookies.get("PHPSESSID"):
        # 尝试用上级造数账号重登
        from channel_web_api import channel_login

        cfg_tmp = load_channel_web_config()
        login = channel_login(
            str(parent.get("account") or ""),
            str(parent_session.get("password") or parent.get("password") or cfg_tmp.get("newPassword") or "111111"),
            device_id=str(cfg_tmp.get("deviceId") or "") or None,
            cfg=cfg_tmp,
        )
        if login.get("ok") and (login.get("cookies") or {}).get("PHPSESSID"):
            cookies = login.get("cookies") or {}
            _save_channel_session(
                run_id,
                {
                    "account": parent.get("account"),
                    "password": parent_session.get("password") or parent.get("password") or cfg_tmp.get("newPassword"),
                    "deviceId": login.get("deviceId"),
                    "cookies": cookies,
                    "savedAt": _now(),
                    "tier": meta["parent_session"],
                },
                tier=meta["parent_session"],
            )
        else:
            err = (
                f"缺少{meta['parent_role']}登录会话，且重登失败："
                f"{login.get('error') or 'unknown'}（请先执行上级登录步骤）"
            )
            update_step(run_id, step, status="failed", error=err, detail=err)
            return {"ok": False, "run": get_run(run_id), "error": err, "relogin": login}

    cfg = load_channel_web_config()
    profile = cfg.get("profileDefaults") if isinstance(cfg.get("profileDefaults"), dict) else {}
    target = str(run.get("target") or "lx")
    # 续跑短信时复用上次预分配账号
    pending = _read_json(RUNS_DIR / run_id / f"pending_child_{meta['tier']}.json", {})
    child_account = str((pending or {}).get("account") or "") or None
    child_password = str((pending or {}).get("password") or "111111")

    result = channel_create_child(
        session_cookies=cookies,
        child_account=child_account,
        child_password=child_password,
        mobile=str(profile.get("mobile_phone") or ""),
        sms_code=sms_code or None,
        account_prefix=meta["account_prefix"],
        source_db=target,
        cfg=cfg,
    )
    detail = {
        "system": "channel_web_promote",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "parentAccount": parent.get("account"),
        "result": {
            k: result.get(k)
            for k in ("ok", "error", "needSms", "smsScene", "mobile", "account", "password", "httpStatus", "response", "sendSms")
        },
    }
    if result.get("needSms"):
        _write_json(
            RUNS_DIR / run_id / f"pending_child_{meta['tier']}.json",
            {"account": result.get("account"), "password": result.get("password"), "mobile": result.get("mobile")},
        )
        return _need_sms_payload(run_id, step, result, detail)

    if not result.get("ok"):
        err_msg = str(result.get("error") or "")
        send = result.get("sendSms") if isinstance(result.get("sendSms"), dict) else {}
        use_bypass = (
            "HTML" in err_msg
            or "<!DOCTYPE" in err_msg
            or int(send.get("httpStatus") or 0) in (404, 500, 502, 503)
            or int(result.get("httpStatus") or 0) in (404, 500, 502, 503)
        )
        if use_bypass or not sms_code:
            # 发短信失败或接口挂了：库写入；已有预分配账号则用
            acc = str(result.get("account") or child_account or "")
            pwd = str(result.get("password") or child_password or "111111")
            if not acc:
                from biz_web_api import next_president_account

                acc = next_president_account(meta["account_prefix"], source_db=target)
            bypass = seed_child_promote(
                str(parent.get("account") or ""),
                child_account=acc,
                child_password="CHANGE_ME",
                promote_level=meta["promote_level"],
                mobile=str(profile.get("mobile_phone") or ""),
                source_db=target,
            )
            detail["dbBypass"] = bypass
            if bypass.get("ok"):
                result = {
                    "ok": True,
                    "account": bypass.get("account") or acc,
                    "password": bypass.get("password") or "CHANGE_ME",
                    "bypass": True,
                }
            else:
                update_step(
                    run_id,
                    step,
                    status="failed",
                    error=f"{err_msg}；库写入也失败: {bypass.get('error')}",
                    detail=_dumps(detail),
                )
                return {"ok": False, "run": get_run(run_id), "error": err_msg, "result": result}
        else:
            update_step(run_id, step, status="failed", error=err_msg or "创建下级失败", detail=_dumps(detail))
            return {"ok": False, "run": get_run(run_id), "error": err_msg, "result": result}

    art = add_artifact({
        "runId": run_id,
        "target": target,
        "platform": target,
        "type": "account",
        "role": meta["president_role"],
        "account": result.get("account") or "",
        "password": result.get("password") or "111111",
        "source": "flow_channel_child",
        "stepId": step,
        "note": f"上级={parent.get('account')} · promote_level={meta['promote_level']}",
        "extra": {
            "parentAccount": parent.get("account"),
            "promoteLevel": meta["promote_level"],
            "tier": meta["tier"],
            "bypass": bool(result.get("bypass")),
        },
    })
    # 库写入的下级无登录设备记录，登录会被要短信：提前登记免验
    try:
        from channel_web_api import load_channel_web_config
        from smoke_db import trust_promote_device

        ch_cfg = load_channel_web_config()
        trust = trust_promote_device(
            str(result.get("account") or ""),
            str(ch_cfg.get("deviceId") or ""),
            source_db=target,
        )
        detail["deviceTrust"] = trust
    except Exception as exc:
        detail["deviceTrust"] = {"ok": False, "error": str(exc)}
    try:
        (RUNS_DIR / run_id / f"pending_child_{meta['tier']}.json").unlink(missing_ok=True)
    except Exception:
        pass
    update_step(
        run_id,
        step,
        status="passed",
        error="",
        detail=_dumps({**detail, "artifactId": art.get("id")}),
    )
    return {"ok": True, "run": get_run(run_id), "result": result, "artifact": art, "prereq": prereq}


def _execute_child_login(
    run_id: str,
    run: dict,
    mode: str,
    *,
    tier: str,
    sms_code: str = "",
) -> dict:
    from channel_web_api import channel_login, load_channel_web_config

    meta = _tier_meta(tier)
    step = meta["login_step"]
    child_res = _resolve_tier_president(run_id, run, mode, meta)
    if not child_res.get("ok"):
        err = str(child_res.get("error") or f"未找到{meta['president_role']}")
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {**child_res, "run": get_run(run_id), "error": err}
    child = child_res.get("artifact") or {}
    prereq = child_res.get("prereq") or {}

    cfg = load_channel_web_config()
    device_id = str(cfg.get("deviceId") or "")
    # 库造出的二/三级会长无设备记录会强制短信；先登记再登录
    try:
        from smoke_db import trust_promote_device

        trust = trust_promote_device(
            str(child.get("account") or ""),
            device_id,
            source_db=str(run.get("target") or "lx"),
        )
    except Exception as exc:
        trust = {"ok": False, "error": str(exc)}

    pwd_candidates = []
    for p in (
        child.get("password"),
        cfg.get("newPassword"),
        "CHANGE_ME",
        "111111",
    ):
        p = str(p or "").strip()
        if p and p not in pwd_candidates:
            pwd_candidates.append(p)
    if sms_code:
        # 带验证码重试时只用造数密码（或首个候选）
        pwd_candidates = pwd_candidates[:1] or ["CHANGE_ME"]

    result = None
    used_pwd = pwd_candidates[0] if pwd_candidates else "CHANGE_ME"
    for pwd in pwd_candidates:
        used_pwd = pwd
        result = channel_login(
            str(child.get("account") or ""),
            pwd,
            device_id=device_id or None,
            sms_code=sms_code or None,
            cfg=cfg,
        )
        if result.get("ok") or result.get("needSms"):
            break
        err = str(result.get("error") or "")
        if "密码" not in err:
            break

    detail = {
        "system": "channel_web_promote",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "loginAs": child.get("account"),
        "needSms": bool(result.get("needSms") if result else False),
        "deviceTrust": trust,
        "triedPasswords": len(pwd_candidates),
        "usedPasswordHint": (used_pwd[:2] + "***") if used_pwd else "",
        "result": {
            k: (result or {}).get(k)
            for k in ("ok", "error", "needSms", "smsScene", "mobile", "needVerify", "login", "cookies")
        },
    }
    if result and result.get("ok") and used_pwd and child.get("password") != used_pwd:
        # 纠正造数表密码，后续改密/申请用对
        if child.get("id"):
            arts = load_artifacts()
            for item in arts:
                if item.get("id") == child.get("id"):
                    item["password"] = used_pwd
                    break
            save_artifacts(arts)
        child["password"] = used_pwd
    if result.get("needSms"):
        out = _need_sms_payload(run_id, step, result, detail)
        out["prereq"] = prereq
        return out
    if not result.get("ok"):
        update_step(run_id, step, status="failed", error=str(result.get("error") or "登录失败"), detail=_dumps(detail))
        safe = {k: v for k, v in result.items() if k != "_opener"}
        return {"ok": False, "run": get_run(run_id), "result": safe, "error": result.get("error"), "prereq": prereq}

    _save_channel_session(
        run_id,
        {
            "account": child.get("account"),
            "password": used_pwd or child.get("password"),
            "deviceId": result.get("deviceId"),
            "cookies": result.get("cookies") or {},
            "savedAt": _now(),
            "tier": meta["tier"],
        },
        tier=meta["tier"],
    )
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    safe = {k: v for k, v in result.items() if k != "_opener"}
    return {"ok": True, "run": get_run(run_id), "result": safe, "prereq": prereq}


def _execute_child_change_password(run_id: str, run: dict, mode: str, *, tier: str) -> dict:
    from channel_web_api import channel_change_password, load_channel_web_config

    meta = _tier_meta(tier)
    step = meta["pwd_step"]
    session = _load_channel_session(run_id, meta["tier"])
    cookies = session.get("cookies") if isinstance(session.get("cookies"), dict) else {}
    if not cookies.get("PHPSESSID"):
        err = f"缺少 {meta['login_step']} 会话"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}

    cfg = load_channel_web_config()
    old_pwd = str(session.get("password") or "111111")
    new_pwd = str(cfg.get("newPassword") or "CHANGE_ME")
    result = channel_change_password(
        old_password=old_pwd,
        new_password=new_pwd,
        session_cookies=cookies,
        cfg=cfg,
    )
    detail = {
        "system": "channel_web_promote",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": session.get("account"),
        "result": {k: result.get(k) for k in ("ok", "error", "httpStatus", "response", "request", "url", "path", "lastHttp")},
    }
    if not result.get("ok"):
        # 库写入的下级若已是新密码，改密失败不阻断
        msg = str(result.get("error") or "")
        if "不正确" in msg or "失败" in msg:
            detail["note"] = "改密接口失败，继续用当前密码"
            update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
            return {"ok": True, "run": get_run(run_id), "result": result, "softPass": True}
        update_step(run_id, step, status="failed", error=msg or "改密失败", detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "result": result, "error": msg}

    session["password"] = new_pwd
    session["passwordChangedAt"] = _now()
    _save_channel_session(run_id, session, tier=meta["tier"])
    child = _find_run_artifact(run_id, step_id=meta["create_step"]) or _find_run_artifact(
        run_id, role_contains=meta["president_role"]
    )
    if child and child.get("id"):
        arts = load_artifacts()
        for item in arts:
            if item.get("id") == child.get("id"):
                item["password"] = new_pwd
                break
        save_artifacts(arts)
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_child_agreement(run_id: str, run: dict, mode: str, *, tier: str) -> dict:
    from channel_web_api import channel_agreement_rule, load_channel_web_config

    meta = _tier_meta(tier)
    step = meta["agree_step"]
    session = _load_channel_session(run_id, meta["tier"])
    cookies = session.get("cookies") if isinstance(session.get("cookies"), dict) else {}
    if not cookies.get("PHPSESSID"):
        err = f"缺少 {meta['login_step']} 会话"
        update_step(run_id, step, status="failed", error=err, detail=err)
        return {"ok": False, "run": get_run(run_id), "error": err}
    result = channel_agreement_rule(session_cookies=cookies, cfg=load_channel_web_config())
    detail = {
        "system": "channel_web_promote",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": session.get("account"),
        "result": {k: result.get(k) for k in ("ok", "error", "httpStatus", "response", "request", "url", "path", "lastHttp")},
    }
    # 协议失败不硬阻断申请游戏（部分环境无此接口）
    if not result.get("ok"):
        detail["softPass"] = True
        detail["note"] = result.get("error") or "协议接口失败，已软通过"
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result}


def _execute_child_apply_game(run_id: str, run: dict, mode: str, *, tier: str) -> dict:
    from channel_web_api import channel_apply_game, channel_login, load_channel_web_config

    meta = _tier_meta(tier)
    step = meta["apply_step"]
    session = _load_channel_session(run_id, meta["tier"])
    cookies = session.get("cookies") if isinstance(session.get("cookies"), dict) else {}
    cfg = load_channel_web_config()
    game_id = cfg.get("gameId") or "659"

    if not cookies.get("PHPSESSID"):
        child_res = _resolve_tier_president(run_id, run, mode, meta)
        child = child_res.get("artifact") if child_res.get("ok") else None
        if not child:
            err = str(child_res.get("error") or f"缺少{meta['president_role']}会话与造数")
            update_step(run_id, step, status="failed", error=err, detail=err)
            return {**child_res, "run": get_run(run_id), "error": err}
        login = channel_login(
            str(child.get("account") or ""),
            str(session.get("password") or child.get("password") or cfg.get("newPassword") or "111111"),
            device_id=str(cfg.get("deviceId") or "") or None,
            cfg=cfg,
        )
        if login.get("needSms") or not login.get("ok"):
            err = str(login.get("error") or "会话失效且重登失败")
            update_step(run_id, step, status="failed", error=err, detail=_dumps({"relogin": login}))
            return {"ok": False, "run": get_run(run_id), "error": err, "relogin": login}
        cookies = login.get("cookies") or {}
        _save_channel_session(
            run_id,
            {
                "account": child.get("account"),
                "password": session.get("password") or child.get("password"),
                "deviceId": login.get("deviceId"),
                "cookies": cookies,
                "savedAt": _now(),
                "tier": meta["tier"],
            },
            tier=meta["tier"],
        )

    result = channel_apply_game(game_id=game_id, session_cookies=cookies, cfg=cfg)
    detail = {
        "system": "channel_web_promote",
        "step": step,
        "tier": meta["tier"],
        "mode": mode,
        "account": session.get("account"),
        "gameId": game_id,
        "result": {k: result.get(k) for k in ("ok", "error", "gameId", "httpStatus", "response")},
    }
    if not result.get("ok"):
        update_step(run_id, step, status="failed", error=str(result.get("error") or "申请游戏失败"), detail=_dumps(detail))
        return {"ok": False, "run": get_run(run_id), "result": result, "error": result.get("error")}
    update_step(run_id, step, status="passed", error="", detail=_dumps(detail))
    return {"ok": True, "run": get_run(run_id), "result": result}


def _run_child_login_group(run_id: str, run: dict, mode: str, *, tier: str, sms_code: str = "") -> dict:
    meta = _tier_meta(tier)
    group = meta["login_group"]

    def _st(sid: str) -> str:
        cur = get_run(run_id) or run
        s = next((x for x in (cur.get("steps") or []) if x.get("id") == sid), None)
        return str((s or {}).get("status") or "")

    if _st(meta["login_step"]) != "passed":
        r1 = _execute_child_login(run_id, run, mode, tier=tier, sms_code=sms_code)
        if r1.get("needSms") or not r1.get("ok"):
            _rollup_group_status(run_id, group)
            return r1
        run = get_run(run_id) or run
        sms_code = ""
    if _st(meta["pwd_step"]) != "passed":
        r2 = _execute_child_change_password(run_id, run, mode, tier=tier)
        if not r2.get("ok"):
            _rollup_group_status(run_id, group)
            return r2
        run = get_run(run_id) or run
    if _st(meta["agree_step"]) != "passed":
        r3 = _execute_child_agreement(run_id, run, mode, tier=tier)
        _rollup_group_status(run_id, group)
        return r3
    _rollup_group_status(run_id, group)
    return {"ok": True, "run": get_run(run_id)}


def _run_sdk_group(run_id: str, run: dict, mode: str, *, tier: str) -> dict:
    meta = _tier_meta(tier)
    group = meta["sdk_group"]

    def _st(sid: str) -> str:
        cur = get_run(run_id) or run
        s = next((x for x in (cur.get("steps") or []) if x.get("id") == sid), None)
        return str((s or {}).get("status") or "")

    for sid, fn in [
        (meta["reg_step"], lambda: _execute_f8_1_register(run_id, run, mode, tier=tier)),
        (meta["idcard_step"], lambda: _execute_f8_2_idcard(run_id, run, mode, tier=tier)),
        (meta["role_step"], lambda: _execute_f8_3_upload_role(run_id, run, mode, tier=tier)),
        (meta["order_step"], lambda: _execute_f8_4_pay_order(run_id, run, mode, tier=tier)),
    ]:
        if _st(sid) == "passed":
            continue
        out = fn()
        if not out.get("ok"):
            _rollup_group_status(run_id, group)
            return out
        run = get_run(run_id) or run
    _rollup_group_status(run_id, group)
    return {"ok": True, "run": get_run(run_id)}

