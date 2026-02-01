// src/triage/triage.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TriageLevel } from '@prisma/client';

@Injectable()
export class TriageService {
  constructor(private prisma: PrismaService) {}

  // جلب قائمة انتظار الطوارئ (المرضى الذين لم يتم فرزهم أو بانتظار الطبيب)
  async getWaitingList(hospitalId: number) {
    return this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: 'ER', // طوارئ فقط
        status: 'OPEN',
        // يمكن إضافة شرط: لم يراه الطبيب بعد (لا توجد زيارات Visits)
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            mrn: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        _count: { select: { triageAssessments: true } },
      },
      orderBy: [
        // الأولوية للأخطر (TriageLevel)، ثم للأقدم (createdAt)
        // ملاحظة: ترتيب Enum في Prisma يعتمد على ترتيب تعريفه إذا لم نستخدم أرقام،
        // هنا سنرتب حسب الوقت مبدئياً، والفرونت يفرز حسب الألوان.
        { createdAt: 'asc' },
      ],
    });
  }

  // إجراء تقييم فرز
  async createAssessment(data: {
    hospitalId: number;
    encounterId: number;
    userId: number;
    level: TriageLevel;
    chiefComplaint: string;
    vitals: {
      temperature?: number;
      heartRate?: number;
      respRate?: number;
      bpSystolic?: number;
      bpDiastolic?: number;
      o2Sat?: number;
      painScore?: number;
    };
    notes?: string;
  }) {
    const {
      hospitalId,
      encounterId,
      userId,
      level,
      chiefComplaint,
      vitals,
      notes,
    } = data;

    return this.prisma.$transaction(async (tx) => {
      // 1. إنشاء سجل التقييم
      const assessment = await tx.triageAssessment.create({
        data: {
          hospitalId,
          encounterId,
          assessedById: userId,
          level,
          chiefComplaint,
          temperature: vitals.temperature,
          heartRate: vitals.heartRate,
          respRate: vitals.respRate,
          bpSystolic: vitals.bpSystolic,
          bpDiastolic: vitals.bpDiastolic,
          o2Sat: vitals.o2Sat,
          painScore: vitals.painScore,
          notes,
        },
      });

      // 2. تحديث الحالة الرئيسية (Encounter) بآخر مستوى فرز
      await tx.encounter.update({
        where: { id: encounterId },
        data: {
          triageLevel: level,
          chiefComplaint: chiefComplaint, // تحديث الشكوى الرئيسية أيضاً
        },
      });

      // 3. (اختياري) إنشاء سجل علامات حيوية VitalSign ليبقى في ملف المريض أيضاً
      // هذا يضمن أن الطبيب يرى العلامات الحيوية في تبويب Vitals
      await tx.vitalSign.create({
        data: {
          encounterId,
          createdById: userId,
          temperature: vitals.temperature,
          pulse: vitals.heartRate,
          respRate: vitals.respRate,
          bpSystolic: vitals.bpSystolic,
          bpDiastolic: vitals.bpDiastolic,
          o2Sat: vitals.o2Sat,
          note: `Triage Assessment (${level})`,
        },
      });

      return assessment;
    });
  }
  // اقتراح مستوى الفرز بناءً على العلامات الحيوية (Smart Logic)
  suggestTriageLevel(vitals: {
    heartRate?: number;
    respRate?: number;
    o2Sat?: number;
    painScore?: number;
    consciousness?: string; // Alert, Voice, Pain, Unresponsive (AVPU)
  }): TriageLevel {
    // 1. Level 1: Resuscitation (أحمر) - خطر فوري على الحياة
    if (
      (vitals.o2Sat && vitals.o2Sat < 90) ||
      (vitals.heartRate && vitals.heartRate > 140) ||
      (vitals.respRate && vitals.respRate > 30) ||
      vitals.consciousness === 'Unresponsive'
    ) {
      return 'RESUSCITATION';
    }

    // 2. Level 2: Emergent (برتقالي) - حالة طارئة جداً
    if (
      (vitals.o2Sat && vitals.o2Sat < 95) ||
      (vitals.heartRate && vitals.heartRate > 120) ||
      (vitals.painScore && vitals.painScore >= 7) ||
      vitals.consciousness === 'Pain'
    ) {
      return 'EMERGENT';
    }

    // 3. Level 3: Urgent (أصفر) - مستقرة حالياً لكن تحتاج رعاية
    if (
      (vitals.heartRate && vitals.heartRate > 100) ||
      (vitals.painScore && vitals.painScore >= 4)
    ) {
      return 'URGENT';
    }

    // 4. Level 4: Less Urgent (أخضر)
    return 'LESS_URGENT';
  }
}
