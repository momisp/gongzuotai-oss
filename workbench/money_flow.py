# -*- coding: utf-8 -*-
"""游戏钱链路 v1：归属 → 充值回调 → 分佣核对（可被 biz_flow F10 / CLI 复用）。"""
from __future__ import annotations

import json
import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from urllib.request import Request, urlopen


def _money(v: Any) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _sql(sql: str, params=None, *, source_db: str = "lx") -> list[dict]:
    from smoke_db import execute_select, load_db_config, resolve_database

    cfg = dict(load_db_config())
    cfg["database"] = resolve_database(source_db, cfg)
    return execute_select(sql, cfg=cfg, params=params or ())


def load_apply_ratio(promote_id: int | str, game_id: int | str, *, source_db: str = "lx") -> dict:
    rows = _sql(
        """
        SELECT id, promote_id, game_id, status, enable_status, promote_ratio, promote_money
        FROM tab_promote_apply
        WHERE promote_id=%s AND game_id=%s
        ORDER BY id DESC LIMIT 1
        """,
        (int(promote_id), int(game_id)),
        source_db=source_db,
    )
    return rows[0] if rows else {}


def ensure_guild_game_ready(
    *,
    promote_id: int | str,
    game_id: int | str = 659,
    guild_account: str | None = None,
    guild_password: str | None = None,
    source_db: str = "lx",
    auto_apply: bool = True,
) -> dict:
    """S0 前置：会长已申请且通过该游戏；否则走 F5 申请（本环境申请即 status=1）。

    分支：
    1) 已有 status=1 且比例>0 → 直接通过
    2) 会长账号异常 → OA F4 审核会长（approve_promote）
    3) 未申请/未通过 → 会长登录 + channel_apply_game（F5）
    4) 仍未通过 → 失败（需人工看 OA/总后台游戏申请审核）
    """
    pid = int(promote_id)
    gid = int(game_id)
    branch: list[str] = []

    apply_row = load_apply_ratio(pid, gid, source_db=source_db)
    if apply_row and int(apply_row.get("status") or 0) == 1 and float(apply_row.get("promote_ratio") or 0) > 0:
        return {
            "ok": True,
            "branched": False,
            "branch": ["already_applied"],
            "apply": apply_row,
            "detail": f"已有申请 status=1 ratio={apply_row.get('promote_ratio')}",
        }

    if not auto_apply:
        return {
            "ok": False,
            "branched": False,
            "branch": branch,
            "apply": apply_row,
            "error": "会长未申请/未通过该游戏（auto_apply=false）",
        }

    # 账号密码：优先入参 → 结算配置 → channel 配置
    from channel_web_api import channel_apply_game, channel_login, load_channel_web_config
    from money_settlement_pw import load_settlement_config
    from platform_env import with_platform_host

    sett = load_settlement_config(target=source_db)
    ch = with_platform_host(load_channel_web_config(), source_db)
    account = str(guild_account or sett.get("guildAccount") or "").strip()
    password = str(
        guild_password or sett.get("guildLoginPassword") or ch.get("newPassword") or "CHANGE_ME"
    ).strip()
    if not account:
        rows = _sql("SELECT account FROM tab_promote WHERE id=%s LIMIT 1", (pid,), source_db=source_db)
        account = str((rows[0] or {}).get("account") or "") if rows else ""
    if not account:
        return {"ok": False, "error": "缺少会长账号，无法申请游戏", "apply": apply_row, "branch": branch}

    # 会长 OA 态：库 status 非正常时尝试 F4（OA 通过码为 0）
    promo_rows = _sql("SELECT id, account, status FROM tab_promote WHERE id=%s LIMIT 1", (pid,), source_db=source_db)
    promo = promo_rows[0] if promo_rows else {}
    promo_st = promo.get("status")
    # 业务上可申请的会长一般为库 status=1；若异常再打 OA
    if promo and promo_st is not None and int(promo_st) not in (0, 1):
        branch.append("oa_approve_promote")
        try:
            from oa_promote_api import approve_promote

            oa = approve_promote(promote_id=pid, db_name=source_db)
            if not oa.get("ok"):
                return {
                    "ok": False,
                    "branched": True,
                    "branch": branch,
                    "error": f"OA 审核会长失败: {oa.get('error')}",
                    "oa": oa,
                    "apply": apply_row,
                }
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "branched": True,
                "branch": branch,
                "error": f"OA 审核会长异常: {exc}",
                "apply": apply_row,
            }

    branch.append("channel_apply_game")
    login = channel_login(account, password, cfg=ch)
    if login.get("needSms"):
        return {
            "ok": False,
            "branched": True,
            "branch": branch,
            "error": "会长登录需要短信验证码，无法自动申请游戏",
            "login": {k: login.get(k) for k in ("ok", "needSms", "mobile", "error")},
            "apply": apply_row,
        }
    if not login.get("ok"):
        return {
            "ok": False,
            "branched": True,
            "branch": branch,
            "error": login.get("error") or "会长登录失败",
            "login": login,
            "apply": apply_row,
        }

    applied = channel_apply_game(game_id=gid, session_cookies=login.get("cookies") or {}, cfg=ch)
    if not applied.get("ok"):
        return {
            "ok": False,
            "branched": True,
            "branch": branch,
            "error": applied.get("error") or "申请游戏失败",
            "applyResult": applied,
            "apply": apply_row,
        }

    # 申请后轮询库（本环境通常立刻 status=1）
    for _ in range(12):
        apply_row = load_apply_ratio(pid, gid, source_db=source_db)
        if apply_row and int(apply_row.get("status") or 0) == 1 and float(apply_row.get("promote_ratio") or 0) > 0:
            return {
                "ok": True,
                "branched": True,
                "branch": branch + ["apply_passed"],
                "apply": apply_row,
                "applyResult": {k: applied.get(k) for k in ("ok", "msg", "httpStatus", "response")},
                "detail": f"已自动申请游戏 game={gid} ratio={apply_row.get('promote_ratio')}",
            }
        time.sleep(0.5)

    # 仍未通过：可能要总后台/OA 审游戏申请（当前测库申请即通过，走这里说明环境变了）
    branch.append("await_apply_audit")
    return {
        "ok": False,
        "branched": True,
        "branch": branch,
        "error": "已提交申请游戏，但 tab_promote_apply 尚未 status=1（需人工/OA 审游戏申请）",
        "apply": apply_row,
        "applyResult": applied,
    }


def lookup_user(account: str, *, source_db: str = "lx") -> dict:
    rows = _sql(
        "SELECT id, account, promote_id, promote_account, nickname FROM tab_user WHERE account=%s LIMIT 1",
        (account,),
        source_db=source_db,
    )
    return rows[0] if rows else {}


def lookup_spend(account: str, *, source_db: str = "lx") -> dict:
    rows = _sql(
        """
        SELECT id, user_account, promote_id, promote_account, pay_amount, pay_status,
               pay_order_number, order_number, game_id
        FROM tab_spend WHERE user_account=%s
        ORDER BY id DESC LIMIT 1
        """,
        (account,),
        source_db=source_db,
    )
    return rows[0] if rows else {}


def lookup_settlement(pay_order_number: str, *, source_db: str = "lx") -> dict:
    rows = _sql(
        """
        SELECT id, promote_id, promote_account, game_id, pattern, ratio, money,
               sum_money, pay_order_number, pay_amount, status, selle_status, create_time
        FROM tab_promote_settlement
        WHERE pay_order_number=%s
        ORDER BY id DESC LIMIT 1
        """,
        (pay_order_number,),
        source_db=source_db,
    )
    return rows[0] if rows else {}


def wait_settlement(pay_order: str, *, source_db: str = "lx", timeout: float = 12) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        last = lookup_settlement(pay_order, source_db=source_db)
        if last:
            return last
        time.sleep(0.8)
    return last


def assert_commission(
    *,
    account: str,
    promote_id: int | str,
    game_id: int | str | None = None,
    source_db: str = "lx",
    poll_sec: float = 12,
) -> dict:
    """断言：归属、订单成功、分佣流水比例与 sum_money。"""
    account = str(account or "").strip()
    pid = int(promote_id)
    if not account:
        return {"ok": False, "error": "缺少玩家 account"}
    if pid <= 0:
        return {"ok": False, "error": "promote_id 无效（禁止自然量进主断言）"}

    user = lookup_user(account, source_db=source_db)
    if not user:
        return {"ok": False, "error": f"tab_user 无账号 {account}"}
    if int(user.get("promote_id") or 0) != pid:
        return {
            "ok": False,
            "error": f"归属不符：user.promote_id={user.get('promote_id')} != {pid}",
            "user": user,
        }

    spend = lookup_spend(account, source_db=source_db)
    if not spend:
        return {"ok": False, "error": "tab_spend 无订单", "user": user}
    if int(spend.get("pay_status") or 0) != 1:
        return {"ok": False, "error": f"订单未成功 pay_status={spend.get('pay_status')}", "spend": spend}
    if int(spend.get("promote_id") or 0) != pid:
        return {"ok": False, "error": "订单 promote_id 不匹配", "spend": spend}

    gid = int(game_id or spend.get("game_id") or 0)
    apply_row = load_apply_ratio(pid, gid, source_db=source_db) if gid else {}
    ratio = float((apply_row or {}).get("promote_ratio") or 0)
    if ratio <= 0:
        return {
            "ok": False,
            "error": "无法读取 promote_ratio（tab_promote_apply），禁止写死比例",
            "apply": apply_row,
            "spend": spend,
        }

    pay_order = str(spend.get("pay_order_number") or "")
    pay_amount = float(spend.get("pay_amount") or 0)
    sett = wait_settlement(pay_order, source_db=source_db, timeout=poll_sec)
    if not sett:
        return {"ok": False, "error": "无 tab_promote_settlement 流水", "spend": spend, "apply": apply_row}

    sett_promote = int(sett.get("promote_id") or 0)
    sett_ratio = float(sett.get("ratio") or 0)
    expected = _money(Decimal(str(pay_amount)) * Decimal(str(ratio)) / Decimal("100"))
    sett_sum = _money(sett.get("sum_money"))
    ratio_ok = abs(sett_ratio - ratio) <= 0.01
    money_ok = sett_sum == expected or _money(sett.get("money")) == expected

    detail = {
        "account": account,
        "user": user,
        "spend": spend,
        "apply": apply_row,
        "settlement": sett,
        "expectedCommission": float(expected),
        "checks": {
            "归属": True,
            "订单成功": True,
            "流水promote": sett_promote == pid,
            "比例对齐": ratio_ok,
            "sum_money对齐": sett_sum == expected,
        },
    }
    if sett_promote != pid:
        return {"ok": False, "error": f"结算 promote_id={sett_promote} != {pid}", **detail}
    if not ratio_ok:
        return {
            "ok": False,
            "error": f"比例不对齐 settlement.ratio={sett_ratio} apply={ratio}",
            **detail,
        }
    if not money_ok:
        return {
            "ok": False,
            "error": f"分成金额不对齐 sum_money={sett_sum} expected={expected}",
            **detail,
        }
    return {"ok": True, **detail}


def ensure_recharge_callback() -> tuple[bool, str]:
    try:
        import app as workbench_app

        return workbench_app.ensure_recharge_callback_running(force_restart=False)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def simulate_recharge(account: str, *, source_db: str = "lx") -> dict:
    from urllib.error import HTTPError

    db_name = {"lx": "game_lx", "yq": "game_yq", "hw": "game_hw"}.get(source_db, f"game_{source_db}")
    body = {
        "account": account,
        "database": db_name,
        "callbackType": "game",
        "notifyStatus": "success",
    }
    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = Request(
        "http://127.0.0.1:3780/api/simulate-recharge",
        data=raw,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            http_status = getattr(resp, "status", None) or resp.getcode()
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        http_status = int(exc.code or 0)
    payload = json.loads(text) if text else {}
    return {
        "ok": bool(payload.get("ok")),
        "httpStatus": int(http_status or 0),
        "request": body,
        "response": payload,
        "error": "" if payload.get("ok") else str(payload.get("message") or f"HTTP {http_status}"),
    }


def run_money_flow_v1(
    *,
    promote_id: int | str = 29714,
    promote_account: str = "会长L1_8241",
    game_id: int | str = 659,
    source_db: str = "lx",
) -> dict:
    """端到端：注册→实名→角色→下单→回调→分佣断言。"""
    from game_sdk_api import run_player_flow

    pid = int(promote_id)
    gid = int(game_id)
    ready = ensure_guild_game_ready(
        promote_id=pid,
        game_id=gid,
        guild_account=str(promote_account or ""),
        source_db=source_db,
    )
    if not ready.get("ok"):
        return {
            "ok": False,
            "step": "seed",
            "error": ready.get("error") or "会长未申请/未通过该游戏",
            "apply": ready.get("apply"),
            "seed": ready,
        }
    apply_row = ready.get("apply") or load_apply_ratio(pid, gid, source_db=source_db)
    if float((apply_row or {}).get("promote_ratio") or 0) <= 0:
        return {"ok": False, "step": "seed", "error": "promote_ratio 无效", "apply": apply_row}

    ok_cb, cb_status = ensure_recharge_callback()
    if not ok_cb:
        return {"ok": False, "step": "callback_service", "error": f"3780 未就绪: {cb_status}"}

    flow = run_player_flow(promote_id=pid, game_id=str(gid), source_db=source_db)
    if not flow.get("ok"):
        return {
            "ok": False,
            "step": flow.get("step") or "player_flow",
            "error": flow.get("error") or "玩家流失败",
            "flow": flow,
            "promoteAccount": promote_account,
        }

    account = str(flow.get("account") or "")
    try:
        cb = simulate_recharge(account, source_db=source_db)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "step": "回调", "error": str(exc), "account": account, "flow": flow}
    if not cb.get("ok"):
        return {"ok": False, "step": "回调", "error": "simulate-recharge 失败", "callback": cb, "flow": flow}

    # 等 pay_status
    for _ in range(24):
        spend = lookup_spend(account, source_db=source_db)
        if spend and int(spend.get("pay_status") or 0) == 1:
            break
        time.sleep(0.5)

    check = assert_commission(
        account=account,
        promote_id=pid,
        game_id=gid,
        source_db=source_db,
    )
    return {
        **check,
        "step": "done" if check.get("ok") else "分佣",
        "promoteId": pid,
        "promoteAccount": promote_account,
        "callback": cb,
        "callbackService": cb_status,
        "flow": {"account": account, "userId": flow.get("userId"), "gameId": gid},
    }


if __name__ == "__main__":
    import sys

    out = run_money_flow_v1()
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
    sys.exit(0 if out.get("ok") else 1)
