// Keep child stderr out of PowerShell 5's NativeCommandError conversion.
// Called after the PowerShell harness has validated the disposable containers.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const target = new URL(process.env.DATABASE_URL || '');
if (process.env.NODE_ENV !== 'test' || target.hostname !== '127.0.0.1' ||
    target.port !== '15432' || target.pathname !== '/saraya_repair_test') {
  throw new Error('Refusing a database outside the disposable repair-test environment');
}
const logPath = path.resolve(repo, process.argv[2] || 'scratch/audit-20261106/isolated-e2e.log');
const relativeLog = path.relative(path.join(repo, 'scratch'), logPath);
if (relativeLog.startsWith('..') || path.isAbsolute(relativeLog) || !logPath.endsWith('.log')) {
  throw new Error('Test logs must be .log files inside the workspace scratch directory');
}
const testPath = process.argv[3];
if (testPath && !/^test\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.e2e-spec\.ts$/i.test(testPath)) {
  throw new Error('Expected a repository test/*.e2e-spec.ts path');
}
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const fd = fs.openSync(logPath, 'w');
try {
  const args = [require.resolve('../server/node_modules/jest/bin/jest.js'), '--config', './test/jest-e2e.json', '--runInBand', '--detectOpenHandles'];
  if (testPath) args.push('--runTestsByPath', testPath);
  // Node 25+ exposes experimental browser storage; these tests use server APIs.
  const env = { ...process.env };
  if (Number(process.versions.node.split('.')[0]) >= 25) {
    env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --no-experimental-webstorage`.trim();
  }
  const result = spawnSync(process.execPath, args, { cwd: path.join(repo, 'server'), env, stdio: ['ignore', fd, fd], windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.closeSync(fd);
}
