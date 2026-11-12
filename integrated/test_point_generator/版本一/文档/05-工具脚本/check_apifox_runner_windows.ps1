# Apifox Runner 配置检查脚本 (Windows PowerShell)
# 用于检查本机 Windows 上 Apifox Runner 的运行状态和配置

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Apifox Runner 配置检查工具 (Windows)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Runner 进程
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  1. 检查 Runner 进程状态" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$processes = Get-Process | Where-Object { $_.ProcessName -like "*apifox*" -or $_.MainWindowTitle -like "*apifox*" }

if ($processes) {
    Write-Host "✅ 发现 Apifox 相关进程:" -ForegroundColor Green
    $processes | Format-Table ProcessName, Id, CPU, WorkingSet -AutoSize
} else {
    Write-Host "❌ 未发现 Apifox Runner 进程" -ForegroundColor Red
    Write-Host ""
    Write-Host "检查所有包含 'apifox' 的进程..." -ForegroundColor Yellow
    Get-Process | Where-Object { $_.ProcessName -match "apifox" -or $_.Path -match "apifox" } | Format-Table ProcessName, Id, Path -AutoSize
}
Write-Host ""

# 2. 检查配置文件
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  2. 检查 Runner 配置文件" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$configPaths = @(
    "$env:APPDATA\Apifox\runner\config.json",
    "$env:LOCALAPPDATA\Apifox\runner\config.json",
    "$env:USERPROFILE\.apifox\runner\config.json",
    "$env:PROGRAMDATA\Apifox\runner\config.json"
)

$configFound = $false
foreach ($configPath in $configPaths) {
    if (Test-Path $configPath) {
        Write-Host "✅ 找到配置文件: $configPath" -ForegroundColor Green
        Write-Host ""
        Write-Host "配置内容:" -ForegroundColor Cyan
        try {
            $config = Get-Content $configPath -Raw | ConvertFrom-Json
            $config | ConvertTo-Json -Depth 10 | Write-Host
            $configFound = $true
        } catch {
            Write-Host "⚠️  配置文件格式错误: $_" -ForegroundColor Yellow
            Get-Content $configPath | Write-Host
        }
        break
    }
}

if (-not $configFound) {
    Write-Host "❌ 未找到配置文件" -ForegroundColor Red
    Write-Host ""
    Write-Host "常见配置文件位置:" -ForegroundColor Yellow
    foreach ($path in $configPaths) {
        Write-Host "  - $path"
    }
}
Write-Host ""

# 3. 检查日志
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  3. 检查 Runner 日志" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$logDirs = @(
    "$env:APPDATA\Apifox\runner\logs",
    "$env:LOCALAPPDATA\Apifox\runner\logs",
    "$env:USERPROFILE\.apifox\runner\logs",
    "$env:PROGRAMDATA\Apifox\runner\logs"
)

$logFound = $false
foreach ($logDir in $logDirs) {
    if (Test-Path $logDir) {
        Write-Host "✅ 找到日志目录: $logDir" -ForegroundColor Green
        $logFiles = Get-ChildItem $logDir -Filter "*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
        
        if ($logFiles) {
            $latestLog = $logFiles[0]
            Write-Host ""
            Write-Host "最新的日志文件: $($latestLog.FullName)" -ForegroundColor Cyan
            Write-Host "文件大小: $([math]::Round($latestLog.Length / 1KB, 2)) KB" -ForegroundColor Cyan
            Write-Host "最后修改: $($latestLog.LastWriteTime)" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "最后 30 行日志:" -ForegroundColor Cyan
            Write-Host "----------------------------------------" -ForegroundColor Gray
            Get-Content $latestLog.FullName -Tail 30 -ErrorAction SilentlyContinue | Write-Host
            $logFound = $true
        } else {
            Write-Host "⚠️  日志目录为空" -ForegroundColor Yellow
        }
        break
    }
}

if (-not $logFound) {
    Write-Host "❌ 未找到日志目录" -ForegroundColor Red
}
Write-Host ""

# 4. 检查网络连接
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  4. 检查网络连接" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$domains = @("apifox.com", "api.apifox.com", "runner.apifox.com")

foreach ($domain in $domains) {
    Write-Host ""
    Write-Host "检查 $domain 连接..." -ForegroundColor Cyan
    try {
        $result = Test-Connection -ComputerName $domain -Count 2 -ErrorAction Stop
        Write-Host "✅ $domain 连接正常" -ForegroundColor Green
        Write-Host "   平均延迟: $([math]::Round(($result | Measure-Object -Property ResponseTime -Average).Average, 2)) ms" -ForegroundColor Gray
    } catch {
        Write-Host "❌ $domain 连接失败: $_" -ForegroundColor Red
    }
}
Write-Host ""

# 5. 检查端口占用
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  5. 检查端口占用" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$ports = @(8080, 3000, 5000, 8000, 443, 80)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        Write-Host "✅ 端口 $port 被占用:" -ForegroundColor Green
        $connections | Format-Table LocalAddress, LocalPort, State, OwningProcess -AutoSize | Out-String | Write-Host
        
        # 显示占用端口的进程信息
        $pids = $connections | Select-Object -Unique -ExpandProperty OwningProcess
        foreach ($pid in $pids) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "   进程: $($proc.ProcessName) (PID: $pid)" -ForegroundColor Gray
            }
        }
    }
}
Write-Host ""

# 6. 检查 Apifox 安装目录
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  6. 检查 Apifox 安装目录" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$installPaths = @(
    "$env:ProgramFiles\Apifox",
    "${env:ProgramFiles(x86)}\Apifox",
    "$env:LOCALAPPDATA\Programs\Apifox",
    "$env:USERPROFILE\AppData\Local\Apifox"
)

$installFound = $false
foreach ($path in $installPaths) {
    if (Test-Path $path) {
        Write-Host "✅ 找到 Apifox 安装目录: $path" -ForegroundColor Green
        $runnerExe = Get-ChildItem $path -Recurse -Filter "*runner*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($runnerExe) {
            Write-Host "   找到 Runner 可执行文件: $($runnerExe.FullName)" -ForegroundColor Cyan
        }
        $installFound = $true
    }
}

if (-not $installFound) {
    Write-Host "❌ 未找到 Apifox 安装目录" -ForegroundColor Red
}
Write-Host ""

# 7. 检查环境变量
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  7. 检查环境变量" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$envVars = Get-ChildItem Env: | Where-Object { $_.Name -like "*APIFOX*" -or $_.Name -like "*RUNNER*" }
if ($envVars) {
    Write-Host "✅ 找到相关环境变量:" -ForegroundColor Green
    $envVars | Format-Table Name, Value -AutoSize
} else {
    Write-Host "⚠️  未找到 Apifox 相关环境变量" -ForegroundColor Yellow
}
Write-Host ""

# 8. 检查 Windows 服务
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  8. 检查 Windows 服务" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$services = Get-Service | Where-Object { $_.DisplayName -like "*apifox*" -or $_.Name -like "*apifox*" }
if ($services) {
    Write-Host "✅ 发现 Apifox 相关服务:" -ForegroundColor Green
    $services | Format-Table Name, DisplayName, Status -AutoSize
} else {
    Write-Host "❌ 未发现 Apifox 相关 Windows 服务" -ForegroundColor Red
}
Write-Host ""

# 9. 检查防火墙规则
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  9. 检查防火墙规则" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

try {
    $firewallRules = Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*apifox*" } | Select-Object DisplayName, Enabled, Direction, Action
    if ($firewallRules) {
        Write-Host "✅ 发现 Apifox 相关防火墙规则:" -ForegroundColor Green
        $firewallRules | Format-Table -AutoSize
    } else {
        Write-Host "⚠️  未发现 Apifox 相关防火墙规则" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  无法检查防火墙规则（可能需要管理员权限）" -ForegroundColor Yellow
}
Write-Host ""

# 总结
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  检查总结" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$processRunning = $processes -ne $null
$summary = @"
进程状态: $(if ($processRunning) { "✅ 运行中" } else { "❌ 未运行" })
配置文件: $(if ($configFound) { "✅ 已找到" } else { "❌ 未找到" })
日志文件: $(if ($logFound) { "✅ 已找到" } else { "❌ 未找到" })
安装目录: $(if ($installFound) { "✅ 已找到" } else { "❌ 未找到" })
"@

Write-Host $summary
Write-Host ""

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "检查完成！" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if (-not $processRunning) {
    Write-Host ""
    Write-Host "⚠️  建议:" -ForegroundColor Yellow
    Write-Host "1. 检查 Apifox 是否已安装并启动" -ForegroundColor White
    Write-Host "2. 检查 Apifox 客户端是否正常运行" -ForegroundColor White
    Write-Host "3. 查看日志文件了解启动失败原因" -ForegroundColor White
    Write-Host "4. 确认网络连接是否正常" -ForegroundColor White
}

Write-Host ""
Write-Host "提示: 如果 Apifox 客户端显示'连接中'，可能是:" -ForegroundColor Yellow
Write-Host "  - 网络连接问题（检查防火墙、代理设置）" -ForegroundColor White
Write-Host "  - Apifox 服务器暂时不可用" -ForegroundColor White
Write-Host "  - 本地 Runner 服务未启动" -ForegroundColor White
Write-Host "  - 配置文件中的服务器地址不正确" -ForegroundColor White
