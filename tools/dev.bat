@echo off
rem Start the dev server and open the game in the browser.
rem
rem Usage: tools\dev.bat [map | showcase]
rem   (nothing)  the game (F2: room editor)
rem   map        the world map tool (D66)
rem   showcase   the asset showcase
rem
rem Installs the packages first if node_modules is missing. Ctrl+C stops
rem the server. Send saved rooms and map changes with tools\map-pr.bat.

setlocal
cd /d "%~dp0.."

set "PAGE=/"
if /i "%~1"=="map" set "PAGE=/tools/world-map.html"
if /i "%~1"=="showcase" set "PAGE=/tools/showcase.html"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed ^(npm not found^). Get it from https://nodejs.org/
  exit /b 1
)

if not exist node_modules (
  echo Installing packages...
  call npm install
  if errorlevel 1 exit /b 1
)

call npm run dev -- --open "%PAGE%"
