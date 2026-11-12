"""数据验证 · 直连数据库（接通 smoke_db）。"""
from __future__ import annotations

from smoke_db import DbNotConfiguredError, execute_select as _smoke_select, load_db_config, ping_db


def execute_select(conn_config: dict | None, sql: str):
    """
    按 conn_config 或 data/smoke_db_config.json 执行只读 SELECT。
    conn_config 若含 host/user/database，优先用请求体；否则读本地测试库配置。
    """
    cfg = None
    if isinstance(conn_config, dict) and conn_config.get("host") and conn_config.get("database"):
        cfg = {
            "driver": conn_config.get("driver") or "mysql",
            "host": conn_config.get("host"),
            "port": int(conn_config.get("port") or 3306),
            "user": conn_config.get("user") or "",
            "password": conn_config.get("password") or "",
            "database": conn_config.get("database") or "",
            "charset": conn_config.get("charset") or "utf8mb4",
            "connectTimeoutSec": int(conn_config.get("connectTimeoutSec") or 8),
        }
    else:
        # 无请求体连接信息时，走冒烟测试库配置
        load_db_config()
    return _smoke_select(sql, cfg=cfg)


__all__ = ["DbNotConfiguredError", "execute_select", "ping_db", "load_db_config"]
