#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
使用XMind的导入功能批量转换MD文件
通过UI自动化调用XMind的"文件 -> 导入 -> Markdown"功能
"""

import os
import time
from pathlib import Path

try:
    import pywinauto
    from pywinauto import Application
except ImportError:
    print("错误: 未安装pywinauto库")
    print("请运行: pip install pywinauto")
    exit(1)


def import_markdown_to_xmind(md_file_path, xmind_output_path, xmind_exe_path=None):
    """
    使用XMind的导入功能将MD文件转换为XMind文件
    
    Args:
        md_file_path: MD文件路径
        xmind_output_path: 输出的XMind文件路径
        xmind_exe_path: XMind可执行文件路径（可选，会自动查找）
    """
    try:
        # 查找XMind进程
        if xmind_exe_path and os.path.exists(xmind_exe_path):
            # 如果提供了XMind路径，启动它
            app = Application().start(xmind_exe_path)
            time.sleep(3)  # 等待XMind启动
        else:
            # 尝试连接到已运行的XMind
            try:
                app = Application().connect(title_re=".*XMind.*", timeout=5)
            except:
                # 如果找不到，尝试启动XMind
                # Windows上常见的XMind安装路径
                possible_paths = [
                    r"C:\Program Files\XMind\XMind.exe",
                    r"C:\Program Files (x86)\XMind\XMind.exe",
                    os.path.expanduser(r"~\AppData\Local\Programs\XMind\XMind.exe"),
                ]
                
                xmind_found = False
                for path in possible_paths:
                    if os.path.exists(path):
                        app = Application().start(path)
                        time.sleep(3)
                        xmind_found = True
                        break
                
                if not xmind_found:
                    raise Exception("无法找到XMind程序，请手动打开XMind后再运行脚本")
        
        # 获取主窗口
        main_window = app.top_window()
        
        # 方法1: 使用菜单栏
        try:
            # 点击"文件"菜单
            main_window.menu_select("文件(&F)->导入(&I)->Markdown")
        except:
            # 方法2: 使用快捷键（Ctrl+O打开文件对话框，然后选择导入）
            try:
                main_window.type_keys("^o")  # Ctrl+O
                time.sleep(1)
                # 在文件对话框中切换到导入模式
                # 这需要根据XMind的具体界面调整
            except:
                # 方法3: 直接使用键盘快捷键（如果XMind支持）
                main_window.type_keys("^+i")  # Ctrl+Shift+I (假设的导入快捷键)
                time.sleep(1)
        
        # 等待文件选择对话框
        time.sleep(1)
        
        # 在文件选择对话框中输入MD文件路径
        try:
            # 获取文件对话框
            file_dialog = app.window(title_re=".*打开.*|.*导入.*|.*选择.*")
            file_dialog.wait("visible", timeout=5)
            
            # 在文件名输入框中输入路径
            file_dialog.Edit.set_text(md_file_path)
            time.sleep(0.5)
            
            # 点击打开/确定按钮
            file_dialog["打开(&O)"].click()
            # 或者尝试其他可能的按钮文本
            # file_dialog["确定"].click()
            # file_dialog["OK"].click()
            
        except Exception as e:
            print(f"文件对话框操作失败: {e}")
            # 尝试使用pyautogui作为备选方案
            try:
                import pyautogui
                # 使用Alt+F打开文件菜单
                pyautogui.hotkey('alt', 'f')
                time.sleep(0.5)
                # 输入'i'选择导入
                pyautogui.press('i')
                time.sleep(0.5)
                # 输入'm'选择Markdown
                pyautogui.press('m')
                time.sleep(1)
                
                # 在文件对话框中输入路径
                pyautogui.write(md_file_path)
                time.sleep(0.5)
                pyautogui.press('enter')
                
            except ImportError:
                print("请安装pyautogui: pip install pyautogui")
                raise
        
        # 等待导入完成
        time.sleep(3)
        
        # 保存文件
        try:
            # 使用另存为功能
            main_window.menu_select("文件(&F)->另存为(&A)")
            time.sleep(1)
            
            # 在另存为对话框中输入输出路径
            save_dialog = app.window(title_re=".*另存为.*|.*保存.*")
            save_dialog.wait("visible", timeout=5)
            save_dialog.Edit.set_text(xmind_output_path)
            time.sleep(0.5)
            save_dialog["保存(&S)"].click()
            
            time.sleep(2)
            print(f"✓ 已导入并保存: {xmind_output_path}")
            return True
            
        except Exception as e:
            print(f"保存文件失败: {e}")
            # 如果自动保存失败，提示用户手动保存
            print(f"请手动保存文件为: {xmind_output_path}")
            return False
            
    except Exception as e:
        print(f"✗ 导入失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def batch_import_markdown(input_dir, output_dir, xmind_exe_path=None):
    """批量导入MD文件到XMind"""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    # 确保输出目录存在
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 获取所有MD文件
    md_files = list(input_path.rglob('*.md'))
    
    # 跳过测试计划
    md_files = [f for f in md_files if f.name != '测试计划.md']
    
    print(f"找到 {len(md_files)} 个MD文件")
    print("=" * 60)
    print("注意: 请确保XMind已经打开，或者脚本会自动启动XMind")
    print("=" * 60)
    print()
    
    success_count = 0
    for idx, md_file in enumerate(md_files, 1):
        print(f"[{idx}/{len(md_files)}] 处理: {md_file.name}")
        
        # 生成输出路径
        relative_path = md_file.relative_to(input_path)
        relative_dir = relative_path.parent
        output_subdir = output_path / relative_dir
        output_subdir.mkdir(parents=True, exist_ok=True)
        
        xmind_output = output_subdir / f"{md_file.stem}.xmind"
        
        # 导入文件
        if import_markdown_to_xmind(str(md_file), str(xmind_output), xmind_exe_path):
            success_count += 1
        
        # 每个文件之间稍作延迟
        time.sleep(2)
    
    print()
    print("=" * 60)
    print(f"转换完成！成功: {success_count}/{len(md_files)}")
    print("=" * 60)


if __name__ == '__main__':
    # 设置路径
    script_dir = Path(__file__).parent
    input_directory = script_dir / '测试点输出'
    output_directory = script_dir / '域1.1xmind'
    
    # XMind可执行文件路径（可选，如果不提供会自动查找）
    xmind_path = None  # 例如: r"C:\Program Files\XMind\XMind.exe"
    
    print("=" * 60)
    print("使用XMind导入功能批量转换MD文件")
    print("=" * 60)
    print(f"输入目录: {input_directory}")
    print(f"输出目录: {output_directory}")
    print()
    
    batch_import_markdown(str(input_directory), str(output_directory), xmind_path)
