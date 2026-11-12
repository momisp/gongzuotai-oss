#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""测试单个MD文件导入到XMind"""

import os
import time
from pathlib import Path

try:
    import pyautogui
except ImportError:
    print("错误: 未安装pyautogui库")
    print("请运行: pip install pyautogui")
    exit(1)


def import_single_file(md_file_path, xmind_output_path):
    """导入单个MD文件"""
    print("=" * 60)
    print("单文件导入测试")
    print("=" * 60)
    print(f"MD文件: {md_file_path}")
    print(f"输出XMind文件: {xmind_output_path}")
    print()
    print("⚠️  请确保:")
    print("1. XMind软件已打开")
    print("2. XMind窗口处于活动状态（点击一下XMind窗口）")
    print()
    input("准备好后按Enter键开始...")
    
    try:
        print("\n开始导入...")
        
        # Alt+F 打开文件菜单
        print("1. 打开文件菜单 (Alt+F)...")
        pyautogui.hotkey('alt', 'f')
        time.sleep(1)
        
        # 输入 'i' 选择导入
        print("2. 选择导入 (按 'i')...")
        pyautogui.press('i')
        time.sleep(1)
        
        # 输入 'm' 选择Markdown
        print("3. 选择Markdown (按 'm')...")
        pyautogui.press('m')
        time.sleep(2)
        
        # 在文件选择对话框中输入MD文件路径
        print("4. 输入文件路径...")
        pyautogui.hotkey('ctrl', 'a')  # 全选
        time.sleep(0.3)
        pyautogui.write(md_file_path)
        time.sleep(0.5)
        
        # 按Enter确认
        print("5. 确认导入 (按Enter)...")
        pyautogui.press('enter')
        time.sleep(3)  # 等待导入完成
        
        print("✓ 导入完成")
        
        # 保存文件
        print("\n6. 保存文件 (Ctrl+Shift+S)...")
        pyautogui.hotkey('ctrl', 'shift', 's')
        time.sleep(1.5)
        
        # 在另存为对话框中输入路径
        print("7. 输入保存路径...")
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.3)
        pyautogui.write(xmind_output_path)
        time.sleep(0.5)
        pyautogui.press('enter')
        time.sleep(2)
        
        # 如果出现覆盖确认对话框，按Enter确认
        time.sleep(1)
        pyautogui.press('enter')
        
        print(f"\n✓ 成功保存到: {xmind_output_path}")
        return True
        
    except Exception as e:
        print(f"\n✗ 导入失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    # 测试文件
    test_md = r"C:\Users\yzyz\Desktop\测试点生成\测试点输出\大奇遇详情.md"
    test_output = r"C:\Users\yzyz\Desktop\测试点生成\域1.1xmind\大奇遇详情_导入测试.xmind"
    
    if not os.path.exists(test_md):
        print(f"错误: 测试文件不存在: {test_md}")
        exit(1)
    
    # 确保输出目录存在
    os.makedirs(os.path.dirname(test_output), exist_ok=True)
    
    import_single_file(test_md, test_output)
