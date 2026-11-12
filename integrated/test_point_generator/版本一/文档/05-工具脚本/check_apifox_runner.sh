#!/bin/bash
# Apifox Runner 配置检查脚本 (Linux/Mac)
# 用于检查服务器上 Apifox Runner 的运行状态和配置

echo "============================================================"
echo "  Apifox Runner 配置检查工具"
echo "============================================================"
echo ""

# 1. 检查 Runner 进程
echo "============================================================"
echo "  1. 检查 Runner 进程状态"
echo "============================================================"
if pgrep -f apifox > /dev/null; then
    echo "✅ 发现 Apifox Runner 进程:"
    ps aux | grep -i apifox | grep -v grep
else
    echo "❌ 未发现 Apifox Runner 进程"
fi
echo ""

# 2. 检查配置文件
echo "============================================================"
echo "  2. 检查 Runner 配置文件"
echo "============================================================"
CONFIG_PATHS=(
    "$HOME/.apifox/runner/config.json"
    "$HOME/.config/apifox/runner/config.json"
    "/etc/apifox/runner/config.json"
)

CONFIG_FOUND=0
for config_path in "${CONFIG_PATHS[@]}"; do
    if [ -f "$config_path" ]; then
        echo "✅ 找到配置文件: $config_path"
        echo ""
        echo "配置内容:"
        cat "$config_path" | python3 -m json.tool 2>/dev/null || cat "$config_path"
        CONFIG_FOUND=1
        break
    fi
done

if [ $CONFIG_FOUND -eq 0 ]; then
    echo "❌ 未找到配置文件"
    echo ""
    echo "常见配置文件位置:"
    for path in "${CONFIG_PATHS[@]}"; do
        echo "  - $path"
    done
fi
echo ""

# 3. 检查日志
echo "============================================================"
echo "  3. 检查 Runner 日志"
echo "============================================================"
LOG_DIRS=(
    "$HOME/.apifox/runner/logs"
    "$HOME/.config/apifox/runner/logs"
    "/var/log/apifox/runner"
)

LOG_FOUND=0
for log_dir in "${LOG_DIRS[@]}"; do
    if [ -d "$log_dir" ]; then
        echo "✅ 找到日志目录: $log_dir"
        LATEST_LOG=$(ls -t "$log_dir"/*.log 2>/dev/null | head -1)
        if [ -n "$LATEST_LOG" ]; then
            echo ""
            echo "最新的日志文件: $LATEST_LOG"
            echo ""
            echo "最后 20 行日志:"
            tail -20 "$LATEST_LOG"
            LOG_FOUND=1
        fi
        break
    fi
done

if [ $LOG_FOUND -eq 0 ]; then
    echo "❌ 未找到日志目录"
fi
echo ""

# 4. 检查网络连接
echo "============================================================"
echo "  4. 检查网络连接"
echo "============================================================"
DOMAINS=("apifox.com" "api.apifox.com" "runner.apifox.com")

for domain in "${DOMAINS[@]}"; do
    echo ""
    echo "检查 $domain 连接..."
    if ping -c 3 -W 2 "$domain" > /dev/null 2>&1; then
        echo "✅ $domain 连接正常"
    else
        echo "❌ $domain 连接失败"
    fi
done
echo ""

# 5. 检查端口占用
echo "============================================================"
echo "  5. 检查端口占用"
echo "============================================================"
PORTS=(8080 3000 5000 8000)

for port in "${PORTS[@]}"; do
    if lsof -i :$port > /dev/null 2>&1 || netstat -an | grep -q ":$port "; then
        echo "✅ 端口 $port 被占用:"
        lsof -i :$port 2>/dev/null || netstat -an | grep ":$port "
    fi
done
echo ""

# 6. 检查服务状态
echo "============================================================"
echo "  6. 检查 Runner 服务状态"
echo "============================================================"
SERVICES=("apifox-runner" "apifox_runner")

SERVICE_FOUND=0
for service in "${SERVICES[@]}"; do
    if systemctl list-unit-files | grep -q "$service"; then
        echo "✅ 发现服务: $service"
        systemctl status "$service" --no-pager
        SERVICE_FOUND=1
        break
    fi
done

if [ $SERVICE_FOUND -eq 0 ]; then
    echo "❌ 未发现 systemd 服务"
fi
echo ""

# 总结
echo "============================================================"
echo "  检查总结"
echo "============================================================"
if pgrep -f apifox > /dev/null; then
    echo "进程状态: ✅ 运行中"
else
    echo "进程状态: ❌ 未运行"
fi

if [ $CONFIG_FOUND -eq 1 ]; then
    echo "配置文件: ✅ 已找到"
else
    echo "配置文件: ❌ 未找到"
fi

if [ $LOG_FOUND -eq 1 ]; then
    echo "日志文件: ✅ 已找到"
else
    echo "日志文件: ❌ 未找到"
fi

echo ""
echo "============================================================"
echo "检查完成！"
echo "============================================================"

if ! pgrep -f apifox > /dev/null; then
    echo ""
    echo "⚠️  建议:"
    echo "1. 检查 Runner 是否已安装"
    echo "2. 检查 Runner 是否已启动"
    echo "3. 查看日志文件了解启动失败原因"
fi
