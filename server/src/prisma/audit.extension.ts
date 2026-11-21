import { appendChainedAudit, sanitizeAuditData } from '../audit/audit-chain';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { siemLogger } from '../audit/siem.logger';
import { applyTenantPolicy } from './prisma.extension';

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
            const auditPayload = {
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

            // 1- SIEM Logger (Stream to Console for Promtail)
            siemLogger.info({
              message: 'AUDIT_TRAIL',
              ...auditPayload,
            });

            // 2- Save audit log asynchronously
            void appendChainedAudit(rootPrisma, auditPayload).catch(
              console.error,
            );
          }

          return result;
        },

        async update({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);

          // Get the original record before update
          let originalRecord = null;
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

          const result = await query(args);

          const userId = cls.isActive() ? cls.get('userId') : null;
          const hospitalId = cls.isActive() ? cls.get('hospitalId') : null;
          const ipAddress = cls.isActive() ? cls.get('ipAddress') : null;

          if (userId && originalRecord) {
            // Compute simple differences (you can use a deep diff algorithm if needed)
            const changedValues: any = {};
            const oldValues: any = {};
            const newData: any = args.data;

            for (const key in newData) {
              // Basic shallow diff or just store the incoming payload
              if (newData[key] !== originalRecord[key]) {
                changedValues[key] = newData[key];
                oldValues[key] = originalRecord[key];
              }
            }

            const auditPayload = {
              userId,
              hospitalId,
              action: 'UPDATE',
              entity: model,
              entityId:
                'id' in result && typeof result.id === 'number'
                  ? result.id
                  : null,
              ipAddress,
              oldValues: sanitizeAuditData(oldValues) as Prisma.InputJsonObject,
              newValues: sanitizeAuditData(
                changedValues,
              ) as Prisma.InputJsonObject, // Store exactly what changed
            };

            // 1- SIEM Logger
            siemLogger.info({
              message: 'AUDIT_TRAIL',
              ...auditPayload,
            });

            void appendChainedAudit(rootPrisma, auditPayload).catch(
              console.error,
            );
          }

          return result;
        },

        async delete({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);

          let originalRecord = null;
          try {
            const lookupArgs = applyTenantPolicy(model, 'findUnique', {
              where: { ...args.where },
            });
            originalRecord =
              await rootPrisma[
                model[0].toLowerCase() + model.slice(1)
              ].findUnique(lookupArgs);
          } catch (e) {}

          const result = await query(args);

          const userId = cls.isActive() ? cls.get('userId') : null;
          const hospitalId = cls.isActive() ? cls.get('hospitalId') : null;
          const ipAddress = cls.isActive() ? cls.get('ipAddress') : null;

          if (userId && originalRecord) {
            const auditPayload = {
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
                originalRecord,
              ) as Prisma.InputJsonObject,
            };

            // 1- SIEM Logger
            siemLogger.warn({
              message: 'AUDIT_TRAIL',
              ...auditPayload,
            });

            void appendChainedAudit(rootPrisma, auditPayload).catch(
              console.error,
            );
          }

          return result;
        },
      },
    },
  });
};
