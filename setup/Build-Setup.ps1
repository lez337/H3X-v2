param([string]$Repository = $env:H3X_RELEASE_REPOSITORY)
$ErrorActionPreference='Stop'
if($Repository -and $Repository -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$'){throw 'Repository must be owner/name.'}
$root=Split-Path $PSScriptRoot -Parent
$manifest=Get-Content (Join-Path $root 'package.json') -Raw|ConvertFrom-Json
$version=$manifest.version
if(!$Repository){$Repository=$manifest.releaseRepository}
if($Repository -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$'){throw 'Configure releaseRepository in package.json as owner/name.'}
$release=Join-Path $root 'release'
[void](New-Item -ItemType Directory -Force -Path $release)
$icon=Join-Path $root 'build/icon.ico'
$png=Join-Path $root 'build/setup-icon.png'
# Extract the original PNG payload so the setup uses the exact app icon.
$bytes=[IO.File]::ReadAllBytes($icon)
$found=$false
for($i=0;$i -lt [BitConverter]::ToUInt16($bytes,4);$i++){
    $offset=[BitConverter]::ToUInt32($bytes,6+16*$i+12)
    $length=[BitConverter]::ToUInt32($bytes,6+16*$i+8)
    if($bytes[$offset] -eq 137 -and $bytes[$offset+1] -eq 80){
        $image=New-Object byte[] $length;[Array]::Copy($bytes,$offset,$image,0,$length)
        [IO.File]::WriteAllBytes($png,$image);$found=$true;break
    }
}
if(!$found){throw 'The app icon must include a PNG image.'}
$config=Join-Path $release 'setup-config.json'
@{repository=[string]$Repository;version=$version}|ConvertTo-Json|Set-Content -LiteralPath $config -Encoding UTF8
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'The Windows .NET Framework C# compiler was not found.'}
$output=Join-Path $release "H3X-Setup-$version.exe"
try{
    & $compiler /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll "/win32icon:$icon" "/out:$output" "/resource:$(Join-Path $PSScriptRoot 'H3X-Setup.ps1'),H3X-Setup.ps1" "/resource:$png,setup-icon.png" "/resource:$config,setup-config.json" (Join-Path $PSScriptRoot 'SetupLauncher.cs')
    if($LASTEXITCODE -ne 0){throw 'Setup launcher compilation failed.'}
}finally{Remove-Item -LiteralPath $config -Force -ErrorAction SilentlyContinue}
Write-Output "Built $output"
Copy-Item -LiteralPath $output -Destination (Join-Path $release 'H3X-Setup.exe') -Force
