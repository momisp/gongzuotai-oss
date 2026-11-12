# -*- coding: utf-8 -*-
"""测试点 Markdown → 禅道用例 CSV（单文件）；模块树对齐页面框架标题层级。"""
from __future__ import annotations

import csv
import io
import re
from typing import Any

from md_to_xmind_export import parse_md_tree

_PRI_RE = re.compile(r"^\[(P[012])\]\s*", re.I)
# 需求溯源台用的句末锚点；导入禅道/产品系统/XMind 时须去掉
_SOURCE_ANCHOR_RE = re.compile(
    r"[〔【\[]\s*源\s*[:：][^〕】\]]*[〕】\]]"
    r"|\(\s*源\s*[:：][^)]*\)"
)
_SKIP_HEAD = re.compile(r"^(冒烟门禁|业务场景|页面功能测试点|专项测试点)$")
_SPECIAL_L1 = {
    "权限与多角色",
    "并发与幂等",
    "弱网与异常网络",
    "兼容性",
    "安全",
}

# 禅道用例模块：
# - 无原型前缀时：四顶层并列 —— 冒烟测试 / 业务场景 / 功能测试 / 专项测试
# - 有原型前缀时（如「小程序」「魁星岩后台」）：
#     小程序 / 冒烟测试 / …
#     魁星岩后台 / 功能测试 / 首页 / …
# 「首页、商城…」等页面模块挂在「功能测试」下，不与冒烟/场景顶层并列
MODULE_SMOKE_ROOT = ("冒烟测试",)
MODULE_BIZ_ROOT = ("业务场景",)
MODULE_FUNC_ROOT = ("功能测试",)
MODULE_SPECIAL_ROOT = ("专项测试",)

_TOP_LEVEL_ORDER = {
    "冒烟测试": 0,
    "业务场景": 1,
    "功能测试": 2,
    "专项测试": 3,
}


def _normalize_module_root(raw: str) -> str:
    """原型端顶层模块名（小程序 / 后台…）；空则不加前缀。"""
    t = re.sub(r"\s+", " ", str(raw or "")).strip()
    t = re.sub(r"[\\/|#]", "·", t)
    return t[:40]


def _with_module_root(path: tuple[str, ...], root: str) -> tuple[str, ...]:
    r = _normalize_module_root(root)
    if not r:
        return tuple(path or ())
    return (r,) + tuple(path or ())


def _path_sort_key(path: tuple[str, ...]):
    if not path:
        return (99, "", 99, 0, path)
    if path[0] in _TOP_LEVEL_ORDER:
        return (0, "", _TOP_LEVEL_ORDER[path[0]], len(path), path)
    # 带原型前缀：按 前缀名 → 四类 → 深度
    second = path[1] if len(path) > 1 else ""
    return (1, path[0], _TOP_LEVEL_ORDER.get(second, 99), len(path), path)


def _under_func(rel: tuple[str, ...]) -> tuple[str, ...]:
    """页面相对路径挂到「功能测试」下。"""
    return MODULE_FUNC_ROOT + rel if rel else MODULE_FUNC_ROOT


def strip_source_anchor(s: str) -> str:
    """去掉〔源:路径 ·「控件」〕等溯源标记（导入/导出用例用）。"""
    t = _SOURCE_ANCHOR_RE.sub("", str(s or ""))
    return re.sub(r"\s+", " ", t).strip()


def _clean_title(s: str) -> str:
    t = strip_source_anchor(s)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"[\\/|#]", "·", t)
    return t[:80] or "未命名"


def framework_module_paths(framework_md: str) -> list[tuple[str, ...]]:
    """从页面框架提取相对模块路径：## / ### / ####（不含「功能测试」前缀）。"""
    return _heading_paths_only(framework_md)


def business_module_paths(business_md: str) -> list[tuple[str, ...]]:
    """业务场景 MD → 禅道模块路径：冒烟测试 + 业务场景(+分组)。"""
    out: list[tuple[str, ...]] = [MODULE_SMOKE_ROOT, MODULE_BIZ_ROOT]
    seen: set[tuple[str, ...]] = {MODULE_SMOKE_ROOT, MODULE_BIZ_ROOT}
    if not str(business_md or "").strip():
        return out
    biz_tree = parse_md_tree(business_md)
    raw: list[dict[str, Any]] = []
    for ch in biz_tree.get("children") or []:
        _collect_leaves(ch, (), raw, kind="biz")
    for item in raw:
        kind, mod = _biz_kind_and_path(tuple(item.get("module_path") or ()))
        if kind == "smoke":
            path = MODULE_SMOKE_ROOT
        else:
            path = MODULE_BIZ_ROOT + mod if mod else MODULE_BIZ_ROOT
        for i in range(1, len(path) + 1):
            parent = path[:i]
            if parent not in seen:
                seen.add(parent)
                out.append(parent)
    return sorted(set(out), key=_path_sort_key)


def special_module_paths(special_md: str) -> list[tuple[str, ...]]:
    """专项测试 MD → 禅道模块路径：专项测试(+五章分组)。"""
    out: list[tuple[str, ...]] = [MODULE_SPECIAL_ROOT]
    seen: set[tuple[str, ...]] = {MODULE_SPECIAL_ROOT}
    if not str(special_md or "").strip():
        return out
    tree = parse_md_tree(special_md)
    raw: list[dict] = []
    for ch in tree.get("children") or []:
        _collect_leaves(ch, (), raw, kind="special")
    for item in raw:
        mod = _special_subpath(tuple(item.get("module_path") or ()))
        path = MODULE_SPECIAL_ROOT + mod if mod else MODULE_SPECIAL_ROOT
        for i in range(1, len(path) + 1):
            parent = path[:i]
            if parent not in seen:
                seen.add(parent)
                out.append(parent)
    return sorted(set(out), key=_path_sort_key)


def func_module_paths(framework_md: str, func_md: str = "") -> list[tuple[str, ...]]:
    """功能测试 MD → 禅道模块：功能测试 / 首页 / …（页面树挂在功能测试下）。"""
    fw_rels = framework_module_paths(framework_md)
    out: list[tuple[str, ...]] = []
    seen: set[tuple[str, ...]] = set()
    if not fw_rels and not str(func_md or "").strip():
        return out

    def _add(path: tuple[str, ...]) -> None:
        for i in range(1, len(path) + 1):
            parent = path[:i]
            if parent not in seen:
                seen.add(parent)
                out.append(parent)

    _add(MODULE_FUNC_ROOT)
    for rel in fw_rels:
        _add(_under_func(rel))

    if str(func_md or "").strip():
        func_tree = parse_md_tree(func_md)
        raw_f: list[dict[str, Any]] = []
        for ch in func_tree.get("children") or []:
            _collect_leaves(ch, (), raw_f, kind="func")
        fw_set = set(fw_rels)
        for item in raw_f:
            mod = _best_module(tuple(item.get("module_path") or ()), fw_set)
            if mod:
                _add(_under_func(mod))
            else:
                # 功能稿有章节但框架未覆盖时，仍挂到功能测试下
                rel = tuple(
                    p
                    for p in (item.get("module_path") or ())
                    if p and not _SKIP_HEAD.match(str(p))
                )
                # 去掉文档标题层
                if rel and ("测试点" in rel[0] or "功能" in rel[0]):
                    rel = rel[1:]
                if rel:
                    _add(_under_func(rel))
    return sorted(out, key=_path_sort_key)


def _special_subpath(path: tuple[str, ...]) -> tuple[str, ...]:
    """去掉文档标题，保留五章及以下。"""
    if not path:
        return ()
    for i, name in enumerate(path):
        if name in _SPECIAL_L1 or name == "专项测试点":
            # 若命中「专项测试点」标题，取其后续；若命中五章名，从该章起
            if name == "专项测试点":
                return path[i + 1 :]
            return path[i:]
    # 去掉首个像文档标题的节点
    if len(path) >= 2 and ("专项" in path[0] or "测试点" in path[0]):
        return path[1:]
    return path


def _special_case_type(path: tuple[str, ...]) -> str:
    joined = "/".join(path)
    if "安全" in joined or "权限" in joined:
        return "安全相关"
    if "弱网" in joined:
        return "性能测试"
    if "兼容" in joined:
        return "其他"
    return "功能测试"


def sync_module_paths(
    *,
    framework_md: str,
    business_md: str = "",
    func_md: str = "",
    special_md: str = "",
    module_root: str = "",
) -> list[tuple[str, ...]]:
    """导入前同步禅道模块。

    默认四顶层：冒烟测试 / 业务场景 / 功能测试 / 专项测试。
    传入 module_root（如「小程序」）时变为：小程序 / 冒烟测试 / …，避免多原型模块混在一起。
    """
    paths: set[tuple[str, ...]] = set()
    paths.update(business_module_paths(business_md))
    paths.update(func_module_paths(framework_md, func_md))
    paths.update(special_module_paths(special_md))
    root = _normalize_module_root(module_root)
    if root:
        paths = {_with_module_root(p, root) for p in paths}
        paths.add((root,))
    return sorted(paths, key=_path_sort_key)


def _heading_paths_only(md: str) -> list[tuple[str, ...]]:
    stack: list[tuple[int, str]] = []
    out: list[tuple[str, ...]] = []
    seen: set[tuple[str, ...]] = set()
    for raw in str(md or "").splitlines():
        line = raw.strip()
        hm = re.match(r"^(#{2,6})\s+(.+)$", line)
        if not hm:
            continue
        level = len(hm.group(1))
        title = _clean_title(hm.group(2))
        if not title or _SKIP_HEAD.match(title):
            continue
        while stack and stack[-1][0] >= level:
            stack.pop()
        stack.append((level, title))
        path = tuple(t for _, t in stack)
        if path not in seen:
            seen.add(path)
            out.append(path)
    return out


def _collect_leaves(
    node: dict[str, Any],
    path: tuple[str, ...],
    out: list[dict[str, Any]],
    *,
    kind: str,
) -> None:
    kids = node.get("children") or []
    title = _clean_title(node.get("title") or "")
    intro = str(node.get("intro") or "").strip()

    if not kids:
        if not title:
            return
        pri = str(node.get("priority") or "").strip() or "2"
        body = title
        m = _PRI_RE.match(body)
        if m:
            pri = {"P0": "1", "P1": "2", "P2": "3"}.get(m.group(1).upper(), "2")
            body = body[m.end() :].strip() or title
        body = strip_source_anchor(body) or title
        full_path = path
        # 当前节点本身是叶子
        out.append(
            {
                "kind": kind,
                "module_path": full_path,
                "leaf": body,
                "intro": strip_source_anchor(intro),
                "priority": pri,
            }
        )
        return

    # 有子：标题下钻。功能用例跳过「页面功能测试点」等分区名；
    # 业务用例保留「冒烟门禁/业务场景」以便区分模块挂载。
    next_path = path
    if title:
        skip_partition = kind != "biz" and bool(_SKIP_HEAD.match(title))
        if not skip_partition:
            next_path = path + (title,)

    for ch in kids:
        _collect_leaves(ch, next_path, out, kind=kind)


def _biz_kind_and_path(path: tuple[str, ...]) -> tuple[str, tuple[str, ...]]:
    """业务 MD：冒烟门禁 vs 业务场景；模块路径去掉分区名（及之前的文档标题）。"""
    if not path:
        return "biz", ()
    for i, name in enumerate(path):
        if name == "冒烟门禁":
            return "smoke", path[i + 1 :]
        if name == "业务场景":
            return "biz", path[i + 1 :]
    return "biz", path


def extract_cases(
    *,
    framework_md: str,
    business_md: str,
    func_md: str,
    special_md: str = "",
    module_root: str = "",
) -> list[dict[str, Any]]:
    """抽出用例行（尚未绑定禅道模块 id）。"""
    fw_paths = set(framework_module_paths(framework_md))
    cases: list[dict[str, Any]] = []
    root = _normalize_module_root(module_root)

    # —— 业务：冒烟 + 场景 ——
    if str(business_md or "").strip():
        biz_tree = parse_md_tree(business_md)
        raw: list[dict[str, Any]] = []
        for ch in biz_tree.get("children") or []:
            _collect_leaves(ch, (), raw, kind="biz")

        for item in raw:
            kind, mod = _biz_kind_and_path(tuple(item["module_path"]))
            leaf = item["leaf"]
            if kind == "smoke":
                cases.append(
                    {
                        "module_path": MODULE_SMOKE_ROOT,
                        "title": leaf[:60],
                        "precondition": "",
                        "steps": [leaf],
                        "expects": ["主链路可走通，无阻断错误"],
                        "priority": "1",
                        "case_type": "功能测试",
                        "stage": "冒烟测试阶段",
                        "keywords": "冒烟",
                    }
                )
            else:
                # 不挂到页面功能框架树，统一进「业务场景」模块
                biz_path = MODULE_BIZ_ROOT + mod if mod else MODULE_BIZ_ROOT
                steps, expects = _split_condition_result(leaf)
                cases.append(
                    {
                        "module_path": biz_path,
                        "title": leaf[:60],
                        "precondition": steps[0] if len(steps) > 1 else "",
                        "steps": steps,
                        "expects": expects,
                        "priority": item["priority"],
                        "case_type": "功能测试",
                        "stage": "功能测试阶段",
                        "keywords": "业务场景",
                    }
                )

    # —— 页面功能（挂在「功能测试」下）——
    if str(func_md or "").strip():
        func_tree = parse_md_tree(func_md)
        raw_f: list[dict[str, Any]] = []
        for ch in func_tree.get("children") or []:
            _collect_leaves(ch, (), raw_f, kind="func")
        for item in raw_f:
            mod = _best_module(tuple(item["module_path"]), fw_paths)
            if not mod:
                rel = tuple(
                    p
                    for p in (item.get("module_path") or ())
                    if p and not _SKIP_HEAD.match(str(p))
                )
                if rel and ("测试点" in rel[0] or "功能" in rel[0]):
                    rel = rel[1:]
                mod = rel
            leaf = item["leaf"]
            full = _under_func(mod)
            # 标题用相对路径，避免重复「功能测试-」
            path_label = "-".join(mod) if mod else ""
            title = f"{path_label}-{leaf}" if path_label else leaf
            title = title[:120]
            cases.append(
                {
                    "module_path": full,
                    "title": title,
                    "precondition": "",
                    "steps": [f"在「{path_label or '目标页'}」执行：{leaf}"],
                    "expects": [leaf if "能" in leaf or "应" in leaf else f"界面反馈符合：{leaf}"],
                    "priority": item["priority"],
                    "case_type": "功能测试",
                    "stage": "功能测试阶段",
                    "keywords": "功能",
                }
            )

    # —— 专项测试 ——
    if str(special_md or "").strip():
        sp_tree = parse_md_tree(special_md)
        raw_s: list[dict[str, Any]] = []
        for ch in sp_tree.get("children") or []:
            _collect_leaves(ch, (), raw_s, kind="special")
        for item in raw_s:
            mod = _special_subpath(tuple(item["module_path"]))
            sp_path = MODULE_SPECIAL_ROOT + mod if mod else MODULE_SPECIAL_ROOT
            leaf = item["leaf"]
            steps, expects = _split_condition_result(leaf)
            cases.append(
                {
                    "module_path": sp_path,
                    "title": leaf[:60],
                    "precondition": steps[0] if len(steps) > 1 else "",
                    "steps": steps,
                    "expects": expects,
                    "priority": item["priority"],
                    "case_type": _special_case_type(sp_path),
                    "stage": "功能测试阶段",
                    "keywords": "专项测试",
                }
            )

    if root:
        for c in cases:
            c["module_path"] = _with_module_root(tuple(c.get("module_path") or ()), root)
    return cases


def _best_module(path: tuple[str, ...], fw_paths: set[tuple[str, ...]]) -> tuple[str, ...]:
    if not path:
        return ()
    if path in fw_paths:
        return path
    # 最长前缀匹配
    best: tuple[str, ...] = ()
    for i in range(len(path), 0, -1):
        cand = path[:i]
        if cand in fw_paths:
            return cand
        # 名称模糊：任一层名出现在框架同名
        for fp in fw_paths:
            if fp[-1] == cand[-1] and len(fp) >= len(best):
                # 优先同名末级且路径更长
                if len(fp) > len(best):
                    best = fp
        if best:
            return best
    # 末级名在框架中
    last = path[-1]
    for fp in fw_paths:
        if fp[-1] == last:
            return fp
    return path


def _split_condition_result(leaf: str) -> tuple[list[str], list[str]]:
    m = re.match(r"^（([^）]+)）\s*(.+)$", leaf)
    if m:
        return [f"前置/条件：{m.group(1)}", f"执行业务动作并观察结果"], [m.group(2).strip()]
    m2 = re.match(r"^\(([^)]+)\)\s*(.+)$", leaf)
    if m2:
        return [f"前置/条件：{m2.group(1)}", "执行业务动作并观察结果"], [m2.group(2).strip()]
    if "→" in leaf:
        a, b = leaf.split("→", 1)
        return [a.strip() or "执行操作"], [b.strip() or "结果符合预期"]
    return [leaf], ["业务结果符合预期"]


def format_module_field(path: tuple[str, ...], module_id: int | None) -> str:
    mid = int(module_id or 0)
    if not path:
        return f"/(#{mid})"
    joined = "/".join(path)
    return f"/{joined}(#{mid})"


def cases_to_csv(
    cases: list[dict[str, Any]],
    *,
    path_to_id: dict[tuple[str, ...], int] | None = None,
) -> str:
    """生成禅道导入 CSV（utf-8-sig）。"""
    path_to_id = path_to_id or {}
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(
        [
            "所属模块",
            "用例标题",
            "前置条件",
            "步骤",
            "预期",
            "关键词",
            "优先级",
            "用例类型",
            "适用阶段",
        ]
    )
    for c in cases:
        path = tuple(c.get("module_path") or ())
        mid = path_to_id.get(path)
        if mid is None and path:
            # 尝试前缀
            for i in range(len(path), 0, -1):
                if path[:i] in path_to_id:
                    mid = path_to_id[path[:i]]
                    path = path[:i]
                    break
        mid = int(mid or 0)
        steps = c.get("steps") or []
        expects = c.get("expects") or []
        step_txt = "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
        exp_txt = "\n".join(f"{i}. {e}" for i, e in enumerate(expects, 1))
        writer.writerow(
            [
                format_module_field(path, mid),
                c.get("title") or "",
                c.get("precondition") or "",
                step_txt,
                exp_txt,
                c.get("keywords") or "",
                c.get("priority") or "2",
                c.get("case_type") or "功能测试",
                c.get("stage") or "功能测试阶段",
            ]
        )
    return "\ufeff" + buf.getvalue()


def build_export(
    *,
    framework_md: str,
    business_md: str,
    func_md: str,
    special_md: str = "",
    path_to_id: dict[tuple[str, ...], int] | None = None,
    module_root: str = "",
) -> dict[str, Any]:
    modules = sync_module_paths(
        framework_md=framework_md,
        business_md=business_md,
        func_md=func_md,
        special_md=special_md,
        module_root=module_root,
    )
    cases = extract_cases(
        framework_md=framework_md,
        business_md=business_md,
        func_md=func_md,
        special_md=special_md,
        module_root=module_root,
    )
    csv_text = cases_to_csv(cases, path_to_id=path_to_id)
    return {
        "modules": ["/".join(p) for p in modules],
        "module_paths": modules,
        "case_count": len(cases),
        "csv": csv_text,
        "cases": cases,
        "moduleRoot": _normalize_module_root(module_root),
    }
