# -*- coding: utf-8 -*-
import csv
import sys

file_path = r'审核测试点文件\OA福利发放测试点（pc端）20260303144521.csv'
output_path = r'审核测试点文件\test_points_analysis.txt'

encodings = ['utf-8-sig', 'utf-8', 'gbk', 'gb2312']

for encoding in encodings:
    try:
        with open(file_path, 'r', encoding=encoding) as f:
            reader = csv.reader(f)
            rows = list(reader)
            
            with open(output_path, 'w', encoding='utf-8') as out:
                out.write(f"成功读取文件，使用编码: {encoding}\n")
                out.write(f"总行数: {len(rows)}\n\n")
                out.write("=" * 80 + "\n\n")
                
                for i, row in enumerate(rows):
                    out.write(f"第{i+1}行: {row}\n")
            
            print(f"文件已成功读取并保存到: {output_path}")
            print(f"使用编码: {encoding}")
            print(f"总行数: {len(rows)}")
            break
    except UnicodeDecodeError:
        continue
    except Exception as e:
        print(f"读取失败 (编码: {encoding}): {e}")
        continue
