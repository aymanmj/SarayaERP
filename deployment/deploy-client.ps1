# ====================================================
#  SARAYA ERP - CLIENT DEPLOYMENT SCRIPT
# ====================================================
# Version: 2.3 (Debug)

param(
    [switch]$SkipSSL,
    [switch]$ForceRebuild
)

$ErrorActionPreference = "SilentlyContinue"

function Write-Step { param([string]$msg); Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg); Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Err  { param([string]$msg); Write-Host "   ERR: $msg" -ForegroundColor Red }

# --- 1. Checks ---
Write-Step "Initializing..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker missing."
    exit 1
}

# --- 2. Config ---
Write-Step "Configuring..."

# Use PSScriptRoot for simplicity
if ($PSScriptRoot) { Set-Location (Split-Path -Parent $PSScriptRoot) }

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.production") {
        Copy-Item ".env.production" ".env"
        Write-Ok "Env created."
    }
}

$SSLPath = ".\ssl"
if (-not (Test-Path $SSLPath)) {
    New-Item -ItemType Directory -Path $SSLPath -Force | Out-Null
}

if (-not $SkipSSL) {
    if (-not (Test-Path "$SSLPath\privkey.pem")) {
        Write-Ok "Generating Certificates..."
        # Simplified for debug
        $CWD = Get-Location
        docker run --rm -v "${CWD}/ssl:/certificates" -w /certificates alpine/openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out fullchain.pem -days 365 -nodes -subj "/CN=localhost"
    }
}

# --- 3. Clean ---
Write-Step "Cleaning..."
docker-compose -f docker-compose.production.yml down --remove-orphans 2>$null

# --- 4. Deploy ---
Write-Step "Building..."
$BuildArgs = @()
if ($ForceRebuild) { $BuildArgs += "--no-cache" }

docker-compose -f docker-compose.production.yml build @BuildArgs
docker-compose -f docker-compose.production.yml up -d

# --- 5. Verify ---
Write-Step "Verifying..."
Start-Sleep -Seconds 5
docker ps --format "table {{.Names}}\t{{.Status}}"

Write-Host "DONE." -ForegroundColor Green
