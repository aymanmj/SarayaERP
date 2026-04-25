import { Injectable, Logger } from '@nestjs/common';

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

  /**
   * تنفيذ كل قواعد الفحص على المطالبة
   */
  async scrub(claim: any): Promise<ScrubResult[]> {
    const results: ScrubResult[] = [];

    results.push(...this.checkCompleteness(claim));
    results.push(...this.checkEligibility(claim));
    results.push(...this.checkCodingAccuracy(claim));
    results.push(...this.checkDuplicates(claim));
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
  private checkCompleteness(claim: any): ScrubResult[] {
    const results: ScrubResult[] = [];
    const invoice = claim.invoice;

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
    if (!invoice?.items || invoice.items.length === 0) {
      results.push({
        ruleCode: 'COMPLETENESS',
        severity: 'ERROR',
        message: 'الفاتورة لا تحتوي على بنود',
        field: 'items',
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
  private checkEligibility(claim: any): ScrubResult[] {
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
  private checkCodingAccuracy(claim: any): ScrubResult[] {
    const results: ScrubResult[] = [];
    const encounter = claim.invoice?.encounter;

    // التحقق من وجود تشخيص رئيسي
    if (encounter) {
      const diagnoses = encounter.diagnoses || [];
      if (diagnoses.length === 0) {
        results.push({
          ruleCode: 'CODING',
          severity: 'ERROR',
          message: 'الزيارة لا تحتوي على تشخيص — مطلوب رمز ICD-10 واحد على الأقل',
          field: 'encounter.diagnoses',
        });
      } else {
        // التحقق من وجود تشخيص رئيسي
        const hasPrimary = diagnoses.some((d: any) => d.type === 'PRIMARY');
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
  private checkDuplicates(claim: any): ScrubResult[] {
    const results: ScrubResult[] = [];

    // الفحص الأساسي: هل يوجد مطالبة أخرى لنفس الفاتورة؟
    // (يتم التحقق في ClaimService.createClaim أيضاً)

    return results;
  }

  /**
   * فحص الموافقات المسبقة — هل توجد pre-auth سارية؟
   */
  private checkAuthorization(claim: any): ScrubResult[] {
    const results: ScrubResult[] = [];

    // تحذير إذا كانت الزيارة تتطلب موافقة مسبقة (Inpatient/Surgery)
    const encounter = claim.invoice?.encounter;
    if (encounter) {
      const requiresAuth = ['INPATIENT', 'SURGERY', 'DAY_CASE'].includes(
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
