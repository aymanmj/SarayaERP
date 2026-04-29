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

function getTenantHospitalId(): number | null {
  try {
    const cls = ClsServiceManager.getClsService();
    if (!cls) return null;

    const hospitalId = cls.get('hospitalId');
    return hospitalId ? Number(hospitalId) : null;
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
  args: any,
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
  data: any,
  context: TenantContext = getTenantContext(),
  source = 'data',
): void {
  if (!needsRLS(model) || context.isSuperAdmin || !context.hospitalId || !data) {
    return;
  }

  const records = Array.isArray(data) ? data : [data];

  records.forEach((record, index) => {
    if (!record || typeof record !== 'object') return;

    const sourceLabel = Array.isArray(data) ? `${source}[${index}]` : source;
    assertTenantMatch(record.hospitalId, context, model, sourceLabel);

    if (record.hospitalId === undefined) {
      record.hospitalId = context.hospitalId;
    }
  });
}

function applySoftDeleteFilter(model: string, args: any): void {
  if (!SOFT_DELETABLE_MODELS.has(model)) return;

  args.where = args.where || {};
  if (args.where.isDeleted === undefined) {
    args.where.isDeleted = false;
  }
}

function applyTenantPolicy(
  model: string,
  operation: TenantOperation,
  args: any,
  options?: {
    includeSoftDeleteFilter?: boolean;
    context?: TenantContext;
  },
): any {
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
      enforceTenantOnData(model, args.data, context);
      break;
    case 'upsert':
      enforceTenantOnWhere(model, args, context);
      enforceTenantOnData(model, args.create, context, 'create');
      enforceTenantOnData(model, args.update, context, 'update');
      break;
  }

  if (options?.includeSoftDeleteFilter) {
    applySoftDeleteFilter(model, args);
  }

  return args;
}

function injectRLS(model: string, args: any): void {
  applyTenantPolicy(model, 'findMany', args);
}

function encryptPatientPayload(
  data: any,
  encryptionService: EncryptionService,
  includeMrnHash = false,
): void {
  if (data.phone) data.phoneHash = generateSearchHash(data.phone);
  if (data.email) data.emailHash = generateSearchHash(data.email);
  if (includeMrnHash && data.mrn) data.mrnHash = generateSearchHash(data.mrn);
  if (data.nationalId) {
    data.nationalIdHash = generateSearchHash(data.nationalId);
  }
  if (data.identityNumber) {
    data.identityNumberHash = generateSearchHash(data.identityNumber);
  }

  PATIENT_SENSITIVE_FIELDS.forEach((field) => {
    if (data[field]) {
      data[field] = encryptionService.encrypt(data[field]);
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
          applyTenantPolicy('Patient', 'create', args as any);
          encryptPatientPayload(args.data as any, encryptionService, true);
          return query(args);
        },
        async update({ args, query }) {
          applyTenantPolicy('Patient', 'update', args as any);
          encryptPatientPayload(args.data as any, encryptionService);
          return query(args);
        },
        async findFirst({ args, query }) {
          applyTenantPolicy('Patient', 'findFirst', args as any, {
            includeSoftDeleteFilter: true,
          });
          const result = await query(args);
          return handleDecryption(result, encryptionService);
        },
        async findMany({ args, query }) {
          applyTenantPolicy('Patient', 'findMany', args as any, {
            includeSoftDeleteFilter: true,
          });
          const result = await query(args);
          return handleDecryption(result, encryptionService);
        },
        async findUnique({ args, query }) {
          applyTenantPolicy('Patient', 'findUnique', args as any);
          const result = await query(args);
          return handleDecryption(result, encryptionService);
        },
        async findUniqueOrThrow({ args, query }) {
          applyTenantPolicy('Patient', 'findUniqueOrThrow', args as any);
          const result = await query(args);
          return handleDecryption(result, encryptionService);
        },
      },
      $allModels: {
        async delete({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'delete', args as any);

          if (SOFT_DELETABLE_MODELS.has(model)) {
            return (prisma as any)[model].update({
              ...scopedArgs,
              data: { isDeleted: true, ...(scopedArgs.data || {}) },
            });
          }

          return query(scopedArgs);
        },
        async deleteMany({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'deleteMany',
            args as any,
          );

          if (SOFT_DELETABLE_MODELS.has(model)) {
            return (prisma as any)[model].updateMany({
              ...scopedArgs,
              data: { isDeleted: true, ...(scopedArgs.data || {}) },
            });
          }

          return query(scopedArgs);
        },
        async findMany({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'findMany', args as any, {
            includeSoftDeleteFilter: model !== 'Patient',
          });
          return query(scopedArgs);
        },
        async findFirst({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'findFirst', args as any, {
            includeSoftDeleteFilter: model !== 'Patient',
          });
          return query(scopedArgs);
        },
        async findFirstOrThrow({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'findFirstOrThrow',
            args as any,
            {
              includeSoftDeleteFilter: model !== 'Patient',
            },
          );
          return query(scopedArgs);
        },
        async findUnique({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'findUnique', args as any);
          return query(scopedArgs);
        },
        async findUniqueOrThrow({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'findUniqueOrThrow',
            args as any,
          );
          return query(scopedArgs);
        },
        async count({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'count',
            (args ?? {}) as any,
            {
              includeSoftDeleteFilter: true,
            },
          );
          return query(scopedArgs);
        },
        async aggregate({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'aggregate',
            (args ?? {}) as any,
            {
              includeSoftDeleteFilter: true,
            },
          );
          return query(scopedArgs);
        },
        async groupBy({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'groupBy', args as any, {
            includeSoftDeleteFilter: true,
          });
          return query(scopedArgs);
        },
        async create({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'create', args as any);
          return query(scopedArgs);
        },
        async createMany({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'createMany',
            args as any,
          );
          return query(scopedArgs);
        },
        async update({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'update', args as any);
          return query(scopedArgs);
        },
        async updateMany({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(
            model,
            'updateMany',
            args as any,
          );
          return query(scopedArgs);
        },
        async upsert({ model, args, query }) {
          const scopedArgs = applyTenantPolicy(model, 'upsert', args as any);
          return query(scopedArgs);
        },
      },
    },
  });
};

export {
  TENANT_SCOPED_MODELS,
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
