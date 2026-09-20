@echo off
setlocal EnableExtensions EnableDelayedExpansion
title GALANACCI - Push Current Changes to GitHub

echo.
echo ==============================================================
echo   GALANACCI - PUSH CURRENT CHANGES TO GITHUB
echo ==============================================================
echo.

REM ---------------------------------------------------------------
REM 1. Locate the GALANACCI repo.
REM    - If this BAT is inside the repo, it auto-detects upward.
REM    - Otherwise it asks you to paste the repo folder path.
REM ---------------------------------------------------------------

set "START=%~dp0"
set "REPO="

:SEARCH_UP
if exist "%START%\.git" (
    set "REPO=%START%"
    goto FOUND_REPO
)

for %%I in ("%START%\..") do set "PARENT=%%~fI\"

if /I "%PARENT%"=="%START%" goto ASK_REPO

set "START=%PARENT%"
goto SEARCH_UP

:ASK_REPO
echo Could not auto-detect the Git repo.
echo.
set /p "REPO=Paste your GALANACCI-THE-CREATOR repo folder path: "
set "REPO=%REPO:"=%"

if not exist "%REPO%\.git" (
    echo.
    echo ERROR: This folder does not contain a .git repository:
    echo %REPO%
    echo.
    pause
    exit /b 1
)

:FOUND_REPO
cd /d "%REPO%"

echo Repo:
echo %CD%
echo.

REM ---------------------------------------------------------------
REM 2. Safety check: make sure this is the GALANACCI GitHub repo.
REM ---------------------------------------------------------------

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "ORIGIN=%%R"

if not defined ORIGIN (
    echo ERROR: No Git remote named "origin" was found.
    echo.
    pause
    exit /b 1
)

echo GitHub remote:
echo %ORIGIN%
echo.

echo %ORIGIN% | findstr /I /C:"galanacci/GALANACCI-THE-CREATOR" >nul

if errorlevel 1 (
    echo ==============================================================
    echo WARNING
    echo ==============================================================
    echo This does NOT look like the expected GALANACCI repository:
    echo.
    echo   galanacci/GALANACCI-THE-CREATOR
    echo.
    echo Current origin:
    echo   %ORIGIN%
    echo.
    choice /C YN /N /M "Continue anyway? [Y/N]: "

    if errorlevel 2 exit /b 1
)

REM ---------------------------------------------------------------
REM 3. Show changes BEFORE staging.
REM ---------------------------------------------------------------

echo.
echo ==============================================================
echo   CURRENT CHANGES
echo ==============================================================
echo.

git status --short

echo.

git diff --quiet
set "TRACKED_CHANGED=%ERRORLEVEL%"

git diff --cached --quiet
set "STAGED_CHANGED=%ERRORLEVEL%"

for /f %%C in ('git status --porcelain ^| find /C /V ""') do set "CHANGECOUNT=%%C"

if "%CHANGECOUNT%"=="0" (
    echo No local changes found. Nothing to commit.
    echo.
    pause
    exit /b 0
)

choice /C YN /N /M "Stage ALL changes shown above and continue? [Y/N]: "

if errorlevel 2 (
    echo.
    echo Cancelled. Nothing was changed.
    pause
    exit /b 0
)

REM ---------------------------------------------------------------
REM 4. Stage everything.
REM ---------------------------------------------------------------

echo.
echo Staging changes...
git add -A

if errorlevel 1 (
    echo.
    echo ERROR: git add failed.
    pause
    exit /b 1
)

echo.
echo ==============================================================
echo   STAGED CHANGES
echo ==============================================================
echo.

git status --short
echo.

REM ---------------------------------------------------------------
REM 5. Commit.
REM ---------------------------------------------------------------

set /p "COMMITMSG=Commit message (press ENTER for default): "

if not defined COMMITMSG (
    set "COMMITMSG=Update GALANACCI website"
)

echo.
echo Committing:
echo "%COMMITMSG%"
echo.

git commit -m "%COMMITMSG%"

if errorlevel 1 (
    echo.
    echo Commit was not created.
    echo This usually means there was nothing new to commit.
    echo.
    git status
    pause
    exit /b 1
)

REM ---------------------------------------------------------------
REM 6. Push current branch.
REM ---------------------------------------------------------------

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"

if not defined BRANCH (
    echo.
    echo ERROR: Could not determine the current Git branch.
    pause
    exit /b 1
)

echo.
echo Current branch:
echo %BRANCH%
echo.

git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >nul 2>nul

if errorlevel 1 (
    echo No upstream branch is set yet.
    echo Setting origin/%BRANCH% as upstream and pushing...
    echo.

    git push -u origin "%BRANCH%"
) else (
    echo Pushing to GitHub...
    echo.

    git push
)

if errorlevel 1 (
    echo.
    echo ==============================================================
    echo   PUSH FAILED
    echo ==============================================================
    echo.
    echo Your commit is still safely saved locally.
    echo Check the Git error above, then run this BAT again.
    echo.
    pause
    exit /b 1
)

echo.
echo ==============================================================
echo   SUCCESS
echo ==============================================================
echo.
echo GALANACCI changes have been pushed to GitHub.
echo.
echo Repo:
echo %ORIGIN%
echo.
echo Branch:
echo %BRANCH%
echo.

git log -1 --oneline

echo.
pause
exit /b 0
