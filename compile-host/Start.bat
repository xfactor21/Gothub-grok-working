@echo off
setlocal
cd /d "%~dp0"
title xIDE Compile Host
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo xIDE Compile Host needs Node.js 18 or newer.
  echo Install the LTS build from https://nodejs.org then double-click Start again.
  echo.
  pause
  exit /b 1
)
if not exist "toolchains\env.json" (
  echo First start — installing the compile toolchain. This can take several minutes.
  echo.
  node setup.mjs
  if errorlevel 1 (
    echo.
    echo Setup did not finish. Fix the error above and double-click Start again.
    pause
    exit /b 1
  )
)
echo.
node server.mjs
echo.
pause
