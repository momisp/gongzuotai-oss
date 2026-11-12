# -*- coding: utf-8 -*-
import csv
import os

file_path = r'审核测试点文件\OA福利发放测试点（pc端）20260303144521.csv'

# 尝试多种编码方式
encodings = ['utf-8-sig', 'utf-8', 'gbk', 'gb2312']

for encoding in encodings:
    try:
        with open(file_path, 'r', encoding=encoding) as f:
            reader = csv.reader(f)
            rows = list(reader)
            
            print(f"成功读取文件，使用编码: {encoding}")
            print(f"总行数: {len(rows)}\n")
            print("=" * 80)
            
            # 打印所有行
            for i, row in enumerate(rows):
                print(f"第{i+1}行: {row}")
            
            break
    except UnicodeDecodeError:
        continue
    except Exception as e:
        print(f"读取失败 (编码: {encoding}): {e}")
        continue
