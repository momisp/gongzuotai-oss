# -*- coding: utf-8 -*-
"""新商务冒烟 · 测试库连接 / 只读查询 / 造数骨架。

用法：
1. 复制 data/smoke_db_config.example.json → data/smoke_db_config.json 并填写测试库
2. pip install pymysql（MySQL）或对应驱动
3. 调用 ping_db / execute_select / seed_smoke_metrics（造数 SQL 待业务表确认后补）

注意：只连测试库；造数默认打 smoke_ 前缀标记，便于清理。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_FILE = DATA_DIR / "smoke_db_config.json"
EXAMPLE_FILE = DATA_DIR / "smoke_db_config.example.json"


class DbNotConfiguredError(RuntimeError):
    pass


def _jsonable(obj: Any) -> Any:
    """把 pymysql 的 Decimal/datetime 等转成 JSON 可序列化类型。"""
    from datetime import date, datetime, timedelta
    from decimal import Decimal

    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, Decimal):
        # 金额保留小数；整数型 Decimal 也转 float 够用
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat(sep=" ", timespec="seconds")
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, timedelta):
        return obj.total_seconds()
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_jsonable(v) for v in obj]
    return str(obj)


def load_db_config() -> dict:
    path = CONFIG_FILE if CONFIG_FILE.is_file() else None
    if not path:
        raise DbNotConfiguredError(
            f"未找到 {CONFIG_FILE.name}。请复制 {EXAMPLE_FILE.name} 为 smoke_db_config.json 并填写测试库。"
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DbNotConfiguredError(f"读取数据库配置失败: {exc}") from exc
    if not isinstance(data, dict):
        raise DbNotConfiguredError("数据库配置格式错误")
    host = str(data.get("host") or "").strip()
    if not host or "x.x" in host or str(data.get("password") or "").strip() in {"", "******", "*"}:
        raise DbNotConfiguredError("请先填写真实的测试库 host/账号密码（勿用示例占位）")
    return data


def resolve_database(source_db: str | None = None, cfg: dict | None = None) -> str:
    """sdkSourceDb（lx/yq/hw）→ 实际库名 game_lx/game_yq/game_hw。"""
    cfg = cfg or load_db_config()
    mapping = cfg.get("sourceDbMap") if isinstance(cfg.get("sourceDbMap"), dict) else {
        "lx": "game_lx",
        "yq": "game_yq",
        "hw": "game_hw",
    }
    key = str(source_db or "").strip().lower()
    if key in mapping:
        return str(mapping[key])
    if key.startswith("game_"):
        return key
    return str(cfg.get("database") or "game_lx")


def _connect(cfg: dict | None = None, source_db: str | None = None):
    cfg = dict(cfg or load_db_config())
    if source_db:
        cfg["database"] = resolve_database(source_db, cfg)
    driver = str(cfg.get("driver") or "mysql").lower()
    if driver != "mysql":
        raise DbNotConfiguredError(f"暂只实现 mysql，收到 driver={driver}")
    try:
        import pymysql  # type: ignore
    except ImportError as exc:
        raise DbNotConfiguredError("缺少 pymysql，请先: pip install pymysql") from exc
    return pymysql.connect(
        host=str(cfg.get("host")),
        port=int(cfg.get("port") or 3306),
        user=str(cfg.get("user") or ""),
        password=str(cfg.get("password") or ""),
        database=str(cfg.get("database") or ""),
        charset=str(cfg.get("charset") or "utf8mb4"),
        connect_timeout=int(cfg.get("connectTimeoutSec") or 8),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def ping_db(cfg: dict | None = None) -> dict:
    try:
        conn = _connect(cfg)
    except DbNotConfiguredError as exc:
        return {"ok": False, "configured": False, "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "configured": True, "error": str(exc)}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone() or {}
        return {
                "ok": True,
                "configured": True,
                "result": _jsonable(row),
            }
    except Exception as exc:
        return {"ok": False, "configured": True, "error": str(exc)}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def execute_select(sql: str, cfg: dict | None = None, params: tuple | list | None = None) -> list[dict]:
    text = str(sql or "").strip().rstrip(";")
    if not text:
        raise ValueError("SQL 为空")
    # 只允许读；造数走 seed_* 专用函数
    low = text.lower()
    if not low.startswith("select") and not low.startswith("show") and not low.startswith("desc"):
        raise ValueError("execute_select 仅允许 SELECT/SHOW/DESC")
    conn = _connect(cfg)
    try:
        with conn.cursor() as cur:
            cur.execute(text, params or ())
            rows = cur.fetchall() or []
        return [_jsonable(dict(r)) for r in rows]
    finally:
        conn.close()


def is_sw6(name: str | None) -> bool:
    text = str(name or "").strip().lower()
    return text == "sw6" or text.endswith(".sw6") or text.startswith("sw6.")


def execute_write(sql: str, cfg: dict | None = None, params: tuple | list | None = None) -> int:
    """内部写库（造数）。禁止无 where 的 delete/update 大范围语句（简单防护）。sw6 只读。"""
    text = str(sql or "").strip().rstrip(";")
    low = text.lower()
    if low.startswith("drop") or low.startswith("truncate") or low.startswith("alter"):
        raise ValueError("禁止 DDL")
    if (low.startswith("delete") or low.startswith("update")) and "where" not in low:
        raise ValueError("DELETE/UPDATE 必须带 WHERE")
    cfg = dict(cfg or load_db_config())
    if is_sw6(cfg.get("database")) or "sw6." in low or "`sw6`" in low:
        raise ValueError("sw6 只允许查询，禁止改数据")
    conn = _connect(cfg)
    try:
        with conn.cursor() as cur:
            n = cur.execute(text, params or ())
        return int(n or 0)
    finally:
        conn.close()


def query_promote_metrics(
    sdk_account: str,
    source_db: str = "lx",
    cfg: dict | None = None,
) -> dict:
    """按渠道商务账号粗算今日注册/活跃/充值（口径待产品确认后再锁死）。"""
    account = str(sdk_account or "").strip()
    if not account:
        return {"ok": False, "error": "缺少 sdkAccount"}
    db = resolve_database(source_db, cfg)
    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account, nickname, status, level FROM `{db}`.tab_promote_business WHERE account=%s LIMIT 1",
                (account,),
            )
            biz = cur.fetchone()
            if not biz:
                return {"ok": False, "error": f"{db} 未找到商务账号: {account}", "database": db}
            pid = biz["id"]
            cur.execute(
                f"SELECT COUNT(*) AS c FROM `{db}`.tab_user WHERE promote_id=%s AND DATE(register_time)=CURDATE()",
                (pid,),
            )
            today_reg = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                f"SELECT COUNT(DISTINCT user_id) AS c FROM `{db}`.tab_user_day_login WHERE promote_id=%s AND DATE(login_time)=CURDATE()",
                (pid,),
            )
            today_active = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                f"""
                SELECT COALESCE(SUM(pay_amount),0) AS amt, COUNT(*) AS cnt
                FROM `{db}`.tab_spend_bind
                WHERE promote_id=%s AND pay_status=1 AND DATE(pay_time)=CURDATE()
                """,
                (pid,),
            )
            pay = cur.fetchone() or {}
            today_pay = float(pay.get("amt") or 0)
            pay_cnt = int(pay.get("cnt") or 0)
            cur.execute(f"SELECT COUNT(*) AS c FROM `{db}`.tab_user WHERE promote_id=%s", (pid,))
            total_users = int((cur.fetchone() or {}).get("c") or 0)
        return {
            "ok": True,
            "database": db,
            "sourceDb": source_db,
            "promote": _jsonable(dict(biz)),
            "metrics": {
                "todayReg": today_reg,
                "todayActive": today_active,
                "todayPay": today_pay,
                "todayPayOrders": pay_cnt,
                "totalUsers": total_users,
            },
            "note": "活跃=tab_user_day_login 去重；充值=tab_spend_bind(pay_status=1)。最终口径需与后台一致后再用于冒烟断言。",
        }
    finally:
        conn.close()


def trust_business_device(
    account: str,
    device_id: str,
    *,
    source_db: str = "lx",
    login_ip: str = "127.0.0.1",
    cfg: dict | None = None,
) -> dict:
    """主流程临时绕过：向 tab_promote_business_login_record 登记设备码，跳过商务短信验证。

    商务端 needverifycode 以该表 user_agent 字段存 deviceId；老账号有记录可免验，
    新 OA 造出的商务没有记录仍会要验证码。正式补业务前用直插库跳过。
    """
    account = str(account or "").strip()
    device_id = str(device_id or "").strip()
    if not account or not device_id:
        return {"ok": False, "error": "缺少 account 或 device_id"}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    db = resolve_database(source_db, cfg)
    import time

    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account FROM `{db}`.tab_promote_business WHERE account=%s LIMIT 1",
                (account,),
            )
            biz = cur.fetchone()
            if not biz:
                return {"ok": False, "error": f"{db} 未找到商务账号: {account}", "database": db}
            business_id = int(biz["id"])
            cur.execute(
                f"""
                SELECT id FROM `{db}`.tab_promote_business_login_record
                WHERE business_id=%s AND user_agent=%s
                ORDER BY id DESC LIMIT 1
                """,
                (business_id, device_id),
            )
            existed = cur.fetchone()
            if existed:
                return {
                    "ok": True,
                    "skipped": True,
                    "database": db,
                    "businessId": business_id,
                    "deviceId": device_id,
                    "recordId": existed["id"],
                    "note": "设备码已登记，无需重复插入",
                }
            now_ts = int(time.time())
            cur.execute(
                f"""
                INSERT INTO `{db}`.tab_promote_business_login_record
                (business_id, login_time, login_ip, user_agent)
                VALUES (%s, %s, %s, %s)
                """,
                (business_id, now_ts, str(login_ip or "127.0.0.1"), device_id),
            )
            return {
                "ok": True,
                "skipped": False,
                "database": db,
                "businessId": business_id,
                "deviceId": device_id,
                "recordId": cur.lastrowid,
                "loginTime": now_ts,
                "note": "已写入登录设备记录，F2-1 可免短信验证码",
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def trust_promote_device(
    account: str,
    device_id: str,
    *,
    source_db: str = "lx",
    login_ip: str = "127.0.0.1",
    cfg: dict | None = None,
) -> dict:
    """主流程临时绕过：向 tab_promote_login_record 登记设备码，跳过会长登录短信。

    渠道站 needverifycode 以该表 user_agent 存 deviceId；库写入的二/三级会长无记录会要短信。
    """
    account = str(account or "").strip()
    device_id = str(device_id or "").strip()
    if not account or not device_id:
        return {"ok": False, "error": "缺少 account 或 device_id"}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    db = resolve_database(source_db, cfg)
    import time

    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account FROM `{db}`.tab_promote WHERE account=%s LIMIT 1",
                (account,),
            )
            row = cur.fetchone()
            if not row:
                return {"ok": False, "error": f"{db} 未找到会长账号: {account}", "database": db}
            promote_id = int(row["id"])
            cur.execute(
                f"""
                SELECT id FROM `{db}`.tab_promote_login_record
                WHERE promote_id=%s AND user_agent=%s
                ORDER BY id DESC LIMIT 1
                """,
                (promote_id, device_id),
            )
            existed = cur.fetchone()
            if existed:
                return {
                    "ok": True,
                    "skipped": True,
                    "database": db,
                    "promoteId": promote_id,
                    "deviceId": device_id,
                    "recordId": existed["id"],
                    "note": "会长设备码已登记，无需重复插入",
                }
            now_ts = int(time.time())
            cur.execute(
                f"""
                INSERT INTO `{db}`.tab_promote_login_record
                (promote_id, login_time, login_ip, user_agent)
                VALUES (%s, %s, %s, %s)
                """,
                (promote_id, now_ts, str(login_ip or "127.0.0.1"), device_id),
            )
            return {
                "ok": True,
                "skipped": False,
                "database": db,
                "promoteId": promote_id,
                "deviceId": device_id,
                "recordId": cur.lastrowid,
                "loginTime": now_ts,
                "note": "已写入会长登录设备记录，可免短信验证码",
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def lookup_latest_spend(
    user_account: str,
    *,
    source_db: str = "lx",
    cfg: dict | None = None,
) -> dict:
    """查 tab_spend 最新一单（对齐 Apifox）。"""
    account = str(user_account or "").strip()
    if not account:
        return {"ok": False, "error": "缺少 user_account"}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    db = resolve_database(source_db, cfg)
    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, pay_order_number, pay_config_id, pay_amount, pay_status, user_account
                FROM `{db}`.tab_spend
                WHERE user_account=%s
                ORDER BY id DESC
                LIMIT 1
                """,
                (account,),
            )
            row = cur.fetchone()
            if not row:
                return {"ok": False, "error": f"{db}.tab_spend 无该账号订单: {account}", "database": db}
            return {
                "ok": True,
                "database": db,
                "outTradeNo": row.get("pay_order_number"),
                "payConfigId": row.get("pay_config_id"),
                "realAmount": float(row.get("pay_amount") or 0),
                "payStatus": row.get("pay_status"),
                "row": _jsonable(dict(row)),
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def lookup_promote_id(account: str, *, source_db: str = "lx", cfg: dict | None = None) -> dict:
    """按会长账号查 tab_promote.id。"""
    account = str(account or "").strip()
    if not account:
        return {"ok": False, "error": "缺少会长账号"}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    db = resolve_database(source_db, cfg)
    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account, status, real_name FROM `{db}`.tab_promote WHERE account=%s LIMIT 1",
                (account,),
            )
            row = cur.fetchone()
            if not row:
                return {"ok": False, "error": f"{db} 未找到会长: {account}", "database": db}
            return {
                "ok": True,
                "database": db,
                "promoteId": int(row["id"]),
                "account": row.get("account"),
                "status": row.get("status"),
                "realName": row.get("real_name"),
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def lookup_promote_account(promote_id: int | str, *, source_db: str = "lx", cfg: dict | None = None) -> dict:
    """按会长 id 查 tab_promote.account。"""
    try:
        pid = int(promote_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": f"无效 promote_id: {promote_id}"}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    db = resolve_database(source_db, cfg)
    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account, status FROM `{db}`.tab_promote WHERE id=%s LIMIT 1",
                (pid,),
            )
            row = cur.fetchone()
            if not row:
                return {"ok": False, "error": f"{db} 未找到会长 id: {pid}", "database": db}
            return {
                "ok": True,
                "database": db,
                "promoteId": int(row["id"]),
                "account": row.get("account"),
                "status": row.get("status"),
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def seed_promote_profile(
    account: str,
    profile: dict,
    *,
    source_db: str = "lx",
    id_card_front: str = "",
    id_card_back: str = "",
    cfg: dict | None = None,
) -> dict:
    """主流程临时绕过：直写 tab_promote 完善信息字段，跳过第三方实名认证。

    接口 updateinfo 会调实名核验；测试假身份证会「实名认证失败」。
    正式补业务前用库写入完善信息字段，并把 status 置 0 以便后续能登录/申请游戏。
    这不等于 OA 审核通过：F4 仍须调 tabPromote/changeStatus。
    勿置 1：OA 对非待审态调审核可能报「审核推广员错误」。
    """
    account = str(account or "").strip()
    profile = profile if isinstance(profile, dict) else {}
    if not account:
        return {"ok": False, "error": "缺少会长账号"}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    db = resolve_database(source_db, cfg)
    from datetime import datetime

    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, account, status FROM `{db}`.tab_promote WHERE account=%s LIMIT 1",
                (account,),
            )
            row = cur.fetchone()
            if not row:
                return {"ok": False, "error": f"{db} 未找到会长账号: {account}", "database": db}
            promote_id = int(row["id"])
            real_name = str(profile.get("real_name") or "").strip()
            id_card_no = str(profile.get("id_card_no") or "").strip()
            mobile = str(profile.get("mobile_phone") or "").strip()
            if not real_name or not id_card_no:
                return {"ok": False, "error": "完善信息缺少 real_name / id_card_no"}
            front = str(id_card_front or profile.get("id_card_front") or "").strip()
            back = str(id_card_back or profile.get("id_card_back") or "").strip()
            auth = f"IP：127.0.0.1  确认协议授权时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}（主流程库写入跳过实名）"
            cur.execute(
                f"""
                UPDATE `{db}`.tab_promote
                SET real_name=%s,
                    id_card_no=%s,
                    mobile_phone=%s,
                    address=%s,
                    email=%s,
                    alipay_name=%s,
                    alipay_account=%s,
                    settment_type=%s,
                    register_type=%s,
                    id_card_front=%s,
                    id_card_back=%s,
                    status=0,
                    agreement_auth=%s
                WHERE id=%s
                """,
                (
                    real_name,
                    id_card_no,
                    mobile,
                    str(profile.get("address") or ""),
                    str(profile.get("email") or ""),
                    str(profile.get("alipay_name") or real_name),
                    str(profile.get("alipay_account") or mobile),
                    str(profile.get("settment_type") if profile.get("settment_type") is not None else "1"),
                    int(profile.get("register_type") if str(profile.get("register_type") or "").strip() != "" else 0),
                    front,
                    back,
                    auth,
                    promote_id,
                ),
            )
            return {
                "ok": True,
                "database": db,
                "promoteId": promote_id,
                "account": account,
                "status": 0,
                "note": "已库写入完善信息并置 status=0（不等于 OA 审核，F4 仍须 changeStatus）",
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def seed_child_promote(
    parent_account: str,
    *,
    child_account: str,
    child_password: str = "CHANGE_ME",
    promote_level: int = 2,
    mobile: str = "",
    source_db: str = "lx",
    cfg: dict | None = None,
) -> dict:
    """主流程临时绕过：直写 tab_promote 下级会长（发短信/add_chlid 不可用时）。

    密码哈希复用测库已验证样例：###f206… 对应明文 CHANGE_ME（不是 111111）。
    """
    import time

    parent_account = str(parent_account or "").strip()
    child_account = str(child_account or "").strip()
    promote_level = int(promote_level or 2)
    # 与下方哈希绑定的明文；调用方若传 111111 会自动纠正，避免登录「密码错误」
    known_plain = "CHANGE_ME"
    known_hash = "###f206bde5f3d9a56782a36a8dff05d851"
    child_password = str(child_password or known_plain).strip() or known_plain
    if child_password in {"111111", "123456"}:
        child_password = known_plain
    if promote_level not in (2, 3):
        return {"ok": False, "error": f"promote_level 仅支持 2/3，收到 {promote_level}"}
    if not parent_account or not child_account:
        return {"ok": False, "error": "缺少上级或下级会长账号"}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    db = resolve_database(source_db, cfg)
    pwd_hash = known_hash
    conn = _connect(cfg, source_db=source_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, account, parent_id, top_promote_id, promote_level, status
                FROM `{db}`.tab_promote WHERE account=%s LIMIT 1
                """,
                (parent_account,),
            )
            parent = cur.fetchone()
            if not parent:
                return {"ok": False, "error": f"{db} 未找到上级会长: {parent_account}", "database": db}
            parent_id = int(parent["id"])
            parent_level = int(parent.get("promote_level") or 1)
            expect_parent = promote_level - 1
            if parent_level != expect_parent:
                return {
                    "ok": False,
                    "error": f"上级 {parent_account} 是 {parent_level} 级，无法创建 {promote_level} 级",
                    "database": db,
                }
            top_id = int(parent.get("top_promote_id") or 0) or (
                parent_id if parent_level == 1 else int(parent.get("parent_id") or 0)
            )
            if parent_level == 1:
                top_id = parent_id
            cur.execute(
                f"SELECT id, account, promote_level FROM `{db}`.tab_promote WHERE account=%s LIMIT 1",
                (child_account,),
            )
            existed = cur.fetchone()
            if existed:
                # 已存在账号：同步纠正明文（哈希固定为 known_hash）
                return {
                    "ok": True,
                    "skipped": True,
                    "database": db,
                    "promoteId": int(existed["id"]),
                    "account": child_account,
                    "password": known_plain,
                    "promoteLevel": int(existed.get("promote_level") or promote_level),
                    "parentId": parent_id,
                    "note": f"下级账号已存在，跳过插入；登录密码按 {known_plain}",
                }
            now_ts = int(time.time())
            mobile = str(mobile or "").strip()
            cur.execute(
                f"""
                INSERT INTO `{db}`.tab_promote
                (account, password, mobile_phone, status, parent_id, parent_name,
                 promote_level, top_promote_id, create_time, update_time, register_type, settment_type)
                VALUES (%s, %s, %s, 1, %s, %s, %s, %s, %s, %s, 0, '1')
                """,
                (
                    child_account,
                    pwd_hash,
                    mobile,
                    parent_id,
                    parent_account,
                    promote_level,
                    top_id,
                    now_ts,
                    now_ts,
                ),
            )
            return {
                "ok": True,
                "skipped": False,
                "database": db,
                "promoteId": int(cur.lastrowid),
                "account": child_account,
                "password": known_plain,
                "promoteLevel": promote_level,
                "parentId": parent_id,
                "topPromoteId": top_id,
                "note": f"已库写入下级会长 status=1；初始密码 {known_plain}",
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": db}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def seed_smoke_metrics(payload: dict | None = None, cfg: dict | None = None) -> dict:
    """
    造数入口（半就绪）。
    已知表：tab_user / tab_user_day_login / tab_spend_bind / tab_promote_business
    正式 INSERT 需确认：必填字段、密码哈希、pay_status 枚举、是否还要写 login_record。
    """
    payload = payload or {}
    try:
        cfg = cfg or load_db_config()
    except DbNotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    source_db = str(payload.get("sourceDb") or payload.get("sdkSourceDb") or "lx")
    sdk_account = str(payload.get("sdkAccount") or "龙翔一级商务")
    try:
        current = query_promote_metrics(sdk_account, source_db=source_db, cfg=cfg)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": False,
        "pending": True,
        "error": "造数 INSERT 尚未落地（避免写坏测试库）。库已通，可先用 query_promote_metrics 对账。",
        "current": current,
        "received": {
            "sdkAccount": sdk_account,
            "sourceDb": source_db,
            "metrics": payload.get("metrics"),
        },
    }


def cleanup_smoke_seed(tag: str = "smoke_", cfg: dict | None = None) -> dict:
    """按约定标记清理造数（占位）。"""
    return {
        "ok": False,
        "pending": True,
        "error": f"清理逻辑待表结构确认后实现（计划按备注/前缀 {tag} 删除测试数据）",
    }
