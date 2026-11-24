import { AsyncLocalStorage } from 'node:async_hooks';
import { appendChainedAudit, sanitizeAuditData } from '../audit/audit-chain';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { siemLogger } from '../audit/siem.logger';
import { applyTenantPolicy } from './prisma.extension';

export interface DeferredAuditItem {
  level: 'info' | 'warn';
  payload: Prisma.AuditLogUncheckedCreateInput;
}

export interface ActiveAuditTxContext {
  deferredAudits: DeferredAuditItem[];
}

export const activeAuditTxStorage =
  new AsyncLocalStorage<ActiveAuditTxContext>();

function emitOrDeferAudit(
  rootPrisma: any,
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

export const auditExtension = (cls: ClsService, rootPrisma: any) => {
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

          const result = await query(args);

          const userId = cls.isActive() ? cls.get('userId') : null;
          const hospitalId = cls.isActive() ? cls.get('hospitalId') : null;
          const ipAddress = cls.isActive() ? cls.get('ipAddress') : null;

          if (userId) {
            const auditPayload: Prisma.AuditLogUncheckedCreateInput = {
              userId,
              hospitalId,
              action: 'CREATE',
              entity: model,
              entityId:
                'id' in result && typeof result.id === 'number'
                  ? result.id
                  : null,
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
          let originalRecord = null;
          if (!inInteractiveTx) {
            try {
              if (args.where && 'id' in args.where && args.where.id) {
                const lookupArgs = applyTenantPolicy(model, 'findUnique', {
                  where: { ...args.where },
                });
                originalRecord =
                  await rootPrisma[
                    model[0].toLowerCase() + model.slice(1)
                  ].findUnique(lookupArgs);
              }
            } catch (e) {
              // Safe fallback
            }
          }

          const result = await query(args);

          const userId = cls.isActive() ? cls.get('userId') : null;
          const hospitalId = cls.isActive() ? cls.get('hospitalId') : null;
          const ipAddress = cls.isActive() ? cls.get('ipAddress') : null;

          if (userId && (originalRecord || inInteractiveTx)) {
            const changedValues: any = {};
            const oldValues: any = {};
            const newData: any = args.data;

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
              entityId:
                'id' in result && typeof result.id === 'number'
                  ? result.id
                  : null,
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
          let originalRecord = null;
          if (!inInteractiveTx) {
            try {
              const lookupArgs = applyTenantPolicy(model, 'findUnique', {
                where: { ...args.where },
              });
              originalRecord =
                await rootPrisma[
                  model[0].toLowerCase() + model.slice(1)
                ].findUnique(lookupArgs);
            } catch (e) {}
          }

          const result = await query(args);

          const userId = cls.isActive() ? cls.get('userId') : null;
          const hospitalId = cls.isActive() ? cls.get('hospitalId') : null;
          const ipAddress = cls.isActive() ? cls.get('ipAddress') : null;

          const deletedSnapshot = originalRecord ?? result;
          if (userId && deletedSnapshot) {
            const auditPayload: Prisma.AuditLogUncheckedCreateInput = {
              userId,
              hospitalId,
              action: 'DELETE',
              entity: model,
              entityId:
                'id' in result && typeof result.id === 'number'
                  ? result.id
                  : null,
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
