import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

export async function startTestGateway(backends: readonly string[]) {
  const listener = createServer();
  await once(listener.listen(0, '127.0.0.1'), 'listening');
  const address = listener.address();
  await once(listener.close(), 'close');
  if (!address || typeof address === 'string')
    throw new Error('Expected a local temporary port');
  // An automatically published Docker port may change when the container restarts.
  const binding = `127.0.0.1:${address.port}`;
  const name = `saraya-test-nginx-${randomUUID()}`;
  const directory = mkdtempSync(join(tmpdir(), 'saraya-test-nginx-'));
  const docker = (...args: string[]) =>
    execFileSync('docker', args, { encoding: 'utf8', timeout: 20000 }).trim();
  let launched = false;
  const close = () => {
    try {
      if (launched) docker('rm', '-f', name);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  try {
    const key = join(directory, 'privkey.pem');
    const cert = join(directory, 'fullchain.pem');
    const opensslConfig = join(directory, 'openssl.cnf');
    writeFileSync(opensslConfig, '[req]\ndistinguished_name = dn\n[dn]\n');
    execFileSync(
      process.env.NURSING_TEST_OPENSSL || 'openssl',
      [
        'req',
        '-config',
        opensslConfig,
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        key,
        '-out',
        cert,
      ],
      { stdio: 'pipe', timeout: 15000 },
    );
    const upstreams = backends.map((address) => {
      const { protocol, hostname, port } = new URL(address);
      if (protocol !== 'http:' || hostname !== '127.0.0.1' || !port)
        throw new Error('Expected a local test worker');
      return `server host.docker.internal:${port};`;
    });
    const config = readFileSync(
      resolve('../production/nginx/nginx.conf'),
      'utf8',
    );
    for (const endpoint of [
      'server backend:3000;',
      'server frontend:80;',
      'server portainer:9000;',
    ]) {
      if (!config.includes(endpoint))
        throw new Error(`Missing production Nginx upstream: ${endpoint}`);
    }
    const testConfig = join(directory, 'nginx.conf');
    writeFileSync(
      testConfig,
      config
        .replaceAll('server backend:3000;', upstreams.join('\n        '))
        .replace('server frontend:80;', 'server 127.0.0.1:9;')
        .replace('server portainer:9000;', 'server 127.0.0.1:9;'),
    );
    docker(
      'create',
      '--name',
      name,
      '--label',
      'saraya.purpose=repair-test',
      '--pull=never',
      '-p',
      `${binding}:443`,
      '--mount',
      `type=bind,src=${testConfig},dst=/etc/nginx/nginx.conf,readonly`,
      '--mount',
      `type=bind,src=${cert},dst=/etc/nginx/certs/fullchain.pem,readonly`,
      '--mount',
      `type=bind,src=${key},dst=/etc/nginx/certs/privkey.pem,readonly`,
      'nginx:alpine',
    );
    launched = true;
    const start = () => {
      docker('start', name);
      if (docker('port', name, '443/tcp') !== binding)
        throw new Error('Expected the same loopback-only Nginx HTTPS port');
    };
    start();
    return {
      url: `https://${binding}`,
      ca: readFileSync(cert, 'utf8'),
      imageId: docker('inspect', '--format', '{{.Image}}', name),
      accessLog: () => docker('logs', name),
      stop: () => docker('stop', '--time', '1', name),
      start,
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
