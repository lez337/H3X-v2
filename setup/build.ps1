$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$out=Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /out:"$out\H3X-Setup.exe" "$PSScriptRoot\Setup.cs"
if($LASTEXITCODE -ne 0){throw 'Setup compilation failed.'}
$files=Get-ChildItem -LiteralPath $out -Filter '*.exe'
$lines=$files | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()+'  '+$_.Name }
[IO.File]::WriteAllLines((Join-Path $out 'SHA256SUMS.txt'),[string[]]$lines,[Text.Encoding]::ASCII)
