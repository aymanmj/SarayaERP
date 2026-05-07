// src/patients/patients.service.ts

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, GlobalPatient } from '@prisma/client';
import { SoftDeleteService } from '../common/soft-delete.service';
import { createHash } from 'crypto';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private softDeleteService: SoftDeleteService,
  ) {}

  // توليد رقم ملف تلقائي مع التحقق من التكرار (متوافق مع Multi-Tenant)
  private async generateNextMrn(hospitalId: number): Promise<string> {
    // 1. Get the last created patient in THIS hospital to guess the next number
    const last = await this.prisma.patient.findFirst({
      where: { hospitalId },
      orderBy: { id: 'desc' },
      select: { mrn: true },
    });

    let nextNumber = 1;
    if (last?.mrn) {
      const match = last.mrn.match(/(\d+)$/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }

    // 2. Loop to find a truly available MRN (Collision Check)
    let mrn = '';
    let isUnique = false;
    let attempts = 0;

    // Multi-tenant prefix: e.g., H1-MRN-0001
    const prefix = `H${hospitalId}-MRN-`;

    while (!isUnique && attempts < 10) {
      mrn = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
      const existing = await this.prisma.patient.findFirst({
        where: { mrn },
      });

      if (!existing) {
        isUnique = true;
      } else {
        // If taken, increment and try again
        nextNumber++;
        attempts++;
      }
    }

    if (!isUnique) {
      // Fallback: Use timestamp to guarantee uniqueness if loop fails
      return `${prefix}${Date.now().toString().slice(-6)}`;
    }

    return mrn;
  }

  async create(
    hospitalId: number,
    data: Omit<
      Prisma.PatientCreateInput,
      | 'mrn'
      | 'hospital'
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'isDeleted'
      | 'deletedAt'
      | 'deletedById'
      | 'globalPatient'
    > & { hasDataSharingConsent?: boolean },
  ) {
    // Remove hospitalId from data if it was accidentally passed in the DTO
    const { hospitalId: _, ...cleanData } = data as any;

    let globalPatientId: number | undefined = undefined;

    // ✅ PRE-COMPUTE search hashes from raw values.
    // The Prisma extension generates hashes at `patient.create()` time,
    // but we need them NOW to look up GlobalPatient BEFORE create().
    const nationalIdHash = this.generateSearchHash(cleanData.nationalId);
    const phoneHash = this.generateSearchHash(cleanData.phone);

    // 1. Federated Auto-Link Strategy (MPI)
    // Mandatory National Registry integration - always lookup and create/link GlobalPatient
    let globalPatient: GlobalPatient | null = null;
    if (nationalIdHash) {
      globalPatient = await this.prisma.globalPatient.findUnique({
        where: { nationalIdHash }
      });
    }
    if (!globalPatient && phoneHash) {
       globalPatient = await this.prisma.globalPatient.findUnique({
         where: { phoneHash }
       });
    }

    if (globalPatient) {
      // We found a global patient!
      globalPatientId = globalPatient.id;

      // Check if this patient already has a file in THIS hospital
      const existingLocalFile = await this.prisma.patient.findFirst({
        where: { hospitalId, globalPatientId }
      });

      if (existingLocalFile) {
        throw new ConflictException('Patient is already registered at this hospital.');
      }

      // Merge existing GlobalPatient data into cleanData to "auto-complete" missing fields
      cleanData.fullName = cleanData.fullName || globalPatient.fullName;
      cleanData.nationalId = cleanData.nationalId || globalPatient.nationalId;
      cleanData.dateOfBirth = cleanData.dateOfBirth || globalPatient.dateOfBirth;
      cleanData.gender = cleanData.gender || globalPatient.gender;
      cleanData.identityType = cleanData.identityType || globalPatient.identityType;
      cleanData.identityNumber = cleanData.identityNumber || globalPatient.identityNumber;
      } else {
        // Create a NEW GlobalPatient — use pre-computed hashes
        const identityNumberHash = this.generateSearchHash(cleanData.identityNumber);
        const emailHash = this.generateSearchHash(cleanData.email);

        const newGlobalPatient = await this.prisma.globalPatient.create({
          data: {
            fullName: cleanData.fullName,
            nationalId: cleanData.nationalId,
            dateOfBirth: cleanData.dateOfBirth,
            gender: cleanData.gender,
            identityType: cleanData.identityType,
            identityNumber: cleanData.identityNumber,
            nationalIdHash,
            identityNumberHash,
            phoneHash,
            emailHash,
          }
        });
        globalPatientId = newGlobalPatient.id;
      }
    const mrn = await this.generateNextMrn(hospitalId);

    // Create the Local Patient File
    const newPatient = await this.prisma.patient.create({
      data: {
        ...cleanData,
        mrn,
        globalPatientId
      },
    });

    return newPatient;
  }

  private generateSearchHash(value: string | null | undefined): string | null {
    if (!value) return null;
    return createHash('sha256')
      .update(String(value).trim().toLowerCase()) // توحيد النص (lowercase) ضروري جداً
      .digest('hex');
  }

  async findAll(params: {
    hospitalId: number;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { hospitalId, page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    // 1. تنظيف وتجهيز مدخل البحث
    const cleanSearch = search?.trim();

    // 2. توليد الـ Hash للبحث (Blind Index)
    // نستخدم نفس الخوارزمية المستخدمة في Prisma Extension (SHA-256)
    const sHash = cleanSearch
      ? createHash('sha256').update(cleanSearch.toLowerCase()).digest('hex')
      : null;

    // 3. بناء شرط البحث المطور
    const where: Prisma.PatientWhereInput = {
      hospitalId,
      isDeleted: false,
      isActive: true,
    };

    if (cleanSearch) {
      where.OR = [
        // أ) الاسم: يبقى بحث نصي جزئي (لأنه غير مشفر لسهولة التعرف)
        { fullName: { contains: cleanSearch, mode: 'insensitive' } },

        // ب) الحقول المشفرة: نستخدم الـ Hash للمطابقة الدقيقة (Exact Match)
        // هذا يضمن أمان البيانات وسرعة الاستعلام (Index performance)
        { mrnHash: sHash },
        { phoneHash: sHash },
        { emailHash: sHash },
        { nationalIdHash: sHash },
        { identityNumberHash: sHash },

        // ج) الرقم الوطني: إذا قمت بإضافة nationalIdHash للسكيما، فقم بتفعيله هنا
        // { nationalIdHash: sHash },
      ];
    }

    // 4. جلب البيانات والعدد الإجمالي في وقت واحد (Transaction)
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          globalPatient: {
            select: { id: true, fullName: true },
          },
          insurancePolicy: {
            include: {
              provider: true,
              plan: true,
            },
          },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      items,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  // MPI Search: Check if patient exists in the National Network
  async searchGlobal(searchQuery: string) {
    const sHash = this.generateSearchHash(searchQuery);
    if (!sHash) return null;

    const globalMatch = await this.prisma.globalPatient.findFirst({
      where: {
        OR: [
          { nationalIdHash: sHash },
          { phoneHash: sHash },
          { emailHash: sHash },
          { identityNumberHash: sHash },
        ],
      },
    });

    return globalMatch;
  }

  async findOne(hospitalId: number, id: number) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        hospitalId,
        isDeleted: false,
      },
      include: {
        insurancePolicy: {
          include: { provider: true, plan: true },
        },
        allergies: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('المريض غير موجود');
    }

    return patient;
  }

  // ✅ [ENHANCED] تحديث المريض المحلي + تزامن البيانات الديموغرافية مع GlobalPatient
  // عند تحديث بيانات المريض في أي فرع، يتم تحديث السجل الوطني الموحد (MPI)
  // تلقائياً لتنعكس التعديلات عند زيارة فروع أخرى.
  async update(hospitalId: number, id: number, data: any) {
    // التأكد من وجود المريض
    const existingPatient = await this.findOne(hospitalId, id);

    // فصل حقل insurancePolicyId و hospitalId عن باقي البيانات
    const { insurancePolicyId, hospitalId: _, ...restData } = data;

    // تجهيز كائن التحديث (Prisma Input)
    const updateInput: Prisma.PatientUpdateInput = {
      ...restData,
    };

    // معالجة منطق ربط/فك ربط التأمين
    if (insurancePolicyId !== undefined) {
      if (insurancePolicyId) {
        // ربط ببوليصة جديدة
        updateInput.insurancePolicy = { connect: { id: insurancePolicyId } };
      } else {
        // إلغاء الربط (تحويله لنقدي)
        updateInput.insurancePolicy = { disconnect: true };
      }
    }

    const updatedPatient = await this.prisma.patient.update({
      where: { id },
      data: updateInput,
    });

    // ═══════════════════════════════════════════════════════
    // MPI SYNC: Propagate demographic changes to GlobalPatient
    // This ensures that when Hospital (A) updates the patient's
    // phone number, Hospital (B) sees the updated data.
    // ═══════════════════════════════════════════════════════
    const globalPatientId = (existingPatient as any).globalPatientId;
    if (globalPatientId) {
      const SYNCED_FIELDS = [
        'fullName', 'nationalId', 'dateOfBirth', 'gender',
        'identityType', 'identityNumber',
      ] as const;

      const globalUpdate: Record<string, any> = {};

      for (const field of SYNCED_FIELDS) {
        if (restData[field] !== undefined) {
          globalUpdate[field] = restData[field];
        }
      }

      // Recompute search hashes if PII fields changed
      if (restData.nationalId) {
        globalUpdate.nationalIdHash = this.generateSearchHash(restData.nationalId);
      }
      if (restData.identityNumber) {
        globalUpdate.identityNumberHash = this.generateSearchHash(restData.identityNumber);
      }

      // phone/email hashes are computed by Prisma Extension on Patient
      // but GlobalPatient needs them too
      if (restData.phone) {
        globalUpdate.phoneHash = this.generateSearchHash(restData.phone);
      }
      if (restData.email) {
        globalUpdate.emailHash = this.generateSearchHash(restData.email);
      }

      if (Object.keys(globalUpdate).length > 0) {
        try {
          await this.prisma.globalPatient.update({
            where: { id: globalPatientId },
            data: globalUpdate,
          });
        } catch (err) {
          // Non-critical: log but don't fail the local update
          console.error(`[MPI SYNC] Failed to sync GlobalPatient #${globalPatientId}:`, err);
        }
      }
    }

    return updatedPatient;
  }

  async softDelete(hospitalId: number, id: number, userId: number) {
    return this.softDeleteService.softDelete(
      this.prisma.patient,
      {
        notFoundMessage: 'المريض غير موجود أو تم حذفه مسبقاً',
        where: { id, hospitalId, isDeleted: false },
        extraUpdateData: { isActive: false },
      },
      userId,
    );
  }

  // 1. إضافة حساسية
  async addAllergy(
    hospitalId: number,
    userId: number,
    data: {
      patientId: number;
      allergen: string;
      severity: string; // MILD, MODERATE, SEVERE
      reaction?: string;
    },
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: data.patientId, hospitalId },
    });

    if (!patient) {
      throw new NotFoundException('المريض غير موجود.');
    }

    return this.prisma.patientAllergy.create({
      data: {
        patientId: data.patientId,
        allergen: data.allergen,
        severity: data.severity,
        reaction: data.reaction,
        // createdById: userId, // لو أضفت هذا الحقل في السكيما
      },
    });
  }

  // 2. جلب الحساسيات
  async getAllergies(hospitalId: number, patientId: number) {
    // التأكد من أن المريض يتبع المستشفى
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId },
    });
    if (!patient) throw new NotFoundException('المريض غير موجود');

    return this.prisma.patientAllergy.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3. حذف حساسية
  async removeAllergy(hospitalId: number, id: number) {
    const allergy = await this.prisma.patientAllergy.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (!allergy || allergy.patient.hospitalId !== hospitalId) {
      throw new NotFoundException(
        'سجل الحساسية غير موجود أو لا تملك صلاحية حذفه.',
      );
    }

    return this.prisma.patientAllergy.delete({ where: { id } });
  }

  // FHIR Export Generation
  async generateFhirExport(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId, isDeleted: false },
      include: {
        allergies: true,
        insurancePolicy: { include: { provider: true, plan: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException('المريض غير موجود.');
    }

    // A simplified FHIR Bundle representation of the patient
    const fhirBundle = {
      resourceType: 'Bundle',
      id: `bundle-${patient.mrn}`,
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: [
        {
          fullUrl: `urn:uuid:${patient.id}`,
          resource: {
            resourceType: 'Patient',
            id: patient.id.toString(),
            identifier: [
              {
                use: 'official',
                system: 'http://saraya-erp.com/mrn',
                value: patient.mrn,
              },
              patient.nationalId ? {
                use: 'usual',
                system: 'http://saraya-erp.com/national-id',
                value: patient.nationalId,
              } : undefined,
            ].filter(Boolean),
            name: [
              {
                use: 'official',
                text: patient.fullName,
              },
            ],
            telecom: patient.phone ? [
              {
                system: 'phone',
                value: patient.phone,
                use: 'mobile',
              },
            ] : undefined,
            gender: patient.gender === 'MALE' ? 'male' : patient.gender === 'FEMALE' ? 'female' : 'unknown',
            birthDate: patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
            address: patient.address ? [
              {
                text: patient.address,
              },
            ] : undefined,
            active: patient.isActive,
          },
        },
        // Include allergies in FHIR format
        ...patient.allergies.map(allergy => ({
          fullUrl: `urn:uuid:allergy-${allergy.id}`,
          resource: {
            resourceType: 'AllergyIntolerance',
            id: allergy.id.toString(),
            clinicalStatus: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
                  code: 'active',
                },
              ],
            },
            patient: {
              reference: `Patient/${patient.id}`,
            },
            code: {
              text: allergy.allergen,
            },
            criticality: allergy.severity === 'SEVERE' ? 'high' : allergy.severity === 'MODERATE' ? 'low' : 'unable-to-assess',
            note: allergy.reaction ? [{ text: allergy.reaction }] : undefined,
          },
        })),
      ],
    };

    return fhirBundle;
  }
}
