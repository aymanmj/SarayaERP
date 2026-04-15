
import { Injectable, NotFoundException } from '@nestjs/common';
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
}
