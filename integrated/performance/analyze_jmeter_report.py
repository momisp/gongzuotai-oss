#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
JMeter测试报告统计分析脚本
统计测试报告目录下最新报告的数据，按接口分组统计
"""

import os
import sys
import json
import csv
from pathlib import Path
from collections import defaultdict
import statistics
from datetime import datetime


def find_all_reports(report_dir):
    """查找所有报告目录，返回(html_report_dir, jtl_file, timestamp)的列表"""
    report_path = Path(report_dir)
    if not report_path.exists():
        return []
    
    # 查找所有html_report_开头的目录
    html_reports = []
    jtl_files = []
    
    for item in report_path.iterdir():
        if item.is_dir() and item.name.startswith("html_report_"):
            html_reports.append(item)
        elif item.is_file() and item.name.startswith("result_") and item.suffix == ".jtl":
            jtl_files.append(item)
    
    if not html_reports:
        return []
    
    # 按时间戳排序（最新的在前）
    html_reports.sort(key=lambda x: x.name, reverse=True)
    
    # 匹配每个HTML报告对应的JTL文件
    reports = []
    for html_report in html_reports:
        timestamp = html_report.name.replace("html_report_", "")
        matching_jtl = None
        for jtl in jtl_files:
            if timestamp in jtl.name:
                matching_jtl = jtl
                break
        reports.append((html_report, matching_jtl, timestamp))
    
    return reports


def find_latest_report(report_dir):
    """查找最新的报告目录（保留兼容性）"""
    all_reports = find_all_reports(report_dir)
    if not all_reports:
        return None, None
    return all_reports[0][0], all_reports[0][1]


def parse_statistics_json(json_file):
    """解析statistics.json文件"""
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data
    except Exception as e:
        print(f"[警告] 解析statistics.json失败: {e}")
        return None


def parse_jtl_file(jtl_file):
    """解析JTL文件，按URL分组统计（因为label可能相同）"""
    stats = defaultdict(lambda: {
        'samples': [],
        'elapsed_times': [],
        'success_count': 0,
        'fail_count': 0,
        'thread_names': set(),
        'labels': set(),
        'bytes_received': [],
        'bytes_sent': []
    })
    
    try:
        with open(jtl_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                label = row.get('label', '').strip()
                url = row.get('URL', '').strip()
                
                # 使用URL作为分组键，如果URL为空则使用label
                # 这样可以区分不同的接口
                group_key = url if url else label
                
                if not group_key or group_key == 'Total':
                    continue
                
                # 统计样本数
                stats[group_key]['samples'].append(row)
                
                # 响应时间
                elapsed = row.get('elapsed', '')
                if elapsed and elapsed.isdigit():
                    stats[group_key]['elapsed_times'].append(int(elapsed))
                
                # 成功/失败统计
                success = row.get('success', '').lower()
                if success == 'true':
                    stats[group_key]['success_count'] += 1
                else:
                    stats[group_key]['fail_count'] += 1
                
                # 线程名称
                thread_name = row.get('threadName', '').strip()
                if thread_name:
                    stats[group_key]['thread_names'].add(thread_name)
                
                # Label
                if label:
                    stats[group_key]['labels'].add(label)
                
                # 网络流量
                bytes_val = row.get('bytes', '')
                if bytes_val and bytes_val.isdigit():
                    stats[group_key]['bytes_received'].append(int(bytes_val))
                
                sent_bytes = row.get('sentBytes', '')
                if sent_bytes and sent_bytes.isdigit():
                    stats[group_key]['bytes_sent'].append(int(sent_bytes))
        
        return stats
    except Exception as e:
        print(f"[错误] 解析JTL文件失败: {e}")
        return None


def calculate_percentile(data, percentile):
    """计算百分位数"""
    if not data:
        return 0
    sorted_data = sorted(data)
    index = int(len(sorted_data) * percentile / 100)
    if index >= len(sorted_data):
        index = len(sorted_data) - 1
    return sorted_data[index]


def generate_statistics(stats_data):
    """生成统计数据"""
    result = []
    
    for group_key, data in stats_data.items():
        if group_key == 'Total':
            continue
        
        elapsed_times = data['elapsed_times']
        if not elapsed_times:
            continue
        
        total_samples = len(data['samples'])
        fail_count = data['fail_count']
        error_pct = (fail_count / total_samples * 100) if total_samples > 0 else 0
        
        # 响应时间统计
        avg_time = statistics.mean(elapsed_times) if elapsed_times else 0
        min_time = min(elapsed_times) if elapsed_times else 0
        max_time = max(elapsed_times) if elapsed_times else 0
        median_time = statistics.median(elapsed_times) if elapsed_times else 0
        pct90 = calculate_percentile(elapsed_times, 90)
        pct95 = calculate_percentile(elapsed_times, 95)
        pct99 = calculate_percentile(elapsed_times, 99)
        
        # 线程名称（取第一个作为代表）
        thread_name = list(data['thread_names'])[0] if data['thread_names'] else ''
        
        # 接口URL（group_key就是URL）
        interface_url = group_key
        
        # 吞吐量（需要知道测试时长，这里简化处理）
        # 从statistics.json中获取更准确
        throughput = 0
        
        # 网络流量统计（计算平均值，因为需要KB/sec）
        bytes_received = data['bytes_received']
        bytes_sent = data['bytes_sent']
        # 这里先计算总量，后续从JSON中获取更准确的速率
        total_received_kb = sum(bytes_received) / 1024 if bytes_received else 0
        total_sent_kb = sum(bytes_sent) / 1024 if bytes_sent else 0
        
        result.append({
            'thread_name': thread_name,
            'interface': interface_url,
            'samples': total_samples,
            'fail': fail_count,
            'error_pct': error_pct,
            'avg_time': avg_time,
            'min_time': min_time,
            'max_time': max_time,
            'median_time': median_time,
            'pct90': pct90,
            'pct95': pct95,
            'pct99': pct99,
            'throughput': throughput,
            'received_kb': total_received_kb,
            'sent_kb': total_sent_kb
        })
    
    return result


def merge_with_json_stats(jtl_stats, json_stats):
    """合并JTL统计和JSON统计，优先使用JSON中的准确数据"""
    if not json_stats:
        return jtl_stats
    
    # JSON中的key是label（如"HTTP请求"），但JTL中我们按URL分组
    # 需要建立映射关系：通过URL匹配
    # 由于JSON可能只有label，我们需要尝试匹配
    for item in jtl_stats:
        interface_url = item['interface']
        
        # 尝试从JSON中找到匹配的数据
        # 如果JSON中有多个接口，需要找到匹配的
        matched_json_data = None
        
        # 方法1：如果JSON的key就是URL（不太可能）
        if interface_url in json_stats:
            matched_json_data = json_stats[interface_url]
        else:
            # 方法2：尝试通过label匹配（如果JSON中只有一个接口，可能是Total）
            # 或者尝试匹配第一个非Total的项
            for key, json_data in json_stats.items():
                if key != 'Total':
                    # 如果JSON中只有一个接口，可能就是这个
                    matched_json_data = json_data
                    break
        
        if matched_json_data:
            # 更新吞吐量等更准确的数据
            item['throughput'] = matched_json_data.get('throughput', item.get('throughput', 0))
            item['received_kb'] = matched_json_data.get('receivedKBytesPerSec', item.get('received_kb', 0))
            item['sent_kb'] = matched_json_data.get('sentKBytesPerSec', item.get('sent_kb', 0))
            # JSON中的百分位数可能更准确
            item['pct90'] = matched_json_data.get('pct1ResTime', item.get('pct90', 0))  # 90th percentile
            item['pct95'] = matched_json_data.get('pct2ResTime', item.get('pct95', 0))  # 95th percentile
            item['pct99'] = matched_json_data.get('pct3ResTime', item.get('pct99', 0))  # 99th percentile
    
    return jtl_stats


def export_to_csv(data, output_file):
    """导出数据到CSV文件（备选方案）"""
    try:
        import csv
        
        headers = [
            '线程名称', '接口', '#Samples', 'FAIL', 'Error %',
            'Average', 'Min', 'Max', 'Median', '90th pct', '95th pct', '99th pct',
            'Transactions/s', 'Received (KB/sec)', 'Sent (KB/sec)'
        ]
        
        with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            
            for item in data:
                row = [
                    item.get('thread_name', ''),
                    item.get('interface', ''),
                    item.get('samples', 0),
                    item.get('fail', 0),
                    f"{item.get('error_pct', 0):.2f}",
                    f"{item.get('avg_time', 0):.2f}",
                    f"{int(item.get('min_time', 0))}",
                    f"{int(item.get('max_time', 0))}",
                    f"{item.get('median_time', 0):.2f}",
                    f"{item.get('pct90', 0):.2f}",
                    f"{item.get('pct95', 0):.2f}",
                    f"{item.get('pct99', 0):.2f}",
                    f"{item.get('throughput', 0):.2f}",
                    f"{item.get('received_kb', 0):.2f}",
                    f"{item.get('sent_kb', 0):.2f}"
                ]
                writer.writerow(row)
        
        return True
    except Exception as e:
        print(f"[错误] 导出CSV失败: {e}")
        return False


def export_to_excel(data, output_file):
    """导出数据到Excel文件"""
    try:
        import pandas as pd
        from openpyxl import load_workbook
        from openpyxl.styles import Font, Alignment, PatternFill
        
        # 创建DataFrame
        df = pd.DataFrame(data)
        
        # 重命名列
        df.columns = [
            '线程名称', '接口', '#Samples', 'FAIL', 'Error %',
            'Average', 'Min', 'Max', 'Median', '90th pct', '95th pct', '99th pct',
            'Transactions/s', 'Received (KB/sec)', 'Sent (KB/sec)'
        ]
        
        # 格式化数值
        df['Error %'] = df['Error %'].apply(lambda x: f"{x:.2f}")
        df['Average'] = df['Average'].apply(lambda x: f"{x:.2f}")
        df['Min'] = df['Min'].apply(lambda x: f"{int(x)}")
        df['Max'] = df['Max'].apply(lambda x: f"{int(x)}")
        df['Median'] = df['Median'].apply(lambda x: f"{x:.2f}")
        df['90th pct'] = df['90th pct'].apply(lambda x: f"{x:.2f}")
        df['95th pct'] = df['95th pct'].apply(lambda x: f"{x:.2f}")
        df['99th pct'] = df['99th pct'].apply(lambda x: f"{x:.2f}")
        df['Transactions/s'] = df['Transactions/s'].apply(lambda x: f"{x:.2f}")
        df['Received (KB/sec)'] = df['Received (KB/sec)'].apply(lambda x: f"{x:.2f}")
        df['Sent (KB/sec)'] = df['Sent (KB/sec)'].apply(lambda x: f"{x:.2f}")
        
        # 导出到Excel
        df.to_excel(output_file, index=False, engine='openpyxl')
        
        # 美化Excel格式
        wb = load_workbook(output_file)
        ws = wb.active
        
        # 设置表头样式
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=11)
        
        # 合并表头
        ws.merge_cells('C1:E1')
        ws['C1'] = 'Executions'
        ws['C1'].fill = header_fill
        ws['C1'].font = header_font
        ws['C1'].alignment = Alignment(horizontal='center', vertical='center')
        
        ws.merge_cells('F1:L1')
        ws['F1'] = 'Response Times (ms)'
        ws['F1'].fill = header_fill
        ws['F1'].font = header_font
        ws['F1'].alignment = Alignment(horizontal='center', vertical='center')
        
        ws.merge_cells('M1:M1')
        ws['M1'] = 'Throughput'
        ws['M1'].fill = header_fill
        ws['M1'].font = header_font
        ws['M1'].alignment = Alignment(horizontal='center', vertical='center')
        
        ws.merge_cells('N1:O1')
        ws['N1'] = 'Network (KB/sec)'
        ws['N1'].fill = header_fill
        ws['N1'].font = header_font
        ws['N1'].alignment = Alignment(horizontal='center', vertical='center')
        
        # 设置第二行表头样式
        for cell in ws[2]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center', vertical='center')
        
        # 调整列宽
        column_widths = {
            'A': 25, 'B': 50, 'C': 12, 'D': 10, 'E': 10,
            'F': 12, 'G': 10, 'H': 10, 'I': 12, 'J': 12, 'K': 12, 'L': 12,
            'M': 15, 'N': 15, 'O': 15
        }
        for col, width in column_widths.items():
            ws.column_dimensions[col].width = width
        
        # 设置数据行对齐
        for row in ws.iter_rows(min_row=3, max_row=ws.max_row):
            for cell in row:
                cell.alignment = Alignment(horizontal='center', vertical='center')
        
        wb.save(output_file)
        return True
        
    except ImportError:
        print("[错误] 需要安装pandas和openpyxl库")
        print("请运行: pip install pandas openpyxl")
        return False
    except Exception as e:
        print(f"[错误] 导出Excel失败: {e}")
        return False


def collect_latest_interface_data(report_dir):
    """收集所有报告中每个接口的最新数据"""
    all_reports = find_all_reports(report_dir)
    
    if not all_reports:
        return {}
    
    # 按接口URL分组，存储每个接口的最新数据
    interface_latest_data = {}  # {url: (jtl_stats_data_dict, json_stats, timestamp)}
    
    print(f"[信息] 找到 {len(all_reports)} 个历史报告，正在扫描...")
    
    for html_report, jtl_file, timestamp in all_reports:
        # 解析JTL文件
        jtl_stats_data = None
        if jtl_file and jtl_file.exists():
            try:
                jtl_stats_data = parse_jtl_file(jtl_file)
            except Exception as e:
                print(f"[警告] 解析JTL文件失败 {jtl_file.name}: {e}")
                continue
        
        # 解析statistics.json
        json_file = html_report / "statistics.json"
        json_stats = None
        if json_file.exists():
            try:
                json_stats = parse_statistics_json(json_file)
            except Exception as e:
                print(f"[警告] 解析statistics.json失败: {e}")
        
        # 如果JTL文件存在，按URL分组
        if jtl_stats_data:
            for url, data in jtl_stats_data.items():
                # 如果这个接口还没有数据，或者这个报告更新，则更新数据
                if url not in interface_latest_data or timestamp > interface_latest_data[url][2]:
                    # 将单个接口的数据包装成字典格式，以便后续处理
                    interface_latest_data[url] = ({url: data}, json_stats, timestamp)
    
    return interface_latest_data


def main():
    """主函数"""
    print("=" * 60)
    print("JMeter测试报告统计分析（所有接口最新数据）")
    print("=" * 60)
    print()
    
    # 设置报告目录
    script_dir = Path(__file__).parent.absolute()
    report_dir = script_dir / "性能压测测试报告"
    
    if not report_dir.exists():
        print(f"[错误] 报告目录不存在: {report_dir}")
        input("按回车键退出...")
        sys.exit(1)
    
    # 收集所有接口的最新数据
    print("[信息] 正在扫描所有历史报告...")
    interface_latest_data = collect_latest_interface_data(report_dir)
    
    if not interface_latest_data:
        print("[错误] 未找到任何接口数据")
        input("按回车键退出...")
        sys.exit(1)
    
    print(f"[成功] 找到 {len(interface_latest_data)} 个不同的接口")
    print()
    
    # 生成统计数据
    print("[信息] 正在生成统计数据...")
    stats_result = []
    
    for url, (jtl_data_dict, json_stats, timestamp) in interface_latest_data.items():
        # 为这个接口生成统计数据
        interface_stats = generate_statistics(jtl_data_dict)
        if interface_stats:
            stats_item = interface_stats[0]
            # 合并JSON统计数据（如果可用）
            if json_stats:
                # 尝试匹配JSON数据
                for json_key, json_data in json_stats.items():
                    if json_key != 'Total':
                        # 更新吞吐量等更准确的数据
                        stats_item['throughput'] = json_data.get('throughput', stats_item.get('throughput', 0))
                        stats_item['received_kb'] = json_data.get('receivedKBytesPerSec', stats_item.get('received_kb', 0))
                        stats_item['sent_kb'] = json_data.get('sentKBytesPerSec', stats_item.get('sent_kb', 0))
                        stats_item['pct90'] = json_data.get('pct1ResTime', stats_item.get('pct90', 0))
                        stats_item['pct95'] = json_data.get('pct2ResTime', stats_item.get('pct95', 0))
                        stats_item['pct99'] = json_data.get('pct3ResTime', stats_item.get('pct99', 0))
                        break
            stats_result.append(stats_item)
    
    if not stats_result:
        print("[错误] 未生成统计数据")
        input("按回车键退出...")
        sys.exit(1)
    
    print(f"[成功] 生成了 {len(stats_result)} 条统计记录")
    print()
    
    # 显示接口列表
    print("[信息] 统计的接口列表:")
    for i, item in enumerate(stats_result, 1):
        print(f"  {i}. {item['interface']} ({item['samples']} 个样本)")
    print()
    
    # 导出到Excel或CSV
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    excel_file = report_dir / f"性能测试统计_{timestamp}.xlsx"
    csv_file = report_dir / f"性能测试统计_{timestamp}.csv"
    
    # 尝试导出Excel
    print(f"[信息] 正在导出到Excel: {excel_file.name}...")
    excel_success = export_to_excel(stats_result, excel_file)
    
    if excel_success:
        print(f"[成功] Excel文件已生成: {excel_file}")
        output_file = excel_file
    else:
        # Excel导出失败，使用CSV作为备选
        print("[信息] Excel导出失败，尝试导出CSV...")
        if export_to_csv(stats_result, csv_file):
            print(f"[成功] CSV文件已生成: {csv_file}")
            output_file = csv_file
        else:
            print("[错误] 文件导出失败")
            input("按回车键退出...")
            sys.exit(1)
    
    # 询问是否打开文件
    if excel_success or csv_file.exists():
        open_file = input("\n是否打开文件？(Y/N): ").strip().upper()
        if open_file == "Y":
            if sys.platform == "win32":
                os.startfile(str(output_file))
            elif sys.platform == "darwin":
                import subprocess
                subprocess.run(["open", str(output_file)])
            else:
                import subprocess
                subprocess.run(["xdg-open", str(output_file)])
    
    print()
    input("按回车键退出...")


if __name__ == "__main__":
    main()
