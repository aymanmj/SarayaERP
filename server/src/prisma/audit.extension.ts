import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

// List of tables to skip auditing
const SKIP_MODELS = ['AuditLog', 'Session', 'SystemSetting'];

export const auditExtension = (cls: ClsService, rootPrisma: any) => {
  return Prisma.defineExtension({
    name: 'AuditExtension',
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);

          const result = await query(args);

          const userId = cls.isActive() ? cls.get('userId') : null;
          const hospitalId = cls.isActive() ? cls.get('hospitalId') : null;
          const ipAddress = cls.isActive() ? cls.get('ipAddress') : null;

          if (userId) {
            // Save audit log asynchronously
            rootPrisma.auditLog.create({
              data: {
                userId,
                hospitalId,
                action: 'CREATE',
                entity: model,
                entityId: result.id || null,
                ipAddress,
                newValues: args.data as any,
              },
            }).catch(console.error);
          }

          return result;
        },

        async update({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);

          // Get the original record before update
          let originalRecord = null;
          try {
            if (args.where?.id) {
              originalRecord = await rootPrisma[model].findUnique({ where: args.where });
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

            rootPrisma.auditLog.create({
              data: {
                userId,
                hospitalId,
                action: 'UPDATE',
                entity: model,
                entityId: result.id || null,
                ipAddress,
                oldValues: oldValues,
                newValues: changedValues, // Store exactly what changed
              },
            }).catch(console.error);
          }

          return result;
        },

        async delete({ model, args, query }) {
          if (SKIP_MODELS.includes(model)) return query(args);

          let originalRecord = null;
          try {
             originalRecord = await rootPrisma[model].findUnique({ where: args.where });
          } catch (e) {}

          const result = await query(args);

          const userId = cls.isActive() ? cls.get('userId') : null;
          const hospitalId = cls.isActive() ? cls.get('hospitalId') : null;
          const ipAddress = cls.isActive() ? cls.get('ipAddress') : null;

          if (userId && originalRecord) {
            rootPrisma.auditLog.create({
              data: {
                userId,
                hospitalId,
                action: 'DELETE',
                entity: model,
                entityId: result.id || null,
                ipAddress,
                oldValues: originalRecord,
              },
            }).catch(console.error);
          }

          return result;
        },
      },
    },
  });
};
