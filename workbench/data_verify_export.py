"""数据验证 Excel 导出：第 1 行字段名，第 2 行值/真公式；同组字段相邻并着色。"""
from __future__ import annotations

import re
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter


def _col_letter(idx: int) -> str:
    return get_column_letter(idx + 1)


def _parse_number(raw: Any) -> float | None:
    s = str(raw or "").strip()
    if not s:
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    s = s.replace(",", "").replace("，", "").replace("+", "").replace("%", "").strip()
    s = re.sub(r"[^\d.\-]", "", s)
    if not s or s in {"-", ".", "-."}:
        return None
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None


def _is_percent_format(fmt: str, formula: str, page_value: str) -> bool:
    f = str(fmt or "").lower()
    if "percent" in f or "百分" in f:
        return True
    if "%" in str(page_value or ""):
        return True
    if re.search(r"/\s*[\u4e00-\u9fffA-Za-z_]", str(formula or "")) and "环比" in str(formula or ""):
        return True
    return False


def _formula_to_excel(formula: str, name_to_col: dict[str, int]) -> str | None:
    """把「(今日-昨日)/昨日」转成 =(A2-B2)/B2；无法识别则返回 None。"""
    f = str(formula or "").strip()
    if not f:
        return None
    if f.startswith("="):
        body = f[1:]
    else:
        body = f
    names = sorted(name_to_col.keys(), key=len, reverse=True)
    out = body
    replaced = False
    for name in names:
        if not name or name not in out:
            continue
        cell = f"{_col_letter(name_to_col[name])}2"
        out = out.replace(name, cell)
        replaced = True
    out = out.replace("×", "*").replace("÷", "/").replace("（", "(").replace("）", ")")
    out = re.sub(r"\s+", "", out)
    if not replaced and not re.search(r"[A-Z]+\d+", out, re.I):
        return None
    if not out.startswith("="):
        out = "=" + out
    return out


_GROUP_FILLS = [
    PatternFill("solid", fgColor="D6EAF8"),
    PatternFill("solid", fgColor="D5F5E3"),
    PatternFill("solid", fgColor="FCF3CF"),
    PatternFill("solid", fgColor="F5D0FE"),
    PatternFill("solid", fgColor="FADBD8"),
]


def _group_fill(group_id: str, palette_idx: dict[str, int]) -> PatternFill | None:
    gid = str(group_id or "").strip()
    if not gid:
        return None
    if gid not in palette_idx:
        palette_idx[gid] = len(palette_idx) % len(_GROUP_FILLS)
    return _GROUP_FILLS[palette_idx[gid]]


def build_data_verify_xlsx(payload: dict) -> bytes:
    """
    payload:
      title, fields: [{name, source, formula, pageValue, dbValue, format, sql, note, groupId, groupLabel, page}]
    Sheet1「验证表」: 横向 字段名 / 页面显示值(或公式)
    Sheet2「字段明细」: 纵向，含分组列
    """
    title = str(payload.get("title") or "数据验证").strip() or "数据验证"
    fields = payload.get("fields") if isinstance(payload.get("fields"), list) else []
    clean = []
    for i, f in enumerate(fields):
        if not isinstance(f, dict):
            continue
        name = str(f.get("name") or "").strip()
        if not name:
            continue
        clean.append(
            {
                "idx": i + 1,
                "name": name,
                "page": str(f.get("page") or "").strip(),
                "source": str(f.get("source") or "").strip(),
                "formula": str(f.get("formula") or "").strip(),
                "pageValue": str(f.get("pageValue") or "").strip(),
                "dbValue": str(f.get("dbValue") or "").strip(),
                "format": str(f.get("format") or "number").strip(),
                "sql": str(f.get("sql") or "").strip(),
                "note": str(f.get("note") or "").strip(),
                "groupId": str(f.get("groupId") or "").strip(),
                "groupLabel": str(f.get("groupLabel") or "").strip(),
            }
        )

    wb = Workbook()
    ws = wb.active
    ws.title = "验证表"

    header_fill = PatternFill("solid", fgColor="1F4E79")
    header_font = Font(bold=True, color="FFFFFF")
    thin = Border(
        left=Side(style="thin", color="D0D7DE"),
        right=Side(style="thin", color="D0D7DE"),
        top=Side(style="thin", color="D0D7DE"),
        bottom=Side(style="thin", color="D0D7DE"),
    )
    thick = Side(style="medium", color="1F4E79")
    palette: dict[str, int] = {}

    name_to_col = {f["name"]: i for i, f in enumerate(clean)}

    # 第 1 行：字段名（同组着色）
    for i, f in enumerate(clean):
        cell = ws.cell(1, i + 1, f["name"])
        gfill = _group_fill(f["groupId"], palette)
        cell.fill = gfill or header_fill
        cell.font = header_font if not gfill else Font(bold=True, color="1F2933")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin
        ws.column_dimensions[_col_letter(i)].width = max(14, min(28, len(f["name"]) * 2 + 4))

    # 第 2 行：页面显示值 / 公式
    for i, f in enumerate(clean):
        excel_f = _formula_to_excel(f["formula"], name_to_col)
        cell = ws.cell(2, i + 1)
        cell.border = thin
        cell.alignment = Alignment(horizontal="center", vertical="center")
        gfill = _group_fill(f["groupId"], palette)
        if gfill:
            cell.fill = gfill
        is_pct = _is_percent_format(f["format"], f["formula"], f["pageValue"])
        if excel_f and f["formula"]:
            cell.value = excel_f
            if is_pct:
                cell.number_format = "0.00%"
        else:
            num = _parse_number(f["pageValue"])
            if num is not None and f["format"] not in {"text", "ranking"}:
                if is_pct and abs(num) > 1.5:
                    num = num / 100.0
                cell.value = num
                cell.number_format = "0.00%" if is_pct else "#,##0.##"
            else:
                cell.value = f["pageValue"] or ""

    label = ws.cell(3, 1, "（下行·数据库统计值，便于对照；同色列为同一指标卡组）")
    label.font = Font(italic=True, color="666666", size=9)
    if clean:
        ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=max(1, len(clean)))

    for i, f in enumerate(clean):
        cell = ws.cell(4, i + 1)
        cell.border = thin
        cell.alignment = Alignment(horizontal="center", vertical="center")
        gfill = _group_fill(f["groupId"], palette)
        if gfill:
            cell.fill = gfill
        is_pct = _is_percent_format(f["format"], f["formula"], f["pageValue"])
        excel_f = _formula_to_excel(f["formula"], name_to_col)
        if excel_f and f["formula"]:
            cell.value = excel_f.replace("2", "4")
            if is_pct:
                cell.number_format = "0.00%"
        else:
            num = _parse_number(f["dbValue"])
            if num is not None and f["format"] not in {"text", "ranking"}:
                if is_pct and abs(num) > 1.5:
                    num = num / 100.0
                cell.value = num
                cell.number_format = "0.00%" if is_pct else "#,##0.##"
            else:
                cell.value = f["dbValue"] or ""

    # 同组外框加粗
    i = 0
    while i < len(clean):
        gid = clean[i]["groupId"]
        if not gid:
            i += 1
            continue
        j = i
        while j + 1 < len(clean) and clean[j + 1]["groupId"] == gid:
            j += 1
        for r in (1, 2, 4):
            for c in range(i + 1, j + 2):
                cell = ws.cell(r, c)
                left = thick if c == i + 1 else cell.border.left
                right = thick if c == j + 1 else cell.border.right
                top = thick if r == 1 else cell.border.top
                bottom = thick if r == 4 else cell.border.bottom
                cell.border = Border(left=left, right=right, top=top, bottom=bottom)
        # 组名提示行
        tip = ws.cell(5, i + 1, f"【组】{clean[i]['groupLabel'] or gid}")
        tip.font = Font(size=9, color="1F4E79", bold=True)
        if j > i:
            ws.merge_cells(start_row=5, start_column=i + 1, end_row=5, end_column=j + 1)
        i = j + 1

    ws.row_dimensions[1].height = 28
    ws.row_dimensions[2].height = 22
    ws.row_dimensions[4].height = 22
    ws.cell(7, 1, f"来源页面：{title}")
    ws.cell(8, 1, "第2行=页面显示值（派生字段为 Excel 公式）；第4行=数据库统计值；同色/加粗框=同卡指标组")

    # Sheet2 明细
    ws2 = wb.create_sheet("字段明细")
    headers = [
        "字段序号",
        "分组",
        "所属页面",
        "字段名称",
        "计算来源",
        "计算公式",
        "页面显示值",
        "数据库统计值",
        "SQL",
        "备注",
    ]
    for c, h in enumerate(headers, 1):
        cell = ws2.cell(1, c, h)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = thin
    for r, f in enumerate(clean, 2):
        gfill = _group_fill(f["groupId"], palette)
        vals = [
            f"字段{f['idx']}",
            f["groupLabel"] or f["groupId"] or "",
            f["page"],
            f["name"],
            f["source"],
            f["formula"],
            f["pageValue"],
            f["dbValue"],
            f["sql"],
            f["note"],
        ]
        for c, v in enumerate(vals, 1):
            cell = ws2.cell(r, c, v)
            cell.border = thin
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if gfill and c <= 4:
                cell.fill = gfill
    widths = [10, 16, 16, 28, 14, 36, 14, 14, 40, 20]
    for i, w in enumerate(widths, 1):
        ws2.column_dimensions[get_column_letter(i)].width = w

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
