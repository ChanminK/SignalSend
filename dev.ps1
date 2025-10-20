$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $RepoRoot "server"
$Client = Join-Path $RepoRoot "client"
$Venv   = Join-Path $Server ".venv"

if (-not (Test-Path $Venv)) {
  Write-Host "Creating venv..." -ForegroundColor Cyan
  py -m venv $Venv
}
. "$Venv\Scripts\Activate.ps1"
python -m pip install --upgrade pip > $null
pip install -r "$Server\requirements.txt"

# starting backend
Write-Host "Starting Flask @ http://127.0.0.1:5000" -ForegroundColor Green
$serverCmd = "cd `"$Server`"; `"$Venv\Scripts\python.exe`" server.py"
Start-Process powershell -ArgumentList "-NoExit","-Command",$serverCmd | Out-Null

# starting frontend
Write-Host "Starting frontend @ http://127.0.0.1:8080" -ForegroundColor Green
Set-Location $Client
py -m http.server 8080
