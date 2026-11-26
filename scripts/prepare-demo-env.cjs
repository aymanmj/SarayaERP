// Provision and seed a persistent isolated PostgreSQL + Redis demo environment.
// Never touches saraya-repair-postgres-v2-20261106 or saraya-repair-redis-v2-20261106.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const serverDir = path.join(repoRoot, 'server');
const resetRequested = process.argv.includes('--reset');

const DEMO_PG_CONTAINER = 'saraya-demo-postgres';
const DEMO_REDIS_CONTAINER = 'saraya-demo-redis';
const DEMO_PG_VOLUME = 'saraya_demo_pgdata';
const DEMO_PG_PORT = '15433';
const DEMO_REDIS_PORT = '16380';
const DEMO_DB_USER = 'saraya_demo';
const DEMO_DB_PASS = 'saraya_demo_local_2026';
const DEMO_DB_NAME = 'saraya_demo';

const DEMO_ENV = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: `postgresql://${DEMO_DB_USER}:${DEMO_DB_PASS}@127.0.0.1:${DEMO_PG_PORT}/${DEMO_DB_NAME}?schema=public`,
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: DEMO_REDIS_PORT,
  REDIS_PASSWORD: DEMO_DB_PASS,
  REDIS_MOCK: 'false',
  VAULT_ADDR: '',
  VAULT_TOKEN: '',
  JWT_SECRET: 'saraya_live_demo_jwt_secret_2026_enterprise_key',
  ENCRYPTION_KEY: 'saraya_live_demo_encryption_key_32chars_2026',
  ENCRYPTION_SALT: 'saraya_live_demo_encryption_salt_2026',
  LICENSE_BYPASS: 'true',
  CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
  DISABLE_THROTTLER: 'true',
  NODE_OPTIONS: '--no-experimental-webstorage',
};

function runCmd(cmd, args, cwd = repoRoot, extraEnv = {}, allowFail = false) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd),
    env: { ...process.env, ...extraEnv },
  });
  if (!allowFail && result.status !== 0) {
    throw new Error(
      `Command failed (${cmd} ${args.join(' ')}):\n${result.stderr || result.stdout || result.error?.message}`,
    );
  }
  return result;
}

function inspectContainer(name) {
  const res = runCmd('docker', ['inspect', name], repoRoot, {}, true);
  if (res.status !== 0) {
    if (/No such (object|container)/i.test(res.stderr || '')) return null;
    throw new Error(res.stderr || 'Docker Desktop is not ready');
  }
  return JSON.parse(res.stdout)[0];
}

function removeDemoContainers() {
  for (const name of [DEMO_PG_CONTAINER, DEMO_REDIS_CONTAINER]) {
    if (inspectContainer(name)) {
      console.log(`Removing existing container ${name}...`);
      runCmd('docker', ['rm', '-f', name], repoRoot);
    }
  }
  runCmd('docker', ['volume', 'rm', '-f', DEMO_PG_VOLUME], repoRoot, {}, true);
}

async function ensureContainers() {
  // Check Docker daemon is alive
  runCmd('docker', ['info', '--format', '{{.ServerVersion}}']);

  if (resetRequested) {
    console.log('Reset flag detected: recreating isolated demo containers...');
    removeDemoContainers();
  }

  let pg = inspectContainer(DEMO_PG_CONTAINER);
  if (!pg) {
    console.log(`Creating ${DEMO_PG_CONTAINER} on 127.0.0.1:${DEMO_PG_PORT}...`);
    runCmd('docker', [
      'run',
      '--detach',
      '--name',
      DEMO_PG_CONTAINER,
      '--label',
      'saraya.purpose=client-demo',
      '--publish',
      `127.0.0.1:${DEMO_PG_PORT}:5432`,
      '--volume',
      `${DEMO_PG_VOLUME}:/var/lib/postgresql/data`,
      '--env',
      `POSTGRES_DB=${DEMO_DB_NAME}`,
      '--env',
      `POSTGRES_USER=${DEMO_DB_USER}`,
      '--env',
      `POSTGRES_PASSWORD=${DEMO_DB_PASS}`,
      'postgres:15-alpine',
    ]);
  } else if (!pg.State?.Running) {
    console.log(`Starting ${DEMO_PG_CONTAINER}...`);
    runCmd('docker', ['start', DEMO_PG_CONTAINER]);
  }

  let redis = inspectContainer(DEMO_REDIS_CONTAINER);
  if (!redis) {
    console.log(`Creating ${DEMO_REDIS_CONTAINER} on 127.0.0.1:${DEMO_REDIS_PORT}...`);
    runCmd('docker', [
      'run',
      '--detach',
      '--name',
      DEMO_REDIS_CONTAINER,
      '--label',
      'saraya.purpose=client-demo',
      '--publish',
      `127.0.0.1:${DEMO_REDIS_PORT}:6379`,
      'redis:7-alpine',
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no',
      '--requirepass',
      DEMO_DB_PASS,
    ]);
  } else if (!redis.State?.Running) {
    console.log(`Starting ${DEMO_REDIS_CONTAINER}...`);
    runCmd('docker', ['start', DEMO_REDIS_CONTAINER]);
  }

  for (let i = 0; i < 40; i++) {
    const pgCheck = runCmd(
      'docker',
      ['exec', DEMO_PG_CONTAINER, 'pg_isready', '-U', DEMO_DB_USER, '-d', DEMO_DB_NAME],
      repoRoot,
      {},
      true,
    );
    const redisCheck = runCmd(
      'docker',
      ['exec', DEMO_REDIS_CONTAINER, 'redis-cli', '--no-auth-warning', '-a', DEMO_DB_PASS, 'ping'],
      repoRoot,
      {},
      true,
    );
    if (pgCheck.status === 0 && (redisCheck.stdout || '').trim() === 'PONG') {
      console.log(`Demo containers ready (Postgres 127.0.0.1:${DEMO_PG_PORT}, Redis 127.0.0.1:${DEMO_REDIS_PORT}).`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Demo Postgres or Redis did not become ready in time');
}

function runServerCommand(title, args) {
  console.log(`>>> ${title}...`);
  const res = spawnSync(process.execPath, args, {
    cwd: serverDir,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ...DEMO_ENV },
  });
  if (res.status !== 0) {
    throw new Error(`${title} failed with exit code ${res.status}`);
  }
}

async function main() {
  await ensureContainers();

  const prismaCli = path.join(serverDir, 'node_modules', 'prisma', 'build', 'index.js');
  const tsNodeBin = path.join(serverDir, 'node_modules', 'ts-node', 'dist', 'bin.js');

  runServerCommand('Applying Prisma migrations (82 migrations)', [
    prismaCli,
    'migrate',
    'deploy',
  ]);

  runServerCommand('Running base enterprise seed (seed.ts)', [
    tsNodeBin,
    'prisma/seed.ts',
  ]);

  runServerCommand('Running Libyan hospital live demo seed (seed-demo.ts)', [
    tsNodeBin,
    'prisma/seed-demo.ts',
  ]);

  console.log('=== DEMO ENVIRONMENT READY ===');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
