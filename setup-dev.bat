@echo off
echo ==========================================
echo   Saraya ERP - Developer Setup (Local)
echo ==========================================
echo.
echo [!] This script will:
echo     1. Sync the database schema (db push)
echo     2. Seed the database with initial data (admin user, etc.)
echo.
echo [!] WARNING: This is for LOCAL DEVELOPMENT only.
echo.

set /p confirm="Are you sure you want to proceed? (y/n): "
if /i "%confirm%" neq "y" exit /b

echo.
echo [1/2] Syncing Schema...
docker-compose -f docker-compose.clean.yml -p saraya_clean_v1 exec backend npx prisma db push
if %errorlevel% neq 0 (
    echo Error: Schema sync failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Seeding Database...
docker-compose -f docker-compose.clean.yml -p saraya_clean_v1 exec backend npx prisma db seed
if %errorlevel% neq 0 (
    echo Error: Seeding failed.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   Setup Complete!
echo   Admin User: admin / admin123 (or as configured)
echo ==========================================
pause
