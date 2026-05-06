# ============================================
# Saraya Medical ERP — Desktop Shortcut Creator
# ============================================
# ينشئ اختصار Desktop يفتح النظام في وضع App Mode (بدون شريط المتصفح)
# الاستخدام: .\create-desktop-shortcut.ps1 -Url "https://erp.alsarayatech.ly" -Name "السرايا الطبي"
# أو بدون معاملات يستخدم القيم الافتراضية

param(
    [string]$Url = "https://erp.alsarayatech.ly",
    [string]$Name = "Saraya Medical ERP",
    [string]$IconPath = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== إنشاء اختصار نظام السرايا الطبي ===" -ForegroundColor Cyan

# البحث عن المتصفح المناسب
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

# اختيار المتصفح (Chrome أولاً، ثم Edge)
$browserPath = if ($chromePath) { $chromePath } elseif ($edgePath) { $edgePath } else { "" }
$browserName = if ($chromePath) { "Chrome" } elseif ($edgePath) { "Edge" } else { "" }

if (-not $browserPath) {
    Write-Host "❌ لم يتم العثور على Chrome أو Edge!" -ForegroundColor Red
    Write-Host "   يرجى تثبيت أحد المتصفحات التالية: Google Chrome, Microsoft Edge" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ تم العثور على $browserName" -ForegroundColor Green

# إنشاء الاختصار
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "$Name.lnk"

# معاملات App Mode — يفتح بدون شريط العنوان أو أزرار المتصفح
$arguments = "--app=$Url --start-maximized --disable-infobars --no-first-run"

# إنشاء الاختصار عبر WScript.Shell
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browserPath
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = Split-Path $browserPath
$shortcut.Description = "نظام السرايا الطبي — Saraya Medical ERP"
$shortcut.WindowStyle = 3  # Maximized

# أيقونة مخصصة (إذا وُجدت)
if ($IconPath -and (Test-Path $IconPath)) {
    $shortcut.IconLocation = $IconPath
} else {
    # استخدام أيقونة المتصفح كبديل
    $shortcut.IconLocation = "$browserPath, 0"
}

$shortcut.Save()

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ تم إنشاء الاختصار بنجاح!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📍 المسار: $shortcutPath"
Write-Host "🌐 الرابط: $Url"
Write-Host "🖥️ المتصفح: $browserName (App Mode)"
Write-Host ""
Write-Host "💡 ملاحظة: عند فتح الاختصار، سيظهر النظام كتطبيق Desktop" -ForegroundColor Yellow
Write-Host "   بدون شريط العنوان أو أزرار المتصفح — تجربة احترافية!" -ForegroundColor Yellow
Write-Host ""

# إنشاء اختصار إضافي في قائمة Start (اختياري)
$startMenuPath = [Environment]::GetFolderPath("Programs")
$startShortcutPath = Join-Path $startMenuPath "$Name.lnk"

try {
    $startShortcut = $shell.CreateShortcut($startShortcutPath)
    $startShortcut.TargetPath = $browserPath
    $startShortcut.Arguments = $arguments
    $startShortcut.WorkingDirectory = Split-Path $browserPath
    $startShortcut.Description = "نظام السرايا الطبي — Saraya Medical ERP"
    $startShortcut.WindowStyle = 3
    if ($IconPath -and (Test-Path $IconPath)) {
        $startShortcut.IconLocation = $IconPath
    } else {
        $startShortcut.IconLocation = "$browserPath, 0"
    }
    $startShortcut.Save()
    Write-Host "✅ تم إضافة الاختصار في قائمة Start أيضاً" -ForegroundColor Green
} catch {
    Write-Host "⚠️ لم يتم إنشاء اختصار في قائمة Start (غير حرج)" -ForegroundColor Yellow
}
