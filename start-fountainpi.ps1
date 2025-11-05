$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)
function Pause-Exit([string]$msg, [int]$code=1) { if ($msg) { Write-Host "`n$msg`n" -ForegroundColor Yellow }; Read-Host "Press Enter to close"; exit $code }
try { node -v | Out-Null; npm -v  | Out-Null } catch {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Node.js ontbreekt. Installeren via winget..." -ForegroundColor Yellow
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    Write-Host "Start dit script opnieuw nadat Node is geïnstalleerd." -ForegroundColor Cyan
    Pause-Exit ""
  } else {
    Write-Host "Installeer Node LTS via https://nodejs.org en run opnieuw." -ForegroundColor Yellow
    Pause-Exit ""
  }
}
if (-not (Test-Path "node_modules")) { Write-Host "Installing npm dependencies..." -ForegroundColor Cyan; npm install }
Write-Host "Starting dev server..." -ForegroundColor Cyan
npm run dev
