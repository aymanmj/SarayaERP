// src/diagnosis/diagnosis.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiagnosisType } from '@prisma/client';

@Injectable()
export class DiagnosisService {
  constructor(private prisma: PrismaService) {}

  // 🔍 البحث المحسن
  async searchCodes(query: string) {
    if (!query || query.length < 1) return []; // السماح بحرف واحد للسرعة

    // تحسين: البحث يبدأ بالكود أولاً (أولوية)، ثم الاسم
    // في بيئة إنتاجية نستخدم Full Text Search، هنا سنحاكي الترتيب
    const results = await this.prisma.diagnosisCode.findMany({
      where: {
        isActive: true,
        OR: [
          { code: { startsWith: query, mode: 'insensitive' } }, // الأولوية 1
          { nameEn: { contains: query, mode: 'insensitive' } },
          { nameAr: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });

    // ترتيب يدوي بسيط: الكود المطابق تماماً في البداية
    return results.sort((a, b) => {
      const aCodeMatch = a.code.toLowerCase() === query.toLowerCase();
      const bCodeMatch = b.code.toLowerCase() === query.toLowerCase();
      if (aCodeMatch && !bCodeMatch) return -1;
      if (!aCodeMatch && bCodeMatch) return 1;
      return 0;
    });
  }

  // ➕ إضافة تشخيص لحالة (Encounter)
  async addDiagnosisToEncounter(params: {
    encounterId: number;
    codeId: number;
    type: DiagnosisType;
    note?: string;
    userId: number;
  }) {
    const { encounterId, codeId, type, note, userId } = params;
    return this.prisma.encounterDiagnosis.create({
      data: {
        encounterId,
        diagnosisCodeId: codeId,
        type,
        note,
        createdById: userId,
      },
      include: {
        diagnosisCode: true,
      },
    });
  }

  // 📋 جلب تشخيصات حالة معينة
  async getEncounterDiagnoses(encounterId: number) {
    return this.prisma.encounterDiagnosis.findMany({
      where: { encounterId },
      include: {
        diagnosisCode: true,
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ❌ حذف تشخيص
  async removeEncounterDiagnosis(id: number) {
    return this.prisma.encounterDiagnosis.delete({
      where: { id },
    });
  }
}

// import { Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import { DiagnosisType } from '@prisma/client';

// @Injectable()
// export class DiagnosisService {
//   constructor(private prisma: PrismaService) {}

//   // 🔍 البحث عن كود مرض (Autocomplete)
//   async searchCodes(query: string) {
//     if (!query || query.length < 2) return [];

//     return this.prisma.diagnosisCode.findMany({
//       where: {
//         isActive: true,
//         OR: [
//           { code: { contains: query, mode: 'insensitive' } },
//           { nameEn: { contains: query, mode: 'insensitive' } },
//           { nameAr: { contains: query, mode: 'insensitive' } },
//         ],
//       },
//       take: 20, // نكتفي بأول 20 نتيجة
//       orderBy: { code: 'asc' },
//     });
//   }

//   // ➕ إضافة تشخيص لحالة (Encounter)
//   async addDiagnosisToEncounter(params: {
//     encounterId: number;
//     codeId: number;
//     type: DiagnosisType;
//     note?: string;
//     userId: number;
//   }) {
//     const { encounterId, codeId, type, note, userId } = params;

//     const encounter = await this.prisma.encounter.findUnique({
//       where: { id: encounterId },
//     });
//     if (!encounter) throw new NotFoundException('الحالة غير موجودة');

//     return this.prisma.encounterDiagnosis.create({
//       data: {
//         encounterId,
//         diagnosisCodeId: codeId,
//         type,
//         note,
//         createdById: userId,
//       },
//       include: {
//         diagnosisCode: true,
//       },
//     });
//   }

//   // 📋 جلب تشخيصات حالة معينة
//   async getEncounterDiagnoses(encounterId: number) {
//     return this.prisma.encounterDiagnosis.findMany({
//       where: { encounterId },
//       include: {
//         diagnosisCode: true,
//         createdBy: { select: { id: true, fullName: true } },
//       },
//       orderBy: { createdAt: 'desc' },
//     });
//   }

//   // ❌ حذف تشخيص
//   async removeEncounterDiagnosis(id: number) {
//     return this.prisma.encounterDiagnosis.delete({
//       where: { id },
//     });
//   }
// }
