import * as path from 'node:path';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';

interface PreflightResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface PreflightModule {
  runProductionPreflight: (options?: {
    repoRoot?: string;
    composeText?: string;
    nginxText?: string;
    envMap?: Record<string, string>;
  }) => PreflightResult;
}

const localRequire = createRequire(__filename);
const preflight = localRequire(
  '../../../../scripts/production-preflight.cjs',
) as PreflightModule;

describe('Production Go-Live Preflight Gate (OPS06 / OPS07 / OPS08 / CAP11)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const realCompose = fs.readFileSync(
    path.join(repoRoot, 'docker-compose.production.yml'),
    'utf8',
  );
  const realNginx = fs.readFileSync(
    path.join(repoRoot, 'production', 'nginx', 'nginx.conf'),
    'utf8',
  );

  it('passes on the repository production docker-compose.production.yml and nginx.conf', () => {
    const res = preflight.runProductionPreflight({ repoRoot });
    expect(res.errors).toEqual([]);
    expect(res.passed).toBe(true);
  });

  it('fails closed if any :latest image tag, watchtower, or exposed Vault port is introduced', () => {
    const badCompose = realCompose
      .replace(
        'image: prom/prometheus:${PROMETHEUS_IMAGE_TAG:-v2.55.1}',
        'image: prom/prometheus:latest',
      )
      .replace('"127.0.0.1:8200:8200"', '"8200:8200"');

    const res = preflight.runProductionPreflight({
      composeText: badCompose,
      nginxText: realNginx,
    });
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes(':latest'))).toBe(true);
    expect(res.errors.some((e) => e.includes('port 8200'))).toBe(true);
  });

  it('fails closed if Nginx weakens CSP, removes /iclock/ LAN guard, or opens /portainer/', () => {
    const badNginx = realNginx
      .replace("script-src 'self';", "script-src 'self' 'unsafe-eval';")
      .replace('location ^~ /iclock/ {', 'location ^~ /disabled-iclock/ {')
      .replace(
        'location /portainer/ {\n            # ── IP Whitelisting ──',
        'location /portainer/ {\n',
      );

    const res = preflight.runProductionPreflight({
      composeText: realCompose,
      nginxText: badNginx,
    });
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('unsafe-eval'))).toBe(true);
    expect(res.errors.some((e) => e.includes('/iclock/'))).toBe(true);
  });

  it('validates production env maps: accepts strong synthetic production secrets and rejects weak/wildcard values', () => {
    const strongEnv = {
      IMAGE_TAG: 'v2026.11.25-rc1',
      JWT_SECRET: 'a9f4c2e8b1d7063f5a2c9e8471b0d3f6a9f4c2e8b1d7063f',
      ENCRYPTION_KEY: '7c3e91a5d048b2f6e1a7c4d902b5f8e37c3e91a5d048b2f6',
      ENCRYPTION_SALT: '3b8d1f6a4c9e2057a1d4f8b2c6e903513b8d1f6a4c9e2057',
      POSTGRES_PASSWORD: 'PgStrongSynthetic2026!#',
      REDIS_PASSWORD: 'RedisStrongSynthetic2026!#',
      GRAFANA_PASSWORD: 'GrafanaStrongSynthetic2026!#',
      VAULT_TOKEN: 'hvs.SyntheticProdToken2026ABCDEF',
      VAULT_ADDR: 'https://vault.internal.hospital.ly:8200',
      CORS_ORIGINS: 'https://his.hospital.ly,https://portal.hospital.ly',
      AV_SCANNER_MODE: 'clamd',
    };

    const ok = preflight.runProductionPreflight({
      composeText: realCompose,
      nginxText: realNginx,
      envMap: strongEnv,
    });
    expect(ok.errors).toEqual([]);
    expect(ok.passed).toBe(true);

    const weak = preflight.runProductionPreflight({
      composeText: realCompose,
      nginxText: realNginx,
      envMap: {
        ...strongEnv,
        IMAGE_TAG: 'latest',
        ENCRYPTION_KEY: 'your-secret-key-32-chars-long-!!!',
        CORS_ORIGINS: 'https://his.hospital.ly,http://localhost:5173',
        AV_SCANNER_MODE: 'disabled',
      },
    });
    expect(weak.passed).toBe(false);
    expect(weak.errors.some((e) => e.includes('IMAGE_TAG'))).toBe(true);
    expect(weak.errors.some((e) => e.includes('ENCRYPTION_KEY'))).toBe(true);
    expect(weak.errors.some((e) => e.includes('CORS_ORIGINS'))).toBe(true);
    expect(weak.errors.some((e) => e.includes('AV_SCANNER_MODE'))).toBe(true);
  });

  it('fails closed if production compose introduces runtime apk add package downloads', () => {
    const onlineDependentCompose = `${realCompose}\n      apk add --no-cache curl jq\n`;
    const res = preflight.runProductionPreflight({
      composeText: onlineDependentCompose,
      nginxText: realNginx,
    });
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('apk add'))).toBe(true);
  });
});
