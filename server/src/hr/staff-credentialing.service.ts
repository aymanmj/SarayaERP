import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  CreateStaffCredentialDto,
  SuspendStaffCredentialDto,
} from './dto/staff-credential.dto';

export interface CredentialAuditMeta {
  ipAddress?: string;
  clientName?: string;
}

export type ComplianceState =
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'PENDING_VERIFICATION'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'SUPERSEDED';

const CREDENTIAL_TYPE_LABELS_AR: Record<string, string> = {
  PRACTICE_LICENSE: 'إذن مزاولة المهنة',
  HEALTH_CERTIFICATE: 'الشهادة الصحية (الخلو من الأمراض)',
  MEDICAL_COUNCIL_CERT: 'شهادة القيد بالمجلس الطبي/النقابة',
  SPECIALTY_BOARD_CERT: 'شهادة التخصص الطبي',
  BLS_ACLS_CERT: 'شهادة الإنعاش القلبي الرئوي',
  RADIATION_SAFETY_PERMIT: 'تصريح الوقاية الإشعاعية',
  OTHER: 'وثيقة مهنية إلزامية',
};

const USER_LITE = {
  id: true,
  fullName: true,
  username: true,
  isDoctor: true,
  jobRank: true,
} as const;

const CREDENTIAL_INCLUDE = {
  user: { select: USER_LITE },
  createdBy: { select: { id: true, fullName: true } },
  verifiedBy: { select: { id: true, fullName: true } },
  suspendedBy: { select: { id: true, fullName: true } },
};

export function computeCredentialCompliance(
  cred: {
    status: string;
    expiryDate: Date;
    alertDaysBefore: number;
  },
  asOf: Date = new Date(),
): { complianceStatus: ComplianceState; daysUntilExpiry: number } {
  const diffMs = cred.expiryDate.getTime() - asOf.getTime();
  const daysUntilExpiry = Math.ceil(diffMs / 86_400_000);

  if (cred.status === 'PENDING_VERIFICATION') {
    return { complianceStatus: 'PENDING_VERIFICATION', daysUntilExpiry };
  }
  if (cred.status === 'SUSPENDED') {
    return { complianceStatus: 'SUSPENDED', daysUntilExpiry };
  }
  if (cred.status === 'REVOKED') {
    return { complianceStatus: 'REVOKED', daysUntilExpiry };
  }
  if (cred.status === 'SUPERSEDED') {
    return { complianceStatus: 'SUPERSEDED', daysUntilExpiry };
  }

  if (cred.expiryDate.getTime() < asOf.getTime()) {
    return { complianceStatus: 'EXPIRED', daysUntilExpiry };
  }
  if (daysUntilExpiry <= cred.alertDaysBefore) {
    return { complianceStatus: 'EXPIRING_SOON', daysUntilExpiry };
  }
  return { complianceStatus: 'VALID', daysUntilExpiry };
}

export interface StaffEligibilityResult {
  eligible: boolean;
  strictPolicyEnabled: boolean;
  reasons: string[];
  activePracticeLicenseId: number | null;
  activeHealthCertificateId: number | null;
}

type PrismaLikeForEligibility = {
  staffCredential?: {
    findMany: PrismaService['staffCredential']['findMany'];
  };
  systemSetting?: {
    findFirst: PrismaService['systemSetting']['findFirst'];
  };
};

/**
 * Shared clinical & rostering eligibility check (CAP12).
 * - Always blocks scheduling if any registered mandatory credential type (e.g. PRACTICE_LICENSE or HEALTH_CERTIFICATE)
 *   has no valid non-expired ACTIVE record covering `asOfDate`.
 * - If hospital `SystemSetting` `hr.requireVerifiedCredentials === 'true'`, ALSO blocks scheduling when either
 *   PRACTICE_LICENSE or HEALTH_CERTIFICATE has never been registered/verified at all.
 */
export async function evaluateStaffSchedulingEligibility(
  prismaLike: PrismaLikeForEligibility,
  hospitalId: number,
  userId: number,
  asOfDate: Date = new Date(),
): Promise<StaffEligibilityResult> {
  if (!prismaLike.staffCredential?.findMany) {
    return {
      eligible: true,
      strictPolicyEnabled: false,
      reasons: [],
      activePracticeLicenseId: null,
      activeHealthCertificateId: null,
    };
  }

  const [credentials, strictSetting] = await Promise.all([
    prismaLike.staffCredential.findMany({
      where: {
        hospitalId,
        userId,
        status: { not: 'SUPERSEDED' },
      },
      orderBy: { expiryDate: 'desc' },
    }),
    prismaLike.systemSetting?.findFirst
      ? prismaLike.systemSetting.findFirst({
          where: { hospitalId, key: 'hr.requireVerifiedCredentials' },
          select: { value: true },
        })
      : Promise.resolve(null),
  ]);

  const strictPolicyEnabled = strictSetting?.value === 'true';
  const reasons: string[] = [];

  const isValidOnDate = (c: { status: string; expiryDate: Date }) =>
    c.status === 'ACTIVE' && c.expiryDate.getTime() >= asOfDate.getTime();

  const activePracticeLicense =
    credentials.find(
      (c) => c.credentialType === 'PRACTICE_LICENSE' && isValidOnDate(c),
    ) ?? null;

  const activeHealthCertificate =
    credentials.find(
      (c) => c.credentialType === 'HEALTH_CERTIFICATE' && isValidOnDate(c),
    ) ?? null;

  // 1. Check every mandatory credential type present on file
  const mandatoryTypesOnFile = new Set<string>();
  for (const cred of credentials) {
    if (cred.isMandatory) {
      mandatoryTypesOnFile.add(cred.credentialType);
    }
  }

  for (const credType of mandatoryTypesOnFile) {
    const group = credentials.filter(
      (c) => c.credentialType === credType && c.isMandatory,
    );
    const hasValid = group.some((c) => isValidOnDate(c));
    if (!hasValid) {
      const label = CREDENTIAL_TYPE_LABELS_AR[credType] || credType;
      const latest = group[0];
      if (latest.status === 'REVOKED') {
        reasons.push(`تم إلغاء ${label} نهائيًا ولا تجوز الجدولة`);
      } else if (latest.status === 'SUSPENDED') {
        reasons.push(`${label} معلّق حاليًا ولا تجوز الجدولة`);
      } else if (latest.status === 'PENDING_VERIFICATION') {
        reasons.push(`${label} بانتظار الاعتماد والتحقق قبل السماح بالجدولة`);
      } else {
        reasons.push(
          `انتهت صلاحية ${label} بتاريخ ${latest.expiryDate.toISOString().slice(0, 10)} ولا تجوز الجدولة قبل التجديد`,
        );
      }
    }
  }

  // 2. Strict hospital policy requires BOTH valid Practice Permit and Disease-Free Health Certificate
  if (strictPolicyEnabled) {
    if (
      !activePracticeLicense &&
      !mandatoryTypesOnFile.has('PRACTICE_LICENSE')
    ) {
      reasons.push(
        'السياسة الإلزامية للمستشفى تشترط وجود إذن مزاولة مهنة سارٍ ومعتمد قبل الجدولة',
      );
    }
    if (
      !activeHealthCertificate &&
      !mandatoryTypesOnFile.has('HEALTH_CERTIFICATE')
    ) {
      reasons.push(
        'السياسة الإلزامية للمستشفى تشترط وجود شهادة صحية (الخلو من الأمراض) سارية ومعتمدة قبل الجدولة',
      );
    }
  }

  return {
    eligible: reasons.length === 0,
    strictPolicyEnabled,
    reasons,
    activePracticeLicenseId: activePracticeLicense?.id ?? null,
    activeHealthCertificateId: activeHealthCertificate?.id ?? null,
  };
}

export async function assertStaffSchedulingEligibility(
  prismaLike: PrismaLikeForEligibility,
  hospitalId: number,
  userId: number,
  asOfDate: Date = new Date(),
): Promise<void> {
  const result = await evaluateStaffSchedulingEligibility(
    prismaLike,
    hospitalId,
    userId,
    asOfDate,
  );
  if (!result.eligible) {
    throw new ConflictException(
      `تم منع الجدولة لعدم استيفاء تراخيص الكادر الطبي: ${result.reasons.join('؛ ')}`,
    );
  }
}

@Injectable()
export class StaffCredentialingService {
  constructor(private readonly prisma: PrismaService) {}

  async createCredential(
    hospitalId: number,
    actorId: number,
    dto: CreateStaffCredentialDto,
    auditMeta?: CredentialAuditMeta,
  ) {
    const issueDate = new Date(dto.issueDate);
    const expiryDate = new Date(dto.expiryDate);
    if (
      Number.isNaN(issueDate.getTime()) ||
      Number.isNaN(expiryDate.getTime())
    ) {
      throw new BadRequestException('تاريخ الإصدار أو الانتهاء غير صالح');
    }
    if (expiryDate.getTime() <= issueDate.getTime()) {
      throw new BadRequestException(
        'يجب أن يكون تاريخ انتهاء الترخيص/الشهادة بعد تاريخ الإصدار',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const staff = await tx.user.findFirst({
        where: {
          id: dto.userId,
          isDeleted: false,
          OR: [
            { hospitalId },
            {
              accessibleHospitals: {
                some: { hospitalId },
              },
            },
          ],
        },
        select: { id: true },
      });
      if (!staff) {
        throw new NotFoundException('الموظف غير موجود ضمن هذه المنشأة');
      }

      const record = await tx.staffCredential.create({
        data: {
          hospitalId,
          userId: dto.userId,
          staffCategory: dto.staffCategory,
          credentialType: dto.credentialType,
          title: dto.title.trim(),
          licenseNumber: dto.licenseNumber.trim(),
          issuingAuthority: dto.issuingAuthority.trim(),
          specialty: dto.specialty?.trim() || null,
          issueDate,
          expiryDate,
          alertDaysBefore: dto.alertDaysBefore ?? 30,
          isMandatory: dto.isMandatory ?? true,
          status: 'PENDING_VERIFICATION',
          documentRef: dto.documentRef?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
        },
        include: CREDENTIAL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'STAFF_CREDENTIAL_CREATED',
        entity: 'StaffCredential',
        entityId: record.id,
        hospitalId,
        userId: actorId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          targetUserId: record.userId,
          staffCategory: record.staffCategory,
          credentialType: record.credentialType,
          licenseNumber: record.licenseNumber,
          expiryDate: record.expiryDate.toISOString(),
        },
      });

      return record;
    });

    publishCommittedCriticalAudit({
      action: 'STAFF_CREDENTIAL_CREATED',
      entity: 'StaffCredential',
      entityId: created.id,
      hospitalId,
      userId: actorId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        targetUserId: created.userId,
        credentialType: created.credentialType,
      },
    });

    return {
      ...created,
      ...computeCredentialCompliance(created),
    };
  }

  async verifyCredential(
    hospitalId: number,
    credentialId: number,
    verifierId: number,
    auditMeta?: CredentialAuditMeta,
  ) {
    const verified = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "StaffCredential" WHERE id = ${credentialId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.staffCredential.findFirst({
        where: { id: credentialId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('الترخيص أو الشهادة الصحية غير موجودة');
      }
      if (existing.status !== 'PENDING_VERIFICATION') {
        throw new ConflictException(
          `لا يمكن اعتماد وثيقة في حالة ${existing.status}`,
        );
      }
      if (existing.userId === verifierId) {
        throw new ForbiddenException(
          'لا يجوز لصاحب الترخيص اعتماد ترخيصه أو شهادته الصحية بنفسه',
        );
      }
      if (existing.createdById === verifierId) {
        throw new ForbiddenException(
          'لا يجوز لمدخل بيانات الترخيص اعتماده بنفسه (رقابة 4 عيون)',
        );
      }

      const now = new Date();
      // Supersede any older ACTIVE credential of the exact same type for this staff member
      await tx.staffCredential.updateMany({
        where: {
          hospitalId,
          userId: existing.userId,
          credentialType: existing.credentialType,
          status: 'ACTIVE',
          id: { not: existing.id },
        },
        data: { status: 'SUPERSEDED' },
      });

      const saved = await tx.staffCredential.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          verifiedById: verifierId,
          verifiedAt: now,
        },
        include: CREDENTIAL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'STAFF_CREDENTIAL_VERIFIED',
        entity: 'StaffCredential',
        entityId: saved.id,
        hospitalId,
        userId: verifierId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          targetUserId: saved.userId,
          credentialType: saved.credentialType,
          licenseNumber: saved.licenseNumber,
        },
      });

      return saved;
    });

    publishCommittedCriticalAudit({
      action: 'STAFF_CREDENTIAL_VERIFIED',
      entity: 'StaffCredential',
      entityId: verified.id,
      hospitalId,
      userId: verifierId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        targetUserId: verified.userId,
        credentialType: verified.credentialType,
      },
    });

    return {
      ...verified,
      ...computeCredentialCompliance(verified),
    };
  }

  async suspendOrRevokeCredential(
    hospitalId: number,
    credentialId: number,
    actorId: number,
    dto: SuspendStaffCredentialDto,
    auditMeta?: CredentialAuditMeta,
  ) {
    const nextStatus = dto.action === 'REVOKE' ? 'REVOKED' : 'SUSPENDED';
    const auditAction =
      dto.action === 'REVOKE'
        ? 'STAFF_CREDENTIAL_REVOKED'
        : 'STAFF_CREDENTIAL_SUSPENDED';

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "StaffCredential" WHERE id = ${credentialId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.staffCredential.findFirst({
        where: { id: credentialId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('الترخيص أو الشهادة الصحية غير موجودة');
      }
      if (existing.status === 'REVOKED') {
        throw new ConflictException('تم إلغاء هذه الوثيقة نهائيًا مسبقًا');
      }
      if (existing.status === 'SUPERSEDED') {
        throw new ConflictException('هذه الوثيقة مستبدلة مسبقًا بترخيص أحدث');
      }

      const saved = await tx.staffCredential.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          suspendedById: actorId,
          suspendedAt: new Date(),
          suspensionReason: dto.reason.trim(),
        },
        include: CREDENTIAL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action: auditAction,
        entity: 'StaffCredential',
        entityId: saved.id,
        hospitalId,
        userId: actorId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          targetUserId: saved.userId,
          credentialType: saved.credentialType,
          reason: dto.reason.trim(),
        },
      });

      return saved;
    });

    publishCommittedCriticalAudit({
      action: auditAction,
      entity: 'StaffCredential',
      entityId: updated.id,
      hospitalId,
      userId: actorId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { targetUserId: updated.userId, status: nextStatus },
    });

    return {
      ...updated,
      ...computeCredentialCompliance(updated),
    };
  }

  async reinstateCredential(
    hospitalId: number,
    credentialId: number,
    actorId: number,
    auditMeta?: CredentialAuditMeta,
  ) {
    const reinstated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "StaffCredential" WHERE id = ${credentialId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.staffCredential.findFirst({
        where: { id: credentialId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('الترخيص أو الشهادة الصحية غير موجودة');
      }
      if (existing.status !== 'SUSPENDED') {
        throw new ConflictException(
          'يمكن إعادة التفعيل فقط للتراخيص المعلّقة مؤقتًا (وليس الملغاة نهائيًا)',
        );
      }
      if (!existing.verifiedById || !existing.verifiedAt) {
        throw new ConflictException(
          'الوثيقة غير معتمدة مسبقًا ولا يمكن إعادة تفعيلها مباشرة',
        );
      }
      if (existing.expiryDate.getTime() < Date.now()) {
        throw new ConflictException(
          'انتهت صلاحية الوثيقة ولا يمكن إعادة تفعيلها؛ يرجى إدخال تجديد جديد',
        );
      }

      const saved = await tx.staffCredential.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          suspendedById: null,
          suspendedAt: null,
          suspensionReason: null,
        },
        include: CREDENTIAL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'STAFF_CREDENTIAL_REINSTATED',
        entity: 'StaffCredential',
        entityId: saved.id,
        hospitalId,
        userId: actorId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          targetUserId: saved.userId,
          credentialType: saved.credentialType,
        },
      });

      return saved;
    });

    publishCommittedCriticalAudit({
      action: 'STAFF_CREDENTIAL_REINSTATED',
      entity: 'StaffCredential',
      entityId: reinstated.id,
      hospitalId,
      userId: actorId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { targetUserId: reinstated.userId },
    });

    return {
      ...reinstated,
      ...computeCredentialCompliance(reinstated),
    };
  }

  async listCredentials(
    hospitalId: number,
    filters?: {
      userId?: number;
      staffCategory?: string;
      credentialType?: string;
      complianceStatus?: string;
    },
  ) {
    const where: Prisma.StaffCredentialWhereInput = { hospitalId };
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.staffCategory) where.staffCategory = filters.staffCategory;
    if (filters?.credentialType) where.credentialType = filters.credentialType;

    const rows = await this.prisma.staffCredential.findMany({
      where,
      include: CREDENTIAL_INCLUDE,
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
    });

    const now = new Date();
    const enriched = rows.map((row) => ({
      ...row,
      ...computeCredentialCompliance(row, now),
    }));

    if (filters?.complianceStatus) {
      return enriched.filter(
        (r) => r.complianceStatus === filters.complianceStatus,
      );
    }
    return enriched;
  }

  async getComplianceAlerts(hospitalId: number) {
    const all = await this.listCredentials(hospitalId);
    const activeSet = all.filter((r) => r.status !== 'SUPERSEDED');

    const expired = activeSet.filter((r) => r.complianceStatus === 'EXPIRED');
    const expiringSoon = activeSet.filter(
      (r) => r.complianceStatus === 'EXPIRING_SOON',
    );
    const suspendedOrRevoked = activeSet.filter(
      (r) =>
        r.complianceStatus === 'SUSPENDED' || r.complianceStatus === 'REVOKED',
    );
    const pendingVerification = activeSet.filter(
      (r) => r.complianceStatus === 'PENDING_VERIFICATION',
    );

    return {
      summary: {
        totalActiveRecords: activeSet.length,
        expiredCount: expired.length,
        expiringSoonCount: expiringSoon.length,
        suspendedOrRevokedCount: suspendedOrRevoked.length,
        pendingVerificationCount: pendingVerification.length,
        practiceLicenseAlerts: [...expired, ...expiringSoon].filter(
          (r) => r.credentialType === 'PRACTICE_LICENSE',
        ).length,
        healthCertificateAlerts: [...expired, ...expiringSoon].filter(
          (r) => r.credentialType === 'HEALTH_CERTIFICATE',
        ).length,
      },
      expired,
      expiringSoon,
      suspendedOrRevoked,
      pendingVerification,
    };
  }

  async checkEligibility(
    hospitalId: number,
    userId: number,
    asOfDate?: Date,
  ): Promise<StaffEligibilityResult> {
    return evaluateStaffSchedulingEligibility(
      this.prisma,
      hospitalId,
      userId,
      asOfDate ?? new Date(),
    );
  }
}
