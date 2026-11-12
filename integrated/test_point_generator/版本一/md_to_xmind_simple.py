#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
简化版：使用pyautogui自动化XMind导入功能
这个方法更简单，但需要XMind窗口可见
"""

import os
import time
from pathlib import Path

try:
    import pyautogui
except ImportError:
    print("错误: 未安装pyautogui库")
    print("请运行: pip install pyautogui")
    exit(1)


def import_markdown_simple(md_file_path, xmind_output_path):
    """
    使用pyautogui模拟键盘操作导入MD文件
    
    注意: 需要XMind窗口处于活动状态
    """
    try:
        print(f"准备导入: {md_file_path}")
        
        # 等待用户将XMind窗口激活（给3秒时间）
        print("请在3秒内激活XMind窗口...")
        time.sleep(3)
        
        # 方法1: 使用菜单快捷键 Alt+F -> I -> M
        # Alt+F 打开文件菜单
        pyautogui.hotkey('alt', 'f')
        time.sleep(0.8)
        
        # 输入 'i' 选择导入
        pyautogui.press('i')
        time.sleep(0.8)
        
        # 输入 'm' 选择Markdown
        pyautogui.press('m')
        time.sleep(1.5)
        
        # 在文件选择对话框中输入MD文件路径
        # 先清空输入框（Ctrl+A然后删除）
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.3)
        
        # 输入完整路径
        pyautogui.write(md_file_path)
        time.sleep(0.5)
        
        # 按Enter确认
        pyautogui.press('enter')
        time.sleep(3)  # 等待导入完成
        
        print("✓ 导入完成")
        
        # 保存文件
        print(f"保存文件到: {xmind_output_path}")
        
        # 使用另存为 Ctrl+Shift+S
        pyautogui.hotkey('ctrl', 'shift', 's')
        time.sleep(1.5)
        
        # 在另存为对话框中输入路径
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.3)
        pyautogui.write(xmind_output_path)
        time.sleep(0.5)
        pyautogui.press('enter')
        time.sleep(2)
        
        # 如果出现覆盖确认对话框，按Enter确认
        time.sleep(1)
        pyautogui.press('enter')
        
        print(f"✓ 已保存: {xmind_output_path}")
        return True
        
    except Exception as e:
        print(f"✗ 导入失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def batch_import_simple(input_dir, output_dir):
    """批量导入（简化版）"""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    output_path.mkdir(parents=True, exist_ok=True)
    
    md_files = list(input_path.rglob('*.md'))
    md_files = [f for f in md_files if f.name != '测试计划.md']
    
    print("=" * 60)
    print("简化版MD转XMind批量导入")
    print("=" * 60)
    print(f"找到 {len(md_files)} 个MD文件")
    print()
    print("⚠️  重要提示:")
    print("1. 请先打开XMind软件")
    print("2. 确保XMind窗口可见且处于活动状态")
    print("3. 脚本运行时会自动操作XMind")
    print("4. 每个文件转换后会有3秒延迟，可以在此期间检查结果")
    print()
    input("按Enter键开始转换...")
    
    success_count = 0
    for idx, md_file in enumerate(md_files, 1):
        print()
        print(f"[{idx}/{len(md_files)}] 处理: {md_file.name}")
        
        relative_path = md_file.relative_to(input_path)
        relative_dir = relative_path.parent
        output_subdir = output_path / relative_dir
        output_subdir.mkdir(parents=True, exist_ok=True)
        
        xmind_output = output_subdir / f"{md_file.stem}.xmind"
        
        if import_markdown_simple(str(md_file), str(xmind_output)):
            success_count += 1
        
        # 延迟，让用户有时间检查
        if idx < len(md_files):
            print("等待3秒后处理下一个文件...")
            time.sleep(3)
    
    print()
    print("=" * 60)
    print(f"转换完成！成功: {success_count}/{len(md_files)}")
    print("=" * 60)


if __name__ == '__main__':
    script_dir = Path(__file__).parent
    input_directory = script_dir / '测试点输出'
    output_directory = script_dir / '域1.1xmind'
    
    print("=" * 60)
    print("简化版：使用XMind导入功能批量转换MD文件")
    print("=" * 60)
    print(f"输入目录: {input_directory}")
    print(f"输出目录: {output_directory}")
    print()
    
    batch_import_simple(str(input_directory), str(output_directory))
