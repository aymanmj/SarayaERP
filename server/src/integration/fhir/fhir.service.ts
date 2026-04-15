
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FhirService {
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
        version: '1.0.0',
      },
      implementation: {
        description: 'Saraya HIS FHIR API',
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
                text: 'OAuth2 using SMART-on-FHIR profile',
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
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'patient', type: 'reference' }],
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
              searchParam: [{ name: 'patient', type: 'reference' }],
            },
            {
              type: 'AllergyIntolerance',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'patient', type: 'reference' }],
            },
            {
              type: 'MedicationRequest',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'patient', type: 'reference' }],
            },
            {
              type: 'Procedure',
              interaction: [{ code: 'read' }, { code: 'search-type' }],
              searchParam: [{ name: 'patient', type: 'reference' }],
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
      link: [{ relation: 'self', url }],
      entry: resources.map((resource) => ({
        fullUrl: `${url}/${resource.id}`,
        resource,
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

  async searchPatients(query: any, baseUrl: string) {
    const where: Prisma.PatientWhereInput = {};
    
    if (query.name) {
      where.fullName = { contains: query.name, mode: 'insensitive' };
    }
    if (query.identifier) {
      // Basic match for MRN or National ID
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
      active: patient.isActive,
      identifier: [
        {
          use: 'official',
          type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
          system: 'http://saraya-erp.com/mrn',
          value: patient.mrn,
        },
        ...(patient.nationalId ? [{ system: 'http://saraya-erp.com/national-id', value: patient.nationalId }] : []),
      ],
      name: [{ use: 'official', family, given, text: patient.fullName }],
      telecom: [
        ...(patient.phone ? [{ system: 'phone', value: patient.phone, use: 'mobile' }] : []),
        ...(patient.email ? [{ system: 'email', value: patient.email }] : []),
      ],
      gender: this.mapGender(patient.gender),
      birthDate: patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
      address: patient.address ? [{ text: patient.address }] : undefined,
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
    
    // Simplistic approach filtering for practitioners (doctors/nurses) would go here based on user roles
    
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
  // ENCOUNTER
  // ==========================================
  async getEncounter(id: number) {
    const encounter = await this.prisma.encounter.findUnique({ where: { id } });
    if (!encounter) throw new NotFoundException('Encounter not found');
    return this.mapToFhirEncounter(encounter);
  }

  async searchEncounters(query: any, baseUrl: string) {
    const where: Prisma.EncounterWhereInput = {};
    if (query.patient) {
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
  // OBSERVATION (Vitals/Labs)
  // ==========================================
  async getObservation(id: number) {
    const vital = await this.prisma.vitalSign.findUnique({ 
      where: { id },
      include: { encounter: true }
    });
    if (!vital) throw new NotFoundException('Observation not found');
    return this.mapToFhirObservation(vital);
  }

  async searchObservations(query: any, baseUrl: string) {
    const where: Prisma.VitalSignWhereInput = {};
    if (query.patient) {
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

  private mapToFhirObservation(vital: any) {
    // A vital sign measurement (e.g. Heart Rate, BP) is usually mapped out into distinct components or observations in FHIR.
    // For simplicity, we create a composite observation containing components.
    const components: any[] = [];
    
    if (vital.pulse) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
        valueQuantity: { value: vital.pulse, unit: 'beats/min', system: 'http://unitsofmeasure.org' }
      });
    }
    if (vital.respRate) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '9279-1', display: 'Respiratory rate' }] },
        valueQuantity: { value: vital.respRate, unit: 'breaths/min', system: 'http://unitsofmeasure.org' }
      });
    }
    if (vital.temperature) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }] },
        valueQuantity: { value: Number(vital.temperature), unit: 'Cel', system: 'http://unitsofmeasure.org' }
      });
    }
    if (vital.bpSystolic && vital.bpDiastolic) {
       components.push({
         code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }] },
         // In strict FHIR BP is a multi-component observation, but using simple representation here for scope.
         valueString: `${vital.bpSystolic}/${vital.bpDiastolic} mmHg`
       });
    }

    // fallback patient reference if not populated but required
    const patientRef = vital.encounter && vital.encounter.patientId ? `Patient/${vital.encounter.patientId}` : 'Patient/unknown';

    return {
      resourceType: 'Observation',
      id: vital.id.toString(),
      status: 'final',
      category: [
        {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: 'http://loinc.org', code: '8716-3', display: 'Vital signs' }]
      },
      subject: { reference: patientRef },
      encounter: vital.encounterId ? { reference: `Encounter/${vital.encounterId}` } : undefined,
      effectiveDateTime: vital.createdAt.toISOString(),
      component: components.length > 0 ? components : undefined
    };
  }

  // ==========================================
  // PHASE 2: BIDIRECTIONAL WRITE (POST)
  // ==========================================
  
  async createObservation(payload: any) {
    if (payload.resourceType !== 'Observation') {
      throw new BadRequestException('Invalid resourceType, expected Observation');
    }
    
    // Extract Patient ID from reference "Patient/123"
    const subjectRef = payload.subject?.reference;
    if (!subjectRef || !subjectRef.startsWith('Patient/')) {
      throw new BadRequestException('Observation requires a valid subject reference (Patient/id)');
    }
    const patientId = parseInt(subjectRef.split('/')[1]);

    // Try to find the active encounter for this patient
    const encounter = await this.prisma.encounter.findFirst({
      where: { patientId, status: { in: ['OPEN'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!encounter) {
      throw new BadRequestException('Patient must have an active Encounter to post vitals via FHIR currently');
    }

    // Map FHIR components back to our DB schema
    let pulse: number | undefined;
    let respRate: number | undefined;
    let temperature: number | undefined;
    let bpSystolic: number | undefined;
    let bpDiastolic: number | undefined;

    if (payload.component && Array.isArray(payload.component)) {
      for (const comp of payload.component) {
        const code = comp.code?.coding?.[0]?.code;
        if (code === '8867-4') pulse = comp.valueQuantity?.value;
        if (code === '9279-1') respRate = comp.valueQuantity?.value;
        if (code === '8310-5') temperature = comp.valueQuantity?.value;
      }
    }

    // Direct mapping if they passed flat values (Non-Standard FHIR, but common in simple posts)
    if (payload.valueQuantity?.system === 'beats/min') pulse = payload.valueQuantity.value;

    const vital = await this.prisma.vitalSign.create({
      data: {
        encounterId: encounter.id,
        pulse,
        respRate,
        temperature,
        note: 'Imported via FHIR API',
      }
    });

    return this.mapToFhirObservation({ ...vital, encounter });
  }

  // ==========================================
  // PHASE 2: USCDI RESOURCES
  // ==========================================

  // --- CONDITION (Problems/Diagnoses) ---
  async getCondition(id: number) {
    const problem = await this.prisma.patientProblem.findUnique({ where: { id } });
    if (!problem) throw new NotFoundException('Condition not found');
    return this.mapToFhirCondition(problem);
  }

  async searchConditions(query: any, baseUrl: string) {
    const where: Prisma.PatientProblemWhereInput = {};
    if (query.patient) {
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
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: clinicalStatus }]
      },
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }]
      },
      code: {
        coding: [{ system: 'http://snomed.info/sct', display: problem.description }],
        text: problem.description
      },
      subject: { reference: `Patient/${problem.patientId}` },
      onsetDateTime: problem.onsetDate ? problem.onsetDate.toISOString() : problem.createdAt.toISOString(),
      abatementDateTime: problem.resolvedDate ? problem.resolvedDate.toISOString() : undefined,
    };
  }

  // --- ALLERGY INTOLERANCE ---
  async getAllergy(id: number) {
    const allergy = await this.prisma.patientAllergy.findUnique({ where: { id } });
    if (!allergy) throw new NotFoundException('Allergy not found');
    return this.mapToFhirAllergy(allergy);
  }

  async searchAllergies(query: any, baseUrl: string) {
    const where: Prisma.PatientAllergyWhereInput = {};
    if (query.patient) {
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
    return {
      resourceType: 'AllergyIntolerance',
      id: allergy.id.toString(),
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
      verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }] },
      code: {
        coding: [{ display: allergy.allergen }],
        text: allergy.allergen
      },
      reaction: allergy.reaction ? [{
        manifestation: [{ text: allergy.reaction }],
        severity: allergy.severity.toLowerCase()
      }] : undefined,
      subject: { reference: `Patient/${allergy.patientId}` },
      recordedDate: allergy.createdAt.toISOString(),
    };
  }

  // --- MEDICATION REQUEST ---
  async getMedicationRequest(id: number) {
    const prescription = await this.prisma.prescription.findUnique({ 
      where: { id },
      include: { items: { include: { product: true } } } 
    });
    if (!prescription) throw new NotFoundException('MedicationRequest not found');
    return this.mapToFhirMedicationRequest(prescription);
  }

  async searchMedicationRequests(query: any, baseUrl: string) {
    const where: Prisma.PrescriptionWhereInput = {};
    if (query.patient) {
      const patientId = query.patient.startsWith('Patient/') ? query.patient.split('/')[1] : query.patient;
      where.patientId = Number(patientId);
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({ where, include: { items: { include: { product: true } } }, take: 50, orderBy: { createdAt: 'desc' } }),
      this.prisma.prescription.count({ where }),
    ]);
    const resources = items.map(p => this.mapToFhirMedicationRequest(p));
    return this.createBundle(resources, total, `${baseUrl}/MedicationRequest`);
  }

  private mapToFhirMedicationRequest(prescription: any) {
    return {
      resourceType: 'MedicationRequest',
      id: prescription.id.toString(),
      status: prescription.status === 'ACTIVE' ? 'active' : 'completed',
      intent: 'order',
      subject: { reference: `Patient/${prescription.patientId}` },
      encounter: { reference: `Encounter/${prescription.encounterId}` },
      requester: { reference: `Practitioner/${prescription.doctorId}` },
      authoredOn: prescription.createdAt.toISOString(),
      // Because one Prescription relates to many Items in our DB, we either map to a Bundle of MedicationRequests 
      // or composite them. HL7 FHIR prefers one MedicationRequest per medication item. 
      // For presentation/export, we map the first item or embed them in contained resources or text.
      medicationCodeableConcept: {
        text: prescription.items && prescription.items.length > 0 
          ? prescription.items.map((i: any) => i.product.name).join(', ')
          : 'Multiple Medications'
      },
      note: prescription.notes ? [{ text: prescription.notes }] : undefined,
    };
  }

  // --- PROCEDURE (SurgeryCase) ---
  async getProcedure(id: number) {
    const surgery = await this.prisma.surgeryCase.findUnique({ where: { id } });
    if (!surgery) throw new NotFoundException('Procedure not found');
    return this.mapToFhirProcedure(surgery);
  }

  async searchProcedures(query: any, baseUrl: string) {
    const where: Prisma.SurgeryCaseWhereInput = {};
    if (query.patient) {
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
    let status = 'unknown';
    if (surgery.status === 'COMPLETED') status = 'completed';
    if (surgery.status === 'SCHEDULED') status = 'preparation';
    if (surgery.status === 'IN_PROGRESS') status = 'in-progress';
    if (surgery.status === 'CANCELLED') status = 'stopped';

    const patientRef = surgery.encounter && surgery.encounter.patientId ? `Patient/${surgery.encounter.patientId}` : 'Patient/unknown';

    return {
      resourceType: 'Procedure',
      id: surgery.id.toString(),
      status: status,
      code: {
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
  // PHASE 4: CDS HOOKS & SUBSCRIPTIONS
  // ==========================================

  // In-memory subscription store for prototype
  private subscriptions: Map<string, any> = new Map();

  // --- SUBSCRIPTION ---
  async createSubscription(payload: any) {
    if (payload.resourceType !== 'Subscription') {
      throw new BadRequestException('Invalid resourceType, expected Subscription');
    }
    const id = `sub_${Date.now()}`;
    const subscription = {
      ...payload,
      id,
      status: 'active',
    };
    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async getSubscription(id: string) {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  // Example trigger to simulate a webhook firing when a clinical event happens
  simulateWebhookTrigger(resourceName: string, id: number) {
    console.log(`[FHIR Subscription Webhook] Change detected in ${resourceName}/${id}. Checking active subscriptions...`);
    // In a real Epic/Cerner architecture, here we iterate over subscriptions,
    // match criteria (e.g. Patient?gender=male), and send HTTP POST requests to the registered payload.channel.endpoint.
  }

  // --- CDS HOOKS ---
  getCdsServices() {
    return {
      services: [
        {
          hook: 'order-select',
          name: 'High-Risk Medication Advisor',
          description: 'Checks for interactions when prescribing medications to high-risk patients.',
          id: 'medication-advisor-1',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
            allergies: 'AllergyIntolerance?patient={{context.patientId}}'
          }
        }
      ]
    };
  }

  handleCdsHook(serviceId: string, payload: any) {
    if (serviceId !== 'medication-advisor-1') {
      throw new NotFoundException('CDS service not found');
    }
    // E.g., Epic sends contextual UI data. We return "Cards".
    return {
      cards: [
        {
          summary: 'Potential Drug Alert detected',
          detail: 'This medication may have moderate interactions with the patient\'s active allergies.',
          indicator: 'warning',
          source: {
            label: 'Saraya CDS Rules Engine'
          },
          links: [
            {
              label: 'View interaction details',
              url: 'https://saraya-erp.com/guidelines/drug-interactions'
            }
          ]
        }
      ]
    };
  }
}
