# -*- coding: utf-8 -*-
"""结算～提现（非前后端分离）：Playwright 会话 + 表单提交。

- 会长端（S8/S9）：已实机验收（channel 登录 Cookie + do_confirm / withdrawal）
- 总后台（S7/S10/S11）：需图形验证；用 data/admin_storage_state.json 复用浏览器登录态
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from biz_web_api import _biz_ok, _cookie_header, _opener, _post_form
from channel_web_api import channel_login, load_channel_web_config

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "money_settlement_config.json"
EXAMPLE_FILE = DATA_DIR / "money_settlement_config.example.json"
ADMIN_STATE_FILE = DATA_DIR / "admin_storage_state.json"
# 总后台：只允许 14:00（含）至 20:00（不含）打款
PAYOUT_WINDOW_MSG = "只允许下午14点-20点进行打款操作"


def payout_window_open(now: datetime | None = None) -> bool:
    now = now or datetime.now()
    return 14 <= now.hour < 20


def payout_window_reject(payload: Any) -> bool:
    if isinstance(payload, dict):
        msg = str(payload.get("msg") or payload.get("message") or "")
    else:
        msg = str(payload or "")
    return "14点" in msg and "20点" in msg and "打款" in msg


def load_settlement_config(target: str | None = None) -> dict:
    from platform_env import guild_name_prefix, host_for, normalize_target, player_account_prefix

    path = CONFIG_FILE if CONFIG_FILE.is_file() else EXAMPLE_FILE
    data: dict = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except (OSError, json.JSONDecodeError):
            data = {}
    ch = load_channel_web_config()
    key = normalize_target(target)
    by_target = data.get("byTarget") if isinstance(data.get("byTarget"), dict) else {}
    overlay = by_target.get(key) if isinstance(by_target.get(key), dict) else {}
    merged = dict(data)
    merged.update(overlay)

    default_host = host_for(key)
    # 指定 target / 有 byTarget 时优先平台域名，避免误用龙翔 baseUrl
    if target is not None or overlay:
        base = str(merged.get("baseUrl") or default_host).rstrip("/")
    else:
        base = str(merged.get("baseUrl") or ch.get("baseUrl") or default_host).rstrip("/")
    state = str(merged.get("adminStorageState") or "").strip()
    if not state:
        state = str(DATA_DIR / f"admin_storage_state_{key}.json") if key != "lx" else str(ADMIN_STATE_FILE)
    game_id_raw = merged.get("gameId")
    try:
        game_id = int(game_id_raw) if game_id_raw not in (None, "") else (659 if key == "lx" else 0)
    except (TypeError, ValueError):
        game_id = 659 if key == "lx" else 0
    try:
        promote_id = int(merged.get("promoteId") or (29720 if key == "lx" else 0))
    except (TypeError, ValueError):
        promote_id = 29720 if key == "lx" else 0
    return {
        "baseUrl": base,
        "origin": str(merged.get("origin") or base),
        "adminUser": str(merged.get("adminUser") or data.get("adminUser") or "admin"),
        "adminPassword": str(merged.get("adminPassword") or data.get("adminPassword") or "123456"),
        "guildAccount": str(merged.get("guildAccount") or ("测试分佣会长2" if key == "lx" else "")),
        "guildAccountPrefix": str(merged.get("guildAccountPrefix") or guild_name_prefix(key)),
        "guildLoginPassword": str(
            merged.get("guildLoginPassword") or ch.get("newPassword") or "CHANGE_ME"
        ),
        "guildWithdrawPassword": str(merged.get("guildWithdrawPassword") or "111111"),
        "promoteId": promote_id,
        "gameId": game_id,
        "playerAccountPrefix": str(merged.get("playerAccountPrefix") or player_account_prefix(key)),
        "serverId": str(merged.get("serverId") or ""),
        "serverName": str(merged.get("serverName") or ""),
        "target": key,
        "headless": bool(merged.get("headless", data.get("headless", True))),
        "browserChannel": str(merged.get("browserChannel") or data.get("browserChannel") or "chrome"),
        "adminStorageState": state,
        # 汇玩总后台入口在 /yuzhou/public/login.html，其它平台仍是 /admin/public/login.html
        "adminLoginPath": str(
            merged.get("adminLoginPath")
            or ("/yuzhou/public/login.html" if key == "hw" else "/admin/public/login.html")
        ),
    }


def default_promote(target: str | None = None) -> tuple[int, str]:
    cfg = load_settlement_config(target=target)
    return int(cfg.get("promoteId") or 0), str(cfg.get("guildAccount") or "")


def default_game_id(target: str | None = None) -> int:
    cfg = load_settlement_config(target=target)
    gid = int(cfg.get("gameId") or 0)
    if gid:
        return gid
    return 659 if str(cfg.get("target") or "lx") == "lx" else 339


def _sql(sql: str, params=(), *, source_db: str = "lx") -> list[dict]:
    from smoke_db import execute_select, load_db_config, resolve_database

    cfg = dict(load_db_config())
    cfg["database"] = resolve_database(source_db, cfg)
    return execute_select(sql, cfg=cfg, params=params)


def lookup_pending_period(promote_id: int | str, *, source_db: str = "lx") -> dict:
    rows = _sql(
        """
        SELECT id, promote_id, promote_account, confirm_status, promoter_earn, create_time
        FROM tab_promote_settlement_period
        WHERE promote_id=%s AND confirm_status=0
        ORDER BY id DESC LIMIT 1
        """,
        (int(promote_id),),
        source_db=source_db,
    )
    return rows[0] if rows else {}


def lookup_latest_period(promote_id: int | str, *, source_db: str = "lx") -> dict:
    rows = _sql(
        """
        SELECT id, promote_id, confirm_status, promoter_earn
        FROM tab_promote_settlement_period
        WHERE promote_id=%s
        ORDER BY id DESC LIMIT 1
        """,
        (int(promote_id),),
        source_db=source_db,
    )
    return rows[0] if rows else {}


def lookup_pending_withdraw(promote_id: int | str, *, source_db: str = "lx") -> dict:
    rows = _sql(
        """
        SELECT id, promote_id, sum_money, status, payment_money
        FROM tab_promote_withdraw
        WHERE promote_id=%s AND status=0
        ORDER BY id DESC LIMIT 1
        """,
        (int(promote_id),),
        source_db=source_db,
    )
    return rows[0] if rows else {}


def tamper_withdraw_sum_money(
    withdraw_id: int | str,
    *,
    new_amount: float | str = 2,
    source_db: str = "lx",
) -> dict:
    """测「资金核对详情 / 申请金额核验不通过」：提现单落库后立刻改 sum_money。

    正常提现申请 1 元，改成 2 后，总后台核对快照会与申请金额不一致。
    只用 id/sum_money/status，避免依赖库表里未必存在的单号字段。
    """
    from smoke_db import execute_write, load_db_config, resolve_database

    try:
        wid = int(withdraw_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": f"无效 withdrawId={withdraw_id}"}
    try:
        amt = f"{float(new_amount):.2f}"
    except (TypeError, ValueError):
        return {"ok": False, "error": f"无效金额={new_amount}"}

    try:
        before = _sql(
            "SELECT id, sum_money, status FROM tab_promote_withdraw WHERE id=%s LIMIT 1",
            (wid,),
            source_db=source_db,
        )
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"读提现单失败: {exc}", "withdrawId": wid}
    if not before:
        return {"ok": False, "error": f"提现单不存在 id={wid}"}
    old = before[0].get("sum_money")
    cfg = dict(load_db_config())
    cfg["database"] = resolve_database(source_db, cfg)
    try:
        n = execute_write(
            "UPDATE tab_promote_withdraw SET sum_money=%s WHERE id=%s",
            cfg=cfg,
            params=(amt, wid),
        )
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"改 sum_money 失败: {exc}", "withdrawId": wid}

    try:
        after = _sql(
            "SELECT id, sum_money FROM tab_promote_withdraw WHERE id=%s LIMIT 1",
            (wid,),
            source_db=source_db,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": f"改后回读失败: {exc}",
            "withdrawId": wid,
            "metrics": {"withdrawId": wid, "withdrawAmountOriginal": old},
        }
    new_val = (after or [{}])[0].get("sum_money")
    return {
        "ok": True,
        "detail": f"withdrawId={wid} sum_money {old}→{new_val}（测核验不通过）",
        "rows": n,
        "metrics": {
            "withdrawId": wid,
            "withdrawAmountOriginal": old,
            "withdrawAmountTampered": new_val,
        },
    }


def lookup_balance_profit(promote_id: int | str, *, source_db: str = "lx") -> float:
    rows = _sql(
        "SELECT balance_profit FROM tab_promote WHERE id=%s LIMIT 1",
        (int(promote_id),),
        source_db=source_db,
    )
    if not rows:
        return 0.0
    return float(rows[0].get("balance_profit") or 0)


def _browser_kwargs(cfg: dict) -> dict[str, Any]:
    channel = str(cfg.get("browserChannel") or "chrome").strip() or None
    kwargs: dict[str, Any] = {"headless": bool(cfg.get("headless", True))}
    if channel:
        kwargs["channel"] = channel
    return kwargs


def _add_cookies(context, base: str, cookies: dict) -> None:
    items = []
    for name, value in (cookies or {}).items():
        if not name or value is None:
            continue
        items.append({"name": str(name), "value": str(value), "url": base})
    if items:
        context.add_cookies(items)


def _guild_post_form(
    *,
    path: str,
    form: dict,
    referer: str,
    cookies: dict,
    cfg: dict,
) -> tuple[int, Any]:
    """会长端表单提交（已实机验收）；PW 不可用时的稳定回退。"""
    base = cfg["baseUrl"]
    ch_cfg = load_channel_web_config()
    opener, _ = _opener()
    extra = {"Cookie": _cookie_header(cookies)}
    code, payload, _snap = _post_form(
        opener,
        f"{base}{path}",
        form,
        referer=referer,
        cfg=ch_cfg,
        extra_headers=extra,
    )
    return code, payload


def admin_state_path(cfg: dict | None = None) -> Path:
    cfg = cfg or load_settlement_config()
    raw = str(cfg.get("adminStorageState") or ADMIN_STATE_FILE).strip()
    path = Path(raw)
    if not path.is_absolute():
        # 相对路径一律落到仓库 data/，避免 cwd=workbench 时写到 workbench/data
        path = (DATA_DIR / path.name) if path.name else ADMIN_STATE_FILE
    return path


def save_admin_storage_state(*, timeout_ms: int = 180000, cfg: dict | None = None) -> dict:
    """有头打开登录页：人工过图形验证后保存 storage_state，供 S7/S10/S11 复用。"""
    from playwright.sync_api import sync_playwright

    cfg = cfg or load_settlement_config()
    base = cfg["baseUrl"]
    login_path = str(cfg.get("adminLoginPath") or "/admin/public/login.html").strip() or "/admin/public/login.html"
    if not login_path.startswith("/"):
        login_path = "/" + login_path
    state = admin_state_path(cfg)
    state.parent.mkdir(parents=True, exist_ok=True)
    kwargs = _browser_kwargs({**cfg, "headless": False})
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(**kwargs)
        except Exception:
            kwargs.pop("channel", None)
            browser = p.chromium.launch(**kwargs)
        try:
            context = browser.new_context()
            page = context.new_page()
            page.goto(f"{base}{login_path}", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1200)
            if page.locator("#input_username").count():
                page.fill("#input_username", cfg["adminUser"])
                page.fill("#input_password", cfg["adminPassword"])
            # 汇玩登录成功可能仍落在 /admin/index，也可能经 yuzhou 跳转；统一等 URL 离开 login
            try:
                page.wait_for_url("**/admin/index/**", timeout=min(15000, timeout_ms))
            except Exception:  # noqa: BLE001
                page.wait_for_function(
                    "() => !String(location.href || '').toLowerCase().includes('login')",
                    timeout=timeout_ms,
                )
            context.storage_state(path=str(state))
            return {"ok": True, "path": str(state).replace("\\", "/"), "url": page.url}
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "error": f"保存总后台登录态失败: {exc}",
                "hint": "请在弹出的浏览器完成图形验证并进入后台首页",
            }
        finally:
            browser.close()


def _admin_session_ok(page, base: str) -> bool:
    page.goto(f"{base}/promote/settlement/promote_settlement.html", wait_until="domcontentloaded", timeout=45000)
    url = (page.url or "").lower()
    return "login" not in url and "页面不存在" not in (page.content() or "")[:200]


def _shot_page(page, shot_dir: str | Path | None, name: str) -> list[dict]:
    """Playwright 步骤截图；失败不抛，返回 [{name, path, url}]。"""
    if not shot_dir or page is None:
        return []
    try:
        out_dir = Path(shot_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(name or "shot"))[:48]
        file_name = f"{safe}.png"
        path = out_dir / file_name
        page.screenshot(path=str(path), full_page=True, timeout=15000)
        return [{"name": safe, "file": file_name, "path": str(path).replace("\\", "/")}]
    except Exception:  # noqa: BLE001
        return []


def _open_admin_context(p, cfg: dict, *, enable_trace: bool = False):
    """优先用已保存登录态；没有则返回明确错误（需图形验证，不能空头硬登）。

    返回 (browser, context, page, err, tracing_started)。
    """
    state = admin_state_path(cfg)
    kwargs = _browser_kwargs(cfg)
    try:
        browser = p.chromium.launch(**kwargs)
    except Exception:
        kwargs.pop("channel", None)
        browser = p.chromium.launch(**kwargs)
    if state.is_file():
        context = browser.new_context(storage_state=str(state))
        page = context.new_page()
        if _admin_session_ok(page, cfg["baseUrl"]):
            tracing = False
            if enable_trace:
                try:
                    context.tracing.start(screenshots=True, snapshots=True, sources=False)
                    tracing = True
                except Exception:  # noqa: BLE001
                    tracing = False
            return browser, context, page, "", tracing
        context.close()
    browser.close()
    return (
        None,
        None,
        None,
        "总后台需要图形验证，自动化不能空跑 dologin。"
        "你浏览器里登录是正常的；请先运行："
        f"python money_settlement_pw.py --save-admin --target {cfg.get('target') or 'lx'}"
        f"（会弹出浏览器，过验证后写入 {state.name}）",
        False,
    )


def _close_admin(browser, context, *, tracing: bool, ok: bool, trace_path: str | Path | None) -> list[dict]:
    """关闭浏览器；失败时落盘 Playwright trace.zip。"""
    traces: list[dict] = []
    try:
        if tracing and context is not None:
            if not ok and trace_path:
                out = Path(trace_path)
                out.parent.mkdir(parents=True, exist_ok=True)
                try:
                    context.tracing.stop(path=str(out))
                    traces.append(
                        {
                            "name": out.stem,
                            "file": out.name,
                            "path": out.as_posix(),
                        }
                    )
                except Exception:  # noqa: BLE001
                    try:
                        context.tracing.stop()
                    except Exception:  # noqa: BLE001
                        pass
            else:
                try:
                    context.tracing.stop()
                except Exception:  # noqa: BLE001
                    pass
    finally:
        try:
            if browser is not None:
                browser.close()
        except Exception:  # noqa: BLE001
            pass
    return traces


def s7_generate_settlement(
    *,
    settlement_row_id: int | str,
    promote_id: int | str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
    shot_dir: str | Path | None = None,
    trace_path: str | Path | None = None,
) -> dict:
    """S7 渠道结算 generatesettlementall（须总后台会话）。"""
    from playwright.sync_api import sync_playwright

    cfg = cfg or load_settlement_config(target=source_db)
    sid = str(settlement_row_id or "").strip()
    if not sid:
        return {"ok": False, "error": "缺少 settlementRowId"}
    base = cfg["baseUrl"]
    before = lookup_latest_period(promote_id, source_db=source_db) if promote_id else {}
    with sync_playwright() as p:
        browser, context, page, err, tracing = _open_admin_context(p, cfg, enable_trace=bool(trace_path))
        if err or page is None:
            return {
                "ok": False,
                "error": err or "无总后台会话",
                "assertions": [
                    {
                        "name": "总后台已登录",
                        "expected": "存在有效 admin_storage_state.json",
                        "actual": err or "无会话",
                        "passed": False,
                    }
                ],
            }
        shots: list[dict] = []
        try:
            url = f"{base}/promote/settlement/generatesettlementall.html?id={sid}&is_bind=1"
            resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            http_status = resp.status if resp else 0
            shots.extend(_shot_page(page, shot_dir, "S7_generatesettlementall"))
            try:
                page.goto(
                    f"{base}/promote/settlement/promote_settlement.html",
                    wait_until="domcontentloaded",
                    timeout=45000,
                )
                shots.extend(_shot_page(page, shot_dir, "S7_settlement_list"))
            except Exception:  # noqa: BLE001
                pass
            after = lookup_latest_period(promote_id, source_db=source_db) if promote_id else {}
            page_url = page.url or ""
            ok = "login" not in page_url.lower() and http_status < 400 and bool(after)
            traces = _close_admin(browser, context, tracing=tracing, ok=ok, trace_path=trace_path)
            return {
                "ok": ok,
                "detail": f"settlementRowId={sid} periodId={after.get('id')}",
                "metrics": {"settlementRowId": sid, "periodId": after.get("id")},
                "httpStatus": http_status,
                "period": after,
                "screenshots": shots,
                "traces": traces,
                "assertions": [
                    {
                        "name": "结算请求未掉登录",
                        "expected": "非 login 页",
                        "actual": page_url,
                        "passed": "login" not in page_url.lower(),
                    },
                    {
                        "name": "出现结算期",
                        "expected": "tab_promote_settlement_period 有记录",
                        "actual": str(after.get("id") or ""),
                        "passed": bool(after),
                    },
                ],
                "error": "" if ok else "渠道结算后未看到结算期（或仍停在登录）",
            }
        except Exception:
            _close_admin(browser, context, tracing=tracing, ok=False, trace_path=trace_path)
            raise


def s8_confirm_period(
    *,
    promote_id: int | str,
    period_id: int | str | None = None,
    guild_account: str | None = None,
    guild_password: str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
) -> dict:
    """S8 会长确认 do_confirm → balance_profit（实机已通：会长 Cookie + 表单）。"""
    from platform_env import with_platform_host

    cfg = cfg or load_settlement_config(target=source_db)
    base = cfg["baseUrl"]
    account = str(guild_account or cfg["guildAccount"])
    password = str(guild_password or cfg["guildLoginPassword"])
    pid = int(promote_id)
    if period_id:
        rows = _sql(
            "SELECT id, confirm_status, promoter_earn FROM tab_promote_settlement_period WHERE id=%s LIMIT 1",
            (int(period_id),),
            source_db=source_db,
        )
        period = rows[0] if rows else {"id": int(period_id)}
    else:
        period = lookup_pending_period(pid, source_db=source_db)
    if not period or not period.get("id"):
        return {"ok": False, "error": f"无待确认结算期 promote_id={pid}（需先完成 S7）"}

    period_id_i = int(period["id"])
    bal_before = lookup_balance_profit(pid, source_db=source_db)

    ch_cfg = with_platform_host(load_channel_web_config(), source_db)
    ch_cfg["baseUrl"] = base
    ch_cfg["origin"] = str(cfg.get("origin") or base)
    login = channel_login(account, password, cfg=ch_cfg)
    if not login.get("ok"):
        return {"ok": False, "error": login.get("error") or "会长登录失败", "login": login}

    _code, payload = _guild_post_form(
        path="/channelsite/settlement/do_confirm.html",
        form={"id": str(period_id_i)},
        referer=f"{base}/tg/settlement/period.html",
        cookies=login.get("cookies") or {},
        cfg=cfg,
    )
    ok_biz = _biz_ok(payload) or ("成功" in str((payload or {}).get("msg") or ""))
    rows = _sql(
        "SELECT id, confirm_status FROM tab_promote_settlement_period WHERE id=%s",
        (period_id_i,),
        source_db=source_db,
    )
    confirmed = rows and int(rows[0].get("confirm_status") or 0) == 1
    bal_after = lookup_balance_profit(pid, source_db=source_db)
    ok = bool(ok_biz and confirmed)
    return {
        "ok": ok,
        "detail": f"periodId={period_id_i} confirm={confirmed} balance {bal_before}->{bal_after}",
        "metrics": {"periodId": period_id_i, "balanceProfit": bal_after},
        "response": payload,
        "assertions": [
            {
                "name": "确认接口成功",
                "expected": "code 成功 / msg 含成功",
                "actual": str(payload),
                "passed": bool(ok_biz),
            },
            {
                "name": "结算期已确认",
                "expected": "confirm_status=1",
                "actual": str((rows or [{}])[0].get("confirm_status")),
                "passed": bool(confirmed),
            },
        ],
        "error": "" if ok else f"确认失败: {payload}",
    }


def ensure_guild_contract_ready(
    *,
    promote_id: int | str,
    promote_account: str,
    source_db: str = "lx",
) -> dict:
    """测环境补签约：无 tab_promote_contract / 未过审时写入 contract_status=2，并补 agreement_auth。"""
    import time

    from smoke_db import _connect, load_db_config, resolve_database

    pid = int(promote_id)
    account = str(promote_account or "").strip()
    cfg = load_db_config()
    db = resolve_database(source_db, cfg)
    conn = _connect(cfg, source_db=source_db)
    branched: list[str] = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account, agreement_auth FROM `{db}`.tab_promote WHERE id=%s LIMIT 1",
                (pid,),
            )
            promo = cur.fetchone() or {}
            if not promo:
                return {"ok": False, "error": f"会长不存在 promote_id={pid}", "branch": branched}
            if not account:
                account = str(promo.get("account") or "")
            if not str(promo.get("agreement_auth") or "").strip():
                auth = (
                    "IP：127.0.0.1  确认协议授权时间："
                    + datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    + "（主链补签）"
                )
                cur.execute(
                    f"UPDATE `{db}`.tab_promote SET agreement_auth=%s WHERE id=%s",
                    (auth, pid),
                )
                branched.append("agreement_auth")

            cur.execute(
                f"""
                SELECT id, contract_status, is_sign
                FROM `{db}`.tab_promote_contract
                WHERE promote_id=%s
                ORDER BY id DESC LIMIT 1
                """,
                (pid,),
            )
            row = cur.fetchone()
            if row and int(row.get("contract_status") or 0) == 2:
                return {"ok": True, "branched": bool(branched), "branch": branched, "contractId": row.get("id")}

            # 找一条同库模板（实名/证件路径），没有则用配置默认
            cur.execute(
                f"""
                SELECT username, id_card_no, mobile, id_card_upload_front, id_card_upload_back
                FROM `{db}`.tab_promote_contract
                WHERE contract_status=2
                ORDER BY id DESC LIMIT 1
                """
            )
            tmpl = cur.fetchone() or {}
            from channel_web_api import load_channel_web_config

            ch = load_channel_web_config()
            defaults = ch.get("profileDefaults") if isinstance(ch.get("profileDefaults"), dict) else {}
            username = str(tmpl.get("username") or defaults.get("real_name") or "测试实名")
            id_no = str(tmpl.get("id_card_no") or defaults.get("id_card_no") or "110101199001011234")
            mobile = str(tmpl.get("mobile") or defaults.get("mobile_phone") or "13800138000")
            front = str(tmpl.get("id_card_upload_front") or ch.get("idCardFront") or "")
            back = str(tmpl.get("id_card_upload_back") or ch.get("idCardBack") or "")
            now = int(time.time())
            if row:
                cur.execute(
                    f"UPDATE `{db}`.tab_promote_contract SET contract_status=2, status=1 WHERE id=%s",
                    (int(row["id"]),),
                )
                branched.append("contract_status_fix")
                cid = row["id"]
            else:
                cur.execute(
                    f"""
                    INSERT INTO `{db}`.tab_promote_contract
                    (promote_id, promote_account, contract_status, contract_time, type, company_name,
                     company_id_type, company_id_no, username, id_card_no, mobile, is_been_cooperated,
                     is_quit_staff, contract_url, is_reject, reject_reason, create_time, status, remark,
                     update_time, contract_id, document_id, is_sign, template_data_info,
                     id_card_upload_front, id_card_upload_back, reject_times, initiate_contract_times)
                    VALUES
                    (%s,%s,2,0,1,'',1,'',%s,%s,%s,0,0,'',0,'',%s,1,'',0,%s,%s,0,'',%s,%s,0,1)
                    """,
                    (
                        pid,
                        account,
                        username,
                        id_no,
                        mobile,
                        now,
                        f"{source_db}-auto-{pid}",
                        f"{source_db}-doc-{pid}",
                        front,
                        back,
                    ),
                )
                branched.append("contract_insert")
                cid = cur.lastrowid
            return {"ok": True, "branched": True, "branch": branched, "contractId": cid}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"补签约失败: {exc}", "branch": branched}
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def s9_guild_withdraw(
    *,
    promote_id: int | str,
    amount: str | float | None = None,
    guild_account: str | None = None,
    guild_login_password: str | None = None,
    withdraw_password: str | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
    tamper_sum_money: float | str | bool | None = None,
) -> dict:
    """S9 会长提现 withdrawal（实机已通）。

    tamper_sum_money: 提现请求执行后、单据一落库就立刻改 sum_money（不等「提现成功」判定）。
    True / \"1\" → 改成 2；传数字则改成该值。用于测资金核验不通过。
    """
    import time

    from channel_web_api import channel_set_second_pwd
    from platform_env import with_platform_host

    cfg = cfg or load_settlement_config(target=source_db)
    base = cfg["baseUrl"]
    account = str(guild_account or cfg["guildAccount"])
    login_pwd = str(guild_login_password or cfg["guildLoginPassword"])
    tx_pwd = str(withdraw_password or cfg["guildWithdrawPassword"])
    pid = int(promote_id)
    bal = lookup_balance_profit(pid, source_db=source_db)
    if bal <= 0:
        return {"ok": False, "error": f"可提现佣金不足 balance_profit={bal}"}
    try:
        want = float(amount) if amount is not None and str(amount).strip() != "" else min(float(bal), 1.0)
    except (TypeError, ValueError):
        want = min(float(bal), 1.0)
    # 新会长首跑余额常 < 1（如 0.73），按可提余额封顶，避免「游戏佣金不足」
    amt = f"{min(float(want), float(bal)):.2f}"

    # 游趣等新会长常缺签约/二级密码：提现前自动补齐
    ready = ensure_guild_contract_ready(promote_id=pid, promote_account=account, source_db=source_db)
    if not ready.get("ok"):
        return {"ok": False, "error": ready.get("error") or "会长签约未就绪", "seed": ready}

    ch_cfg = with_platform_host(load_channel_web_config(), source_db)
    ch_cfg["baseUrl"] = base
    ch_cfg["origin"] = str(cfg.get("origin") or base)
    login = channel_login(account, login_pwd, cfg=ch_cfg)
    if login.get("ok"):
        channel_set_second_pwd(session_cookies=login.get("cookies") or {}, second_pwd=tx_pwd, cfg=ch_cfg)
    if not login.get("ok"):
        return {"ok": False, "error": login.get("error") or "会长登录失败"}

    # 1) 发起提现
    _code, payload = _guild_post_form(
        path="/channelsite/settlement/withdrawal.html",
        form={
            "balance_type": "balance_profit",
            "amount": amt,
            "password": tx_pwd,
            "type": "1",
        },
        referer=f"{base}/tg/settlement/profit.html",
        cookies=login.get("cookies") or {},
        cfg=cfg,
    )
    ok_biz = _biz_ok(payload) or ("成功" in str((payload or {}).get("msg") or ""))

    # 2) 提现一执行完就找最新待审单（短轮询，不等业务断言）
    wd: dict = {}
    for _ in range(10):
        wd = lookup_pending_withdraw(pid, source_db=source_db) or {}
        if wd.get("id"):
            break
        time.sleep(0.2)

    metrics: dict[str, Any] = {"withdrawId": wd.get("id"), "withdrawAmount": amt}
    detail = f"amount={amt} withdrawId={wd.get('id')}"
    assertions = [
        {
            "name": "提现提交成功",
            "expected": "成功",
            "actual": str(payload),
            "passed": bool(ok_biz),
        },
        {
            "name": "待审提现单",
            "expected": "tab_promote_withdraw status=0",
            "actual": str(wd.get("id") or ""),
            "passed": bool(wd.get("id")),
        },
    ]

    # 3) 单据出现后立刻改库（不依赖 ok_biz；测核验不通过要抢在审核/快照前）
    want_tamper = tamper_sum_money not in (None, False, "", 0, "0")
    if want_tamper and wd.get("id"):
        if tamper_sum_money is True or str(tamper_sum_money).strip().lower() in {"1", "true", "yes", "on"}:
            new_amt: float | str = 2
        else:
            new_amt = tamper_sum_money
        try:
            tamper = tamper_withdraw_sum_money(wd.get("id"), new_amount=new_amt, source_db=source_db)
        except Exception as exc:  # noqa: BLE001
            tamper = {"ok": False, "error": str(exc)}
        assertions.append(
            {
                "name": "提现执行后立刻改 sum_money（测核验不通过）",
                "expected": f"sum_money={new_amt}",
                "actual": tamper.get("detail") or tamper.get("error") or "",
                "passed": bool(tamper.get("ok")),
            }
        )
        if tamper.get("ok"):
            metrics.update(tamper.get("metrics") or {})
            detail = f"{detail} · {tamper.get('detail')}"
        else:
            detail = f"{detail} · 篡改失败: {tamper.get('error')}"
            metrics["withdrawTamperError"] = tamper.get("error")
    elif want_tamper and not wd.get("id"):
        assertions.append(
            {
                "name": "提现执行后立刻改 sum_money（测核验不通过）",
                "expected": "有待审提现单可改",
                "actual": "未查到提现单，无法改金额",
                "passed": False,
            }
        )
        detail = f"{detail} · 篡改跳过：无提现单"
        metrics["withdrawTamperError"] = "无提现单"

    ok = bool(ok_biz and wd.get("id"))
    return {
        "ok": ok,
        "detail": detail,
        "metrics": metrics,
        "response": payload,
        "assertions": assertions,
        "error": "" if ok else f"提现失败: {payload}",
    }


def s10_approve_withdraw(
    *,
    withdraw_id: int | str,
    cfg: dict | None = None,
    shot_dir: str | Path | None = None,
    trace_path: str | Path | None = None,
) -> dict:
    """S10 收益提现-通过 changestatus/status/1。"""
    from playwright.sync_api import sync_playwright

    cfg = cfg or load_settlement_config()
    wid = str(withdraw_id or "").strip()
    if not wid:
        return {"ok": False, "error": "缺少 withdrawId"}
    base = cfg["baseUrl"]
    with sync_playwright() as p:
        browser, context, page, err, tracing = _open_admin_context(p, cfg, enable_trace=bool(trace_path))
        if err or page is None:
            return {"ok": False, "error": err or "无总后台会话（请先在对应平台保存总后台登录态）"}
        shots: list[dict] = []
        try:
            page.goto(f"{base}/promote/settlement/promote_withdraw.html", wait_until="domcontentloaded", timeout=60000)
            shots.extend(_shot_page(page, shot_dir, "S10_withdraw_before"))
            result = page.request.post(
                f"{base}/promote/settlement/changestatus/status/1.html",
                form={"ids[]": wid},
                headers={
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": f"{base}/promote/settlement/promote_withdraw.html",
                },
            )
            text = result.text()
            try:
                payload = json.loads(text) if text else {}
            except json.JSONDecodeError:
                payload = {"raw": text[:300]}
            ok_biz = _biz_ok(payload) or ("成功" in str((payload or {}).get("msg") or ""))
            page.reload(wait_until="domcontentloaded", timeout=45000)
            shots.extend(_shot_page(page, shot_dir, "S10_withdraw_after"))
            ok = bool(ok_biz)
            traces = _close_admin(browser, context, tracing=tracing, ok=ok, trace_path=trace_path)
            return {
                "ok": ok,
                "detail": f"withdrawId={wid}",
                "metrics": {"withdrawId": wid},
                "response": payload,
                "screenshots": shots,
                "traces": traces,
                "assertions": [
                    {
                        "name": "审核通过",
                        "expected": "成功",
                        "actual": str(payload),
                        "passed": ok,
                    }
                ],
                "error": "" if ok else f"审核失败: {payload}",
            }
        except Exception:
            _close_admin(browser, context, tracing=tracing, ok=False, trace_path=trace_path)
            raise


def s11_paid_withdraw(
    *,
    withdraw_id: int | str,
    promote_id: int | str,
    payment_money: str | float | None = None,
    cfg: dict | None = None,
    source_db: str = "lx",
    shot_dir: str | Path | None = None,
    trace_path: str | Path | None = None,
) -> dict:
    """S11 打款 paid（需 enablePayout）。"""
    from playwright.sync_api import sync_playwright

    cfg = cfg or load_settlement_config(target=source_db)
    wid = str(withdraw_id or "").strip()
    pid = str(promote_id or "").strip()
    if not wid or not pid:
        return {"ok": False, "error": "缺少 withdrawId / promoteId"}
    money = payment_money
    if money is None:
        rows = _sql(
            "SELECT sum_money, payment_money FROM tab_promote_withdraw WHERE id=%s LIMIT 1",
            (int(wid),),
            source_db=source_db,
        )
        money = (rows[0].get("payment_money") or rows[0].get("sum_money")) if rows else "0"
    base = cfg["baseUrl"]
    with sync_playwright() as p:
        browser, context, page, err, tracing = _open_admin_context(p, cfg, enable_trace=bool(trace_path))
        if err or page is None:
            return {"ok": False, "error": err or "无总后台会话（请先在对应平台保存总后台登录态）"}
        shots: list[dict] = []
        try:
            page.goto(f"{base}/promote/settlement/promote_withdraw.html", wait_until="domcontentloaded", timeout=60000)
            shots.extend(_shot_page(page, shot_dir, "S11_withdraw_before"))
            page.request.post(
                f"{base}/promote/settlement/get_promote_payment_info.html",
                form={"promote_id": pid},
                headers={
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": f"{base}/promote/settlement/promote_withdraw.html",
                },
            )
            result = page.request.post(
                f"{base}/promote/settlement/paid.html",
                form={
                    "ids": wid,
                    "payment_type": "1",
                    "payment_money": str(money),
                    "promote_id": pid,
                    "zfb_shanghu": "",
                    "wx_shanghu": "",
                    "choose_type": "2",
                },
                headers={
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": f"{base}/promote/settlement/promote_withdraw.html",
                },
            )
            text = result.text()
            try:
                payload = json.loads(text) if text else {}
            except json.JSONDecodeError:
                payload = {"raw": text[:300]}
            ok_biz = _biz_ok(payload) or ("成功" in str((payload or {}).get("msg") or ""))
            window_reject = payout_window_reject(payload)
            in_window = payout_window_open()
            if window_reject:
                ok_biz = False
            if in_window:
                passed = bool(ok_biz)
                assert_name = "打款时段内成功"
                expected = "14:00–20:00 内打款成功"
                error = "" if passed else f"打款时段内未成功: {payload}"
            else:
                passed = window_reject
                assert_name = "打款时段外拒绝"
                expected = f"14:00 前或 20:00 后返回「{PAYOUT_WINDOW_MSG}」"
                error = "" if passed else f"非打款时段，但不是时段拒绝: {payload}"
            page.reload(wait_until="domcontentloaded", timeout=45000)
            shots.extend(_shot_page(page, shot_dir, "S11_withdraw_after"))
            clock = datetime.now().strftime("%H:%M")
            result = {
                "ok": passed,
                "detail": f"withdrawId={wid} payment_money={money}；本地 {clock} {'在' if in_window else '不在'}打款时段",
                "response": payload,
                "screenshots": shots,
                "assertions": [
                    {
                        "name": assert_name,
                        "expected": expected,
                        "actual": str(payload),
                        "passed": passed,
                    }
                ],
                "error": error,
            }
            result["traces"] = _close_admin(browser, context, tracing=tracing, ok=bool(result.get("ok")), trace_path=trace_path)
            return result
        except Exception:
            _close_admin(browser, context, tracing=tracing, ok=False, trace_path=trace_path)
            raise


if __name__ == "__main__":
    import sys

    if "--save-admin" in sys.argv:
        target = "lx"
        if "--target" in sys.argv:
            i = sys.argv.index("--target")
            if i + 1 < len(sys.argv):
                target = sys.argv[i + 1]
        cfg = load_settlement_config(target=target)
        print(f"打开总后台登录页：{cfg.get('baseUrl')} （target={target}）")
        print(json.dumps(save_admin_storage_state(cfg=cfg), ensure_ascii=False, indent=2))
    else:
        print("用法: python money_settlement_pw.py --save-admin [--target yq]")
