import { AsyncLocalStorage } from 'node:async_hooks';
import { appendChainedAudit, sanitizeAuditData } from '../audit/audit-chain';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { siemLogger } from '../audit/siem.logger';
import { applyTenantPolicy, type TenantQueryArgs } from './prisma.extension';

export interface DeferredAuditItem {
  level: 'info' | 'warn';
  payload: Prisma.AuditLogUncheckedCreateInput;
}

export interface ActiveAuditTxContext {
  deferredAudits: DeferredAuditItem[];
}

export const activeAuditTxStorage =
  new AsyncLocalStorage<ActiveAuditTxContext>();

interface AuditLookupDelegate {
  findUnique?: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
}

function getClsAuditContext(cls: ClsService): {
  userId: number | null;
  hospitalId: number | null;
  ipAddress: string | null;
} {
  if (!cls.isActive()) {
    return { userId: null, hospitalId: null, ipAddress: null };
  }
  const rawUserId = cls.get<unknown>('userId');
  const rawHospitalId = cls.get<unknown>('hospitalId');
  const rawIpAddress = cls.get<unknown>('ipAddress');
  return {
    userId: typeof rawUserId === 'number' ? rawUserId : null,
    hospitalId: typeof rawHospitalId === 'number' ? rawHospitalId : null,
    ipAddress: typeof rawIpAddress === 'string' ? rawIpAddress : null,
  };
}

function extractEntityId(result: unknown): number | null {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id: unknown }).id;
    return typeof id === 'number' ? id : null;
  }
  return null;
}

function emitOrDeferAudit(
  rootPrisma: PrismaClient,
  level: 'info' | 'warn',
  payload: Prisma.AuditLogUncheckedCreateInput,
) {
  const txContext = activeAuditTxStorage.getStore();
  if (txContext) {
    txContext.deferredAudits.push({ level, payload });
    return;
  }
  if (level === 'warn') {
    siemLogger.warn({ message: 'AUDIT_TRAIL', ...payload });
  } else {
    siemLogger.info({ message: 'AUDIT_TRAIL', ...payload });
  }
  void appendChainedAudit(rootPrisma, payload).catch(console.error);
}

// List of tables to skip auditing
// Recall workflows write their own audit events inside the business transaction.
const SKIP_MODELS = [
  'AuditLog',
  'Session',
  'RefreshToken',
  'StaffSession',
  'SystemSetting',
  'InventoryRecallContact',
  'InventoryRecallSupplierReceipt',
  'InventoryRecallDisposal',
  'InventoryRecallDisposalInvestigation',
];

export const auditExtension = (cls: ClsService, rootPrisma: PrismaClient) => {
  const dynamicDelegates = rootPrisma as unknown as Record<
    string,
    AuditLookupDelegate | undefined
  >;

  const findOriginal = async (
    model: string,
    where: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    const delegateKey = model[0].toLowerCase() + model.slice(1);
    const delegate = dynamicDelegates[delegateKey];
    if (!delegate?.findUnique) return null;
    const lookupArgs = applyTenantPolicy(model, 'findUnique', {
      where: { ...where },
    } as TenantQueryArgs);
    return delegate.findUnique(lookupArgs);
  };

  return Prisma.defineExtension({
    name: 'AuditExtension',
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);
          const data = args.data as Record<string, unknown>;
          if (
            // The clinical endpoint appends its audit row in the same transaction.
            (model === 'VitalSign' &&
              Object.hasOwn(data, 'requestFingerprint')) ||
            (model === 'MedicationAdministration' &&
              typeof data.requestKey === 'string' &&
              data.requestKey.startsWith('medication:')) ||
            (model === 'StockTransaction' &&
              data.referenceType === 'RECALL_DISPOSAL') ||
            (model === 'AccountingEntry' &&
              typeof data.postingKey === 'string' &&
              data.postingKey.startsWith('recall-disposal:'))
          )
            return query(args);

          const result: unknown = await query(args);
          const { userId, hospitalId, ipAddress } = getClsAuditContext(cls);

          if (userId) {
            const auditPayload: Prisma.AuditLogUncheckedCreateInput = {
              userId,
              hospitalId,
              action: 'CREATE',
              entity: model,
              entityId: extractEntityId(result),
              ipAddress,
              newValues: sanitizeAuditData(args.data) as Prisma.InputJsonObject,
            };

            emitOrDeferAudit(rootPrisma, 'info', auditPayload);
          }

          return result;
        },

        async update({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);

          const inInteractiveTx = Boolean(activeAuditTxStorage.getStore());

          // Never acquire a second pool connection while inside an interactive
          // transaction (prevents connection-pool starvation deadlocks on small pools).
          let originalRecord: Record<string, unknown> | null = null;
          if (!inInteractiveTx) {
            try {
              const where = args.where as Record<string, unknown> | undefined;
              if (where && 'id' in where && where.id) {
                originalRecord = await findOriginal(model, where);
              }
            } catch {
              // Safe fallback
            }
          }

          const result: unknown = await query(args);
          const { userId, hospitalId, ipAddress } = getClsAuditContext(cls);

          if (userId && (originalRecord || inInteractiveTx)) {
            const changedValues: Record<string, unknown> = {};
            const oldValues: Record<string, unknown> = {};
            const newData = args.data as Record<string, unknown>;

            if (originalRecord) {
              for (const key in newData) {
                if (newData[key] !== originalRecord[key]) {
                  changedValues[key] = newData[key];
                  oldValues[key] = originalRecord[key];
                }
              }
            }

            const auditPayload: Prisma.AuditLogUncheckedCreateInput = {
              userId,
              hospitalId,
              action: 'UPDATE',
              entity: model,
              entityId: extractEntityId(result),
              ipAddress,
              ...(originalRecord
                ? {
                    oldValues: sanitizeAuditData(
                      oldValues,
                    ) as Prisma.InputJsonObject,
                    newValues: sanitizeAuditData(
                      changedValues,
                    ) as Prisma.InputJsonObject,
                  }
                : {
                    newValues: sanitizeAuditData(
                      newData,
                    ) as Prisma.InputJsonObject,
                  }),
            };

            emitOrDeferAudit(rootPrisma, 'info', auditPayload);
          }

          return result;
        },

        async delete({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);

          const inInteractiveTx = Boolean(activeAuditTxStorage.getStore());
          let originalRecord: Record<string, unknown> | null = null;
          if (!inInteractiveTx) {
            try {
              const where = args.where as Record<string, unknown> | undefined;
              if (where) {
                originalRecord = await findOriginal(model, where);
              }
            } catch {
              // Safe fallback
            }
          }

          const result: unknown = await query(args);
          const { userId, hospitalId, ipAddress } = getClsAuditContext(cls);

          const deletedSnapshot = originalRecord ?? result;
          if (userId && deletedSnapshot) {
            const auditPayload: Prisma.AuditLogUncheckedCreateInput = {
              userId,
              hospitalId,
              action: 'DELETE',
              entity: model,
              entityId: extractEntityId(result),
              ipAddress,
              oldValues: sanitizeAuditData(
                deletedSnapshot,
              ) as Prisma.InputJsonObject,
            };

            emitOrDeferAudit(rootPrisma, 'warn', auditPayload);
          }

          return result;
        },
      },
    },
  });
};
