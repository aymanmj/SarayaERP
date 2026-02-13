@echo off
echo ==========================================
echo   Saraya ERP - Clean Build & Update (Forced)
echo ==========================================

echo [1/3] Checking Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Docker is not running! Please start Docker Desktop.
    pause
    exit /b 1
)

echo [2/3] Starting Fresh Build (Unique Namespace)...
echo       Using project 'saraya_clean_v1' to bypass zombie containers.
docker-compose -f docker-compose.clean.yml -p saraya_clean_v1 up -d --build --remove-orphans

if %errorlevel% neq 0 (
    echo Error: Build failed. Check logs above.
    pause
    exit /b 1
)

echo [3/3] Pruning old images...
docker image prune -f >nul 2>&1

echo [4/4] Seeding Database (Ensuring Permissions)...
timeout /t 10 /nobreak >nul
docker exec saraya_clean_v1-backend-1 npx prisma db seed

echo ==========================================
echo   Update Complete!
echo   System running at: http://localhost
echo ==========================================
pause
