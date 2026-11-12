#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
JMeter性能压测执行脚本
"""

import os
import sys
import subprocess
import datetime
import shutil
import re
from pathlib import Path


def main():
    """主函数"""
    print("=" * 50)
    print("JMeter性能压测执行脚本")
    print("=" * 50)
    print()

    # 设置JMeter路径
    JMETER_HOME = r"f:\test_tools\apache-jmeter-5.4.3\apache-jmeter-5.4.3"
    JMETER_BIN = os.path.join(JMETER_HOME, "bin")
    JMETER_BAT = os.path.join(JMETER_BIN, "jmeter.bat")
    JMETER_JMX = os.path.join(JMETER_BIN, "线程组-虚拟剧本-逐渐接口性能压测.jmx")

    # 设置报告输出目录（使用脚本所在目录）
    SCRIPT_DIR = Path(__file__).parent.absolute()
    REPORT_DIR = SCRIPT_DIR / "性能压测测试报告"
    
    # 生成时间戳
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    RESULT_JTL = REPORT_DIR / f"result_{timestamp}.jtl"
    HTML_REPORT = REPORT_DIR / f"html_report_{timestamp}"

    # 检查JMeter是否存在
    if not os.path.exists(JMETER_BAT):
        print(f"[错误] 未找到JMeter，请检查路径: {JMETER_BAT}")
        input("按回车键退出...")
        sys.exit(1)

    # 检查ApacheJMeter.jar是否存在
    jar_file = os.path.join(JMETER_BIN, "ApacheJMeter.jar")
    if not os.path.exists(jar_file):
        print(f"[错误] 未找到ApacheJMeter.jar，请检查路径: {jar_file}")
        input("按回车键退出...")
        sys.exit(1)

    # 检查测试文件是否存在
    if not os.path.exists(JMETER_JMX):
        print(f"[错误] 未找到测试文件: {JMETER_JMX}")
        input("按回车键退出...")
        sys.exit(1)

    # 创建报告目录
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 确保HTML报告目录不存在或为空（JMeter要求输出目录必须为空或不存在）
    if HTML_REPORT.exists():
        print(f"[警告] HTML报告目录已存在，正在清理: {HTML_REPORT}")
        try:
            shutil.rmtree(HTML_REPORT)
            print("[成功] 已清理旧目录")
        except Exception as e:
            print(f"[错误] 清理目录失败: {e}")
            print("[提示] 请手动删除该目录后重试")
            input("按回车键退出...")
            sys.exit(1)

    print(f"[信息] JMeter路径: {JMETER_BIN}")
    print(f"[信息] 测试文件: {JMETER_JMX}")
    print(f"[信息] 结果文件: {RESULT_JTL}")
    print(f"[信息] HTML报告: {HTML_REPORT}")
    print()
    print("[开始] 执行JMeter测试...")
    print()

    # 检查jmeter.bat中的JVM配置
    print("[诊断] 检查JMeter JVM配置...")
    jmeter_bat_content = ""
    heap_config = None
    gc_config = None
    
    try:
        with open(JMETER_BAT, 'r', encoding='utf-8', errors='ignore') as f:
            jmeter_bat_content = f.read()
        
        # 查找HEAP配置
        import re
        heap_match = re.search(r'set\s+HEAP\s*=\s*(.+)', jmeter_bat_content, re.IGNORECASE)
        if heap_match:
            heap_config = heap_match.group(1).strip()
            print(f"  [找到] HEAP配置: {heap_config}")
        else:
            print("  [警告] 未找到HEAP配置，将使用默认值（可能较小）")
        
        # 查找GC配置
        gc_match = re.search(r'set\s+NEW\s*=\s*(.+)', jmeter_bat_content, re.IGNORECASE)
        if gc_match:
            gc_config = gc_match.group(1).strip()
            print(f"  [找到] GC配置: {gc_config}")
        
        # 检查内存大小
        if heap_config:
            heap_size_match = re.search(r'-Xmx(\d+)([mg])', heap_config, re.IGNORECASE)
            if heap_size_match:
                size = int(heap_size_match.group(1))
                unit = heap_size_match.group(2).lower()
                if unit == 'm' and size < 1024:
                    print(f"  [警告] 堆内存较小（{size}MB），建议至少1GB（1024MB）")
                    print(f"  [建议] 修改 {JMETER_BAT} 中的 HEAP 设置为: -Xms1g -Xmx1g -XX:MaxMetaspaceSize=256m")
    except Exception as e:
        print(f"  [错误] 无法读取jmeter.bat配置: {e}")
    
    print()
    
    # 设置环境变量
    env = os.environ.copy()
    env["JMETER_HOME"] = JMETER_HOME
    
    # 如果检测到内存配置较小，尝试通过环境变量设置（如果jmeter.bat支持）
    # 注意：这取决于jmeter.bat的实现，可能不会生效
    if heap_config and ('-Xmx512m' in heap_config or '-Xmx256m' in heap_config):
        print("[优化] 检测到较小的内存配置，尝试通过环境变量优化...")
        # 某些jmeter.bat版本支持通过环境变量覆盖
        # 但这不保证有效，最好直接修改jmeter.bat文件
        print("  [提示] 如果性能仍不理想，请直接修改jmeter.bat文件")
        print()

    # 构建JMeter命令
    # 注意：JVM参数需要在jmeter.bat中配置
    cmd = [
        JMETER_BAT,
        "-n",  # 非GUI模式
        "-t", JMETER_JMX,  # 测试计划文件
        "-l", str(RESULT_JTL),  # 结果日志文件
        "-e",  # 生成HTML报告
        "-o", str(HTML_REPORT)  # HTML报告输出目录
    ]
    
    # 添加性能优化参数
    # -J 参数可以传递JMeter属性
    # 重要：HTML报告生成需要CSV格式，不能使用XML格式
    cmd.extend([
        "-Jjmeter.save.saveservice.output_format=csv",  # 必须使用CSV格式才能生成HTML报告
    ])

    try:
        # 切换到JMeter的bin目录执行，确保路径正确
        result = subprocess.run(
            cmd,
            cwd=JMETER_BIN,
            env=env,
            check=False,
            encoding="utf-8",
            errors="replace"
        )

        # 检查JTL文件是否生成
        jtl_exists = RESULT_JTL.exists()
        jtl_size = RESULT_JTL.stat().st_size if jtl_exists else 0
        
        # 检查HTML报告是否生成
        html_index = HTML_REPORT / "index.html"
        html_exists = html_index.exists()
        
        if result.returncode == 0:
            print()
            print("=" * 50)
            if jtl_exists and jtl_size > 0:
                print("[成功] 测试执行完成！")
                print("=" * 50)
                print(f"结果文件: {RESULT_JTL} ({jtl_size} 字节)")
                
                if html_exists:
                    print(f"HTML报告: {html_index}")
                else:
                    print("[警告] HTML报告未生成，但JTL文件已生成")
                    print("[提示] 可以使用JTL文件手动生成报告，或检查JMeter日志")
            else:
                print("[警告] JTL文件未生成或为空")
                print("=" * 50)
            
            print()
            
            # 询问是否打开HTML报告
            if html_exists:
                open_report = input("是否打开HTML报告？(Y/N): ").strip().upper()
                if open_report == "Y":
                    if sys.platform == "win32":
                        os.startfile(str(html_index))
                    elif sys.platform == "darwin":
                        subprocess.run(["open", str(html_index)])
                    else:
                        subprocess.run(["xdg-open", str(html_index)])
        else:
            print()
            print("=" * 50)
            print(f"[失败] 测试执行失败，错误代码: {result.returncode}")
            print("=" * 50)
            
            # 检查是否是报告生成错误
            error_output = (result.stdout or "") + (result.stderr or "")
            if "NullPointerException" in error_output or "Error generating the report" in error_output:
                print("[错误分析] JMeter报告生成失败（NullPointerException）")
                print("[可能原因]")
                print("  1. HTML报告输出目录已存在且不为空")
                print("  2. JTL文件格式异常或为空")
                print("  3. JMeter版本问题")
                print("[解决方案]")
                print("  1. 确保HTML报告目录不存在或为空")
                print("  2. 检查JTL文件是否正常生成")
                print("  3. 尝试使用JMeter GUI手动生成报告")
                print()
            
            if result.stdout:
                print("标准输出:")
                print(result.stdout[-2000:])  # 只显示最后2000字符
            if result.stderr:
                print("错误输出:")
                print(result.stderr[-2000:])  # 只显示最后2000字符
            
            # 如果JTL文件已生成，提示可以手动生成报告
            if jtl_exists and jtl_size > 0:
                print()
                print("[提示] JTL文件已生成，可以手动生成HTML报告：")
                print(f'  jmeter -g "{RESULT_JTL}" -o "{HTML_REPORT}"')

    except Exception as e:
        print()
        print("=" * 50)
        print(f"[异常] 执行过程中发生错误: {str(e)}")
        print("=" * 50)
        sys.exit(1)

    print()
    input("按回车键退出...")


if __name__ == "__main__":
    main()
