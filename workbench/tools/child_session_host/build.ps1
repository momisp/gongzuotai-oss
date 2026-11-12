$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "找不到 csc.exe" }
$out = Join-Path $here "ChildSessionHost.exe"
& $csc /nologo /target:winexe /platform:x64 /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:$out (Join-Path $here "ChildSessionHost.cs")
if ($LASTEXITCODE -ne 0) { throw "编译失败" }
Get-Item $out | Select-Object FullName, Length, LastWriteTime
