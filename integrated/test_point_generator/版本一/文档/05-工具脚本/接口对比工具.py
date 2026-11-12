#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
接口对比工具
功能：对比接口文档和 Apifox 中的接口，找出差异
"""

import json
import yaml
from pathlib import Path
import sys

def load_file(file_path):
    """加载文件（支持 JSON/YAML）"""
    file_path = Path(file_path)
    
    if not file_path.exists():
        print(f"❌ 文件不存在：{file_path}")
        return None
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 尝试解析 JSON
    try:
        return json.loads(content)
    except:
        pass
    
    # 尝试解析 YAML
    try:
        return yaml.safe_load(content)
    except:
        pass
    
    print(f"❌ 无法解析文件：{file_path}")
    return None

def extract_api_keys(openapi_data):
    """提取接口唯一标识（路径+方法）"""
    keys = set()
    
    if not openapi_data or 'paths' not in openapi_data:
        return keys
    
    paths = openapi_data['paths']
    
    for path, methods in paths.items():
        for method in methods.keys():
            if method.lower() in ['get', 'post', 'put', 'delete', 'patch']:
                key = f"{method.upper()} {path}"
                keys.add(key)
    
    return keys

def compare_apis(doc_apis, apifox_apis):
    """对比接口"""
    doc_keys = extract_api_keys(doc_apis)
    apifox_keys = extract_api_keys(apifox_apis)
    
    # 只在文档中的接口
    only_in_doc = doc_keys - apifox_keys
    
    # 只在 Apifox 中的接口
    only_in_apifox = apifox_keys - doc_keys
    
    # 两者都有的接口
    common = doc_keys & apifox_keys
    
    return {
        'only_in_doc': only_in_doc,
        'only_in_apifox': only_in_apifox,
        'common': common,
        'doc_total': len(doc_keys),
        'apifox_total': len(apifox_keys),
    }

def print_report(result):
    """打印对比报告"""
    print("\n" + "=" * 60)
    print("  接口对比报告")
    print("=" * 60)
    
    print(f"\n📊 统计信息：")
    print(f"  - 接口文档接口数：{result['doc_total']}")
    print(f"  - Apifox 接口数：{result['apifox_total']}")
    print(f"  - 共同接口数：{len(result['common'])}")
    
    print(f"\n📋 只在接口文档中的接口（{len(result['only_in_doc'])} 个）：")
    if result['only_in_doc']:
        for api in sorted(result['only_in_doc']):
            print(f"  - {api}")
    else:
        print("  （无）")
    
    print(f"\n📋 只在 Apifox 中的接口（{len(result['only_in_apifox'])} 个）：")
    if result['only_in_apifox']:
        for api in sorted(result['only_in_apifox']):
            print(f"  - {api}")
    else:
        print("  （无）")
    
    print("\n" + "=" * 60)
    
    # 建议
    print("\n💡 建议：")
    if result['only_in_doc']:
        print(f"  1. 将 {len(result['only_in_doc'])} 个接口文档中的接口导入到 Apifox")
    if result['only_in_apifox']:
        print(f"  2. 检查 {len(result['only_in_apifox'])} 个 Apifox 中的接口是否需要更新文档")
    if not result['only_in_doc'] and not result['only_in_apifox']:
        print("  ✅ 接口文档和 Apifox 中的接口一致！")

def main():
    """主函数"""
    print("=" * 60)
    print("  接口对比工具")
    print("=" * 60)
    print()
    
    # 获取文件路径
    if len(sys.argv) >= 3:
        doc_file = sys.argv[1]
        apifox_file = sys.argv[2]
    else:
        doc_file = input("请输入接口文档文件路径（OpenAPI）：").strip()
        apifox_file = input("请输入 Apifox 导出文件路径（OpenAPI）：").strip()
    
    if not doc_file or not apifox_file:
        print("❌ 未提供文件路径")
        return
    
    # 加载文件
    print(f"\n[1/3] 正在加载接口文档：{doc_file}")
    doc_data = load_file(doc_file)
    
    if not doc_data:
        return
    
    print(f"[2/3] 正在加载 Apifox 文件：{apifox_file}")
    apifox_data = load_file(apifox_file)
    
    if not apifox_data:
        return
    
    # 对比接口
    print("[3/3] 正在对比接口...")
    result = compare_apis(doc_data, apifox_data)
    
    # 打印报告
    print_report(result)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ 用户中断")
    except Exception as e:
        print(f"\n❌ 发生错误：{e}")
        import traceback
        traceback.print_exc()
