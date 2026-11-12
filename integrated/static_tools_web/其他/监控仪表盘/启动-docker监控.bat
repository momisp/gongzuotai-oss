@echo off
chcp 65001 >nul
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo 未检测到 docker 命令，请先安装并启动 Docker Desktop。
  pause
  exit /b 1
)

docker compose -p tools-monitoring up -d
if errorlevel 1 (
  echo.
  echo 启动失败。若是「拉取镜像超时/registry-1.docker 连不上」：请配置 Docker 镜像加速或代理（见本目录 使用说明.txt「常见问题」）。
  echo 再重试：docker compose -p tools-monitoring up -d
  pause
  exit /b 1
)

echo.
echo 已启动。本机访问：
echo   Prometheus   http://127.0.0.1:9090
echo   Grafana        http://127.0.0.1:3000
echo.
echo 请在 Prometheus 页面中打开 Status - Targets，确认 promdapter 为绿色 UP。
echo Grafana 默认用户与密码均为 admin。
echo.
echo 请先确保 HWiNFO 与 PromDapter 已运行，否则 Prometheus 拉不到硬件数据。
pause
