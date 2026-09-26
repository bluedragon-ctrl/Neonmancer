@echo off
rem Open a pull request with the room and map changes: data\rooms\*.json
rem and data\world.json (saved from the room editor, D56).
rem
rem Usage: tools\room-pr.bat ["what changed"]
rem
rem Checks the data, puts only those files on a new branch from origin/main,
rem commits, pushes and opens the PR with the GitHub CLI. Without the CLI it
rem prints a link to create the PR in the browser (CLAUDE.md section 10).
rem Other uncommitted changes are carried along but not committed. You stay
rem on the new branch afterwards.

setlocal
cd /d "%~dp0.."

set "WHAT=%~1"
if not defined WHAT set "WHAT=update rooms"
rem From here the description is used as !WHAT!: expanded after the line is
rem parsed, so ( ) & < > | in it are plain text, not batch syntax.
setlocal EnableDelayedExpansion

rem Anything to send?
set "CHANGED="
for /f "delims=" %%f in ('git status --porcelain -- data/rooms data/world.json') do set "CHANGED=1"
if not defined CHANGED (
  echo No changes in data\rooms or data\world.json: nothing to send.
  exit /b 1
)

echo Checking the game data...
call npm run validate:data
if errorlevel 1 (
  echo The data has errors: fix them first. No PR was made.
  exit /b 1
)

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set "STAMP=%%t"
set "BRANCH=feat/rooms-%STAMP%"

echo Making branch %BRANCH% from origin/main...
git fetch origin main || exit /b 1
git switch -c "%BRANCH%" origin/main
if errorlevel 1 (
  echo Could not switch to a new branch from origin/main: your other changes
  echo clash with it. Commit or put them aside first. No PR was made.
  exit /b 1
)

git add -A -- data/rooms data/world.json || exit /b 1

set "BODY=%TEMP%\neonmancer-room-pr.md"
> "%BODY%" echo ## Summary
>> "%BODY%" echo.
>> "%BODY%" echo Room and map data: !WHAT!.
>> "%BODY%" echo.
>> "%BODY%" echo Changed files:
>> "%BODY%" echo.
for /f "tokens=1,*" %%a in ('git diff --cached --name-status') do >> "%BODY%" echo - %%a `%%b`
>> "%BODY%" echo.
>> "%BODY%" echo ## How it was tested
>> "%BODY%" echo.
>> "%BODY%" echo - [x] `npm run validate:data` passes
>> "%BODY%" echo - [ ] Rooms played in the game (`npm run dev`)

git commit -q -m "feat(rooms): !WHAT!" || exit /b 1
git push -u origin "%BRANCH%" || exit /b 1

where gh >nul 2>nul
if errorlevel 1 (
  echo.
  echo The GitHub CLI is not installed. Create the PR here:
  echo https://github.com/bluedragon-ctrl/Neonmancer/compare/main...%BRANCH%?expand=1
  echo Title: feat^(rooms^): !WHAT!
  echo Body:  %BODY%
  exit /b 0
)
gh pr create --base main --head "%BRANCH%" --title "feat(rooms): !WHAT!" --body-file "%BODY%"
del "%BODY%"
