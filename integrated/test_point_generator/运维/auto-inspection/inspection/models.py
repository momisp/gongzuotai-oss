"""数据模型：单条巡检发现 + 整次运行摘要"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class Level(str, Enum):
    OK = "ok"
    INFO = "info"
    WARN = "warn"
    CRITICAL = "critical"


@dataclass
class Finding:
    account: str
    region: str
    category: str  # ecs / cms / config
    name: str
    resource_id: str
    level: Level
    summary: str
    annotation: str
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def is_risk(self) -> bool:
        return self.level in (Level.WARN, Level.CRITICAL)


@dataclass
class RunSummary:
    started_at: datetime
    finished_at: datetime | None = None
    findings: list[Finding] = field(default_factory=list)
    dashboard: dict[str, Any] | None = None

    def by_level(self) -> dict[Level, list[Finding]]:
        m: dict[Level, list[Finding]] = {Level.OK: [], Level.INFO: [], Level.WARN: [], Level.CRITICAL: []}
        for f in self.findings:
            m.setdefault(f.level, []).append(f)
        return m

    @property
    def has_risk(self) -> bool:
        return any(f.is_risk for f in self.findings)
