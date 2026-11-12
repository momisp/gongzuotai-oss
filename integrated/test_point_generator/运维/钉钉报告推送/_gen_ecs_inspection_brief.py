# -*- coding: utf-8 -*-
"""生成图中《阿里云 ECS 应用分组巡检简报》样式的多 Sheet Excel。"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

SCRIPT_DIR = Path(__file__).resolve().parent


def main() -> Path:
    fp = SCRIPT_DIR / "ECS_应用分组巡检简报.xlsx"
    tz = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %z")

    wb = Workbook()

    # ---------- Sheet1：简报信息 + 整体结论 ----------
    s0 = wb.active
    s0.title = "封面与摘要"
    s0.merge_cells("A1:F1")
    title = s0.cell(1, 1)
    title.value = "阿里云 ECS · 应用分组巡检简报（基于控制台截图）"
    title.font = Font(size=14, bold=True)
    title.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    meta_rows = [
        ("巡检对象", '应用分组「大派对--ffe8(244715179)」| 华东1（杭州）'),
        ("数据说明", '控制台「组内资源」列表中的 CPU / 内存 / 磁盘使用率'),
        ("报告类型", "日检"),
        ("Excel 生成时间", tz),
    ]
    row = 2
    for lab, val in meta_rows:
        s0.cell(row, 1, lab).font = Font(bold=True)
        s0.cell(row, 2, val).alignment = Alignment(wrap_text=True, vertical="top")
        row += 1

    row += 1
    s0.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
    h1 = s0.cell(row, 1)
    h1.value = "一、整体结论"
    h1.font = Font(bold=True, size=12)
    row += 1

    conclusions = [
        "• 实例数量：4 台，控制台状态均为「运行中」。",
        "• 整体负载：CPU、磁盘多数处于偏低～中等水平。",
        "• 需关注：「大派对1-空间」（i-bp15jolsb5ak0u615019）内存使用率 89.88%，"
        "控制台为告警色条；建议在业务低峰排查进程 / JVM 堆 / 缓存与会话占用，必要时评估升配或限流扩容。",
        "• 结论摘要：有风险待跟进（主要来自单机内存偏高）。",
    ]
    for line in conclusions:
        s0.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
        c = s0.cell(row, 1)
        c.value = line
        c.alignment = Alignment(wrap_text=True, vertical="top")
        row += 1

    s0.column_dimensions["A"].width = 16
    s0.column_dimensions["B"].width = 58
    for col in range(3, 7):
        s0.column_dimensions[get_column_letter(col)].width = 4

    # ---------- Sheet2：组内 ECS 明细（Excel 表） ----------
    s1 = wb.create_sheet("组内ECS明细", 1)
    headers2 = ["实例名称", "实例 ID", "公网/IP 摘要", "CPU", "内存", "磁盘", "状态"]
    s1.append(headers2)
    for cell in s1[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    detail_rows = [
        ("大派对2-空间", "i-bp15jolsb5ak0u61501a", "120.26.205.129 ...", "0.43%", "45.07%", "29.04%", "运行中"),
        ("盲盒小程序", "i-bp1b5af7hm8ctqz6r3so", "47.110.65.24 ...", "0.58%", "9.64%", "32.33%", "运行中"),
        ("大派对1-空间", "i-bp15jolsb5ak0u615019", "112.124.61.23 ...", "0.84%", "89.88% ⚠", "59.21%", "运行中"),
        ("大派对", "i-bp1bmc1pzoftostgjj3za", "121.41.93.28 ...", "2.30%", "26.54%", "32.94%", "运行中"),
    ]
    for r in detail_rows:
        s1.append(list(r))

    warn_fill = PatternFill("solid", fgColor="FFFCE4D6")
    warn_font = Font(color="C00000", bold=True)
    for sheet_row in range(2, s1.max_row + 1):
        name = s1.cell(sheet_row, 1).value
        if name == "大派对1-空间":
            for col in range(1, 8):
                cell = s1.cell(sheet_row, col)
                cell.fill = warn_fill
            s1.cell(sheet_row, 5).font = warn_font

    widths2 = [16, 24, 22, 10, 12, 10, 10]
    for i, w in enumerate(widths2, start=1):
        s1.column_dimensions[get_column_letter(i)].width = w

    tab2 = Table(displayName="ECSGroupInstances", ref=f"A1:G{s1.max_row}")
    tab2.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium9",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    s1.add_table(tab2)

    # ---------- Sheet3：风险与运维建议 ----------
    s2 = wb.create_sheet("风险与运维建议", 2)
    s2.merge_cells("A1:E1")
    t3 = s2.cell(1, 1)
    t3.value = "三、风险与运维建议"
    t3.font = Font(bold=True, size=12)

    risks = [
        (
            "1",
            "关于 i-bp15jolsb5ak0u615019（大派对1-空间）— 内存 89.88%："
            "\n建议在云监控为该实例或分组配置/核对内存告警规则；"
            "在 SSH / 应用日志侧核对是否存在内存泄漏、大对象缓存未淘汰、连接池暴涨等。"
            "\n若为有状态服务：结合业务高峰期观察是否瞬时尖峰；若持续高位，优先考虑扩容内存或拆分实例负载。",
        ),
        (
            "2",
            "其余三台：当前截图指标未发现与「大派对1-空间」同等级别突出项；"
            "仍可例行关注磁盘持续增长与证书/到期类事项（截图未包含，需在其他清单核对）。",
        ),
    ]
    r = 3
    for num, body in risks:
        s2.cell(r, 1, num).font = Font(bold=True)
        s2.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
        c = s2.cell(r, 2)
        c.value = body
        c.alignment = Alignment(wrap_text=True, vertical="top")
        s2.row_dimensions[r].height = 72 if num == "1" else 48
        r += 1

    s2.column_dimensions["A"].width = 4
    s2.column_dimensions["B"].width = 72

    # ---------- Sheet4：按清单逐项备注（Excel 表） ----------
    s3 = wb.create_sheet("按清单逐项备注", 3)
    headers4 = ["资源/检查项", "结果", "运维建议"]
    s3.append(headers4)
    for cell in s3[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    checklist = [
        ("大派对2-空间", "CPU / 内存 / 磁盘均正常偏低～中等", "持续纳入例行监控即可"),
        ("盲盒小程序", "指标正常", "持续纳入例行监控即可"),
        ("大派对1-空间", "内存偏高（约 89.88%）", "排查内存占用与告警；评估升配或优化"),
        ("大派对（主）", "指标正常", "持续纳入例行监控即可"),
    ]
    for row in checklist:
        s3.append(list(row))

    for sheet_row in range(2, s3.max_row + 1):
        if s3.cell(sheet_row, 1).value == "大派对1-空间":
            for col in range(1, 4):
                cell = s3.cell(sheet_row, col)
                cell.fill = warn_fill
                if col != 3:
                    cell.font = Font(bold=True)

    for sheet_row in range(2, s3.max_row + 1):
        for col in range(1, 4):
            s3.cell(sheet_row, col).alignment = Alignment(wrap_text=True, vertical="top")

    s3.column_dimensions["A"].width = 18
    s3.column_dimensions["B"].width = 32
    s3.column_dimensions["C"].width = 42

    tab4 = Table(displayName="ChecklistRemarks", ref=f"A1:C{s3.max_row}")
    tab4.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium9",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    s3.add_table(tab4)

    wb.save(fp)
    return fp


if __name__ == "__main__":
    print(main())
