# ============================================
# Saraya Medical ERP — Desktop Shortcut Creator
# ============================================
# Creates a Desktop shortcut that opens the system in App Mode
# Usage: .\create-desktop-shortcut.ps1 -Url "https://erp.alsarayatech.ly" -Name "Saraya Medical"
# Or run without parameters to use default values


param(
    [string]$Url = "https://erp.alsarayatech.ly",
    [string]$Name = "Saraya Medical ERP",
    [string]$IconPath = "",
    [switch]$StandardAppMode
)

$ErrorActionPreference = "Stop"

Write-Host "=== Creating Saraya Medical ERP Shortcut ===" -ForegroundColor Cyan

# Find suitable browser
$chromePath = ""
$edgePath = ""

# Chrome paths
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)

foreach ($p in $chromePaths) {
    if (Test-Path $p) {
        $chromePath = $p
        break
    }
}

# Edge paths
$edgePaths = @(
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

foreach ($p in $edgePaths) {
    if (Test-Path $p) {
        $edgePath = $p
        break
    }
}

# Select browser (Chrome first, then Edge)
$browserPath = if ($chromePath) { $chromePath } elseif ($edgePath) { $edgePath } else { "" }
$browserName = if ($chromePath) { "Chrome" } elseif ($edgePath) { "Edge" } else { "" }

if (-not $browserPath) {
    Write-Host "[X] Could not find Chrome or Edge!" -ForegroundColor Red
    Write-Host "   Please install Google Chrome or Microsoft Edge" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Found $browserName" -ForegroundColor Green

# Create shortcut
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "$Name.lnk"

# App Mode or Kiosk Mode arguments
if ($StandardAppMode) {
    $arguments = "--app=$Url --start-maximized --disable-infobars --no-first-run"
} else {
    $arguments = "--kiosk $Url --disable-infobars --no-first-run"
}

# Create shortcut via WScript.Shell
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browserPath
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = Split-Path $browserPath
$shortcut.Description = "Saraya Medical ERP"
$shortcut.WindowStyle = 3  # Maximized

# Custom icon logic
$localIconDir = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "SarayaMedical"
if (-not (Test-Path $localIconDir)) {
    New-Item -ItemType Directory -Force -Path $localIconDir | Out-Null
}
$downloadedIconPath = Join-Path $localIconDir "icon.ico"

if ($IconPath -and (Test-Path $IconPath)) {
    $shortcut.IconLocation = $IconPath
    $finalIconPath = $IconPath
} else {
    try {
        Write-Host "[INFO] Downloading icon from $Url/favicon.ico..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri "$Url/favicon.ico" -OutFile $downloadedIconPath -UseBasicParsing
        $shortcut.IconLocation = $downloadedIconPath
        $finalIconPath = $downloadedIconPath
    } catch {
        Write-Host "[WARN] Could not download icon, using browser default." -ForegroundColor Yellow
        $shortcut.IconLocation = "$browserPath, 0"
        $finalIconPath = "$browserPath, 0"
    }
}

$shortcut.Save()

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "[OK] Shortcut created successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "[-] Path: $shortcutPath"
Write-Host "[-] URL: $Url"
Write-Host "[-] Browser: $browserName (App Mode)"
Write-Host ""
Write-Host "[INFO] Note: The shortcut will open as a Desktop App" -ForegroundColor Yellow
Write-Host "   without address bar or browser buttons for a professional experience!" -ForegroundColor Yellow
Write-Host ""

# Create additional shortcut in Start Menu (optional)
$startMenuPath = [Environment]::GetFolderPath("Programs")
$startShortcutPath = Join-Path $startMenuPath "$Name.lnk"

try {
    $startShortcut = $shell.CreateShortcut($startShortcutPath)
    $startShortcut.TargetPath = $browserPath
    $startShortcut.Arguments = $arguments
    $startShortcut.WorkingDirectory = Split-Path $browserPath
    $startShortcut.Description = "Saraya Medical ERP"
    $startShortcut.WindowStyle = 3
    $startShortcut.IconLocation = $finalIconPath
    $startShortcut.Save()
    Write-Host "[OK] Shortcut added to Start Menu as well" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not create shortcut in Start Menu (non-critical)" -ForegroundColor Yellow
}
