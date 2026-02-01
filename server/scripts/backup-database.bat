@echo off
REM ============================================
REM Saraya ERP - Database Backup Script (Windows)
REM ============================================
REM Usage: backup-database.bat [daily|weekly|monthly]

setlocal enabledelayedexpansion

REM Configuration (override via environment variables)
set BACKUP_TYPE=%1
if "%BACKUP_TYPE%"=="" set BACKUP_TYPE=daily
set BACKUP_DIR=%BACKUP_DIR%
if "%BACKUP_DIR%"=="" set BACKUP_DIR=C:\backups\saraya

set DB_HOST=%DB_HOST%
if "%DB_HOST%"=="" set DB_HOST=localhost
set DB_PORT=%DB_PORT%
if "%DB_PORT%"=="" set DB_PORT=5432
set DB_NAME=%DB_NAME%
if "%DB_NAME%"=="" set DB_NAME=saraya
set DB_USER=%DB_USER%
if "%DB_USER%"=="" set DB_USER=postgres

REM Timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /format:list') do set datetime=%%I
set TIMESTAMP=%datetime:~0,8%_%datetime:~8,6%
set BACKUP_FILE=%BACKUP_DIR%\%BACKUP_TYPE%\saraya_%BACKUP_TYPE%_%TIMESTAMP%.sql

REM Create backup directory
if not exist "%BACKUP_DIR%\%BACKUP_TYPE%" mkdir "%BACKUP_DIR%\%BACKUP_TYPE%"

echo.
echo ============================================
echo   Saraya ERP Database Backup
echo ============================================
echo.
echo Starting %BACKUP_TYPE% backup...
echo    Database: %DB_NAME%
echo    Target: %BACKUP_FILE%
echo.

REM Perform backup
set PGPASSWORD=%DB_PASSWORD%
pg_dump -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% --format=plain --no-owner --no-privileges > "%BACKUP_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Backup completed successfully!
    
    REM Get file size
    for %%I in ("%BACKUP_FILE%") do set SIZE=%%~zI
    set /a SIZE_MB=!SIZE!/1048576
    echo    Size: !SIZE_MB! MB
    
    REM Compress with PowerShell (if available)
    echo Compressing backup...
    powershell -command "Compress-Archive -Path '%BACKUP_FILE%' -DestinationPath '%BACKUP_FILE%.zip' -Force"
    if exist "%BACKUP_FILE%.zip" (
        del "%BACKUP_FILE%"
        echo    Compressed: %BACKUP_FILE%.zip
    )
) else (
    echo.
    echo [ERROR] Backup failed!
    exit /b 1
)

echo.
echo [DONE] Backup process completed!
echo.

endlocal
