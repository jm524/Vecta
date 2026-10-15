# Status:: in-progress
# Windows PowerShell build script — compiles Go engine with standard naming + bundles TypeScript interface.
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir

Write-Host "==> Building Go systems engine (vecta-engine.exe)..." -ForegroundColor Cyan
Set-Location "$RepoDir\engine"
go build -o vecta-engine.exe .

Write-Host "==> Building Windows keyboard monitor helper (keymonitor.exe)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$RepoDir\interface\dist\helpers" | Out-Null
Set-Location "$RepoDir\interface\src\helpers"
go build -o "$RepoDir\interface\dist\helpers\keymonitor.exe" keymonitor.go

Write-Host "==> Bundling TypeScript interface..." -ForegroundColor Cyan
Set-Location "$RepoDir\interface"
npm run build

Write-Host "==> Vecta built successfully!" -ForegroundColor Green

