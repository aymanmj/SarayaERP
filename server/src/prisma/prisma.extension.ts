import { PrismaClient, Prisma } from '@prisma/client';
import { EncryptionService } from '../common/encryption/encryption.service';
import { ClsServiceManager } from 'nestjs-cls';
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

// ============================================
// RLS: تحديد النماذج التي تملك hospitalId (للعزل التلقائي)
// ============================================
const TENANT_SCOPED_MODELS = new Set<string>();

// Prepare a cached Set of models that actually support soft deletes (have 'isDeleted' field)
const SOFT_DELETABLE_MODELS = new Set<string>();

if (Prisma.dmmf && Prisma.dmmf.datamodel) {
  Prisma.dmmf.datamodel.models.forEach((model) => {
    if (model.fields.some((field) => field.name === 'isDeleted')) {
      SOFT_DELETABLE_MODELS.add(model.name);
    }
    // RLS: أي نموذج يملك hospitalId يخضع للعزل التلقائي
    if (model.fields.some((field) => field.name === 'hospitalId')) {
      TENANT_SCOPED_MODELS.add(model.name);
    }
  });
}

/**
 * النماذج المستثناة من RLS (لا تحتاج عزل بـ hospitalId)
 * مثلاً: Organization نفسها، OrgSetting، وغيرها من النماذج العامة
 */
const RLS_EXEMPT_MODELS = new Set([
  'Organization',
  'OrgSetting',
  'Hospital',
  'RefreshToken',
  'Role',
  'Permission',
  'RolePermission',
]);

/**
 * فحص: هل النموذج يحتاج RLS (عزل بـ hospitalId)؟
 */
function needsRLS(model: string): boolean {
  return TENANT_SCOPED_MODELS.has(model) && !RLS_EXEMPT_MODELS.has(model);
}

/**
 * استخراج سياق المستأجر من CLS (AsyncLocalStorage)
 * يُستخدم من قبل Prisma Extension لحقن hospitalId تلقائياً
 * 
 * يعيد null عندما لا يوجد سياق (مثل: أثناء الهجرات، الـ seeding، أو الـ CRON)
 */
function getTenantHospitalId(): number | null {
  try {
    const cls = ClsServiceManager.getClsService();
    if (!cls) return null;
    const hospitalId = cls.get('hospitalId');
    return hospitalId ? Number(hospitalId) : null;
  } catch {
    // خارج سياق HTTP (migrations, tests, cron) — لا يوجد CLS
    return null;
  }
}

/**
 * حقن فلتر hospitalId في شرط WHERE إذا كان النموذج يخضع لـ RLS
 * 
 * القواعد:
 * 1. إذا كان الكود قد حدد hospitalId صراحةً → لا نتدخل (يحترم اختيار المطور)
 * 2. إذا لم يحدد hospitalId وكان هناك سياق مستأجر → نحقنه تلقائياً
 * 3. إذا لم يوجد سياق (migrations/cron/tests) → لا نتدخل
 */
function injectRLS(model: string, args: any): void {
  if (!needsRLS(model)) return;

  const hospitalId = getTenantHospitalId();
  if (!hospitalId) return; // لا يوجد سياق — لا تتدخل

  args.where = args.where || {};
  // لا تكتب فوق hospitalId إذا حدده المطور صراحةً
  if (args.where.hospitalId === undefined) {
    args.where.hospitalId = hospitalId;
  }
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
      // ============================================
      // RLS + Soft Delete — منطق موحد لكل النماذج
      // ============================================
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

          // ✅ RLS: حقن hospitalId تلقائياً
          injectRLS(model, a);

          // Soft Delete filter
          if (SOFT_DELETABLE_MODELS.has(model)) {
            a.where = a.where || {};
            if (a.where.isDeleted === undefined) a.where.isDeleted = false;
          }

          return query(a);
        },
        async findFirst({ model, args, query }) {
          if (model === 'Patient') return query(args); // المريض معالج بالأعلى
          const a = args as any;

          // ✅ RLS: حقن hospitalId تلقائياً
          injectRLS(model, a);

          // Soft Delete filter
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

/**
 * ✅ تصدير المعلومات للاستخدام في الاختبارات والتشخيص
 */
export { TENANT_SCOPED_MODELS, RLS_EXEMPT_MODELS, SOFT_DELETABLE_MODELS, needsRLS, getTenantHospitalId, injectRLS };
