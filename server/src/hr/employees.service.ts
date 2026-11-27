// server/src/hr/employees.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ContractType,
  EmployeeStatus,
  Gender,
  Prisma,
  StaffCategory,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { scanAttachmentBuffer } from '../common/security/attachment-av-scanner.service';
import {
  decryptAttachmentBuffer,
  encryptAttachmentBuffer,
} from '../common/security/attachment-crypto.util';
import type { UploadedAttachmentFile } from '../insurance/preauth-attachments';
import {
  HR_ALTAMAM_INTEGRATION_KEY,
  HR_DEFAULT_CURRENCY_KEY,
} from '../system-settings/system-settings.service';
import {
  BulkImportEmployeesDto,
  CreateEmployeeActionDto,
  CreateEmployeeDocumentMetaDto,
  CreateEmployeeDto,
  CreateEmployeeQualificationDto,
  CreateEmployeeTrainingCourseDto,
  CreateJobTitleDto,
  CreateSectionDto,
  LinkEmployeeUserDto,
  UpdateEmployeeDto,
  UpdateJobTitleDto,
  UpdateSectionDto,
} from './dto/employee.dto';

export interface EmployeeAuditMeta {
  ipAddress?: string;
  clientName?: string;
  configRoot?: string | null;
}

const MAX_HR_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_DOCUMENT_EXTS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
]);

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    if (typeof value === 'number') return String(value);
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalDate(value: unknown, label: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`${label} غير صالح`);
    }
    return value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException(`${label} غير صالح`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${label} غير صالح`);
  }
  return parsed;
}

function parseImportedDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const raw = String(value).trim();
  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(
      slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3],
    );
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildArabicFullName(parts: {
  firstNameAr: string;
  secondNameAr?: string | null;
  thirdNameAr?: string | null;
  lastNameAr?: string | null;
}): string {
  return [
    parts.firstNameAr,
    parts.secondNameAr,
    parts.thirdNameAr,
    parts.lastNameAr,
  ]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function splitArabicFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstNameAr: parts[0] || '',
    secondNameAr: parts[1] || '',
    thirdNameAr: parts[2] || '',
    lastNameAr: parts.slice(3).join(' '),
  };
}

function normalizePathForCompare(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveDocumentRoot(configRoot?: string | null): string {
    const configured =
      configRoot?.trim() ||
      process.env.HR_DOCUMENT_ROOT?.trim() ||
      'uploads/hr-documents';
    return path.resolve(configured);
  }

  private isInsideRoot(rootPath: string, targetPath: string): boolean {
    const rel = path.relative(
      normalizePathForCompare(rootPath),
      normalizePathForCompare(targetPath),
    );
    return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  // =========================================================================
  // 1. HR CONFIG, NEXT EMPLOYEE NO & DASHBOARD STATS
  // =========================================================================

  async getHrConfig(hospitalId: number) {
    const settings = await this.prisma.systemSetting.findMany({
      where: {
        hospitalId,
        key: { in: [HR_ALTAMAM_INTEGRATION_KEY, HR_DEFAULT_CURRENCY_KEY] },
      },
      select: { key: true, value: true },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));
    return {
      altamamIntegrationEnabled:
        (map.get(HR_ALTAMAM_INTEGRATION_KEY) ?? 'false').toLowerCase() ===
        'true',
      defaultCurrency: map.get(HR_DEFAULT_CURRENCY_KEY) || 'LYD',
    };
  }

  async getNextEmployeeNumber(
    hospitalId: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ nextEmployeeNo: string }> {
    const existing = await tx.employee.findMany({
      where: { hospitalId, employeeNo: { startsWith: 'EMP-' } },
      select: { employeeNo: true },
    });
    let maxNum = 0;
    for (const row of existing) {
      const m = row.employeeNo.match(/^EMP-(\d+)$/i);
      if (m) {
        const val = parseInt(m[1], 10);
        if (Number.isFinite(val) && val > maxNum) maxNum = val;
      }
    }
    return {
      nextEmployeeNo: `EMP-${String(maxNum + 1).padStart(4, '0')}`,
    };
  }

  async getStats(hospitalId: number) {
    const baseWhere: Prisma.EmployeeWhereInput = {
      hospitalId,
      deletedAt: null,
    };
    const [total, active, linkedToUser, byCategoryRaw, byDeptRaw] =
      await Promise.all([
        this.prisma.employee.count({ where: baseWhere }),
        this.prisma.employee.count({
          where: { ...baseWhere, isActive: true },
        }),
        this.prisma.employee.count({
          where: { ...baseWhere, userId: { not: null } },
        }),
        this.prisma.employee.groupBy({
          by: ['staffCategory'],
          where: { ...baseWhere, isActive: true },
          _count: { _all: true },
        }),
        this.prisma.employee.groupBy({
          by: ['departmentId'],
          where: { ...baseWhere, isActive: true },
          _count: { _all: true },
        }),
      ]);

    const deptIds = byDeptRaw
      .map((r) => r.departmentId)
      .filter((id): id is number => id !== null);
    const depts = deptIds.length
      ? await this.prisma.department.findMany({
          where: { hospitalId, id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptNameMap = new Map(depts.map((d) => [d.id, d.name]));

    return {
      total,
      active,
      inactive: total - active,
      linkedToUser,
      nonLoginStaff: total - linkedToUser,
      byCategory: byCategoryRaw.map((c) => ({
        staffCategory: c.staffCategory,
        count: c._count._all,
      })),
      byDepartment: byDeptRaw.map((d) => ({
        departmentId: d.departmentId,
        departmentName:
          d.departmentId !== null
            ? (deptNameMap.get(d.departmentId) ?? 'غير محدد')
            : 'غير محدد',
        count: d._count._all,
      })),
    };
  }

  // =========================================================================
  // 2. EMPLOYEES DIRECTORY & PROFILE CRUD
  // =========================================================================

  async findAll(
    hospitalId: number,
    query: {
      search?: string;
      departmentId?: number;
      sectionId?: number;
      staffCategory?: StaffCategory;
      status?: EmployeeStatus;
      hasUserAccount?: string;
      isActive?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      hospitalId,
      deletedAt: null,
    };

    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.sectionId) where.sectionId = query.sectionId;
    if (query.staffCategory) where.staffCategory = query.staffCategory;
    if (query.status) where.status = query.status;
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.hasUserAccount === 'true') where.userId = { not: null };
    if (query.hasUserAccount === 'false') where.userId = null;

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { employeeNo: { contains: q, mode: 'insensitive' } },
        { altamamEmployeeNo: { contains: q, mode: 'insensitive' } },
        { biometricId: { contains: q, mode: 'insensitive' } },
        { nationalId: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: {
          department: { select: { id: true, name: true, nameEn: true } },
          section: { select: { id: true, name: true, nameEn: true } },
          jobTitle: { select: { id: true, name: true, nameEn: true } },
          specialty: { select: { id: true, name: true, nameAr: true } },
          user: {
            select: {
              id: true,
              username: true,
              isActive: true,
              isDoctor: true,
            },
          },
          _count: {
            select: {
              qualifications: true,
              trainingCourses: true,
              documents: true,
              credentials: true,
            },
          },
        },
        orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(hospitalId: number, id: number) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, hospitalId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true, nameEn: true } },
        secondaryDepartment: { select: { id: true, name: true, nameEn: true } },
        section: { select: { id: true, name: true, nameEn: true } },
        jobTitle: { select: { id: true, name: true, nameEn: true } },
        secondaryJobTitle: { select: { id: true, name: true, nameEn: true } },
        specialty: { select: { id: true, name: true, nameAr: true } },
        manager: {
          select: { id: true, employeeNo: true, fullName: true },
        },
        user: {
          select: {
            id: true,
            username: true,
            isActive: true,
            isDoctor: true,
            jobRank: true,
            userRoles: {
              include: { role: { select: { id: true, name: true } } },
            },
          },
        },
        qualifications: { orderBy: { id: 'desc' } },
        trainingCourses: { orderBy: { id: 'desc' } },
        documents: {
          select: {
            id: true,
            title: true,
            category: true,
            originalName: true,
            mimeType: true,
            fileSize: true,
            sha256: true,
            isEncrypted: true,
            expiryDate: true,
            alertDaysBefore: true,
            isVerified: true,
            isMandatory: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { id: 'desc' },
        },
        actions: {
          include: {
            approvedBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
        },
        credentials: { orderBy: [{ expiryDate: 'asc' }, { id: 'desc' }] },
        shiftAssignments: {
          where: { isActive: true },
          include: { shift: true },
          orderBy: { startDate: 'desc' },
        },
        leaveBalances: { orderBy: [{ year: 'desc' }, { leaveType: 'asc' }] },
      },
    });
    if (!employee) {
      throw new NotFoundException('ملف الموظف غير موجود في هذه المنشأة.');
    }
    return employee;
  }

  private async validateEmployeeRelations(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    refs: {
      departmentId?: number | null;
      secondaryDepartmentId?: number | null;
      sectionId?: number | null;
      jobTitleId?: number | null;
      secondaryJobTitleId?: number | null;
      managerId?: number | null;
      specialtyId?: number | null;
      selfEmployeeId?: number;
    },
  ) {
    if (refs.departmentId) {
      const dept = await tx.department.findFirst({
        where: { id: refs.departmentId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!dept) {
        throw new NotFoundException(
          'القسم أو الإدارة غير موجودة في هذه المنشأة.',
        );
      }
    }
    if (refs.secondaryDepartmentId) {
      const dept2 = await tx.department.findFirst({
        where: {
          id: refs.secondaryDepartmentId,
          hospitalId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!dept2) {
        throw new NotFoundException('القسم الإضافي غير موجود في هذه المنشأة.');
      }
    }
    if (refs.sectionId) {
      const section = await tx.section.findFirst({
        where: { id: refs.sectionId, hospitalId, isActive: true },
        select: { id: true, departmentId: true },
      });
      if (!section) {
        throw new NotFoundException(
          'الشعبة المحددة غير موجودة في هذه المنشأة.',
        );
      }
      if (refs.departmentId && section.departmentId !== refs.departmentId) {
        throw new BadRequestException(
          'الشعبة المحددة لا تتبع الإدارة الأساسية المختارة للموظف.',
        );
      }
    }
    if (refs.jobTitleId) {
      const jt = await tx.jobTitle.findFirst({
        where: { id: refs.jobTitleId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!jt) {
        throw new NotFoundException('المسمى الوظيفي غير موجود في هذه المنشأة.');
      }
    }
    if (refs.secondaryJobTitleId) {
      const jt2 = await tx.jobTitle.findFirst({
        where: { id: refs.secondaryJobTitleId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!jt2) {
        throw new NotFoundException(
          'المسمى الوظيفي الإضافي غير موجود في هذه المنشأة.',
        );
      }
    }
    if (refs.managerId) {
      if (refs.selfEmployeeId && refs.managerId === refs.selfEmployeeId) {
        throw new BadRequestException('لا يمكن تعيين الموظف مديراً لنفسه.');
      }
      const mgr = await tx.employee.findFirst({
        where: { id: refs.managerId, hospitalId, deletedAt: null },
        select: { id: true },
      });
      if (!mgr) {
        throw new NotFoundException('المدير المباشر غير موجود في هذه المنشأة.');
      }
    }
    if (refs.specialtyId) {
      const spec = await tx.specialty.findFirst({
        where: { id: refs.specialtyId, isActive: true },
        select: { id: true },
      });
      if (!spec) {
        throw new NotFoundException('التخصص الطبي غير موجود.');
      }
    }
  }

  private async ensureUniqueEmployeeCodes(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    codes: {
      employeeNo?: string | null;
      altamamEmployeeNo?: string | null;
      biometricId?: string | null;
    },
    excludeId?: number,
  ) {
    const excludeFilter = excludeId ? { id: { not: excludeId } } : {};

    if (codes.employeeNo) {
      const dupEmpNo = await tx.employee.findFirst({
        where: {
          hospitalId,
          employeeNo: codes.employeeNo,
          ...excludeFilter,
        },
        select: { id: true, fullName: true },
      });
      if (dupEmpNo) {
        throw new ConflictException(
          `الرقم الوظيفي (${codes.employeeNo}) مستخدم بالفعل للموظف "${dupEmpNo.fullName}".`,
        );
      }
    }
    if (codes.altamamEmployeeNo) {
      const dupAlt = await tx.employee.findFirst({
        where: {
          hospitalId,
          altamamEmployeeNo: codes.altamamEmployeeNo,
          ...excludeFilter,
        },
        select: { id: true, fullName: true, employeeNo: true },
      });
      if (dupAlt) {
        throw new ConflictException(
          `رقم التمام (${codes.altamamEmployeeNo}) مستخدم بالفعل للموظف "${dupAlt.fullName}" (${dupAlt.employeeNo}).`,
        );
      }
    }
    if (codes.biometricId) {
      const dupBio = await tx.employee.findFirst({
        where: {
          hospitalId,
          biometricId: codes.biometricId,
          ...excludeFilter,
        },
        select: { id: true, fullName: true, employeeNo: true },
      });
      if (dupBio) {
        throw new ConflictException(
          `كود البصمة (${codes.biometricId}) مستخدم بالفعل للموظف "${dupBio.fullName}" (${dupBio.employeeNo}).`,
        );
      }
    }
  }

  async create(
    hospitalId: number,
    actorUserId: number,
    dto: CreateEmployeeDto,
    auditMeta?: EmployeeAuditMeta,
  ) {
    if (
      (dto.isTaxExempt || dto.isSocialInsuranceExempt) &&
      !dto.payrollExemptionReason?.trim()
    ) {
      throw new BadRequestException(
        'يجب تسجيل سبب الإعفاء من الضريبة أو الضمان الاجتماعي.',
      );
    }

    const cfg = await this.getHrConfig(hospitalId);
    const requestedEmpNo = normalizeOptionalText(dto.employeeNo);
    const isAutoNumber = !requestedEmpNo;
    const altamamEmployeeNo = normalizeOptionalText(dto.altamamEmployeeNo);
    const biometricId = normalizeOptionalText(dto.biometricId);
    const firstNameAr = dto.firstNameAr.trim();
    if (!firstNameAr) {
      throw new BadRequestException('الاسم الأول بالعربية مطلوب.');
    }
    const secondNameAr = (dto.secondNameAr ?? '').trim();
    const thirdNameAr = (dto.thirdNameAr ?? '').trim();
    const lastNameAr = (dto.lastNameAr ?? '').trim();
    const fullName = buildArabicFullName({
      firstNameAr,
      secondNameAr,
      thirdNameAr,
      lastNameAr,
    });

    const currency = (
      dto.currency?.trim() || cfg.defaultCurrency
    ).toUpperCase();

    let createdEmployee: Awaited<ReturnType<typeof this.findOne>> | null = null;
    let committedAudit: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          committedAudit = null;
          await this.validateEmployeeRelations(tx, hospitalId, {
            departmentId: dto.departmentId,
            secondaryDepartmentId: dto.secondaryDepartmentId,
            sectionId: dto.sectionId,
            jobTitleId: dto.jobTitleId,
            secondaryJobTitleId: dto.secondaryJobTitleId,
            managerId: dto.managerId,
            specialtyId: dto.specialtyId,
          });

          const employeeNo = isAutoNumber
            ? (await this.getNextEmployeeNumber(hospitalId, tx)).nextEmployeeNo
            : requestedEmpNo;

          await this.ensureUniqueEmployeeCodes(tx, hospitalId, {
            employeeNo,
            altamamEmployeeNo,
            biometricId,
          });

          const emp = await tx.employee.create({
            data: {
              hospitalId,
              employeeNo,
              altamamEmployeeNo,
              biometricId,
              firstNameAr,
              secondNameAr,
              thirdNameAr,
              lastNameAr,
              firstNameEn: normalizeOptionalText(dto.firstNameEn),
              secondNameEn: normalizeOptionalText(dto.secondNameEn),
              thirdNameEn: normalizeOptionalText(dto.thirdNameEn),
              lastNameEn: normalizeOptionalText(dto.lastNameEn),
              fullName,
              dateOfBirth: parseOptionalDate(dto.dateOfBirth, 'تاريخ الميلاد'),
              gender: dto.gender ?? Gender.MALE,
              nationality: normalizeOptionalText(dto.nationality),
              religion: normalizeOptionalText(dto.religion),
              maritalStatus: dto.maritalStatus ?? null,
              dependentsCount: dto.dependentsCount ?? 0,
              nationalId: normalizeOptionalText(dto.nationalId),
              nationalIdExpiry: parseOptionalDate(
                dto.nationalIdExpiry,
                'تاريخ انتهاء الهوية',
              ),
              passportNo: normalizeOptionalText(dto.passportNo),
              passportExpiry: parseOptionalDate(
                dto.passportExpiry,
                'تاريخ انتهاء الجواز',
              ),
              residenceNo: normalizeOptionalText(dto.residenceNo),
              residenceExpiry: parseOptionalDate(
                dto.residenceExpiry,
                'تاريخ انتهاء الإقامة',
              ),
              phone: normalizeOptionalText(dto.phone),
              phone2: normalizeOptionalText(dto.phone2),
              email: normalizeOptionalText(dto.email),
              address: normalizeOptionalText(dto.address),
              city: normalizeOptionalText(dto.city),
              emergencyContactName: normalizeOptionalText(
                dto.emergencyContactName,
              ),
              emergencyContactPhone: normalizeOptionalText(
                dto.emergencyContactPhone,
              ),
              emergencyRelation: normalizeOptionalText(dto.emergencyRelation),
              departmentId: dto.departmentId ?? null,
              sectionId: dto.sectionId ?? null,
              jobTitleId: dto.jobTitleId ?? null,
              secondaryDepartmentId: dto.secondaryDepartmentId ?? null,
              secondaryJobTitleId: dto.secondaryJobTitleId ?? null,
              managerId: dto.managerId ?? null,
              specialtyId: dto.specialtyId ?? null,
              staffCategory: dto.staffCategory ?? StaffCategory.ADMINISTRATIVE,
              medicalRank: dto.medicalRank ?? null,
              hireDate:
                parseOptionalDate(dto.hireDate, 'تاريخ التعيين') ?? new Date(),
              contractType: dto.contractType ?? ContractType.PERMANENT,
              contractStartDate: parseOptionalDate(
                dto.contractStartDate,
                'تاريخ بداية العقد',
              ),
              contractEndDate: parseOptionalDate(
                dto.contractEndDate,
                'تاريخ نهاية العقد',
              ),
              probationEndDate: parseOptionalDate(
                dto.probationEndDate,
                'تاريخ نهاية التجربة',
              ),
              status: dto.status ?? EmployeeStatus.ACTIVE,
              payBasis: dto.payBasis?.trim() || 'MONTHLY',
              basicSalary: Money.toDbString(dto.basicSalary ?? 0),
              housingAllowance: Money.toDbString(dto.housingAllowance ?? 0),
              transportAllowance: Money.toDbString(dto.transportAllowance ?? 0),
              otherAllowance: Money.toDbString(dto.otherAllowance ?? 0),
              hourlyRate: Money.toUnitDbString(dto.hourlyRate ?? 0),
              fixedShift6hRate: Money.toUnitDbString(dto.fixedShift6hRate ?? 0),
              fixedShift12hRate: Money.toUnitDbString(
                dto.fixedShift12hRate ?? 0,
              ),
              fixedShift24hRate: Money.toUnitDbString(
                dto.fixedShift24hRate ?? 0,
              ),
              onCallDailyRate: Money.toDbString(dto.onCallDailyRate ?? 0),
              standardMonthlyHours: dto.standardMonthlyHours ?? 160,
              currency,
              bankName: normalizeOptionalText(dto.bankName),
              bankAccountNo: normalizeOptionalText(dto.bankAccountNo),
              iban: normalizeOptionalText(dto.iban),
              socialInsuranceNo: normalizeOptionalText(dto.socialInsuranceNo),
              socialInsuranceRate:
                dto.socialInsuranceRate !== undefined
                  ? Money.toRateDbString(dto.socialInsuranceRate)
                  : null,
              medicalInsuranceNo: normalizeOptionalText(dto.medicalInsuranceNo),
              medicalInsuranceClass: normalizeOptionalText(
                dto.medicalInsuranceClass,
              ),
              medicalInsuranceExpiry: parseOptionalDate(
                dto.medicalInsuranceExpiry,
                'تاريخ انتهاء التأمين الصحي',
              ),
              isTaxExempt: Boolean(dto.isTaxExempt),
              isSocialInsuranceExempt: Boolean(dto.isSocialInsuranceExempt),
              payrollExemptionReason: normalizeOptionalText(
                dto.payrollExemptionReason,
              ),
              annualLeaveBalance: dto.annualLeaveBalance ?? 21,
              isActive: dto.status !== EmployeeStatus.TERMINATED,
              ...(dto.qualifications?.length
                ? {
                    qualifications: {
                      create: dto.qualifications.map((q) => ({
                        hospitalId,
                        degree: q.degree.trim(),
                        major: normalizeOptionalText(q.major),
                        institution: q.institution.trim(),
                        graduationYear: q.graduationYear ?? null,
                        grade: normalizeOptionalText(q.grade),
                        documentRef: normalizeOptionalText(q.documentRef),
                        notes: normalizeOptionalText(q.notes),
                      })),
                    },
                  }
                : {}),
              ...(dto.trainingCourses?.length
                ? {
                    trainingCourses: {
                      create: dto.trainingCourses.map((c) => ({
                        hospitalId,
                        courseName: c.courseName.trim(),
                        provider: c.provider.trim(),
                        completionDate: parseOptionalDate(
                          c.completionDate,
                          'تاريخ إتمام الدورة',
                        ),
                        hoursCount: c.hoursCount ?? null,
                        certificateNo: normalizeOptionalText(c.certificateNo),
                        documentRef: normalizeOptionalText(c.documentRef),
                        notes: normalizeOptionalText(c.notes),
                      })),
                    },
                  }
                : {}),
            },
          });

          const auditFields = {
            hospitalId,
            userId: actorUserId,
            action: 'EMPLOYEE_CREATED',
            entity: 'Employee',
            entityId: emp.id,
            ipAddress: auditMeta?.ipAddress,
            clientName: auditMeta?.clientName,
            details: {
              employeeNo: emp.employeeNo,
              fullName: emp.fullName,
              staffCategory: emp.staffCategory,
              currency: emp.currency,
            },
          };
          await appendChainedAuditInTransaction(tx, auditFields);
          committedAudit = auditFields;
          return emp.id;
        });

        createdEmployee = await this.findOne(hospitalId, result);
        break;
      } catch (err: unknown) {
        const prismaErr = err as { code?: string; meta?: { target?: unknown } };
        const isUniqueEmpNo =
          prismaErr?.code === 'P2002' &&
          JSON.stringify(prismaErr.meta?.target ?? '').includes('employeeNo');
        if (isAutoNumber && isUniqueEmpNo && attempt < 4) {
          continue;
        }
        throw err;
      }
    }

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return createdEmployee;
  }

  async update(
    hospitalId: number,
    id: number,
    actorUserId: number,
    dto: UpdateEmployeeDto,
    auditMeta?: EmployeeAuditMeta,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.employee.findFirst({
        where: { id, hospitalId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('ملف الموظف غير موجود في هذه المنشأة.');
      }

      const nextTaxExempt = dto.isTaxExempt ?? existing.isTaxExempt;
      const nextSocialExempt =
        dto.isSocialInsuranceExempt ?? existing.isSocialInsuranceExempt;
      const nextExemptionReason =
        dto.payrollExemptionReason !== undefined
          ? normalizeOptionalText(dto.payrollExemptionReason)
          : existing.payrollExemptionReason;
      if ((nextTaxExempt || nextSocialExempt) && !nextExemptionReason) {
        throw new BadRequestException(
          'يجب تسجيل سبب الإعفاء من الضريبة أو الضمان الاجتماعي.',
        );
      }

      await this.validateEmployeeRelations(tx, hospitalId, {
        departmentId:
          dto.departmentId !== undefined
            ? dto.departmentId
            : existing.departmentId,
        secondaryDepartmentId: dto.secondaryDepartmentId ?? undefined,
        sectionId:
          dto.sectionId !== undefined ? dto.sectionId : existing.sectionId,
        jobTitleId: dto.jobTitleId ?? undefined,
        secondaryJobTitleId: dto.secondaryJobTitleId ?? undefined,
        managerId: dto.managerId ?? undefined,
        specialtyId: dto.specialtyId ?? undefined,
        selfEmployeeId: existing.id,
      });

      const nextEmployeeNo =
        dto.employeeNo !== undefined
          ? (normalizeOptionalText(dto.employeeNo) ?? existing.employeeNo)
          : undefined;
      const nextAltamam =
        dto.altamamEmployeeNo !== undefined
          ? normalizeOptionalText(dto.altamamEmployeeNo)
          : undefined;
      const nextBiometric =
        dto.biometricId !== undefined
          ? normalizeOptionalText(dto.biometricId)
          : undefined;

      await this.ensureUniqueEmployeeCodes(
        tx,
        hospitalId,
        {
          employeeNo: nextEmployeeNo,
          altamamEmployeeNo: nextAltamam,
          biometricId: nextBiometric,
        },
        existing.id,
      );

      const firstNameAr =
        dto.firstNameAr !== undefined
          ? dto.firstNameAr.trim()
          : existing.firstNameAr;
      if (!firstNameAr) {
        throw new BadRequestException('الاسم الأول بالعربية مطلوب.');
      }
      const secondNameAr =
        dto.secondNameAr !== undefined
          ? dto.secondNameAr.trim()
          : existing.secondNameAr;
      const thirdNameAr =
        dto.thirdNameAr !== undefined
          ? dto.thirdNameAr.trim()
          : existing.thirdNameAr;
      const lastNameAr =
        dto.lastNameAr !== undefined
          ? dto.lastNameAr.trim()
          : (existing.lastNameAr ?? '');
      const fullName = buildArabicFullName({
        firstNameAr,
        secondNameAr,
        thirdNameAr,
        lastNameAr,
      });

      const saved = await tx.employee.update({
        where: { id: existing.id },
        data: {
          ...(nextEmployeeNo !== undefined
            ? { employeeNo: nextEmployeeNo }
            : {}),
          ...(dto.altamamEmployeeNo !== undefined
            ? { altamamEmployeeNo: nextAltamam }
            : {}),
          ...(dto.biometricId !== undefined
            ? { biometricId: nextBiometric }
            : {}),
          firstNameAr,
          secondNameAr,
          thirdNameAr,
          lastNameAr,
          fullName,
          ...(dto.firstNameEn !== undefined
            ? { firstNameEn: normalizeOptionalText(dto.firstNameEn) }
            : {}),
          ...(dto.secondNameEn !== undefined
            ? { secondNameEn: normalizeOptionalText(dto.secondNameEn) }
            : {}),
          ...(dto.thirdNameEn !== undefined
            ? { thirdNameEn: normalizeOptionalText(dto.thirdNameEn) }
            : {}),
          ...(dto.lastNameEn !== undefined
            ? { lastNameEn: normalizeOptionalText(dto.lastNameEn) }
            : {}),
          ...(dto.dateOfBirth !== undefined
            ? {
                dateOfBirth:
                  parseOptionalDate(dto.dateOfBirth, 'تاريخ الميلاد') ?? null,
              }
            : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
          ...(dto.nationality !== undefined
            ? { nationality: normalizeOptionalText(dto.nationality) }
            : {}),
          ...(dto.religion !== undefined
            ? { religion: normalizeOptionalText(dto.religion) }
            : {}),
          ...(dto.maritalStatus !== undefined
            ? { maritalStatus: dto.maritalStatus }
            : {}),
          ...(dto.dependentsCount !== undefined
            ? { dependentsCount: dto.dependentsCount }
            : {}),
          ...(dto.nationalId !== undefined
            ? { nationalId: normalizeOptionalText(dto.nationalId) }
            : {}),
          ...(dto.nationalIdExpiry !== undefined
            ? {
                nationalIdExpiry:
                  parseOptionalDate(
                    dto.nationalIdExpiry,
                    'تاريخ انتهاء الهوية',
                  ) ?? null,
              }
            : {}),
          ...(dto.passportNo !== undefined
            ? { passportNo: normalizeOptionalText(dto.passportNo) }
            : {}),
          ...(dto.passportExpiry !== undefined
            ? {
                passportExpiry:
                  parseOptionalDate(
                    dto.passportExpiry,
                    'تاريخ انتهاء الجواز',
                  ) ?? null,
              }
            : {}),
          ...(dto.residenceNo !== undefined
            ? { residenceNo: normalizeOptionalText(dto.residenceNo) }
            : {}),
          ...(dto.residenceExpiry !== undefined
            ? {
                residenceExpiry:
                  parseOptionalDate(
                    dto.residenceExpiry,
                    'تاريخ انتهاء الإقامة',
                  ) ?? null,
              }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: normalizeOptionalText(dto.phone) }
            : {}),
          ...(dto.phone2 !== undefined
            ? { phone2: normalizeOptionalText(dto.phone2) }
            : {}),
          ...(dto.email !== undefined
            ? { email: normalizeOptionalText(dto.email) }
            : {}),
          ...(dto.address !== undefined
            ? { address: normalizeOptionalText(dto.address) }
            : {}),
          ...(dto.city !== undefined
            ? { city: normalizeOptionalText(dto.city) }
            : {}),
          ...(dto.emergencyContactName !== undefined
            ? {
                emergencyContactName: normalizeOptionalText(
                  dto.emergencyContactName,
                ),
              }
            : {}),
          ...(dto.emergencyContactPhone !== undefined
            ? {
                emergencyContactPhone: normalizeOptionalText(
                  dto.emergencyContactPhone,
                ),
              }
            : {}),
          ...(dto.emergencyRelation !== undefined
            ? {
                emergencyRelation: normalizeOptionalText(dto.emergencyRelation),
              }
            : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId }
            : {}),
          ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
          ...(dto.jobTitleId !== undefined
            ? { jobTitleId: dto.jobTitleId }
            : {}),
          ...(dto.secondaryDepartmentId !== undefined
            ? { secondaryDepartmentId: dto.secondaryDepartmentId }
            : {}),
          ...(dto.secondaryJobTitleId !== undefined
            ? { secondaryJobTitleId: dto.secondaryJobTitleId }
            : {}),
          ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
          ...(dto.specialtyId !== undefined
            ? { specialtyId: dto.specialtyId }
            : {}),
          ...(dto.staffCategory !== undefined
            ? { staffCategory: dto.staffCategory }
            : {}),
          ...(dto.medicalRank !== undefined
            ? { medicalRank: dto.medicalRank }
            : {}),
          ...(dto.hireDate !== undefined
            ? { hireDate: parseOptionalDate(dto.hireDate, 'تاريخ التعيين') }
            : {}),
          ...(dto.contractType !== undefined
            ? { contractType: dto.contractType }
            : {}),
          ...(dto.contractStartDate !== undefined
            ? {
                contractStartDate:
                  parseOptionalDate(
                    dto.contractStartDate,
                    'تاريخ بداية العقد',
                  ) ?? null,
              }
            : {}),
          ...(dto.contractEndDate !== undefined
            ? {
                contractEndDate:
                  parseOptionalDate(dto.contractEndDate, 'تاريخ نهاية العقد') ??
                  null,
              }
            : {}),
          ...(dto.probationEndDate !== undefined
            ? {
                probationEndDate:
                  parseOptionalDate(
                    dto.probationEndDate,
                    'تاريخ نهاية التجربة',
                  ) ?? null,
              }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.terminationDate !== undefined
            ? {
                terminationDate:
                  parseOptionalDate(
                    dto.terminationDate,
                    'تاريخ انتهاء الخدمة',
                  ) ?? null,
              }
            : {}),
          ...(dto.terminationReason !== undefined
            ? {
                terminationReason: normalizeOptionalText(dto.terminationReason),
              }
            : {}),
          ...(dto.payBasis !== undefined
            ? { payBasis: dto.payBasis.trim() }
            : {}),
          ...(dto.basicSalary !== undefined
            ? { basicSalary: Money.toDbString(dto.basicSalary) }
            : {}),
          ...(dto.housingAllowance !== undefined
            ? { housingAllowance: Money.toDbString(dto.housingAllowance) }
            : {}),
          ...(dto.transportAllowance !== undefined
            ? { transportAllowance: Money.toDbString(dto.transportAllowance) }
            : {}),
          ...(dto.otherAllowance !== undefined
            ? { otherAllowance: Money.toDbString(dto.otherAllowance) }
            : {}),
          ...(dto.hourlyRate !== undefined
            ? { hourlyRate: Money.toUnitDbString(dto.hourlyRate) }
            : {}),
          ...(dto.fixedShift6hRate !== undefined
            ? { fixedShift6hRate: Money.toUnitDbString(dto.fixedShift6hRate) }
            : {}),
          ...(dto.fixedShift12hRate !== undefined
            ? {
                fixedShift12hRate: Money.toUnitDbString(dto.fixedShift12hRate),
              }
            : {}),
          ...(dto.fixedShift24hRate !== undefined
            ? {
                fixedShift24hRate: Money.toUnitDbString(dto.fixedShift24hRate),
              }
            : {}),
          ...(dto.onCallDailyRate !== undefined
            ? { onCallDailyRate: Money.toDbString(dto.onCallDailyRate) }
            : {}),
          ...(dto.standardMonthlyHours !== undefined
            ? { standardMonthlyHours: dto.standardMonthlyHours }
            : {}),
          ...(dto.currency !== undefined
            ? { currency: dto.currency.trim().toUpperCase() }
            : {}),
          ...(dto.bankName !== undefined
            ? { bankName: normalizeOptionalText(dto.bankName) }
            : {}),
          ...(dto.bankAccountNo !== undefined
            ? { bankAccountNo: normalizeOptionalText(dto.bankAccountNo) }
            : {}),
          ...(dto.iban !== undefined
            ? { iban: normalizeOptionalText(dto.iban) }
            : {}),
          ...(dto.socialInsuranceNo !== undefined
            ? {
                socialInsuranceNo: normalizeOptionalText(dto.socialInsuranceNo),
              }
            : {}),
          ...(dto.socialInsuranceRate !== undefined
            ? {
                socialInsuranceRate: Money.toRateDbString(
                  dto.socialInsuranceRate,
                ),
              }
            : {}),
          ...(dto.medicalInsuranceNo !== undefined
            ? {
                medicalInsuranceNo: normalizeOptionalText(
                  dto.medicalInsuranceNo,
                ),
              }
            : {}),
          ...(dto.medicalInsuranceClass !== undefined
            ? {
                medicalInsuranceClass: normalizeOptionalText(
                  dto.medicalInsuranceClass,
                ),
              }
            : {}),
          ...(dto.medicalInsuranceExpiry !== undefined
            ? {
                medicalInsuranceExpiry:
                  parseOptionalDate(
                    dto.medicalInsuranceExpiry,
                    'تاريخ انتهاء التأمين الصحي',
                  ) ?? null,
              }
            : {}),
          isTaxExempt: nextTaxExempt,
          isSocialInsuranceExempt: nextSocialExempt,
          payrollExemptionReason: nextExemptionReason,
          ...(dto.annualLeaveBalance !== undefined
            ? { annualLeaveBalance: dto.annualLeaveBalance }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      // Keep linked User profile & compensation synchronized
      if (saved.userId) {
        await tx.user.update({
          where: { id: saved.userId },
          data: {
            fullName: saved.fullName,
            departmentId: saved.departmentId,
            specialtyId: saved.specialtyId,
            biometricId: saved.biometricId,
            basicSalary: saved.basicSalary,
            housingAllowance: saved.housingAllowance,
            transportAllowance: saved.transportAllowance,
            otherAllowance: saved.otherAllowance,
            payBasis: saved.payBasis,
            hourlyRate: saved.hourlyRate,
            fixedShift6hRate: saved.fixedShift6hRate,
            fixedShift12hRate: saved.fixedShift12hRate,
            fixedShift24hRate: saved.fixedShift24hRate,
            standardMonthlyHours: saved.standardMonthlyHours,
            isTaxExempt: saved.isTaxExempt,
            isSocialInsuranceExempt: saved.isSocialInsuranceExempt,
            annualLeaveBalance: saved.annualLeaveBalance,
            isActive: saved.isActive,
          },
        });
      }

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_UPDATED',
        entity: 'Employee',
        entityId: saved.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          employeeNo: saved.employeeNo,
          fullName: saved.fullName,
          status: saved.status,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return this.findOne(hospitalId, id);
  }

  async remove(
    hospitalId: number,
    id: number,
    actorUserId: number,
    auditMeta?: EmployeeAuditMeta,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.employee.findFirst({
        where: { id, hospitalId, deletedAt: null },
        select: { id: true, employeeNo: true, fullName: true },
      });
      if (!existing) {
        throw new NotFoundException('ملف الموظف غير موجود في هذه المنشأة.');
      }

      await tx.employee.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          status: EmployeeStatus.TERMINATED,
        },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_DELETED',
        entity: 'Employee',
        entityId: existing.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          employeeNo: existing.employeeNo,
          fullName: existing.fullName,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return { deleted: true, id };
  }

  // =========================================================================
  // 3. OPTIONAL USER ACCOUNT LINK / CREATE / UNLINK
  // =========================================================================

  async linkUser(
    hospitalId: number,
    employeeId: number,
    actorUserId: number,
    dto: LinkEmployeeUserDto,
    auditMeta?: EmployeeAuditMeta,
  ) {
    if (!dto.userId && (!dto.username?.trim() || !dto.password)) {
      throw new BadRequestException(
        'حدد معرّف مستخدم قائم أو أدخل اسم المستخدم وكلمة المرور لإنشاء حساب جديد.',
      );
    }

    let committedAudit: Record<string, unknown> | null = null;
    await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const emp = await tx.employee.findFirst({
        where: { id: employeeId, hospitalId, deletedAt: null },
      });
      if (!emp) {
        throw new NotFoundException('ملف الموظف غير موجود في هذه المنشأة.');
      }
      if (emp.userId) {
        throw new ConflictException(
          'هذا الموظف مرتبط مسبقاً بحساب مستخدم؛ فك الارتباط أولاً إذا أردت تغييره.',
        );
      }

      let linkedUserId: number;
      if (dto.userId) {
        const targetUser = await tx.user.findFirst({
          where: { id: dto.userId, hospitalId, isDeleted: false },
          select: { id: true },
        });
        if (!targetUser) {
          throw new NotFoundException('المستخدم غير موجود في هذه المنشأة.');
        }
        const alreadyLinked = await tx.employee.findFirst({
          where: { userId: targetUser.id, id: { not: emp.id } },
          select: { id: true, employeeNo: true },
        });
        if (alreadyLinked) {
          throw new ConflictException(
            `حساب المستخدم مرتبط بالفعل بالموظف ${alreadyLinked.employeeNo}.`,
          );
        }
        linkedUserId = targetUser.id;
        await tx.user.update({
          where: { id: linkedUserId },
          data: {
            fullName: emp.fullName,
            departmentId: emp.departmentId,
            specialtyId: emp.specialtyId,
            biometricId: emp.biometricId,
            basicSalary: emp.basicSalary,
            housingAllowance: emp.housingAllowance,
            transportAllowance: emp.transportAllowance,
            otherAllowance: emp.otherAllowance,
            payBasis: emp.payBasis,
            hourlyRate: emp.hourlyRate,
            fixedShift6hRate: emp.fixedShift6hRate,
            fixedShift12hRate: emp.fixedShift12hRate,
            fixedShift24hRate: emp.fixedShift24hRate,
          },
        });
      } else {
        const username = dto.username!.trim();
        const dupUsername = await tx.user.findUnique({
          where: { username },
          select: { id: true },
        });
        if (dupUsername) {
          throw new ConflictException('اسم المستخدم مستخدم مسبقاً.');
        }
        const passwordHash = await bcrypt.hash(dto.password!, 10);
        const createdUser = await tx.user.create({
          data: {
            hospitalId,
            username,
            passwordHash,
            fullName: emp.fullName,
            email: emp.email,
            phone: emp.phone,
            departmentId: emp.departmentId,
            specialtyId: emp.specialtyId,
            isDoctor:
              dto.isDoctor ?? emp.staffCategory === StaffCategory.MEDICAL,
            jobRank: emp.medicalRank,
            biometricId: emp.biometricId,
            basicSalary: emp.basicSalary,
            housingAllowance: emp.housingAllowance,
            transportAllowance: emp.transportAllowance,
            otherAllowance: emp.otherAllowance,
            payBasis: emp.payBasis,
            hourlyRate: emp.hourlyRate,
            fixedShift6hRate: emp.fixedShift6hRate,
            fixedShift12hRate: emp.fixedShift12hRate,
            fixedShift24hRate: emp.fixedShift24hRate,
            annualLeaveBalance: emp.annualLeaveBalance,
            isTaxExempt: emp.isTaxExempt,
            isSocialInsuranceExempt: emp.isSocialInsuranceExempt,
            isActive: emp.isActive,
          },
        });

        const roleNames = dto.roleNames?.length ? dto.roleNames : ['RECEPTION'];
        const roles = await tx.role.findMany({
          where: { name: { in: roleNames } },
          select: { id: true },
        });
        for (const r of roles) {
          await tx.userRole.create({
            data: { userId: createdUser.id, roleId: r.id },
          });
        }
        linkedUserId = createdUser.id;
      }

      await tx.employee.update({
        where: { id: emp.id },
        data: { userId: linkedUserId },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_USER_LINKED',
        entity: 'Employee',
        entityId: emp.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { employeeNo: emp.employeeNo, linkedUserId },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return this.findOne(hospitalId, employeeId);
  }

  async unlinkUser(
    hospitalId: number,
    employeeId: number,
    actorUserId: number,
    auditMeta?: EmployeeAuditMeta,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const emp = await tx.employee.findFirst({
        where: { id: employeeId, hospitalId, deletedAt: null },
        select: { id: true, employeeNo: true, userId: true },
      });
      if (!emp) {
        throw new NotFoundException('ملف الموظف غير موجود في هذه المنشأة.');
      }
      if (!emp.userId) {
        throw new BadRequestException('الموظف غير مرتبط بحساب مستخدم.');
      }

      const previousUserId = emp.userId;
      await tx.employee.update({
        where: { id: emp.id },
        data: { userId: null },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_USER_UNLINKED',
        entity: 'Employee',
        entityId: emp.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { employeeNo: emp.employeeNo, previousUserId },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return this.findOne(hospitalId, employeeId);
  }

  // =========================================================================
  // 4. BULK EXCEL / ALTAMAM IMPORT
  // =========================================================================

  async bulkImport(
    hospitalId: number,
    actorUserId: number,
    dto: BulkImportEmployeesDto,
    auditMeta?: EmployeeAuditMeta,
  ) {
    const cfg = await this.getHrConfig(hospitalId);
    const items = dto.employees || [];
    const results = {
      total: items.length,
      imported: 0,
      updated: 0,
      errors: [] as string[],
    };

    const [departments, jobTitles, fullExisting] = await Promise.all([
      this.prisma.department.findMany({
        where: { hospitalId, isDeleted: false },
        select: { id: true, name: true },
      }),
      this.prisma.jobTitle.findMany({
        where: { hospitalId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.employee.findMany({
        where: { hospitalId },
        select: {
          id: true,
          employeeNo: true,
          altamamEmployeeNo: true,
          nationalId: true,
          departmentId: true,
          jobTitleId: true,
          phone: true,
          basicSalary: true,
          nationality: true,
          dateOfBirth: true,
        },
      }),
    ]);

    const deptMap = new Map<string, number>();
    for (const d of departments) deptMap.set(d.name.trim().toLowerCase(), d.id);
    const jobTitleMap = new Map<string, number>();
    for (const jt of jobTitles)
      jobTitleMap.set(jt.name.trim().toLowerCase(), jt.id);

    const empNoSet = new Set(fullExisting.map((e) => e.employeeNo));
    const byEmpNo = new Map(fullExisting.map((e) => [e.employeeNo, e]));
    const byAltamam = new Map(
      fullExisting
        .filter((e) => e.altamamEmployeeNo)
        .map((e) => [e.altamamEmployeeNo!, e]),
    );
    const byNational = new Map(
      fullExisting.filter((e) => e.nationalId).map((e) => [e.nationalId!, e]),
    );

    let autoSeq = 1;
    for (const e of fullExisting) {
      const m = e.employeeNo.match(/^EMP-(\d+)$/i);
      if (m) autoSeq = Math.max(autoSeq, Number(m[1]) + 1);
    }

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const rowNum = i + 1;
      try {
        let fName = normalizeOptionalText(row.firstNameAr) ?? '';
        let sName = normalizeOptionalText(row.secondNameAr) ?? '';
        let tName = normalizeOptionalText(row.thirdNameAr) ?? '';
        let lName = normalizeOptionalText(row.lastNameAr) ?? '';

        if (!fName && row.fullName) {
          const split = splitArabicFullName(
            normalizeOptionalText(row.fullName) ?? '',
          );
          fName = split.firstNameAr;
          sName = split.secondNameAr;
          tName = split.thirdNameAr;
          lName = split.lastNameAr;
        }
        if (!fName) {
          results.errors.push(`السطر ${rowNum}: اسم الموظف مفقود.`);
          continue;
        }

        let empNo = normalizeOptionalText(row.employeeNo) ?? '';
        if (!empNo) {
          empNo = `EMP-${String(autoSeq++).padStart(4, '0')}`;
          while (empNoSet.has(empNo)) {
            empNo = `EMP-${String(autoSeq++).padStart(4, '0')}`;
          }
        }
        const altamamNo = normalizeOptionalText(row.altamamEmployeeNo);
        const nationalId = normalizeOptionalText(row.nationalId);
        const phone = normalizeOptionalText(row.phone);

        let departmentId: number | null = null;
        const deptName = normalizeOptionalText(row.departmentName);
        if (deptName) {
          const key = deptName.toLowerCase();
          if (deptMap.has(key)) {
            departmentId = deptMap.get(key)!;
          } else {
            const newDept = await this.prisma.department.create({
              data: { hospitalId, name: deptName, nameAr: deptName },
            });
            deptMap.set(key, newDept.id);
            departmentId = newDept.id;
          }
        }

        let jobTitleId: number | null = null;
        const jtName = normalizeOptionalText(row.jobTitle);
        if (jtName) {
          const key = jtName.toLowerCase();
          if (jobTitleMap.has(key)) {
            jobTitleId = jobTitleMap.get(key)!;
          } else {
            const createdJt = await this.prisma.jobTitle.create({
              data: { hospitalId, name: jtName },
            });
            jobTitleMap.set(key, createdJt.id);
            jobTitleId = createdJt.id;
          }
        }

        const rawCat = (
          normalizeOptionalText(row.staffCategory) ?? ''
        ).toLowerCase();
        let staffCategory: StaffCategory = StaffCategory.ADMINISTRATIVE;
        if (
          rawCat.includes('طبي') ||
          rawCat.includes('دكتور') ||
          rawCat.includes('medical')
        ) {
          staffCategory = StaffCategory.MEDICAL;
        } else if (rawCat.includes('تمريض') || rawCat.includes('nurs')) {
          staffCategory = StaffCategory.NURSING;
        } else if (rawCat.includes('صيدل') || rawCat.includes('pharm')) {
          staffCategory = StaffCategory.PHARMACY;
        } else if (rawCat.includes('مختبر') || rawCat.includes('lab')) {
          staffCategory = StaffCategory.LABORATORY;
        } else if (rawCat.includes('أشعة') || rawCat.includes('rad')) {
          staffCategory = StaffCategory.RADIOLOGY;
        } else if (rawCat.includes('فني') || rawCat.includes('tech')) {
          staffCategory = StaffCategory.TECHNICAL;
        }

        const rawGender = (
          normalizeOptionalText(row.gender) ?? ''
        ).toLowerCase();
        const gender =
          rawGender.includes('أنث') ||
          rawGender.includes('انث') ||
          rawGender === 'female' ||
          rawGender === 'f'
            ? Gender.FEMALE
            : Gender.MALE;

        const hireDate = parseImportedDate(row.hireDate) ?? new Date();
        const dateOfBirth = parseImportedDate(row.dateOfBirth);
        const nationality = normalizeOptionalText(row.nationality);
        const qualification = normalizeOptionalText(row.qualification);
        const rawSalary = row.basicSalary ?? row.baseSalary ?? 0;
        const salaryNum = Number(rawSalary);
        const salaryStr =
          Number.isFinite(salaryNum) && salaryNum > 0
            ? Money.toDbString(salaryNum)
            : '0.000';

        const fullName = buildArabicFullName({
          firstNameAr: fName,
          secondNameAr: sName,
          thirdNameAr: tName,
          lastNameAr: lName,
        });

        const existingMatch =
          byEmpNo.get(empNo) ||
          (altamamNo ? byAltamam.get(altamamNo) : undefined) ||
          (nationalId ? byNational.get(nationalId) : undefined);

        if (existingMatch) {
          await this.prisma.employee.update({
            where: { id: existingMatch.id },
            data: {
              firstNameAr: fName,
              secondNameAr: sName,
              thirdNameAr: tName,
              lastNameAr: lName,
              fullName,
              altamamEmployeeNo: altamamNo || existingMatch.altamamEmployeeNo,
              phone: phone || existingMatch.phone,
              departmentId: departmentId || existingMatch.departmentId,
              jobTitleId: jobTitleId || existingMatch.jobTitleId,
              staffCategory,
              basicSalary:
                salaryNum > 0 ? salaryStr : existingMatch.basicSalary,
              nationalId: nationalId || existingMatch.nationalId,
              nationality: nationality || existingMatch.nationality,
              dateOfBirth: dateOfBirth || existingMatch.dateOfBirth,
            },
          });
          if (qualification) {
            const hasQual = await this.prisma.employeeQualification.findFirst({
              where: { employeeId: existingMatch.id, degree: qualification },
              select: { id: true },
            });
            if (!hasQual) {
              await this.prisma.employeeQualification.create({
                data: {
                  hospitalId,
                  employeeId: existingMatch.id,
                  degree: qualification,
                  institution: 'منظومة التمام / استيراد جماعي',
                },
              });
            }
          }
          results.updated += 1;
        } else {
          const created = await this.prisma.employee.create({
            data: {
              hospitalId,
              employeeNo: empNo,
              altamamEmployeeNo: altamamNo,
              firstNameAr: fName,
              secondNameAr: sName,
              thirdNameAr: tName,
              lastNameAr: lName,
              fullName,
              phone,
              departmentId: departmentId ?? departments[0]?.id ?? null,
              jobTitleId,
              staffCategory,
              gender,
              hireDate,
              dateOfBirth,
              basicSalary: salaryStr,
              currency: cfg.defaultCurrency,
              nationalId,
              nationality,
              status: EmployeeStatus.ACTIVE,
            },
          });
          if (qualification) {
            await this.prisma.employeeQualification.create({
              data: {
                hospitalId,
                employeeId: created.id,
                degree: qualification,
                institution: 'منظومة التمام / استيراد جماعي',
              },
            });
          }
          empNoSet.add(empNo);
          byEmpNo.set(empNo, created);
          if (altamamNo) byAltamam.set(altamamNo, created);
          if (nationalId) byNational.set(nationalId, created);
          results.imported += 1;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'خطأ في السجل';
        results.errors.push(`السطر ${rowNum}: ${msg}`);
      }
    }

    const audit = await this.prisma.$transaction((tx) =>
      appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEES_BULK_IMPORTED',
        entity: 'Employee',
        entityId: null,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: results,
      }),
    );
    publishCommittedCriticalAudit(audit);

    return results;
  }

  // =========================================================================
  // 5. QUALIFICATIONS, TRAINING COURSES & HR ACTIONS
  // =========================================================================

  async addQualification(
    hospitalId: number,
    employeeId: number,
    dto: CreateEmployeeQualificationDto,
  ) {
    await this.findOne(hospitalId, employeeId);
    return this.prisma.employeeQualification.create({
      data: {
        hospitalId,
        employeeId,
        degree: dto.degree.trim(),
        major: normalizeOptionalText(dto.major),
        institution: dto.institution.trim(),
        graduationYear: dto.graduationYear ?? null,
        grade: normalizeOptionalText(dto.grade),
        documentRef: normalizeOptionalText(dto.documentRef),
        notes: normalizeOptionalText(dto.notes),
      },
    });
  }

  async removeQualification(
    hospitalId: number,
    employeeId: number,
    qualificationId: number,
  ) {
    const row = await this.prisma.employeeQualification.findFirst({
      where: { id: qualificationId, employeeId, hospitalId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('المؤهل العلمي غير موجود.');
    }
    return this.prisma.employeeQualification.delete({ where: { id: row.id } });
  }

  async addTrainingCourse(
    hospitalId: number,
    employeeId: number,
    dto: CreateEmployeeTrainingCourseDto,
  ) {
    await this.findOne(hospitalId, employeeId);
    return this.prisma.employeeTrainingCourse.create({
      data: {
        hospitalId,
        employeeId,
        courseName: dto.courseName.trim(),
        provider: dto.provider.trim(),
        completionDate: parseOptionalDate(
          dto.completionDate,
          'تاريخ إتمام الدورة',
        ),
        hoursCount: dto.hoursCount ?? null,
        certificateNo: normalizeOptionalText(dto.certificateNo),
        documentRef: normalizeOptionalText(dto.documentRef),
        notes: normalizeOptionalText(dto.notes),
      },
    });
  }

  async removeTrainingCourse(
    hospitalId: number,
    employeeId: number,
    courseId: number,
  ) {
    const row = await this.prisma.employeeTrainingCourse.findFirst({
      where: { id: courseId, employeeId, hospitalId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('الدورة التدريبية غير موجودة.');
    }
    return this.prisma.employeeTrainingCourse.delete({ where: { id: row.id } });
  }

  async listActions(hospitalId: number, employeeId: number) {
    await this.findOne(hospitalId, employeeId);
    return this.prisma.employeeAction.findMany({
      where: { hospitalId, employeeId },
      include: { approvedBy: { select: { id: true, fullName: true } } },
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    });
  }

  async createAction(
    hospitalId: number,
    employeeId: number,
    actorUserId: number,
    dto: CreateEmployeeActionDto,
    auditMeta?: EmployeeAuditMeta,
  ) {
    await this.findOne(hospitalId, employeeId);
    const effectiveDate = parseOptionalDate(
      dto.effectiveDate,
      'تاريخ سريان الإجراء',
    )!;

    let committedAudit: Record<string, unknown> | null = null;
    const action = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const saved = await tx.employeeAction.create({
        data: {
          hospitalId,
          employeeId,
          actionType: dto.actionType,
          fromValue: normalizeOptionalText(dto.fromValue),
          toValue: normalizeOptionalText(dto.toValue),
          effectiveDate,
          notes: normalizeOptionalText(dto.notes),
          approvedById: actorUserId,
        },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_ACTION_RECORDED',
        entity: 'EmployeeAction',
        entityId: saved.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          employeeId,
          actionType: saved.actionType,
          effectiveDate: saved.effectiveDate.toISOString(),
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return action;
  }

  // =========================================================================
  // 6. ENCRYPTED EMPLOYEE DOCUMENTS (SEC05: ClamAV + AES-256-GCM)
  // =========================================================================

  async uploadDocument(
    hospitalId: number,
    employeeId: number,
    actorUserId: number,
    file: UploadedAttachmentFile,
    meta: CreateEmployeeDocumentMetaDto,
    auditMeta?: EmployeeAuditMeta,
  ) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('ملف الوثيقة فارغ أو غير صالح.');
    }
    if (file.buffer.length > MAX_HR_DOCUMENT_BYTES) {
      throw new PayloadTooLargeException(
        'حجم الوثيقة يتجاوز الحد الأقصى المسموح (20 ميجابايت).',
      );
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_DOCUMENT_EXTS.has(ext)) {
      throw new BadRequestException(
        'امتداد الملف غير مسموح. الصيغ المقبولة: PDF, JPG, PNG, WEBP, DOC/X, XLS/X.',
      );
    }

    await this.findOne(hospitalId, employeeId);

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const avScan = await scanAttachmentBuffer(file.buffer);
    if (!avScan.clean) {
      const blockedAudit = await this.prisma.$transaction((tx) =>
        appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: actorUserId,
          action: 'SECURITY_MALWARE_BLOCKED',
          entity: 'EmployeeDocument',
          entityId: employeeId,
          ipAddress: auditMeta?.ipAddress,
          clientName: auditMeta?.clientName,
          details: {
            employeeId,
            sha256,
            signature: avScan.signature,
            avScanEngine: avScan.engine,
          },
        }),
      );
      publishCommittedCriticalAudit(blockedAudit);
      throw new UnprocessableEntityException(
        `تم رفض الوثيقة لاكتشاف برمجية خبيثة (${avScan.signature ?? 'MALWARE'}).`,
      );
    }

    const root = this.resolveDocumentRoot(auditMeta?.configRoot);
    const storagePath = `${hospitalId}/${employeeId}/${randomUUID()}${ext}`;
    const finalPath = path.resolve(root, storagePath);
    if (!this.isInsideRoot(root, finalPath)) {
      throw new BadRequestException('مسار حفظ الوثيقة غير صالح.');
    }

    const encryptedBytes = encryptAttachmentBuffer(file.buffer);
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.tmp`;
    fs.writeFileSync(tmpPath, encryptedBytes, { flag: 'wx' });

    let movedToFinal = false;
    try {
      fs.renameSync(tmpPath, finalPath);
      movedToFinal = true;

      let committedAudit: Record<string, unknown> | null = null;
      const created = await this.prisma.$transaction(async (tx) => {
        committedAudit = null;
        const mimeType =
          file.mimetype || EXT_TO_MIME[ext] || 'application/octet-stream';
        const doc = await tx.employeeDocument.create({
          data: {
            hospitalId,
            employeeId,
            title: meta.title.trim(),
            category: normalizeOptionalText(meta.category),
            storagePath,
            originalName: path.basename(file.originalname || `doc${ext}`),
            mimeType,
            fileSize: file.buffer.length,
            sha256,
            isEncrypted: true,
            expiryDate: parseOptionalDate(
              meta.expiryDate,
              'تاريخ انتهاء الوثيقة',
            ),
            alertDaysBefore: meta.alertDaysBefore ?? 30,
            isVerified: Boolean(meta.isVerified),
            isMandatory: Boolean(meta.isMandatory),
            notes: normalizeOptionalText(meta.notes),
            uploadedById: actorUserId,
          },
        });

        const auditFields = {
          hospitalId,
          userId: actorUserId,
          action: 'EMPLOYEE_DOCUMENT_UPLOADED',
          entity: 'EmployeeDocument',
          entityId: doc.id,
          ipAddress: auditMeta?.ipAddress,
          clientName: auditMeta?.clientName,
          details: {
            employeeId,
            title: doc.title,
            sha256,
            sizeBytes: file.buffer.length,
            avScanEngine: avScan.engine,
            encryptedAtRest: true,
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return doc;
      });

      if (committedAudit) publishCommittedCriticalAudit(committedAudit);
      return created;
    } catch (err) {
      try {
        fs.rmSync(movedToFinal ? finalPath : tmpPath, { force: true });
      } catch {
        // Ignore cleanup failure
      }
      throw err;
    }
  }

  async downloadDocument(
    hospitalId: number,
    employeeId: number,
    docId: number,
    actorUserId: number,
    auditMeta?: EmployeeAuditMeta,
  ) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: docId, employeeId, hospitalId },
    });
    if (!doc) {
      throw new NotFoundException('الوثيقة غير موجودة في هذه المنشأة.');
    }
    if (
      !doc.storagePath ||
      doc.storagePath.includes('..') ||
      path.isAbsolute(doc.storagePath)
    ) {
      throw new ConflictException('مرجع تخزين الوثيقة غير صالح.');
    }

    const root = this.resolveDocumentRoot(auditMeta?.configRoot);
    const target = path.resolve(root, doc.storagePath);
    if (
      !fs.existsSync(root) ||
      !fs.existsSync(target) ||
      !this.isInsideRoot(root, target)
    ) {
      throw new ConflictException('ملف الوثيقة مفقود أو مساره غير مطابق.');
    }
    const realRoot = fs.realpathSync(root);
    const realTarget = fs.realpathSync(target);
    if (!this.isInsideRoot(realRoot, realTarget)) {
      throw new ConflictException('سلامة مسار الوثيقة غير مطابقة.');
    }

    const stored = fs.readFileSync(realTarget);
    const { plaintext } = decryptAttachmentBuffer(stored);
    const actualSha = createHash('sha256').update(plaintext).digest('hex');
    if (actualSha !== doc.sha256) {
      throw new ConflictException('بصمة الوثيقة المفكوك تشفيرها غير مطابقة.');
    }

    const audit = await this.prisma.$transaction((tx) =>
      appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_DOCUMENT_DOWNLOADED',
        entity: 'EmployeeDocument',
        entityId: doc.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          employeeId,
          sha256: doc.sha256,
          sizeBytes: plaintext.length,
        },
      }),
    );
    publishCommittedCriticalAudit(audit);

    return {
      buffer: plaintext,
      mimeType: doc.mimeType,
      originalName: doc.originalName,
      sha256: doc.sha256,
    };
  }

  async removeDocument(
    hospitalId: number,
    employeeId: number,
    docId: number,
    actorUserId: number,
    auditMeta?: EmployeeAuditMeta,
  ) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: docId, employeeId, hospitalId },
    });
    if (!doc) {
      throw new NotFoundException('الوثيقة غير موجودة في هذه المنشأة.');
    }

    const audit = await this.prisma.$transaction(async (tx) => {
      await tx.employeeDocument.delete({ where: { id: doc.id } });
      return appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_DOCUMENT_DELETED',
        entity: 'EmployeeDocument',
        entityId: doc.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { employeeId, title: doc.title },
      });
    });
    publishCommittedCriticalAudit(audit);

    if (doc.storagePath && !doc.storagePath.includes('..')) {
      const root = this.resolveDocumentRoot(auditMeta?.configRoot);
      const target = path.resolve(root, doc.storagePath);
      if (this.isInsideRoot(root, target) && fs.existsSync(target)) {
        try {
          fs.rmSync(target, { force: true });
        } catch {
          // Best-effort physical cleanup
        }
      }
    }

    return { deleted: true, id: doc.id };
  }

  // =========================================================================
  // 7. ORG STRUCTURE: SECTIONS & JOB TITLES
  // =========================================================================

  async listSections(hospitalId: number, departmentId?: number) {
    return this.prisma.section.findMany({
      where: {
        hospitalId,
        isActive: true,
        ...(departmentId ? { departmentId } : {}),
      },
      include: {
        department: { select: { id: true, name: true, nameEn: true } },
        _count: { select: { employees: true } },
      },
      orderBy: [{ departmentId: 'asc' }, { id: 'asc' }],
    });
  }

  async createSection(hospitalId: number, dto: CreateSectionDto) {
    const dept = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, hospitalId, isDeleted: false },
      select: { id: true },
    });
    if (!dept) {
      throw new NotFoundException(
        'القسم أو الإدارة غير موجودة في هذه المنشأة.',
      );
    }
    return this.prisma.section.create({
      data: {
        hospitalId,
        departmentId: dto.departmentId,
        name: dto.name.trim(),
        nameEn: normalizeOptionalText(dto.nameEn),
        code: normalizeOptionalText(dto.code),
      },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async updateSection(hospitalId: number, id: number, dto: UpdateSectionDto) {
    const existing = await this.prisma.section.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('الشعبة غير موجودة في هذه المنشأة.');
    }
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!dept) {
        throw new NotFoundException('الإدارة غير موجودة في هذه المنشأة.');
      }
    }
    return this.prisma.section.update({
      where: { id: existing.id },
      data: {
        ...(dto.departmentId !== undefined
          ? { departmentId: dto.departmentId }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: normalizeOptionalText(dto.nameEn) }
          : {}),
        ...(dto.code !== undefined
          ? { code: normalizeOptionalText(dto.code) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteSection(hospitalId: number, id: number) {
    const existing = await this.prisma.section.findFirst({
      where: { id, hospitalId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('الشعبة غير موجودة في هذه المنشأة.');
    }
    return this.prisma.section.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  async listJobTitles(hospitalId: number) {
    return this.prisma.jobTitle.findMany({
      where: { hospitalId, isActive: true },
      include: { _count: { select: { employees: true } } },
      orderBy: [{ level: 'asc' }, { id: 'asc' }],
    });
  }

  async createJobTitle(hospitalId: number, dto: CreateJobTitleDto) {
    return this.prisma.jobTitle.create({
      data: {
        hospitalId,
        name: dto.name.trim(),
        nameEn: normalizeOptionalText(dto.nameEn),
        code: normalizeOptionalText(dto.code),
        level: dto.level ?? null,
      },
    });
  }

  async updateJobTitle(hospitalId: number, id: number, dto: UpdateJobTitleDto) {
    const existing = await this.prisma.jobTitle.findFirst({
      where: { id, hospitalId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('المسمى الوظيفي غير موجود في هذه المنشأة.');
    }
    return this.prisma.jobTitle.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: normalizeOptionalText(dto.nameEn) }
          : {}),
        ...(dto.code !== undefined
          ? { code: normalizeOptionalText(dto.code) }
          : {}),
        ...(dto.level !== undefined ? { level: dto.level } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteJobTitle(hospitalId: number, id: number) {
    const existing = await this.prisma.jobTitle.findFirst({
      where: { id, hospitalId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('المسمى الوظيفي غير موجود في هذه المنشأة.');
    }
    return this.prisma.jobTitle.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }
}
