"""从 2022 软测课件目录生成系统性课程索引，供测试信息 Tab 查阅。"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_FILE = DATA_DIR / "test_info_course_index.json"

DEFAULT_COURSE_ROOT = Path(r"F:\BaiduNetdiskDownload\14-2022年软测项目资料")

# 只索引这些扩展名（代码/截图/缓存不进查阅库）
INDEX_EXTS = {".md", ".pdf", ".docx", ".doc", ".xmind", ".txt"}


def _is_manual_note(n: str, name: str) -> bool:
    if "手工项目" in name:
        return True
    if "python" in n or "linux" in n or "数据库" in n or "mysql" in n:
        return False
    if "app手工" in n or "web手工" in n:
        return False
    if re.search(r"第[一二三四五六七八九十0-9]+天笔记", name):
        return True
    if re.match(r"0[1-6]-.*笔记", name) and "python" not in n:
        return True
    return False


TRACKS = [
    (
        "overview",
        "00-总览导读",
        lambda n, name, r: "软测核心项目课程" in name
        or name in {"上课要求.md", "阶段上课要求.md"}
        or "学习路线" in name,
    ),
    (
        "api-pay",
        "05-接口与支付",
        lambda n, name, r: any(
            k in name or k in n
            for k in (
                "接口",
                "支付",
                "Charles",
                "charles",
                "抓包",
                "黑马理财",
                "手机登录",
                "P2P",
                "p2p",
                "金融项目",
            )
        ),
    ),
    (
        "auto-report",
        "06-自动化与报告",
        lambda n, name, r: any(k in n or k in name for k in ("allure", "自动化", "solopi", "SoloPi")),
    ),
    (
        "tools",
        "07-工具与部署",
        lambda n, name, r: "安装说明" in name or "项目部署" in name,
    ),
    (
        "linux-db",
        "02-Linux与数据库",
        lambda n, name, r: "linux" in n or "mysql" in n or "数据库" in name,
    ),
    (
        "python",
        "03-Python基础",
        lambda n, name, r: "python" in n or "pytest" in n,
    ),
    (
        "web-app-manual",
        "04-Web/App手工项目",
        lambda n, name, r: any(
            k in n or k in name
            for k in ("web手工", "app手工", "tpshop", "TPshop", "Ego", "业务场景测试点", "功能点测试点")
        ),
    ),
    (
        "manual-basic",
        "01-手工测试基础",
        lambda n, name, r: _is_manual_note(n, name),
    ),
    (
        "project-docs",
        "08-项目文档与案例",
        lambda n, name, r: True,  # fallback
    ),
]


def _pick_track(name: str, rel: str) -> tuple[str, str]:
    n = name.lower()
    r = rel.lower().replace("\\", "/")
    for tid, tname, fn in TRACKS:
        try:
            if fn(n, name, r):
                return tid, tname
        except Exception:
            continue
    return "project-docs", "08-项目文档与案例"


def _should_skip(path: Path) -> bool:
    s = str(path).replace("\\", "/").lower()
    name = path.name
    if path.suffix.lower() not in INDEX_EXTS:
        return True
    # 降噪：预习稿、作业答案、第三方依赖
    if any(x in name for x in ("预习", "参考答案", "作业题", "每日作业")):
        return True
    if any(x in s for x in (".pytest_cache", "bower_components", "sbadmin2", "node_modules", "__pycache__")):
        return True
    # 代码目录里的材料跳过（保留课堂资料）
    if any(x in s for x in ("/03-课堂代码/", "/04-课堂代码/", "/4-课堂代码/", "/5-课堂代码/")):
        return True
    return False


def _order_key(item: dict) -> tuple:
    m = re.search(r"(\d{1,2})", item.get("title") or "")
    num = int(m.group(1)) if m else 999
    return (item.get("track") or "", num, item.get("title") or "")


def _clean_summary_line(s: str) -> str:
    s = re.sub(r"!\[([^\]]*)\]\([^)]+\)", "", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
    s = re.sub(r"</?[^>]+>", "", s)
    s = re.sub(r"#{1,6}\s*", "", s)
    s = re.sub(r"^[-*•>\d.)\s]+", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ：:|-")
    return s.strip()


def _looks_like_schedule(s: str) -> bool:
    return bool(re.search(r"\d{1,2}:\d{2}\s*[~～-]", s)) or s.startswith(("上午", "下午", "时间"))


def _clip(s: str, n: int = 56) -> str:
    s = (s or "").strip()
    if len(s) <= n:
        return s
    return s[: n - 1].rstrip() + "…"


def _summarize_from_name(name: str, track: str) -> str:
    stem = Path(name).stem
    stem = re.sub(r"[【\[].*?[】\]]", "", stem).strip()
    hint = ""
    mapping = (
        ("上课要求", "课堂时间与笔记/作业规范"),
        ("学习路线", "课程阶段学习路线脑图"),
        ("软测核心项目课程", "2022 软测项目课程总览大纲"),
        ("手工项目", "手工功能测试项目课笔记"),
        ("接口", "接口测试课堂笔记/资料"),
        ("支付", "支付相关测试资料"),
        ("Charles", "抓包工具 Charles 使用"),
        ("Python", "Python 基础课程讲义"),
        ("Linux", "Linux 基础操作笔记"),
        ("数据库", "数据库/MySQL 课程资料"),
        ("MySQL", "MySQL 课程资料"),
        ("Web手工", "Web 端手工测试项目"),
        ("App手工", "App 端手工测试项目"),
        ("tpshop", "TPshop 项目测试资料"),
        ("TPshop", "TPshop 项目测试资料"),
        ("Allure", "Allure 测试报告相关"),
        ("SoloPi", "SoloPi 自动化工具资料"),
        ("安装说明", "环境/工具安装说明"),
        ("部署", "项目部署说明"),
        ("需求", "项目需求/说明书"),
        ("测试报告", "测试报告样例或模板"),
        ("测试点", "功能/业务场景测试点"),
        ("xmind", "思维导图总结"),
    )
    for k, v in mapping:
        if k.lower() in name.lower() or k in name:
            hint = v
            break
    if not hint and track:
        hint = re.sub(r"^\d+-", "", track).strip() or track
    if hint and stem and stem not in hint:
        return _clip(f"{hint} · {stem}")
    return _clip(hint or stem or "课程资料")


def _summarize_text(text: str) -> str:
    if not text:
        return ""
    # drop fenced code
    text = re.sub(r"```[\s\S]*?```", "\n", text)
    lines = [ln.strip() for ln in text.replace("\r\n", "\n").split("\n")]
    goals: list[str] = []
    bullets: list[str] = []
    headings: list[str] = []
    in_goal = False
    for ln in lines:
        if not ln or ln.startswith("![") or set(ln) <= {"-", "=", "*"}:
            continue
        if re.match(r"^#{1,3}\s+", ln):
            h = _clean_summary_line(ln)
            if h:
                headings.append(h)
            in_goal = any(k in h for k in ("目标", "课程目标", "阶段目标", "本日目标", "学习目标"))
            continue
        if any(k in ln for k in ("目标", "课程目标", "阶段目标")) and not ln.startswith("#"):
            in_goal = True
        cleaned = _clean_summary_line(ln)
        if not cleaned or len(cleaned) < 4 or _looks_like_schedule(cleaned):
            continue
        if in_goal and (ln.startswith(("-", "*", "•")) or re.match(r"^\d+[\.、]", ln) or "能" in cleaned[:2]):
            goals.append(cleaned)
            if len(goals) >= 2:
                break
            continue
        if ln.startswith(("-", "*", "•")) or re.match(r"^\d+[\.、]", ln):
            if cleaned.startswith(("课前", "课堂", "课后", "预习", "笔记", "作业", "能", "会", "掌握", "熟悉", "完成")):
                bullets.insert(0, cleaned)
            else:
                bullets.append(cleaned)
    if goals:
        return _clip("；".join(goals[:2]))
    # heading + first bullet
    parts = []
    for h in headings:
        if h not in ("上课要求", "阶段上课要求") and len(h) > 2:
            parts.append(h)
            break
    if bullets:
        parts.append(bullets[0])
    if parts:
        return _clip(" · ".join(parts))
    # first meaningful paragraph
    for ln in lines:
        cleaned = _clean_summary_line(ln)
        if cleaned and len(cleaned) >= 8 and not cleaned.startswith("http"):
            return _clip(cleaned)
    return ""


def _summarize_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except Exception:
            return ""
    try:
        reader = PdfReader(str(path))
        chunks = []
        for page in reader.pages[:2]:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                continue
        return _summarize_text("\n".join(chunks))
    except Exception:
        return ""


def summarize_file(path: Path, track: str) -> str:
    ext = path.suffix.lower()
    try:
        if ext in {".md", ".txt", ".markdown"}:
            text = path.read_text(encoding="utf-8", errors="replace")
            s = _summarize_text(text)
            if s:
                return s
        elif ext == ".pdf":
            s = _summarize_pdf(path)
            if s:
                return s
    except OSError:
        pass
    return _summarize_from_name(path.name, track)


def build_index(course_root: Path | None = None) -> dict:
    root = Path(course_root or DEFAULT_COURSE_ROOT)
    if not root.is_dir():
        return {"ok": False, "error": f"课程目录不存在: {root}", "items": [], "tracks": []}

    items: list[dict] = []
    seen: set[str] = set()

    candidates: list[Path] = []
    c01 = root / "01-课堂资料"
    if c01.is_dir():
        candidates.extend([p for p in c01.rglob("*") if p.is_file()])
    candidates.extend([p for p in root.iterdir() if p.is_file()])

    for p in candidates:
        if _should_skip(p):
            continue
        try:
            key = str(p.resolve()).lower()
        except OSError:
            continue
        if key in seen:
            continue
        seen.add(key)
        try:
            rel = str(p.relative_to(root)).replace("\\", "/")
        except ValueError:
            rel = p.name
        track_id, track_name = _pick_track(p.name, rel)
        st = p.stat()
        summary = summarize_file(p, track_name)
        items.append(
            {
                "id": f"course:{key}",
                "title": p.name,
                "category": "课程资料",
                "track": track_name,
                "trackId": track_id,
                "kind": "file",
                "ext": p.suffix.lower(),
                "path": str(p.resolve()),
                "rel": rel,
                "size": st.st_size,
                "size_mb": round(st.st_size / (1024 * 1024), 2),
                "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                "source": "course-2022",
                "note": track_name,
                "summary": summary,
                "can_preview": p.suffix.lower() in {".md", ".txt", ".markdown", ".pdf"},
            }
        )

    items.sort(key=_order_key)
    tracks = []
    for tid, tname, _ in TRACKS:
        cnt = sum(1 for it in items if it.get("trackId") == tid)
        if cnt:
            tracks.append({"id": tid, "name": tname, "count": cnt})
    tracks.sort(key=lambda t: t.get("name") or "")

    payload = {
        "ok": True,
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "courseRoot": str(root.resolve()),
        "count": len(items),
        "tracks": tracks,
        "items": items,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = build_index()
    print(
        json.dumps(
            {
                "ok": result.get("ok"),
                "count": result.get("count"),
                "tracks": result.get("tracks"),
                "error": result.get("error"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
