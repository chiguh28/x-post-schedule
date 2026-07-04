@echo off
cd /d "%~dp0.."
echo [x-post-scheduler] Starting X login...
echo   (Usually not needed manually - server.bat and schedule.bat
echo   now open this automatically when there is no valid session.
echo   Use this script to log in ahead of time or switch accounts.)
echo   Chrome will open. Sign in to X (2FA supported).
echo   Close the browser when done.
echo.
node dist\index.js login
if %errorlevel% neq 0 (
    echo.
    echo [x-post-scheduler] Login failed.
)
pause
