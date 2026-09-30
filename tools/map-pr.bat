@echo off
rem Open a pull request with the room and map changes: data\rooms\*.json,
rem data\world.json (connections, and room positions from the world map
rem tool), data\defs.json (enemy templates) and data\lore.json (screen
rem texts), saved from the room editor, the world map tool and the monster
rem editor (D56, D66, D118, D120). Rooms and map go in one PR.
rem
rem Usage: tools\map-pr.bat ["what changed"]
rem
rem Checks the data, puts only those files on a new branch from origin/main,
rem commits, pushes and opens the PR with the GitHub CLI. Without the CLI it
rem prints a link to create the PR in the browser (CLAUDE.md section 10).
rem Other uncommitted changes are carried along but not committed. You stay
rem on the new branch afterwards.

setlocal
cd /d "%~dp0.."

set "WHAT=%~1"
if not defined WHAT set "WHAT=update rooms and map"
rem From here the description is used as !WHAT!: expanded after the line is
rem parsed, so ( ) & < > | in it are plain text, not batch syntax.
setlocal EnableDelayedExpansion

rem Anything to send?
set "CHANGED="
for /f "delims=" %%f in ('git status --porcelain -- data/rooms data/world.json data/defs.json data/lore.json') do set "CHANGED=1"
if not defined CHANGED (
  echo No changes in data\rooms, data\world.json, data\defs.json or data\lore.json: nothing to send.
  exit /b 1
)

echo Checking the game data...
call npm run validate:data
if errorlevel 1 (
  echo The data has errors: fix them first. No PR was made.
  exit /b 1
)

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set "STAMP=%%t"
set "BRANCH=feat/map-%STAMP%"

echo Making branch %BRANCH% from origin/main...
git fetch origin main || exit /b 1
git switch -c "%BRANCH%" origin/main
if errorlevel 1 (
  echo Could not switch to a new branch from origin/main: your other changes
  echo clash with it. Commit or put them aside first. No PR was made.
  exit /b 1
)

git add -A -- data/rooms data/world.json data/defs.json data/lore.json || exit /b 1

rem What kind of change it is, for the summary.
set "ROOMS="
set "WORLD="
set "DEFS="
set "LORE="
for /f "delims=" %%f in ('git diff --cached --name-only -- data/rooms') do set "ROOMS=1"
for /f "delims=" %%f in ('git diff --cached --name-only -- data/world.json') do set "WORLD=1"
for /f "delims=" %%f in ('git diff --cached --name-only -- data/defs.json') do set "DEFS=1"
for /f "delims=" %%f in ('git diff --cached --name-only -- data/lore.json') do set "LORE=1"

set "BODY=%TEMP%\neonmancer-map-pr.md"
> "%BODY%" echo ## Summary
>> "%BODY%" echo.
>> "%BODY%" echo Room and map data: !WHAT!.
>> "%BODY%" echo.
if defined ROOMS >> "%BODY%" echo - Rooms edited in the room editor
if defined WORLD >> "%BODY%" echo - World map: connections and/or room positions ^(world.json^)
if defined DEFS >> "%BODY%" echo - Enemy templates from the monster editor ^(defs.json^)
if defined LORE >> "%BODY%" echo - Screen texts ^(lore.json^)
>> "%BODY%" echo.
>> "%BODY%" echo Changed files:
>> "%BODY%" echo.
for /f "tokens=1,*" %%a in ('git diff --cached --name-status') do >> "%BODY%" echo - %%a `%%b`
>> "%BODY%" echo.
>> "%BODY%" echo ## How it was tested
>> "%BODY%" echo.
>> "%BODY%" echo - [x] `npm run validate:data` passes
>> "%BODY%" echo - [ ] Rooms played in the game (`tools\dev.bat`)
>> "%BODY%" echo - [ ] World map checked (`tools\dev.bat map`)
if defined DEFS >> "%BODY%" echo - [ ] Templates checked in the monster editor ^(`tools\dev.bat monsters`^)

git commit -q -m "feat(map): !WHAT!" || exit /b 1
git push -u origin "%BRANCH%" || exit /b 1

where gh >nul 2>nul
if errorlevel 1 (
  echo.
  echo The GitHub CLI is not installed. Create the PR here:
  echo https://github.com/bluedragon-ctrl/Neonmancer/compare/main...%BRANCH%?expand=1
  echo Title: feat^(map^): !WHAT!
  echo Body:  %BODY%
  exit /b 0
)
gh pr create --base main --head "%BRANCH%" --title "feat(map): !WHAT!" --body-file "%BODY%"
del "%BODY%"
