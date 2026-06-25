@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..
cd /d "%ROOT_DIR%"

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VERSION=%%v
set DIST_NAME=x-post-scheduler-v%VERSION%
set DIST_DIR=release\%DIST_NAME%

echo [x-post-scheduler] Building release package (v%VERSION%)
echo.

:: [1/4] Build
echo [1/4] Building x-post-scheduler...
call npm run build
if errorlevel 1 ( echo ERROR: build failed & exit /b 1 )

:: [2/4] Test
echo [2/4] Running tests...
call npm test
if errorlevel 1 ( echo ERROR: tests failed & exit /b 1 )

:: [3/4] Package
echo [3/4] Packaging...
if exist release\ rmdir /s /q release
mkdir "%DIST_DIR%"

robocopy dist          "%DIST_DIR%\dist"    /e /nfl /ndl /njh /njs > nul
robocopy scripts       "%DIST_DIR%\scripts" /e /nfl /ndl /njh /njs > nul
copy package.json        "%DIST_DIR%\package.json"        > nul
copy config.example.json "%DIST_DIR%\config.example.json" > nul
copy LICENSE             "%DIST_DIR%\LICENSE"             > nul
copy docs\manual.md      "%DIST_DIR%\manual.md"           > nul

:: Bundle x-share into vendor/ so npm install can resolve the file: dependency
mkdir "%DIST_DIR%\vendor\x-share"
robocopy "..\x-share\dist" "%DIST_DIR%\vendor\x-share\dist" /e /nfl /ndl /njh /njs > nul
copy "..\x-share\package.json" "%DIST_DIR%\vendor\x-share\package.json" > nul

:: Rewrite package.json for distribution (point x-share to vendor/)
node -e "const fs=require('fs');const p='%DIST_DIR:\=\\%\\package.json';const pkg=JSON.parse(fs.readFileSync(p,'utf8'));pkg.dependencies['@chiguh28/x-share']='file:./vendor/x-share';delete pkg.devDependencies;delete pkg.bin;pkg.scripts={start:'node dist/index.js server',login:'node dist/index.js login'};fs.writeFileSync(p,JSON.stringify(pkg,null,2));"

:: Generate README
(
echo # x-post-scheduler
echo.
echo Bulk-schedule X ^(Twitter^) posts from a Markdown file.
echo.
echo ## Requirements
echo.
echo - Node.js 18+: https://nodejs.org/
echo - Google Chrome
echo.
echo ## Setup
echo.
echo 1. Extract the ZIP
echo 2. Double-click setup.bat
echo 3. Edit config.json if needed
echo 4. Double-click login.bat and sign in to X
echo.
echo ## Usage
echo.
echo ### Web UI ^(recommended^)
echo.
echo Double-click server.bat, then open http://localhost:3456
echo.
echo ### CLI
echo.
echo   schedule.bat schedule.md
echo   schedule.bat schedule.md --dry-run
echo   schedule.bat schedule.md --headless
echo.
echo ## License
echo.
echo MIT
) > "%DIST_DIR%\README.md"

:: Remove dev-only scripts from release
del /q "%DIST_DIR%\scripts\build-dist.bat" 2>nul
del /q "%DIST_DIR%\scripts\build-dist.sh"  2>nul

:: [4/4] Zip
echo [4/4] Creating ZIP...
cd /d "%ROOT_DIR%\release"
powershell -Command "Compress-Archive -Path '%DIST_NAME%' -DestinationPath '%DIST_NAME%.zip' -Force"
if errorlevel 1 ( echo ERROR: ZIP creation failed & exit /b 1 )

cd /d "%ROOT_DIR%"
echo.
echo [x-post-scheduler] Done!
echo   ZIP: release\%DIST_NAME%.zip
echo.
echo Steps for users:
echo   1. Extract ZIP
echo   2. Run setup.bat
echo   3. Run login.bat to sign in to X
echo   4. Run server.bat to start Web UI
