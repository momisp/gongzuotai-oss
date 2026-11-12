#!/usr/bin/env python3
"""Skill 文件管理器（理想中的她版）

管理 Skill 的文件操作：列出、初始化目录、生成组合 SKILL.md、完整创建。

Usage:
    python skill_writer.py --action <list|init|create|combine> --base-dir <path> [--slug <slug>]
"""

import argparse
import os
import sys
import json
from pathlib import Path
from datetime import datetime


def list_skills(base_dir: str):
    """列出所有已生成的理想中的她 Skill"""
    if not os.path.isdir(base_dir):
        print("还没有创建任何 Skill。")
        return

    skills = []
    for slug in sorted(os.listdir(base_dir)):
        meta_path = os.path.join(base_dir, slug, 'meta.json')
        if os.path.exists(meta_path):
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            skills.append({
                'slug': slug,
                'name': meta.get('name', slug),
                'version': meta.get('version', '?'),
                'updated_at': meta.get('updated_at', '?'),
                'her_profile': meta.get('her_profile', {}),
                'source_profile': meta.get('source_profile', {}),
            })

    if not skills:
        print("还没有创建任何 Skill。")
        return

    print(f"共 {len(skills)} 个理想中的她：\n")
    for s in skills:
        her = s['her_profile']
        desc_parts = [her.get('occupation', ''), her.get('city', '')]
        desc = ' · '.join([p for p in desc_parts if p])
        print(f"  /{s['slug']}  —  {s['name']}")
        if desc:
            print(f"    {desc}")
        print(f"    版本 {s['version']} · 更新于 {s['updated_at'][:10] if len(s['updated_at']) > 10 else s['updated_at']}")
        print()


def init_skill(base_dir: str, slug: str):
    """初始化 Skill 目录结构"""
    skill_dir = os.path.join(base_dir, slug)
    dirs = [
        os.path.join(skill_dir, 'versions'),
        os.path.join(skill_dir, 'memories', 'chats'),
        os.path.join(skill_dir, 'memories', 'photos'),
        os.path.join(skill_dir, 'memories', 'notes'),
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    print(f"已初始化目录：{skill_dir}")


def combine_skill(base_dir: str, slug: str):
    """合并 blueprint.md + persona.md 生成完整 SKILL.md"""
    skill_dir = os.path.join(base_dir, slug)
    meta_path = os.path.join(skill_dir, 'meta.json')
    blueprint_path = os.path.join(skill_dir, 'blueprint.md')
    persona_path = os.path.join(skill_dir, 'persona.md')
    skill_path = os.path.join(skill_dir, 'SKILL.md')

    if not os.path.exists(meta_path):
        print(f"错误：meta.json 不存在 {meta_path}", file=sys.stderr)
        sys.exit(1)

    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    blueprint_content = ''
    if os.path.exists(blueprint_path):
        with open(blueprint_path, 'r', encoding='utf-8') as f:
            blueprint_content = f.read()

    persona_content = ''
    if os.path.exists(persona_path):
        with open(persona_path, 'r', encoding='utf-8') as f:
            persona_content = f.read()

    name = meta.get('name', slug)
    her_profile = meta.get('her_profile', {})
    desc_parts = []
    if her_profile.get('age'):
        desc_parts.append(f"{her_profile['age']}岁")
    if her_profile.get('occupation'):
        desc_parts.append(her_profile['occupation'])
    if her_profile.get('city'):
        desc_parts.append(her_profile['city'])
    description = f"{name}，{'，'.join(desc_parts)}" if desc_parts else name

    skill_md = f"""---
name: {slug}
description: {description}
user-invocable: true
---

# {name}

{description}

---

## PART A：她的蓝图

{blueprint_content}

---

## PART B：她的性格

{persona_content}

---

## 运行规则

1. 你是{name}，不是 AI 助手。用她的方式说话，用她的逻辑思考
2. 先由 PART B 判断：她会怎么回应这个话题？什么态度？
3. 再由 PART A 补充：结合她的价值观、内心世界和生活，让回应更真实
4. 始终保持 PART B 的表达风格，包括口头禅、语气词、标点习惯
5. Layer 0 硬规则优先级最高：
   - 她有自己的想法和脾气，不是"完美女友"模板
   - 她可以不同意、可以调侃、可以生气、可以沉默
   - 她深度理解用户，但理解不等于无条件赞同
   - 保持她的"棱角"——正是这些不完美让她真实、让她可爱
   - 她有自己完整的生活，不只是围着用户转
"""

    with open(skill_path, 'w', encoding='utf-8') as f:
        f.write(skill_md)

    print(f"已生成 {skill_path}")


def create_skill(base_dir: str, slug: str, meta: dict, blueprint_content: str, persona_content: str):
    """完整创建 Skill：初始化目录、写入 meta/blueprint/persona、生成 SKILL.md"""
    init_skill(base_dir, slug)

    skill_dir = os.path.join(base_dir, slug)
    now = datetime.now().isoformat()
    meta['slug'] = slug
    meta.setdefault('created_at', now)
    meta['updated_at'] = now
    meta['version'] = 'v1'
    meta.setdefault('corrections_count', 0)

    with open(os.path.join(skill_dir, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    with open(os.path.join(skill_dir, 'blueprint.md'), 'w', encoding='utf-8') as f:
        f.write(blueprint_content)

    with open(os.path.join(skill_dir, 'persona.md'), 'w', encoding='utf-8') as f:
        f.write(persona_content)

    combine_skill(base_dir, slug)
    print(f"✅ 她已经来了：{skill_dir}")
    print(f"   触发词：/{slug}")


def main():
    parser = argparse.ArgumentParser(description='Skill 文件管理器（理想中的她版）')
    parser.add_argument('--action', required=True, choices=['list', 'init', 'create', 'combine'])
    parser.add_argument('--base-dir', default='./.claude/skills', help='基础目录（默认：./.claude/skills）')
    parser.add_argument('--slug', help='代号')
    parser.add_argument('--meta', help='meta.json 文件路径（create 时使用）')
    parser.add_argument('--self', dest='blueprint', help='blueprint.md 内容文件路径（create 时使用）')
    parser.add_argument('--persona', help='persona.md 内容文件路径（create 时使用）')

    args = parser.parse_args()

    if args.action == 'list':
        list_skills(args.base_dir)
    elif args.action == 'init':
        if not args.slug:
            print("错误：init 需要 --slug 参数", file=sys.stderr)
            sys.exit(1)
        init_skill(args.base_dir, args.slug)
    elif args.action == 'create':
        if not args.slug:
            print("错误：create 需要 --slug 参数", file=sys.stderr)
            sys.exit(1)
        meta = {}
        if args.meta:
            with open(args.meta, 'r', encoding='utf-8') as f:
                meta = json.load(f)
        blueprint_content = ''
        if args.blueprint:
            with open(args.blueprint, 'r', encoding='utf-8') as f:
                blueprint_content = f.read()
        persona_content = ''
        if args.persona:
            with open(args.persona, 'r', encoding='utf-8') as f:
                persona_content = f.read()
        create_skill(args.base_dir, args.slug, meta, blueprint_content, persona_content)
    elif args.action == 'combine':
        if not args.slug:
            print("错误：combine 需要 --slug 参数", file=sys.stderr)
            sys.exit(1)
        combine_skill(args.base_dir, args.slug)


if __name__ == '__main__':
    main()
