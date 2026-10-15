# Status:: in-progress
# Windows PowerShell build script — compiles Go engine with standard naming + bundles TypeScript interface.
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir

Write-Host "==> Building Go systems engine (vecta-engine.exe)..." -ForegroundColor Cyan
Set-Location "$RepoDir\engine"
go build -o vecta-engine.exe .

Write-Host "==> Bundling TypeScript interface..." -ForegroundColor Cyan
Set-Location "$RepoDir\interface"
npm run build

Write-Host "==> Vecta built successfully!" -ForegroundColor Green
