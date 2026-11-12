param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [switch]$IsDir
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WinFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public const int SW_RESTORE = 9;
    public const byte VK_MENU = 0x12;
    public const uint KEYEVENTF_KEYUP = 0x0002;
}
"@

function Focus-Window([IntPtr]$Handle) {
    if ($Handle -eq [IntPtr]::Zero) { return $false }
    [WinFocus]::AllowSetForegroundWindow(-1) | Out-Null
    [WinFocus]::ShowWindow($Handle, [WinFocus]::SW_RESTORE) | Out-Null
    [WinFocus]::BringWindowToTop($Handle) | Out-Null
    [WinFocus]::keybd_event([WinFocus]::VK_MENU, 0, 0, 0)
    [WinFocus]::keybd_event([WinFocus]::VK_MENU, 0, [WinFocus]::KEYEVENTF_KEYUP, 0)
    [WinFocus]::SwitchToThisWindow($Handle, $true)
    return [WinFocus]::SetForegroundWindow($Handle)
}

function Normalize-Path([string]$Value) {
    $full = [System.IO.Path]::GetFullPath($Value)
    return $full.TrimEnd('\')
}

function Focus-Explorer([string]$TargetPath) {
    $target = Normalize-Path $TargetPath
    $shell = New-Object -ComObject Shell.Application

    $shell.Open($target) | Out-Null
    Start-Sleep -Milliseconds 450

    $best = $null
    foreach ($win in @($shell.Windows())) {
        try {
            $folderPath = Normalize-Path $win.Document.Folder.Self.Path
            if ($folderPath -ieq $target) {
                $best = $win
                break
            }
        } catch {}
    }

    if ($null -eq $best) {
        $wins = @($shell.Windows())
        if ($wins.Count -gt 0) { $best = $wins[$wins.Count - 1] }
    }

    if ($null -ne $best) {
        Focus-Window ([IntPtr][int64]$best.HWND) | Out-Null
    }
}

function Focus-File([string]$TargetPath) {
    $target = Normalize-Path $TargetPath
    [WinFocus]::AllowSetForegroundWindow(-1) | Out-Null

    $proc = Start-Process -FilePath $target -PassThru
    $deadline = (Get-Date).AddSeconds(5)

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 200
        $proc.Refresh()
        if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
            Focus-Window $proc.MainWindowHandle | Out-Null
            return
        }
        if ($proc.HasExited) { break }
    }
}

$resolved = Normalize-Path $Path
if (-not (Test-Path -LiteralPath $resolved)) {
    Write-Error "Path not found: $resolved"
    exit 1
}

if ($IsDir -or (Test-Path -LiteralPath $resolved -PathType Container)) {
    Focus-Explorer $resolved
} else {
    Focus-File $resolved
}
