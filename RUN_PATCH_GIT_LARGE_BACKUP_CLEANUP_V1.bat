@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title GALANACCI GIT LARGE BACKUP CLEANUP V1

echo.
echo ==============================================================
echo   GALANACCI GIT LARGE BACKUP CLEANUP V1
echo ==============================================================
echo.
echo Fixes the rejected GitHub push caused by oversized files inside:
echo   backup\
echo.
echo This patch will:
echo   - fetch the latest origin/main
echo   - keep your CURRENT working website files
echo   - permanently add /backup/ to .gitignore
echo   - remove backup files from Git tracking
echo   - rebuild UNPUSHED local main history cleanly on origin/main
echo   - commit the current clean website state
echo   - push main normally
echo.
echo It will NOT force-push.
echo It will NOT delete your local backup folder.
echo.
echo The old local HEAD SHA is saved inside the ignored backup folder.
echo.

set "PS1=%TEMP%\gtc_git_large_backup_cleanup_v1_%RANDOM%_%RANDOM%.ps1"

for /f "tokens=1 delims=:" %%A in ('findstr /n /c:"# POWERSHELL_PAYLOAD_START" "%~f0"') do set /a SKIP=%%A

if not defined SKIP (
  echo ERROR: Embedded PowerShell payload not found.
  pause
  exit /b 1
)

more +%SKIP% "%~f0" > "%PS1%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "EXITCODE=%ERRORLEVEL%"

if exist "%PS1%" del /q "%PS1%" >nul 2>nul

echo.
pause
exit /b %EXITCODE%

# POWERSHELL_PAYLOAD_START
$ErrorActionPreference = "Stop"

function Find-RepoRoot {
    param([string]$EnteredPath)

    $candidates = New-Object System.Collections.Generic.List[string]

    if (-not [string]::IsNullOrWhiteSpace($EnteredPath)) {
        $candidates.Add($EnteredPath.Trim().Trim('"'))
    }

    $current = (Get-Location).Path

    while ($current) {
        $candidates.Add($current)

        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) {
            break
        }

        $current = $parent
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        try {
            $resolved = (Resolve-Path -LiteralPath $candidate -ErrorAction Stop).Path
        } catch {
            continue
        }

        if (
            (Test-Path (Join-Path $resolved ".git")) -and
            (Test-Path (Join-Path $resolved "index.html")) -and
            (Test-Path (Join-Path $resolved ".gitignore"))
        ) {
            return $resolved
        }
    }

    throw "Could not locate the GALANACCI-THE-CREATOR Git repository."
}

function Invoke-Git {
    param(
        [string[]]$Arguments,
        [switch]$Quiet
    )

    if ($Quiet) {
        & git @Arguments *> $null
    } else {
        & git @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

function Get-GitOutput {
    param([string[]]$Arguments)

    $output = & git @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }

    return ($output | Out-String).Trim()
}

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Ensure-BackupIgnored {
    param([string]$GitIgnorePath)

    $content = Get-Content -LiteralPath $GitIgnorePath -Raw

    if ($null -eq $content) {
        $content = ""
    }

    $lines = @($content -split "\r?\n")

    $alreadyIgnored = $false

    foreach ($line in $lines) {
        if ($line.Trim() -eq "/backup/") {
            $alreadyIgnored = $true
            break
        }
    }

    if (-not $alreadyIgnored) {
        $next = $content.TrimEnd()

        if ($next.Length -gt 0) {
            $next += "`r`n`r`n"
        }

        $next += "# Local patch / recovery backups - never commit to Git`r`n/backup/`r`n"

        Write-Utf8NoBom -Path $GitIgnorePath -Content $next
    }
}

function Test-GitOperationInProgress {
    $paths = @(
        (Get-GitOutput @("rev-parse", "--git-path", "rebase-merge")),
        (Get-GitOutput @("rev-parse", "--git-path", "rebase-apply")),
        (Get-GitOutput @("rev-parse", "--git-path", "MERGE_HEAD")),
        (Get-GitOutput @("rev-parse", "--git-path", "CHERRY_PICK_HEAD"))
    )

    foreach ($path in $paths) {
        if (Test-Path -LiteralPath $path) {
            return $true
        }
    }

    return $false
}

function Get-StagedLargeFiles {
    param([string]$Repo)

    $large = New-Object System.Collections.Generic.List[object]

    $paths = & git diff --cached --name-only --diff-filter=ACMRT

    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect staged files."
    }

    foreach ($relative in $paths) {
        if ([string]::IsNullOrWhiteSpace($relative)) {
            continue
        }

        $full = Join-Path $Repo $relative

        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
            continue
        }

        $item = Get-Item -LiteralPath $full

        if ($item.Length -gt 50MB) {
            $large.Add([pscustomobject]@{
                Path = $relative
                Bytes = $item.Length
                MB = [math]::Round($item.Length / 1MB, 2)
            })
        }
    }

    return $large
}

$entered = Read-Host "GALANACCI repo root (press ENTER if BAT is already inside it)"
$repo = Find-RepoRoot $entered
Set-Location -LiteralPath $repo

Write-Host ""
Write-Host "Repository:"
Write-Host "  $repo"
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not available in PATH."
}

$inside = Get-GitOutput @("rev-parse", "--is-inside-work-tree")

if ($inside -ne "true") {
    throw "This folder is not a Git working tree."
}

$branch = Get-GitOutput @("branch", "--show-current")

if ($branch -ne "main") {
    throw "Current branch is '$branch'. Switch deliberately to main first."
}

if (Test-GitOperationInProgress) {
    throw "A merge, rebase, or cherry-pick is already in progress. Finish or abort it first."
}

$conflicts = & git diff --name-only --diff-filter=U

if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect Git conflicts."
}

if ($conflicts) {
    throw "Unresolved Git conflicts exist. Resolve them before running this cleanup."
}

Write-Host "[1/7] Fetching current origin/main..."
Invoke-Git @("fetch", "origin", "main")

$oldHead = Get-GitOutput @("rev-parse", "HEAD")
$remoteHead = Get-GitOutput @("rev-parse", "origin/main")

Write-Host ""
Write-Host "Current local HEAD:"
Write-Host "  $oldHead"
Write-Host "Current origin/main:"
Write-Host "  $remoteHead"
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupRoot = Join-Path $repo "backup\$($timestamp)_git-large-backup-cleanup-v1"

if (-not (Test-Path -LiteralPath $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
}

$gitIgnorePath = Join-Path $repo ".gitignore"

Write-Host "[2/7] Permanently ignoring repo backup folder..."
Ensure-BackupIgnored -GitIgnorePath $gitIgnorePath

$recoveryNote = @"
GALANACCI Git large-file cleanup
Timestamp: $timestamp

Old local HEAD before cleanup:
$oldHead

origin/main used as clean base:
$remoteHead

The cleanup intentionally rebuilt unpushed local main history from the
current working tree while excluding repo\backup from Git.

The local backup directory itself was NOT deleted.
"@

Write-Utf8NoBom -Path (Join-Path $backupRoot "RECOVERY.txt") -Content $recoveryNote

Write-Host "[3/7] Rebuilding unpushed local main history on clean origin/main..."
Write-Host "      Current working files are being preserved."
Invoke-Git @("reset", "--mixed", "origin/main")

# If backup happened to be tracked on the remote base, stage its removal
# from Git while preserving local files on disk.
& git rm -r --cached --ignore-unmatch -- "backup"
if ($LASTEXITCODE -ne 0) {
    throw "Could not remove backup directory from Git tracking."
}

Write-Host "[4/7] Staging current website state without backup files..."
Invoke-Git @("add", "-A")

# Ensure no backup file is accidentally staged as added/modified.
$backupStaged = & git diff --cached --name-status

if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect staged changes."
}

$badBackupEntries = @()

foreach ($line in $backupStaged) {
    if ($line -match '^[AMCRT].*\tbackup[\\/]' -or $line -match '^[AMCRT]\s+backup[\\/]') {
        $badBackupEntries += $line
    }
}

if ($badBackupEntries.Count -gt 0) {
    Write-Host ""
    Write-Host "Unexpected backup files are still staged:"
    $badBackupEntries | ForEach-Object { Write-Host "  $_" }
    throw "Cleanup stopped before commit because backup files remained staged."
}

$largeFiles = Get-StagedLargeFiles -Repo $repo

if ($largeFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Files larger than 50 MB are still staged:"
    foreach ($file in $largeFiles) {
        Write-Host "  $($file.Path) - $($file.MB) MB"
    }

    throw "Cleanup stopped before commit. No oversized file was pushed."
}

$stagedNames = & git diff --cached --name-only

if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect staged changes."
}

if (-not $stagedNames) {
    Write-Host ""
    Write-Host "No website changes need recommitting."
} else {
    Write-Host ""
    Write-Host "Clean staged changes:"
    & git status --short
    Write-Host ""

    Write-Host "[5/7] Creating clean replacement commit..."
    Invoke-Git @(
        "commit",
        "-m",
        "Clean local history and exclude recovery backups"
    )
}

Write-Host "[6/7] Verifying backup is ignored..."
$ignoredCheck = & git check-ignore "backup" "backup/" 2>$null

# git check-ignore can return 1 when testing a directory path that does not
# currently exist as an untracked item, so also verify the .gitignore text.
$ignoreText = Get-Content -LiteralPath $gitIgnorePath -Raw

if ($ignoreText -notmatch '(?m)^/backup/\s*$') {
    throw "Verification failed: /backup/ is not present in .gitignore."
}

$trackedBackup = & git ls-files "backup/*"

if ($LASTEXITCODE -ne 0) {
    throw "Could not verify backup tracking state."
}

if ($trackedBackup) {
    Write-Host ""
    Write-Host "These backup paths are still tracked:"
    $trackedBackup | ForEach-Object { Write-Host "  $_" }
    throw "Cleanup stopped because backup is still tracked."
}

Write-Host "[7/7] Pushing clean main normally..."
Invoke-Git @("push", "origin", "main")

$newHead = Get-GitOutput @("rev-parse", "HEAD")

Write-Host ""
Write-Host "=============================================================="
Write-Host "  GIT LARGE BACKUP CLEANUP COMPLETE"
Write-Host "=============================================================="
Write-Host ""
Write-Host "GitHub main accepted the clean history."
Write-Host ""
Write-Host "New HEAD:"
Write-Host "  $newHead"
Write-Host ""
Write-Host "backup\ remains on your computer but is now ignored by Git."
Write-Host ""
Write-Host "Recovery note:"
Write-Host "  $backupRoot\RECOVERY.txt"
Write-Host ""
Write-Host "No force push was used."
Write-Host ""
