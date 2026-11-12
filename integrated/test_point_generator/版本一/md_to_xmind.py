#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
MD文件批量转换为XMind文件
将"测试点输出"目录下的md文件转换为xmind文件，保存到"域1.1xmind"目录

使用方法:
1. 安装依赖: pip install -r requirements.txt
2. 运行脚本: python md_to_xmind.py

注意: 需要安装xmind库，如果遇到API问题，可能需要安装特定版本:
pip install xmind==1.2.0
"""

import os
import re
from pathlib import Path

try:
    import xmind
except ImportError:
    print("错误: 未安装xmind库，请运行: pip install xmind")
    exit(1)


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
    # 方法：先创建一个临时文件，然后加载它作为模板
    reference_file = r"C:\Users\yzyz\Desktop\测试点生成\域1.1xmind\大奇遇详情测试点.xmind"
    
    try:
        # 如果参考文件存在，使用它作为模板
        if os.path.exists(reference_file):
            # 复制参考文件到输出路径（作为基础）
            import shutil
            shutil.copy2(reference_file, output_path)
            
            # 加载复制的文件
            workbook = xmind.load(output_path)
            sheet = workbook.getPrimarySheet()
            root_topic = sheet.getRootTopic()
            
            # 清空所有子节点 - 使用更可靠的方法
            # 获取所有子节点并逐个删除
            while True:
                try:
                    sub_topics = root_topic.getSubTopics()
                    if not sub_topics or len(sub_topics) == 0:
                        break
                    # 删除第一个子节点
                    root_topic.removeSubTopic(sub_topics[0])
                except:
                    break
            
            # 设置新的标题
            root_topic.setTitle(parsed_data['title'])
            
            # 设置备注（笔记）
            if parsed_data['notes']:
                try:
                    root_topic.setNotes(parsed_data['notes'])
                except:
                    try:
                        root_topic.setPlainNotes(parsed_data['notes'])
                    except:
                        pass
            
            # 添加维度（第二级）
            for dimension in parsed_data['structure']:
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
            xmind.save(workbook, output_path)
            print(f"✓ 已生成: {output_path}")
        else:
            # 如果参考文件不存在，尝试创建新文件
            raise Exception(f"参考文件不存在: {reference_file}，无法创建模板")
            
    except Exception as e:
        raise Exception(f"创建XMind文件失败: {str(e)}")


def convert_md_to_xmind(md_file_path, output_dir):
    """将单个MD文件转换为XMind文件"""
    try:
        # 读取MD文件
        with open(md_file_path, 'r', encoding='utf-8') as f:
            md_content = f.read()
        
        # 解析MD内容
        parsed_data = parse_markdown(md_content)
        
        # 生成输出文件路径
        md_file_name = Path(md_file_path).stem
        output_file_path = os.path.join(output_dir, f"{md_file_name}.xmind")
        
        # 创建XMind文件
        create_xmind(parsed_data, output_file_path)
        
        return True
    except Exception as e:
        print(f"✗ 转换失败 {md_file_path}: {str(e)}")
        return False


def batch_convert(input_dir, output_dir):
    """批量转换目录下的所有MD文件"""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    # 确保输出目录存在
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 统计信息
    total_files = 0
    success_files = 0
    
    # 递归遍历所有MD文件
    for md_file in input_path.rglob('*.md'):
        # 跳过测试计划等特殊文件（可选）
        if md_file.name == '测试计划.md':
            continue
        
        total_files += 1
        
        # 保持相对目录结构
        relative_path = md_file.relative_to(input_path)
        relative_dir = relative_path.parent
        
        # 创建对应的输出目录
        output_subdir = output_path / relative_dir
        output_subdir.mkdir(parents=True, exist_ok=True)
        
        # 转换文件
        if convert_md_to_xmind(str(md_file), str(output_subdir)):
            success_files += 1
    
    print(f"\n转换完成！")
    print(f"总计: {total_files} 个文件")
    print(f"成功: {success_files} 个文件")
    print(f"失败: {total_files - success_files} 个文件")


if __name__ == '__main__':
    # 设置输入和输出目录
    script_dir = Path(__file__).parent
    input_directory = script_dir / '测试点输出'
    output_directory = script_dir / '域1.1xmind'
    
    print("=" * 50)
    print("MD文件批量转换为XMind文件")
    print("=" * 50)
    print(f"输入目录: {input_directory}")
    print(f"输出目录: {output_directory}")
    print()
    
    # 执行批量转换
    batch_convert(str(input_directory), str(output_directory))
