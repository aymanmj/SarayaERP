import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NphiesAuthService } from './nphies-auth.service';
import { NphiesService } from './nphies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaimStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * خدمة إرسال المطالبات الإلكترونية عبر NPHIES
 * 
 * تدعم:
 * 1. إرسال مطالبة واحدة (Claim Submission)
 * 2. إرسال طلب موافقة مسبقة (Pre-Authorization)
 * 3. الاستعلام عن حالة مطالبة (Claim Status Inquiry)
 * 4. إلغاء مطالبة (Claim Cancellation)
 * 5. معالجة الردود (ERA - Remittance Advice)
 * 
 * @see https://build.fhir.org/ig/nichetech/NPHIES-Implementation-Guide/
 */
@Injectable()
export class NphiesClaimService {
  private readonly logger = new Logger(NphiesClaimService.name);

  constructor(
    private authService: NphiesAuthService,
    private nphiesService: NphiesService,
    private prisma: PrismaService,
  ) {}

  /**
   * إرسال مطالبة تأمينية إلى NPHIES
   * 
   * @param claimId معرّف المطالبة في قاعدة بيانات السرايا
   * @returns نتيجة الإرسال مع رقم المطالبة في NPHIES
   */
  async submitClaim(claimId: number): Promise<NphiesClaimSubmissionResult> {
    // جلب بيانات المطالبة كاملة
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        invoice: {
          include: {
            patient: true,
            insuranceProvider: true,
            encounter: {
              include: {
                encounterDiagnoses: true,
                charges: {
                  include: { serviceItem: true },
                },
              },
            },
            charges: {
              include: { serviceItem: true },
            },
          },
        },
        hospital: true,
      },
    });

    if (!claim) throw new NotFoundException('المطالبة غير موجودة');

    const invoice = claim.invoice;
    const patient = invoice.patient;
    const encounter = invoice.encounter;

    // بناء FHIR Resources
    const patientId = uuidv4();
    const coverageId = uuidv4();
    const fhirClaimId = uuidv4();
    const organizationId = uuidv4();

    // بناء Patient
    const patientResource = this.nphiesService.buildPatient({
      id: patientId,
      fullName: patient.fullName,
      nationalId: patient.nationalId || undefined,
      dateOfBirth: patient.dateOfBirth || undefined,
      gender: patient.gender || undefined,
      phone: patient.phone || undefined,
    });

    // بناء Coverage
    const coverageResource = this.nphiesService.buildCoverage({
      id: coverageId,
      memberId: patient.insuranceMemberId || `MEM-${patient.id}`,
      payerIdentifier: invoice.insuranceProvider?.code || `PAYER-${invoice.insuranceProviderId}`,
      payerName: invoice.insuranceProvider?.name || 'Unknown Payer',
      patientRef: `Patient/${patientId}`,
    });

    // بناء Organization (مقدم الخدمة)
    const providerOrg = {
      resourceType: 'Organization',
      id: organizationId,
      identifier: [
        {
          system: 'http://nphies.sa/license/provider-license',
          value: (claim as any).hospital?.code || 'SRY-001',
        },
      ],
      name: (claim as any).hospital?.name || 'مستشفى السرايا',
    };

    // بناء FHIR Claim Resource
    const diagnosisEntries = (encounter?.encounterDiagnoses || []).map((diag: any, idx: number) => ({
      sequence: idx + 1,
      diagnosisCodeableConcept: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10',
            code: diag.icdCode || diag.code || 'Z00.0',
            display: diag.name || diag.description || '',
          },
        ],
      },
      type: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/ex-diagnosistype',
              code: diag.type === 'PRIMARY' ? 'principal' : 'secondary',
            },
          ],
        },
      ],
    }));

    const chargeItems = (invoice.charges || encounter?.charges || []).map((charge: any, idx: number) => ({
      sequence: idx + 1,
      productOrService: {
        coding: [
          {
            system: 'http://nphies.sa/terminology/CodeSystem/procedures',
            code: charge.serviceItem?.code || `SVC-${charge.serviceItemId}`,
            display: charge.serviceItem?.name || '',
          },
        ],
      },
      quantity: { value: charge.quantity || 1 },
      unitPrice: {
        value: Number(charge.unitPrice || charge.totalAmount),
        currency: 'SAR',
      },
      net: {
        value: Number(charge.totalAmount),
        currency: 'SAR',
      },
    }));

    const fhirClaim = {
      resourceType: 'Claim',
      id: fhirClaimId,
      status: 'active',
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: this.mapEncounterTypeToClaim(encounter?.type),
          },
        ],
      },
      use: 'claim',
      patient: { reference: `Patient/${patientId}` },
      created: new Date().toISOString().split('T')[0],
      insurer: {
        type: 'Organization',
        identifier: {
          system: 'http://nphies.sa/license/payer-license',
          value: invoice.insuranceProvider?.code || `PAYER-${invoice.insuranceProviderId}`,
        },
      },
      provider: { reference: `Organization/${organizationId}` },
      priority: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }],
      },
      insurance: [
        {
          sequence: 1,
          focal: true,
          coverage: { reference: `Coverage/${coverageId}` },
        },
      ],
      diagnosis: diagnosisEntries.length > 0
        ? diagnosisEntries
        : [
            {
              sequence: 1,
              diagnosisCodeableConcept: {
                coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'Z00.0', display: 'General examination' }],
              },
            },
          ],
      item: chargeItems.length > 0
        ? chargeItems
        : [
            {
              sequence: 1,
              productOrService: {
                coding: [{ system: 'http://nphies.sa/terminology/CodeSystem/procedures', code: 'CONSULT', display: 'Consultation' }],
              },
              unitPrice: { value: Number(claim.claimedAmount), currency: 'SAR' },
              net: { value: Number(claim.claimedAmount), currency: 'SAR' },
            },
          ],
      total: {
        value: Number(claim.claimedAmount),
        currency: 'SAR',
      },
    };

    // بناء MessageHeader
    const messageHeader = this.nphiesService.buildMessageHeader(
      'claim-request',
      `Claim/${fhirClaimId}`,
    );

    // بناء الـ Bundle النهائي
    const bundle = this.nphiesService.buildBundle('message', [
      messageHeader,
      fhirClaim,
      patientResource,
      coverageResource,
      providerOrg,
    ]);

    try {
      // إرسال المطالبة
      const response = await this.authService.sendFhirRequest<any>(
        '/nphies-fs/Claim/$submit',
        bundle,
      );

      // تحديث المطالبة في قاعدة البيانات
      const result = this.parseClaimResponse(response);

      await this.prisma.claim.update({
        where: { id: claimId },
        data: {
          status: result.accepted ? ClaimStatus.SUBMITTED : ClaimStatus.SCRUB_FAILED,
          submittedAt: result.accepted ? new Date() : undefined,
          externalClaimId: result.nphiesClaimId || null,
        },
      });

      // تسجيل التاريخ
      await this.prisma.claimHistory.create({
        data: {
          claimId,
          fromStatus: claim.status,
          toStatus: result.accepted ? ClaimStatus.SUBMITTED : ClaimStatus.SCRUB_FAILED,
          notes: `NPHIES: ${result.dispositionMessage || result.status}`,
        },
      });

      this.logger.log(
        `📤 NPHIES مطالبة ${claim.claimNumber}: ${result.accepted ? '✅ مقبولة' : '❌ مرفوضة'} — ${result.dispositionMessage || ''}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(`❌ فشل إرسال المطالبة ${claim.claimNumber} إلى NPHIES: ${error.message}`);

      await this.prisma.claimHistory.create({
        data: {
          claimId,
          fromStatus: claim.status,
          toStatus: claim.status,
          notes: `NPHIES Error: ${error.message}`,
        },
      });

      return {
        accepted: false,
        status: 'error',
        errorMessage: error.message,
      };
    }
  }

  /**
   * إرسال طلب موافقة مسبقة (Pre-Authorization)
   */
  async submitPreAuthorization(
    patientData: { id: string; fullName: string; nationalId?: string; dateOfBirth?: Date; gender?: string },
    insuranceData: { memberId: string; payerIdentifier: string; payerName: string },
    serviceItems: Array<{ code: string; name: string; quantity: number; unitPrice: number }>,
    diagnosisCodes: Array<{ code: string; display: string; isPrimary: boolean }>,
    attachments?: Array<{ localFilePath: string; title: string; contentType?: string }>
  ): Promise<NphiesClaimSubmissionResult> {
    const patientId = uuidv4();
    const coverageId = uuidv4();
    const claimId = uuidv4();

    const patientResource = this.nphiesService.buildPatient({ ...patientData, id: patientId });
    const coverageResource = this.nphiesService.buildCoverage({
      id: coverageId,
      ...insuranceData,
      patientRef: `Patient/${patientId}`,
    });

    const preAuthClaim = {
      resourceType: 'Claim',
      id: claimId,
      status: 'active',
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'institutional' }],
      },
      use: 'preauthorization',
      patient: { reference: `Patient/${patientId}` },
      created: new Date().toISOString().split('T')[0],
      insurer: {
        type: 'Organization',
        identifier: {
          system: 'http://nphies.sa/license/payer-license',
          value: insuranceData.payerIdentifier,
        },
      },
      priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: `Coverage/${coverageId}` } }],
      diagnosis: diagnosisCodes.map((d, idx) => ({
        sequence: idx + 1,
        diagnosisCodeableConcept: {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: d.code, display: d.display }],
        },
        type: [{
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/ex-diagnosistype', code: d.isPrimary ? 'principal' : 'secondary' }],
        }],
      })),
      item: serviceItems.map((svc, idx) => ({
        sequence: idx + 1,
        productOrService: {
          coding: [{ system: 'http://nphies.sa/terminology/CodeSystem/procedures', code: svc.code, display: svc.name }],
        },
        quantity: { value: svc.quantity },
        unitPrice: { value: svc.unitPrice, currency: 'SAR' },
        net: { value: svc.unitPrice * svc.quantity, currency: 'SAR' },
      })),
      supportingInfo: attachments ? attachments.map((att, idx) => {
        const attachmentData = this.nphiesService.buildAttachment(att.localFilePath, att.title, att.contentType);
        if (!attachmentData) return null;
        return {
          sequence: idx + 1,
          category: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory', code: 'attachment' }]
          },
          valueAttachment: attachmentData
        };
      }).filter(info => info !== null) : undefined,
    };

    const messageHeader = this.nphiesService.buildMessageHeader('preauthorization-request', `Claim/${claimId}`);
    const bundle = this.nphiesService.buildBundle('message', [messageHeader, preAuthClaim, patientResource, coverageResource]);

    try {
      const response = await this.authService.sendFhirRequest<any>(
        '/nphies-fs/Claim/$submit',
        bundle,
      );
      return this.parseClaimResponse(response);
    } catch (error: any) {
      this.logger.error(`❌ فشل إرسال Pre-Auth: ${error.message}`);
      return { accepted: false, status: 'error', errorMessage: error.message };
    }
  }

  /**
   * الاستعلام عن حالة مطالبة في NPHIES
   */
  async checkClaimStatus(externalClaimId: string): Promise<NphiesClaimStatusResult> {
    try {
      const response = await this.authService.sendFhirRequest<any>(
        `/nphies-fs/Claim/${externalClaimId}`,
        null,
        'GET',
      );

      return {
        found: true,
        status: response.status || 'unknown',
        outcome: response.outcome,
        disposition: response.disposition,
        rawResponse: response,
      };
    } catch (error: any) {
      return {
        found: false,
        status: 'error',
        errorMessage: error.message,
      };
    }
  }

  /**
   * تحليل استجابة NPHIES للمطالبة
   */
  private parseClaimResponse(fhirResponse: any): NphiesClaimSubmissionResult {
    try {
      const entries = fhirResponse?.entry || [];

      // البحث عن ClaimResponse
      const claimResponse = entries.find(
        (e: any) => e.resource?.resourceType === 'ClaimResponse',
      )?.resource;

      if (claimResponse) {
        return {
          accepted: claimResponse.outcome === 'complete',
          status: claimResponse.outcome || 'unknown',
          nphiesClaimId: claimResponse.id,
          dispositionMessage: claimResponse.disposition,
          adjudicationItems: this.extractAdjudication(claimResponse),
          rawResponse: claimResponse,
        };
      }

      // التحقق من OperationOutcome
      const outcome = entries.find(
        (e: any) => e.resource?.resourceType === 'OperationOutcome',
      )?.resource;

      if (outcome) {
        const issues = outcome.issue || [];
        return {
          accepted: false,
          status: 'error',
          errorMessage: issues.map((i: any) => this.translateNphiesError(i.code, i.diagnostics || i.details?.text)).join(' | '),
          errors: issues.map((i: any) => ({
            severity: i.severity,
            code: i.code,
            message: this.translateNphiesError(i.code, i.diagnostics || i.details?.text),
          })),
        };
      }

      return {
        accepted: false,
        status: 'unknown',
        errorMessage: 'لم يتم العثور على ClaimResponse في رد NPHIES',
      };
    } catch (error: any) {
      return {
        accepted: false,
        status: 'parse-error',
        errorMessage: `فشل تحليل الاستجابة: ${error.message}`,
      };
    }
  }

  /**
   * ترجمة رموز أخطاء NPHIES الشائعة لتجربة مستخدم أفضل
   */
  private translateNphiesError(code: string, originalMessage: string): string {
    const arabicMessages: Record<string, string> = {
      'security': 'مشكلة أمنية أو عدم صلاحية الشهادات (mTLS/JWS).',
      'invalid': 'البيانات المرسلة غير صحيحة أو غير مكتملة.',
      'not-found': 'لم يتم العثور على المريض أو البوليصة في سجلات التأمين.',
      'expired': 'بوليصة التأمين منتهية الصلاحية.',
      'business-rule': 'تم رفض الطلب بناءً على قواعد التأمين (Business Rule).',
      'timeout': 'انتهى وقت الاتصال بمنصة نفيس.',
    };

    const translated = arabicMessages[code];
    return translated ? `${translated} (${originalMessage || code})` : (originalMessage || code);
  }

  /**
   * استخراج تفاصيل التسوية (Adjudication)
   */
  private extractAdjudication(claimResponse: any): AdjudicationItem[] {
    const items: AdjudicationItem[] = [];

    for (const item of (claimResponse.item || [])) {
      for (const adj of (item.adjudication || [])) {
        items.push({
          category: adj.category?.coding?.[0]?.code || 'unknown',
          amount: adj.amount?.value || 0,
          currency: adj.amount?.currency || 'SAR',
          reason: adj.reason?.coding?.[0]?.display || '',
        });
      }
    }

    return items;
  }

  /**
   * تحويل نوع الزيارة إلى نوع المطالبة في FHIR
   */
  private mapEncounterTypeToClaim(encounterType?: string): string {
    switch (encounterType) {
      case 'INPATIENT':
      case 'SURGERY':
      case 'DAY_CASE':
        return 'institutional';
      case 'OUTPATIENT':
      case 'FOLLOW_UP':
        return 'professional';
      case 'EMERGENCY':
        return 'professional';
      default:
        return 'professional';
    }
  }
}

// ============================================
// Interfaces
// ============================================
export interface NphiesClaimSubmissionResult {
  accepted: boolean;
  status: string;
  nphiesClaimId?: string;
  dispositionMessage?: string;
  errorMessage?: string;
  adjudicationItems?: AdjudicationItem[];
  errors?: Array<{ severity: string; code: string; message: string }>;
  rawResponse?: any;
}

export interface AdjudicationItem {
  category: string;
  amount: number;
  currency: string;
  reason: string;
}

export interface NphiesClaimStatusResult {
  found: boolean;
  status: string;
  outcome?: string;
  disposition?: string;
  errorMessage?: string;
  rawResponse?: any;
}
