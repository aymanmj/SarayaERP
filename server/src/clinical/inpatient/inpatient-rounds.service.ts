
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
        admission: true, // [NEW] Added for mobile rounds
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
        vitalSigns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  // --- All Inpatients for Nursing ---

  async getAllInpatients(hospitalId: number, requestingUserId?: number) {
    let departmentIdFilter: number | undefined = undefined;

    // If a specific user is requesting, check their department
    if (requestingUserId) {
        const user = await this.prisma.user.findUnique({
            where: { id: requestingUserId },
            select: { departmentId: true, isDoctor: true }
        });

        // Only filter if user has a department and is NOT a doctor (Doctors see their own rotation)
        // Although doctors use a different endpoint, this is a safe fallback.
        // We focus on Nurses here.
        if (user && user.departmentId && !user.isDoctor) {
            departmentIdFilter = user.departmentId;
        }
    }

    return this.prisma.encounter.findMany({
      where: {
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        patient: { hospitalId },
        // ✅ [NEW] Filter by assigned department if applicable
        ...(departmentIdFilter ? { departmentId: departmentIdFilter } : {}),
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
        vitalSigns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
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

  // --- Utility / Data Fixes ---
  
  async fixDepartmentIds() {
      // Find all OPEN IPD encounters with missing departmentId
      const encounters = await this.prisma.encounter.findMany({
          where: {
              type: EncounterType.IPD,
              status: EncounterStatus.OPEN,
              departmentId: null,
              doctorId: { not: null }
          },
          include: {
              doctor: { select: { id: true, departmentId: true } }
          }
      });

      const results: string[] = [];
      for (const enc of encounters) {
          if (enc.doctor && enc.doctor.departmentId) {
              await this.prisma.encounter.update({
                  where: { id: enc.id },
                  data: { departmentId: enc.doctor.departmentId }
              });
              results.push(`Fixed Encounter #${enc.id}: Assigned Dept #${enc.doctor.departmentId}`);
          } else {
              results.push(`Skipped Encounter #${enc.id}: Doctor #${enc.doctorId} has no department.`);
          }
      }
      return { fixedCount: results.length, details: results };
  }
}
