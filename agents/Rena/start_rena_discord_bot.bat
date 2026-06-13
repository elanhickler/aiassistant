@echo off
setlocal

set "AGENT_NAME=Rena"
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

echo Starting Rena Discord bot.
echo Leave this window open to keep Rena online.
echo To turn Rena off, press Ctrl+C, then type Y when Windows asks "Terminate batch job?"
echo.

npm.cmd start

echo.
echo Rena is now offline.
pause
