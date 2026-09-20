@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title GALANACCI / PoG ENTRY RETURN PATCH V4.1

echo.
echo ==============================================================
echo   GALANACCI / PoG ENTRY RETURN PATCH V4.1
echo ==============================================================
echo.
echo This is the robust version of V4.
echo.
echo It does NOT assume PoG still contains the exact old return URL.
echo It finds the GALANACCI entry block and updates whatever returnUrl
echo is currently there to:
echo.
echo   https://galanacci.com/?entry=pog
echo.
echo GALANACCI then uses ?entry=pog to bypass:
echo   - boot animation
echo   - WELCOME popup
echo.
echo.

set "PS1=%TEMP%\gtc_pog_entry_return_v4_1_%RANDOM%_%RANDOM%.ps1"

for /f "tokens=1 delims=:" %%A in ('findstr /n /c:"# POWERSHELL_PAYLOAD_START" "%~f0"') do set /a SKIP=%%A

if not defined SKIP (
  echo ERROR: Embedded PowerShell payload not found.
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

function Resolve-Repo {
    param(
        [string]$Entered,
        [string[]]$Candidates,
        [scriptblock]$Validator,
        [string]$Label
    )

    $all = New-Object System.Collections.Generic.List[string]

    if (-not [string]::IsNullOrWhiteSpace($Entered)) {
        $all.Add($Entered.Trim().Trim('"'))
    }

    foreach ($candidate in $Candidates) {
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            $all.Add($candidate)
        }
    }

    foreach ($candidate in ($all | Select-Object -Unique)) {
        try {
            $resolved = (Resolve-Path $candidate -ErrorAction Stop).Path
        } catch {
            continue
        }

        if (& $Validator $resolved) {
            return $resolved
        }
    }

    throw "Could not locate $Label."
}

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$start = (Get-Location).Path
$parent = Split-Path -Parent $start

$gtcValidator = {
    param($root)

    (Test-Path (Join-Path $root "index.html")) -and
    (Test-Path (Join-Path $root "js\gtc-os-boot.js")) -and
    (Test-Path (Join-Path $root "styles\gtc-os-boot.css"))
}

$pogValidator = {
    param($root)

    (Test-Path (Join-Path $root "index.html")) -and
    (Test-Path (Join-Path $root "js\core\entry-context.js"))
}

Write-Host ""
Write-Host "STEP 1 / 2 - GALANACCI repo"
$gtcEntered = Read-Host "GALANACCI repo path (ENTER to auto-detect)"

$gtcRepo = Resolve-Repo `
    -Entered $gtcEntered `
    -Candidates @(
        $start,
        (Join-Path $parent "GALANACCI-THE-CREATOR"),
        (Join-Path $start "GALANACCI-THE-CREATOR")
    ) `
    -Validator $gtcValidator `
    -Label "GALANACCI-THE-CREATOR"

Write-Host "Found:"
Write-Host "  $gtcRepo"
Write-Host ""

Write-Host "STEP 2 / 2 - PIONEERS OF GREATNESS repo"
$pogEntered = Read-Host "PoG repo path (ENTER to auto-detect)"

$pogRepo = Resolve-Repo `
    -Entered $pogEntered `
    -Candidates @(
        (Join-Path (Split-Path -Parent $gtcRepo) "PIONEERS-OF-GREATNESS"),
        (Join-Path $parent "PIONEERS-OF-GREATNESS"),
        (Join-Path $start "PIONEERS-OF-GREATNESS")
    ) `
    -Validator $pogValidator `
    -Label "PIONEERS-OF-GREATNESS"

Write-Host "Found:"
Write-Host "  $pogRepo"
Write-Host ""

$gtcIndexPath = Join-Path $gtcRepo "index.html"
$gtcBootPath  = Join-Path $gtcRepo "js\gtc-os-boot.js"
$gtcCssPath   = Join-Path $gtcRepo "styles\gtc-os-boot.css"

$pogEntryPath = Join-Path $pogRepo "js\core\entry-context.js"
$pogTestPath  = Join-Path $pogRepo "tests\browser\external-entry.spec.js"

# ------------------------------------------------------------
# BACKUPS
# ------------------------------------------------------------

Copy-Item -LiteralPath $gtcIndexPath `
    -Destination "$gtcIndexPath.pre-entry-return-v4-1.bak" -Force

Copy-Item -LiteralPath $gtcBootPath `
    -Destination "$gtcBootPath.pre-entry-return-v4-1.bak" -Force

Copy-Item -LiteralPath $gtcCssPath `
    -Destination "$gtcCssPath.pre-entry-return-v4-1.bak" -Force

Copy-Item -LiteralPath $pogEntryPath `
    -Destination "$pogEntryPath.pre-entry-return-v4-1.bak" -Force

if (Test-Path $pogTestPath) {
    Copy-Item -LiteralPath $pogTestPath `
        -Destination "$pogTestPath.pre-entry-return-v4-1.bak" -Force
}

# ------------------------------------------------------------
# A. ROBUST PoG RETURN URL PATCH
#
# Works whether the local file currently says:
#   https://galanacci.com/
#   https://galanacci.com/?return=pog
#   https://galanacci.com/?entry=pog
# or another GALANACCI return URL.
# ------------------------------------------------------------

$pogEntry = Get-Content -LiteralPath $pogEntryPath -Raw

$targetReturn = 'https://galanacci.com/?entry=pog'

# First try: replace returnUrl specifically inside the "galanacci" config block.
$blockPattern = '(?is)(galanacci\s*:\s*Object\.freeze\s*\(\s*\{)(.*?)(\}\s*\))'
$blockMatch = [regex]::Match($pogEntry, $blockPattern)

if (-not $blockMatch.Success) {
    throw "Could not find the galanacci SOURCE_CONFIG block in PoG entry-context.js."
}

$blockFull   = $blockMatch.Value
$blockStart  = $blockMatch.Groups[1].Value
$blockMiddle = $blockMatch.Groups[2].Value
$blockEnd    = $blockMatch.Groups[3].Value

$returnPattern = '(?is)returnUrl\s*:\s*["''][^"'']*["'']'

if ([regex]::IsMatch($blockMiddle, $returnPattern)) {
    $blockMiddle = [regex]::Replace(
        $blockMiddle,
        $returnPattern,
        'returnUrl: "' + $targetReturn + '"',
        1
    )
}
else {
    # If returnUrl is missing entirely, insert it after destination.
    $destinationPattern = '(?im)(^\s*destination\s*:\s*["''][^"'']*["'']\s*,?)'

    if ([regex]::IsMatch($blockMiddle, $destinationPattern)) {
        $blockMiddle = [regex]::Replace(
            $blockMiddle,
            $destinationPattern,
            '$1' + "`r`n        returnUrl: `"$targetReturn`"",
            1
        )
    }
    else {
        throw "Found the galanacci block, but could not find returnUrl or destination inside it."
    }
}

$newBlock = $blockStart + $blockMiddle + $blockEnd
$pogEntry = $pogEntry.Remove($blockMatch.Index, $blockMatch.Length)
$pogEntry = $pogEntry.Insert($blockMatch.Index, $newBlock)

Write-Utf8NoBom $pogEntryPath $pogEntry

# Update browser test flexibly if present.
if (Test-Path $pogTestPath) {
    $pogTest = Get-Content -LiteralPath $pogTestPath -Raw

    $pogTest = [regex]::Replace(
        $pogTest,
        'page\.waitForURL\(["'']https://galanacci\.com/[^"'']*["'']\)',
        'page.waitForURL("https://galanacci.com/?entry=pog")'
    )

    $pogTest = [regex]::Replace(
        $pogTest,
        'expect\(page\.url\(\)\)\.toBe\(["'']https://galanacci\.com/[^"'']*["'']\);',
        'expect(page.url()).toBe("https://galanacci.com/?entry=pog");'
    )

    Write-Utf8NoBom $pogTestPath $pogTest
}

# ------------------------------------------------------------
# B. GALANACCI EARLY ?entry=pog GUARD
# ------------------------------------------------------------

$gtcIndex = Get-Content -LiteralPath $gtcIndexPath -Raw

# Remove old V4 / V4.1 guards if re-run.
$gtcIndex = [regex]::Replace(
    $gtcIndex,
    '(?is)\s*<!-- GTC ENTRY RETURN V4 START -->.*?<!-- GTC ENTRY RETURN V4 END -->\s*',
    "`r`n"
)

$gtcIndex = [regex]::Replace(
    $gtcIndex,
    '(?is)\s*<!-- GTC ENTRY RETURN V4\.1 START -->.*?<!-- GTC ENTRY RETURN V4\.1 END -->\s*',
    "`r`n"
)

$headGuard = @'
  <!-- GTC ENTRY RETURN V4.1 START -->
  <script>
    (() => {
      try {
        if (
          new URLSearchParams(window.location.search).get("entry") === "pog"
        ) {
          document.documentElement.classList.add("gtc-entry-from-pog");
        }
      } catch {}
    })();
  </script>
  <!-- GTC ENTRY RETURN V4.1 END -->
'@

if (-not $gtcIndex.Contains('</title>')) {
    throw "Could not find </title> in GALANACCI index.html."
}

$gtcIndex = $gtcIndex.Replace(
    '</title>',
    '</title>' + "`r`n" + "`r`n" + $headGuard
)

$gtcIndex = [regex]::Replace(
    $gtcIndex,
    'styles/gtc-os-boot\.css(?:\?[^"'']*)?',
    'styles/gtc-os-boot.css?v=entry-return-v4-1'
)

$gtcIndex = [regex]::Replace(
    $gtcIndex,
    'js/gtc-os-boot\.js(?:\?[^"'']*)?',
    'js/gtc-os-boot.js?v=entry-return-v4-1'
)

Write-Utf8NoBom $gtcIndexPath $gtcIndex

# ------------------------------------------------------------
# C. GALANACCI PRE-PAINT CSS
# ------------------------------------------------------------

$gtcCss = Get-Content -LiteralPath $gtcCssPath -Raw

$gtcCss = [regex]::Replace(
    $gtcCss,
    '(?is)/\* GTC ENTRY RETURN V4 START \*/.*?/\* GTC ENTRY RETURN V4 END \*/\s*',
    ''
)

$gtcCss = [regex]::Replace(
    $gtcCss,
    '(?is)/\* GTC ENTRY RETURN V4\.1 START \*/.*?/\* GTC ENTRY RETURN V4\.1 END \*/\s*',
    ''
)

$cssGuard = @'
/* GTC ENTRY RETURN V4.1 START */
html.gtc-entry-from-pog .gtc-os-boot {
  display: none !important;
}

html.gtc-entry-from-pog .portfolio-notice-layer {
  display: none !important;
}
/* GTC ENTRY RETURN V4.1 END */

'@

$gtcCss = $cssGuard + $gtcCss

Write-Utf8NoBom $gtcCssPath $gtcCss

# ------------------------------------------------------------
# D. GALANACCI BOOT LOGIC
# ------------------------------------------------------------

$gtcBoot = @'
(() => {
  "use strict";

  const boot = document.getElementById("gtc-os-boot");
  const BOOT_DURATION_MS = 3700;

  function enteredFromPog() {
    try {
      return (
        new URLSearchParams(window.location.search).get("entry") === "pog"
      );
    } catch {
      return false;
    }
  }

  function cleanPogEntryUrl() {
    try {
      const url = new URL(window.location.href);

      if (url.searchParams.get("entry") !== "pog") return;

      url.searchParams.delete("entry");

      const cleanUrl =
        url.pathname +
        (url.searchParams.toString()
          ? `?${url.searchParams.toString()}`
          : "") +
        url.hash;

      window.history.replaceState(
        window.history.state,
        "",
        cleanUrl || "/"
      );
    } catch {}
  }

  function bypassBootForPogExit() {
    document.documentElement.classList.add("gtc-entry-from-pog");
    document.body.classList.remove("gtc-os-boot-active");

    boot?.remove();

    const notice = document.getElementById("portfolio-notice-layer");

    if (notice) {
      notice.hidden = true;
      notice.setAttribute("aria-hidden", "true");
    }

    cleanPogEntryUrl();
  }

  function completeNormalBoot() {
    if (!boot) return;

    document.body.classList.remove("gtc-os-boot-active");
    boot.remove();
  }

  if (enteredFromPog()) {
    bypassBootForPogExit();
    return;
  }

  window.setTimeout(completeNormalBoot, BOOT_DURATION_MS);
})();
'@

Write-Utf8NoBom $gtcBootPath $gtcBoot

# ------------------------------------------------------------
# VERIFY
# ------------------------------------------------------------

$pogCheck   = Get-Content -LiteralPath $pogEntryPath -Raw
$indexCheck = Get-Content -LiteralPath $gtcIndexPath -Raw
$bootCheck  = Get-Content -LiteralPath $gtcBootPath -Raw
$cssCheck   = Get-Content -LiteralPath $gtcCssPath -Raw

$errors = @()

if (-not $pogCheck.Contains(
    'returnUrl: "https://galanacci.com/?entry=pog"'
)) {
    $errors += "PoG GALANACCI returnUrl"
}

if (-not $indexCheck.Contains("GTC ENTRY RETURN V4.1 START")) {
    $errors += "GALANACCI early guard"
}

if (-not $bootCheck.Contains(
    'get("entry") === "pog"'
)) {
    $errors += "GALANACCI boot bypass"
}

if (-not $cssCheck.Contains(
    "html.gtc-entry-from-pog .gtc-os-boot"
)) {
    $errors += "pre-paint boot suppression"
}

if ($errors.Count -gt 0) {
    throw "Verification failed: $($errors -join ', ')"
}

Write-Host ""
Write-Host "ENTRY RETURN V4.1 INSTALLED"
Write-Host ("=" * 62)
Write-Host ""
Write-Host "Routing:"
Write-Host ""
Write-Host "  GALANACCI -> PoG.EXE"
Write-Host "    https://pioneersofgreatness.com/?entry=galanacci"
Write-Host ""
Write-Host "  PoG.EXE -> EXIT"
Write-Host "    https://galanacci.com/?entry=pog"
Write-Host ""
Write-Host "GALANACCI ?entry=pog behavior:"
Write-Host "  - boot animation bypassed"
Write-Host "  - WELCOME popup bypassed"
Write-Host "  - address cleaned back to galanacci.com/"
Write-Host "  - desktop remains"
Write-Host ""
Write-Host "This version accepted whatever returnUrl was already in your local"
Write-Host "PoG entry-context.js instead of expecting one exact previous value."
Write-Host ""
Write-Host "IMPORTANT: commit + push BOTH repos."
Write-Host ""
