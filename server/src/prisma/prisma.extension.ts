import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../common/utils/encryption.util';
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
function handleDecryption(data: any) {
  if (!data) return data;

  const decryptObject = (obj: any) => {
    for (const field of PATIENT_SENSITIVE_FIELDS) {
      if (
        obj[field] &&
        typeof obj[field] === 'string' &&
        obj[field].includes(':')
      ) {
        obj[field] = decrypt(obj[field]);
      }
    }
    return obj;
  };

  if (Array.isArray(data)) {
    return data.map((item) => decryptObject(item));
  }
  return decryptObject(data);
}

export const extendedPrisma = (prisma: PrismaClient) => {
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
            if (data[field]) data[field] = encrypt(data[field]);
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
            if (data[field]) data[field] = encrypt(data[field]);
          });
          return query(args);
        },
        // فك التشفير عند الاستعلام (findFirst)
        async findFirst({ args, query }) {
          const result = await query(args);
          return handleDecryption(result);
        },
        // فك التشفير عند الاستعلام (findMany)
        async findMany({ args, query }) {
          const result = await query(args);
          return handleDecryption(result);
        },
        // فك التشفير عند الاستعلام (findUnique)
        async findUnique({ args, query }) {
          const result = await query(args);
          return handleDecryption(result);
        },
      },
      // منطق الحذف الناعم لباقي الموديلات
      $allModels: {
        async delete({ model, args, query }) {
          return (prisma as any)[model].update({
            ...args,
            data: { isDeleted: true, deletedAt: new Date() },
          });
        },
        async deleteMany({ model, args, query }) {
          return (prisma as any)[model].updateMany({
            ...args,
            data: { isDeleted: true, deletedAt: new Date() },
          });
        },
        async findMany({ model, args, query }) {
          if (model === 'Patient') return query(args); // المريض معالج بالأعلى
          const a = args as any;
          a.where = a.where || {};
          if (a.where.isDeleted === undefined) a.where.isDeleted = false;
          return query(a);
        },
        async findFirst({ model, args, query }) {
          if (model === 'Patient') return query(args); // المريض معالج بالأعلى
          const a = args as any;
          a.where = a.where || {};
          if (a.where.isDeleted === undefined) a.where.isDeleted = false;
          return query(a);
        },
      },
    },
  });
};
