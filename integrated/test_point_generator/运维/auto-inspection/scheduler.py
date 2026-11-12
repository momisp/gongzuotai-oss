#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按 config.yaml 里的 schedule.daily_times 常驻定时巡检（阻塞进程）。

用法（在项目 auto-inspection 目录下）：
  pip install -r requirements.txt
  copy config.example.yaml config.yaml
  copy env.example .env  # 填写 AK 与钉钉

  python scheduler.py
  python scheduler.py --config my.yaml

也可交给操作系统定时任务调用单次巡检：
  python -m inspection.runner --config config.yaml
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import yaml
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


def _load_times(config_path: Path) -> list[tuple[int, int]]:
    if load_dotenv:
        load_dotenv(config_path.parent / ".env")
        load_dotenv()
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    schedule = raw.get("schedule") or {}
    daily = schedule.get("daily_times") or ["09:00"]
    out: list[tuple[int, int]] = []
    for t in daily:
        parts = str(t).strip().split(":")
        if len(parts) != 2:
            continue
        out.append((int(parts[0]), int(parts[1])))
    return out or [(9, 0)]


def _run_once(config_path: Path) -> None:
    root = config_path.parent.resolve()
    cmd = [
        sys.executable,
        "-m",
        "inspection.runner",
        "--config",
        str(config_path.resolve()),
    ]
    subprocess.run(cmd, cwd=str(root), check=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="自动巡检定时调度")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).resolve().parent / "config.yaml",
    )
    args = parser.parse_args()
    if not args.config.is_file():
        print(f"找不到配置文件: {args.config}", flush=True)
        return 2

    times = _load_times(args.config)
    print(f"已加载定时时刻: {times}（本地时区）", flush=True)

    sched = BlockingScheduler()
    for hour, minute in times:
        sched.add_job(
            _run_once,
            CronTrigger(hour=hour, minute=minute),
            args=[args.config],
            id=f"inspect_{hour:02d}_{minute:02d}",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

    print("调度器已启动，Ctrl+C 退出。", flush=True)
    try:
        sched.start()
    except (KeyboardInterrupt, SystemExit):
        print("已停止。", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
