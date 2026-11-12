#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
接口筛选整理工具
功能：从 OpenAPI 文件中提取接口信息，生成 Excel 清单
"""

import json
import yaml
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from pathlib import Path
import sys

def load_openapi_file(file_path):
    """加载 OpenAPI 文件"""
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

def extract_apis(openapi_data):
    """提取接口信息"""
    apis = []
    
    if not openapi_data or 'paths' not in openapi_data:
        print("❌ OpenAPI 文件格式不正确")
        return apis
    
    paths = openapi_data['paths']
    
    for path, methods in paths.items():
        for method, details in methods.items():
            if method.lower() not in ['get', 'post', 'put', 'delete', 'patch']:
                continue
            
            api_info = {
                'path': path,
                'method': method.upper(),
                'summary': details.get('summary', ''),
                'description': details.get('description', ''),
                'tags': details.get('tags', []),
                'operation_id': details.get('operationId', ''),
            }
            
            # 提取请求参数
            parameters = details.get('parameters', [])
            request_params = []
            for param in parameters:
                param_info = {
                    'name': param.get('name', ''),
                    'type': param.get('schema', {}).get('type', ''),
                    'required': param.get('required', False),
                }
                request_params.append(param_info)
            
            api_info['request_params'] = request_params
            
            # 提取响应信息
            responses = details.get('responses', {})
            api_info['responses'] = list(responses.keys())
            
            apis.append(api_info)
    
    return apis

def classify_api(api_info):
    """分类接口优先级"""
    path = api_info['path'].lower()
    summary = api_info['summary'].lower()
    tags = [tag.lower() for tag in api_info.get('tags', [])]
    
    # P0 - 核心业务接口
    p0_keywords = ['login', 'auth', 'token', 'register', 'pay', 'order', 'create', 'publish']
    if any(keyword in path or keyword in summary for keyword in p0_keywords):
        return 'P0'
    
    # P1 - 重要业务接口
    p1_keywords = ['list', 'detail', 'update', 'delete', 'query', 'search']
    if any(keyword in path or keyword in summary for keyword in p1_keywords):
        return 'P1'
    
    # P2 - 一般接口
    p2_keywords = ['config', 'setting', 'info', 'get']
    if any(keyword in path or keyword in summary for keyword in p2_keywords):
        return 'P2'
    
    # P3 - 低优先级
    return 'P3'

def generate_excel(apis, output_file='接口清单.xlsx'):
    """生成 Excel 文件"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '接口清单'
    
    # 设置表头
    headers = [
        '序号', '接口名称', '接口路径', '请求方法', '所属模块', 
        '优先级', '是否自动化', '请求参数', '响应状态', '备注'
    ]
    
    # 设置表头样式
    header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
    header_font = Font(color='FFFFFF', bold=True)
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center')
    
    # 填充数据
    for idx, api in enumerate(apis, 2):
        priority = classify_api(api)
        module = ', '.join(api.get('tags', ['未分类']))
        
        ws.cell(row=idx, column=1, value=idx - 1)  # 序号
        ws.cell(row=idx, column=2, value=api.get('summary', api.get('operation_id', '')))  # 接口名称
        ws.cell(row=idx, column=3, value=api['path'])  # 接口路径
        ws.cell(row=idx, column=4, value=api['method'])  # 请求方法
        ws.cell(row=idx, column=5, value=module)  # 所属模块
        ws.cell(row=idx, column=6, value=priority)  # 优先级
        
        # 是否自动化（P0/P1 默认是）
        auto = '是' if priority in ['P0', 'P1'] else '待定'
        ws.cell(row=idx, column=7, value=auto)
        
        # 请求参数
        params = api.get('request_params', [])
        param_str = ', '.join([f"{p['name']}({p['type']})" for p in params[:3]])
        if len(params) > 3:
            param_str += '...'
        ws.cell(row=idx, column=8, value=param_str)
        
        # 响应状态
        responses = ', '.join(api.get('responses', [])[:3])
        ws.cell(row=idx, column=9, value=responses)
        ws.cell(row=idx, column=10, value='')  # 备注
    
    # 调整列宽
    column_widths = [8, 30, 40, 12, 20, 10, 12, 30, 20, 20]
    for col, width in enumerate(column_widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = width
    
    # 设置优先级颜色
    priority_colors = {
        'P0': 'FF0000',  # 红色
        'P1': 'FF9900',  # 橙色
        'P2': 'FFFF00',  # 黄色
        'P3': 'CCCCCC',  # 灰色
    }
    
    for idx, api in enumerate(apis, 2):
        priority = classify_api(api)
        if priority in priority_colors:
            fill = PatternFill(start_color=priority_colors[priority], 
                              end_color=priority_colors[priority], 
                              fill_type='solid')
            ws.cell(row=idx, column=6).fill = fill
    
    # 保存文件
    wb.save(output_file)
    print(f"✅ Excel 文件已生成：{output_file}")
    print(f"📊 共提取 {len(apis)} 个接口")

def main():
    """主函数"""
    print("=" * 60)
    print("  接口筛选整理工具")
    print("=" * 60)
    print()
    
    # 获取文件路径
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = input("请输入 OpenAPI 文件路径（支持 JSON/YAML）：").strip()
    
    if not file_path:
        print("❌ 未提供文件路径")
        return
    
    # 加载文件
    print(f"\n[1/3] 正在加载文件：{file_path}")
    openapi_data = load_openapi_file(file_path)
    
    if not openapi_data:
        return
    
    # 提取接口
    print("[2/3] 正在提取接口信息...")
    apis = extract_apis(openapi_data)
    
    if not apis:
        print("❌ 未找到接口信息")
        return
    
    # 生成 Excel
    print("[3/3] 正在生成 Excel 文件...")
    output_file = Path(file_path).stem + '_接口清单.xlsx'
    generate_excel(apis, output_file)
    
    print("\n" + "=" * 60)
    print("✅ 完成！")
    print("=" * 60)
    print(f"\n📋 下一步：")
    print(f"1. 打开 Excel 文件：{output_file}")
    print(f"2. 检查并调整优先级")
    print(f"3. 标记需要自动化的接口")
    print(f"4. 在 Apifox 中创建测试场景")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ 用户中断")
    except Exception as e:
        print(f"\n❌ 发生错误：{e}")
        import traceback
        traceback.print_exc()
