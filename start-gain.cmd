@echo off
rem Starts Gain. Keep this window open while you walk.
cd /d "%~dp0"
title Gain
node src\server.ts
echo.
echo Gain stopped.
pause
