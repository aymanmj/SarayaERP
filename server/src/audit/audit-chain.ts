import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

const pendingWrites = new Set<Promise<unknown>>();
let auditWriteTail: Promise<void> = Promise.resolve();

export async function drainPendingAuditWrites(): Promise<void> {
  while (pendingWrites.size) {
    await Promise.allSettled([...pendingWrites]);
  }
}

const SENSITIVE_KEY =
  /password|secret|token|authorization|cookie|nationalId|phone|email|address|mfaSecret|motherName|familyBooklet|familySheet|registryNumber|identityNumber|clinicalNotes|symptoms/i;

export function sanitizeAuditData(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (typeof value === 'object') {
    if (Prisma.Decimal.isDecimal(value)) return value.toString();
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeAuditData(child),
      ]),
    );
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export type ChainedAuditRecord = {
  previousHash: string | null;
  hospitalId?: number | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  userId?: number | null;
  createdAt: Date;
  details?: unknown;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  clientName?: string | null;
};

export function auditRecordHash(record: ChainedAuditRecord): string {
  const details = record.details as
    | { _chainVersion?: number }
    | null
    | undefined;
  const text =
    details?._chainVersion === 2
      ? canonical({ ...record, createdAt: record.createdAt.toISOString() })
      : `${record.previousHash}|${record.action}|${record.entity || ''}|${record.entityId || ''}|${record.userId || ''}|${record.createdAt.toISOString()}`;
  return createHash('sha256').update(text).digest('hex');
}

/** One writer contract for HTTP audit and Prisma mutation audit, serialized in PostgreSQL. */
export async function appendChainedAuditInTransaction(
  tx: Prisma.TransactionClient,
  data: Prisma.AuditLogUncheckedCreateInput,
) {
  const hospitalId = data.hospitalId ?? null;
  const hospitalKey = Number.isInteger(hospitalId) ? Number(hospitalId) : 0;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27001, CAST(${hospitalKey} AS INTEGER))`;
  const last = await tx.auditLog.findFirst({
    where: { hospitalId, hash: { not: null } },
    orderBy: { id: 'desc' },
    select: { hash: true },
  });
  const createdAt = new Date();
  const previousHash = last?.hash || 'GENESIS';
  const oldValues = sanitizeAuditData(data.oldValues);
  const newValues = sanitizeAuditData(data.newValues);
  const details = {
    _chainVersion: 2,
    payload: sanitizeAuditData(data.details),
  };
  const signed: ChainedAuditRecord = {
    previousHash,
    hospitalId,
    createdAt,
    action: data.action,
    entity: data.entity ?? null,
    entityId: data.entityId ?? null,
    userId: data.userId ?? null,
    ipAddress: data.ipAddress ?? null,
    clientName: data.clientName ?? null,
    oldValues,
    newValues,
    details,
  };
  return tx.auditLog.create({
    data: {
      ...data,
      createdAt,
      previousHash,
      hospitalId,
      hash: auditRecordHash(signed),
      details: details as Prisma.InputJsonObject,
      oldValues:
        oldValues === null
          ? Prisma.JsonNull
          : (oldValues as Prisma.InputJsonValue),
      newValues:
        newValues === null
          ? Prisma.JsonNull
          : (newValues as Prisma.InputJsonValue),
    },
  });
}

export function appendChainedAudit(
  prisma: Pick<PrismaClient, '$transaction'>,
  data: Prisma.AuditLogUncheckedCreateInput,
) {
  // Serialize background audit writes in-process so they never consume more than
  // 1 DB pool connection while contending for pg_advisory_xact_lock(27001).
  const pending = auditWriteTail.then(() =>
    prisma.$transaction((tx) => appendChainedAuditInTransaction(tx, data)),
  );
  auditWriteTail = pending.then(
    () => undefined,
    () => undefined,
  );
  pendingWrites.add(pending);
  void pending.then(
    () => pendingWrites.delete(pending),
    () => pendingWrites.delete(pending),
  );
  return pending;
}
