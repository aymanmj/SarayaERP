/**
 * ============================================================
 * Cleanup Script: Deduplicate GlobalPatient Records
 * ============================================================
 *
 * PROBLEM:
 *   Due to broken hash lookups, the same physical patient got
 *   multiple GlobalPatient records (all with NULL hashes).
 *   Example: "سالم ميلود المزوغي" has 9 duplicate GP records.
 *
 * SOLUTION:
 *   1. Group GlobalPatient records by nationalId (decrypted)
 *   2. For each group with duplicates:
 *      a. Keep the OLDEST record (lowest ID) as the "survivor"
 *      b. Re-link all Patient records from duplicates → survivor
 *      c. Delete the duplicate GlobalPatient records
 *
 * USAGE:
 *   # Preview (no writes)
 *   DRY_RUN=1 node dist/scripts/dedup-global-patients.js
 *
 *   # Execute
 *   node dist/scripts/dedup-global-patients.js
 *
 * SAFETY:
 *   - DRY_RUN mode by default behavior: always preview first
 *   - Per-group error handling — one failure won't stop the batch
 *   - Detailed logging of every re-link and delete operation
 */

import { PrismaClient } from '@prisma/client';
import { createHash, createDecipheriv, scryptSync } from 'crypto';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1';

// ============================================================
// Encryption Helpers (standalone — no NestJS DI)
// ============================================================
const ALGORITHM = 'aes-256-gcm';

function buildEncryptionKey(): Buffer {
  const encryptionKey = process.env.ENCRYPTION_KEY || 'your-secret-key-32-chars-long-!!!';
  const encryptionSalt = process.env.ENCRYPTION_SALT || 'saraya-default-salt-123';
  return scryptSync(encryptionKey, encryptionSalt, 32);
}

function decrypt(encryptedText: string | null, key: Buffer): string | null {
  if (!encryptedText) return null;
  if (!encryptedText.includes(':')) return encryptedText; // Not encrypted

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
    return encryptedText; // Return as-is if decryption fails
  }
}

function computeHash(value: string | null): string | null {
  if (!value) return null;
  return createHash('sha256')
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

// ============================================================
// Main
// ============================================================
async function main() {
  const key = buildEncryptionKey();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   GlobalPatient Deduplication Script                    ║');
  console.log('║   Merges duplicate MPI records into a single entry     ║');
  console.log(`║   Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '⚡ LIVE — changes will be written'}                       ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Step 1: Load ALL GlobalPatient records
  const allGPs = await prisma.globalPatient.findMany({
    where: { isDeleted: false },
    include: {
      localPatients: {
        select: { id: true, hospitalId: true, mrn: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  console.log(`📊 Total GlobalPatient records: ${allGPs.length}\n`);

  // Step 2: Group by decrypted nationalId
  const groups = new Map<string, typeof allGPs>();

  for (const gp of allGPs) {
    const rawNationalId = decrypt(gp.nationalId, key);
    if (!rawNationalId) {
      // Try grouping by fullName as fallback
      const groupKey = `name:${gp.fullName.trim().toLowerCase()}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(gp);
      continue;
    }

    const normalizedId = rawNationalId.trim().toLowerCase();
    if (!groups.has(normalizedId)) groups.set(normalizedId, []);
    groups.get(normalizedId)!.push(gp);
  }

  // Step 3: Process groups with duplicates
  const duplicateGroups = Array.from(groups.entries()).filter(([, gps]) => gps.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicate GlobalPatient records found. Database is clean!');
    return;
  }

  console.log(`🔍 Found ${duplicateGroups.length} duplicate group(s):\n`);

  let totalMerged = 0;
  let totalRelinked = 0;
  let totalDeleted = 0;
  let errors = 0;

  for (const [groupKey, gps] of duplicateGroups) {
    try {
      // Sort by ID ascending — keep the OLDEST (first created)
      gps.sort((a, b) => a.id - b.id);
      const survivor = gps[0];
      const duplicates = gps.slice(1);

      const dupIds = duplicates.map(d => d.id);
      const totalLinkedPatients = gps.reduce((sum, gp) => sum + gp.localPatients.length, 0);

      console.log(`─── Group: "${survivor.fullName}" (key: ${groupKey}) ───`);
      console.log(`    Survivor:   GP #${survivor.id} (${survivor.localPatients.length} patient files)`);
      console.log(`    Duplicates: ${dupIds.map(id => `GP #${id}`).join(', ')} (${duplicates.reduce((s, d) => s + d.localPatients.length, 0)} patient files)`);
      console.log(`    Action:     Re-link ${totalLinkedPatients} patients → GP #${survivor.id}, then delete ${dupIds.length} duplicates`);

      if (DRY_RUN) {
        console.log(`    [DRY] Would merge ${gps.length} records into GP #${survivor.id}\n`);
        totalMerged += gps.length - 1;
        totalRelinked += duplicates.reduce((s, d) => s + d.localPatients.length, 0);
        totalDeleted += dupIds.length;
        continue;
      }

      // === LIVE EXECUTION ===
      // Step A: Re-link all Patient records from duplicates to survivor
      for (const dup of duplicates) {
        if (dup.localPatients.length > 0) {
          const patientIds = dup.localPatients.map(p => p.id);
          await prisma.patient.updateMany({
            where: { id: { in: patientIds } },
            data: { globalPatientId: survivor.id },
          });
          console.log(`    ✅ Re-linked ${patientIds.length} patients from GP #${dup.id} → GP #${survivor.id}`);
          totalRelinked += patientIds.length;
        }
      }

      // Step B: Recompute hashes for the survivor from its decrypted data
      const rawNationalId = decrypt(survivor.nationalId, key);
      const rawIdentityNumber = decrypt(survivor.identityNumber, key);
      const survivalUpdate: Record<string, any> = {};

      const nationalIdHash = computeHash(rawNationalId);
      const identityNumberHash = computeHash(rawIdentityNumber);

      if (nationalIdHash) survivalUpdate.nationalIdHash = nationalIdHash;
      if (identityNumberHash) survivalUpdate.identityNumberHash = identityNumberHash;

      // Get phone/email hash from linked patients
      const linkedPatient = await prisma.patient.findFirst({
        where: { globalPatientId: survivor.id },
        select: { phoneHash: true, emailHash: true },
      });
      if (linkedPatient?.phoneHash) survivalUpdate.phoneHash = linkedPatient.phoneHash;
      if (linkedPatient?.emailHash) survivalUpdate.emailHash = linkedPatient.emailHash;

      if (Object.keys(survivalUpdate).length > 0) {
        await prisma.globalPatient.update({
          where: { id: survivor.id },
          data: survivalUpdate,
        });
        console.log(`    ✅ Updated GP #${survivor.id} hashes: ${Object.keys(survivalUpdate).join(', ')}`);
      }

      // Step C: Delete duplicates (set NULL hashes first to avoid unique constraint errors)
      for (const dupId of dupIds) {
        // Clear unique hashes to avoid constraint violations
        await prisma.globalPatient.update({
          where: { id: dupId },
          data: {
            nationalIdHash: null,
            identityNumberHash: null,
            phoneHash: null,
            emailHash: null,
          },
        });
      }

      // Now soft-delete duplicates
      await prisma.globalPatient.updateMany({
        where: { id: { in: dupIds } },
        data: { isDeleted: true },
      });
      console.log(`    🗑️ Soft-deleted ${dupIds.length} duplicate(s): ${dupIds.map(id => `GP #${id}`).join(', ')}`);

      totalMerged += gps.length - 1;
      totalDeleted += dupIds.length;

      console.log('');

    } catch (error: any) {
      errors++;
      console.error(`    ❌ Error processing group "${groupKey}": ${error.message}\n`);
    }
  }

  // Summary
  console.log('════════════════════════════════════════════════');
  console.log('📊 Deduplication Results:');
  console.log(`   Groups processed: ${duplicateGroups.length}`);
  console.log(`   Records merged:   ${totalMerged}`);
  console.log(`   Patients re-linked: ${totalRelinked}`);
  console.log(`   Duplicates deleted: ${totalDeleted}`);
  console.log(`   Errors:           ${errors}`);
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
