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
        // ✅ فك التشفير عند الاستعلام (findFirst)
        async findFirst({ args, query }) {
          const result = await query(args);
          return handleDecryption(result);
        },
        // ✅ فك التشفير عند الاستعلام (findMany)
        async findMany({ args, query }) {
          const result = await query(args);
          // console.log('🔓 Decrypting findMany results...'); // سطر للتأكد من العمل
          return handleDecryption(result);
        },
        // ✅ فك التشفير عند الاستعلام (findUnique)
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

// // src/prisma/prisma.extension.ts

// import { PrismaClient } from '@prisma/client';
// import { encrypt, decrypt } from '../common/utils/encryption.util';
// import { createHash } from 'crypto';

// const PATIENT_SENSITIVE_FIELDS = [
//   'nationalId',
//   'phone',
//   'email',
//   'address',
//   'motherName',
//   'familyBooklet',
//   'familySheet',
//   'registryNumber',
//   'identityNumber',
// ];

// const generateSearchHash = (value: string) =>
//   value
//     ? createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
//     : null;

// // دالة مساعدة لفك تشفير مريض واحد أو قائمة مرضى
// const decryptPatient = (patient: any) => {
//   if (!patient) return patient;
//   PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//     if (patient[field]) {
//       patient[field] = decrypt(patient[field]);
//     }
//   });
//   return patient;
// };

// export const extendedPrisma = (prisma: PrismaClient) => {
//   return prisma.$extends({
//     query: {
//       patient: {
//         async create({ args, query }) {
//           const data = args.data as any;
//           if (data.phone) data.phoneHash = generateSearchHash(data.phone);
//           if (data.email) data.emailHash = generateSearchHash(data.email);
//           if (data.mrn) data.mrnHash = generateSearchHash(data.mrn);

//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//         async update({ args, query }) {
//           const data = args.data as any;
//           if (data.phone) data.phoneHash = generateSearchHash(data.phone);
//           if (data.email) data.emailHash = generateSearchHash(data.email);

//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//         // ✅ فك التشفير عند جلب مريض واحد
//         async findFirst({ args, query }) {
//           const result = await query(args);
//           return decryptPatient(result);
//         },
//         // ✅ فك التشفير عند جلب قائمة مرضى
//         async findMany({ args, query }) {
//           const results = await query(args);
//           if (Array.isArray(results)) {
//             return results.map((r) => decryptPatient(r));
//           }
//           return results;
//         },
//         // ✅ فك التشفير عند البحث بالمعرف الفريد
//         async findUnique({ args, query }) {
//           const result = await query(args);
//           return decryptPatient(result);
//         },
//       },
//       // الحذف الناعم لبقية الموديلات
//       $allModels: {
//         async delete({ model, args, query }) {
//           return (prisma as any)[model].update({
//             ...args,
//             data: { isDeleted: true, deletedAt: new Date() },
//           });
//         },
//         async findMany({ args, query, model }) {
//           if (model === 'Patient') return query(args); // تجاوزنا المريض لأننا عالجناه بالأعلى
//           const a = args as any;
//           a.where = a.where || {};
//           if (a.where.isDeleted === undefined) a.where.isDeleted = false;
//           return query(a);
//         },
//       },
//     },
//   });
// };

// import { PrismaClient } from '@prisma/client';
// import { encrypt, decrypt } from '../common/utils/encryption.util';
// import { createHash } from 'crypto';

// const PATIENT_SENSITIVE_FIELDS = [
//   'nationalId',
//   'phone',
//   'email',
//   'address',
//   'motherName',
//   'familyBooklet',
//   'familySheet',
//   'registryNumber',
//   'identityNumber',
// ];

// const generateSearchHash = (value: string) =>
//   value
//     ? createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
//     : null;

// export const extendedPrisma = (prisma: PrismaClient) => {
//   return prisma.$extends({
//     query: {
//       patient: {
//         async create({ args, query }) {
//           const data = args.data as any;
//           if (data.phone) data.phoneHash = generateSearchHash(data.phone);
//           if (data.email) data.emailHash = generateSearchHash(data.email);
//           if (data.mrn) data.mrnHash = generateSearchHash(data.mrn);

//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//         async update({ args, query }) {
//           const data = args.data as any;
//           if (data.phone) data.phoneHash = generateSearchHash(data.phone);
//           if (data.email) data.emailHash = generateSearchHash(data.email);

//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//       },
//       $allModels: {
//         async delete({ model, args, query }) {
//           return (prisma as any)[model].update({
//             ...args,
//             data: { isDeleted: true, deletedAt: new Date() },
//           });
//         },
//         async deleteMany({ model, args, query }) {
//           return (prisma as any)[model].updateMany({
//             ...args,
//             data: { isDeleted: true, deletedAt: new Date() },
//           });
//         },
//         // ✅ تم حل مشكلة TS2339 هنا باستخدام (args as any)
//         async findMany({ args, query }) {
//           const a = args as any;
//           a.where = a.where || {};
//           if (a.where.isDeleted === undefined) {
//             a.where.isDeleted = false;
//           }
//           return query(a);
//         },
//         // ✅ تم حل مشكلة TS2339 هنا أيضاً باستخدام (args as any)
//         async findFirst({ args, query }) {
//           const a = args as any;
//           a.where = a.where || {};
//           if (a.where.isDeleted === undefined) {
//             a.where.isDeleted = false;
//           }
//           return query(a);
//         },
//         async findUnique({ args, query }) {
//           return query(args);
//         },
//       },
//     },
//     result: {
//       patient: {
//         nationalId: {
//           needs: { nationalId: true },
//           compute(p: any) {
//             return p.nationalId ? decrypt(p.nationalId) : null;
//           },
//         },
//         phone: {
//           needs: { phone: true },
//           compute(p: any) {
//             return p.phone ? decrypt(p.phone) : null;
//           },
//         },
//         email: {
//           needs: { email: true },
//           compute(p: any) {
//             return p.email ? decrypt(p.email) : null;
//           },
//         },
//         address: {
//           needs: { address: true },
//           compute(p: any) {
//             return p.address ? decrypt(p.address) : null;
//           },
//         },
//         motherName: {
//           needs: { motherName: true },
//           compute(p: any) {
//             return p.motherName ? decrypt(p.motherName) : null;
//           },
//         },
//         familyBooklet: {
//           needs: { familyBooklet: true },
//           compute(p: any) {
//             return p.familyBooklet ? decrypt(p.familyBooklet) : null;
//           },
//         },
//         familySheet: {
//           needs: { familySheet: true },
//           compute(p: any) {
//             return p.familySheet ? decrypt(p.familySheet) : null;
//           },
//         },
//         registryNumber: {
//           needs: { registryNumber: true },
//           compute(p: any) {
//             return p.registryNumber ? decrypt(p.registryNumber) : null;
//           },
//         },
//         identityNumber: {
//           needs: { identityNumber: true },
//           compute(p: any) {
//             return p.identityNumber ? decrypt(p.identityNumber) : null;
//           },
//         },
//       } as any,
//     },
//   });
// };

// import { PrismaClient } from '@prisma/client';
// import { encrypt, decrypt } from '../common/utils/encryption.util';
// import { createHash } from 'crypto';

// const PATIENT_SENSITIVE_FIELDS = [
//   'nationalId',
//   'phone',
//   'email',
//   'address',
//   'motherName',
//   'familyBooklet',
//   'familySheet',
//   'registryNumber',
//   'identityNumber',
// ];

// const generateSearchHash = (value: string) =>
//   value
//     ? createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
//     : null;

// export const extendedPrisma = (prisma: PrismaClient) => {
//   return prisma.$extends({
//     query: {
//       patient: {
//         async create({ args, query }) {
//           const data = args.data as any;
//           if (data.phone) data.phoneHash = generateSearchHash(data.phone);
//           if (data.email) data.emailHash = generateSearchHash(data.email);
//           if (data.mrn) data.mrnHash = generateSearchHash(data.mrn);

//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//         async update({ args, query }) {
//           const data = args.data as any;
//           if (data.phone) data.phoneHash = generateSearchHash(data.phone);
//           if (data.email) data.emailHash = generateSearchHash(data.email);

//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//       },
//       $allModels: {
//         async delete({ model, args }) {
//           return (prisma as any)[model].update({
//             ...args,
//             data: { isDeleted: true, deletedAt: new Date() },
//           });
//         },
//         async deleteMany({ model, args }) {
//           return (prisma as any)[model].updateMany({
//             ...args,
//             data: { isDeleted: true, deletedAt: new Date() },
//           });
//         },
//         async findMany({ model, args }) {
//           const queryArgs = args as any;
//           if (queryArgs.where && queryArgs.where.isDeleted === undefined) {
//             queryArgs.where.isDeleted = false;
//           } else if (!queryArgs.where) {
//             queryArgs.where = { isDeleted: false };
//           }
//           return (prisma as any)[model].findMany(queryArgs);
//         },
//         async findFirst({ model, args }) {
//           const queryArgs = args as any;
//           if (queryArgs.where && queryArgs.where.isDeleted === undefined) {
//             queryArgs.where.isDeleted = false;
//           } else if (!queryArgs.where) {
//             queryArgs.where = { isDeleted: false };
//           }
//           return (prisma as any)[model].findFirst(queryArgs);
//         },
//       },
//     },
//     // تم إصلاح التعيين هنا لإرضاء TypeScript
//     result: {
//       patient: {
//         nationalId: {
//           needs: { nationalId: true },
//           compute(p: any) {
//             return p.nationalId ? decrypt(p.nationalId) : null;
//           },
//         },
//         phone: {
//           needs: { phone: true },
//           compute(p: any) {
//             return p.phone ? decrypt(p.phone) : null;
//           },
//         },
//         email: {
//           needs: { email: true },
//           compute(p: any) {
//             return p.email ? decrypt(p.email) : null;
//           },
//         },
//         address: {
//           needs: { address: true },
//           compute(p: any) {
//             return p.address ? decrypt(p.address) : null;
//           },
//         },
//         motherName: {
//           needs: { motherName: true },
//           compute(p: any) {
//             return p.motherName ? decrypt(p.motherName) : null;
//           },
//         },
//         familyBooklet: {
//           needs: { familyBooklet: true },
//           compute(p: any) {
//             return p.familyBooklet ? decrypt(p.familyBooklet) : null;
//           },
//         },
//         familySheet: {
//           needs: { familySheet: true },
//           compute(p: any) {
//             return p.familySheet ? decrypt(p.familySheet) : null;
//           },
//         },
//         registryNumber: {
//           needs: { registryNumber: true },
//           compute(p: any) {
//             return p.registryNumber ? decrypt(p.registryNumber) : null;
//           },
//         },
//         identityNumber: {
//           needs: { identityNumber: true },
//           compute(p: any) {
//             return p.identityNumber ? decrypt(p.identityNumber) : null;
//           },
//         },
//       } as any,
//     },
//   });
// };

// import { PrismaClient } from '@prisma/client';
// import { encrypt, decrypt } from '../common/utils/encryption.util';

// // الحقول التي نريد تشفيرها في جدول المريض
// const PATIENT_SENSITIVE_FIELDS = ['nationalId', 'phone', 'email', 'address'];

// export const extendedPrisma = (prisma: PrismaClient) => {
//   return prisma.$extends({
//     query: {
//       // --- أولاً: التشفير عند الإضافة والتعديل ---
//       patient: {
//         async create({ args, query }) {
//           const data = args.data as any;
//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//         async update({ args, query }) {
//           const data = args.data as any;
//           PATIENT_SENSITIVE_FIELDS.forEach((field) => {
//             if (data[field]) data[field] = encrypt(data[field]);
//           });
//           return query(args);
//         },
//       },

//       // --- ثانياً: منطق الحذف الناعم لكل الموديلات (من كودك الأصلي) ---
//       $allModels: {
//         async delete({ model, args }) {
//           return (prisma as any)[model].update({
//             ...args,
//             data: {
//               isDeleted: true,
//               deletedAt: new Date(),
//             },
//           });
//         },
//         async deleteMany({ model, args }) {
//           return (prisma as any)[model].updateMany({
//             ...args,
//             data: {
//               isDeleted: true,
//               deletedAt: new Date(),
//             },
//           });
//         },
//         async findMany({ model, args }) {
//           const queryArgs = args as any;
//           if (queryArgs.where) {
//             if (queryArgs.where.isDeleted === undefined) {
//               queryArgs.where.isDeleted = false;
//             }
//           } else {
//             queryArgs.where = { isDeleted: false };
//           }
//           return (prisma as any)[model].findMany(queryArgs);
//         },
//         async findFirst({ model, args }) {
//           const queryArgs = args as any;
//           if (queryArgs.where) {
//             if (queryArgs.where.isDeleted === undefined) {
//               queryArgs.where.isDeleted = false;
//             }
//           } else {
//             queryArgs.where = { isDeleted: false };
//           }
//           return (prisma as any)[model].findFirst(queryArgs);
//         },
//       },
//     },

//     // --- ثالثاً: فك التشفير التلقائي عند القراءة ---
//     // قمنا بتعريف الحقول يدوياً هنا لحل مشكلة النوع (TypeScript Error)
//     result: {
//       patient: {
//         nationalId: {
//           needs: { nationalId: true },
//           compute(p: any) {
//             return p.nationalId ? decrypt(p.nationalId) : p.nationalId;
//           },
//         },
//         phone: {
//           needs: { phone: true },
//           compute(p: any) {
//             return p.phone ? decrypt(p.phone) : p.phone;
//           },
//         },
//         email: {
//           needs: { email: true },
//           compute(p: any) {
//             return p.email ? decrypt(p.email) : p.email;
//           },
//         },
//         address: {
//           needs: { address: true },
//           compute(p: any) {
//             return p.address ? decrypt(p.address) : p.address;
//           },
//         },
//       },
//     },
//   });
// };

// import { PrismaClient } from '@prisma/client';

// export const extendedPrisma = (prisma: PrismaClient) => {
//   return prisma.$extends({
//     query: {
//       $allModels: {
//         async delete({ model, args }) {
//           // التحقق من أن النموذج يدعم الحذف الناعم (يحتوي على isDeleted)
//           // هذا يتم عبر الـ generic args، نستخدم casting لتجاوز خطأ TS
//           return (prisma as any)[model].update({
//             ...args,
//             data: {
//               isDeleted: true,
//               deletedAt: new Date(),
//             },
//           });
//         },
//         async deleteMany({ model, args }) {
//           return (prisma as any)[model].updateMany({
//             ...args,
//             data: {
//               isDeleted: true,
//               deletedAt: new Date(),
//             },
//           });
//         },
//         async findMany({ model, args }) {
//           // تجاوز تدقيق الأنواع هنا لأننا نعلم أن النماذج المستهدفة تملك الحقل
//           const queryArgs = args as any;

//           if (queryArgs.where) {
//             if (queryArgs.where.isDeleted === undefined) {
//               // نفترض أن الحقل موجود، إذا لم يكن موجوداً Prisma ستهمل هذا الشرط في النماذج التي لا تملكه
//               queryArgs.where.isDeleted = false;
//             }
//           } else {
//             queryArgs.where = { isDeleted: false };
//           }
//           return (prisma as any)[model].findMany(queryArgs);
//         },
//         async findFirst({ model, args }) {
//           const queryArgs = args as any;

//           if (queryArgs.where) {
//             if (queryArgs.where.isDeleted === undefined) {
//               queryArgs.where.isDeleted = false;
//             }
//           } else {
//             queryArgs.where = { isDeleted: false };
//           }
//           return (prisma as any)[model].findFirst(queryArgs);
//         },
//       },
//     },
//   });
// };
