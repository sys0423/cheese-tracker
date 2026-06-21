@echo off
setlocal
cd /d "%~dp0"

if exist "runtime\node.exe" (
  "runtime\node.exe" server.js
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

if exist "C:\Users\tlsdu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "C:\Users\tlsdu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

where node >nul 2>nul
if %ERRORLEVEL%==0 (
  node server.js
  if errorlevel 1 pause
  exit /b %ERRORLEVEL%
)

echo Node.js not found.
echo Use the packaged zip created by make-package.ps1, or install Node.js 18+.
pause
exit /b 1
