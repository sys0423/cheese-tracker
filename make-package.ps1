$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$packageDir = Join-Path $PSScriptRoot "dist"
$zipPath = Join-Path $PSScriptRoot "cheese-tracker.zip"
if (Test-Path $zipPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $zipPath = Join-Path $PSScriptRoot "cheese-tracker-$stamp.zip"
}
$bundledNode = "C:\Users\tlsdu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path $packageDir) {
  Remove-Item -LiteralPath $packageDir -Recurse -Force
}

New-Item -ItemType Directory -Path $packageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $packageDir "runtime") | Out-Null

Copy-Item -LiteralPath "server.js" -Destination $packageDir
Copy-Item -LiteralPath "package.json" -Destination $packageDir
Copy-Item -LiteralPath "README.md" -Destination $packageDir
Copy-Item -LiteralPath "GUIDE.txt" -Destination $packageDir
Copy-Item -LiteralPath "run.bat" -Destination $packageDir
Copy-Item -LiteralPath "run.ps1" -Destination $packageDir
Copy-Item -LiteralPath "public" -Destination $packageDir -Recurse

if (Test-Path $bundledNode) {
  Copy-Item -LiteralPath $bundledNode -Destination (Join-Path $packageDir "runtime\node.exe")
} else {
  Write-Host "Bundled node.exe was not found. The recipient will need Node.js 18+ installed."
}

Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath

Write-Host "Package created:"
Write-Host $zipPath
