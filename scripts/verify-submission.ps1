# Pre-submission gate: official checker, extended suite, checker-parity pytest.
# Requires: docker compose up (portal on http://localhost:8080)
# Usage:  .\scripts\verify-submission.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "Checking portal at http://localhost:8080 ..."
try {
    $null = Invoke-WebRequest -Uri "http://localhost:8080/v1/events/sample-hack-2026/projects" -UseBasicParsing -TimeoutSec 15
} catch {
    Write-Error "Portal not reachable. Run: docker compose up --build"
}

Write-Host "Running spec/run.py ..."
python spec/run.py .dogfood.toml | Set-Content -Encoding utf8 acceptance-report.txt
Get-Content acceptance-report.txt | Select-Object -Last 8

Write-Host "Running tests/acceptance/extended.py ..."
python tests/acceptance/extended.py .dogfood.toml | Set-Content -Encoding utf8 acceptance-report-extended.txt
Get-Content acceptance-report-extended.txt | Select-Object -Last 6

$Py = Join-Path $Root "src\api\.venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
    Write-Error "Missing $Py - create the API venv first (see README Develop)."
}
Write-Host "Running test_acceptance_paths.py ..."
& $Py -m pytest tests/api/test_acceptance_paths.py -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "OK - acceptance-report.txt and acceptance-report-extended.txt updated."
