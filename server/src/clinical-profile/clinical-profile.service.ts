// src/clinical-profile/clinical-profile.service.ts
// =====================================================================
// خدمة السجل الطبي الشامل — Patient Clinical Profile Service
// القلب النابض لتحويل النظام من HIS إلى EMR
// =====================================================================

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import {
  CreateProblemDto,
  UpdateProblemDto,
  UpsertMedicalHistoryDto,
  CreatePMHEntryDto,
  CreateSurgicalEntryDto,
  CreateFamilyHistoryDto,
  CreateHomeMedicationDto,
  UpdateHomeMedicationDto,
} from './dto/clinical-profile.dto';

@Injectable()
export class ClinicalProfileService {
  private readonly logger = new Logger(ClinicalProfileService.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {}

  // ======================== Problem List ========================

  async getProblems(patientId: number, hospitalId: number) {
    return this.prisma.patientProblem.findMany({
      where: { patientId, hospitalId },
      include: {
        diagnosisCode: {
          select: { id: true, code: true, nameEn: true, nameAr: true, icd10Code: true },
        },
        createdBy: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: [
        { type: 'asc' }, // ACTIVE أولاً
        { createdAt: 'desc' },
      ],
    });
  }

  async createProblem(
    patientId: number,
    hospitalId: number,
    userId: number,
    dto: CreateProblemDto,
  ) {
    const problem = await this.prisma.patientProblem.create({
      data: {
        patientId,
        hospitalId,
        createdById: userId,
        description: dto.description,
        diagnosisCodeId: dto.diagnosisCodeId,
        type: dto.type as any ?? 'ACTIVE',
        severity: dto.severity as any,
        onsetDate: dto.onsetDate ? new Date(dto.onsetDate) : undefined,
        resolvedDate: dto.resolvedDate ? new Date(dto.resolvedDate) : undefined,
        notes: dto.notes,
        isChronic: dto.isChronic ?? false,
      },
      include: {
        diagnosisCode: {
          select: { id: true, code: true, nameEn: true, nameAr: true, icd10Code: true },
        },
        createdBy: {
          select: { id: true, fullName: true },
        },
      },
    });

    this.logger.log(`Problem created for patient ${patientId}: ${dto.description}`);
    return problem;
  }

  async updateProblem(
    problemId: number,
    hospitalId: number,
    dto: UpdateProblemDto,
  ) {
    const existing = await this.prisma.patientProblem.findFirst({
      where: { id: problemId, hospitalId },
    });
    if (!existing) throw new NotFoundException('المشكلة الصحية غير موجودة');

    return this.prisma.patientProblem.update({
      where: { id: problemId },
      data: {
        description: dto.description,
        type: dto.type as any,
        severity: dto.severity as any,
        resolvedDate: dto.resolvedDate ? new Date(dto.resolvedDate) : undefined,
        notes: dto.notes,
        isChronic: dto.isChronic,
      },
      include: {
        diagnosisCode: {
          select: { id: true, code: true, nameEn: true, nameAr: true, icd10Code: true },
        },
        createdBy: {
          select: { id: true, fullName: true },
        },
      },
    });
  }

  async deleteProblem(problemId: number, hospitalId: number) {
    const existing = await this.prisma.patientProblem.findFirst({
      where: { id: problemId, hospitalId },
    });
    if (!existing) throw new NotFoundException('المشكلة الصحية غير موجودة');

    await this.prisma.patientProblem.delete({ where: { id: problemId } });
    return { success: true };
  }

  // ======================== Medical History ========================

  async getMedicalHistory(patientId: number, hospitalId: number) {
    // الحصول على السجل الأساسي (التاريخ الاجتماعي + الوظيفي)
    const history = await this.prisma.patientMedicalHistory.findUnique({
      where: { patientId },
    });

    // الحصول على الجداول المرتبطة
    const [pmhEntries, surgicalEntries, familyEntries] = await Promise.all([
      this.prisma.patientPMHEntry.findMany({
        where: { patientId, hospitalId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patientSurgicalEntry.findMany({
        where: { patientId, hospitalId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patientFamilyHistoryEntry.findMany({
        where: { patientId, hospitalId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      socialHistory: history,
      pastMedical: pmhEntries,
      pastSurgical: surgicalEntries,
      familyHistory: familyEntries,
    };
  }

  async upsertMedicalHistory(
    patientId: number,
    hospitalId: number,
    dto: UpsertMedicalHistoryDto,
  ) {
    return this.prisma.patientMedicalHistory.upsert({
      where: { patientId },
      create: {
        patientId,
        hospitalId,
        smokingStatus: dto.smokingStatus as any,
        alcoholUse: dto.alcoholUse,
        occupation: dto.occupation,
        exerciseLevel: dto.exerciseLevel,
        dietNotes: dto.dietNotes,
        socialNotes: dto.socialNotes,
        mobilityStatus: dto.mobilityStatus,
        adlStatus: dto.adlStatus,
      },
      update: {
        smokingStatus: dto.smokingStatus as any,
        alcoholUse: dto.alcoholUse,
        occupation: dto.occupation,
        exerciseLevel: dto.exerciseLevel,
        dietNotes: dto.dietNotes,
        socialNotes: dto.socialNotes,
        mobilityStatus: dto.mobilityStatus,
        adlStatus: dto.adlStatus,
      },
    });
  }

  // ======================== PMH Entries ========================

  async createPMHEntry(patientId: number, hospitalId: number, dto: CreatePMHEntryDto) {
    return this.prisma.patientPMHEntry.create({
      data: {
        patientId,
        hospitalId,
        condition: dto.condition,
        diagnosisYear: dto.diagnosisYear,
        isActive: dto.isActive ?? true,
        notes: dto.notes,
      },
    });
  }

  async deletePMHEntry(entryId: number, hospitalId: number) {
    const existing = await this.prisma.patientPMHEntry.findFirst({
      where: { id: entryId, hospitalId },
    });
    if (!existing) throw new NotFoundException('السجل غير موجود');
    await this.prisma.patientPMHEntry.delete({ where: { id: entryId } });
    return { success: true };
  }

  // ======================== Surgical Entries ========================

  async createSurgicalEntry(patientId: number, hospitalId: number, dto: CreateSurgicalEntryDto) {
    return this.prisma.patientSurgicalEntry.create({
      data: {
        patientId,
        hospitalId,
        procedure: dto.procedure,
        surgeryYear: dto.surgeryYear,
        hospitalName: dto.hospitalName,
        notes: dto.notes,
      },
    });
  }

  async deleteSurgicalEntry(entryId: number, hospitalId: number) {
    const existing = await this.prisma.patientSurgicalEntry.findFirst({
      where: { id: entryId, hospitalId },
    });
    if (!existing) throw new NotFoundException('السجل غير موجود');
    await this.prisma.patientSurgicalEntry.delete({ where: { id: entryId } });
    return { success: true };
  }

  // ======================== Family History ========================

  async createFamilyHistoryEntry(
    patientId: number,
    hospitalId: number,
    dto: CreateFamilyHistoryDto,
  ) {
    return this.prisma.patientFamilyHistoryEntry.create({
      data: {
        patientId,
        hospitalId,
        relation: dto.relation as any,
        condition: dto.condition,
        ageOfOnset: dto.ageOfOnset,
        isDeceased: dto.isDeceased ?? false,
        causeOfDeath: dto.causeOfDeath,
        notes: dto.notes,
      },
    });
  }

  async deleteFamilyHistoryEntry(entryId: number, hospitalId: number) {
    const existing = await this.prisma.patientFamilyHistoryEntry.findFirst({
      where: { id: entryId, hospitalId },
    });
    if (!existing) throw new NotFoundException('السجل غير موجود');
    await this.prisma.patientFamilyHistoryEntry.delete({ where: { id: entryId } });
    return { success: true };
  }

  // ======================== Home Medications ========================

  async getHomeMedications(patientId: number, hospitalId: number) {
    return this.prisma.homeMedication.findMany({
      where: { patientId, hospitalId },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        verifiedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async createHomeMedication(
    patientId: number,
    hospitalId: number,
    userId: number,
    dto: CreateHomeMedicationDto,
  ) {
    return this.prisma.homeMedication.create({
      data: {
        patientId,
        hospitalId,
        createdById: userId,
        medicationName: dto.medicationName,
        dose: dto.dose,
        frequency: dto.frequency,
        route: dto.route,
        prescribedBy: dto.prescribedBy,
        reason: dto.reason,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        isActive: dto.isActive ?? true,
        source: dto.source as any ?? 'PATIENT_REPORTED',
        notes: dto.notes,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        verifiedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateHomeMedication(
    medicationId: number,
    hospitalId: number,
    dto: UpdateHomeMedicationDto,
  ) {
    const existing = await this.prisma.homeMedication.findFirst({
      where: { id: medicationId, hospitalId },
    });
    if (!existing) throw new NotFoundException('الدواء غير موجود');

    return this.prisma.homeMedication.update({
      where: { id: medicationId },
      data: {
        medicationName: dto.medicationName,
        dose: dto.dose,
        frequency: dto.frequency,
        route: dto.route,
        isActive: dto.isActive,
        notes: dto.notes,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        verifiedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async verifyHomeMedication(medicationId: number, hospitalId: number, userId: number) {
    const existing = await this.prisma.homeMedication.findFirst({
      where: { id: medicationId, hospitalId },
    });
    if (!existing) throw new NotFoundException('الدواء غير موجود');

    return this.prisma.homeMedication.update({
      where: { id: medicationId },
      data: {
        verifiedById: userId,
        verifiedAt: new Date(),
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        verifiedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async deleteHomeMedication(medicationId: number, hospitalId: number) {
    const existing = await this.prisma.homeMedication.findFirst({
      where: { id: medicationId, hospitalId },
    });
    if (!existing) throw new NotFoundException('الدواء غير موجود');

    await this.prisma.homeMedication.delete({ where: { id: medicationId } });
    return { success: true };
  }

  // ======================== Clinical Summary ========================

  /**
   * ملخص سريري شامل للمريض — يجمع كل البيانات في استجابة واحدة
   * هذا هو الأساس لصفحة Patient Chart
   */
  async getClinicalSummary(patientId: number, hospitalId: number) {
    const [
      patient,
      problems,
      medicalHistory,
      homeMedications,
      allergies,
      activeEncounters,
      recentDiagnoses,
    ] = await Promise.all([
      // بيانات المريض الأساسية
      this.prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          mrn: true,
          fullName: true,
          dateOfBirth: true,
          gender: true,
          phone: true,
          email: true,
          address: true,
          maritalStatus: true,
          notes: true,
          createdAt: true,
        },
      }),

      // قائمة المشاكل الصحية
      this.getProblems(patientId, hospitalId),

      // التاريخ المرضي الشامل
      this.getMedicalHistory(patientId, hospitalId),

      // الأدوية المنزلية
      this.getHomeMedications(patientId, hospitalId),

      // الحساسيات
      this.prisma.patientAllergy.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
      }),

      // الحالات النشطة
      this.prisma.encounter.findMany({
        where: { patientId, hospitalId, status: 'OPEN' },
        select: {
          id: true,
          type: true,
          status: true,
          chiefComplaint: true,
          createdAt: true,
          doctor: { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // آخر 10 تشخيصات
      this.prisma.encounterDiagnosis.findMany({
        where: {
          encounter: { patientId, hospitalId },
        },
        include: {
          diagnosisCode: {
            select: { code: true, nameEn: true, nameAr: true, icd10Code: true },
          },
          encounter: {
            select: { id: true, type: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    if (!patient) throw new NotFoundException('المريض غير موجود');

    // فك تشفير الحقول الحساسة (احتياطي في حال لم تعالجها الـ extension)
    const decryptedPatient = {
      ...patient,
      phone: this.encryptionService.decrypt(patient.phone) ?? patient.phone,
      email: this.encryptionService.decrypt(patient.email) ?? patient.email,
      address: this.encryptionService.decrypt(patient.address) ?? patient.address,
    };

    // إحصائيات سريعة
    const totalEncounters = await this.prisma.encounter.count({
      where: { patientId, hospitalId },
    });

    const totalAdmissions = await this.prisma.admission.count({
      where: { patientId, hospitalId },
    });

    return {
      patient: decryptedPatient,
      problems,
      medicalHistory,
      homeMedications,
      allergies,
      activeEncounters,
      recentDiagnoses,
      stats: {
        totalEncounters,
        totalAdmissions,
        activeProblems: problems.filter((p) => p.type === 'ACTIVE' || p.type === 'CHRONIC').length,
        allergiesCount: allergies.length,
        unverifiedMedications: homeMedications.filter((m) => !m.verifiedById).length,
      },
    };
  }
}
