@echo off
setlocal

set "AGENT_NAME=Trish"
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

echo Starting Trish Discord bot.
echo Leave this window open to keep Trish online.
echo To turn Trish off, press Ctrl+C, then type Y when Windows asks "Terminate batch job?"
echo.

npm.cmd start

echo.
echo Trish is now offline.
pause
