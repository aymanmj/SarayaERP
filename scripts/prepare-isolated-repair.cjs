// Recreates only the named, disposable repair-test environment after power loss.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const password = 'local_repair_test_only_20261106';
const databaseUrl = `postgresql://saraya_test:${password}@127.0.0.1:15432/saraya_repair_test?schema=public`;
const containers = [
  {
    name: 'saraya-repair-postgres-v2-20261106', port: '15432', internal: '5432/tcp',
    args: ['--publish', '127.0.0.1:15432:5432', '--tmpfs', '/var/lib/postgresql/data',
      '--env', 'POSTGRES_DB=saraya_repair_test', '--env', 'POSTGRES_USER=saraya_test',
      '--env', `POSTGRES_PASSWORD=${password}`, 'postgres:15-alpine'],
    ready: ['pg_isready', '-U', 'saraya_test', '-d', 'saraya_repair_test'],
  },
  {
    name: 'saraya-repair-redis-v2-20261106', port: '16379', internal: '6379/tcp',
    args: ['--publish', '127.0.0.1:16379:6379', 'redis:7-alpine', 'redis-server',
      '--save', '', '--appendonly', 'no', '--requirepass', password],
    ready: ['redis-cli', '--no-auth-warning', '-a', password, 'ping'],
  },
];
function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Docker command failed');
  return result;
}
function inspect(name) {
  const result = docker(['inspect', name], true);
  if (result.status !== 0) {
    if (/No such (object|container)/i.test(result.stderr)) return null;
    throw new Error(result.stderr || 'Docker Desktop is not ready');
  }
  return JSON.parse(result.stdout)[0];
}
function validate(container, spec) {
  const bindings = container.HostConfig.PortBindings?.[spec.internal];
  if (container.Name !== `/${spec.name}` || container.Config.Labels?.['saraya.purpose'] !== 'repair-test' ||
      bindings?.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || bindings[0].HostPort !== spec.port ||
      container.Mounts.some((mount) => mount.Type === 'bind' || mount.Type === 'volume' && mount.Destination !== '/data')) {
    throw new Error(`Refusing unexpected container configuration: ${spec.name}`);
  }
  if (spec.port === '15432') {
    const expected = ['POSTGRES_DB=saraya_repair_test', 'POSTGRES_USER=saraya_test', `POSTGRES_PASSWORD=${password}`];
    if (!expected.every((value) => container.Config.Env.includes(value)) || !Object.hasOwn(container.HostConfig.Tmpfs || {}, '/var/lib/postgresql/data')) {
      throw new Error('PostgreSQL is not the expected disposable test database');
    }
  }
}
async function main() {
  docker(['info', '--format', '{{.ServerVersion}}']);
  for (const spec of containers) {
    let container = inspect(spec.name);
    if (!container) {
      docker(['run', '--detach', '--name', spec.name, '--label', 'saraya.purpose=repair-test', ...spec.args]);
      container = inspect(spec.name);
    }
    validate(container, spec);
    if (!container.State.Running) docker(['start', spec.name]);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const probe = docker(['exec', spec.name, ...spec.ready], true);
      if (probe.status === 0 && (spec.port !== '16379' || probe.stdout.trim() === 'PONG')) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error(`Test container did not become ready: ${spec.name}`);
    console.log(`${spec.name}: ready on loopback:${spec.port}`);
  }
  // Never infer a connection URL from the application's .env.
  const cli = path.join(repo, 'server/node_modules/prisma/build/index.js');
  const migration = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: path.join(repo, 'server'), windowsHide: true, stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
  });
  if (migration.status !== 0) throw new Error('Isolated test migrations failed');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
