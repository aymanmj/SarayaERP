import type { Prisma } from '@prisma/client';
type ScrubClaim = Prisma.ClaimGetPayload<{
  include: {
    invoice: {
      include: {
        patient: true;
        insuranceProvider: true;
        encounter: { include: { encounterDiagnoses: true } };
        charges: true;
      };
    };
  };
}>;
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * نتيجة فحص واحدة
 */
export interface ScrubResult {
  ruleCode: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  field?: string;
  autoFixed?: boolean;
}

/**
 * محرك فحص المطالبات التأمينية (Claims Scrubbing Engine)
 *
 * يفحص المطالبة عبر مجموعة قواعد قبل إرسالها لشركة التأمين:
 * 1. COMPLETENESS — اكتمال البيانات المطلوبة
 * 2. ELIGIBILITY — صلاحية التغطية التأمينية
 * 3. CODING — دقة الترميز الطبي (ICD-10, CPT)
 * 4. DUPLICATE — كشف المطالبات المكررة
 * 5. AUTHORIZATION — التحقق من الموافقات المسبقة
 */
@Injectable()
export class ClaimScrubberService {
  private readonly logger = new Logger(ClaimScrubberService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * تنفيذ كل قواعد الفحص على المطالبة
   */
  async scrub(claim: ScrubClaim): Promise<ScrubResult[]> {
    const results: ScrubResult[] = [];

    results.push(...this.checkCompleteness(claim));
    results.push(...this.checkEligibility(claim));
    results.push(...this.checkCodingAccuracy(claim));
    results.push(...(await this.checkDuplicates(claim)));
    results.push(...this.checkAuthorization(claim));

    this.logger.log(
      `🔍 فحص مطالبة ${claim.claimNumber}: ${results.filter((r) => r.severity === 'ERROR').length} أخطاء, ` +
        `${results.filter((r) => r.severity === 'WARNING').length} تحذيرات`,
    );

    return results;
  }

  /**
   * فحص اكتمال البيانات — هل كل الحقول المطلوبة موجودة؟
   */
  private checkCompleteness(claim: ScrubClaim): ScrubResult[] {
    const results: ScrubResult[] = [];
    const invoice = claim.invoice;

    if (!invoice) {
      results.push({
        ruleCode: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'الفاتورة غير مرتبطة بالمطالبة',
        field: 'invoice',
      });
      return results;
    }

    // بيانات المريض
    if (!invoice?.patient) {
      results.push({
        ruleCode: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'بيانات المريض غير موجودة في الفاتورة',
        field: 'patient',
      });
    } else {
      if (!invoice.patient.dateOfBirth) {
        results.push({
          ruleCode: 'COMPLETENESS',
          severity: 'ERROR',
          message: 'تاريخ ميلاد المريض مطلوب للمطالبة التأمينية',
          field: 'patient.dateOfBirth',
        });
      }
      if (!invoice.patient.gender) {
        results.push({
          ruleCode: 'COMPLETENESS',
          severity: 'WARNING',
          message: 'جنس المريض غير محدد',
          field: 'patient.gender',
        });
      }
    }

    // بيانات التأمين
    if (!invoice?.insuranceProvider) {
      results.push({
        ruleCode: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'شركة التأمين غير محددة',
        field: 'insuranceProvider',
      });
    }

    // بيانات الزيارة
    if (!invoice?.encounter) {
      results.push({
        ruleCode: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'الزيارة الطبية غير مرتبطة بالفاتورة',
        field: 'encounter',
      });
    }

    // بنود الفاتورة
    const charges = invoice?.charges || [];
    if (charges.length === 0) {
      results.push({
        ruleCode: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'الفاتورة لا تحتوي على بنود',
        field: 'charges',
      });
    }

    // المبلغ
    if (!claim.claimedAmount || Number(claim.claimedAmount) <= 0) {
      results.push({
        ruleCode: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'مبلغ المطالبة غير صحيح',
        field: 'claimedAmount',
      });
    }

    return results;
  }

  /**
   * فحص الأهلية — هل التغطية التأمينية فعالة؟
   */
  private checkEligibility(claim: ScrubClaim): ScrubResult[] {
    const results: ScrubResult[] = [];
    const provider = claim.invoice?.insuranceProvider;

    if (provider && !provider.isActive) {
      results.push({
        ruleCode: 'ELIGIBILITY',
        severity: 'ERROR',
        message: `شركة التأمين "${provider.name}" غير فعالة`,
        field: 'insuranceProvider.isActive',
      });
    }

    return results;
  }

  /**
   * فحص دقة الترميز — هل التشخيصات والإجراءات مرمزة؟
   */
  private checkCodingAccuracy(claim: ScrubClaim): ScrubResult[] {
    const results: ScrubResult[] = [];
    const encounter = claim.invoice?.encounter;

    // التحقق من وجود تشخيص رئيسي
    if (encounter) {
      const diagnoses = encounter.encounterDiagnoses || [];
      if (diagnoses.length === 0) {
        results.push({
          ruleCode: 'CODING',
          severity: 'ERROR',
          message:
            'الزيارة لا تحتوي على تشخيص — مطلوب رمز ICD-10 واحد على الأقل',
          field: 'encounter.diagnoses',
        });
      } else {
        // التحقق من وجود تشخيص رئيسي
        const hasPrimary = diagnoses.some((d) => d.type === 'PRIMARY');
        if (!hasPrimary) {
          results.push({
            ruleCode: 'CODING',
            severity: 'WARNING',
            message: 'لا يوجد تشخيص رئيسي محدد — سيتم استخدام أول تشخيص',
            field: 'encounter.diagnoses.type',
          });
        }
      }
    }

    return results;
  }

  /**
   * فحص التكرار — هل هذه مطالبة مكررة؟
   */
  private async checkDuplicates(claim: ScrubClaim): Promise<ScrubResult[]> {
    const results: ScrubResult[] = [];

    // 1. الفحص الأساسي: هل يوجد مطالبة أخرى لنفس الفاتورة؟
    if (claim.invoiceId) {
      const existingClaims = await this.prisma.claim.findMany({
        where: {
          ...(claim.hospitalId ? { hospitalId: claim.hospitalId } : {}),
          invoiceId: claim.invoiceId,
          id: { not: claim.id },
          status: { notIn: ['REJECTED', 'VOID'] },
        },
      });

      if (existingClaims.length > 0) {
        results.push({
          ruleCode: 'DUPLICATE_INVOICE',
          severity: 'ERROR',
          message: 'يوجد مطالبة سابقة لنفس الفاتورة لم يتم رفضها أو إلغاؤها',
          field: 'invoiceId',
        });
      }
    }

    // 2. الفحص المتقدم (Clinical Exact Match):
    // هل هناك مطالبة أخرى لنفس المريض في نفس اليوم، لنفس الخدمة/الطبيب؟
    if (claim.invoice?.patientId && claim.invoice?.encounter) {
      const encounterDate = claim.invoice.encounter.createdAt;
      const startOfDay = new Date(encounterDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const sameDayClaims = await this.prisma.claim.findMany({
        where: {
          ...(claim.hospitalId ? { hospitalId: claim.hospitalId } : {}),
          id: { not: claim.id },
          status: { notIn: ['REJECTED', 'VOID'] },
          invoice: {
            patientId: claim.invoice.patientId,
            encounter: {
              createdAt: { gte: startOfDay, lt: endOfDay },
              doctorId: claim.invoice.encounter.doctorId,
              departmentId: claim.invoice.encounter.departmentId,
            },
          },
        },
        include: { invoice: { include: { encounter: true } } },
      });

      if (sameDayClaims.length > 0) {
        results.push({
          ruleCode: 'DUPLICATE_ENCOUNTER',
          severity: 'WARNING',
          message:
            'تحذير: تم العثور على مطالبة لنفس المريض مع نفس الطبيب/القسم في نفس اليوم. قد تعتبر شركة التأمين هذه الزيارة مكررة',
          field: 'encounter',
        });
      }
    }

    // 3. كشف المطالبات العابرة للمستشفيات عبر السجل الوطني الموحد (MPI)
    if (
      claim.invoice?.patient?.globalPatientId &&
      claim.invoice?.encounter?.createdAt &&
      typeof (this.prisma as { $queryRaw?: unknown })?.$queryRaw === 'function'
    ) {
      const encounterDate = new Date(claim.invoice.encounter.createdAt);
      const startOfUtcDay = new Date(
        Date.UTC(
          encounterDate.getUTCFullYear(),
          encounterDate.getUTCMonth(),
          encounterDate.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
      const endOfUtcDay = new Date(
        startOfUtcDay.getTime() + 24 * 60 * 60 * 1000,
      );

      const crossRows = await this.prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*)::bigint AS cnt
        FROM "Claim" c
        JOIN "Invoice" i ON i.id = c."invoiceId"
        JOIN "Patient" p ON p.id = i."patientId"
        JOIN "Encounter" e ON e.id = i."encounterId"
        WHERE p."globalPatientId" = ${claim.invoice.patient.globalPatientId}::integer
          AND p."isDeleted" = false
          AND c."hospitalId" <> ${claim.hospitalId ?? -1}::integer
          AND c.id <> ${claim.id ?? -1}::integer
          AND c.status NOT IN ('REJECTED', 'VOID')
          AND e."createdAt" >= ${startOfUtcDay}
          AND e."createdAt" < ${endOfUtcDay}
      `;

      if (Number(crossRows[0]?.cnt ?? 0) > 0) {
        results.push({
          ruleCode: 'CROSS_HOSPITAL_MPI_DUPLICATE',
          severity: 'WARNING',
          message:
            'تحذير الشبكة الوطنية (MPI): توجد مطالبة تأمينية أخرى لنفس المريض في منشأة صحية أخرى بنفس اليوم',
          field: 'patient.globalPatientId',
        });
      }
    }

    return results;
  }

  /**
   * فحص الموافقات المسبقة — هل توجد pre-auth سارية؟
   */
  private checkAuthorization(claim: ScrubClaim): ScrubResult[] {
    const results: ScrubResult[] = [];

    // تحذير إذا كانت الزيارة تتطلب موافقة مسبقة (Inpatient/Surgery)
    const encounter = claim.invoice?.encounter;
    if (encounter) {
      const requiresAuth = ['IPD', 'ICU', 'NICU', 'PICU'].includes(
        encounter.type,
      );
      if (requiresAuth) {
        results.push({
          ruleCode: 'AUTHORIZATION',
          severity: 'WARNING',
          message:
            'هذا النوع من الزيارات قد يتطلب موافقة مسبقة — تحقق من وجود Pre-Authorization',
          field: 'encounter.type',
        });
      }
    }

    return results;
  }
}
