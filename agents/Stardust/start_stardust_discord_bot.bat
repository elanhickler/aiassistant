@echo off
setlocal

set "AGENT_NAME=Stardust"
set "HERMES_NODE=%LOCALAPPDATA%\hermes\node"

if exist "%HERMES_NODE%\npm.cmd" (
    set "PATH=%HERMES_NODE%;%PATH%"
)

cd /d "%~dp0..\..\discord-bot"

where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo npm.cmd was not found.
    echo Install Node.js or update this launcher with your npm.cmd path.
    pause
    exit /b 1
)

echo Starting Stardust Discord bot.
echo Leave this window open to keep Stardust online.
echo To turn Stardust off, press Ctrl+C, then type Y when Windows asks "Terminate batch job?"
echo.

npm.cmd start

echo.
echo Stardust is now offline.
pause
