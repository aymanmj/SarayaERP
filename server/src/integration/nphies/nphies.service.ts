import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * خدمة بناء رسائل FHIR المتوافقة مع NPHIES
 * 
 * NPHIES تستخدم FHIR R4 bundles لكل العمليات:
 * - Eligibility Request → CoverageEligibilityRequest
 * - Pre-Authorization → Claim (use=preauthorization)
 * - Claim Submission → Claim (use=claim)
 * 
 * كل Bundle يحتوي:
 * 1. MessageHeader — يحدد نوع الرسالة والمُرسِل والمُستقبِل
 * 2. Resource entries — الموارد المطلوبة حسب نوع العملية
 * 
 * @see https://build.fhir.org/ig/nichetech/NPHIES-Implementation-Guide/
 */
@Injectable()
export class NphiesService {
  private readonly logger = new Logger(NphiesService.name);

  /** معرّف المُرسِل (المستشفى/مقدم الخدمة) */
  private readonly senderId: string;
  /** معرّف المُستقبِل (NPHIES) */
  private readonly receiverId: string;
  /** Base URL لملفات التعريف (profiles) */
  private readonly profileBase: string;

  constructor(private configService: ConfigService) {
    this.senderId = this.configService.get<string>('NPHIES_SENDER_ID', 'provider-org-001');
    this.receiverId = this.configService.get<string>('NPHIES_RECEIVER_ID', 'payer-org-001');
    this.profileBase = 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition';
  }

  /**
   * بناء MessageHeader — مطلوب في كل Bundle NPHIES
   * 
   * @param eventType نوع الحدث: eligibility-request | preauthorization | claim
   * @param focusRef مرجع المورد الأساسي في الـ Bundle
   */
  buildMessageHeader(eventType: string, focusRef: string): any {
    return {
      resourceType: 'MessageHeader',
      id: uuidv4(),
      meta: {
        profile: [`${this.profileBase}/message-header|1.0.0`],
      },
      eventCoding: {
        system: 'http://nphies.sa/terminology/CodeSystem/ksa-message-events',
        code: eventType,
      },
      destination: [
        {
          endpoint: `http://nphies.sa/license/payer-license/${this.receiverId}`,
          receiver: {
            type: 'Organization',
            identifier: {
              system: 'http://nphies.sa/license/payer-license',
              value: this.receiverId,
            },
          },
        },
      ],
      sender: {
        type: 'Organization',
        identifier: {
          system: 'http://nphies.sa/license/provider-license',
          value: this.senderId,
        },
      },
      source: {
        endpoint: `http://nphies.sa/license/provider-license/${this.senderId}`,
      },
      focus: [{ reference: focusRef }],
    };
  }

  /**
   * بناء FHIR Patient Resource
   */
  buildPatient(patient: {
    id: string;
    fullName: string;
    nationalId?: string;
    dateOfBirth?: Date;
    gender?: string;
    phone?: string;
  }): any {
    return {
      resourceType: 'Patient',
      id: patient.id,
      meta: {
        profile: [`${this.profileBase}/patient|1.0.0`],
      },
      identifier: patient.nationalId
        ? [
            {
              type: {
                coding: [
                  { system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'NI' },
                ],
              },
              system: 'http://nphies.sa/identifier/national-id',
              value: patient.nationalId,
            },
          ]
        : [],
      name: [
        {
          text: patient.fullName,
          family: patient.fullName.split(' ').pop() || '',
          given: [patient.fullName.split(' ')[0] || ''],
        },
      ],
      gender: this.mapGender(patient.gender),
      birthDate: patient.dateOfBirth
        ? patient.dateOfBirth.toISOString().split('T')[0]
        : undefined,
      telecom: patient.phone
        ? [{ system: 'phone', value: patient.phone }]
        : [],
    };
  }

  /**
   * بناء FHIR Coverage Resource (بوليصة التأمين)
   */
  buildCoverage(coverage: {
    id: string;
    memberId: string;
    payerIdentifier: string;
    payerName: string;
    patientRef: string;
    relationship?: string;
    classValue?: string;
    className?: string;
  }): any {
    return {
      resourceType: 'Coverage',
      id: coverage.id,
      meta: {
        profile: [`${this.profileBase}/coverage|1.0.0`],
      },
      identifier: [
        {
          system: `http://nphies.sa/license/payer-license/${coverage.payerIdentifier}`,
          value: coverage.memberId,
        },
      ],
      status: 'active',
      type: {
        coding: [
          {
            system: 'http://nphies.sa/terminology/CodeSystem/coverage-type',
            code: 'EHCPOL',
            display: 'extended healthcare',
          },
        ],
      },
      subscriber: { reference: coverage.patientRef },
      beneficiary: { reference: coverage.patientRef },
      relationship: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
            code: coverage.relationship || 'self',
          },
        ],
      },
      payor: [
        {
          type: 'Organization',
          identifier: {
            system: 'http://nphies.sa/license/payer-license',
            value: coverage.payerIdentifier,
          },
          display: coverage.payerName,
        },
      ],
      class: coverage.classValue
        ? [
            {
              type: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                    code: 'group',
                  },
                ],
              },
              value: coverage.classValue,
              name: coverage.className || coverage.classValue,
            },
          ]
        : [],
    };
  }

  /**
   * بناء FHIR Bundle كامل (الغلاف المشترك)
   * 
   * @param type نوع البوندل (message)
   * @param entries مصفوفة الموارد
   */
  buildBundle(type: 'message' | 'transaction', entries: any[]): any {
    return {
      resourceType: 'Bundle',
      id: uuidv4(),
      type,
      timestamp: new Date().toISOString(),
      entry: entries.map((resource) => ({
        fullUrl: `urn:uuid:${resource.id || uuidv4()}`,
        resource,
      })),
    };
  }

  /**
   * تحويل جنس المريض من النظام إلى FHIR
   */
  private mapGender(gender?: string): string {
    switch (gender?.toUpperCase()) {
      case 'MALE':
        return 'male';
      case 'FEMALE':
        return 'female';
      default:
        return 'unknown';
    }
  }
}
