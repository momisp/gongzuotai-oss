#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
创建 Excel 测试模板
生成一个包含示例数据的 Excel 文件模板
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


def create_excel_template(output_file=None):
    """
    创建 Excel 测试模板文件
    
    Args:
        output_file: 输出文件路径（可选，默认为 apifox_tests.xlsx）
    
    Returns:
        输出文件路径
    """
    try:
        # 如果没有指定输出文件，使用默认名称
        if output_file is None:
            script_dir = Path(__file__).parent
            output_file = script_dir / 'apifox_tests.xlsx'
        else:
            output_file = Path(output_file)
        
        # 创建示例数据
        data = {
            '人员': [
                '李飞翔',
                '李飞翔',
                '李飞翔',
                '李飞翔',
                '李飞翔',
                '李飞翔'
            ],
            '名称（备注）': [
                '奇遇大厅模块自动化',
                '域主页模块自动化',
                '我的奖励和所有商户模块自动化',
                '服务商模块自动化',
                '域六马模块自动化',
                '商户端模块自动化'
            ],
            '命令行': [
                'apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli',
                'apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508406/detail?token=xBq8EpIa5NdOxVUbL o9zE -r html,cli',
                'apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508408/detail?token=x0S8GT7 xv2ThAPIVT ono -r html,cli',
                'apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508409/detail?token=xTgkKRh Wwmbr2nZwqjClx -r html,cli',
                'apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508410/detail?token=xOvfSTbgr BLpezqDgb414 -r html,cli',
                'apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508411/detail?token=xnr6EwdCHH.jlMwhc8ACJ1g -r html,cli'
            ]
        }
        
        # 创建 DataFrame
        df = pd.DataFrame(data)
        
        # 保存为 Excel 文件
        print(f"正在创建 Excel 模板文件: {output_file}")
        
        with pd.ExcelWriter(str(output_file), engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='测试列表')
            
            # 获取工作表对象，设置列宽
            worksheet = writer.sheets['测试列表']
            
            # 设置列宽（A列：10，B列：30，C列：100）
            worksheet.column_dimensions['A'].width = 10
            worksheet.column_dimensions['B'].width = 30
            worksheet.column_dimensions['C'].width = 100
            
            # 设置标题行格式（加粗）
            from openpyxl.styles import Font, PatternFill, Alignment
            
            header_font = Font(bold=True, color='FFFFFF')
            header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
            header_alignment = Alignment(horizontal='center', vertical='center')
            
            for cell in worksheet[1]:
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_alignment
            
            # 设置数据行对齐方式
            for row in worksheet.iter_rows(min_row=2, max_row=worksheet.max_row):
                row[0].alignment = Alignment(horizontal='left', vertical='top')  # A列：左对齐
                row[1].alignment = Alignment(horizontal='left', vertical='top')  # B列：左对齐
                row[2].alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)  # C列：左对齐，自动换行
        
        print(f"✓ Excel 模板文件创建成功: {output_file}")
        print()
        print("文件说明：")
        print("  - A列：人员（可选）")
        print("  - B列：名称/备注（可选）")
        print("  - C列：命令行（必填）")
        print()
        print("使用方法：")
        print("  1. 用 Excel 打开文件")
        print("  2. 修改或添加测试行")
        print("  3. 保存文件")
        print("  4. 运行批处理脚本执行测试")
        
        return str(output_file)
        
    except Exception as e:
        print(f"错误: 创建 Excel 模板失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def main():
    """主函数"""
    if len(sys.argv) > 1:
        output_file = sys.argv[1]
    else:
        output_file = None
    
    result = create_excel_template(output_file)
    
    if result:
        print()
        print("=" * 60)
        print("模板创建完成！")
        print("=" * 60)
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
