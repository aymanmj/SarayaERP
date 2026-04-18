import { PrismaClient, Prisma } from '@prisma/client';
import { EncryptionService } from '../common/encryption/encryption.service';
import { createHash } from 'crypto';

const PATIENT_SENSITIVE_FIELDS = [
  'nationalId',
  'phone',
  'email',
  'address',
  'motherName',
  'familyBooklet',
  'familySheet',
  'registryNumber',
  'identityNumber',
];

const generateSearchHash = (value: string) =>
  value
    ? createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
    : null;

/**
 * دالة مساعدة لفك تشفير الكائنات (سواء كان كائن واحد أو مصفوفة)
 */
function handleDecryption(data: any, encryptionService: EncryptionService) {
  if (!data) return data;

  const decryptObject = (obj: any) => {
    for (const field of PATIENT_SENSITIVE_FIELDS) {
      if (
        obj[field] &&
        typeof obj[field] === 'string' &&
        obj[field].includes(':')
      ) {
        obj[field] = encryptionService.decrypt(obj[field]);
      }
    }
    return obj;
  };

  if (Array.isArray(data)) {
    return data.map((item) => decryptObject(item));
  }
  return decryptObject(data);
}

// Prepare a cached Set of models that actually support soft deletes (have 'isDeleted' field)
const SOFT_DELETABLE_MODELS = new Set<string>();
if (Prisma.dmmf && Prisma.dmmf.datamodel) {
  Prisma.dmmf.datamodel.models.forEach((model) => {
    if (model.fields.some((field) => field.name === 'isDeleted')) {
      SOFT_DELETABLE_MODELS.add(model.name);
    }
  });
}

export const extendedPrisma = (prisma: PrismaClient, encryptionService: EncryptionService) => {
  return prisma.$extends({
    query: {
      patient: {
        // تشفير البيانات عند الحفظ
        async create({ args, query }) {
          const data = args.data as any;
          if (data.phone) data.phoneHash = generateSearchHash(data.phone);
          if (data.email) data.emailHash = generateSearchHash(data.email);
          if (data.mrn) data.mrnHash = generateSearchHash(data.mrn);
          if (data.nationalId)
            data.nationalIdHash = generateSearchHash(data.nationalId);
          if (data.identityNumber)
            data.identityNumberHash = generateSearchHash(data.identityNumber);

          PATIENT_SENSITIVE_FIELDS.forEach((field) => {
            if (data[field]) data[field] = encryptionService.encrypt(data[field]);
          });
          return query(args);
        },
        // تشفير البيانات عند التحديث
        async update({ args, query }) {
          const data = args.data as any;
          if (data.phone) data.phoneHash = generateSearchHash(data.phone);
          if (data.email) data.emailHash = generateSearchHash(data.email);
          if (data.nationalId)
            data.nationalIdHash = generateSearchHash(data.nationalId);
          if (data.identityNumber)
            data.identityNumberHash = generateSearchHash(data.identityNumber);

          PATIENT_SENSITIVE_FIELDS.forEach((field) => {
            if (data[field]) data[field] = encryptionService.encrypt(data[field]);
          });
          return query(args);
        },
        // فك التشفير عند الاستعلام (findFirst)
        async findFirst({ args, query }) {
          const result = await query(args);
          return handleDecryption(result, encryptionService);
        },
        // فك التشفير عند الاستعلام (findMany)
        async findMany({ args, query }) {
          const result = await query(args);
          return handleDecryption(result, encryptionService);
        },
        // فك التشفير عند الاستعلام (findUnique)
        async findUnique({ args, query }) {
          const result = await query(args);
          return handleDecryption(result, encryptionService);
        },
      },
      // منطق الحذف الناعم لباقي الموديلات
      $allModels: {
        async delete({ model, args, query }) {
          if (SOFT_DELETABLE_MODELS.has(model)) {
            return (prisma as any)[model].update({
              ...args,
              data: { isDeleted: true, ...((args as any).data || {}) },
            });
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (SOFT_DELETABLE_MODELS.has(model)) {
            return (prisma as any)[model].updateMany({
              ...args,
              data: { isDeleted: true, ...((args as any).data || {}) },
            });
          }
          return query(args);
        },
        async findMany({ model, args, query }) {
          if (model === 'Patient') return query(args); // المريض معالج بالأعلى
          const a = args as any;
          if (SOFT_DELETABLE_MODELS.has(model)) {
            a.where = a.where || {};
            if (a.where.isDeleted === undefined) a.where.isDeleted = false;
          }
          return query(a);
        },
        async findFirst({ model, args, query }) {
          if (model === 'Patient') return query(args); // المريض معالج بالأعلى
          const a = args as any;
          if (SOFT_DELETABLE_MODELS.has(model)) {
            a.where = a.where || {};
            if (a.where.isDeleted === undefined) a.where.isDeleted = false;
          }
          return query(a);
        },
      },
    },
  });
};
