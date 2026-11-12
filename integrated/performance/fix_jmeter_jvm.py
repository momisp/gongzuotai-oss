#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
JMeter JVM配置优化脚本
自动修改jmeter.bat中的JVM内存配置，使其与GUI版本一致
"""

import os
import re
import shutil
from pathlib import Path


def backup_file(file_path):
    """备份文件"""
    backup_path = str(file_path) + ".backup"
    if not os.path.exists(backup_path):
        shutil.copy2(file_path, backup_path)
        print(f"[备份] 已创建备份文件: {backup_path}")
        return True
    else:
        print(f"[提示] 备份文件已存在: {backup_path}")
        return False


def fix_jmeter_bat(jmeter_bat_path, heap_size="1g"):
    """修复jmeter.bat中的JVM配置"""
    if not os.path.exists(jmeter_bat_path):
        print(f"[错误] 文件不存在: {jmeter_bat_path}")
        return False
    
    # 备份原文件
    backup_file(jmeter_bat_path)
    
    # 读取文件内容
    try:
        with open(jmeter_bat_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        print(f"[错误] 无法读取文件: {e}")
        return False
    
    original_content = content
    modified = False
    
    # 查找并修改HEAP配置
    heap_pattern = r'(set\s+HEAP\s*=\s*)(.+?)(\r?\n)'
    heap_match = re.search(heap_pattern, content, re.IGNORECASE | re.MULTILINE)
    
    if heap_match:
        old_heap = heap_match.group(2).strip()
        new_heap = f"-Xms{heap_size} -Xmx{heap_size} -XX:MaxMetaspaceSize=256m"
        content = re.sub(
            heap_pattern,
            rf'\1{new_heap}\3',
            content,
            flags=re.IGNORECASE | re.MULTILINE
        )
        print(f"[修改] HEAP配置:")
        print(f"  原值: {old_heap}")
        print(f"  新值: {new_heap}")
        modified = True
    else:
        # 如果不存在HEAP配置，添加一个
        # 找到合适的位置插入（通常在set JMETER_HOME之后）
        insert_pattern = r'(set\s+JMETER_HOME\s*=.+?\r?\n)'
        insert_match = re.search(insert_pattern, content, re.IGNORECASE | re.MULTILINE)
        if insert_match:
            new_heap_line = f"set HEAP=-Xms{heap_size} -Xmx{heap_size} -XX:MaxMetaspaceSize=256m\r\n"
            content = re.sub(
                insert_pattern,
                rf'\1{new_heap_line}',
                content,
                flags=re.IGNORECASE | re.MULTILINE
            )
            print(f"[添加] HEAP配置: -Xms{heap_size} -Xmx{heap_size} -XX:MaxMetaspaceSize=256m")
            modified = True
    
    # 查找并优化GC配置
    gc_pattern = r'(set\s+NEW\s*=\s*)(.+?)(\r?\n)'
    gc_match = re.search(gc_pattern, content, re.IGNORECASE | re.MULTILINE)
    
    if gc_match:
        old_gc = gc_match.group(2).strip()
        # 检查是否已有G1GC
        if 'UseG1GC' not in old_gc:
            new_gc = f"{old_gc} -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
            content = re.sub(
                gc_pattern,
                rf'\1{new_gc}\3',
                content,
                flags=re.IGNORECASE | re.MULTILINE
            )
            print(f"[优化] GC配置:")
            print(f"  原值: {old_gc}")
            print(f"  新值: {new_gc}")
            modified = True
    
    # 如果内容有修改，写回文件
    if modified and content != original_content:
        try:
            with open(jmeter_bat_path, 'w', encoding='utf-8', newline='') as f:
                f.write(content)
            print(f"[成功] 已更新文件: {jmeter_bat_path}")
            return True
        except Exception as e:
            print(f"[错误] 无法写入文件: {e}")
            return False
    else:
        print("[提示] 未发现需要修改的配置")
        return False


def main():
    """主函数"""
    print("=" * 60)
    print("JMeter JVM配置优化工具")
    print("=" * 60)
    print()
    
    JMETER_HOME = r"f:\test_tools\apache-jmeter-5.4.3\apache-jmeter-5.4.3"
    JMETER_BIN = os.path.join(JMETER_HOME, "bin")
    JMETER_BAT = os.path.join(JMETER_BIN, "jmeter.bat")
    
    if not os.path.exists(JMETER_BAT):
        print(f"[错误] 未找到jmeter.bat: {JMETER_BAT}")
        input("按回车键退出...")
        return
    
    print(f"[信息] JMeter路径: {JMETER_BAT}")
    print()
    
    # 询问堆内存大小
    print("请选择堆内存大小：")
    print("  1. 512MB (小并发，<100线程)")
    print("  2. 1GB (中等并发，100-500线程) [推荐]")
    print("  3. 2GB (大并发，500+线程)")
    print("  4. 自定义")
    
    choice = input("\n请选择 (1-4，默认2): ").strip() or "2"
    
    heap_size = "1g"
    if choice == "1":
        heap_size = "512m"
    elif choice == "2":
        heap_size = "1g"
    elif choice == "3":
        heap_size = "2g"
    elif choice == "4":
        heap_size = input("请输入堆内存大小 (如: 1g, 2g, 512m): ").strip() or "1g"
    
    print()
    print(f"[配置] 将设置堆内存为: {heap_size}")
    confirm = input("确认修改？(Y/N): ").strip().upper()
    
    if confirm != "Y":
        print("[取消] 操作已取消")
        return
    
    print()
    
    # 执行修改
    if fix_jmeter_bat(JMETER_BAT, heap_size):
        print()
        print("=" * 60)
        print("[完成] JVM配置已优化！")
        print("=" * 60)
        print()
        print("[提示] 修改后请重新运行测试脚本")
        print("[提示] 如需恢复，可使用备份文件: jmeter.bat.backup")
    else:
        print()
        print("[提示] 配置可能已经是优化状态，或需要手动检查")
    
    print()
    input("按回车键退出...")


if __name__ == "__main__":
    main()
