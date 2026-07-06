# Install mcpscaffold from source (Windows PowerShell).
#   ./install.ps1          # npm ci + build + test
#   ./install.ps1 -Link    # also `npm link` the CLI globally
# Original Cognis Digital implementation.
param([switch]$Link)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "==> Installing dependencies"
if (Test-Path package-lock.json) { npm ci } else { npm install }
if ($LASTEXITCODE -ne 0) { throw "install failed" }

Write-Host "==> Building"
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "==> Testing"
npm test
if ($LASTEXITCODE -ne 0) { throw "tests failed" }

if ($Link) {
  Write-Host "==> Linking CLI globally (npm link)"
  npm link
  Write-Host "mcpscaffold is now on your PATH. Try: mcpscaffold --help"
} else {
  Write-Host "Done. Run the CLI with: node dist/cli.js --help"
  Write-Host "(re-run with -Link to put 'mcpscaffold' on your PATH)"
}
