
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FhirService {
  constructor(private prisma: PrismaService) {}

  async getPatient(id: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return this.mapToFhirPatient(patient);
  }

  private mapToFhirPatient(patient: any) {
    // Basic Parsing of Name (First Last)
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
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MR',
              },
            ],
          },
          system: 'http://saraya-erp.com/mrn',
          value: patient.mrn,
        },
        ...(patient.nationalId
          ? [
              {
                system: 'http://saraya-erp.com/national-id',
                value: patient.nationalId,
              },
            ]
          : []),
      ],
      name: [
        {
          use: 'official',
          family: family,
          given: given,
          text: patient.fullName,
        },
      ],
      telecom: [
        {
          system: 'phone',
          value: patient.phone,
          use: 'mobile',
        },
        {
          system: 'email',
          value: patient.email,
        },
      ],
      gender: this.mapGender(patient.gender),
      birthDate: patient.dateOfBirth
        ? patient.dateOfBirth.toISOString().split('T')[0]
        : null,
      address: [
        {
          text: patient.address,
        },
      ],
    };
  }

  private mapGender(gender: string): string {
    // FHIR values: male | female | other | unknown
    if (!gender) return 'unknown';
    const g = gender.toLowerCase();
    if (g === 'male' || g === 'm') return 'male';
    if (g === 'female' || g === 'f') return 'female';
    return 'other';
  }
}
