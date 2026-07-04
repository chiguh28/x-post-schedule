@echo off
cd /d "%~dp0.."
echo [x-post-scheduler] Starting Web UI server...
echo   Open http://localhost:3456 in your browser.
echo   If not logged in, click the "Login" button in the header.
echo   Press Ctrl+C to stop.
echo.
node dist\index.js server %*
