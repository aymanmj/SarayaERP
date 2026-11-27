#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WEAK_PLACEHOLDERS = [
  'your-secret-key',
  'saraya-default-salt',
  'dev-token',
  'changeme',
  'password123',
  'secret123',
  'replace-me',
  'example',
];

function parseEnvFile(content) {
  const map = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

function validateComposeText(composeText) {
  const errors = [];
  const warnings = [];

  // 1. Forbid :latest image tags (OPS06)
  const latestMatches = composeText.match(/^\s*image:\s*[^\s#]+:latest\b.*$/gim);
  if (latestMatches && latestMatches.length > 0) {
    errors.push(
      `OPS06: Unpinned :latest Docker image tags detected (${latestMatches.length}): ${latestMatches.map((l) => l.trim()).join('; ')}`,
    );
  }

  // 2. Forbid watchtower service (OPS06)
  if (/^\s{2}watchtower\s*:/m.test(composeText) || /containrrr\/watchtower/i.test(composeText)) {
    errors.push('OPS06: Unattended watchtower auto-updater is forbidden in medical production.');
  }

  // 3. Mandatory secret/release guards (:?)
  const requiredGuards = [
    'IMAGE_TAG:?',
    'POSTGRES_PASSWORD:?',
    'REDIS_PASSWORD:?',
    'JWT_SECRET:?',
    'ENCRYPTION_KEY:?',
    'ENCRYPTION_SALT:?',
    'VAULT_TOKEN:?',
    'GRAFANA_PASSWORD:?',
  ];
  for (const guard of requiredGuards) {
    if (!composeText.includes(guard)) {
      errors.push(`OPS07: Missing mandatory fail-closed compose variable guard "${guard}".`);
    }
  }

  // 4. SEC05 ClamAV antivirus service + clamd default
  if (!/^\s{2}clamav\s*:/m.test(composeText) || !/AV_SCANNER_MODE:\s*\$\{AV_SCANNER_MODE:-clamd\}/.test(composeText)) {
    errors.push('SEC05: Production compose must define internal clamav service with AV_SCANNER_MODE defaulting to clamd.');
  }

  // 5. OPS07 Vault address must be configurable for TLS (not hardcoded)
  if (/VAULT_ADDR:\s*["']?http:\/\/vault:8200["']?\s*$/m.test(composeText)) {
    errors.push('OPS07: VAULT_ADDR is hardcoded to plaintext HTTP; must be configurable via ${VAULT_ADDR:-...} for TLS.');
  }

  // 6. Verify admin/infra ports are loopback-bound (127.0.0.1:) and never 0.0.0.0 or bare
  const infraPorts = ['8200', '3001', '9093', '3100', '3200', '4317', '4318', '8889', '9000'];
  for (const port of infraPorts) {
    const exposedRe = new RegExp(`^\\s*-\\s*["']?(?:0\\.0\\.0\\.0:)?${port}:\\d+["']?\\s*(?:#.*)?$`, 'm');
    if (exposedRe.test(composeText)) {
      errors.push(`OPS08: Internal admin/telemetry port ${port} must be bound to 127.0.0.1 only.`);
    }
  }

  // 7. Advisory reminder if vault still has tls_disable: 1 in default local config
  if (/tls_disable":\s*1/.test(composeText)) {
    warnings.push('OPS07 Advisory: Default vault local config has tls_disable: 1; enable TLS certs and https:// VAULT_ADDR in production deployment.');
  }

  // 8. Forbid runtime apk/apt package downloads on container boot (offline-first durability)
  if (/^\s*(?:apk\s+add|apt-get\s+install)\b/m.test(composeText)) {
    errors.push(
      'OPS06: Production compose must not install Alpine/Debian packages (apk add / apt-get install) at container startup; use prebuilt images for air-gapped hospitals.',
    );
  }

  return { errors, warnings };
}

function validateNginxText(nginxText) {
  const errors = [];
  const warnings = [];

  if (!/server_tokens\s+off\s*;/.test(nginxText)) {
    errors.push('OPS08: Nginx must set "server_tokens off;".');
  }

  const tlsMatch = nginxText.match(/ssl_protocols\s+([^;]+);/);
  if (!tlsMatch) {
    errors.push('OPS08: Nginx must explicitly configure ssl_protocols TLSv1.2 TLSv1.3.');
  } else {
    const tlsTokens = tlsMatch[1].trim().split(/\s+/).filter(Boolean);
    const weakProtocol = tlsTokens.find((token) =>
      /^(SSLv2|SSLv3|TLSv1|TLSv1\.0|TLSv1\.1)$/i.test(token),
    );
    if (weakProtocol) {
      errors.push(`OPS08: Weak SSL/TLS protocol detected in ssl_protocols: ${tlsMatch[1]}`);
    }
  }

  const cspMatch = nginxText.match(/Content-Security-Policy\s+"([^"]+)"/);
  if (!cspMatch) {
    errors.push('OPS08: Nginx HTTPS block must define a Content-Security-Policy header.');
  } else if (/unsafe-eval/i.test(cspMatch[1])) {
    errors.push('OPS08: Content-Security-Policy must not allow unsafe-eval.');
  }

  if (!/X-Content-Type-Options\s+"nosniff"\s+always\s*;/.test(nginxText)) {
    errors.push('OPS08: Nginx must enforce X-Content-Type-Options "nosniff" always.');
  }

  // CAP11 ZKTeco ADMS /iclock/ must be proxied on LAN only (with $is_lan guard) and blocked on public HTTPS
  const hasLanIclock =
    /location\s+\^~\s+\/iclock\/\s*\{[^}]*if\s*\(\$is_lan\s*=\s*0\)\s*\{\s*return\s+403;[^}]*\}[^}]*proxy_pass\s+http:\/\/backend_upstream;/s.test(
      nginxText,
    );
  const hasHttpsBlockIclock =
    /location\s+\^~\s+\/iclock\/\s*\{\s*return\s+403;\s*\}/s.test(nginxText);
  if (!hasLanIclock || !hasHttpsBlockIclock) {
    errors.push(
      'CAP11/OPS08: Nginx must restrict /iclock/ ZKTeco ADMS endpoint to LAN ($is_lan = 0 -> 403 + backend_upstream) and return 403 on public HTTPS.',
    );
  }

  // Restricted internal locations must all have deny all;
  for (const loc of ['/portainer/', '/api/health/detailed', '/api/health/metrics']) {
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`location\\s+${escaped}\\s*\\{[^}]*deny\\s+all\\s*;`, 's');
    if (!re.test(nginxText)) {
      errors.push(`OPS08: Nginx location "${loc}" must enforce IP allowlist + "deny all;".`);
    }
  }

  if (!/proxy_pass\s+http:\/\/\$socket_backend\s*;/.test(nginxText)) {
    errors.push('SEC04: Nginx /socket.io/ must preserve sticky polling affinity via $socket_backend.');
  }

  if (!/location\s+~\s+\/\\\.\s*\{[^}]*deny\s+all\s*;/s.test(nginxText)) {
    errors.push('OPS08: Nginx must deny access to hidden dotfiles (location ~ /\\.).');
  }

  return { errors, warnings };
}

function validateEnvMap(envMap) {
  const errors = [];
  const warnings = [];

  const requiredLongSecrets = ['JWT_SECRET', 'ENCRYPTION_KEY', 'ENCRYPTION_SALT'];
  for (const key of requiredLongSecrets) {
    const val = (envMap[key] || '').trim();
    if (val.length < 32) {
      errors.push(`OPS07: Env secret "${key}" must be at least 32 characters in production.`);
      continue;
    }
    const lower = val.toLowerCase();
    if (WEAK_PLACEHOLDERS.some((p) => lower.includes(p))) {
      errors.push(`OPS07: Env secret "${key}" contains a forbidden default/weak placeholder.`);
    }
  }

  const requiredPasswords = ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'GRAFANA_PASSWORD', 'VAULT_TOKEN'];
  for (const key of requiredPasswords) {
    const val = (envMap[key] || '').trim();
    if (val.length < 16) {
      errors.push(`OPS07: Env secret "${key}" must be at least 16 characters.`);
    } else if (WEAK_PLACEHOLDERS.some((p) => val.toLowerCase().includes(p)) || val === 'root') {
      errors.push(`OPS07: Env secret "${key}" uses a forbidden weak/dev value.`);
    }
  }

  const imageTag = (envMap.IMAGE_TAG || '').trim();
  if (!imageTag || imageTag.toLowerCase() === 'latest') {
    errors.push('OPS06: IMAGE_TAG must be pinned to an explicit release tag or sha256 digest (not empty or "latest").');
  }

  const cors = (envMap.CORS_ORIGINS || '').trim();
  if (!cors) {
    errors.push('OPS08: CORS_ORIGINS must explicitly list allowed hospital production origins.');
  } else {
    const origins = cors.split(',').map((o) => o.trim()).filter(Boolean);
    for (const origin of origins) {
      if (origin === '*' || /localhost|127\.0\.0\.1/i.test(origin)) {
        errors.push(`OPS08: Forbidden CORS_ORIGINS entry for production: "${origin}".`);
      }
    }
  }

  const avMode = (envMap.AV_SCANNER_MODE || 'clamd').trim().toLowerCase();
  if (avMode !== 'clamd') {
    errors.push(`SEC05: AV_SCANNER_MODE must be "clamd" in production (got "${avMode}").`);
  }

  const vaultAddr = (envMap.VAULT_ADDR || '').trim();
  if (vaultAddr && !vaultAddr.startsWith('https://')) {
    warnings.push(`OPS07 Advisory: VAULT_ADDR ("${vaultAddr}") is not HTTPS; prefer TLS in production.`);
  }

  return { errors, warnings };
}

function runProductionPreflight(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const composePath = options.composePath || path.join(repoRoot, 'docker-compose.production.yml');
  const nginxPath = options.nginxPath || path.join(repoRoot, 'production', 'nginx', 'nginx.conf');

  const composeText =
    options.composeText !== undefined
      ? options.composeText
      : fs.readFileSync(composePath, 'utf8');
  const nginxText =
    options.nginxText !== undefined
      ? options.nginxText
      : fs.readFileSync(nginxPath, 'utf8');

  const composeRes = validateComposeText(composeText);
  const nginxRes = validateNginxText(nginxText);

  let envRes = { errors: [], warnings: [] };
  if (options.envMap) {
    envRes = validateEnvMap(options.envMap);
  } else if (options.envFile) {
    const rawEnv = fs.readFileSync(options.envFile, 'utf8');
    envRes = validateEnvMap(parseEnvFile(rawEnv));
  }

  const errors = [...composeRes.errors, ...nginxRes.errors, ...envRes.errors];
  const warnings = [...composeRes.warnings, ...nginxRes.warnings, ...envRes.warnings];

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    checked: {
      compose: composePath,
      nginx: nginxPath,
      envFile: options.envFile || (options.envMap ? '<in-memory>' : null),
    },
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let envFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env-file' && args[i + 1]) {
      envFile = path.resolve(args[i + 1]);
      i++;
    }
  }
  const result = runProductionPreflight({ envFile });
  console.log('=== SarayaERP Production Go-Live Preflight ===');
  console.log(`Compose: ${result.checked.compose}`);
  console.log(`Nginx:   ${result.checked.nginx}`);
  if (result.checked.envFile) {
    console.log(`Env:     ${result.checked.envFile}`);
  }
  if (result.warnings.length > 0) {
    console.log('\nAdvisories:');
    for (const w of result.warnings) console.log(`  [WARN] ${w}`);
  }
  if (result.errors.length > 0) {
    console.error('\nFailures:');
    for (const e of result.errors) console.error(`  [FAIL] ${e}`);
    process.exit(1);
  }
  console.log('\nPASS: All production preflight checks succeeded.');
}

module.exports = {
  parseEnvFile,
  validateComposeText,
  validateNginxText,
  validateEnvMap,
  runProductionPreflight,
};
