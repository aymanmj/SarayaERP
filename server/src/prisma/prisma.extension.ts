import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { ClsServiceManager } from 'nestjs-cls';
import { EncryptionService } from '../common/encryption/encryption.service';

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

function handleDecryption<T>(data: T, encryptionService: EncryptionService): T {
  if (!data) return data;

  const decryptObject = (obj: unknown): unknown => {
    if (!obj || typeof obj !== 'object') return obj;
    const record = obj as Record<string, unknown>;
    for (const field of PATIENT_SENSITIVE_FIELDS) {
      const val = record[field];
      if (val && typeof val === 'string' && val.includes(':')) {
        record[field] = encryptionService.decrypt(val);
      }
    }
    return record;
  };

  if (Array.isArray(data)) {
    return data.map((item) => decryptObject(item)) as unknown as T;
  }

  return decryptObject(data) as T;
}

const PATIENT_RELATION_KEYS = new Set([
  'patient',
  'patients',
  'guarantor',
  'guaranteedPatients',
  'mother',
  'localPatients',
  'generatedPatient',
  'femalePatient',
  'malePatient',
  'depositPatient',
  'sourcePatient',
  'targetPatient',
  'mergedIntoPatient',
  'mergedFromPatients',
]);

function isLikelyPatientRecord(value: unknown): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    'mrn' in rec ||
    'motherId' in rec ||
    'nationalId' in rec ||
    'fullName' in rec
  );
}

/** Decrypt all Patient relations (while keeping Decimal/Date and non-patient trees untouched). */
export function decryptPatientRelations<T>(
  data: T,
  encryptionService: EncryptionService,
): T {
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (
      !value ||
      typeof value !== 'object' ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      return;
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (PATIENT_RELATION_KEYS.has(key) && child) {
        record[key] = handleDecryption(child, encryptionService);
      } else if (key === 'children' && Array.isArray(child)) {
        child.forEach((item) => {
          if (isLikelyPatientRecord(item)) {
            handleDecryption(item, encryptionService);
          }
        });
      }
      walk(record[key]);
    }
  };
  walk(data);
  return data;
}

const TENANT_SCOPED_MODELS = new Set<string>();
const SOFT_DELETABLE_MODELS = new Set<string>();

if (Prisma.dmmf && Prisma.dmmf.datamodel) {
  Prisma.dmmf.datamodel.models.forEach((model) => {
    if (model.fields.some((field) => field.name === 'isDeleted')) {
      SOFT_DELETABLE_MODELS.add(model.name);
    }

    if (model.fields.some((field) => field.name === 'hospitalId')) {
      TENANT_SCOPED_MODELS.add(model.name);
    }
  });
}

const RLS_EXEMPT_MODELS = new Set([
  'Organization',
  'OrgSetting',
  'Hospital',
  'RefreshToken',
  'Role',
  'Permission',
  'RolePermission',
]);

type TenantContext = {
  hospitalId: number | null;
  isSuperAdmin: boolean;
};

type TenantOperation =
  | 'findMany'
  | 'findFirst'
  | 'findFirstOrThrow'
  | 'findUnique'
  | 'findUniqueOrThrow'
  | 'count'
  | 'aggregate'
  | 'groupBy'
  | 'create'
  | 'createMany'
  | 'update'
  | 'updateMany'
  | 'upsert'
  | 'delete'
  | 'deleteMany';

function needsRLS(model: string): boolean {
  return TENANT_SCOPED_MODELS.has(model) && !RLS_EXEMPT_MODELS.has(model);
}

export type MutableRecord = Record<string, unknown>;

export interface TenantQueryArgs {
  where?: MutableRecord;
  data?: MutableRecord | MutableRecord[];
  create?: MutableRecord;
  update?: MutableRecord;
  [key: string]: unknown;
}

interface DynamicPrismaDelegate {
  update: (args: MutableRecord) => Promise<unknown>;
  updateMany: (args: MutableRecord) => Promise<unknown>;
}

function getDynamicDelegate(
  prisma: PrismaClient,
  model: string,
): DynamicPrismaDelegate {
  const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, DynamicPrismaDelegate>)[
    delegateKey
  ];
}

function getTenantHospitalId(): number | null {
  try {
    const cls = ClsServiceManager.getClsService();
    if (!cls) return null;

    const hospitalId = cls.get<unknown>('hospitalId');
    return typeof hospitalId === 'number' || typeof hospitalId === 'string'
      ? Number(hospitalId) || null
      : null;
  } catch {
    return null;
  }
}

function isSuperAdminContext(): boolean {
  try {
    const cls = ClsServiceManager.getClsService();
    if (!cls) return false;

    return Boolean(cls.get('isSuperAdmin'));
  } catch {
    return false;
  }
}

function getTenantContext(): TenantContext {
  return {
    hospitalId: getTenantHospitalId(),
    isSuperAdmin: isSuperAdminContext(),
  };
}

function assertTenantMatch(
  candidateHospitalId: unknown,
  context: TenantContext,
  model: string,
  source: string,
): void {
  if (
    context.isSuperAdmin ||
    !context.hospitalId ||
    candidateHospitalId === undefined
  ) {
    return;
  }

  const normalizedHospitalId = Number(candidateHospitalId);
  if (
    !Number.isFinite(normalizedHospitalId) ||
    normalizedHospitalId !== context.hospitalId
  ) {
    throw new ForbiddenException(
      `Cross-tenant access denied for ${model}.${source}`,
    );
  }
}

function enforceTenantOnWhere(
  model: string,
  args: TenantQueryArgs,
  context: TenantContext = getTenantContext(),
): void {
  if (!needsRLS(model) || context.isSuperAdmin || !context.hospitalId) return;

  args.where = args.where || {};
  assertTenantMatch(args.where.hospitalId, context, model, 'where');

  if (args.where.hospitalId === undefined) {
    args.where.hospitalId = context.hospitalId;
  }
}

function enforceTenantOnData(
  model: string,
  data: MutableRecord | MutableRecord[] | undefined,
  context: TenantContext = getTenantContext(),
  source = 'data',
  injectMissing = true,
): void {
  if (
    !needsRLS(model) ||
    context.isSuperAdmin ||
    !context.hospitalId ||
    !data
  ) {
    return;
  }

  const records = Array.isArray(data) ? data : [data];

  records.forEach((record, index) => {
    if (!record || typeof record !== 'object') return;

    const sourceLabel = Array.isArray(data) ? `${source}[${index}]` : source;
    assertTenantMatch(record.hospitalId, context, model, sourceLabel);

    if (injectMissing && record.hospitalId === undefined) {
      record.hospitalId = context.hospitalId;
    }
  });
}

function applySoftDeleteFilter(model: string, args: TenantQueryArgs): void {
  if (!SOFT_DELETABLE_MODELS.has(model)) return;

  args.where = args.where || {};
  if (args.where.isDeleted === undefined) {
    args.where.isDeleted = false;
  }
}

function applyTenantPolicy<T extends TenantQueryArgs>(
  model: string,
  operation: TenantOperation,
  args: T,
  options?: {
    includeSoftDeleteFilter?: boolean;
    context?: TenantContext;
  },
): T {
  const context = options?.context ?? getTenantContext();

  switch (operation) {
    case 'findMany':
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findUnique':
    case 'findUniqueOrThrow':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'delete':
    case 'deleteMany':
      enforceTenantOnWhere(model, args, context);
      break;
    case 'create':
      enforceTenantOnData(model, args.data, context);
      break;
    case 'createMany':
      enforceTenantOnData(model, args.data, context);
      break;
    case 'update':
    case 'updateMany':
      enforceTenantOnWhere(model, args, context);
      enforceTenantOnData(model, args.data, context, 'data', false);
      break;
    case 'upsert':
      enforceTenantOnWhere(model, args, context);
      enforceTenantOnData(model, args.create, context, 'create', true);
      enforceTenantOnData(model, args.update, context, 'update', false);
      break;
  }

  if (options?.includeSoftDeleteFilter) {
    applySoftDeleteFilter(model, args);
  }

  return args;
}

function injectRLS(model: string, args: TenantQueryArgs): void {
  applyTenantPolicy(model, 'findMany', args);
}

function encryptPatientPayload(
  data: MutableRecord,
  encryptionService: EncryptionService,
  includeMrnHash = false,
): void {
  if (typeof data.phone === 'string') {
    data.phoneHash = generateSearchHash(data.phone);
  }
  if (typeof data.email === 'string') {
    data.emailHash = generateSearchHash(data.email);
  }
  if (includeMrnHash && typeof data.mrn === 'string') {
    data.mrnHash = generateSearchHash(data.mrn);
  }
  if (typeof data.nationalId === 'string') {
    data.nationalIdHash = generateSearchHash(data.nationalId);
  }
  if (typeof data.identityNumber === 'string') {
    data.identityNumberHash = generateSearchHash(data.identityNumber);
  }

  PATIENT_SENSITIVE_FIELDS.forEach((field) => {
    const val = data[field];
    if (typeof val === 'string' && val.length > 0) {
      data[field] = encryptionService.encrypt(val);
    }
  });
}

export const extendedPrisma = (
  prisma: PrismaClient,
  encryptionService: EncryptionService,
) => {
  return prisma.$extends({
    query: {
      patient: {
        async create({ args, query }) {
          applyTenantPolicy(
            'Patient',
            'create',
            args as unknown as TenantQueryArgs,
          );
          encryptPatientPayload(
            args.data as unknown as MutableRecord,
            encryptionService,
            true,
          );
          return query(args);
        },
        async update({ args, query }) {
          applyTenantPolicy(
            'Patient',
            'update',
            args as unknown as TenantQueryArgs,
          );
          encryptPatientPayload(
            args.data as unknown as MutableRecord,
            encryptionService,
          );
          return query(args);
        },
        async findFirst({ args, query }) {
          applyTenantPolicy(
            'Patient',
            'findFirst',
            args as unknown as TenantQueryArgs,
            {
              includeSoftDeleteFilter: true,
            },
          );
          const result = await query(args);
          return decryptPatientRelations(
            handleDecryption(result, encryptionService),
            encryptionService,
          );
        },
        async findMany({ args, query }) {
          applyTenantPolicy(
            'Patient',
            'findMany',
            args as unknown as TenantQueryArgs,
            {
              includeSoftDeleteFilter: true,
            },
          );
          const result = await query(args);
          return decryptPatientRelations(
            handleDecryption(result, encryptionService),
            encryptionService,
          );
        },
        async findUnique({ args, query }) {
          applyTenantPolicy(
            'Patient',
            'findUnique',
            args as unknown as TenantQueryArgs,
          );
          const result = await query(args);
          return decryptPatientRelations(
            handleDecryption(result, encryptionService),
            encryptionService,
          );
        },
        async findUniqueOrThrow({ args, query }) {
          applyTenantPolicy(
            'Patient',
            'findUniqueOrThrow',
            args as unknown as TenantQueryArgs,
          );
          const result = await query(args);
          return decryptPatientRelations(
            handleDecryption(result, encryptionService),
            encryptionService,
          );
        },
      },
      $allModels: {
        async delete({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'delete',
            args as unknown as TenantQueryArgs,
          );

          if (SOFT_DELETABLE_MODELS.has(model)) {
            const extraData =
              scopedArgs.data && !Array.isArray(scopedArgs.data)
                ? scopedArgs.data
                : {};
            return getDynamicDelegate(prisma, model).update({
              ...scopedArgs,
              data: { isDeleted: true, ...extraData },
            });
          }

          return query(args);
        },
        async deleteMany({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'deleteMany',
            args as unknown as TenantQueryArgs,
          );

          if (SOFT_DELETABLE_MODELS.has(model)) {
            const extraData =
              scopedArgs.data && !Array.isArray(scopedArgs.data)
                ? scopedArgs.data
                : {};
            return getDynamicDelegate(prisma, model).updateMany({
              ...scopedArgs,
              data: { isDeleted: true, ...extraData },
            });
          }

          return query(args);
        },
        async findMany({ model, args, query }) {
          applyTenantPolicy(
            model,
            'findMany',
            args as unknown as TenantQueryArgs,
            {
              includeSoftDeleteFilter: model !== 'Patient',
            },
          );
          return decryptPatientRelations(await query(args), encryptionService);
        },
        async findFirst({ model, args, query }) {
          applyTenantPolicy(
            model,
            'findFirst',
            args as unknown as TenantQueryArgs,
            {
              includeSoftDeleteFilter: model !== 'Patient',
            },
          );
          return decryptPatientRelations(await query(args), encryptionService);
        },
        async findFirstOrThrow({ model, args, query }) {
          applyTenantPolicy(
            model,
            'findFirstOrThrow',
            args as unknown as TenantQueryArgs,
            {
              includeSoftDeleteFilter: model !== 'Patient',
            },
          );
          return decryptPatientRelations(await query(args), encryptionService);
        },
        async findUnique({ model, args, query }) {
          applyTenantPolicy(
            model,
            'findUnique',
            args as unknown as TenantQueryArgs,
          );
          return decryptPatientRelations(await query(args), encryptionService);
        },
        async findUniqueOrThrow({ model, args, query }) {
          applyTenantPolicy(
            model,
            'findUniqueOrThrow',
            args as unknown as TenantQueryArgs,
          );
          return decryptPatientRelations(await query(args), encryptionService);
        },
        async count({ model, args, query }) {
          const scopedArgs = (args ?? {}) as TenantQueryArgs;
          applyTenantPolicy(model, 'count', scopedArgs, {
            includeSoftDeleteFilter: true,
          });
          return query(scopedArgs as Parameters<typeof query>[0]);
        },
        async aggregate({ model, args, query }) {
          const scopedArgs = (args ?? {}) as TenantQueryArgs;
          applyTenantPolicy(model, 'aggregate', scopedArgs, {
            includeSoftDeleteFilter: true,
          });
          return query(scopedArgs as Parameters<typeof query>[0]);
        },
        async groupBy({ model, args, query }) {
          applyTenantPolicy(
            model,
            'groupBy',
            args as unknown as TenantQueryArgs,
            {
              includeSoftDeleteFilter: true,
            },
          );
          return query(args);
        },
        async create({ model, args, query }) {
          applyTenantPolicy(
            model,
            'create',
            args as unknown as TenantQueryArgs,
          );
          return query(args);
        },
        async createMany({ model, args, query }) {
          applyTenantPolicy(
            model,
            'createMany',
            args as unknown as TenantQueryArgs,
          );
          return query(args);
        },
        async update({ model, args, query }) {
          applyTenantPolicy(
            model,
            'update',
            args as unknown as TenantQueryArgs,
          );
          return query(args);
        },
        async updateMany({ model, args, query }) {
          applyTenantPolicy(
            model,
            'updateMany',
            args as unknown as TenantQueryArgs,
          );
          return query(args);
        },
        async upsert({ model, args, query }) {
          applyTenantPolicy(
            model,
            'upsert',
            args as unknown as TenantQueryArgs,
          );
          return query(args);
        },
      },
    },
  });
};

export {
  TENANT_SCOPED_MODELS,
  RLS_EXEMPT_MODELS,
  SOFT_DELETABLE_MODELS,
  needsRLS,
  getTenantHospitalId,
  injectRLS,
  isSuperAdminContext,
  getTenantContext,
  enforceTenantOnWhere,
  enforceTenantOnData,
  applySoftDeleteFilter,
  applyTenantPolicy,
};
