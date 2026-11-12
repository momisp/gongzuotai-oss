#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试 Excel 读取功能
只读取 Excel 文件，不执行测试，用于验证功能
"""

import sys
import os
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("错误: 未安装 pandas 库")
    print("请运行: pip install pandas openpyxl")
    sys.exit(1)


def test_read_excel(excel_file):
    """
    测试读取 Excel 文件
    
    Args:
        excel_file: Excel 文件路径
    
    Returns:
        成功返回 0，失败返回 1
    """
    try:
        # 检查文件是否存在
        if not os.path.exists(excel_file):
            print(f"❌ 错误: 文件不存在: {excel_file}")
            return 1
        
        print("=" * 60)
        print("测试 Excel 读取功能")
        print("=" * 60)
        print()
        
        # 读取 Excel 文件
        print(f"📖 正在读取 Excel 文件: {excel_file}")
        df = pd.read_excel(excel_file, sheet_name=0, header=0)
        
        print(f"✅ Excel 文件读取成功")
        print()
        
        # 显示基本信息
        print("=" * 60)
        print("文件信息")
        print("=" * 60)
        print(f"总行数: {len(df)}")
        print(f"总列数: {len(df.columns)}")
        print(f"列名: {list(df.columns)}")
        print()
        
        # 检查列数
        if len(df.columns) < 3:
            print("⚠️  警告: Excel 文件列数少于3列")
            print(f"当前列数: {len(df.columns)}")
            print("需要至少3列：人员、名称、命令行")
            return 1
        
        # 获取列名
        person_col = df.columns[0]  # 第一列：人员
        name_col = df.columns[1]     # 第二列：名称
        cmd_col = df.columns[2]       # 第三列：命令行
        
        print("=" * 60)
        print("列信息")
        print("=" * 60)
        print(f"第1列（人员）: {person_col}")
        print(f"第2列（名称）: {name_col}")
        print(f"第3列（命令行）: {cmd_col}")
        print()
        
        # 统计有效测试数量
        valid_tests = df[df[cmd_col].notna() & (df[cmd_col].astype(str).str.strip() != '')]
        test_count = len(valid_tests)
        
        print("=" * 60)
        print("测试任务统计")
        print("=" * 60)
        print(f"有效测试数量: {test_count}")
        print()
        
        if test_count == 0:
            print("❌ 错误: Excel 文件中没有找到有效的测试命令")
            print("请检查第三列（命令行）是否有内容")
            return 1
        
        # 显示前几个测试任务
        print("=" * 60)
        print("测试任务预览（前5个）")
        print("=" * 60)
        
        for idx, row in valid_tests.head(5).iterrows():
            person = str(row[person_col]) if pd.notna(row[person_col]) else "(空)"
            name = str(row[name_col]) if pd.notna(row[name_col]) else "(空)"
            cmd = str(row[cmd_col]).strip()
            
            print(f"\n任务 {idx + 1}:")
            print(f"  人员: {person}")
            print(f"  名称: {name}")
            print(f"  命令: {cmd[:80]}..." if len(cmd) > 80 else f"  命令: {cmd}")
        
        if test_count > 5:
            print(f"\n... 还有 {test_count - 5} 个测试任务")
        
        print()
        print("=" * 60)
        print("✅ 测试通过！Excel 文件格式正确")
        print("=" * 60)
        print()
        print("可以运行以下命令执行测试：")
        print(f'  批量执行Apifox测试_Excel直接版.bat "{excel_file}"')
        print()
        
        return 0
        
    except Exception as e:
        print(f"❌ 错误: 读取 Excel 文件失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("=" * 60)
        print("测试 Excel 读取功能")
        print("=" * 60)
        print()
        print("使用方法:")
        print(f"  python {os.path.basename(__file__)} <Excel文件路径>")
        print()
        print("示例:")
        print(f'  python {os.path.basename(__file__)} apifox_tests.xlsx')
        print()
        
        # 尝试使用默认文件
        script_dir = Path(__file__).parent
        default_file = script_dir / 'apifox_tests.xlsx'
        if default_file.exists():
            print(f"检测到默认文件，使用: {default_file}")
            print()
            return test_read_excel(str(default_file))
        else:
            sys.exit(1)
    
    excel_file = sys.argv[1]
    result = test_read_excel(excel_file)
    sys.exit(result)


if __name__ == '__main__':
    main()
