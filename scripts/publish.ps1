
# ============================================
# Saraya ERP - Publish Images to GHCR (Windows)
# ============================================

$ErrorActionPreference = "Stop"

# Configuration
$GitHubUser = if ($env:GITHUB_REPOSITORY_OWNER) { $env:GITHUB_REPOSITORY_OWNER } else { "aymanmj" }
$ImageTag = "latest"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmm"

# Colors
function Write-Green($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Yellow($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Red($msg) { Write-Host $msg -ForegroundColor Red }

Write-Yellow "🚀 Starting Build & Publish Process..."
Write-Host "User: $GitHubUser"
Write-Host "Tag: $Timestamp"

try {
    # 1. Build & Push Backend
    Write-Yellow "`n📦 Building Backend..."
    docker build -t ghcr.io/$GitHubUser/saraya-backend:$ImageTag ./server
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
    
    docker tag ghcr.io/$GitHubUser/saraya-backend:$ImageTag ghcr.io/$GitHubUser/saraya-backend:$Timestamp
    
    Write-Yellow "⬆️ Pushing Backend..."
    docker push ghcr.io/$GitHubUser/saraya-backend:$ImageTag
    docker push ghcr.io/$GitHubUser/saraya-backend:$Timestamp

    # 2. Build & Push Frontend
    Write-Yellow "`n📦 Building Frontend..."
    docker build -t ghcr.io/$GitHubUser/saraya-frontend:$ImageTag ./client
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    
    docker tag ghcr.io/$GitHubUser/saraya-frontend:$ImageTag ghcr.io/$GitHubUser/saraya-frontend:$Timestamp
    
    Write-Yellow "⬆️ Pushing Frontend..."
    docker push ghcr.io/$GITHUB_USER/saraya-frontend:$ImageTag
    docker push ghcr.io/$GITHUB_USER/saraya-frontend:$Timestamp

    Write-Green "`n✅ Success! Images published to GHCR."
    Write-Host "Backend: ghcr.io/$GitHubUser/saraya-backend:$Timestamp"
    Write-Host "Frontend: ghcr.io/$GitHubUser/saraya-frontend:$Timestamp"
    
    Write-Yellow "`nTo update client servers, run:"
    Write-Host "docker-compose -f docker-compose.production.yml pull && docker-compose -f docker-compose.production.yml up -d"

} catch {
    Write-Red "`n❌ Error: $_"
    Write-Red "Make sure you are logged in to GHCR: docker login ghcr.io -u YOUR_USERNAME -p YOUR_TOKEN"
}

Read-Host -Prompt "Press Enter to exit"
