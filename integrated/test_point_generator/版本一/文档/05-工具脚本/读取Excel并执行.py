#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
读取 Excel 文件并执行 Apifox 测试
直接读取 Excel，无需转换为 CSV
"""

import sys
import os
import subprocess
import time
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("错误: 未安装 pandas 库")
    print("请运行: pip install pandas openpyxl")
    sys.exit(1)


def read_excel_and_execute(excel_file, node_path, delay_seconds=2):
    """
    读取 Excel 文件并执行测试
    
    Args:
        excel_file: Excel 文件路径
        node_path: Node.js 路径
        delay_seconds: 测试间隔（秒）
    
    Returns:
        成功返回 0，失败返回 1
    """
    try:
        # 检查文件是否存在
        if not os.path.exists(excel_file):
            print(f"错误: 文件不存在: {excel_file}")
            return 1
        
        # 检查 Node.js 路径
        npx_cmd = os.path.join(node_path, 'npx.cmd')
        if not os.path.exists(npx_cmd):
            print(f"错误: 未找到 Node.js: {npx_cmd}")
            return 1
        
        # 读取 Excel 文件
        print(f"正在读取 Excel 文件: {excel_file}")
        df = pd.read_excel(excel_file, sheet_name=0, header=0)
        
        # 检查列数
        if len(df.columns) < 3:
            print("错误: Excel 文件列数少于3列")
            print(f"当前列数: {len(df.columns)}")
            print(f"列名: {list(df.columns)}")
            return 1
        
        # 获取列名（兼容不同的列名）
        person_col = df.columns[0]  # 第一列：人员
        name_col = df.columns[1]     # 第二列：名称
        cmd_col = df.columns[2]      # 第三列：命令行
        
        # 统计有效测试数量
        valid_tests = df[df[cmd_col].notna() & (df[cmd_col].astype(str).str.strip() != '')]
        test_count = len(valid_tests)
        
        if test_count == 0:
            print("错误: Excel 文件中没有找到有效的测试命令")
            return 1
        
        print(f"找到 {test_count} 个测试任务")
        print()
        
        # 执行测试
        success_count = 0
        fail_count = 0
        
        for idx, row in valid_tests.iterrows():
            current_test = success_count + fail_count + 1
            
            # 获取数据
            person = str(row[person_col]) if pd.notna(row[person_col]) else ""
            name = str(row[name_col]) if pd.notna(row[name_col]) else ""
            cmd = str(row[cmd_col]).strip()
            
            # 跳过空命令
            if not cmd:
                continue
            
            # 显示测试信息
            print("=" * 60)
            print(f"[{current_test}/{test_count}] 执行测试")
            print("=" * 60)
            if person:
                print(f"人员: {person}")
            if name:
                print(f"名称: {name}")
            print(f"命令: {cmd}")
            print()
            
            # 判断命令格式并执行
            if 'apifox run' in cmd.lower():
                # 命令已包含 "apifox run"，直接执行
                full_cmd = f'"{npx_cmd}" {cmd}'
            else:
                # 命令不包含 "apifox run"，添加前缀
                full_cmd = f'"{npx_cmd}" apifox run {cmd}'
            
            # 执行命令
            print(f"执行命令: {full_cmd}")
            print()
            
            result = subprocess.run(
                full_cmd,
                shell=True,
                capture_output=False,  # 实时显示输出
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            # 检查执行结果
            if result.returncode == 0:
                print()
                print("[成功] 测试执行成功")
                success_count += 1
            else:
                print()
                print(f"[错误] 测试执行失败，错误码: {result.returncode}")
                fail_count += 1
            
            print()
            
            # 如果不是最后一个测试，延迟
            if current_test < test_count:
                print(f"等待 {delay_seconds} 秒后执行下一个测试...")
                time.sleep(delay_seconds)
                print()
        
        # 显示结果汇总
        print("=" * 60)
        print("执行结果汇总")
        print("=" * 60)
        print(f"总测试数: {test_count}")
        print(f"成功: {success_count}")
        print(f"失败: {fail_count}")
        print()
        
        # 返回结果
        if fail_count > 0:
            print("[警告] 有测试执行失败，请检查日志")
            return 1
        else:
            print("[完成] 所有测试执行成功！")
            return 0
        
    except Exception as e:
        print(f"错误: 执行失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


def main():
    """主函数"""
    if len(sys.argv) < 3:
        print("=" * 60)
        print("读取 Excel 文件并执行 Apifox 测试")
        print("=" * 60)
        print()
        print("使用方法:")
        print(f"  python {os.path.basename(__file__)} <Excel文件路径> <Node.js路径> [延迟秒数]")
        print()
        print("示例:")
        print(f'  python {os.path.basename(__file__)} apifox_tests.xlsx "C:\\Program Files\\nodejs"')
        print(f'  python {os.path.basename(__file__)} apifox_tests.xlsx "C:\\Program Files\\nodejs" 2')
        print()
        sys.exit(1)
    
    excel_file = sys.argv[1]
    node_path = sys.argv[2]
    delay_seconds = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    
    result = read_excel_and_execute(excel_file, node_path, delay_seconds)
    sys.exit(result)


if __name__ == '__main__':
    main()
