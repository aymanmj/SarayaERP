#!/usr/bin/env node
/**
 * Saraya ERP — Reproducible Isolated Full DR Restore Drill (OPS09)
 *
 * Exercises full synthetic recovery across:
 *   1. PostgreSQL schema (all Prisma migrations) + pg_dump / pg_restore
 *   2. Encrypted patient PII (AES-256-GCM + scrypt key derivation)
 *   3. Cryptographic SHA-256 AuditLog chain record
 *   4. File attachments & secret key bundle + SHA-256 manifest verification
 *   5. Tamper rejection & wrong-key decryption rejection
 *
 * Uses disposable Docker containers on loopback ports 15433/15434 labeled
 * `saraya.purpose=dr-drill` so it never interferes with 15432 repair-test.
 */

const { spawnSync } = require('node:child_process');
const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_CONTAINER = 'saraya-dr-source-pg';
const TARGET_CONTAINER = 'saraya-dr-target-pg';
const DB_USER = 'saraya_dr';
const DB_NAME = 'saraya_dr_drill';
const DB_PASS = 'synthetic_dr_drill_only_20261122';
const SOURCE_PORT = '15433';
const TARGET_PORT = '15434';

function parseArgs(argv) {
  let reportPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--report' && argv[i + 1]) {
      reportPath = path.resolve(argv[i + 1]);
      i++;
    }
  }
  return { reportPath };
}

function runDocker(args, opts = {}) {
  const result = spawnSync('docker', args, {
    encoding: opts.binary ? null : 'utf8',
    input: opts.input,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!opts.allowFailure && result.status !== 0) {
    const stderrText = opts.binary
      ? Buffer.from(result.stderr || '').toString('utf8')
      : result.stderr;
    throw new Error(
      `docker ${args.join(' ')} failed: ${stderrText || result.error?.message || result.status}`,
    );
  }
  return result;
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function deriveKey(keySecret, salt) {
  return scryptSync(keySecret, salt, 32);
}

function encryptPii(plaintext, derivedKey) {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptPii(ciphertext, derivedKey) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload');
  }
  const [ivHex, tagHex, content] = parts;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    derivedKey,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function startPostgresContainer(name, hostPort) {
  runDocker(['rm', '-f', name], { allowFailure: true });
  runDocker([
    'run',
    '--detach',
    '--name',
    name,
    '--label',
    'saraya.purpose=dr-drill',
    '--publish',
    `127.0.0.1:${hostPort}:5432`,
    '--tmpfs',
    '/var/lib/postgresql/data',
    '--env',
    `POSTGRES_DB=${DB_NAME}`,
    '--env',
    `POSTGRES_USER=${DB_USER}`,
    '--env',
    `POSTGRES_PASSWORD=${DB_PASS}`,
    'postgres:15-alpine',
  ]);

  for (let attempt = 0; attempt < 40; attempt++) {
    const ready = runDocker(
      ['exec', name, 'pg_isready', '-U', DB_USER, '-d', DB_NAME],
      { allowFailure: true },
    );
    if (ready.status === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Postgres container did not become ready: ${name}`);
}

function execSql(container, sql) {
  const res = runDocker([
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    DB_USER,
    '-d',
    DB_NAME,
    '-v',
    'ON_ERROR_STOP=1',
    '-AtF',
    '|',
  ], { input: sql });
  return res.stdout.trim();
}

function verifyManifest(bundleDir, manifest) {
  for (const entry of manifest.files) {
    const filePath = path.join(bundleDir, entry.relativePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing backup artifact: ${entry.relativePath}`);
    }
    const actualSha = sha256File(filePath);
    if (actualSha !== entry.sha256) {
      throw new Error(
        `Checksum mismatch for ${entry.relativePath}: expected ${entry.sha256}, got ${actualSha}`,
      );
    }
  }
}

function countLocalMigrations() {
  const migrationsDir = path.join(REPO_ROOT, 'server', 'prisma', 'migrations');
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(migrationsDir, entry.name, 'migration.sql')),
    ).length;
}

async function main() {
  const { reportPath } = parseArgs(process.argv.slice(2));
  const expectedMigrations = countLocalMigrations();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saraya-dr-drill-'));

  try {
    runDocker(['info', '--format', '{{.ServerVersion}}']);

    // 1. Start isolated source Postgres and apply all Prisma migrations
    await startPostgresContainer(SOURCE_CONTAINER, SOURCE_PORT);
    const sourceDbUrl = `postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${SOURCE_PORT}/${DB_NAME}?schema=public`;
    const prismaCli = path.join(
      REPO_ROOT,
      'server',
      'node_modules',
      'prisma',
      'build',
      'index.js',
    );
    const migrateRes = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: path.join(REPO_ROOT, 'server'),
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: sourceDbUrl },
    });
    if (migrateRes.status !== 0) {
      throw new Error(
        `Source prisma migrate deploy failed: ${migrateRes.stderr || migrateRes.stdout}`,
      );
    }

    // 2. Seed synthetic encrypted PII, chained audit record, and attachment
    const syntheticKey = 'synthetic_dr_encryption_key_32_chars_min';
    const syntheticSalt = 'synthetic_dr_encryption_salt_16c';
    const syntheticJwt = 'synthetic_dr_jwt_secret_for_drill_only';
    const derivedKey = deriveKey(syntheticKey, syntheticSalt);
    const originalNationalId = '119900445566';
    const encryptedNationalId = encryptPii(originalNationalId, derivedKey);

    const createdAtIso = new Date().toISOString();
    const auditAction = 'DR_DRILL_SEED_PATIENT';
    const auditEntity = 'Patient';
    const previousHash = 'GENESIS';
    const auditHash = sha256Buffer(
      Buffer.from(`${previousHash}|${auditAction}|${auditEntity}|1||${createdAtIso}`),
    );

    execSql(
      SOURCE_CONTAINER,
      `
      INSERT INTO "Hospital" ("id", "code", "name", "updatedAt")
      VALUES (1, 'DR-HOSP-1', 'Synthetic DR Hospital', NOW());

      INSERT INTO "Patient" ("id", "hospitalId", "mrn", "fullName", "nationalId", "updatedAt")
      VALUES (1, 1, 'DR-MRN-0001', 'Synthetic DR Patient', '${encryptedNationalId}', NOW());

      INSERT INTO "AuditLog" ("hospitalId", "entityId", "entity", "action", "previousHash", "hash", "createdAt")
      VALUES (1, 1, '${auditEntity}', '${auditAction}', '${previousHash}', '${auditHash}', '${createdAtIso}');
      `,
    );

    const srcUploadsDir = path.join(workDir, 'src-uploads', 'patients');
    fs.mkdirSync(srcUploadsDir, { recursive: true });
    const attachmentSrc = path.join(srcUploadsDir, 'clinical-doc-1.txt');
    fs.writeFileSync(
      attachmentSrc,
      'Synthetic DICOM/clinical consent attachment payload for DR drill.\n',
      'utf8',
    );
    const attachmentSha = sha256File(attachmentSrc);

    // 3. Create backup bundle (pg_dump -Fc + uploads + key bundle + SHA-256 manifest)
    const bundleDir = path.join(workDir, 'backup-bundle');
    const bundleUploadsDir = path.join(bundleDir, 'uploads', 'patients');
    const bundleSecretsDir = path.join(bundleDir, 'secrets');
    fs.mkdirSync(bundleUploadsDir, { recursive: true });
    fs.mkdirSync(bundleSecretsDir, { recursive: true });

    const dumpResult = runDocker(
      ['exec', SOURCE_CONTAINER, 'pg_dump', '-U', DB_USER, '-d', DB_NAME, '-Fc'],
      { binary: true },
    );
    const dumpPath = path.join(bundleDir, 'db.dump');
    fs.writeFileSync(dumpPath, dumpResult.stdout);

    const backupAttachment = path.join(bundleUploadsDir, 'clinical-doc-1.txt');
    fs.copyFileSync(attachmentSrc, backupAttachment);

    const secretsPath = path.join(bundleSecretsDir, 'keys.json');
    fs.writeFileSync(
      secretsPath,
      JSON.stringify(
        {
          ENCRYPTION_KEY: syntheticKey,
          ENCRYPTION_SALT: syntheticSalt,
          JWT_SECRET: syntheticJwt,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );

    const manifest = {
      createdAt: new Date().toISOString(),
      expectedMigrations,
      files: [
        { relativePath: 'db.dump', sha256: sha256File(dumpPath) },
        {
          relativePath: path.join('uploads', 'patients', 'clinical-doc-1.txt'),
          sha256: sha256File(backupAttachment),
        },
        {
          relativePath: path.join('secrets', 'keys.json'),
          sha256: sha256File(secretsPath),
        },
      ],
    };
    const manifestPath = path.join(bundleDir, 'manifest.sha256.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // 4. Verify tamper detection rejects corrupted backup dump
    const tamperDir = path.join(workDir, 'tamper-check');
    fs.cpSync(bundleDir, tamperDir, { recursive: true });
    const tamperedDump = path.join(tamperDir, 'db.dump');
    const tamperedBytes = fs.readFileSync(tamperedDump);
    tamperedBytes[0] = tamperedBytes[0] ^ 0xff;
    fs.writeFileSync(tamperedDump, tamperedBytes);

    let tamperDetectionPassed = false;
    try {
      verifyManifest(tamperDir, manifest);
    } catch (err) {
      if (/Checksum mismatch/i.test(err.message)) {
        tamperDetectionPassed = true;
      } else {
        throw err;
      }
    }
    if (!tamperDetectionPassed) {
      throw new Error('Tamper check did not reject corrupted backup');
    }

    // 5. Start brand-new clean target Postgres container & measure RTO
    await startPostgresContainer(TARGET_CONTAINER, TARGET_PORT);
    const rtoStart = performance.now();

    verifyManifest(bundleDir, manifest);
    const restoredDir = path.join(workDir, 'restored');
    const restoredUploadsDir = path.join(restoredDir, 'uploads');
    const restoredSecretsDir = path.join(restoredDir, 'secrets');
    fs.mkdirSync(restoredUploadsDir, { recursive: true });
    fs.mkdirSync(restoredSecretsDir, { recursive: true });

    const dumpBytes = fs.readFileSync(dumpPath);
    runDocker(
      [
        'exec',
        '-i',
        TARGET_CONTAINER,
        'pg_restore',
        '-U',
        DB_USER,
        '-d',
        DB_NAME,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
      ],
      { input: dumpBytes },
    );

    fs.cpSync(path.join(bundleDir, 'uploads'), restoredUploadsDir, {
      recursive: true,
    });
    fs.cpSync(path.join(bundleDir, 'secrets'), restoredSecretsDir, {
      recursive: true,
    });

    const rtoMs = Math.round(performance.now() - rtoStart);

    // 6. Verify restored DB migrations, encrypted PII, AuditLog hash & attachment
    const appliedMigrations = Number(
      execSql(
        TARGET_CONTAINER,
        `SELECT COUNT(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL;`,
      ),
    );
    if (appliedMigrations !== expectedMigrations) {
      throw new Error(
        `Migration count mismatch after restore: expected ${expectedMigrations}, got ${appliedMigrations}`,
      );
    }

    const restoredPatientEnc = execSql(
      TARGET_CONTAINER,
      `SELECT "nationalId" FROM "Patient" WHERE "mrn" = 'DR-MRN-0001';`,
    );
    const restoredKeys = JSON.parse(
      fs.readFileSync(path.join(restoredSecretsDir, 'keys.json'), 'utf8'),
    );
    const restoredDerivedKey = deriveKey(
      restoredKeys.ENCRYPTION_KEY,
      restoredKeys.ENCRYPTION_SALT,
    );
    const decryptedNationalId = decryptPii(restoredPatientEnc, restoredDerivedKey);
    if (decryptedNationalId !== originalNationalId) {
      throw new Error('Decrypted patient PII did not match original plaintext');
    }

    let wrongKeyRejected = false;
    try {
      decryptPii(
        restoredPatientEnc,
        deriveKey('wrong_dr_key_for_negative_check_32c', restoredKeys.ENCRYPTION_SALT),
      );
    } catch {
      wrongKeyRejected = true;
    }
    if (!wrongKeyRejected) {
      throw new Error('Wrong encryption key unexpectedly decrypted PII');
    }

    const restoredAuditHash = execSql(
      TARGET_CONTAINER,
      `SELECT "hash" FROM "AuditLog" WHERE "action" = '${auditAction}' LIMIT 1;`,
    );
    if (restoredAuditHash !== auditHash) {
      throw new Error(
        `AuditLog hash mismatch: expected ${auditHash}, got ${restoredAuditHash}`,
      );
    }

    const restoredAttachmentSha = sha256File(
      path.join(restoredUploadsDir, 'patients', 'clinical-doc-1.txt'),
    );
    if (restoredAttachmentSha !== attachmentSha) {
      throw new Error('Restored attachment SHA-256 mismatch');
    }

    const report = {
      status: 'PASSED',
      executedAt: new Date().toISOString(),
      measuredRtoMs: rtoMs,
      measuredRtoSeconds: Number((rtoMs / 1000).toFixed(2)),
      measuredRpoScope: 'Point-in-time full synthetic bundle (RPO=0 for dumped transaction snapshot)',
      appliedMigrations,
      expectedMigrations,
      piiDecryptMatched: decryptedNationalId === originalNationalId,
      wrongKeyRejected,
      auditHashMatched: restoredAuditHash === auditHash,
      attachmentChecksumMatched: restoredAttachmentSha === attachmentSha,
      tamperDetectionPassed,
      limitations: [
        'Isolated synthetic localhost Docker Postgres + local bundle drill (not off-site site-scale production hardware or live HashiCorp Vault TLS/Orthanc combined run)',
      ],
    };

    if (reportPath) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    runDocker(['rm', '-f', SOURCE_CONTAINER], { allowFailure: true });
    runDocker(['rm', '-f', TARGET_CONTAINER], { allowFailure: true });
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('❌ DR Drill failed:', err.message);
  process.exit(1);
});
