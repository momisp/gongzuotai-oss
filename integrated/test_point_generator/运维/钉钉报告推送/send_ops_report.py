#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将运维巡检备注（Markdown）与截图一并整理为报告，推送到钉钉群自定义机器人。

用法示例：
  cd 钉钉报告推送
  pip install -r requirements.txt
  copy env.example .env  # 填写 DINGTALK_WEBHOOK / DINGTALK_SECRET

  python send_ops_report.py --title "大派对运维日检-2026-05-20" --notes 巡检备注示例.md --images "D:\\shots\\1.png" "D:\\shots\\2.png"

  # 或扫描目录下 png/jpg
  python send_ops_report.py --title "大派对运维日检" --notes my.md --image-dir D:\\shots

环境变量（可被 .env 覆盖）：
  DINGTALK_WEBHOOK  必填
  DINGTALK_SECRET   选填（加签）

  # 出站必须走代理时设为 1；默认不写：忽略 HTTP_PROXY / HTTPS_PROXY 等，直连钉钉 API
  DINGTALK_USE_SYSTEM_PROXY=0

若出现 ProxyError「Unable to connect to proxy」，多为本机或 Electron 注入了错误代理，
请清空上述代理变量排查，或保持默认（脚本已不按环境变量走代理）。
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print("请先安装依赖: pip install -r requirements.txt", file=sys.stderr)
    raise SystemExit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

SCRIPT_DIR = Path(__file__).resolve().parent
IMAGE_SUFFIX = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

# 钉钉 markdown 单条过长可能被截断，保留安全余量
MAX_MARKDOWN_CHARS = 18000

# 自定义机器人 image 消息：整条 JSON body（含 base64）不得超过约 20000 字节，否则 errcode=460101
MAX_DINGTALK_IMAGE_JSON_UTF8 = 19900


def load_env() -> None:
    if load_dotenv:
        load_dotenv(SCRIPT_DIR / ".env")
        # 与同目录无前缀 env 可同时存在：后加载并 override，便于仅维护 env（.env 常留占位符）
        load_dotenv(SCRIPT_DIR / "env", override=True)
        load_dotenv()


def sign_webhook_url(webhook: str, secret: str | None) -> str:
    if not secret:
        return webhook
    ts = str(round(time.time() * 1000))
    s = f"{ts}\n{secret}".encode("utf-8")
    sign = base64.b64encode(hmac.new(secret.encode("utf-8"), s, hashlib.sha256).digest()).decode()
    sign_enc = urllib.parse.quote_plus(sign)
    sep = "&" if "?" in webhook else "?"
    return f"{webhook}{sep}timestamp={ts}&sign={sign_enc}"


def file_md5_b64_for_dingtalk(data: bytes) -> tuple[str, str]:
    """返回 (base64内容, md5_hex) —— 钉钉 image 消息需要 base64 与 md5。"""
    md5_hex = hashlib.md5(data).hexdigest()
    b64 = base64.b64encode(data).decode("ascii")
    return b64, md5_hex


def _dingtalk_image_payload_byte_length(b64: str, md5_hex: str) -> int:
    payload = {"msgtype": "image", "image": {"base64": b64, "md5": md5_hex}}
    return len(json.dumps(payload, separators=(",", ":")).encode("utf-8"))


def _shrink_image_bytes_for_dingtalk_webhook(original: bytes) -> bytes:
    """将图片压成 JPEG，使 image 消息的 JSON body 低于 webhook 限制。"""
    from io import BytesIO

    try:
        from PIL import Image
    except ImportError as e:
        raise RuntimeError(
            "钉钉要求单条 image 消息 JSON 约 ≤20000 字节，当前截图过大；"
            "请执行: pip install Pillow（或 pip install -r requirements.txt）以自动压缩。"
        ) from e

    bio = BytesIO(original)
    im = Image.open(bio)
    im = im.convert("RGB")

    quality = 74
    max_side = 920
    last_out = original
    for _ in range(48):
        w, h = im.size
        if max(w, h) > max_side:
            r = max_side / max(w, h)
            nw = max(1, int(w * r))
            nh = max(1, int(h * r))
            im = im.resize((nw, nh), Image.Resampling.LANCZOS)
        out_buf = BytesIO()
        im.save(out_buf, format="JPEG", quality=quality, optimize=True)
        last_out = out_buf.getvalue()
        b64, md5_hex = file_md5_b64_for_dingtalk(last_out)
        if _dingtalk_image_payload_byte_length(b64, md5_hex) <= MAX_DINGTALK_IMAGE_JSON_UTF8:
            return last_out
        quality -= 3
        if quality < 22:
            quality = 68
            max_side = max(200, max_side - 72)
    raise RuntimeError(
        "已尽量压缩仍超过钉钉 webhook 单条图片限制（约 20000 字节 JSON），"
        "请减少同时发送张数或改用 --no-images。"
    )


def _dingtalk_requests_session() -> requests.Session:
    """钉钉机器人通常为公网 HTTPS；Broken HTTP(S)_PROXY 在 Windows 上极常见。
    trust_env 只能设置在 Session 上，传给 requests.post() 会触发
    「request() got an unexpected keyword argument 'trust_env'」。"""
    s = requests.Session()
    v = os.environ.get("DINGTALK_USE_SYSTEM_PROXY", "").strip().lower()
    if v not in ("1", "true", "yes", "on"):
        s.trust_env = False
    return s


def _bytes_fitting_dingtalk_image_message(data: bytes) -> bytes:
    b64, md5_hex = file_md5_b64_for_dingtalk(data)
    if _dingtalk_image_payload_byte_length(b64, md5_hex) <= MAX_DINGTALK_IMAGE_JSON_UTF8:
        return data
    return _shrink_image_bytes_for_dingtalk_webhook(data)


def post_json(url: str, payload: dict, timeout: float = 30.0) -> dict:
    kw: dict[str, Any] = {
        "json": payload,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "timeout": timeout,
    }
    with _dingtalk_requests_session() as sess:
        r = sess.post(url, **kw)
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text}
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {body}")
    if body.get("errcode") != 0:
        raise RuntimeError(f"钉钉接口错误 errcode={body.get('errcode')} errmsg={body.get('errmsg')} body={body}")
    return body


def send_markdown(webhook_signed: str, title: str, text: str) -> None:
    # 钉钉 markdown 用 ## 标题；正文避免全角符号问题可适当简化
    payload = {"msgtype": "markdown", "markdown": {"title": title[:128], "text": text}}
    post_json(webhook_signed, payload)


def send_text(webhook_signed: str, content: str) -> None:
    payload = {"msgtype": "text", "text": {"content": content}}
    post_json(webhook_signed, payload)


def send_image(webhook_signed: str, image_path: Path) -> None:
    data = image_path.read_bytes()
    if len(data) > 2 * 1024 * 1024:
        print(f"  [警告] 图片超过 2MB，钉钉可能拒绝: {image_path.name}", file=sys.stderr)
    fitted = _bytes_fitting_dingtalk_image_message(data)
    if len(fitted) < len(data):
        print(f"  [提示] {image_path.name} 已为钉钉 webhook 限制自动压缩 JPEG", file=sys.stderr)
    b64, md5_hex = file_md5_b64_for_dingtalk(fitted)
    payload = {"msgtype": "image", "image": {"base64": b64, "md5": md5_hex}}
    post_json(webhook_signed, payload)


def read_notes(path: Path) -> str:
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    return text.strip()


def collect_images(image_args: list[str], image_dir: Path | None) -> list[Path]:
    paths: list[Path] = []
    for p in image_args:
        pp = Path(p).expanduser().resolve()
        if not pp.is_file():
            raise FileNotFoundError(f"图片不存在: {pp}")
        if pp.suffix.lower() not in IMAGE_SUFFIX:
            print(f"  [警告] 非推荐后缀仍尝试发送: {pp.name}", file=sys.stderr)
        paths.append(pp)
    if image_dir:
        d = Path(image_dir).expanduser().resolve()
        if not d.is_dir():
            raise NotADirectoryError(f"目录不存在: {d}")
        for pp in sorted(d.iterdir()):
            if pp.is_file() and pp.suffix.lower() in IMAGE_SUFFIX:
                paths.append(pp.resolve())
    # 去重保持顺序
    seen = set()
    uniq: list[Path] = []
    for p in paths:
        key = str(p)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(p)
    return uniq


def build_report_markdown(
    title: str,
    notes: str,
    image_paths: list[Path],
    report_type: str,
) -> str:
    now = datetime.now(timezone.utc).astimezone()
    ts = now.strftime("%Y-%m-%d %H:%M:%S %z")

    lines = [
        f"# {title}",
        "",
        f"**生成时间**：{ts}",
        f"**报告类型**：{report_type}",
        "",
        "---",
        "",
        "## 截图清单",
        "",
    ]
    if not image_paths:
        lines.append("_（本次未附截图）_")
    else:
        for i, p in enumerate(image_paths, 1):
            lines.append(f"{i}. `{p.name}`")
    lines.extend(["", "---", "", "## 运维建议与备注", "", notes, ""])
    return "\n".join(lines)


def maybe_truncate_for_dingtalk_markdown(text: str) -> str:
    if len(text) <= MAX_MARKDOWN_CHARS:
        return text
    head = text[: MAX_MARKDOWN_CHARS - 200]
    return head + "\n\n…\n\n_（正文过长已截断，完整内容请查看本地生成的 report 文件）_"

def append_ecs_inspection_daily_sheet(wb, ecs: dict | None) -> None:
    """ECS 巡检日报版面（简报数据来自 inspection.ecs_dashboard）。"""
    try:
        from openpyxl.styles import Alignment, Font
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise

    ws = wb.create_sheet("ECS巡检日报", 1)

    ws.column_dimensions["A"].width = 20
    for col in range(2, 9):
        ws.column_dimensions[get_column_letter(col)].width = 14

    r = 1
    if not ecs or not isinstance(ecs, dict):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
        ws.cell(r, 1).value = "（本列未写入：未启用 auto-inspection ECS/云监控或未取得实例快照）"
        return

    meta = ecs.get("meta") or {}
    ttl = meta.get("reportFullTitle") or "大派对应用分组 - ECS资源运维巡检日报"

    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    hc = ws.cell(r, 1)
    hc.value = ttl
    hc.font = Font(size=13, bold=True)
    hc.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    r += 2

    def sec(title: str) -> None:
        nonlocal r
        ws.cell(r, 1).value = title
        ws.cell(r, 1).font = Font(bold=True)
        r += 1

    sec("一、报告基础信息")
    for k, v in [
        ("报告名称", ttl),
        ("巡检日期", meta.get("inspectionDate") or ""),
        ("巡检人员", meta.get("inspector") or ""),
        ("巡检范围", meta.get("scope") or ""),
        ("巡检时段", meta.get("period") or ""),
    ]:
        ws.cell(r, 1).value = k
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
        ws.cell(r, 2).value = v
        ws.cell(r, 2).alignment = Alignment(wrap_text=True, vertical="top")
        r += 1

    r += 1
    sec("二、整体运行概览")
    overall = ecs.get("overall") or {}
    bullets = ecs.get("overviewBullets") or []

    def _plain(s: str) -> str:
        return str(s).replace("**", "").strip()

    ov_lines = [_plain(x) for x in bullets]
    ov_lines.append(f"汇总：实例总数 {overall.get('instanceTotal', '')}；整体风险：{overall.get('riskLevelZh', '')}")
    ov_lines.append(f"告警简述：{overall.get('alarmSummaryZh', '')}")
    row_px = max(92, min(420, len(ov_lines) * 18 + 20))
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    bx = ws.cell(r, 1)
    bx.value = "\n".join(f"• {x}" if not str(x).strip().startswith("•") else str(x).strip() for x in ov_lines)
    bx.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[r].height = row_px
    r += 2

    sec("三、ECS实例详细巡检数据（云监控最近一次采样）")
    th = (
        "实例名称",
        "实例 ID",
        "地域",
        "健康状态",
        "CPU 使用率（%）",
        "内存使用率（%）",
        "磁盘使用率（%）",
        "风险标记",
    )
    for c, h in enumerate(th, start=1):
        cell = ws.cell(r, c)
        cell.value = h
        cell.font = Font(bold=True)
    r += 1

    def pct(v: Any) -> str:
        try:
            if v is None:
                return "—"
            return f"{float(v):.2f}%"
        except (TypeError, ValueError):
            return "—"

    inst_rows = ecs.get("instances") or []
    for row in inst_rows:
        values = [
            row.get("name") or "",
            row.get("instanceId") or "",
            row.get("regionLabel") or row.get("regionId") or "",
            row.get("statusZh") or "",
            pct(row.get("cpuPercent")),
            pct(row.get("memoryPercent")),
            pct(row.get("diskPercent")),
            row.get("riskTag") or "",
        ]
        for ci, val in enumerate(values, start=1):
            c = ws.cell(r, ci)
            c.value = val
            c.alignment = Alignment(wrap_text=True, vertical="top")
        r += 1

    if not inst_rows:
        ws.cell(r, 1).value = "（暂无实例明细）"
        r += 1

    r += 1
    sec("四、异常 / 风险提示（仅保留问题描述 + 处置建议）")
    ws.cell(r, 1).value = "问题描述"
    ws.cell(r, 1).font = Font(bold=True)
    ws.cell(r, 2).value = "处置建议"
    ws.cell(r, 2).font = Font(bold=True)
    r += 1
    anomalies = ecs.get("anomalies") or []
    if anomalies:
        for a in anomalies:
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
            ws.merge_cells(start_row=r, start_column=5, end_row=r, end_column=8)
            ws.cell(r, 1).value = a.get("description") or ""
            ws.cell(r, 1).alignment = Alignment(wrap_text=True, vertical="top")
            ws.cell(r, 5).value = a.get("suggestion") or ""
            ws.cell(r, 5).alignment = Alignment(wrap_text=True, vertical="top")
            ws.row_dimensions[r].height = 48
            r += 1
    else:
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
        ws.cell(r, 1).value = "本次巡检未发现按阈值识别的异常条目（或未取齐监控指标）；请以第三节明细为准。"
        r += 1

    r += 1
    sec("五、巡检结论与次日计划")
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    wc = ws.cell(r, 1)
    wc.value = "结论：" + str(ecs.get("conclusionZh") or "").strip()
    wc.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[r].height = 54
    r += 1
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    wd = ws.cell(r, 1)
    wd.value = "次日计划：\n" + str(ecs.get("nextDayPlanZh") or "").strip()
    wd.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[r].height = 72


def write_inspection_excel(
    out: Path,
    title: str,
    manifest: dict | None,
) -> None:
    """结构与《大派对资源费用相关》对齐：巡检摘要 + Sheet1 台账页 + 「域名主体相关」+（技术向）巡检过程明细。"""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
        from openpyxl.utils import get_column_letter
    except ImportError as e:
        raise RuntimeError("缺少 openpyxl，请在本目录执行: pip install openpyxl") from e

    bold = Font(bold=True)
    wb = Workbook()

    # --- 巡检摘要 ---
    ws0 = wb.active
    ws0.title = "巡检摘要"
    tz_line = ""
    if manifest:
        tz_line = str(manifest.get("generatedAtZh") or manifest.get("generatedAt") or "").strip()
    if not tz_line:
        tz_line = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %z")
    ws0["A1"], ws0["B1"] = "报告标题", title
    ws0["A2"], ws0["B2"] = (
        "导出说明",
        "含 ECS 日报（有云监控快照时自动生成）、台账 Sheet1、域名清单、控制台/HTTPS 快照过程明细等。",
    )
    ws0["A3"], ws0["B3"] = "生成时间", tz_line
    ws0.column_dimensions[get_column_letter(1)].width = 14
    ws0.column_dimensions[get_column_letter(2)].width = 96
    for addr in ["A1", "A2", "A3"]:
        ws0[addr].font = bold

    ecs_box = manifest.get("ecsDashboard") if manifest else None
    ecs_use = ecs_box if isinstance(ecs_box, dict) else None
    append_ecs_inspection_daily_sheet(wb, ecs_use)

    # --- Sheet1：资源台账 ---
    ws1 = wb.create_sheet("Sheet1", 2)
    hdr = [
        None,
        "实例",
        "阿里云账号",
        "备注",
        None,
        "cpu",
        "内存",
        "系统盘",
        "磁盘",
        "到期时间",
        "巡检截图路径",
        "HTTPS证书截止",
        "巡检备注",
    ]
    ws1.append(hdr)
    for cell in ws1[1]:
        cell.font = bold

    inventory = []
    if manifest and isinstance(manifest.get("inventory"), list):
        inventory = manifest["inventory"]
    for inv in inventory:
        ws1.append(
            [
                None,
                inv.get("instance") or "",
                inv.get("account") or "",
                inv.get("remark") or "",
                None,
                inv.get("ecsCpu"),
                inv.get("ecsMemory"),
                inv.get("ecsDiskSystem"),
                inv.get("ecsDiskData"),
                inv.get("ecsExpireAt"),
                inv.get("screenshotPath") or "",
                inv.get("httpsExpiry") or "",
                inv.get("inspectNote") or "",
            ]
        )
    if not inventory:
        ws1.append(
            [
                None,
                "（未读取到 metrics.json 库存行）",
                "",
                "",
                None,
                None,
                None,
                None,
                None,
                None,
                "",
                "",
                "",
            ]
        )

    widths1 = [2.8, 30, 16, 78, 4, 9, 9, 32, 9, 20, 64, 24, 36]
    for i, wv in enumerate(widths1, start=1):
        if not wv:
            continue
        ws1.column_dimensions[get_column_letter(i)].width = wv

    # --- 域名主体相关 ---
    ws2 = wb.create_sheet("域名主体相关", 3)
    domain_rows: list | None = None
    if manifest and isinstance(manifest.get("domainRows"), list):
        domain_rows = manifest["domainRows"]
    if domain_rows:
        for raw in domain_rows:
            if not isinstance(raw, list):
                continue
            rr = list(raw[:7])
            while len(rr) < 7:
                rr.append("")
            ws2.append(rr)
        try:
            if ws2.max_row >= 1 and ws2.cell(1, 2).value == "小程序":
                for cell in ws2[1]:
                    cell.font = bold
                ws2.freeze_panes = "A2"
        except Exception:
            pass
        widths2 = [7, 16, 16, 40, 24, 20, 40]
        for i, wv in enumerate(widths2, start=1):
            ws2.column_dimensions[get_column_letter(i)].width = wv
    else:
        hdr2 = [None, "小程序", "app", "公众号", "域名", "新域名", "主体"]
        ws2.append(hdr2)
        for cell in ws2[1]:
            cell.font = bold
        ws2.append([None, "（请在项目内新建或编辑运维/domain-inventory.json 的 domainRows）", "", "", "", "", ""])
        widths2 = [7, 36, 12, 20, 20, 20, 32]
        for i, wv in enumerate(widths2, start=1):
            ws2.column_dimensions[get_column_letter(i)].width = wv

    # --- 巡检过程明细（控制台/证书抓拍序列） ---
    ws3 = wb.create_sheet("巡检过程明细", 4)
    det_headers = ["序号", "类型", "主体/指标", "窗口标题", "URL", "截图路径", "错误/备注"]
    ws3.append(det_headers)
    for cell in ws3[1]:
        cell.font = bold
    rows_list: list = []
    if manifest and isinstance(manifest.get("rows"), list):
        rows_list = manifest["rows"]
    if not rows_list:
        ws3.append(["—", "（无抓拍记录）", "", "", "", "", ""])
    else:
        for row in rows_list:
            ws3.append(
                [
                    row.get("index"),
                    row.get("type"),
                    row.get("subject"),
                    row.get("windowTitle"),
                    row.get("url"),
                    row.get("image"),
                    row.get("error"),
                ]
            )
    widths3 = [6, 16, 20, 32, 40, 48, 32]
    for i, wv in enumerate(widths3, start=1):
        ws3.column_dimensions[get_column_letter(i)].width = wv

    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"已导出 Excel: {out}")


def manifest_dingtalk_brief_top(manifest_obj: dict | None) -> str:
    """优先读 manifest 根级 dingTalkBriefText，兼容旧版仅写在 ecsDashboard 内。"""
    if not manifest_obj or not isinstance(manifest_obj, dict):
        return ""
    root = str(manifest_obj.get("dingTalkBriefText") or "").strip()
    if root:
        return root
    ecs = manifest_obj.get("ecsDashboard")
    if isinstance(ecs, dict):
        return str(ecs.get("dingTalkBriefText") or "").strip()
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="运维巡检报告 → 钉钉群机器人")
    parser.add_argument("--title", required=True, help="报告标题（钉钉通知标题）")
    parser.add_argument(
        "--notes",
        type=Path,
        help="巡检备注 Markdown 文件路径（含运维建议表格等）",
    )
    parser.add_argument("--notes-text", help="直接在命令行写简短备注（与 --notes 二选一）")
    parser.add_argument("--images", nargs="*", default=[], metavar="PATH", help="截图文件路径，可多份")
    parser.add_argument("--image-dir", type=Path, help="目录内 png/jpg/jpeg/gif/webp 按文件名排序全部发送")
    parser.add_argument(
        "--report-type",
        default="日检",
        help='报告类型说明，如 "日检" 或 "活动前1小时加检"',
    )
    parser.add_argument(
        "--out",
        type=Path,
        help="将完整 Markdown 报告写入本地文件（推荐留存）",
    )
    parser.add_argument(
        "--manifest-json",
        type=Path,
        help="Electron 巡检 manifest（JSON）：用于 Excel 「巡检明细」工作表",
    )
    parser.add_argument(
        "--excel",
        type=Path,
        help="导出可下载的分栏 Excel (.xlsx)；建议文件名带日期",
    )
    parser.add_argument("--dry-run", action="store_true", help="只生成报告、打印请求预览，不调用钉钉")
    parser.add_argument("--no-images", action="store_true", help="仅发送文字报告，不发送图片消息")
    parser.add_argument("--delay", type=float, default=0.35, help="每条消息间隔秒数，防限流")
    args = parser.parse_args()

    load_env()

    if not args.notes and not args.notes_text:
        print("请提供 --notes 或 --notes-text", file=sys.stderr)
        return 2

    notes = args.notes_text.strip() if args.notes_text else read_notes(args.notes.resolve())

    try:
        image_paths = collect_images(list(args.images), args.image_dir)
    except (OSError, FileNotFoundError, NotADirectoryError) as e:
        print(str(e), file=sys.stderr)
        return 2

    full_md = build_report_markdown(args.title, notes, image_paths, args.report_type)

    out_path = args.out
    if out_path is None:
        safe = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = SCRIPT_DIR / f"report_{safe}.md"
    out_path = Path(out_path).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(full_md, encoding="utf-8")
    print(f"已写入本地报告: {out_path}")

    manifest_obj: dict | None = None
    if args.manifest_json:
        mp = Path(args.manifest_json).expanduser().resolve()
        manifest_obj = json.loads(mp.read_text(encoding="utf-8"))

    ding_brief = manifest_dingtalk_brief_top(manifest_obj)

    if args.excel:
        try:
            write_inspection_excel(Path(args.excel).expanduser().resolve(), args.title, manifest_obj)
        except Exception as e:
            print(f"导出 Excel 失败: {e}", file=sys.stderr)
            return 1

    webhook = (os.environ.get("DINGTALK_WEBHOOK") or "").strip()
    secret = (os.environ.get("DINGTALK_SECRET") or "").strip() or None

    if args.dry_run:
        print("\n[DRY-RUN] 钉钉首条模式:", "文字简报(text)" if ding_brief else "完整 Markdown")
        if ding_brief:
            print("[DRY-RUN] 简报预览:\n", ding_brief[:1800], "\n...\n", flush=True)
        else:
            print("[DRY-RUN] Markdown 正文长度:", len(full_md))
            print(maybe_truncate_for_dingtalk_markdown(full_md)[:1200], "\n...\n")
        print(f"[DRY-RUN] 图片数量: {len(image_paths)}，--no-images={args.no_images}")
        return 0

    if not webhook:
        print("未设置环境变量 DINGTALK_WEBHOOK（可在本目录 .env 配置）", file=sys.stderr)
        return 2

    url = sign_webhook_url(webhook, secret)

    md_fallback = maybe_truncate_for_dingtalk_markdown(full_md)

    try:
        if ding_brief:
            send_text(url, ding_brief)
            print("已发送文字简报（钉钉 text）；详尽内容见本地 Excel / Markdown")
        else:
            send_markdown(url, args.title, md_fallback)
            print("已发送 Markdown 报告到钉钉")
    except Exception as e:
        print(f"钉钉首条正文失败: {e}", file=sys.stderr)
        return 1

    time.sleep(args.delay)

    if ding_brief and (not args.no_images) and image_paths:
        try:
            send_text(url, f"[快照说明] 将按顺序下发 {len(image_paths)} 张控制台/HTTPS 截图。")
        except Exception:
            pass
        time.sleep(args.delay)

    if not args.no_images and image_paths:
        for p in image_paths:
            try:
                send_image(url, p)
                print(f"已发送图片: {p.name}")
            except Exception as e:
                print(f"发送图片失败 {p.name}: {e}", file=sys.stderr)
                # 补发文字说明哪张失败
                try:
                    send_text(url, f"[图片发送失败] {p.name}\n{e!s}")
                except Exception:
                    pass
            time.sleep(args.delay)

    print("完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
