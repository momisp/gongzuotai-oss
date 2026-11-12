# 通过 Performance Counter 估算进程网络 I/O 速率（含磁盘，纯网络型进程可参考）
param([int]$SampleMs = 1000)

$ErrorActionPreference = "SilentlyContinue"

function Get-IoRates {
    $map = @{}
    $read = Get-Counter '\Process(*)\IO Read Bytes/sec' -ErrorAction SilentlyContinue
    $write = Get-Counter '\Process(*)\IO Write Bytes/sec' -ErrorAction SilentlyContinue

    foreach ($set in @($read, $write)) {
        if (-not $set) { continue }
        foreach ($s in $set.CounterSamples) {
            $inst = [string]$s.InstanceName
            if ($inst -match '^(Idle|_Total|System|Secure System|Registry|Memory Compression)$') { continue }
            $base = $inst -replace '#\d+$', ''
            if (-not $map.ContainsKey($base)) {
                $map[$base] = @{ rxSec = 0; txSec = 0 }
            }
            $val = [long][math]::Max(0, [math]::Round($s.CookedValue))
            if ($set -eq $read) { $map[$base].rxSec += $val }
            else { $map[$base].txSec += $val }
        }
    }
    return $map
}

$cur = Get-IoRates
Start-Sleep -Milliseconds $SampleMs
$cur2 = Get-IoRates

$names = @($cur.Keys + $cur2.Keys | Select-Object -Unique)
$items = @()
foreach ($name in $names) {
    $a = $cur[$name]
    $b = $cur2[$name]
    if (-not $b) { continue }
    $rx = [long]$b.rxSec
    $tx = [long]$b.txSec
    $total = $rx + $tx
    if ($total -le 0) { continue }
    $items += [ordered]@{
        name       = $name
        rxSec      = $rx
        txSec      = $tx
        totalSec   = $total
        bytesRecv  = 0
        bytesSent  = 0
        bytesTotal = 0
    }
}

$proc = $items | Sort-Object totalSec -Descending | Select-Object -First 30
@{ processes = @($proc); sampleMs = $SampleMs; method = 'io-counter-estimate' } | ConvertTo-Json -Compress -Depth 4
