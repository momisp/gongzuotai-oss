"""巡检报告 Markdown + 自动批注聚合"""
from __future__ import annotations

from datetime import datetime, timezone

from inspection.models import Finding, Level, RunSummary


def _lvl_zh(lv: Level) -> str:
    return {
        Level.OK: "正常",
        Level.INFO: "提示",
        Level.WARN: "预警",
        Level.CRITICAL: "严重",
    }.get(lv, str(lv))


def build_markdown(summary: RunSummary, title: str) -> str:
    lines: list[str] = []
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %z")

    lines.append(f"# {title}")
    lines.append(f"**巡检时间**：{now}")
    lines.append("")

    risks = [f for f in summary.findings if f.is_risk]
    if risks:
        lines.append("## 风险与预警汇总")
        lines.append("")
        for f in risks:
            lines.append(f"- **【{_lvl_zh(f.level)}】** {f.account}/{f.region} **{f.name}** — {f.summary}")
            lines.append(f"  - {f.annotation}")
        lines.append("")
    else:
        lines.append("## 风险与预警汇总")
        lines.append("")
        lines.append("本次未发现达到预警级别的项（仍请查看下方明细）。")
        lines.append("")

    lines.append("## 全量明细（含自动批注）")
    lines.append("")
    for f in summary.findings:
        lines.append(f"### {f.category.upper()} · {f.name}")
        lines.append(f"- **级别**：{_lvl_zh(f.level)}")
        lines.append(f"- **账号/地域**：{f.account} / {f.region}")
        lines.append(f"- **资源 ID**：`{f.resource_id}`")
        lines.append(f"- **摘要**：{f.summary}")
        lines.append(f"- **运维批注**：{f.annotation}")
        lines.append("")

    return "\n".join(lines)


def maybe_truncate(text: str, max_len: int = 18000) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 120] + "\n\n…（正文过长已截断）"


def save_markdown(path: str, content: str) -> None:
    from pathlib import Path

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
