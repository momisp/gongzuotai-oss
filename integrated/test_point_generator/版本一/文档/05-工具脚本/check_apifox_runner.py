#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Apifox Runner 配置检查脚本
用于检查服务器上 Apifox Runner 的运行状态和配置
"""

import os
import sys
import subprocess
import json
import platform
from pathlib import Path

def print_header(title):
    """打印标题"""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def run_command(cmd, shell=False):
    """执行命令并返回结果"""
    try:
        if isinstance(cmd, str):
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        else:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return False, "", "命令执行超时"
    except Exception as e:
        return False, "", str(e)

def check_runner_process():
    """检查 Runner 进程是否运行"""
    print_header("1. 检查 Runner 进程状态")
    
    system = platform.system().lower()
    
    if system == "linux" or system == "darwin":
        # Linux/Mac 系统
        success, output, error = run_command("ps aux | grep -i apifox | grep -v grep")
        if success and output:
            print("✅ 发现 Apifox Runner 进程:")
            print(output)
            return True
        else:
            print("❌ 未发现 Apifox Runner 进程")
            return False
    elif system == "windows":
        # Windows 系统
        success, output, error = run_command('tasklist | findstr /i "apifox"')
        if success and output:
            print("✅ 发现 Apifox Runner 进程:")
            print(output)
            return True
        else:
            print("❌ 未发现 Apifox Runner 进程")
            return False
    else:
        print(f"⚠️  不支持的系统: {system}")
        return False

def check_runner_config():
    """检查 Runner 配置文件"""
    print_header("2. 检查 Runner 配置文件")
    
    # 常见的配置文件路径
    config_paths = [
        # Linux/Mac
        os.path.expanduser("~/.apifox/runner/config.json"),
        os.path.expanduser("~/.config/apifox/runner/config.json"),
        "/etc/apifox/runner/config.json",
        # Windows
        os.path.expanduser("~\\AppData\\Roaming\\Apifox\\runner\\config.json"),
        os.path.expanduser("~\\AppData\\Local\\Apifox\\runner\\config.json"),
    ]
    
    config_found = False
    for config_path in config_paths:
        if os.path.exists(config_path):
            print(f"✅ 找到配置文件: {config_path}")
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                print("\n配置内容:")
                print(json.dumps(config, indent=2, ensure_ascii=False))
                config_found = True
            except Exception as e:
                print(f"⚠️  读取配置文件失败: {e}")
    
    if not config_found:
        print("❌ 未找到配置文件")
        print("\n常见配置文件位置:")
        for path in config_paths:
            print(f"  - {path}")
    
    return config_found

def check_runner_logs():
    """检查 Runner 日志"""
    print_header("3. 检查 Runner 日志")
    
    log_paths = [
        # Linux/Mac
        os.path.expanduser("~/.apifox/runner/logs"),
        os.path.expanduser("~/.config/apifox/runner/logs"),
        "/var/log/apifox/runner",
        # Windows
        os.path.expanduser("~\\AppData\\Roaming\\Apifox\\runner\\logs"),
        os.path.expanduser("~\\AppData\\Local\\Apifox\\runner\\logs"),
    ]
    
    log_found = False
    for log_dir in log_paths:
        if os.path.exists(log_dir):
            print(f"✅ 找到日志目录: {log_dir}")
            try:
                log_files = sorted(Path(log_dir).glob("*.log"), key=os.path.getmtime, reverse=True)
                if log_files:
                    print(f"\n最新的日志文件: {log_files[0]}")
                    print("\n最后 20 行日志:")
                    with open(log_files[0], 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                        for line in lines[-20:]:
                            print(line.rstrip())
                    log_found = True
            except Exception as e:
                print(f"⚠️  读取日志失败: {e}")
    
    if not log_found:
        print("❌ 未找到日志目录")
    
    return log_found

def check_network_connectivity():
    """检查网络连接"""
    print_header("4. 检查网络连接")
    
    # 检查 Apifox 服务器连接
    apifox_domains = [
        "apifox.com",
        "api.apifox.com",
        "runner.apifox.com",
    ]
    
    system = platform.system().lower()
    ping_cmd = "ping -c 3" if system != "windows" else "ping -n 3"
    
    for domain in apifox_domains:
        print(f"\n检查 {domain} 连接...")
        success, output, error = run_command(f"{ping_cmd} {domain}")
        if success:
            print(f"✅ {domain} 连接正常")
        else:
            print(f"❌ {domain} 连接失败")
            if error:
                print(f"   错误: {error}")

def check_ports():
    """检查端口占用"""
    print_header("5. 检查端口占用")
    
    # Apifox Runner 常用端口
    common_ports = [8080, 3000, 5000, 8000]
    
    system = platform.system().lower()
    
    if system == "linux" or system == "darwin":
        for port in common_ports:
            success, output, error = run_command(f"lsof -i :{port} || netstat -an | grep :{port}")
            if success and output:
                print(f"✅ 端口 {port} 被占用:")
                print(f"   {output}")
    elif system == "windows":
        for port in common_ports:
            success, output, error = run_command(f'netstat -ano | findstr :{port}')
            if success and output:
                print(f"✅ 端口 {port} 被占用:")
                print(f"   {output}")

def check_runner_service():
    """检查 Runner 服务状态（如果作为服务运行）"""
    print_header("6. 检查 Runner 服务状态")
    
    system = platform.system().lower()
    
    if system == "linux":
        # 检查 systemd 服务
        services = ["apifox-runner", "apifox_runner"]
        for service in services:
            success, output, error = run_command(f"systemctl status {service}")
            if success:
                print(f"✅ 发现服务: {service}")
                print(output)
                return True
        
        print("❌ 未发现 systemd 服务")
    elif system == "windows":
        # 检查 Windows 服务
        success, output, error = run_command('sc query | findstr /i "apifox"')
        if success and output:
            print("✅ 发现 Windows 服务:")
            print(output)
        else:
            print("❌ 未发现 Windows 服务")

def main():
    """主函数"""
    print("="*60)
    print("  Apifox Runner 配置检查工具")
    print("="*60)
    print(f"\n系统信息: {platform.system()} {platform.release()}")
    print(f"Python 版本: {sys.version}")
    
    # 执行各项检查
    process_running = check_runner_process()
    config_found = check_runner_config()
    logs_found = check_runner_logs()
    check_network_connectivity()
    check_ports()
    check_runner_service()
    
    # 总结
    print_header("检查总结")
    print(f"进程状态: {'✅ 运行中' if process_running else '❌ 未运行'}")
    print(f"配置文件: {'✅ 已找到' if config_found else '❌ 未找到'}")
    print(f"日志文件: {'✅ 已找到' if logs_found else '❌ 未找到'}")
    
    print("\n" + "="*60)
    print("检查完成！")
    print("="*60)
    
    if not process_running:
        print("\n⚠️  建议:")
        print("1. 检查 Runner 是否已安装")
        print("2. 检查 Runner 是否已启动")
        print("3. 查看日志文件了解启动失败原因")

if __name__ == "__main__":
    main()
