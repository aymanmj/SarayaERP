import { Injectable, Logger } from '@nestjs/common';
import { NphiesAuthService } from './nphies-auth.service';
import { NphiesService } from './nphies.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * التحقق من أهلية المريض التأمينية عبر NPHIES
 * 
 * يرسل CoverageEligibilityRequest ويستقبل CoverageEligibilityResponse
 * 
 * الأهلية تشمل:
 * - هل البوليصة فعالة؟
 * - ما هي التغطيات المتاحة (استشارات، أدوية، عمليات)؟
 * - ما هي نسبة التحمل (deductible/copay)؟
 * - هل هناك حدود قصوى (benefit limits)؟
 */
@Injectable()
export class NphiesEligibilityService {
  private readonly logger = new Logger(NphiesEligibilityService.name);

  constructor(
    private authService: NphiesAuthService,
    private nphiesService: NphiesService,
  ) {}

  /**
   * التحقق من أهلية التأمين لمريض
   * 
   * @param patient بيانات المريض
   * @param insurance بيانات التأمين
   * @returns نتيجة التحقق مع التغطيات المتاحة
   */
  async checkEligibility(
    patient: {
      id: string;
      fullName: string;
      nationalId?: string;
      dateOfBirth?: Date;
      gender?: string;
      phone?: string;
    },
    insurance: {
      memberId: string;
      payerIdentifier: string;
      payerName: string;
    },
  ): Promise<NphiesEligibilityResponse> {
    const patientId = uuidv4();
    const coverageId = uuidv4();
    const requestId = uuidv4();

    // بناء الموارد
    const patientResource = this.nphiesService.buildPatient({
      ...patient,
      id: patientId,
    });

    const coverageResource = this.nphiesService.buildCoverage({
      id: coverageId,
      memberId: insurance.memberId,
      payerIdentifier: insurance.payerIdentifier,
      payerName: insurance.payerName,
      patientRef: `Patient/${patientId}`,
    });

    // بناء CoverageEligibilityRequest
    const eligibilityRequest = {
      resourceType: 'CoverageEligibilityRequest',
      id: requestId,
      status: 'active',
      purpose: ['benefits', 'validation'],
      patient: { reference: `Patient/${patientId}` },
      created: new Date().toISOString().split('T')[0],
      insurer: {
        type: 'Organization',
        identifier: {
          system: 'http://nphies.sa/license/payer-license',
          value: insurance.payerIdentifier,
        },
      },
      insurance: [
        {
          focal: true,
          coverage: { reference: `Coverage/${coverageId}` },
        },
      ],
    };

    // بناء MessageHeader
    const messageHeader = this.nphiesService.buildMessageHeader(
      'eligibility-request',
      `CoverageEligibilityRequest/${requestId}`,
    );

    // بناء الـ Bundle
    const bundle = this.nphiesService.buildBundle('message', [
      messageHeader,
      eligibilityRequest,
      patientResource,
      coverageResource,
    ]);

    try {
      // إرسال الطلب
      const response = await this.authService.sendFhirRequest<any>(
        '/nphies-fs/CoverageEligibility/$submit',
        bundle,
      );

      return this.parseEligibilityResponse(response);
    } catch (error: any) {
      this.logger.error(`❌ فشل التحقق من الأهلية: ${error.message}`);
      return {
        eligible: false,
        status: 'error',
        errorMessage: error.message,
        benefits: [],
      };
    }
  }

  /**
   * تحليل استجابة NPHIES وتحويلها لصيغة مبسطة
   */
  private parseEligibilityResponse(fhirResponse: any): NphiesEligibilityResponse {
    try {
      // البحث عن CoverageEligibilityResponse في الـ Bundle
      const entries = fhirResponse?.entry || [];
      const eligibilityResponse = entries.find(
        (e: any) => e.resource?.resourceType === 'CoverageEligibilityResponse',
      )?.resource;

      if (!eligibilityResponse) {
        // التحقق من وجود OperationOutcome (أخطاء)
        const operationOutcome = entries.find(
          (e: any) => e.resource?.resourceType === 'OperationOutcome',
        )?.resource;

        if (operationOutcome) {
          const issues = operationOutcome.issue || [];
          return {
            eligible: false,
            status: 'rejected',
            errorMessage: issues.map((i: any) => i.diagnostics || i.details?.text).join('; '),
            benefits: [],
          };
        }

        return {
          eligible: false,
          status: 'error',
          errorMessage: 'لم يتم العثور على استجابة أهلية في رد NPHIES',
          benefits: [],
        };
      }

      // تحليل التغطيات
      const insuranceItems = eligibilityResponse.insurance || [];
      const benefits: EligibilityBenefit[] = [];

      for (const ins of insuranceItems) {
        const items = ins.item || [];
        for (const item of items) {
          const category = item.category?.coding?.[0];
          const benefitEntries = item.benefit || [];

          for (const ben of benefitEntries) {
            benefits.push({
              category: category?.code || 'unknown',
              categoryDisplay: category?.display || '',
              type: ben.type?.coding?.[0]?.code || '',
              allowedValue: ben.allowedMoney?.value || ben.allowedUnsignedInt || 0,
              usedValue: ben.usedMoney?.value || ben.usedUnsignedInt || 0,
              currency: ben.allowedMoney?.currency || 'SAR',
            });
          }
        }
      }

      return {
        eligible: eligibilityResponse.outcome === 'complete',
        status: eligibilityResponse.outcome || 'unknown',
        dispositionMessage: eligibilityResponse.disposition,
        benefits,
        rawResponse: eligibilityResponse,
      };
    } catch (error: any) {
      this.logger.error(`❌ خطأ في تحليل استجابة الأهلية: ${error.message}`);
      return {
        eligible: false,
        status: 'parse-error',
        errorMessage: `فشل تحليل الاستجابة: ${error.message}`,
        benefits: [],
      };
    }
  }
}

// ============================================
// Interfaces
// ============================================
export interface NphiesEligibilityResponse {
  eligible: boolean;
  status: string;
  dispositionMessage?: string;
  errorMessage?: string;
  benefits: EligibilityBenefit[];
  rawResponse?: any;
}

export interface EligibilityBenefit {
  category: string;
  categoryDisplay: string;
  type: string;
  allowedValue: number;
  usedValue: number;
  currency: string;
}
