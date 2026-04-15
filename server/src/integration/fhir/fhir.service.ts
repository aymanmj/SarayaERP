
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Enterprise FHIR R4 Service
 * 
 * Provides full FHIR resource operations with:
 * - Patient context isolation (SMART on FHIR)
 * - Standard LOINC/SNOMED terminology coding
 * - Bidirectional data flow (read + write)
 * - Real Webhook dispatch (Subscriptions)
 * - Context-aware CDS Hooks
 * - Proper resource mappings per HL7 FHIR R4 spec
 */

// ============================================================
// Drug-Allergy Interaction Map (Enterprise CDS Knowledge Base)
// In production, this would be a comprehensive database or 
// an external CDS service like First Databank or Medi-Span
// ============================================================
const DRUG_ALLERGY_INTERACTIONS: Record<string, string[]> = {
  // Drug class → allergens that interact
  'penicillin': ['penicillin', 'amoxicillin', 'ampicillin', 'piperacillin', 'penicillin allergy', 'beta-lactam'],
  'amoxicillin': ['penicillin', 'amoxicillin', 'ampicillin', 'beta-lactam', 'penicillin allergy'],
  'ampicillin': ['penicillin', 'amoxicillin', 'ampicillin', 'beta-lactam', 'penicillin allergy'],
  'cephalosporin': ['penicillin', 'cephalosporin', 'beta-lactam'],
  'cefazolin': ['penicillin', 'cephalosporin', 'beta-lactam'],
  'sulfa': ['sulfonamide', 'sulfa', 'sulfamethoxazole', 'trimethoprim-sulfamethoxazole'],
  'sulfamethoxazole': ['sulfonamide', 'sulfa', 'sulfamethoxazole'],
  'aspirin': ['aspirin', 'nsaid', 'salicylate'],
  'ibuprofen': ['nsaid', 'ibuprofen', 'aspirin'],
  'naproxen': ['nsaid', 'naproxen', 'aspirin'],
  'morphine': ['opioid', 'morphine', 'codeine'],
  'codeine': ['opioid', 'codeine', 'morphine'],
  'metformin': ['metformin', 'biguanide'],
  'insulin': ['insulin'],
  'contrast': ['iodine', 'contrast dye', 'contrast'],
};

@Injectable()
export class FhirService {
  private readonly logger = new Logger(FhirService.name);

  constructor(private prisma: PrismaService) {}

  // ==========================================
  // Capability Statement (Metadata)
  // ==========================================
  getCapabilityStatement() {
    return {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString(),
      publisher: 'Saraya Medical ERP',
      kind: 'instance',
      software: {
        name: 'Saraya HIS',
        version: '2.0.0',
      },
      implementation: {
        description: 'Saraya HIS FHIR R4 API — Enterprise Interoperability Platform',
      },
      fhirVersion: '4.0.1',
      format: ['application/fhir+json'],
      rest: [
        {
          mode: 'server',
          security: {
            cors: true,
            service: [
              {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
                    code: 'SMART-on-FHIR',
                    display: 'SMART-on-FHIR',
                  },
                ],
                text: 'OAuth2 using SMART-on-FHIR profile (v2)',
              },
            ],
            extension: [
              {
                url: 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris',
                extension: [
                  { url: 'authorize', valueUri: '/api/fhir/oauth/authorize' },
                  { url: 'token', valueUri: '/api/fhir/oauth/token' },
                ],
              },
            ],
          },
          resource: [
            {
              type: 'Patient',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [
                { name: 'name', type: 'string' },
                { name: 'identifier', type: 'token' },
                { name: 'phone', type: 'token' },
              ],
            },
            {
              type: 'Encounter',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'patient', type: 'reference' }],
            },
            {
              type: 'Observation',
              interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }],
              searchParam: [
                { name: 'patient', type: 'reference' },
                { name: 'category', type: 'token' },
                { name: 'code', type: 'token' },
              ],
            },
            {
              type: 'Practitioner',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'name', type: 'string' }],
            },
            {
              type: 'Organization',
              interaction: [{ code: 'read' }],
            },
            {
              type: 'Condition',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [
                { name: 'patient', type: 'reference' },
                { name: 'clinical-status', type: 'token' },
              ],
            },
            {
              type: 'AllergyIntolerance',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'patient', type: 'reference' }],
            },
            {
              type: 'MedicationRequest',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [
                { name: 'patient', type: 'reference' },
                { name: 'status', type: 'token' },
              ],
            },
            {
              type: 'Procedure',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'patient', type: 'reference' }],
            },
            {
              type: 'Subscription',
              interaction: [{ code: 'read' }, { code: 'create' }],
            },
          ],
        },
      ],
    };
  }

  // ==========================================
  // Bundle Generator
  // ==========================================
  private createBundle(resources: any[], total: number, url: string) {
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total,
      timestamp: new Date().toISOString(),
      link: [{ relation: 'self', url }],
      entry: resources.map((resource) => ({
        fullUrl: `${url}/${resource.id}`,
        resource,
        search: { mode: 'match' },
      })),
    };
  }

  // ==========================================
  // PATIENT
  // ==========================================
  async getPatient(id: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException(`Patient with ID ${id} not found`);
    return this.mapToFhirPatient(patient);
  }

  async searchPatients(query: any, baseUrl: string, patientContext?: number) {
    const where: Prisma.PatientWhereInput = {};
    
    // SMART Patient Context Isolation: force filter to the scoped patient
    if (patientContext !== undefined) {
      where.id = patientContext;
    }

    if (query.name) {
      where.fullName = { contains: query.name, mode: 'insensitive' };
    }
    if (query.identifier) {
      where.OR = [
        { mrn: { equals: query.identifier } },
        { nationalId: { equals: query.identifier } }
      ];
    }
    if (query.phone) {
      where.phone = { contains: query.phone };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({ where, take: 50 }),
      this.prisma.patient.count({ where }),
    ]);

    const resources = items.map(p => this.mapToFhirPatient(p));
    return this.createBundle(resources, total, `${baseUrl}/Patient`);
  }

  private mapToFhirPatient(patient: any) {
    const nameParts = patient.fullName.split(' ');
    const family = nameParts.pop() || '';
    const given = nameParts;

    return {
      resourceType: 'Patient',
      id: patient.id.toString(),
      meta: {
        lastUpdated: patient.updatedAt?.toISOString() || patient.createdAt?.toISOString(),
      },
      active: patient.isActive,
      identifier: [
        {
          use: 'official',
          type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR', display: 'Medical Record Number' }] },
          system: 'http://saraya-erp.com/mrn',
          value: patient.mrn,
        },
        ...(patient.nationalId ? [{
          type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'NI', display: 'National Identifier' }] },
          system: 'http://saraya-erp.com/national-id',
          value: patient.nationalId,
        }] : []),
      ],
      name: [{ use: 'official', family, given, text: patient.fullName }],
      telecom: [
        ...(patient.phone ? [{ system: 'phone', value: patient.phone, use: 'mobile' }] : []),
        ...(patient.email ? [{ system: 'email', value: patient.email }] : []),
      ],
      gender: this.mapGender(patient.gender),
      birthDate: patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
      address: patient.address ? [{ text: patient.address, use: 'home' }] : undefined,
    };
  }

  private mapGender(gender: string): string {
    if (!gender) return 'unknown';
    const g = gender.toLowerCase();
    if (g === 'male' || g === 'm') return 'male';
    if (g === 'female' || g === 'f') return 'female';
    return 'other';
  }

  // ==========================================
  // PRACTITIONER (User)
  // ==========================================
  async getPractitioner(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Practitioner not found`);
    return this.mapToFhirPractitioner(user);
  }

  async searchPractitioners(query: any, baseUrl: string) {
    const where: Prisma.UserWhereInput = { isActive: true };
    if (query.name) {
      where.fullName = { contains: query.name, mode: 'insensitive' };
    }
    
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, take: 50 }),
      this.prisma.user.count({ where }),
    ]);

    const resources = items.map(u => this.mapToFhirPractitioner(u));
    return this.createBundle(resources, total, `${baseUrl}/Practitioner`);
  }

  private mapToFhirPractitioner(user: any) {
    return {
      resourceType: 'Practitioner',
      id: user.id.toString(),
      active: user.isActive,
      name: [{ use: 'usual', text: user.fullName }],
      telecom: [
        ...(user.phone ? [{ system: 'phone', value: user.phone }] : []),
        ...(user.email ? [{ system: 'email', value: user.email }] : []),
      ]
    };
  }

  // ==========================================
  // ORGANIZATION (Hospital)
  // ==========================================
  async getOrganization(id: number) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id } });
    if (!hospital) throw new NotFoundException('Organization not found');
    return this.mapToFhirOrganization(hospital);
  }

  private mapToFhirOrganization(hospital: any) {
    return {
      resourceType: 'Organization',
      id: hospital.id.toString(),
      active: hospital.isActive,
      name: hospital.name,
      telecom: [
        ...(hospital.phone ? [{ system: 'phone', value: hospital.phone }] : []),
        ...(hospital.email ? [{ system: 'email', value: hospital.email }] : []),
      ],
      address: hospital.address ? [{ text: hospital.address }] : undefined,
    };
  }

  // ==========================================
  // ENCOUNTER (with patient context isolation)
  // ==========================================
  async getEncounter(id: number, patientContext?: number) {
    const encounter = await this.prisma.encounter.findUnique({ where: { id } });
    if (!encounter) throw new NotFoundException('Encounter not found');
    
    // Enforce patient context isolation
    if (patientContext !== undefined && encounter.patientId !== patientContext) {
      throw new ForbiddenException(
        `Access denied. Encounter/${id} belongs to Patient/${encounter.patientId}, ` +
        `but your token is scoped to Patient/${patientContext}.`
      );
    }
    
    return this.mapToFhirEncounter(encounter);
  }

  async searchEncounters(query: any, baseUrl: string, patientContext?: number) {
    const where: Prisma.EncounterWhereInput = {};
    
    // SMART Patient Context Isolation
    if (patientContext !== undefined) {
      where.patientId = patientContext;
    } else if (query.patient) {
      const patientId = query.patient.startsWith('Patient/') ? query.patient.split('/')[1] : query.patient;
      where.patientId = Number(patientId);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.encounter.findMany({ where, take: 50, orderBy: { createdAt: 'desc' } }),
      this.prisma.encounter.count({ where }),
    ]);

    const resources = items.map(e => this.mapToFhirEncounter(e));
    return this.createBundle(resources, total, `${baseUrl}/Encounter`);
  }

  private mapToFhirEncounter(encounter: any) {
    const statusMap: any = { OPEN: 'in-progress', COMPLETED: 'finished', CANCELLED: 'cancelled', ADMITTED: 'in-progress', DISCHARGED: 'finished' };
    return {
      resourceType: 'Encounter',
      id: encounter.id.toString(),
      status: statusMap[encounter.status] || 'unknown',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: encounter.type === 'IPD' ? 'IMP' : (encounter.type === 'ER' ? 'EMER' : 'AMB'),
        display: encounter.type,
      },
      subject: { reference: `Patient/${encounter.patientId}` },
      period: {
        start: encounter.createdAt.toISOString(),
        ...(encounter.dischargedAt ? { end: encounter.dischargedAt.toISOString() } : {}),
      }
    };
  }

  // ==========================================
  // OBSERVATION (Vitals/Labs) — with patient isolation
  // ==========================================
  async getObservation(id: number, patientContext?: number) {
    const vital = await this.prisma.vitalSign.findUnique({ 
      where: { id },
      include: { encounter: true }
    });
    if (!vital) throw new NotFoundException('Observation not found');

    // Enforce patient context isolation
    if (patientContext !== undefined && vital.encounter?.patientId !== patientContext) {
      throw new ForbiddenException(
        `Access denied. Observation/${id} belongs to Patient/${vital.encounter?.patientId}, ` +
        `but your token is scoped to Patient/${patientContext}.`
      );
    }

    return this.mapToFhirObservation(vital);
  }

  async searchObservations(query: any, baseUrl: string, patientContext?: number) {
    const where: Prisma.VitalSignWhereInput = {};
    
    // SMART Patient Context Isolation
    if (patientContext !== undefined) {
      where.encounter = { patientId: patientContext };
    } else if (query.patient) {
      const patientId = query.patient.startsWith('Patient/') ? query.patient.split('/')[1] : query.patient;
      where.encounter = { patientId: Number(patientId) };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vitalSign.findMany({ 
        where, 
        take: 50, 
        orderBy: { createdAt: 'desc' },
        include: { encounter: true }
      }),
      this.prisma.vitalSign.count({ where }),
    ]);

    const resources = items.map(v => this.mapToFhirObservation(v));
    return this.createBundle(resources, total, `${baseUrl}/Observation`);
  }

  /**
   * Maps a VitalSign record to a FHIR Observation resource.
   * 
   * Blood Pressure is mapped as proper FHIR components per the
   * US Core Blood Pressure Profile, using standard LOINC codes:
   *  - 85354-9: Blood pressure panel (parent)
   *  - 8480-6: Systolic blood pressure
   *  - 8462-4: Diastolic blood pressure
   */
  private mapToFhirObservation(vital: any) {
    const components: any[] = [];
    
    if (vital.pulse) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }], text: 'Heart rate' },
        valueQuantity: { value: vital.pulse, unit: 'beats/min', system: 'http://unitsofmeasure.org', code: '/min' }
      });
    }
    if (vital.respRate) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '9279-1', display: 'Respiratory rate' }], text: 'Respiratory rate' },
        valueQuantity: { value: vital.respRate, unit: 'breaths/min', system: 'http://unitsofmeasure.org', code: '/min' }
      });
    }
    if (vital.temperature) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }], text: 'Body temperature' },
        valueQuantity: { value: Number(vital.temperature), unit: 'Cel', system: 'http://unitsofmeasure.org', code: 'Cel' }
      });
    }
    if (vital.o2Sat) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '2708-6', display: 'Oxygen saturation' }], text: 'SpO2' },
        valueQuantity: { value: Number(vital.o2Sat), unit: '%', system: 'http://unitsofmeasure.org', code: '%' }
      });
    }

    // Blood Pressure: proper FHIR component structure per US Core BP Profile
    if (vital.bpSystolic && vital.bpDiastolic) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }], text: 'Systolic BP' },
        valueQuantity: { value: vital.bpSystolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
      });
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }], text: 'Diastolic BP' },
        valueQuantity: { value: vital.bpDiastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
      });
    }

    const patientRef = vital.encounter && vital.encounter.patientId ? `Patient/${vital.encounter.patientId}` : 'Patient/unknown';

    return {
      resourceType: 'Observation',
      id: vital.id.toString(),
      meta: {
        lastUpdated: vital.updatedAt?.toISOString() || vital.createdAt?.toISOString(),
        profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-vital-signs'],
      },
      status: 'final',
      category: [
        {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: 'http://loinc.org', code: '85353-1', display: 'Vital signs, weight, height, head circumference, oxygen saturation and BMI panel' }],
        text: 'Vital Signs Panel',
      },
      subject: { reference: patientRef },
      encounter: vital.encounterId ? { reference: `Encounter/${vital.encounterId}` } : undefined,
      effectiveDateTime: vital.createdAt.toISOString(),
      component: components.length > 0 ? components : undefined
    };
  }

  // ==========================================
  // BIDIRECTIONAL WRITE: POST Observation
  // with Blood Pressure LOINC parsing
  // ==========================================
  
  async createObservation(payload: any, patientContext?: number) {
    if (payload.resourceType !== 'Observation') {
      throw new BadRequestException('Invalid resourceType, expected Observation');
    }
    
    // Extract Patient ID from reference "Patient/123"
    const subjectRef = payload.subject?.reference;
    if (!subjectRef || !subjectRef.startsWith('Patient/')) {
      throw new BadRequestException('Observation requires a valid subject reference (Patient/id)');
    }
    const patientId = parseInt(subjectRef.split('/')[1]);

    // Enforce patient context isolation on writes
    if (patientContext !== undefined && patientContext !== patientId) {
      throw new ForbiddenException(
        `Access denied. Your token is scoped to Patient/${patientContext}, ` +
        `but the Observation targets Patient/${patientId}. ` +
        `Cross-patient writes are prohibited.`
      );
    }

    // Find the active encounter for this patient
    const encounter = await this.prisma.encounter.findFirst({
      where: { patientId, status: { in: ['OPEN'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!encounter) {
      throw new BadRequestException('Patient must have an active Encounter to post vitals via FHIR');
    }

    // Map FHIR components back to our DB schema
    let pulse: number | undefined;
    let respRate: number | undefined;
    let temperature: number | undefined;
    let o2Sat: number | undefined;
    let bpSystolic: number | undefined;
    let bpDiastolic: number | undefined;

    if (payload.component && Array.isArray(payload.component)) {
      for (const comp of payload.component) {
        const code = comp.code?.coding?.[0]?.code;
        const value = comp.valueQuantity?.value;
        
        if (value === undefined || value === null) continue;

        switch (code) {
          case '8867-4': // Heart rate
            pulse = Number(value);
            break;
          case '9279-1': // Respiratory rate
            respRate = Number(value);
            break;
          case '8310-5': // Body temperature
            temperature = Number(value);
            break;
          case '2708-6': // Oxygen saturation (SpO2)
            o2Sat = Number(value);
            break;
          case '8480-6': // Systolic blood pressure
            bpSystolic = Number(value);
            break;
          case '8462-4': // Diastolic blood pressure
            bpDiastolic = Number(value);
            break;
          case '85354-9': // Blood pressure panel (legacy support)
            // If someone sends BP as a panel with sub-components, parse them
            if (comp.component && Array.isArray(comp.component)) {
              for (const sub of comp.component) {
                const subCode = sub.code?.coding?.[0]?.code;
                if (subCode === '8480-6') bpSystolic = Number(sub.valueQuantity?.value);
                if (subCode === '8462-4') bpDiastolic = Number(sub.valueQuantity?.value);
              }
            }
            break;
        }
      }
    }

    // Direct mapping for simple single-value Observations
    if (!pulse && payload.valueQuantity) {
      const code = payload.code?.coding?.[0]?.code;
      if (code === '8867-4') pulse = Number(payload.valueQuantity.value);
      if (code === '9279-1') respRate = Number(payload.valueQuantity.value);
      if (code === '8310-5') temperature = Number(payload.valueQuantity.value);
    }

    const vital = await this.prisma.vitalSign.create({
      data: {
        encounterId: encounter.id,
        pulse,
        respRate,
        temperature,
        o2Sat,
        bpSystolic,
        bpDiastolic,
        note: 'Imported via FHIR R4 API',
      }
    });

    this.logger.log(`📊 FHIR Observation created: ID=${vital.id} for Patient/${patientId} via Encounter/${encounter.id}`);

    // Fire webhook notifications for this event
    await this.emitFhirEvent('Observation', vital.id, patientId);

    return this.mapToFhirObservation({ ...vital, encounter });
  }

  // ==========================================
  // CONDITION (Problems/Diagnoses) — with patient isolation
  // ==========================================
  async getCondition(id: number, patientContext?: number) {
    const problem = await this.prisma.patientProblem.findUnique({ where: { id } });
    if (!problem) throw new NotFoundException('Condition not found');
    
    if (patientContext !== undefined && problem.patientId !== patientContext) {
      throw new ForbiddenException(
        `Access denied. Condition/${id} belongs to Patient/${problem.patientId}, ` +
        `but your token is scoped to Patient/${patientContext}.`
      );
    }
    
    return this.mapToFhirCondition(problem);
  }

  async searchConditions(query: any, baseUrl: string, patientContext?: number) {
    const where: Prisma.PatientProblemWhereInput = {};
    
    if (patientContext !== undefined) {
      where.patientId = patientContext;
    } else if (query.patient) {
      const patientId = query.patient.startsWith('Patient/') ? query.patient.split('/')[1] : query.patient;
      where.patientId = Number(patientId);
    }
    
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientProblem.findMany({ where, take: 50, orderBy: { createdAt: 'desc' } }),
      this.prisma.patientProblem.count({ where }),
    ]);
    const resources = items.map(p => this.mapToFhirCondition(p));
    return this.createBundle(resources, total, `${baseUrl}/Condition`);
  }

  private mapToFhirCondition(problem: any) {
    const clinicalStatus = problem.resolvedDate ? 'resolved' : 'active';
    return {
      resourceType: 'Condition',
      id: problem.id.toString(),
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: clinicalStatus, display: clinicalStatus }]
      },
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed', display: 'Confirmed' }]
      },
      category: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }
      ],
      code: {
        coding: [
          ...(problem.icdCode ? [{ system: 'http://hl7.org/fhir/sid/icd-10', code: problem.icdCode, display: problem.description }] : []),
          { system: 'http://snomed.info/sct', display: problem.description },
        ],
        text: problem.description
      },
      subject: { reference: `Patient/${problem.patientId}` },
      onsetDateTime: problem.onsetDate ? problem.onsetDate.toISOString() : problem.createdAt.toISOString(),
      abatementDateTime: problem.resolvedDate ? problem.resolvedDate.toISOString() : undefined,
      recordedDate: problem.createdAt.toISOString(),
    };
  }

  // ==========================================
  // ALLERGY INTOLERANCE — with patient isolation
  // ==========================================
  async getAllergy(id: number, patientContext?: number) {
    const allergy = await this.prisma.patientAllergy.findUnique({ where: { id } });
    if (!allergy) throw new NotFoundException('Allergy not found');
    
    if (patientContext !== undefined && allergy.patientId !== patientContext) {
      throw new ForbiddenException(
        `Access denied. AllergyIntolerance/${id} belongs to Patient/${allergy.patientId}, ` +
        `but your token is scoped to Patient/${patientContext}.`
      );
    }
    
    return this.mapToFhirAllergy(allergy);
  }

  async searchAllergies(query: any, baseUrl: string, patientContext?: number) {
    const where: Prisma.PatientAllergyWhereInput = {};
    
    if (patientContext !== undefined) {
      where.patientId = patientContext;
    } else if (query.patient) {
      const patientId = query.patient.startsWith('Patient/') ? query.patient.split('/')[1] : query.patient;
      where.patientId = Number(patientId);
    }
    
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientAllergy.findMany({ where, take: 50, orderBy: { createdAt: 'desc' } }),
      this.prisma.patientAllergy.count({ where }),
    ]);
    const resources = items.map(a => this.mapToFhirAllergy(a));
    return this.createBundle(resources, total, `${baseUrl}/AllergyIntolerance`);
  }

  private mapToFhirAllergy(allergy: any) {
    // Map severity to FHIR ValueSet
    const severityMap: Record<string, string> = {
      'MILD': 'mild', 'MODERATE': 'moderate', 'SEVERE': 'severe',
      'mild': 'mild', 'moderate': 'moderate', 'severe': 'severe',
    };

    return {
      resourceType: 'AllergyIntolerance',
      id: allergy.id.toString(),
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active', display: 'Active' }]
      },
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed', display: 'Confirmed' }]
      },
      type: 'allergy',
      category: ['medication'],
      code: {
        coding: [{ system: 'http://snomed.info/sct', display: allergy.allergen }],
        text: allergy.allergen
      },
      patient: { reference: `Patient/${allergy.patientId}` },
      reaction: allergy.reaction ? [{
        manifestation: [{ coding: [{ display: allergy.reaction }], text: allergy.reaction }],
        severity: severityMap[allergy.severity] || 'moderate',
      }] : undefined,
      recordedDate: allergy.createdAt.toISOString(),
    };
  }

  // ==========================================
  // MEDICATION REQUEST — Individual resources per item
  // ==========================================
  
  /**
   * GET /MedicationRequest/:id
   * 
   * Returns a Bundle of MedicationRequest resources — one per PrescriptionItem.
   * This follows the FHIR R4 specification which recommends one MedicationRequest
   * per medication, rather than bundling them into a single resource.
   */
  async getMedicationRequest(id: number, patientContext?: number) {
    const prescription = await this.prisma.prescription.findUnique({ 
      where: { id },
      include: { items: { include: { product: true } } } 
    });
    if (!prescription) throw new NotFoundException('MedicationRequest not found');
    
    if (patientContext !== undefined && prescription.patientId !== patientContext) {
      throw new ForbiddenException(
        `Access denied. MedicationRequest (Prescription/${id}) belongs to Patient/${prescription.patientId}, ` +
        `but your token is scoped to Patient/${patientContext}.`
      );
    }

    // Map each PrescriptionItem to a separate MedicationRequest
    const resources = this.mapPrescriptionToMedicationRequests(prescription);
    
    if (resources.length === 1) {
      return resources[0]; // Single medication — return directly
    }

    // Multiple medications — return as a Bundle
    return {
      resourceType: 'Bundle',
      type: 'collection',
      total: resources.length,
      entry: resources.map((r: any) => ({
        fullUrl: `MedicationRequest/${r.id}`,
        resource: r,
      })),
    };
  }

  async searchMedicationRequests(query: any, baseUrl: string, patientContext?: number) {
    const where: Prisma.PrescriptionWhereInput = {};
    
    if (patientContext !== undefined) {
      where.patientId = patientContext;
    } else if (query.patient) {
      const patientId = query.patient.startsWith('Patient/') ? query.patient.split('/')[1] : query.patient;
      where.patientId = Number(patientId);
    }

    if (query.status) {
      where.status = query.status.toUpperCase();
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({ where, include: { items: { include: { product: true } } }, take: 50, orderBy: { createdAt: 'desc' } }),
      this.prisma.prescription.count({ where }),
    ]);

    // Flatten: each PrescriptionItem becomes its own MedicationRequest
    const resources: any[] = [];
    for (const prescription of items) {
      resources.push(...this.mapPrescriptionToMedicationRequests(prescription));
    }

    return this.createBundle(resources, resources.length, `${baseUrl}/MedicationRequest`);
  }

  /**
   * Maps a Prescription (with items) to individual MedicationRequest resources.
   * Each PrescriptionItem generates a separate MedicationRequest with its own
   * dosageInstruction, making it compliant with the FHIR R4 standard.
   */
  private mapPrescriptionToMedicationRequests(prescription: any): any[] {
    if (!prescription.items || prescription.items.length === 0) {
      // Prescription with no items — return a single placeholder
      return [{
        resourceType: 'MedicationRequest',
        id: `${prescription.id}-0`,
        status: prescription.status === 'ACTIVE' ? 'active' : 'completed',
        intent: 'order',
        subject: { reference: `Patient/${prescription.patientId}` },
        encounter: { reference: `Encounter/${prescription.encounterId}` },
        requester: { reference: `Practitioner/${prescription.doctorId}` },
        authoredOn: prescription.createdAt.toISOString(),
        medicationCodeableConcept: { text: 'Unspecified Medication' },
        groupIdentifier: {
          system: 'http://saraya-erp.com/prescription',
          value: prescription.id.toString(),
        },
      }];
    }

    return prescription.items.map((item: any, index: number) => {
      const resource: any = {
        resourceType: 'MedicationRequest',
        id: `${prescription.id}-${index}`,
        meta: {
          lastUpdated: prescription.updatedAt?.toISOString() || prescription.createdAt?.toISOString(),
        },
        status: prescription.status === 'ACTIVE' ? 'active' : 'completed',
        intent: 'order',
        subject: { reference: `Patient/${prescription.patientId}` },
        encounter: { reference: `Encounter/${prescription.encounterId}` },
        requester: { reference: `Practitioner/${prescription.doctorId}` },
        authoredOn: prescription.createdAt.toISOString(),
        // Group identifier links all MedicationRequests from the same Prescription
        groupIdentifier: {
          system: 'http://saraya-erp.com/prescription',
          value: prescription.id.toString(),
        },
        medicationCodeableConcept: {
          coding: [
            ...(item.product?.barcode ? [{ system: 'http://saraya-erp.com/product', code: item.product.barcode, display: item.product.name }] : []),
          ],
          text: item.product?.name || 'Unknown Medication',
        },
      };

      // Dosage instructions
      const dosageInstruction: any = {};
      if (item.dosage) dosageInstruction.text = item.dosage;
      if (item.frequency) dosageInstruction.timing = { code: { text: item.frequency } };
      if (item.duration) dosageInstruction.timing = { ...(dosageInstruction.timing || {}), repeat: { boundsPeriod: { start: prescription.createdAt.toISOString() } } };
      if (item.route) dosageInstruction.route = { text: item.route };
      if (item.quantity) {
        dosageInstruction.doseAndRate = [{
          doseQuantity: { value: Number(item.quantity), unit: item.unit || 'dose' },
        }];
      }

      if (Object.keys(dosageInstruction).length > 0) {
        resource.dosageInstruction = [dosageInstruction];
      }

      // Dispense request
      if (item.quantity) {
        resource.dispenseRequest = {
          quantity: { value: Number(item.quantity), unit: item.unit || 'dose' },
        };
      }

      if (prescription.notes) {
        resource.note = [{ text: prescription.notes }];
      }

      return resource;
    });
  }

  // ==========================================
  // PROCEDURE (SurgeryCase) — with patient isolation
  // ==========================================
  async getProcedure(id: number, patientContext?: number) {
    const surgery = await this.prisma.surgeryCase.findUnique({ 
      where: { id },
      include: { encounter: true },
    });
    if (!surgery) throw new NotFoundException('Procedure not found');

    const surgeryPatientId = surgery.encounter?.patientId;
    if (patientContext !== undefined && surgeryPatientId !== patientContext) {
      throw new ForbiddenException(
        `Access denied. Procedure/${id} belongs to Patient/${surgeryPatientId}, ` +
        `but your token is scoped to Patient/${patientContext}.`
      );
    }
    
    return this.mapToFhirProcedure(surgery);
  }

  async searchProcedures(query: any, baseUrl: string, patientContext?: number) {
    const where: Prisma.SurgeryCaseWhereInput = {};
    
    if (patientContext !== undefined) {
      where.encounter = { patientId: patientContext };
    } else if (query.patient) {
      const patientId = query.patient.startsWith('Patient/') ? query.patient.split('/')[1] : query.patient;
      where.encounter = { patientId: Number(patientId) };
    }
    
    const [items, total] = await this.prisma.$transaction([
      this.prisma.surgeryCase.findMany({ where, include: { encounter: true }, take: 50, orderBy: { createdAt: 'desc' } }),
      this.prisma.surgeryCase.count({ where }),
    ]);
    const resources = items.map(s => this.mapToFhirProcedure(s));
    return this.createBundle(resources, total, `${baseUrl}/Procedure`);
  }

  private mapToFhirProcedure(surgery: any) {
    const statusMap: Record<string, string> = {
      'COMPLETED': 'completed',
      'SCHEDULED': 'preparation',
      'IN_PROGRESS': 'in-progress',
      'CANCELLED': 'stopped',
    };

    const patientRef = surgery.encounter && surgery.encounter.patientId ? `Patient/${surgery.encounter.patientId}` : 'Patient/unknown';

    return {
      resourceType: 'Procedure',
      id: surgery.id.toString(),
      status: statusMap[surgery.status] || 'unknown',
      category: {
        coding: [{ system: 'http://snomed.info/sct', code: '387713003', display: 'Surgical procedure' }]
      },
      code: {
        ...(surgery.cptCode ? { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: surgery.cptCode, display: surgery.surgeryName }] } : {}),
        text: surgery.surgeryName
      },
      subject: { reference: patientRef },
      encounter: { reference: `Encounter/${surgery.encounterId}` },
      performedPeriod: {
        start: surgery.actualStart ? surgery.actualStart.toISOString() : surgery.scheduledStart.toISOString(),
        end: surgery.actualEnd ? surgery.actualEnd.toISOString() : undefined
      },
      note: surgery.surgeonNotes ? [{ text: surgery.surgeonNotes }] : undefined
    };
  }

  // ==========================================
  // SUBSCRIPTIONS — Real Webhook Dispatch
  // ==========================================

  // In-memory subscription store (production: Redis/DB backed)
  private subscriptions: Map<string, any> = new Map();

  async createSubscription(payload: any) {
    if (payload.resourceType !== 'Subscription') {
      throw new BadRequestException('Invalid resourceType, expected Subscription');
    }

    // Validate required fields
    if (!payload.criteria) {
      throw new BadRequestException('Subscription requires a criteria field (e.g., "Observation?patient=Patient/1")');
    }
    if (!payload.channel?.type || payload.channel.type !== 'rest-hook') {
      throw new BadRequestException('Only rest-hook channel type is currently supported');
    }
    if (!payload.channel?.endpoint) {
      throw new BadRequestException('Subscription channel requires an endpoint URL');
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const subscription = {
      resourceType: 'Subscription',
      id,
      status: 'active',
      reason: payload.reason || 'FHIR event notification',
      criteria: payload.criteria,
      channel: {
        type: 'rest-hook',
        endpoint: payload.channel.endpoint,
        payload: payload.channel.payload || 'application/fhir+json',
        header: payload.channel.header || [],
      },
      end: payload.end, // Optional expiration
    };

    this.subscriptions.set(id, subscription);
    this.logger.log(`📡 FHIR Subscription created: ${id} | criteria: ${payload.criteria} | endpoint: ${payload.channel.endpoint}`);

    return subscription;
  }

  async getSubscription(id: string) {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  /**
   * List all active subscriptions.
   */
  listSubscriptions(baseUrl: string) {
    const subs = Array.from(this.subscriptions.values()).filter(s => s.status === 'active');
    return this.createBundle(subs, subs.length, `${baseUrl}/Subscription`);
  }

  /**
   * Real FHIR Event Dispatcher.
   * 
   * When a clinical event occurs (e.g., Observation created),
   * this method iterates over active subscriptions, matches the criteria,
   * and dispatches HTTP POST webhooks to the registered endpoints.
   * 
   * This replaces the previous stub (console.log-only) implementation.
   */
  async emitFhirEvent(resourceType: string, resourceId: number, patientId?: number) {
    if (this.subscriptions.size === 0) return;

    this.logger.log(`🔔 FHIR Event: ${resourceType}/${resourceId} — checking ${this.subscriptions.size} active subscriptions`);

    for (const [subId, sub] of this.subscriptions.entries()) {
      if (sub.status !== 'active') continue;

      // Check if subscription has expired
      if (sub.end && new Date(sub.end) < new Date()) {
        sub.status = 'off';
        this.logger.log(`⏰ Subscription ${subId} expired, deactivating`);
        continue;
      }

      // Match criteria: "Observation?patient=Patient/1" or just "Observation"
      const criteriaMatch = this.matchesCriteria(sub.criteria, resourceType, patientId);
      if (!criteriaMatch) continue;

      // Dispatch the webhook
      const endpoint = sub.channel.endpoint;
      const notificationPayload = {
        resourceType: 'Bundle',
        type: 'history',
        timestamp: new Date().toISOString(),
        entry: [{
          fullUrl: `${resourceType}/${resourceId}`,
          resource: {
            resourceType,
            id: resourceId.toString(),
          },
          request: {
            method: 'POST',
            url: `${resourceType}/${resourceId}`,
          },
        }],
      };

      // Non-blocking HTTP dispatch using native fetch
      this.dispatchWebhook(subId, endpoint, notificationPayload, sub.channel.header);
    }
  }

  /**
   * Matches subscription criteria against a triggered event.
   * 
   * Criteria format: "ResourceType" or "ResourceType?param=value"
   * Examples:
   * - "Observation" → matches any Observation event
   * - "Observation?patient=Patient/5" → matches Observation events for Patient/5
   */
  private matchesCriteria(criteria: string, resourceType: string, patientId?: number): boolean {
    if (!criteria) return false;

    const [critResource, critParams] = criteria.split('?');
    
    // Resource type must match
    if (critResource !== resourceType) return false;
    
    // If no query params in criteria, any event of this type matches
    if (!critParams) return true;
    
    // Parse and check query parameters
    const params = new URLSearchParams(critParams);
    const patientFilter = params.get('patient');
    
    if (patientFilter && patientId) {
      const filteredId = patientFilter.startsWith('Patient/')
        ? parseInt(patientFilter.split('/')[1])
        : parseInt(patientFilter);
      return filteredId === patientId;
    }

    return true;
  }

  /**
   * Dispatches a webhook POST to the subscription endpoint.
   * Runs asynchronously and logs results without blocking the main flow.
   */
  private async dispatchWebhook(subId: string, endpoint: string, payload: any, headers?: string[]) {
    try {
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/fhir+json',
      };

      // Parse custom headers (format: "Key: Value")
      if (headers && Array.isArray(headers)) {
        for (const h of headers) {
          const colonIdx = h.indexOf(':');
          if (colonIdx > 0) {
            fetchHeaders[h.substring(0, colonIdx).trim()] = h.substring(colonIdx + 1).trim();
          }
        }
      }

      this.logger.log(`📤 Dispatching webhook ${subId} → ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        this.logger.log(`✅ Webhook ${subId} delivered successfully (${response.status})`);
      } else {
        this.logger.warn(`⚠️ Webhook ${subId} returned ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // Network errors are logged but don't crash the system
      this.logger.error(`❌ Webhook ${subId} dispatch failed to ${endpoint}: ${error.message}`);
    }
  }

  // ==========================================
  // CDS HOOKS — Context-Aware Decision Support
  // ==========================================
  getCdsServices() {
    return {
      services: [
        {
          hook: 'order-select',
          title: 'Saraya Drug Allergy Interaction Checker',
          description: 'Checks for drug-allergy interactions when prescribing medications. Evaluates the patient\'s recorded allergies against the selected medication using a comprehensive interaction database.',
          id: 'medication-advisor-1',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
            allergies: 'AllergyIntolerance?patient={{context.patientId}}'
          }
        },
        {
          hook: 'patient-view',
          title: 'Saraya Patient Safety Alerts',
          description: 'Displays critical safety alerts when viewing a patient chart, including active allergy warnings and medication alerts.',
          id: 'patient-alerts-1',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
            allergies: 'AllergyIntolerance?patient={{context.patientId}}'
          }
        }
      ]
    };
  }

  /**
   * Enterprise CDS Hooks Handler
   * 
   * Evaluates clinical context in real-time:
   * 1. Extracts patient ID and selected medications from the CDS request
   * 2. Queries the patient's actual allergies from the database
   * 3. Checks for drug-allergy interactions using the interaction map
   * 4. Returns warning cards ONLY when real interactions are detected
   * 
   * @param serviceId - The CDS service to invoke (e.g., 'medication-advisor-1')
   * @param payload - The CDS Hooks request payload with context and prefetch data
   */
  async handleCdsHook(serviceId: string, payload: any) {
    if (serviceId === 'medication-advisor-1') {
      return this.handleMedicationAdvisor(payload);
    }
    
    if (serviceId === 'patient-alerts-1') {
      return this.handlePatientAlerts(payload);
    }

    throw new NotFoundException(`CDS service '${serviceId}' not found`);
  }

  /**
   * Medication Advisor CDS Hook — Drug-Allergy Interaction Checker
   * 
   * Expected payload structure (per CDS Hooks spec):
   * {
   *   context: {
   *     patientId: "123",
   *     selections: ["MedicationRequest/abc"],
   *     draftOrders: {
   *       resourceType: "Bundle",
   *       entry: [{ resource: { resourceType: "MedicationRequest", medicationCodeableConcept: { text: "Amoxicillin" } } }]
   *     }
   *   },
   *   prefetch: { ... }
   * }
   */
  private async handleMedicationAdvisor(payload: any) {
    const cards: any[] = [];

    // Extract patient ID from context
    const patientId = payload.context?.patientId
      ? parseInt(payload.context.patientId)
      : (payload.context?.patient ? parseInt(payload.context.patient) : null);

    if (!patientId || isNaN(patientId)) {
      return { cards: [] }; // No patient context — can't evaluate
    }

    // Query the patient's actual allergies from database
    const allergies = await this.prisma.patientAllergy.findMany({
      where: { patientId },
    });

    if (allergies.length === 0) {
      return { cards: [] }; // No allergies recorded — no interactions possible
    }

    // Extract the medications being ordered from the CDS context
    const medications = this.extractMedicationsFromContext(payload);

    if (medications.length === 0) {
      return { cards: [] }; // No medications to evaluate
    }

    // Check each medication against each allergy
    for (const medication of medications) {
      const medNameLower = medication.toLowerCase();

      for (const allergy of allergies) {
        const allergenLower = (allergy.allergen || '').toLowerCase();
        
        // Check the drug-allergy interaction map
        const interactions = this.findInteractions(medNameLower, allergenLower);

        if (interactions) {
          cards.push({
            uuid: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            summary: `⚠️ Drug-Allergy Interaction: ${medication} ↔ ${allergy.allergen}`,
            detail: `Patient has a recorded allergy to **${allergy.allergen}** ` +
              `(severity: ${allergy.severity || 'unknown'})` +
              `${allergy.reaction ? `, reaction: ${allergy.reaction}` : ''}. ` +
              `The prescribed medication **${medication}** has a known interaction ` +
              `with this allergen class. Please review and consider alternatives.`,
            indicator: allergy.severity === 'SEVERE' ? 'critical' : 'warning',
            source: {
              label: 'Saraya CDS Rules Engine',
              url: 'https://saraya-erp.com/cds/drug-interactions',
            },
            suggestions: [
              {
                label: 'Remove this medication',
                uuid: `remove-${Date.now()}`,
                actions: [{
                  type: 'delete',
                  description: `Remove ${medication} from the prescription due to allergy interaction`,
                }],
              },
            ],
            links: [
              {
                label: 'View patient allergy record',
                url: `https://saraya-erp.com/patients/${patientId}/chart`,
                type: 'absolute',
              },
            ],
          });
        }
      }
    }

    this.logger.log(
      `🧠 CDS medication-advisor: Patient/${patientId} | ` +
      `${medications.length} medication(s) checked | ` +
      `${allergies.length} allergy(ies) | ` +
      `${cards.length} interaction(s) found`
    );

    return { cards };
  }

  /**
   * Patient Alerts CDS Hook — Shows active safety alerts
   */
  private async handlePatientAlerts(payload: any) {
    const cards: any[] = [];
    
    const patientId = payload.context?.patientId
      ? parseInt(payload.context.patientId)
      : null;

    if (!patientId || isNaN(patientId)) {
      return { cards: [] };
    }

    // Check for severe allergies
    const severeAllergies = await this.prisma.patientAllergy.findMany({
      where: { patientId, severity: 'SEVERE' },
    });

    if (severeAllergies.length > 0) {
      cards.push({
        uuid: `safety-allergy-${Date.now()}`,
        summary: `🚨 ${severeAllergies.length} SEVERE allergy/allergies on record`,
        detail: `This patient has severe allergies to: **${severeAllergies.map(a => a.allergen).join(', ')}**. ` +
          `Exercise extreme caution when prescribing or administering medications.`,
        indicator: 'critical',
        source: { label: 'Saraya Patient Safety System' },
      });
    }

    return { cards };
  }

  /**
   * Extracts medication names from the CDS Hooks payload.
   * Supports multiple formats used by different EHR systems.
   */
  private extractMedicationsFromContext(payload: any): string[] {
    const medications: string[] = [];

    // Format 1: draftOrders Bundle (standard CDS Hooks)
    if (payload.context?.draftOrders?.entry) {
      for (const entry of payload.context.draftOrders.entry) {
        const resource = entry.resource;
        if (resource?.resourceType === 'MedicationRequest') {
          const medName = resource.medicationCodeableConcept?.text
            || resource.medicationCodeableConcept?.coding?.[0]?.display
            || resource.medicationReference?.display;
          if (medName) medications.push(medName);
        }
      }
    }

    // Format 2: Simple medications array (custom format)
    if (payload.context?.medications && Array.isArray(payload.context.medications)) {
      for (const med of payload.context.medications) {
        if (typeof med === 'string') medications.push(med);
        else if (med.name) medications.push(med.name);
        else if (med.text) medications.push(med.text);
      }
    }

    // Format 3: Prefetch data (if medications were prefetched)
    if (payload.prefetch?.medications?.entry) {
      for (const entry of payload.prefetch.medications.entry) {
        const name = entry.resource?.medicationCodeableConcept?.text;
        if (name) medications.push(name);
      }
    }

    return medications;
  }

  /**
   * Checks if a medication has a known interaction with an allergen.
   * Uses the drug-allergy interaction knowledge base.
   */
  private findInteractions(medicationName: string, allergen: string): boolean {
    // Direct match check
    for (const [drug, allergyClasses] of Object.entries(DRUG_ALLERGY_INTERACTIONS)) {
      // Check if the medication name contains or matches the drug key
      if (medicationName.includes(drug) || drug.includes(medicationName)) {
        // Check if the patient's allergen is in the interaction class
        if (allergyClasses.some(a => allergen.includes(a) || a.includes(allergen))) {
          return true;
        }
      }
    }

    // Fuzzy match: if the medication name directly matches the allergen
    if (medicationName.includes(allergen) || allergen.includes(medicationName)) {
      return true;
    }

    return false;
  }
}
