@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title GALANACCI WELCOME HEADER PATCH V1

echo.
echo ==============================================================
echo   GALANACCI WELCOME HEADER PATCH V1
echo ==============================================================
echo.
echo Changes the popup notification header:
echo   NOTE  ->  WELCOME!
echo.
echo Nothing else is modified.
echo.

set "PS1=%TEMP%\gtc_welcome_header_%RANDOM%_%RANDOM%.ps1"

for /f "tokens=1 delims=:" %%A in ('findstr /n /c:"# POWERSHELL_PAYLOAD_START" "%~f0"') do set /a SKIP=%%A

if not defined SKIP (
  echo ERROR: Embedded payload not found.
  pause
  exit /b 1
)

more +%SKIP% "%~f0" > "%PS1%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "EXITCODE=%ERRORLEVEL%"
del /q "%PS1%" >nul 2>nul

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
        if (-not $parent -or $parent -eq $current) { break }
        $current = $parent
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        try { $resolved = (Resolve-Path $candidate -ErrorAction Stop).Path }
        catch { continue }

        if (Test-Path (Join-Path $resolved "index.html")) {
            return $resolved
        }
    }

    throw "Could not locate the GALANACCI repo root."
}

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$entered = Read-Host "Repo root path (press ENTER if this BAT is inside the repo)"
$repo = Find-RepoRoot $entered
$indexPath = Join-Path $repo "index.html"

$backup = "$indexPath.pre-welcome-header-v1.bak"
Copy-Item -LiteralPath $indexPath -Destination $backup -Force

$html = Get-Content -LiteralPath $indexPath -Raw

$pattern = '(?is)(<span\s+id=["'']portfolio-notice-title["'']\s*>).*?(</span>)'

if (-not [regex]::IsMatch($html, $pattern)) {
    throw "Could not find #portfolio-notice-title in index.html."
}

$html = [regex]::Replace(
    $html,
    $pattern,
    '$1WELCOME!$2',
    1
)

Write-Utf8NoBom $indexPath $html

Write-Host ""
Write-Host "PATCH COMPLETE"
Write-Host ("=" * 62)
Write-Host ""
Write-Host "Popup header now says:"
Write-Host "  WELCOME!"
Write-Host ""
Write-Host "Backup:"
Write-Host "  index.html.pre-welcome-header-v1.bak"
Write-Host ""
Write-Host "Test:"
Write-Host "  http://127.0.0.1:5500/index.html"
Write-Host ""

try {
    Start-Process "http://127.0.0.1:5500/index.html"
} catch {
}
