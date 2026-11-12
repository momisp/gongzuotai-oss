# VPN log viewer - no admin required
# UTF-8

Write-Host "========================================"
Write-Host " VPN Logs (last 1 hour)"
Write-Host "========================================"
Write-Host ""

$events = Get-WinEvent -FilterHashtable @{
    LogName      = 'Application'
    ProviderName = 'RasClient'
    StartTime    = (Get-Date).AddHours(-1)
} -MaxEvents 20 -ErrorAction SilentlyContinue

if (-not $events) {
    Write-Host "No recent VPN logs found."
}
else {
    foreach ($e in $events) {
        $color = 'White'
        if ($e.Id -eq 20227) { $color = 'Red' }
        if ($e.Id -eq 20226) { $color = 'Green' }
        Write-Host "[$($e.TimeCreated.ToString('HH:mm:ss'))] Event $($e.Id)" -ForegroundColor $color
        Write-Host $e.Message
        Write-Host "---"
    }
}

Write-Host ""
Write-Host "Trace log files (need tracing enabled first):"
$traceDir = "C:\Windows\tracing"
if (Test-Path $traceDir) {
    Get-ChildItem $traceDir -Filter "*.log" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 |
        Format-Table Name, LastWriteTime, @{N='SizeKB';E={[math]::Round($_.Length/1KB,1)}} -AutoSize
}
else {
    Write-Host "  Trace dir not found. Run fix-l2tp-vpn.ps1 as admin first."
}

Read-Host "Press Enter to exit"
