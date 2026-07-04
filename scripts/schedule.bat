@echo off
cd /d "%~dp0.."

if "%~1"=="" (
    echo [x-post-scheduler] Bulk schedule from Markdown file
    echo   Not logged in to X yet? No problem - Chrome will open
    echo   automatically for login before scheduling starts.
    echo.
    echo Usage:
    echo   schedule.bat schedule.md
    echo   schedule.bat schedule.md --dry-run
    echo   schedule.bat schedule.md --headless --delay 3000
    echo.
    pause
    exit /b 0
)

node dist\index.js schedule %*
if %errorlevel% neq 0 (
    echo.
    echo [x-post-scheduler] Scheduling failed.
)
pause
