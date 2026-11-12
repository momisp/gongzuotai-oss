#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""测试单个MD文件转换为XMind"""

import os
import re
from pathlib import Path
import xmind

def parse_markdown(md_content):
    """解析Markdown内容，返回结构化数据"""
    lines = md_content.split('\n')
    
    # 提取标题（第一级）
    title = None
    notes = []
    structure = []
    
    current_dimension = None
    current_module = None
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # 提取第一级标题
        if line.startswith('# ') and not title:
            title = line[2:].strip()
            # 移除"测试点"后缀（如果存在）
            if title.endswith('测试点'):
                title = title[:-3].strip()
        
        # 提取注释块（笔记）
        elif line.startswith('<!--'):
            note_lines = [line]
            i += 1
            while i < len(lines) and not lines[i].strip().endswith('-->'):
                note_lines.append(lines[i])
                i += 1
            if i < len(lines):
                note_lines.append(lines[i])
            note_text = '\n'.join(note_lines)
            # 提取笔记内容（去掉注释标记）
            note_content = re.sub(r'<!--\s*笔记：?\s*', '', note_text)
            note_content = re.sub(r'\s*-->', '', note_content)
            notes.append(note_content.strip())
        
        # 提取第二级标题（维度）
        elif line.startswith('## '):
            dimension_name = line[3:].strip()
            current_dimension = {
                'name': dimension_name,
                'modules': []
            }
            structure.append(current_dimension)
            current_module = None
        
        # 提取第三级标题（模块）
        elif line.startswith('### '):
            module_name = line[4:].strip()
            current_module = {
                'name': module_name,
                'test_points': []
            }
            if current_dimension:
                current_dimension['modules'].append(current_module)
        
        # 提取列表项（测试点）
        elif line.startswith('- ') and current_module:
            test_point = line[2:].strip()
            current_module['test_points'].append(test_point)
        
        i += 1
    
    return {
        'title': title or '未命名',
        'notes': '\n\n'.join(notes) if notes else '',
        'structure': structure
    }


def create_xmind(parsed_data, output_path):
    """根据解析的数据创建XMind文件"""
    reference_file = r"C:\Users\yzyz\Desktop\测试点生成\域1.1xmind\大奇遇详情测试点.xmind"
    
    if not os.path.exists(reference_file):
        print(f"错误: 参考文件不存在: {reference_file}")
        return False
    
    try:
        import shutil
        
        print(f"复制参考文件到输出路径...")
        # 复制参考文件到输出路径（作为基础）
        shutil.copy2(reference_file, output_path)
        print(f"✓ 文件复制成功")
        
        print(f"加载文件: {output_path}")
        # 加载复制的文件
        workbook = xmind.load(output_path)
        print("✓ 文件加载成功")
        
        sheet = workbook.getPrimarySheet()
        print("✓ 获取sheet成功")
        
        root_topic = sheet.getRootTopic()
        print(f"✓ 获取根节点成功，当前标题: {root_topic.getTitle()}")
        
        # 清空原有内容 - 使用循环删除
        print("清空原有内容...")
        deleted_count = 0
        while True:
            try:
                sub_topics = root_topic.getSubTopics()
                if not sub_topics or len(sub_topics) == 0:
                    break
                # 删除第一个子节点
                root_topic.removeSubTopic(sub_topics[0])
                deleted_count += 1
            except Exception as e:
                print(f"  清空完成或出错: {e}")
                break
        print(f"  ✓ 删除了 {deleted_count} 个子节点")
        
        # 设置新的标题
        print(f"设置新标题: {parsed_data['title']}")
        root_topic.setTitle(parsed_data['title'])
        
        # 设置备注（笔记）
        if parsed_data['notes']:
            print("设置备注...")
            try:
                root_topic.setNotes(parsed_data['notes'])
                print("✓ 备注设置成功")
            except Exception as e:
                print(f"  设置备注失败（可选）: {e}")
        
        # 添加维度（第二级）
        print(f"添加 {len(parsed_data['structure'])} 个维度...")
        for idx, dimension in enumerate(parsed_data['structure'], 1):
            print(f"  维度 {idx}: {dimension['name']}")
            dimension_topic = root_topic.addSubTopic()
            dimension_topic.setTitle(dimension['name'])
            
            # 添加模块（第三级）
            for module in dimension['modules']:
                module_topic = dimension_topic.addSubTopic()
                module_topic.setTitle(module['name'])
                
                # 添加测试点（第四级）
                for test_point in module['test_points']:
                    test_point_topic = module_topic.addSubTopic()
                    test_point_topic.setTitle(test_point)
        
        # 保存文件
        print(f"保存文件到: {output_path}")
        xmind.save(workbook, output_path)
        print(f"✓ 文件保存成功: {output_path}")
        return True
        
    except Exception as e:
        print(f"✗ 创建XMind文件失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    # 测试单个文件
    test_md_file = r"C:\Users\yzyz\Desktop\测试点生成\测试点输出\大奇遇详情.md"
    test_output = r"C:\Users\yzyz\Desktop\测试点生成\域1.1xmind\大奇遇详情_测试.xmind"
    
    print("=" * 60)
    print("单文件转换测试")
    print("=" * 60)
    print(f"输入文件: {test_md_file}")
    print(f"输出文件: {test_output}")
    print()
    
    if not os.path.exists(test_md_file):
        print(f"错误: 输入文件不存在: {test_md_file}")
        exit(1)
    
    # 读取MD文件
    print("读取MD文件...")
    with open(test_md_file, 'r', encoding='utf-8') as f:
        md_content = f.read()
    print("✓ MD文件读取成功")
    print()
    
    # 解析MD内容
    print("解析MD内容...")
    parsed_data = parse_markdown(md_content)
    print(f"✓ 解析成功")
    print(f"  标题: {parsed_data['title']}")
    print(f"  维度数: {len(parsed_data['structure'])}")
    print(f"  备注长度: {len(parsed_data['notes'])} 字符")
    print()
    
    # 创建XMind文件
    success = create_xmind(parsed_data, test_output)
    
    if success:
        print()
        print("=" * 60)
        print("✓ 转换成功！请尝试打开生成的文件:")
        print(f"  {test_output}")
        print("=" * 60)
    else:
        print()
        print("=" * 60)
        print("✗ 转换失败")
        print("=" * 60)
