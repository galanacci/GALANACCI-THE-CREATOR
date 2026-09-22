@echo off
setlocal EnableExtensions DisableDelayedExpansion

title GALANACCI OS - Sync to main
cd /d "%~dp0"

echo.
echo ============================================================
echo   GALANACCI OS - SAFE SYNC TO MAIN
echo ============================================================
echo.

where git >nul 2>&1
if errorlevel 1 goto :missing_git

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :not_repository

git remote get-url origin >nul 2>&1
if errorlevel 1 goto :missing_origin

for /f "delims=" %%I in ('git branch --show-current') do set "CURRENT_BRANCH=%%I"
if /i not "%CURRENT_BRANCH%"=="main" goto :wrong_branch

for /f "delims=" %%I in ('git rev-parse --git-path rebase-merge') do set "REBASE_MERGE=%%I"
for /f "delims=" %%I in ('git rev-parse --git-path rebase-apply') do set "REBASE_APPLY=%%I"
for /f "delims=" %%I in ('git rev-parse --git-path MERGE_HEAD') do set "MERGE_HEAD=%%I"
for /f "delims=" %%I in ('git rev-parse --git-path CHERRY_PICK_HEAD') do set "CHERRY_PICK_HEAD=%%I"

if exist "%REBASE_MERGE%" goto :operation_in_progress
if exist "%REBASE_APPLY%" goto :operation_in_progress
if exist "%MERGE_HEAD%" goto :operation_in_progress
if exist "%CHERRY_PICK_HEAD%" goto :operation_in_progress

set "HAS_CONFLICTS="
for /f "delims=" %%I in ('git diff --name-only --diff-filter^=U') do set "HAS_CONFLICTS=1"
if defined HAS_CONFLICTS goto :unresolved_conflicts

set "HAS_CHANGES="
for /f "delims=" %%I in ('git status --porcelain') do set "HAS_CHANGES=1"

if not defined HAS_CHANGES goto :fetch_remote

echo Local changes found:
echo.
git status --short
echo.
choice /C YN /N /M "Commit ALL changes shown above and sync them? [Y/N]: "
if errorlevel 2 goto :cancelled

git add -A
if errorlevel 1 goto :failed

git diff --cached --check
if errorlevel 1 goto :invalid_diff

echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$m = Read-Host 'Enter a short commit message'; if ([string]::IsNullOrWhiteSpace($m)) { Write-Host 'A commit message is required.'; exit 1 }; & git commit -m $m; exit $LASTEXITCODE"
if errorlevel 1 goto :failed

:fetch_remote
echo.
echo [1/4] Fetching the latest main branch...
git fetch origin main
if errorlevel 1 goto :failed

echo.
echo [2/4] Replaying local commits on top of origin/main...
git rebase origin/main
if errorlevel 1 goto :rebase_failed

echo.
echo [3/4] Pushing main to GitHub...
git push origin main
if errorlevel 1 goto :push_failed

echo.
echo [4/4] Waiting for any automatic post-push update...
set /a SYNC_ATTEMPT=0

:post_push_check
set /a SYNC_ATTEMPT+=1
timeout /t 5 /nobreak >nul
git fetch origin main --quiet
if errorlevel 1 goto :failed

for /f "delims=" %%I in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%I"
for /f "delims=" %%I in ('git rev-parse origin/main') do set "REMOTE_HEAD=%%I"

if "%LOCAL_HEAD%"=="%REMOTE_HEAD%" goto :post_push_next

git merge-base --is-ancestor HEAD origin/main >nul 2>&1
if errorlevel 1 goto :unexpected_divergence

echo Automatic remote update detected. Syncing it locally...
git pull --ff-only origin main
if errorlevel 1 goto :failed

:post_push_next
if %SYNC_ATTEMPT% LSS 6 goto :post_push_check

git fetch origin main --quiet
if errorlevel 1 goto :failed

for /f "delims=" %%I in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%I"
for /f "delims=" %%I in ('git rev-parse origin/main') do set "REMOTE_HEAD=%%I"
if not "%LOCAL_HEAD%"=="%REMOTE_HEAD%" goto :unexpected_divergence

set "FINAL_CHANGES="
for /f "delims=" %%I in ('git status --porcelain') do set "FINAL_CHANGES=1"
if defined FINAL_CHANGES goto :dirty_finish

echo.
echo ============================================================
echo   SYNC COMPLETE
echo   Local main and GitHub main are identical.
echo ============================================================
echo.
git log -1 --oneline
goto :success

:missing_git
echo ERROR: Git is not installed or is not available in PATH.
goto :error

:not_repository
echo ERROR: This script must stay inside the GALANACCI OS repository.
goto :error

:missing_origin
echo ERROR: The GitHub remote named "origin" is missing.
goto :error

:wrong_branch
echo ERROR: You are currently on "%CURRENT_BRANCH%", not "main".
echo Switch to main deliberately, then run this script again.
goto :error

:operation_in_progress
echo ERROR: A merge, rebase, or cherry-pick is already in progress.
echo Finish or abort that operation before running this script.
goto :error

:unresolved_conflicts
echo ERROR: Unresolved Git conflicts were found.
git diff --name-only --diff-filter=U
goto :error

:invalid_diff
echo ERROR: Git found whitespace errors. Nothing was pushed.
echo Fix the reported lines, then run this script again.
goto :error

:rebase_failed
echo.
echo ERROR: The latest remote work conflicts with local work.
echo Nothing was pushed. Resolve the conflict, run "git rebase --continue",
echo then launch this script again.
goto :error

:push_failed
echo.
echo ERROR: GitHub rejected the push. Nothing was force-pushed.
echo Review the message above, then run this script again.
goto :error

:unexpected_divergence
echo.
echo ERROR: Local main and GitHub main diverged after the push.
echo The script stopped instead of overwriting either version.
goto :error

:dirty_finish
echo.
echo ERROR: New local changes appeared while syncing.
echo They were not silently committed. Run the script again to review them.
goto :error

:failed
echo.
echo ERROR: Sync stopped because a command failed. Nothing was force-pushed.
goto :error

:cancelled
echo.
echo Cancelled. No local changes were committed or pushed.
goto :success

:error
echo.
pause
exit /b 1

:success
echo.
pause
exit /b 0
