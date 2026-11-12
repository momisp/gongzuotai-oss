# L2TP VPN error 788 fix - MUST run as Administrator
# Right-click PowerShell -> Run as administrator

$ErrorActionPreference = 'Stop'

Write-Host "========================================"
Write-Host " L2TP VPN Error 788 Fix"
Write-Host "========================================"
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Please run as Administrator!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/5] Adding NAT traversal registry key..."
reg add "HKLM\SYSTEM\CurrentControlSet\Services\PolicyAgent" /v AssumeUDPEncapsulationContextOnSendRule /t REG_DWORD /d 2 /f

Write-Host "[2/5] Allowing L2TP weak crypto..."
reg add "HKLM\SYSTEM\CurrentControlSet\Services\RasMan\Parameters" /v AllowL2TPWeakCrypto /t REG_DWORD /d 1 /f

Write-Host "[3/5] Enabling VPN trace logging..."
netsh ras set tracing * enabled

Write-Host "[4/5] Restarting VPN services..."
Restart-Service IKEEXT, PolicyAgent, RasMan -Force -ErrorAction SilentlyContinue

Write-Host "[5/5] Testing server connectivity..."
$server = "220.162.35.67"
$ping = Test-Connection -ComputerName $server -Count 2 -Quiet
if ($ping) { Write-Host "  Ping $server : OK" } else { Write-Host "  Ping $server : FAIL" }

Write-Host ""
Write-Host "========================================"
Write-Host " Done! Next steps:"
Write-Host "========================================"
Write-Host "1. Settings -> Network -> VPN -> NeiWang (内网)"
Write-Host "2. Advanced options -> verify Pre-shared Key"
Write-Host "3. Try connecting again"
Write-Host ""
Write-Host "If still fails, check logs:"
Write-Host "  eventvwr.msc -> Application -> filter RasClient"
Write-Host "  C:\Windows\tracing\RasIpsec.log"
Write-Host ""

Read-Host "Press Enter to exit"
