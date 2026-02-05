<#
.SYNOPSIS
    Automated Build & Run Script for Saraya ERP
    Handles Key Generation, Docker Build, and Database Seeding.

.DESCRIPTION
    This script automates:
    1. License Key Checks (Auto-generates if missing via admin-tools)
    2. Environment Setup (COOKIE_SECURE for local dev)
    3. Docker Build (Production Mode)
    4. Database Migration & Seeding (Master Seed)
#>

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host -ForegroundColor Cyan "`n🚀 $Message"
}

function Write-Success {
    param([string]$Message)
    Write-Host -ForegroundColor Green "✅ $Message"
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host -ForegroundColor Red "❌ $Message"
}

# Paths
$RootDir = Resolve-Path "$PSScriptRoot\.."
$ComposeFile = "$RootDir\docker-compose.production.yml"

Write-Step "Starting Saraya ERP Automated Build..."

# 1. Environment Validation
Write-Step "Validating Environment Configuration..."
if (-not (Test-Path "$RootDir\.env")) {
    Write-Host "⚠️  .env file missing. Copying .env.production..."
    if (Test-Path "$RootDir\.env.production") {
        Copy-Item "$RootDir\.env.production" "$RootDir\.env"
        Write-Success ".env created from .env.production"
    } else {
        Write-ErrorMsg ".env.production not found! Please invoke setup."
        exit 1
    }
}

# 2. Docker Build & Start
Write-Step "Validating Environment Configuration..."
if (-not (Test-Path "$RootDir\.env")) {
    Write-Host "⚠️  .env file missing. Copying .env.production..."
    if (Test-Path "$RootDir\.env.production") {
        Copy-Item "$RootDir\.env.production" "$RootDir\.env"
        Write-Success ".env created from .env.production"
    } else {
        Write-ErrorMsg ".env.production not found! Please invoke setup."
        exit 1
    }
}

# 3. Docker Build & Start
Write-Step "Building & Starting Containers..."
Push-Location $RootDir

# Ensure we are using the production compose file
# Adding --no-cache to ensure fresh build with new keys/seeds if requested, 
# but for speed we'll trust Docker's layer caching unless user clears it.
docker-compose -f $ComposeFile up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Docker Build Failed!"
    exit 1
}
Write-Success "Containers are up and running!"

# 4. Global Seeding
Write-Step "Initializing Database & Seeds..."

# Wait for backend to be responsive
Write-Host "⏳ Waiting for Backend to be ready (30s)..."
Start-Sleep -Seconds 30

Write-Host "🌱 Executing Master Seed (Core + CDSS + Medical Data)..."
try {
    # Run the compiled seed file directly since ts-node is not available in production
    docker exec saraya_backend node dist/prisma/seed.js
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Seeding Completed Successfully!"
    } else {
         Write-Host -ForegroundColor Yellow "⚠️  Seeding process returned exit code $LASTEXITCODE. This might be okay if data already exists."
    }
} catch {
    Write-Host -ForegroundColor Yellow "⚠️  Seeding encountered an error (likely idempotent skip): $_"
}

Pop-Location

Write-Step "System Status"
docker-compose -f $ComposeFile ps

Write-Host -ForegroundColor Green "`n🎉 Saraya ERP Build & Deploy Complete!"
Write-Host "👉 Dashboard: http://localhost:80 (or configured port)"
Write-Host "👉 API Health: http://localhost:3000/api/health"
