@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title GALANACCI PoG NO OPENING ANIMATION V1

echo.
echo ==============================================================
echo   GALANACCI PoG NO OPENING ANIMATION V1
echo ==============================================================
echo.
echo Removes ONLY the GALANACCI "OPENING PoG.EXE..." transition.
echo.
echo PoG.EXE will now launch directly from the desktop.
echo Other launch transitions remain unchanged.
echo PoG return / ?entry=pog behavior is untouched.
echo.

set "PS1=%TEMP%\gtc_pog_no_opening_%RANDOM%_%RANDOM%.ps1"

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

        if (
            (Test-Path (Join-Path $resolved "index.html")) -and
            (Test-Path (Join-Path $resolved "js\desktop.js")) -and
            (Test-Path (Join-Path $resolved "js\apps.js"))
        ) {
            return $resolved
        }
    }

    throw "Could not locate the GALANACCI-THE-CREATOR repo."
}

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$entered = Read-Host "GALANACCI repo root (press ENTER if BAT is already inside it)"
$repo = Find-RepoRoot $entered

$desktopPath = Join-Path $repo "js\desktop.js"
$indexPath   = Join-Path $repo "index.html"

Copy-Item -LiteralPath $desktopPath `
    -Destination "$desktopPath.pre-pog-no-opening-v1.bak" -Force

Copy-Item -LiteralPath $indexPath `
    -Destination "$indexPath.pre-pog-no-opening-v1.bak" -Force

$desktop = Get-Content -LiteralPath $desktopPath -Raw

# Re-running the patch should not duplicate anything.
if ($desktop.Contains('const skipLaunchTransition = app.id === "pog-exe";')) {
    Write-Host ""
    Write-Host "PoG direct launch logic is already installed."
}
else {
    $pattern = '(?s)(\s+if \(launchLabel\) \{\s+launchLabel\.textContent = `OPENING \$\{app\.label\}\.\.\.`;\s+\}\s+\s+if \(transition\) \{\s+transition\.hidden = false;\s+transition\.setAttribute\("aria-hidden", "false"\);\s+requestAnimationFrame\(\(\) => transition\.classList\.add\("is-open"\)\);\s+\}\s+\s+await new Promise\(\(resolve\) => window\.setTimeout\(resolve, LAUNCH_DELAY\)\);)'

    if (-not [regex]::IsMatch($desktop, $pattern)) {
        throw "Could not find the existing launch-transition block in js\desktop.js."
    }

    $replacement = @'

  const skipLaunchTransition = app.id === "pog-exe";

  if (!skipLaunchTransition) {
    if (launchLabel) {
      launchLabel.textContent = `OPENING ${app.label}...`;
    }

    if (transition) {
      transition.hidden = false;
      transition.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => transition.classList.add("is-open"));
    }

    await new Promise((resolve) => window.setTimeout(resolve, LAUNCH_DELAY));
  }
'@

    $desktop = [regex]::Replace(
        $desktop,
        $pattern,
        $replacement,
        1
    )

    Write-Utf8NoBom $desktopPath $desktop
}

# Cache-bust desktop.js only.
$html = Get-Content -LiteralPath $indexPath -Raw

$html = [regex]::Replace(
    $html,
    'js/desktop\.js(?:\?[^"'']*)?',
    'js/desktop.js?v=pog-no-opening-v1'
)

Write-Utf8NoBom $indexPath $html

# Verify.
$check = Get-Content -LiteralPath $desktopPath -Raw

if (-not $check.Contains('const skipLaunchTransition = app.id === "pog-exe";')) {
    throw "Verification failed: PoG transition bypass was not installed."
}

if (-not $check.Contains('window.location.href = app.url;')) {
    throw "Verification failed: existing app navigation was unexpectedly altered."
}

Write-Host ""
Write-Host "PATCH COMPLETE"
Write-Host ("=" * 62)
Write-Host ""
Write-Host "PoG.EXE now:"
Write-Host "  double-click / tap"
Write-Host "      -> launches PoG immediately"
Write-Host ""
Write-Host "Removed for PoG only:"
Write-Host "  - OPENING PoG.EXE... overlay"
Write-Host "  - 520ms GALANACCI launch delay"
Write-Host ""
Write-Host "Preserved:"
Write-Host "  - PoG ?entry=galanacci URL"
Write-Host "  - PoG EXIT -> ?entry=pog return"
Write-Host "  - boot/welcome bypass on return"
Write-Host "  - launch animation for any other external apps"
Write-Host ""
Write-Host "Test:"
Write-Host "  http://127.0.0.1:5500/index.html"
Write-Host ""

try {
    Start-Process "http://127.0.0.1:5500/index.html"
} catch {}
