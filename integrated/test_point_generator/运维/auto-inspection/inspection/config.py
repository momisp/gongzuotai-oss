"""加载 config.yaml + .env"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


@dataclass
class AccountCfg:
    name: str
    access_key_id: str
    access_key_secret: str
    regions: list[str]


@dataclass
class AppConfig:
    schedule_daily_times: list[str]
    accounts: list[AccountCfg]
    ecs_enabled: bool
    instance_name_filters: list[str]
    cms_enabled: bool
    cpu_warn: float
    cpu_critical: float
    memory_warn: float
    memory_critical: float
    disk_warn: float
    expire_warn_days: int
    expire_critical_days: int
    dingtalk_on_every_run: bool
    dingtalk_only_on_risk: bool
    ecs_report_scope: str
    ecs_application_group_hint: str
    raw: dict


def _env_or_raise(key: str) -> str:
    v = (os.environ.get(key) or "").strip()
    if not v:
        raise ValueError(f"环境变量未设置: {key}")
    return v


def load_config(path: Path | str) -> AppConfig:
    path = Path(path).resolve()
    if load_dotenv:
        load_dotenv(path.parent / ".env")
        load_dotenv()

    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    schedule = raw.get("schedule") or {}
    daily = schedule.get("daily_times") or ["09:00"]

    accounts: list[AccountCfg] = []
    for a in raw.get("accounts") or []:
        ak_id_env = a.get("access_key_id_env") or "ALIBABA_CLOUD_ACCESS_KEY_ID"
        ak_sec_env = a.get("access_key_secret_env") or "ALIBABA_CLOUD_ACCESS_KEY_SECRET"
        accounts.append(
            AccountCfg(
                name=a.get("name") or "default",
                access_key_id=_env_or_raise(ak_id_env),
                access_key_secret=_env_or_raise(ak_sec_env),
                regions=list(a.get("regions") or ["cn-hangzhou"]),
            )
        )

    if not accounts:
        raise ValueError("config.yaml 中 accounts 至少配置一个账号")

    ecs = raw.get("ecs") or {}
    cms = raw.get("cloud_monitor") or {}
    risk = raw.get("risk") or {}
    notify = raw.get("notify") or {}

    return AppConfig(
        schedule_daily_times=[str(x) for x in daily],
        accounts=accounts,
        ecs_enabled=bool(ecs.get("enabled", True)),
        instance_name_filters=list(ecs.get("instance_name_filters") or []),
        cms_enabled=bool(cms.get("enabled", True)),
        cpu_warn=float(cms.get("cpu_warn", 85)),
        cpu_critical=float(cms.get("cpu_critical", 95)),
        memory_warn=float(cms.get("memory_warn", 80)),
        memory_critical=float(cms.get("memory_critical", 90)),
        disk_warn=float(cms.get("disk_warn", 90)),
        expire_warn_days=int(risk.get("expire_warn_days", 30)),
        expire_critical_days=int(risk.get("expire_critical_days", 7)),
        dingtalk_on_every_run=bool(notify.get("dingtalk_on_every_run", True)),
        dingtalk_only_on_risk=bool(notify.get("dingtalk_only_on_risk", False)),
        ecs_report_scope=str(ecs.get("report_scope") or "").strip(),
        ecs_application_group_hint=str(ecs.get("application_group_hint") or "").strip(),
        raw=raw,
    )
