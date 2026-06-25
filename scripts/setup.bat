@echo off
echo [x-post-scheduler] Setup starting...
echo.

where node > nul 2>&1
if %errorlevel% neq 0 (
    echo [x-post-scheduler] ERROR: Node.js is not installed.
    echo   Please install from https://nodejs.org/
    pause
    exit /b 1
)

echo [x-post-scheduler] Node.js version:
node --version
echo.

echo [x-post-scheduler] Installing packages...
cd /d "%~dp0.."
call npm install --production
if %errorlevel% neq 0 (
    echo [x-post-scheduler] ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
if not exist config.json (
    copy config.example.json config.json > nul
    echo [x-post-scheduler] config.json created from config.example.json
    echo   Please edit config.json as needed.
) else (
    echo [x-post-scheduler] config.json already exists.
)

echo.
echo [x-post-scheduler] Setup complete!
echo.
echo Next steps:
echo   1. Edit config.json
echo   2. Run login.bat to sign in to X
echo   3. Run server.bat to start the Web UI
echo.
pause
