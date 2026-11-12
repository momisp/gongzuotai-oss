# -*- coding: utf-8 -*-
import csv
import sys

file_path = r'F:\临时\test_tool\excelFiles\OA福利发放测试点（pc端）20260303144521.csv'

try:
    # 尝试UTF-8编码
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        rows = list(reader)
        for i, row in enumerate(rows):
            print(f"Row {i+1}: {row}")
            if i >= 200:  # 只打印前200行
                break
except UnicodeDecodeError:
    # 如果UTF-8失败，尝试GBK
    try:
        with open(file_path, 'r', encoding='gbk') as f:
            reader = csv.reader(f)
            rows = list(reader)
            for i, row in enumerate(rows):
                print(f"Row {i+1}: {row}")
                if i >= 200:
                    break
    except Exception as e:
        print(f"Error: {e}")
