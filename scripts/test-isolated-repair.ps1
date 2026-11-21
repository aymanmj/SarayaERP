param(
    [string]$LogPath = 'scratch/audit-20261106/isolated-e2e.log',
    [string]$TestPath = ''
)

$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoPath

node scripts/prepare-isolated-repair.cjs
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the isolated repair-test environment' }

# These named containers are disposable and contain synthetic fixtures only.
foreach ($testContainerName in @('saraya-repair-postgres-v2-20261106', 'saraya-repair-redis-v2-20261106')) {
    $containerJson = docker inspect $testContainerName
    if ($LASTEXITCODE -ne 0) { throw "Missing test container: $testContainerName" }
    $testContainer = ($containerJson | ConvertFrom-Json)[0]
    if ($testContainer.Config.Labels.'saraya.purpose' -ne 'repair-test' -or !$testContainer.State.Running) {
        throw "Container is not a running repair-test container: $testContainerName"
    }
}

$testEnvironment = @{
    NODE_ENV = 'test'
    DATABASE_URL = 'postgresql://saraya_test:local_repair_test_only_20261106@127.0.0.1:15432/saraya_repair_test?schema=public'
    REDIS_HOST = '127.0.0.1'
    REDIS_PORT = '16379'
    REDIS_PASSWORD = 'local_repair_test_only_20261106'
    REDIS_MOCK = 'false'
    JWT_SECRET = 'synthetic_isolated_repair_jwt_key_20261106_only'
    ENCRYPTION_KEY = 'synthetic_isolated_encryption_key_20261106_only'
    ENCRYPTION_SALT = 'synthetic_isolated_repair_salt'
    VAULT_ADDR = ''
    VAULT_TOKEN = ''
    TELEGRAM_BOT_TOKEN = ''
    TELEGRAM_WEBHOOK_URL = ''
    SMTP_HOST = ''
    SMTP_USER = ''
    SMTP_PASSWORD = ''
    SMTP_PASS = ''
    GEMINI_API_KEY = ''
    HTTP_PROXY = ''
    HTTPS_PROXY = ''
    ALL_PROXY = ''
    LICENSE_PATH = (Join-Path $repoPath 'scratch/audit-20261106/e2e-license/saraya.lic')
    MACHINE_ID_PATH = ''
    BACKUP_DIR = (Join-Path $repoPath 'scratch/audit-20261106/e2e-backups')
    DISABLE_THROTTLER = 'true'
}
$previousEnvironment = @{}
try {
    foreach ($name in $testEnvironment.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $testEnvironment[$name], 'Process')
    }
    node scripts/run-isolated-repair-e2e.cjs $LogPath $TestPath
    $testExitCode = $LASTEXITCODE
    Get-Content -LiteralPath $LogPath -Encoding UTF8 -Tail 45
    exit $testExitCode
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}
