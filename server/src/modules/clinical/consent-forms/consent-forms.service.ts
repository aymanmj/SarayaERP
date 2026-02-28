import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConsentFormType, ConsentStatus } from '@prisma/client';

@Injectable()
export class ConsentFormsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    hospitalId: number;
    patientId: number;
    encounterId?: number;
    doctorId?: number;
    formType: ConsentFormType;
    title: string;
    content: string;
  }) {
    return this.prisma.consentForm.create({
      data: {
        hospitalId: data.hospitalId,
        patientId: data.patientId,
        encounterId: data.encounterId,
        doctorId: data.doctorId,
        formType: data.formType,
        title: data.title,
        content: data.content,
        status: ConsentStatus.DRAFT,
      },
      include: {
        doctor: {
          select: { id: true, fullName: true, specialty: true }
        }
      }
    });
  }

  async findByPatient(patientId: number, hospitalId: number) {
    return this.prisma.consentForm.findMany({
      where: { 
        patientId,
        hospitalId,
        isDeleted: false
      },
      include: {
        doctor: {
          select: { id: true, fullName: true, specialty: true }
        },
        encounter: {
          select: { id: true, type: true, status: true, admissionDate: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: number) {
    const form = await this.prisma.consentForm.findUnique({
      where: { id },
      include: {
        doctor: {
          select: { id: true, fullName: true, specialty: true }
        },
        patient: {
          select: { id: true, mrn: true, fullName: true, dateOfBirth: true, gender: true }
        }
      }
    });

    if (!form || form.isDeleted) {
      throw new NotFoundException(`Consent form with ID ${id} not found`);
    }

    return form;
  }

  async sign(id: number, signDto: { signature: string; signedByRef: string }) {
    await this.findOne(id);

    return this.prisma.consentForm.update({
      where: { id },
      data: {
        signature: signDto.signature,
        signedByRef: signDto.signedByRef,
        status: ConsentStatus.SIGNED,
        signedAt: new Date(),
      }
    });
  }

  async revoke(id: number) {
    await this.findOne(id);

    return this.prisma.consentForm.update({
      where: { id },
      data: {
        status: ConsentStatus.REVOKED
      }
    });
  }
}
