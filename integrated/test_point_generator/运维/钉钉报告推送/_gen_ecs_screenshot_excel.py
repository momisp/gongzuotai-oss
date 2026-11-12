# -*- coding: utf-8 -*-
"""一次性：根据云监控截图巡检数据生成 ECS 巡检 Excel。"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

SCRIPT_DIR = Path(__file__).resolve().parent


def main() -> Path:
    # 固定文件名，便于直接在资源管理器里打开（内容更新时覆盖）
    fp = SCRIPT_DIR / "ECS_CloudMonitor_Report.xlsx"

    wb = Workbook()
    s0 = wb.active
    s0.title = "巡检摘要"
    s0["A1"], s0["B1"] = "报告标题", "阿里云 ECS 应用分组巡检（控制台截图）"
    s0["A2"], s0["B2"] = "应用分组", "大派对--ffe8(244715179)"
    s0["A3"], s0["B3"] = "数据来源", "云监控 组内资源 列表（截图快照）"
    s0["A4"], s0["B4"] = "生成时间", datetime.now(timezone.utc).astimezone().strftime(
        "%Y-%m-%d %H:%M:%S %z"
    )
    for addr in ("A1", "A2", "A3", "A4"):
        s0[addr].font = Font(bold=True)

    s1 = wb.create_sheet("ECS组内资源", 1)
    headers = [
        "实例名称",
        "实例ID",
        "地域",
        "公网_IP摘要",
        "CPU使用率%",
        "内存使用率%",
        "磁盘使用率%",
        "状态",
        "运维备注",
    ]
    s1.append(headers)
    for cell in s1[1]:
        cell.font = Font(bold=True)

    rows = [
        [
            "大派对2-空间",
            "i-bp15jolsb5ak0u61501a",
            "华东1（杭州）",
            "120.26.205.129,172...",
            0.43,
            45.07,
            29.04,
            "运行中",
            "",
        ],
        [
            "盲盒小程序",
            "i-bp1b5af7hm8ctqz6r3so",
            "华东1（杭州）",
            "47.110.65.24,172...",
            0.58,
            9.64,
            32.33,
            "运行中",
            "",
        ],
        [
            "大派对1-空间",
            "i-bp15jolsb5ak0u615019",
            "华东1（杭州）",
            "112.124.61.23,172...",
            0.84,
            89.88,
            59.21,
            "运行中",
            "内存约89.88%，建议排查告警与扩容",
        ],
        [
            "大派对",
            "i-bp1bmc1pzoftostgjj3za",
            "华东1（杭州）",
            "121.41.93.28,172...",
            2.3,
            26.54,
            32.94,
            "运行中",
            "",
        ],
    ]
    for r in rows:
        s1.append(r)

    warn_fill = PatternFill("solid", fgColor="FFFCE4D6")
    for row in range(2, s1.max_row + 1):
        mem = s1.cell(row=row, column=6).value
        try:
            if float(mem) >= 85:
                for c in range(1, 10):
                    s1.cell(row=row, column=c).fill = warn_fill
        except (TypeError, ValueError):
            pass

    cols = [18, 22, 14, 28, 12, 12, 12, 10, 36]
    for i, w in enumerate(cols, start=1):
        s1.column_dimensions[get_column_letter(i)].width = w

    wb.save(fp)
    return fp


if __name__ == "__main__":
    saved = main()
    print(saved)
