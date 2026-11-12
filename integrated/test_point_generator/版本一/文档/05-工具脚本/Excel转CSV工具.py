#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Excel 转 CSV 工具
将 Excel 文件转换为 CSV 格式，供批处理脚本使用
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


def excel_to_csv(excel_file, csv_file=None):
    """
    将 Excel 文件转换为 CSV 文件
    
    Args:
        excel_file: Excel 文件路径（.xlsx 或 .xls）
        csv_file: CSV 输出文件路径（可选，默认与 Excel 同目录同名）
    
    Returns:
        CSV 文件路径
    """
    try:
        # 检查文件是否存在
        if not os.path.exists(excel_file):
            print(f"错误: 文件不存在: {excel_file}")
            return None
        
        # 如果没有指定 CSV 文件路径，自动生成
        if csv_file is None:
            excel_path = Path(excel_file)
            csv_file = excel_path.with_suffix('.csv')
        
        # 读取 Excel 文件
        print(f"正在读取 Excel 文件: {excel_file}")
        df = pd.read_excel(excel_file, sheet_name=0, header=0)
        
        # 检查列数（至少需要3列）
        if len(df.columns) < 3:
            print("警告: Excel 文件列数少于3列，可能格式不正确")
            print(f"当前列数: {len(df.columns)}")
            print(f"列名: {list(df.columns)}")
        
        # 保存为 CSV（UTF-8 编码，包含 BOM，兼容 Excel）
        print(f"正在转换为 CSV: {csv_file}")
        df.to_csv(csv_file, index=False, encoding='utf-8-sig')
        
        print(f"✓ 转换成功: {csv_file}")
        return str(csv_file)
        
    except Exception as e:
        print(f"错误: 转换失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("=" * 60)
        print("Excel 转 CSV 工具")
        print("=" * 60)
        print()
        print("使用方法:")
        print(f"  python {os.path.basename(__file__)} <Excel文件路径> [CSV输出路径]")
        print()
        print("示例:")
        print(f"  python {os.path.basename(__file__)} apifox_tests.xlsx")
        print(f"  python {os.path.basename(__file__)} apifox_tests.xlsx apifox_tests.csv")
        print()
        sys.exit(1)
    
    excel_file = sys.argv[1]
    csv_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = excel_to_csv(excel_file, csv_file)
    
    if result:
        print()
        print("=" * 60)
        print("转换完成！")
        print("=" * 60)
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
