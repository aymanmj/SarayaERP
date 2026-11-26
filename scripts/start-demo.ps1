param(
    [switch]$Reset,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$prepArgs = @('scripts/prepare-demo-env.cjs')
if ($Reset) {
    $prepArgs += '--reset'
}

node @prepArgs
if ($LASTEXITCODE -ne 0) {
    throw "Failed to prepare SarayaERP demo environment (exit code $LASTEXITCODE)"
}

# Export unified demo runtime environment
$env:NODE_ENV = 'development'
$env:PORT = '3000'
$env:DATABASE_URL = 'postgresql://saraya_demo:saraya_demo_local_2026@127.0.0.1:15433/saraya_demo?schema=public'
$env:REDIS_HOST = '127.0.0.1'
$env:REDIS_PORT = '16380'
$env:REDIS_PASSWORD = 'saraya_demo_local_2026'
$env:REDIS_MOCK = 'false'
$env:VAULT_ADDR = ''
$env:VAULT_TOKEN = ''
$env:JWT_SECRET = 'saraya_live_demo_jwt_secret_2026_enterprise_key'
$env:ENCRYPTION_KEY = 'saraya_live_demo_encryption_key_32chars_2026'
$env:ENCRYPTION_SALT = 'saraya_live_demo_encryption_salt_2026'
$env:LICENSE_BYPASS = 'true'
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
$env:DISABLE_THROTTLER = 'true'
$env:NODE_OPTIONS = '--no-experimental-webstorage'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  SarayaERP Live Demo Environment Prepared' -ForegroundColor Green
Write-Host '  Postgres: 127.0.0.1:15433 (saraya_demo)' -ForegroundColor Gray
Write-Host '  Redis:    127.0.0.1:16380' -ForegroundColor Gray
Write-Host '  UI URL:   http://localhost:5173' -ForegroundColor Yellow
Write-Host '  API URL:  http://localhost:3000/api' -ForegroundColor Yellow
Write-Host '  Admin:    admin / admin123' -ForegroundColor White
Write-Host '  Staff:    dr_ahmed, dr_sara, nurse_laila, reception_user,' -ForegroundColor White
Write-Host '            pharm_ali, cashier_mo, acc_samir, lab_user,' -ForegroundColor White
Write-Host '            rad_user, hr_muna (password: 123456)' -ForegroundColor White
Write-Host '============================================================' -ForegroundColor Cyan

if ($NoLaunch) {
    exit 0
}

Set-Location -LiteralPath (Join-Path $repoRoot 'server')
if (-not (Test-Path 'dist/src/main.js')) {
    Write-Host 'Building server bundle...' -ForegroundColor Yellow
    node ./node_modules/@nestjs/cli/bin/nest.js build
    if ($LASTEXITCODE -ne 0) { throw 'Server build failed' }
}

$backendProc = Start-Process -FilePath 'node' -ArgumentList 'dist/src/main.js' -WorkingDirectory (Join-Path $repoRoot 'server') -PassThru -WindowStyle Minimized
Write-Host "Started Backend PID=$($backendProc.Id) on http://localhost:3000" -ForegroundColor Green

$frontendProc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173' -WorkingDirectory (Join-Path $repoRoot 'client') -PassThru -WindowStyle Minimized
Write-Host "Started Frontend PID=$($frontendProc.Id) on http://localhost:5173" -ForegroundColor Green

Write-Host 'Waiting for backend health...' -ForegroundColor Gray
for ($i = 0; $i -lt 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) {
            Write-Host 'Backend healthy! Opening http://localhost:5173 ...' -ForegroundColor Green
            Start-Process 'http://localhost:5173'
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
