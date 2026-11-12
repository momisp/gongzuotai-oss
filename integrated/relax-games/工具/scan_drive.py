# -*- coding: utf-8 -*-
"""
递归扫描指定盘符或目录，将「路径 + 类型 + 大小 + 时间 + 备注分类」写入 CSV/TSV。

用法示例：
  python scan_drive.py --root F:\\ --out F盘目录清单.csv
  python scan_drive.py --root F:\\ --out 记录.tsv --format tsv --max-depth 8

说明：
  - 全盘扫描可能很慢、文件很大；可用 --max-depth 或 --skip 限制范围。
  - 若权限不足，部分目录会跳过并在 stderr 打一行提示。
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def classify_size(n: int) -> str:
    if n < 0:
        return "未知"
    if n == 0:
        return "空"
    if n < 1024:
        return "极小(<1KB)"
    if n < 1024 * 1024:
        return "小(<1MB)"
    if n < 100 * 1024 * 1024:
        return "中(<100MB)"
    return "大(>=100MB)"


def classify_ext(path: str, is_dir: bool) -> str:
    if is_dir:
        return "(目录)"
    suf = Path(path).suffix.lower()
    if not suf:
        return "(无扩展名)"
    # 常见类型备注，可按需增删
    doc = {".txt", ".md", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv"}
    media = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mkv", ".avi", ".mp3", ".wav"}
    arch = {".zip", ".rar", ".7z", ".tar", ".gz"}
    code = {".py", ".js", ".ts", ".html", ".css", ".json", ".xml", ".c", ".cpp", ".h", ".cs", ".java"}
    if suf in doc:
        return f"文档{suf}"
    if suf in media:
        return f"媒体{suf}"
    if suf in arch:
        return f"压缩{suf}"
    if suf in code:
        return f"代码{suf}"
    return f"其他{suf}"


def walk(
    root: str,
    writer: csv.DictWriter,
    max_depth: int | None,
    skip_prefixes: list[str],
) -> tuple[int, int]:
    root = os.path.abspath(root)
    root_parts = len(Path(root).parts)
    n_files = 0
    n_dirs = 0
    for dirpath, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        depth = len(Path(dirpath).parts) - root_parts
        if max_depth is not None and depth > max_depth:
            dirnames[:] = []
            continue
        # 跳过指定前缀（不区分大小写比较盘符路径）
        norm = dirpath.rstrip("\\/")
        low = norm.lower()
        for sp in skip_prefixes:
            if sp and low.startswith(sp.rstrip("\\/").lower()):
                dirnames[:] = []
                break
        else:
            for d in dirnames:
                full = os.path.join(dirpath, d)
                try:
                    st = os.stat(full)
                    mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
                except OSError:
                    mtime = ""
                writer.writerow(
                    {
                        "path": full,
                        "entry_type": "目录",
                        "size_bytes": "",
                        "modified_utc": mtime,
                        "extension_remark": classify_ext(full, True),
                        "depth": depth,
                        "size_class": "",
                        "scan_note": "目录节点",
                    }
                )
                n_dirs += 1

            for name in filenames:
                full = os.path.join(dirpath, name)
                try:
                    st = os.stat(full)
                    sz = st.st_size
                    mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
                except OSError as e:
                    writer.writerow(
                        {
                            "path": full,
                            "entry_type": "文件(无法访问)",
                            "size_bytes": "",
                            "modified_utc": "",
                            "extension_remark": classify_ext(full, False),
                            "depth": depth + 1,
                            "size_class": "",
                            "scan_note": str(e),
                        }
                    )
                    print(f"跳过/错误: {full} -> {e}", file=sys.stderr)
                    continue
                writer.writerow(
                    {
                        "path": full,
                        "entry_type": "文件",
                        "size_bytes": sz,
                        "modified_utc": mtime,
                        "extension_remark": classify_ext(full, False),
                        "depth": depth + 1,
                        "size_class": classify_size(sz),
                        "scan_note": "文件节点",
                    }
                )
                n_files += 1
    return n_files, n_dirs


def main() -> None:
    p = argparse.ArgumentParser(description="扫描磁盘/目录并导出清单 CSV/TSV")
    p.add_argument("--root", default="F:\\", help="起始路径，默认 F:\\")
    p.add_argument("--out", required=True, help="输出文件路径，如 F:\\_scan_result.csv")
    p.add_argument("--format", choices=("csv", "tsv"), default="csv", help="输出格式")
    p.add_argument("--max-depth", type=int, default=None, help="最大目录深度，根为 0")
    p.add_argument(
        "--skip",
        action="append",
        default=[],
        help="跳过以此路径开头的目录（可多次指定），如 --skip F:\\\\System Volume Information",
    )
    args = p.parse_args()
    root = args.root
    if not os.path.isdir(root):
        print(f"错误: 不是有效目录: {root}", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "path",
        "entry_type",
        "size_bytes",
        "modified_utc",
        "extension_remark",
        "depth",
        "size_class",
        "scan_note",
    ]
    delim = "\t" if args.format == "tsv" else ","
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=delim, extrasaction="ignore")
        w.writeheader()
        w.writerow(
            {
                "path": root,
                "entry_type": "扫描根",
                "size_bytes": "",
                "modified_utc": datetime.now(timezone.utc).isoformat(),
                "extension_remark": "",
                "depth": 0,
                "size_class": "",
                "scan_note": f"开始扫描 root={root}",
            }
        )
        nf, nd = walk(root, w, args.max_depth, args.skip)
        w.writerow(
            {
                "path": "",
                "entry_type": "汇总",
                "size_bytes": "",
                "modified_utc": datetime.now(timezone.utc).isoformat(),
                "extension_remark": "",
                "depth": "",
                "size_class": "",
                "scan_note": f"文件数约 {nf}, 目录数约 {nd}（目录含 walk 中枚举的文件夹行）",
            }
        )

    print(f"已写入: {out_path.resolve()}")


if __name__ == "__main__":
    main()
