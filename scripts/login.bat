@echo off
cd /d "%~dp0.."
echo [x-post-scheduler] Starting X login...
echo   Chrome will open. Sign in to X (2FA supported).
echo   Close the browser when done.
echo.
node dist\index.js login
if %errorlevel% neq 0 (
    echo.
    echo [x-post-scheduler] Login failed.
)
pause
