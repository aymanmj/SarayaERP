// server/src/surgery/surgical-package.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  CreateSurgicalPackageDto,
  EnrollEncounterPackageDto,
  SettlePackageEnrollmentDto,
} from './dto/surgical-package.dto';
import {
  computePackageSettlementHash,
  mapChargeToPackageCategory,
  reconcileSurgicalPackage,
  type PackageCategory,
  type PackageCoverageMode,
} from './surgical-package.util';

const ADVISORY_LOCK_PACKAGES = 27025;

@Injectable()
export class SurgicalPackageService {
  constructor(private readonly prisma: PrismaService) {}

  async listPackages(hospitalId: number) {
    return this.prisma.surgicalPackage.findMany({
      where: { hospitalId, isActive: true },
      include: { inclusions: { orderBy: { category: 'asc' } } },
      orderBy: { id: 'desc' },
    });
  }

  async createPackage(
    hospitalId: number,
    createdById: number,
    dto: CreateSurgicalPackageDto,
  ) {
    const code = dto.code.trim().toUpperCase();
    const seenCats = new Set<string>();
    for (const inc of dto.inclusions) {
      if (seenCats.has(inc.category)) {
        throw new BadRequestException(`فئة الحزمة مكررة: ${inc.category}`);
      }
      seenCats.add(inc.category);
      if (
        inc.coverageMode === 'INCLUDED_CAPPED' &&
        (inc.capAmount === undefined || inc.capAmount < 0)
      ) {
        throw new BadRequestException(
          `يجب تحديد سقف مالي لفئة ${inc.category} عند اختيار INCLUDED_CAPPED.`,
        );
      }
    }

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const dup = await tx.surgicalPackage.findUnique({
        where: { hospitalId_code: { hospitalId, code } },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          `رمز الحزمة الجراحية مستخدم مسبقًا: ${code}`,
        );
      }

      const pkg = await tx.surgicalPackage.create({
        data: {
          hospitalId,
          code,
          name: dto.name.trim(),
          nameEn: dto.nameEn?.trim() || null,
          drgCode: dto.drgCode?.trim().toUpperCase() || null,
          description: dto.description?.trim() || null,
          packagePrice: Money.toDbString(dto.packagePrice),
          includedStayDays: dto.includedStayDays ?? 1,
          isActive: true,
          createdById,
          inclusions: {
            create: dto.inclusions.map((inc) => ({
              category: inc.category,
              coverageMode: inc.coverageMode,
              capAmount:
                inc.coverageMode === 'INCLUDED_CAPPED'
                  ? Money.toDbString(inc.capAmount ?? 0)
                  : null,
              notes: inc.notes?.trim() || null,
            })),
          },
        },
        include: { inclusions: { orderBy: { category: 'asc' } } },
      });

      const auditFields = {
        hospitalId,
        userId: createdById,
        action: 'SURGICAL_PACKAGE_CREATED',
        entity: 'SurgicalPackage',
        entityId: pkg.id,
        details: {
          code: pkg.code,
          drgCode: pkg.drgCode,
          packagePrice: Money.toDbString(pkg.packagePrice),
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return pkg;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async listEnrollments(hospitalId: number, encounterId?: number) {
    return this.prisma.encounterPackageEnrollment.findMany({
      where: {
        hospitalId,
        ...(encounterId ? { encounterId } : {}),
      },
      include: {
        surgicalPackage: {
          select: { id: true, code: true, name: true, drgCode: true },
        },
        encounter: {
          select: {
            id: true,
            patient: { select: { id: true, fullName: true, mrn: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }

  async enrollEncounter(
    hospitalId: number,
    enrolledById: number,
    dto: EnrollEncounterPackageDto,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_PACKAGES}::int, ${hospitalId}::int)`;

      const enc = await tx.encounter.findFirst({
        where: { id: dto.encounterId, hospitalId },
        select: { id: true },
      });
      if (!enc) {
        throw new NotFoundException('الزيارة غير موجودة في هذه المنشأة.');
      }

      const pkg = await tx.surgicalPackage.findFirst({
        where: { id: dto.packageId, hospitalId, isActive: true },
      });
      if (!pkg) {
        throw new NotFoundException('الحزمة الجراحية غير موجودة أو غير نشطة.');
      }

      const existing = await tx.encounterPackageEnrollment.findFirst({
        where: {
          hospitalId,
          encounterId: enc.id,
          status: { in: ['ACTIVE', 'SETTLED'] },
        },
        select: { id: true, status: true },
      });
      if (existing) {
        throw new ConflictException(
          'توجد حزمة جراحية مفعّلة أو مسوّاة بالفعل على هذه الزيارة.',
        );
      }

      const enrollment = await tx.encounterPackageEnrollment.create({
        data: {
          hospitalId,
          encounterId: enc.id,
          packageId: pkg.id,
          status: 'ACTIVE',
          packagePriceSnapshot: Money.toDbString(pkg.packagePrice),
          enrolledById,
          notes: dto.notes?.trim() || null,
        },
        include: {
          surgicalPackage: { include: { inclusions: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: enrolledById,
        action: 'ENCOUNTER_PACKAGE_ENROLLED',
        entity: 'EncounterPackageEnrollment',
        entityId: enrollment.id,
        details: {
          encounterId: enc.id,
          packageCode: pkg.code,
          packagePriceSnapshot: Money.toDbString(pkg.packagePrice),
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return enrollment;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  private async computeLiveReconciliation(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    enrollmentId: number,
  ) {
    const enrollment = await tx.encounterPackageEnrollment.findFirst({
      where: { id: enrollmentId, hospitalId },
      include: {
        surgicalPackage: { include: { inclusions: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('تسجيل الحزمة غير موجود في هذه المنشأة.');
    }

    const charges = await tx.encounterCharge.findMany({
      where: {
        hospitalId,
        encounterId: enrollment.encounterId,
        OR: [
          { invoiceId: null },
          { invoice: { status: { not: InvoiceStatus.CANCELLED } } },
        ],
      },
      select: {
        totalAmount: true,
        sourceType: true,
        serviceItem: { select: { type: true } },
      },
    });

    const chargeLines = charges.map((c) => ({
      category: mapChargeToPackageCategory(c.serviceItem?.type, c.sourceType),
      amount: Money.toDbString(c.totalAmount),
    }));

    const rules = enrollment.surgicalPackage.inclusions.map((inc) => ({
      category: inc.category as PackageCategory,
      coverageMode: inc.coverageMode as PackageCoverageMode,
      capAmount: inc.capAmount ? Money.toDbString(inc.capAmount) : null,
    }));

    const reconciliation = reconcileSurgicalPackage(
      Money.toDbString(enrollment.packagePriceSnapshot),
      rules,
      chargeLines,
    );

    return { enrollment, reconciliation };
  }

  async previewReconciliation(hospitalId: number, enrollmentId: number) {
    const { enrollment, reconciliation } = await this.computeLiveReconciliation(
      this.prisma,
      hospitalId,
      enrollmentId,
    );
    return {
      enrollmentId: enrollment.id,
      encounterId: enrollment.encounterId,
      status: enrollment.status,
      packageCode: enrollment.surgicalPackage.code,
      packageName: enrollment.surgicalPackage.name,
      drgCode: enrollment.surgicalPackage.drgCode,
      reconciliation,
    };
  }

  async settleEnrollment(
    hospitalId: number,
    enrollmentId: number,
    settledById: number,
    dto: SettlePackageEnrollmentDto = {},
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const settled = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_PACKAGES}::int, ${hospitalId}::int)`;

      const locked = await tx.$queryRaw<
        Array<{ id: number; hospitalId: number; status: string }>
      >`SELECT "id", "hospitalId", "status" FROM "EncounterPackageEnrollment" WHERE "id" = ${enrollmentId} FOR UPDATE`;

      if (!locked.length || locked[0].hospitalId !== hospitalId) {
        throw new NotFoundException('تسجيل الحزمة غير موجود في هذه المنشأة.');
      }
      if (locked[0].status !== 'ACTIVE') {
        throw new ConflictException(
          'يمكن تسوية تسجيل حزمة جراحية نشط (ACTIVE) فقط.',
        );
      }

      const { enrollment, reconciliation } =
        await this.computeLiveReconciliation(tx, hospitalId, enrollmentId);

      const signatureHash = computePackageSettlementHash({
        hospitalId,
        enrollmentId: enrollment.id,
        encounterId: enrollment.encounterId,
        packageId: enrollment.packageId,
        packagePriceSnapshot: reconciliation.packagePrice,
        actualChargesTotal: reconciliation.actualChargesTotal,
        overageAmount: reconciliation.overageAmount,
        netBillableTotal: reconciliation.netBillableTotal,
        settledById,
      });

      const saved = await tx.encounterPackageEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'SETTLED',
          actualChargesTotal: reconciliation.actualChargesTotal,
          coveredByPackageAmount: reconciliation.coveredByPackageAmount,
          overageAmount: reconciliation.overageAmount,
          netBillableTotal: reconciliation.netBillableTotal,
          packageVariance: reconciliation.packageVariance,
          breakdownJson:
            reconciliation.breakdown as unknown as Prisma.InputJsonValue,
          settledById,
          settledAt: new Date(),
          signatureHash,
          ...(dto.notes ? { notes: dto.notes.trim() } : {}),
        },
        include: {
          surgicalPackage: {
            select: { id: true, code: true, name: true, drgCode: true },
          },
        },
      });

      const auditFields = {
        hospitalId,
        userId: settledById,
        action: 'ENCOUNTER_PACKAGE_SETTLED',
        entity: 'EncounterPackageEnrollment',
        entityId: saved.id,
        details: {
          encounterId: saved.encounterId,
          packageCode: saved.surgicalPackage.code,
          actualChargesTotal: reconciliation.actualChargesTotal,
          overageAmount: reconciliation.overageAmount,
          netBillableTotal: reconciliation.netBillableTotal,
          packageVariance: reconciliation.packageVariance,
          signatureHash,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return settled;
  }

  async verifyEnrollment(hospitalId: number, enrollmentId: number) {
    const e = await this.prisma.encounterPackageEnrollment.findFirst({
      where: { id: enrollmentId, hospitalId },
    });
    if (!e) {
      throw new NotFoundException('تسجيل الحزمة غير موجود في هذه المنشأة.');
    }
    if (!e.signatureHash || !e.settledById) {
      return { valid: false, status: e.status, reason: 'UNSETTLED' };
    }
    const recomputed = computePackageSettlementHash({
      hospitalId: e.hospitalId,
      enrollmentId: e.id,
      encounterId: e.encounterId,
      packageId: e.packageId,
      packagePriceSnapshot: Money.toDbString(e.packagePriceSnapshot),
      actualChargesTotal: Money.toDbString(e.actualChargesTotal),
      overageAmount: Money.toDbString(e.overageAmount),
      netBillableTotal: Money.toDbString(e.netBillableTotal),
      settledById: e.settledById,
    });
    return {
      valid: recomputed === e.signatureHash,
      status: e.status,
      signatureHash: e.signatureHash,
    };
  }
}
