"""单次巡检编排"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from inspection.aliyun_ecs import run_ecs_checks
from inspection.config import AppConfig, load_config
from inspection.ecs_dashboard import merge_ecs_dashboard, run_live_dashboard_for_account
from inspection.dingtalk import load_webhook_from_env, send_markdown, sign_webhook_url
from inspection.models import RunSummary
from inspection.report import build_markdown, maybe_truncate, save_markdown


def run_inspection(cfg: AppConfig) -> tuple[RunSummary, list[dict]]:
    """返回 (摘要, ECS dashboard 分段列表)。"""

    started = datetime.now(timezone.utc)
    findings: list = []
    dashboard_slices: list[dict] = []

    for acct in cfg.accounts:
        if cfg.ecs_enabled:
            ecs_findings, ids_by_region, snapshots = run_ecs_checks(
                acct,
                cfg.instance_name_filters,
                cfg.expire_warn_days,
                cfg.expire_critical_days,
            )
            findings.extend(ecs_findings)

            if cfg.cms_enabled and snapshots:
                util_findings, chunk = run_live_dashboard_for_account(acct, snapshots, cfg)
                findings.extend(util_findings)
                if chunk:
                    dashboard_slices.append(chunk)

    dashboard_final = None
    if dashboard_slices:
        dashboard_final = merge_ecs_dashboard(
            dashboard_slices,
            cfg,
            inspector=os.environ.get("OPS_INSPECTOR", ""),
            report_title="",
        )

    summary = RunSummary(
        started_at=started,
        finished_at=datetime.now(timezone.utc),
        findings=findings,
        dashboard=dashboard_final,
    )
    return summary, dashboard_slices


def _should_send_dingtalk(cfg: AppConfig, has_risk: bool, no_dingtalk: bool) -> bool:
    if no_dingtalk:
        return False
    if cfg.dingtalk_only_on_risk:
        return has_risk
    if cfg.dingtalk_on_every_run:
        return True
    return has_risk


def main() -> int:
    parser = argparse.ArgumentParser(description="阿里云 ECS/云监控 自动巡检")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "config.yaml",
    )
    parser.add_argument("--title", default="", help="钉钉/报告标题")
    parser.add_argument("--out", type=Path, help="保存 Markdown 报告路径（默认 logs/）")
    parser.add_argument("--no-dingtalk", action="store_true", help="不推钉钉，仅本地报告")
    parser.add_argument(
        "--dashboard-json",
        type=Path,
        help="将 ECS 结构化巡检结果（简报+实例表）写入 JSON，便于 Electron / send_ops_report 汇总",
    )
    args = parser.parse_args()

    if not args.config.is_file():
        print(
            f"找不到配置文件: {args.config}（可先复制 config.example.yaml 为 config.yaml）",
            flush=True,
        )
        return 2

    cfg = load_config(args.config)
    summary, _slices_unused = run_inspection(cfg)

    dashboard_for_title = summary.dashboard if summary.dashboard else {}
    ding_title_fallback = dashboard_for_title.get("meta", {}).get("reportFullTitle", "").strip()

    title = (
        args.title.strip()
        or ding_title_fallback
        or f"自动巡检报告_{summary.started_at.astimezone().strftime('%Y%m%d_%H%M')}"
    )

    if summary.dashboard and isinstance(summary.dashboard, dict):
        summary.dashboard.setdefault("meta", {})
        summary.dashboard["meta"]["reportFullTitle"] = title

    md = build_markdown(summary, title)

    log_dir = Path(__file__).resolve().parent.parent / "logs"
    out = args.out
    if out is None:
        out = log_dir / f"report_{summary.started_at.astimezone().strftime('%Y%m%d_%H%M%S')}.md"
    save_markdown(str(out), md)
    print(f"报告已写入: {out}", flush=True)

    if args.dashboard_json and summary.dashboard:
        dj = Path(args.dashboard_json).expanduser().resolve()
        dj.parent.mkdir(parents=True, exist_ok=True)
        dj.write_text(json.dumps(summary.dashboard, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Dashboard JSON 已写入: {dj}", flush=True)

    send = _should_send_dingtalk(cfg, summary.has_risk, args.no_dingtalk)
    if send:
        hook, sec = load_webhook_from_env()
        if not hook:
            print("未设置 DINGTALK_WEBHOOK，跳过钉钉推送", flush=True)
        else:
            try:
                url = sign_webhook_url(hook, sec)
                ding_body = ""
                if summary.dashboard and isinstance(summary.dashboard, dict):
                    ding_body = (
                        summary.dashboard.get("dingTalkBriefText") or ""
                    ).strip()
                md_send = ding_body if ding_body else maybe_truncate(md)
                send_markdown(url, title, md_send)
                print("已推送到钉钉", flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"钉钉推送失败: {e}", flush=True)
    else:
        if not args.no_dingtalk and not summary.has_risk:
            print("配置为仅风险时推送且本次无风险项，未发钉钉。", flush=True)

    return 1 if summary.has_risk else 0


if __name__ == "__main__":
    raise SystemExit(main())
