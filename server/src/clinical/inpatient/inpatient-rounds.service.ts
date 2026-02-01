
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NoteType, EncounterType, EncounterStatus, CarePlanStatus, CarePlanType } from '@prisma/client';

@Injectable()
export class InpatientRoundsService {
  constructor(private prisma: PrismaService) {}

  // --- Doctor Rotation / Rounds ---

  async getMyPatients(doctorId: number) {
    // Return patients admitted under this doctor
    return this.prisma.encounter.findMany({
      where: {
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        doctorId: doctorId,
      },
      include: {
        patient: true,
        bedAssignments: {
          where: { to: null },
          include: {
            bed: {
              include: { ward: true },
            },
          },
        },
        clinicalNotes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          where: { type: NoteType.DOCTOR_ROUND },
        },
        carePlanItems: {
          where: { status: CarePlanStatus.ACTIVE },
          include: { executions: { orderBy: { executedAt: 'desc' }, take: 1 } },
        },
      },
    });
  }

  // --- All Inpatients for Nursing ---

  async getAllInpatients(hospitalId: number) {
    return this.prisma.encounter.findMany({
      where: {
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        patient: { hospitalId },
      },
      include: {
        patient: true,
        doctor: { select: { id: true, fullName: true } },
        bedAssignments: {
          where: { to: null },
          include: {
            bed: {
              include: { ward: true },
            },
          },
        },
        carePlanItems: {
          where: { status: CarePlanStatus.ACTIVE },
          include: {
            createdBy: true,
            executions: { orderBy: { executedAt: 'desc' }, take: 1, include: { executedBy: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async addRoundNote(
    encounterId: number,
    doctorId: number,
    content: string,
    type: NoteType = NoteType.DOCTOR_ROUND,
  ) {
    return this.prisma.clinicalNote.create({
      data: {
        encounterId,
        createdById: doctorId,
        content,
        type,
      },
    });
  }

  async getNotes(encounterId: number) {
    return this.prisma.clinicalNote.findMany({
      where: { encounterId },
      include: {
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Care Plan (Orders/Instructions) ---

  async addCarePlanItem(
    encounterId: number,
    doctorId: number,
    instruction: string,
    type: CarePlanType = CarePlanType.OTHER,
    frequency?: string,
  ) {
    return this.prisma.carePlanItem.create({
      data: {
        encounterId,
        createdById: doctorId,
        instruction,
        type,
        frequency,
      },
    });
  }

  async getCarePlan(encounterId: number) {
    return this.prisma.carePlanItem.findMany({
      where: { encounterId, status: CarePlanStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: true,
        executions: {
          orderBy: { executedAt: 'desc' },
          include: { executedBy: true },
        },
      },
    });
  }

  async completeCarePlanItem(itemId: number) {
    return this.prisma.carePlanItem.update({
      where: { id: itemId },
      data: { status: CarePlanStatus.COMPLETED },
    });
  }

  // --- Nursing Execution (New) ---

  async executeCarePlanItem(
    carePlanItemId: number,
    nurseId: number,
    resultValue?: string,
    note?: string,
  ) {
    return this.prisma.carePlanExecution.create({
      data: {
        carePlanItemId,
        executedById: nurseId,
        resultValue,
        note,
      },
    });
  }

  async getExecutionHistory(carePlanItemId: number) {
    return this.prisma.carePlanExecution.findMany({
      where: { carePlanItemId },
      orderBy: { executedAt: 'desc' },
      include: { executedBy: true },
    });
  }
}
