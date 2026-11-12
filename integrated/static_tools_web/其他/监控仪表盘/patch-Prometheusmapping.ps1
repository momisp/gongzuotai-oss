#Requires -Version 5.1
# Patch Prometheusmapping.yaml: replace Chinese fragments with ASCII (UTF-8 + GBK-safe read).
# Run: powershell -ExecutionPolicy Bypass -File .\patch-Prometheusmapping.ps1

$ErrorActionPreference = "Stop"

function Join-Chars([int[]]$codes) {
    $s = ""
    foreach ($c in $codes) { $s += [char]$c }
    return $s
}

# Longer phrases first (avoid partial matches)
function Apply-Chinese-To-Ascii([string]$text) {
    $list = @(
        @{ Old = (Join-Chars @(0x6709, 0x6548, 0x9891, 0x7387)); New = "eff_freq" }
        @{ Old = (Join-Chars @(0x8D85, 0x51FA, 0x529F, 0x7387, 0x9650, 0x5236)); New = "power_limit" }
        @{ Old = (Join-Chars @(0x8FC7, 0x70ED, 0x964D, 0x9891)); New = "thermal_throttle" }
        @{ Old = (Join-Chars @(0x4E34, 0x754C, 0x6E29, 0x5EA6)); New = "critical_temp" }
        @{ Old = (Join-Chars @(0x9A7B, 0x7559, 0x7387)); New = "residency" }
        @{ Old = (Join-Chars @(0x500D, 0x9891)); New = "multiplier" }
        @{ Old = (Join-Chars @(0x9891, 0x7387)); New = "freq" }
    )
    $n = 0
    foreach ($item in $list) {
        if ($text.Contains($item.Old)) {
            $c = ([regex]::Matches($text, [regex]::Escape($item.Old))).Count
            $text = $text.Replace($item.Old, $item.New)
            $n += $c
            Write-Host ("Replace " + $item.New + " x" + $c)
        }
    }
    if ($n -eq 0) {
        Write-Host "WARN: No Chinese phrases matched in file (mapping may be built only from HWiNFO at runtime)."
    }
    return $text
}

function Read-YamlBytes([string]$path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $segMult = Join-Chars @(0x500D, 0x9891)
    $u8 = [System.Text.Encoding]::UTF8.GetString($bytes)
    if ($u8.Contains($segMult)) {
        return $u8
    }
    $gbk = [System.Text.Encoding]::GetEncoding(936)
    $g = $gbk.GetString($bytes)
    if ($g.Contains($segMult)) {
        Write-Host "Using GBK decode (found multiplier token)."
        return $g
    }
    return $u8
}

$TargetPath = "C:\ProgramData\PromDapter\Prometheusmapping.yaml"
$AltPath = "C:\Program Files\PromDapter\Prometheusmapping.yaml"

if (-not (Test-Path -LiteralPath $TargetPath)) {
    if (Test-Path -LiteralPath $AltPath) {
        Write-Host "Using Program Files copy."
        $TargetPath = $AltPath
    } else {
        Write-Error "Prometheusmapping.yaml not found."
        exit 1
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$TargetPath.bak-$stamp"
Copy-Item -LiteralPath $TargetPath -Destination $backup -Force
Write-Host "Backup OK: $backup"

$content = Read-YamlBytes $TargetPath
if ([string]::IsNullOrEmpty($content)) {
    Write-Error "Empty file."
    exit 1
}

$content = Apply-Chinese-To-Ascii $content

$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($TargetPath, $content, $utf8)

if (Test-Path -LiteralPath "C:\ProgramData\PromDapter\Prometheusmapping.yaml") {
    if ($TargetPath -ne "C:\ProgramData\PromDapter\Prometheusmapping.yaml") {
        Copy-Item -LiteralPath $TargetPath -Destination "C:\ProgramData\PromDapter\Prometheusmapping.yaml" -Force
        Write-Host "Synced to ProgramData\PromDapter\"
    }
}
if ($TargetPath -notlike "*Program Files*" -and (Test-Path -LiteralPath $AltPath)) {
    try {
        Copy-Item -LiteralPath $TargetPath -Destination $AltPath -Force -ErrorAction Stop
        Write-Host "Synced to Program Files\PromDapter\"
    }
    catch {
        Write-Host "Skip copy to Program Files (may need Admin)."
    }
}

Write-Host "File saved."

$svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "PromDapterSvc" }
if (-not $svc) {
    $svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq "Prometheus Adapter" }
}
if ($svc) {
    try {
        Restart-Service -Name $svc[0].Name -Force -ErrorAction Stop
        Write-Host ("Restarted: " + $svc[0].Name)
    }
    catch {
        Write-Host "Could not restart service (try Run as Administrator)."
    }
}

Write-Host ""
Write-Host "1) http://127.0.0.1:10445/metrics/reset"
Write-Host "2) /metrics Ctrl+F multiplier - if still Chinese, see HWiNFO-sensor-rename.txt"
Write-Host "3) Prometheus Targets -> UP"
