@echo off
setlocal

cd /d "%~dp0"

if /i "%~1"=="--help" goto :help
if /i "%~1"=="-h" goto :help
if /i "%~1"=="/?" goto :help

where corepack >nul 2>nul
if errorlevel 1 (
  echo [PromptBridge] corepack was not found. Install Node.js 22+ and try again.
  exit /b 1
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [PromptBridge] Starting template server on port 8787...
  start "PromptBridge Server" cmd /k "cd /d ""%~dp0"" && corepack pnpm server"
) else (
  echo [PromptBridge] Template server is already running on port 8787.
)

echo [PromptBridge] Building extension...
call corepack pnpm build
if errorlevel 1 (
  echo [PromptBridge] Build failed. Check the messages above.
  exit /b 1
)

echo.
echo [PromptBridge] Ready to use.
echo 1. Open chrome://extensions
echo 2. Reload the PromptBridge extension
echo 3. Refresh any open AI chat tabs
echo 4. Click "Optimize with PromptBridge"
echo.
echo [PromptBridge] Keep the server window open while using the extension.
exit /b 0

:help
echo PromptBridge Windows starter
echo.
echo Usage:
echo   start-all.bat
echo.
echo What it does:
echo   1. Starts the local template server if port 8787 is not already in use
echo   2. Builds the extension into dist/
echo   3. Prints the Chrome reload steps
exit /b 0
