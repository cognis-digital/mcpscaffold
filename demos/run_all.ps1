# Run every mcpscaffold demo on Windows PowerShell. Exits 0 only if all pass.
# Original Cognis Digital implementation.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here

Write-Host "=== Building library ==="
Push-Location $root
try { npm run build; if ($LASTEXITCODE -ne 0) { throw "build failed" } } finally { Pop-Location }

Write-Host "=== Demo 1: validate gate (valid + invalid spec) ==="
node (Join-Path $here "validate_gate.mjs")
if ($LASTEXITCODE -ne 0) { throw "validate_gate demo failed" }

Write-Host "=== Demo 2: scaffold from spec + run generated smoke test ==="
node (Join-Path $here "scaffold_and_smoke.mjs")
if ($LASTEXITCODE -ne 0) { throw "scaffold_and_smoke demo failed" }

Write-Host ""
Write-Host "All demos passed."
