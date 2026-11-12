"""从 Chrome 书签 HTML 导入到 data/links.json"""
import json
import re
import uuid
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BOOKMARKS = Path(r"C:\Users\yzyz\Desktop\bookmarks_2026_6_16.html")
OUTPUT = ROOT / "data" / "links.json"

CATEGORY_HINTS = {
    "运维": "服务器运维、部署、监控、日志排查",
    "工具": "开发测试辅助工具、在线转换、文档查阅",
    "禅道": "需求、用例、Bug 管理",
    "gitlab": "代码仓库、MR、CI",
    "sdk": "游戏 SDK 相关后台与环境",
    "派队": "宇宙大派队项目相关后台与文档",
    "压测": "性能测试、JMeter、接口压测",
    "接口": "接口文档、联调、在线解析",
    "原型": "产品原型、墨刀、蓝湖 UI",
    "bug": "Bug 跟踪、线上问题文档",
    "监控": "服务监控、告警查看",
    "日志": "日志搜索与分析",
}


def guess_problem(name: str, category: str, path: str) -> str:
    text = f"{name} {category} {path}".lower()
    for key, hint in CATEGORY_HINTS.items():
        if key.lower() in text:
            return hint
    if path:
        return f"{path} 相关访问入口"
    return f"{category} 常用链接"


def slug_id(name: str, url: str) -> str:
    base = re.sub(r"[^\w\u4e00-\u9fff-]", "-", name.lower())[:30]
    return f"{base}-{uuid.uuid5(uuid.NAMESPACE_URL, url).hex[:6]}"


class BookmarkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.folder_stack: list[str] = []
        self.links: list[dict] = []
        self._in_h3 = False
        self._h3_buf: list[str] = []
        self._in_a = False
        self._a_href = ""
        self._a_icon = ""
        self._a_buf: list[str] = []

    def handle_data(self, data):
        if self._in_h3:
            self._h3_buf.append(data)
        elif self._in_a:
            self._a_buf.append(data)

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "h3":
            self._in_h3 = True
            self._h3_buf = []
        elif tag == "a" and "href" in attrs_d:
            self._in_a = True
            self._a_href = attrs_d["href"]
            self._a_icon = attrs_d.get("icon", "")
            self._a_buf = []

    def handle_endtag(self, tag):
        if tag == "h3":
            self._in_h3 = False
            name = "".join(self._h3_buf).strip()
            if name and name not in ("Bookmarks", "书签栏"):
                self.folder_stack.append(name)
        elif tag == "a":
            if self._in_a:
                name = "".join(self._a_buf).strip()
                href = self._a_href.strip()
                if href.startswith("http") and name:
                    path_parts = [p for p in self.folder_stack if p not in ("书签栏",)]
                    category = path_parts[0] if path_parts else "其他"
                    subcategory = path_parts[1] if len(path_parts) > 1 else "默认"
                    tags = list(path_parts[:4])
                    entry = {
                        "id": slug_id(name, href),
                        "name": name,
                        "url": href,
                        "category": category,
                        "subcategory": subcategory,
                        "problem": guess_problem(name, category, " / ".join(path_parts)),
                        "tags": tags,
                    }
                    if self._a_icon.startswith("data:"):
                        entry["icon"] = self._a_icon
                    self.links.append(entry)
            self._in_a = False
        elif tag == "dl":
            if self.folder_stack:
                self.folder_stack.pop()


def main():
    content = BOOKMARKS.read_text(encoding="utf-8")
    parser = BookmarkParser()
    parser.feed(content)
    seen = set()
    unique = []
    for item in parser.links:
        key = item["url"]
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    unique.sort(key=lambda x: (x["category"], x["name"]))
    OUTPUT.write_text(json.dumps(unique, ensure_ascii=False, indent=2), encoding="utf-8")
    cats = {}
    for item in unique:
        cats[item["category"]] = cats.get(item["category"], 0) + 1
    print(f"导入 {len(unique)} 条链接，{len(cats)} 个分类，{sum(1 for i in unique if i.get('icon'))} 条含图标")
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {c}: {n}")


if __name__ == "__main__":
    main()
