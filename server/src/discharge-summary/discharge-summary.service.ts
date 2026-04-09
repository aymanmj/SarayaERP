import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDischargeSummaryDto, UpdateDischargeSummaryDto } from './dto/discharge-summary.dto';

@Injectable()
export class DischargeSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * يجلب بيانات ملخص الخروج، وإذا لم يكن موجوداً، يقوم بإنشاء "مسودة" افتراضية
   * بناءً على بيانات الدخول والتشخيصات لتسهيل عمل الطبيب.
   */
  async getOrCreateDraft(admissionId: number, hospitalId: number) {
    const existing = await this.prisma.dischargeSummary.findFirst({
      where: { admissionId, hospitalId },
      include: {
        createdBy: { select: { fullName: true } }
      }
    });

    if (existing) return existing;

    // لم يتم إنشاء ملخص خروج بعد، سحب البيانات المبدئية كسياق للطبيب
    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId, hospitalId },
      include: {
        encounter: {
          include: {
            encounterDiagnoses: {
              include: { diagnosisCode: true }
            },
            prescriptions: {
              include: {
                items: { include: { product: true } }
              }
            }
          }
        }
      }
    });

    if (!admission) throw new NotFoundException('حالة التنويم غير موجودة');

    // استخراج التشخيصات لتكون بصياغة نصية مؤقتة
    const diagnosesArray = admission.encounter.encounterDiagnoses.map(
      (d) => d.diagnosisCode ? `${d.diagnosisCode.code} - ${d.diagnosisCode.nameEn}` : d.note || ''
    );
    const initialDiagnoses = diagnosesArray.join('\n');

    // افتراض بعض الأدوية كمسودة
    const medsArray = admission.encounter.prescriptions.flatMap(p => 
      p.items.map(i => {
        const doseStr = (i as any).dose || (i as any).dosage || '';
        const freqStr = (i as any).frequency || '';
        const durStr = (i as any).duration || '';
        return `${i.product?.name ?? 'Unknown'} - ${doseStr} ${freqStr} for ${durStr}`;
      })
    );

    return {
      isDraft: true,
      admissionId: admission.id,
      encounterId: admission.encounterId,
      hospitalId: admission.hospitalId,
      admissionDate: admission.actualAdmissionDate,
      dischargeDate: admission.dischargeDate || new Date(),
      lengthOfStay: admission.dischargeDate 
        ? Math.ceil((new Date(admission.dischargeDate).getTime() - new Date(admission.actualAdmissionDate).getTime()) / (1000 * 3600 * 24))
        : Math.ceil((new Date().getTime() - new Date(admission.actualAdmissionDate).getTime()) / (1000 * 3600 * 24)),
      admissionDiagnosis: initialDiagnoses || 'لم يتم تسجيل تشخيص',
      dischargeDiagnosis: initialDiagnoses || '',
      hospitalCourse: '',
      dischargeMedications: medsArray.map(m => ({ text: m })),
    };
  }

  async saveSummary(userId: number, dto: CreateDischargeSummaryDto) {
    // التأكد من عدم التكرار
    const existing = await this.prisma.dischargeSummary.findFirst({
      where: { admissionId: dto.admissionId, hospitalId: dto.hospitalId }
    });

    const admission = await this.prisma.admission.findUnique({
      where: { id: dto.admissionId }
    });

    if (!admission) throw new NotFoundException('حالة التنويم غير موجودة');

    // استخراج الحقول الخاصة بالعلاقات من الـ DTO، والباقي حقول نصية
    const { admissionId, encounterId, hospitalId, ...textFields } = dto;

    const computedFields = {
      admissionDate: admission.actualAdmissionDate,
      dischargeDate: admission.dischargeDate || new Date(),
      lengthOfStay: Math.ceil((new Date(admission.dischargeDate || new Date()).getTime() - new Date(admission.actualAdmissionDate).getTime()) / (1000 * 3600 * 24)),
    };

    if (existing) {
      if (existing.completedAt) throw new Error('لا يمكن تعديل ملخص الخروج بعد توثيقه (Sign off)');
      
      return this.prisma.dischargeSummary.update({
        where: { id: existing.id },
        data: {
            ...textFields,
            ...computedFields,
        }
      });
    }

    return this.prisma.dischargeSummary.create({
      data: {
        ...textFields,
        ...computedFields,
        admission: { connect: { id: admissionId } },
        encounter: { connect: { id: encounterId } },
        hospital: { connect: { id: hospitalId } },
        createdBy: { connect: { id: userId } },
      }
    });
  }

  async signOff(summaryId: number, hospitalId: number) {
    const existing = await this.prisma.dischargeSummary.findFirst({
      where: { id: summaryId, hospitalId },
    });

    if (!existing) throw new NotFoundException('ملخص الخروج غير موجود');
    if (existing.completedAt) throw new Error('الملخص معتمد مسبقاً');

    return this.prisma.dischargeSummary.update({
      where: { id: summaryId },
      data: {
        completedAt: new Date()
      }
    });
  }
}
