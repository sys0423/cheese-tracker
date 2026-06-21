$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$portableNode = Join-Path $PSScriptRoot "runtime\node.exe"
$bundledNode = "C:\Users\tlsdu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$server = Join-Path $PSScriptRoot "server.js"

if (Test-Path $portableNode) {
  Write-Host "Starting Cheese Tracker with portable Node..."
  & $portableNode $server
  exit $LASTEXITCODE
}

if (Test-Path $bundledNode) {
  Write-Host "Starting Cheese Tracker with bundled Node..."
  & $bundledNode $server
  exit $LASTEXITCODE
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  Write-Host "Starting Cheese Tracker with system Node..."
  & $node.Source $server
  exit $LASTEXITCODE
}

Write-Host "Node.js not found."
Write-Host "Use the packaged zip created by make-package.ps1, or install Node.js 18+."
exit 1
