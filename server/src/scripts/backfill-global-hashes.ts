/**
 * ============================================================
 * Backfill Script: Re-compute SHA-256 Search Hashes for
 * GlobalPatient records that have NULL hash fields.
 * ============================================================
 *
 * PROBLEM:
 *   Due to a bug where hashes were not pre-computed before
 *   GlobalPatient creation, many records have null nationalIdHash,
 *   phoneHash, etc. — making MPI lookups fail silently.
 *
 * SOLUTION:
 *   1. Read all GlobalPatient records with null hashes
 *   2. Decrypt the encrypted PII fields (nationalId, phone, etc.)
 *   3. Recompute SHA-256 hashes from the decrypted plain text
 *   4. Update GlobalPatient records with the correct hashes
 *
 * USAGE:
 *   npx ts-node src/scripts/backfill-global-hashes.ts
 *
 * SAFETY:
 *   - READ/UPDATE only. No records are deleted.
 *   - Wrapped in try/catch per record — one failure won't stop the batch.
 *   - Dry-run mode available by setting DRY_RUN=1
 */

import { PrismaClient } from '@prisma/client';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from 'crypto';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1';

// ============================================================
// Encryption Helpers (standalone — no NestJS DI needed)
// ============================================================
const ALGORITHM = 'aes-256-gcm';

function buildEncryptionKey(): Buffer {
  const encryptionKey =
    process.env.ENCRYPTION_KEY || 'your-secret-key-32-chars-long-!!!';
  const encryptionSalt =
    process.env.ENCRYPTION_SALT || 'saraya-default-salt-123';
  return scryptSync(encryptionKey, encryptionSalt, 32);
}

function decrypt(encryptedText: string | null, key: Buffer): string | null {
  if (!encryptedText) return null;
  if (!encryptedText.includes(':')) return encryptedText; // Not encrypted — return as-is

  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  try {
    const [ivHex, tagHex, content] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedText; // Return raw if decryption fails
  }
}

function generateHash(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   GlobalPatient Hash Backfill Script                    ║');
  console.log('║   Fixes MPI lookup by recomputing search hashes         ║');
  console.log(
    `║   Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✏️  LIVE (will update DB)'}                       ║`,
  );
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const key = buildEncryptionKey();

  // Fetch ALL GlobalPatient records (small table — OK to load all)
  const globalPatients = await prisma.globalPatient.findMany({
    where: { isDeleted: false },
  });

  console.log(
    `📊 Found ${globalPatients.length} GlobalPatient records to process.\n`,
  );

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const gp of globalPatients) {
    try {
      // Decrypt PII fields
      const plainNationalId = decrypt(gp.nationalId, key);
      const plainIdentityNumber = decrypt(gp.identityNumber, key);

      // For phone/email — GlobalPatient doesn't store encrypted phone/email text,
      // only hashes. So we can only fix nationalIdHash and identityNumberHash
      // from the encrypted fields we DO have.

      // Compute what the hashes SHOULD be
      const correctNationalIdHash = generateHash(plainNationalId);
      const correctIdentityNumberHash = generateHash(plainIdentityNumber);

      // Check if any hash needs updating
      const needsUpdate =
        (correctNationalIdHash &&
          gp.nationalIdHash !== correctNationalIdHash) ||
        (correctIdentityNumberHash &&
          gp.identityNumberHash !== correctIdentityNumberHash);

      if (!needsUpdate) {
        skipped++;
        continue;
      }

      const updateData: any = {};
      if (
        correctNationalIdHash &&
        gp.nationalIdHash !== correctNationalIdHash
      ) {
        updateData.nationalIdHash = correctNationalIdHash;
      }
      if (
        correctIdentityNumberHash &&
        gp.identityNumberHash !== correctIdentityNumberHash
      ) {
        updateData.identityNumberHash = correctIdentityNumberHash;
      }

      if (DRY_RUN) {
        console.log(
          `[DRY] GP #${gp.id} "${gp.fullName}" → would set:`,
          Object.keys(updateData).join(', '),
        );
      } else {
        await prisma.globalPatient.update({
          where: { id: gp.id },
          data: updateData,
        });
        console.log(`✅ GP #${gp.id} "${gp.fullName}" → hashes updated`);
      }
      updated++;
    } catch (error: any) {
      errors++;
      console.error(`❌ GP #${gp.id}: ${error.message}`);
    }
  }

  // === PHASE 2: Backfill from Local Patients (phone/email hashes) ===
  console.log(
    '\n─── Phase 2: Syncing phone/email hashes from Local Patients ───\n',
  );

  const patientsWithGlobal = await prisma.patient.findMany({
    where: {
      globalPatientId: { not: null },
      isDeleted: false,
    },
    select: {
      id: true,
      globalPatientId: true,
      phoneHash: true,
      emailHash: true,
    },
  });

  let syncCount = 0;

  for (const lp of patientsWithGlobal) {
    try {
      if (!lp.globalPatientId) continue;

      const gp = await prisma.globalPatient.findUnique({
        where: { id: lp.globalPatientId },
      });
      if (!gp) continue;

      const syncData: any = {};
      if (lp.phoneHash && !gp.phoneHash) {
        syncData.phoneHash = lp.phoneHash;
      }
      if (lp.emailHash && !gp.emailHash) {
        syncData.emailHash = lp.emailHash;
      }

      if (Object.keys(syncData).length === 0) continue;

      if (DRY_RUN) {
        console.log(
          `[DRY] GP #${gp.id} ← LP #${lp.id}: would sync ${Object.keys(syncData).join(', ')}`,
        );
      } else {
        await prisma.globalPatient.update({
          where: { id: gp.id },
          data: syncData,
        });
        console.log(
          `✅ GP #${gp.id} ← LP #${lp.id}: synced ${Object.keys(syncData).join(', ')}`,
        );
      }
      syncCount++;
    } catch (error: any) {
      errors++;
      console.error(`❌ LP #${lp.id}: ${error.message}`);
    }
  }

  console.log('\n════════════════════════════════════════════════');
  console.log(`📊 Results:`);
  console.log(`   Hash fixes:   ${updated} records`);
  console.log(`   Phone/Email:  ${syncCount} synced`);
  console.log(`   Skipped:      ${skipped} (already correct)`);
  console.log(`   Errors:       ${errors}`);
  console.log('════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
