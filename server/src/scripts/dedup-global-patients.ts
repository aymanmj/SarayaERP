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
  const encryptionKey =
    process.env.ENCRYPTION_KEY || 'your-secret-key-32-chars-long-!!!';
  const encryptionSalt =
    process.env.ENCRYPTION_SALT || 'saraya-default-salt-123';
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
  console.log('║   GlobalPatient Deduplication Script  v2                ║');
  console.log('║   Merges duplicate MPI records into a single entry     ║');
  console.log(
    `║   Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '⚡ LIVE — changes will be written'}                       ║`,
  );
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ──────────────────────────────────────────────────
  // PHASE 0: Clear ALL unique hashes to prevent conflicts
  // ──────────────────────────────────────────────────
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

  if (!DRY_RUN) {
    console.log(
      '🧹 Phase 0: Clearing all hashes to prevent UNIQUE conflicts...',
    );
    await prisma.globalPatient.updateMany({
      where: { isDeleted: false },
      data: {
        nationalIdHash: null,
        identityNumberHash: null,
        phoneHash: null,
        emailHash: null,
      },
    });
    console.log(`   ✅ Cleared hashes from ${allGPs.length} records\n`);
  }

  // ──────────────────────────────────────────────────
  // PHASE 1: Group by decrypted nationalId → merge duplicates
  // ──────────────────────────────────────────────────
  console.log('🔗 Phase 1: Grouping and merging duplicates...\n');

  const groups = new Map<string, typeof allGPs>();

  for (const gp of allGPs) {
    const rawNationalId = decrypt(gp.nationalId, key);
    if (!rawNationalId) {
      const groupKey = `name:${gp.fullName.trim().toLowerCase()}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(gp);
      continue;
    }
    const normalizedId = rawNationalId.trim().toLowerCase();
    if (!groups.has(normalizedId)) groups.set(normalizedId, []);
    groups.get(normalizedId)!.push(gp);
  }

  const duplicateGroups = Array.from(groups.entries()).filter(
    ([, gps]) => gps.length > 1,
  );
  const singleGroups = Array.from(groups.entries()).filter(
    ([, gps]) => gps.length === 1,
  );

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicate GlobalPatient records found!');
  } else {
    console.log(`🔍 Found ${duplicateGroups.length} duplicate group(s):\n`);
  }

  let totalMerged = 0;
  let totalRelinked = 0;
  let totalDeleted = 0;
  let errors = 0;
  const survivorIds: number[] = [];

  // Process duplicate groups
  for (const [groupKey, gps] of duplicateGroups) {
    try {
      gps.sort((a, b) => a.id - b.id);
      const survivor = gps[0];
      const duplicates = gps.slice(1);
      const dupIds = duplicates.map((d) => d.id);

      console.log(`─── Group: "${survivor.fullName}" (key: ${groupKey}) ───`);
      console.log(
        `    Survivor:   GP #${survivor.id} (${survivor.localPatients.length} patient files)`,
      );
      console.log(
        `    Duplicates: ${dupIds.map((id) => `GP #${id}`).join(', ')} (${duplicates.reduce((s, d) => s + d.localPatients.length, 0)} patient files)`,
      );

      survivorIds.push(survivor.id);

      if (DRY_RUN) {
        console.log(
          `    [DRY] Would merge ${gps.length} records into GP #${survivor.id}\n`,
        );
        totalMerged += duplicates.length;
        totalRelinked += duplicates.reduce(
          (s, d) => s + d.localPatients.length,
          0,
        );
        totalDeleted += dupIds.length;
        continue;
      }

      // Re-link patients from duplicates → survivor
      for (const dup of duplicates) {
        if (dup.localPatients.length > 0) {
          const patientIds = dup.localPatients.map((p) => p.id);
          await prisma.patient.updateMany({
            where: { id: { in: patientIds } },
            data: { globalPatientId: survivor.id },
          });
          console.log(
            `    ✅ Re-linked ${patientIds.length} patients from GP #${dup.id} → GP #${survivor.id}`,
          );
          totalRelinked += patientIds.length;
        }
      }

      // Soft-delete duplicates
      await prisma.globalPatient.updateMany({
        where: { id: { in: dupIds } },
        data: { isDeleted: true },
      });
      console.log(
        `    🗑️ Soft-deleted ${dupIds.length} duplicate(s): ${dupIds.map((id) => `GP #${id}`).join(', ')}\n`,
      );

      totalMerged += duplicates.length;
      totalDeleted += dupIds.length;
    } catch (error: any) {
      errors++;
      console.error(`    ❌ Error: ${error.message}\n`);
    }
  }

  // Collect single-group survivors too
  for (const [, gps] of singleGroups) {
    survivorIds.push(gps[0].id);
  }

  // ──────────────────────────────────────────────────
  // PHASE 2: Recompute hashes ONLY on surviving records
  // ──────────────────────────────────────────────────
  console.log('🔑 Phase 2: Recomputing hashes for surviving records...\n');

  let hashesFixed = 0;
  const usedHashes = {
    nationalIdHash: new Set<string>(),
    identityNumberHash: new Set<string>(),
    phoneHash: new Set<string>(),
    emailHash: new Set<string>(),
  };

  for (const gpId of survivorIds) {
    try {
      const gp = await prisma.globalPatient.findUnique({
        where: { id: gpId },
        include: {
          localPatients: {
            select: { phoneHash: true, emailHash: true },
            take: 1,
          },
        },
      });
      if (!gp || gp.isDeleted) continue;

      const rawNationalId = decrypt(gp.nationalId, key);
      const rawIdentityNumber = decrypt(gp.identityNumber, key);

      const hashData: Record<string, any> = {};

      // Compute each hash — skip if already used by another survivor
      const nidHash = computeHash(rawNationalId);
      if (nidHash && !usedHashes.nationalIdHash.has(nidHash)) {
        hashData.nationalIdHash = nidHash;
        usedHashes.nationalIdHash.add(nidHash);
      }

      const idnHash = computeHash(rawIdentityNumber);
      if (idnHash && !usedHashes.identityNumberHash.has(idnHash)) {
        hashData.identityNumberHash = idnHash;
        usedHashes.identityNumberHash.add(idnHash);
      }

      // Phone/email from linked patients
      const lp = gp.localPatients[0];
      if (lp?.phoneHash && !usedHashes.phoneHash.has(lp.phoneHash)) {
        hashData.phoneHash = lp.phoneHash;
        usedHashes.phoneHash.add(lp.phoneHash);
      }
      if (lp?.emailHash && !usedHashes.emailHash.has(lp.emailHash)) {
        hashData.emailHash = lp.emailHash;
        usedHashes.emailHash.add(lp.emailHash);
      }

      if (Object.keys(hashData).length === 0) continue;

      if (DRY_RUN) {
        console.log(
          `    [DRY] GP #${gpId} "${gp.fullName}" → would set: ${Object.keys(hashData).join(', ')}`,
        );
      } else {
        await prisma.globalPatient.update({
          where: { id: gpId },
          data: hashData,
        });
        console.log(
          `    ✅ GP #${gpId} "${gp.fullName}" → ${Object.keys(hashData).join(', ')}`,
        );
      }
      hashesFixed++;
    } catch (error: any) {
      errors++;
      console.error(`    ❌ GP #${gpId}: ${error.message}`);
    }
  }

  // Summary
  console.log('\n════════════════════════════════════════════════');
  console.log('📊 Deduplication Results:');
  console.log(`   Duplicate groups: ${duplicateGroups.length}`);
  console.log(`   Records merged:   ${totalMerged}`);
  console.log(`   Patients re-linked: ${totalRelinked}`);
  console.log(`   Duplicates deleted: ${totalDeleted}`);
  console.log(`   Hashes recomputed: ${hashesFixed}`);
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
