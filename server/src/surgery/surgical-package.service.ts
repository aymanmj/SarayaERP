// server/src/surgery/surgical-package.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingSourceModule,
  InvoiceStatus,
  Prisma,
  SystemAccountKey,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  financialPeriod,
  insuranceReceivableLinePrefix,
  invoicePostingKey,
} from '../accounting/financial-posting';
import {
  CreateSurgicalPackageDto,
  EnrollEncounterPackageDto,
  GeneratePackageInvoiceDto,
  SettlePackageEnrollmentDto,
} from './dto/surgical-package.dto';
import {
  computePackageInvoiceSplit,
  computePackageSettlementHash,
  mapChargeToPackageCategory,
  reconcileSurgicalPackage,
  type PackageCategory,
  type PackageCategoryBreakdown,
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
        invoice: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            patientShare: true,
            insuranceShare: true,
            insuranceProviderId: true,
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

  private mapCategoryToRevenueKey(category: string): SystemAccountKey {
    switch (category) {
      case 'SURGERY':
      case 'ANESTHESIA':
        return SystemAccountKey.REVENUE_SURGERY;
      case 'ROOM':
        return SystemAccountKey.REVENUE_INPATIENT;
      case 'LAB':
        return SystemAccountKey.REVENUE_LAB;
      case 'RADIOLOGY':
        return SystemAccountKey.REVENUE_RADIOLOGY;
      case 'PHARMACY':
      case 'CONSUMABLES':
        return SystemAccountKey.REVENUE_PHARMACY;
      default:
        return SystemAccountKey.REVENUE_OUTPATIENT;
    }
  }

  private async resolveSystemAccountId(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    primaryKey: SystemAccountKey,
    fallbackKeys: SystemAccountKey[],
    fallbackType: 'ASSET' | 'REVENUE',
  ): Promise<number> {
    const keys = [primaryKey, ...fallbackKeys];
    for (const key of keys) {
      const mapping = await tx.systemAccountMapping.findFirst({
        where: {
          hospitalId,
          key,
          isActive: true,
          account: { hospitalId, isActive: true },
        },
        select: { accountId: true },
      });
      if (mapping) return mapping.accountId;
    }
    const fallbackAcc = await tx.account.findFirst({
      where: { hospitalId, type: fallbackType, isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true },
    });
    if (!fallbackAcc) {
      throw new BadRequestException(
        `لا يوجد حساب محاسبي فعّال للمفتاح ${primaryKey} (${fallbackType}).`,
      );
    }
    return fallbackAcc.id;
  }

  /**
   * CAP08 End-to-End Billing Loop:
   * Converts a SETTLED DRG Surgical Package enrollment into an ISSUED Discharge Invoice
   * with exact Money Patient/Insurance split, links all unbilled encounter charges to prevent
   * double-billing, and posts a strictly balanced DRG bundled GL AccountingEntry.
   */
  async generatePackageInvoice(
    hospitalId: number,
    enrollmentId: number,
    invoicedById: number,
    dto: GeneratePackageInvoiceDto = {},
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_PACKAGES}::int, ${hospitalId}::int)`;

      const locked = await tx.$queryRaw<
        Array<{
          id: number;
          hospitalId: number;
          status: string;
          invoiceId: number | null;
        }>
      >`SELECT "id", "hospitalId", "status", "invoiceId" FROM "EncounterPackageEnrollment" WHERE "id" = ${enrollmentId} FOR UPDATE`;

      if (!locked.length || locked[0].hospitalId !== hospitalId) {
        throw new NotFoundException('تسجيل الحزمة غير موجود في هذه المنشأة.');
      }
      if (locked[0].status !== 'SETTLED') {
        throw new ConflictException(
          'يجب تسوية وختم الحزمة الجراحية (SETTLED) قبل إصدار فاتورة الخروج.',
        );
      }
      if (locked[0].invoiceId !== null) {
        throw new ConflictException(
          `تم إصدار فاتورة مجمّعة بالفعل لهذا التسجيل (فاتورة #${locked[0].invoiceId}).`,
        );
      }

      const enrollment = await tx.encounterPackageEnrollment.findFirstOrThrow({
        where: { id: enrollmentId, hospitalId },
        include: {
          surgicalPackage: {
            select: { id: true, code: true, name: true, drgCode: true },
          },
          encounter: {
            include: {
              patient: {
                include: {
                  insurancePolicy: {
                    include: {
                      provider: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const encounter = enrollment.encounter;
      const patient = encounter.patient;
      await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patient.id} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Encounter" WHERE "id" = ${encounter.id} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      // Determine insurance provider & coverage percentage
      let insuranceProviderId: number | null = dto.insuranceProviderId ?? null;
      let coveragePolicyId: number | null = null;
      let insuranceCoveragePercent = dto.insuranceCoveragePercent;
      let maxCoverageAmount: string | null = null;

      const activePolicy =
        patient.insurancePolicy && patient.insurancePolicy.isActive
          ? patient.insurancePolicy
          : null;

      if (!insuranceProviderId && activePolicy) {
        insuranceProviderId = activePolicy.insuranceProviderId;
        coveragePolicyId = activePolicy.id;
      }

      if (insuranceProviderId) {
        const provider = await tx.insuranceProvider.findFirst({
          where: { id: insuranceProviderId, hospitalId, isActive: true },
          select: { id: true, name: true, accountId: true },
        });
        if (!provider) {
          throw new NotFoundException('جهة التأمين غير موجودة ضمن المنشأة.');
        }
        if (insuranceCoveragePercent === undefined) {
          if (activePolicy) {
            const copay = Money.decimal(activePolicy.patientCopayRate);
            const pct = copay.gt(1)
              ? Money.decimal(100).minus(copay)
              : Money.decimal(1).minus(copay).times(100);
            insuranceCoveragePercent = Math.max(
              0,
              Math.min(100, pct.toNumber()),
            );
            if (activePolicy.maxCoverageAmount) {
              maxCoverageAmount = Money.toDbString(
                activePolicy.maxCoverageAmount,
              );
            }
          } else {
            insuranceCoveragePercent = 100;
          }
        }
      } else {
        insuranceCoveragePercent = 0;
      }

      const split = computePackageInvoiceSplit({
        packagePrice: Money.toDbString(enrollment.packagePriceSnapshot),
        overageAmount: Money.toDbString(enrollment.overageAmount),
        insuranceCoveragePercent,
        coverOverage: dto.coverOverage ?? false,
        maxCoverageAmount,
      });

      const now = new Date();
      const { financialYear, period } = await financialPeriod(
        tx,
        hospitalId,
        now,
      );

      const breakdown = Array.isArray(enrollment.breakdownJson)
        ? (enrollment.breakdownJson as unknown as PackageCategoryBreakdown[])
        : [];

      const snapshotLines = [
        {
          type: 'DRG_PACKAGE_BASE',
          code: enrollment.surgicalPackage.code,
          drgCode: enrollment.surgicalPackage.drgCode,
          description: `حزمة جراحية مجمّعة: ${enrollment.surgicalPackage.name}`,
          amount: Money.toDbString(enrollment.packagePriceSnapshot),
        },
        ...breakdown
          .filter((b) => Money.isPositive(b.overageAmount))
          .map((b) => ({
            type: 'DRG_PACKAGE_OVERAGE',
            category: b.category,
            description: `فائض خارج سقف الحزمة (${b.category})`,
            actualAmount: b.actualAmount,
            coveredAmount: b.coveredAmount,
            amount: b.overageAmount,
          })),
      ];

      const invoice = await tx.invoice.create({
        data: {
          hospitalId,
          patientId: patient.id,
          encounterId: encounter.id,
          status: InvoiceStatus.ISSUED,
          totalAmount: split.netBillableTotal,
          discountAmount: '0.000',
          paidAmount: '0.000',
          currency: 'LYD',
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          insuranceProviderId: Money.isPositive(split.insuranceShare)
            ? insuranceProviderId
            : null,
          coveragePolicyId: Money.isPositive(split.insuranceShare)
            ? coveragePolicyId
            : null,
          insuranceShare: split.insuranceShare,
          patientShare: split.patientShare,
          claimStatus: Money.isPositive(split.insuranceShare)
            ? 'PENDING'
            : null,
          notes:
            dto.notes?.trim() ||
            `فاتورة حزمة جراحية (${enrollment.surgicalPackage.code}${enrollment.surgicalPackage.drgCode ? ` / ${enrollment.surgicalPackage.drgCode}` : ''})`,
          lineSnapshot: {
            kind: 'SURGICAL_PACKAGE_DRG',
            enrollmentId: enrollment.id,
            signatureHash: enrollment.signatureHash,
            packagePrice: Money.toDbString(enrollment.packagePriceSnapshot),
            actualChargesTotal: Money.toDbString(enrollment.actualChargesTotal),
            overageAmount: Money.toDbString(enrollment.overageAmount),
            packageVariance: Money.toDbString(enrollment.packageVariance),
            netBillableTotal: split.netBillableTotal,
            insuranceShare: split.insuranceShare,
            patientShare: split.patientShare,
            appliedCoveragePercent: split.appliedCoveragePercent,
            lines: snapshotLines,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Link all unbilled EncounterCharge rows so normal billing can never double-bill them
      await tx.encounterCharge.updateMany({
        where: {
          hospitalId,
          encounterId: encounter.id,
          invoiceId: null,
        },
        data: { invoiceId: invoice.id },
      });

      // Post strictly balanced DRG bundled GL AccountingEntry with canonical invoicePostingKey
      const postingKey = invoicePostingKey(hospitalId, invoice.id);
      const glLines: Array<{
        accountId: number;
        debit: string;
        credit: string;
        description: string;
      }> = [];

      if (Money.isPositive(split.patientShare)) {
        const patientArId = await this.resolveSystemAccountId(
          tx,
          hospitalId,
          SystemAccountKey.RECEIVABLE_PATIENTS,
          [],
          'ASSET',
        );
        glLines.push({
          accountId: patientArId,
          debit: split.patientShare,
          credit: '0.000',
          description: `استحقاق المريض - حزمة جراحية ${enrollment.surgicalPackage.code}`,
        });
      }

      if (Money.isPositive(split.insuranceShare)) {
        let insAccId: number | null = null;
        let providerName = 'التأمين';
        if (insuranceProviderId) {
          const prov = await tx.insuranceProvider.findFirst({
            where: { id: insuranceProviderId, hospitalId },
            select: { name: true, accountId: true },
          });
          if (prov) providerName = prov.name;
          if (prov?.accountId) {
            const acc = await tx.account.findFirst({
              where: { id: prov.accountId, hospitalId, isActive: true },
              select: { id: true },
            });
            if (acc) insAccId = acc.id;
          }
        }
        if (!insAccId) {
          insAccId = await this.resolveSystemAccountId(
            tx,
            hospitalId,
            SystemAccountKey.RECEIVABLE_INSURANCE,
            [SystemAccountKey.RECEIVABLE_PATIENTS],
            'ASSET',
          );
        }
        glLines.push({
          accountId: insAccId,
          debit: split.insuranceShare,
          credit: '0.000',
          description: `${insuranceReceivableLinePrefix}${providerName}) - حزمة ${enrollment.surgicalPackage.code}`,
        });
      }

      // Credit side: base package price + each non-zero category overage
      const creditMap = new Map<number, string>();
      const addCredit = (accountId: number, amount: string) => {
        if (!Money.isPositive(amount)) return;
        creditMap.set(
          accountId,
          Money.toDbString(
            Money.sumPosted(creditMap.get(accountId) ?? '0.000', amount),
          ),
        );
      };

      const baseRevId = await this.resolveSystemAccountId(
        tx,
        hospitalId,
        SystemAccountKey.REVENUE_SURGERY,
        [
          SystemAccountKey.REVENUE_INPATIENT,
          SystemAccountKey.REVENUE_OUTPATIENT,
        ],
        'REVENUE',
      );
      addCredit(baseRevId, Money.toDbString(enrollment.packagePriceSnapshot));

      for (const item of breakdown) {
        if (!Money.isPositive(item.overageAmount)) continue;
        const revKey = this.mapCategoryToRevenueKey(item.category);
        const revAccId = await this.resolveSystemAccountId(
          tx,
          hospitalId,
          revKey,
          [
            SystemAccountKey.REVENUE_SURGERY,
            SystemAccountKey.REVENUE_OUTPATIENT,
          ],
          'REVENUE',
        );
        addCredit(revAccId, item.overageAmount);
      }

      for (const [accountId, amount] of creditMap.entries()) {
        glLines.push({
          accountId,
          debit: '0.000',
          credit: amount,
          description: `إيرادات حزمة جراحية DRG (${enrollment.surgicalPackage.code})`,
        });
      }

      const totalDebit = Money.toDbString(
        Money.sumPosted(...glLines.map((l) => l.debit)),
      );
      const totalCredit = Money.toDbString(
        Money.sumPosted(...glLines.map((l) => l.credit)),
      );
      if (
        !Money.eq(totalDebit, totalCredit) ||
        !Money.eq(totalDebit, split.netBillableTotal)
      ) {
        throw new BadRequestException(
          `قيد فاتورة الحزمة الجراحية غير متوازن (Debit=${totalDebit}, Credit=${totalCredit}).`,
        );
      }

      const accountingEntry = await tx.accountingEntry.create({
        data: {
          hospitalId,
          postingKey,
          entryDate: now,
          description: `فاتورة حزمة جراحية #${invoice.id} (${enrollment.surgicalPackage.code})`,
          sourceModule: AccountingSourceModule.BILLING,
          sourceId: invoice.id,
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          createdById: invoicedById,
          lines: { create: glLines },
        },
      });

      const updatedEnrollment = await tx.encounterPackageEnrollment.update({
        where: { id: enrollment.id },
        data: {
          invoiceId: invoice.id,
          insuranceShare: split.insuranceShare,
          patientShare: split.patientShare,
          invoicedAt: now,
          invoicedById,
        },
        include: {
          surgicalPackage: {
            select: { id: true, code: true, name: true, drgCode: true },
          },
          invoice: {
            select: {
              id: true,
              status: true,
              totalAmount: true,
              patientShare: true,
              insuranceShare: true,
              insuranceProviderId: true,
            },
          },
        },
      });

      const auditFields = {
        hospitalId,
        userId: invoicedById,
        action: 'ENCOUNTER_PACKAGE_INVOICED',
        entity: 'EncounterPackageEnrollment',
        entityId: enrollment.id,
        details: {
          encounterId: encounter.id,
          invoiceId: invoice.id,
          accountingEntryId: accountingEntry.id,
          netBillableTotal: split.netBillableTotal,
          patientShare: split.patientShare,
          insuranceShare: split.insuranceShare,
          insuranceProviderId: invoice.insuranceProviderId,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return {
        enrollment: updatedEnrollment,
        invoice,
        accountingEntryId: accountingEntry.id,
        split,
      };
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
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
