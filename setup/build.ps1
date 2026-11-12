# Compatibility entry point for earlier build instructions.
param([string]$Repository=$env:H3X_RELEASE_REPOSITORY)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'Build-Setup.ps1') -Repository $Repository
node (Join-Path $PSScriptRoot 'checksums.cjs')
if($LASTEXITCODE -ne 0){throw 'Release checksums could not be generated.'}
