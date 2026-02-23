import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../../notifications/notifications.service';
import { CreateAntenatalCareDto, CreateAntenatalVisitDto } from '../dto/antenatal-care.dto';

@Injectable()
export class AntenatalCareService {
  private readonly logger = new Logger(AntenatalCareService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * تسجيل حمل جديد — حساب EDD تلقائي + بروتوكول Rh الذكي
   */
  async createCare(hospitalId: number, dto: CreateAntenatalCareDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });

    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريضة غير موجودة.');
    }

    // التحقق من عدم وجود حمل نشط
    const activeCare = await this.prisma.antenatalCare.findFirst({
      where: { hospitalId, patientId: dto.patientId, status: 'ACTIVE' },
    });

    if (activeCare) {
      throw new BadRequestException(
        'يوجد سجل حمل نشط لهذه المريضة بالفعل. يجب إغلاقه أولاً.',
      );
    }

    // حساب EDD (LMP + 280 يوم — قاعدة Naegele)
    const lmpDate = new Date(dto.lmpDate);
    const eddDate = new Date(lmpDate);
    eddDate.setDate(eddDate.getDate() + 280);

    // === بروتوكول Rh الذكي ===
    let riskLevel = dto.riskLevel ?? 'LOW';
    const isRhNegative = dto.rhFactor === 'Negative';
    const rhIncompatible = isRhNegative && dto.partnerRhFactor !== 'Negative';

    // رفع مستوى الخطورة تلقائياً إذا الأم Rh-
    if (isRhNegative && riskLevel === 'LOW') {
      riskLevel = 'MEDIUM';
    }

    const care = await this.prisma.antenatalCare.create({
      data: {
        hospitalId,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        lmpDate,
        eddDate,
        gravida: dto.gravida ?? 1,
        para: dto.para ?? 0,
        bloodGroup: dto.bloodGroup,
        rhFactor: dto.rhFactor,
        partnerRhFactor: dto.partnerRhFactor,
        rhIncompatible,
        riskLevel: riskLevel as any,
        riskFactors: dto.riskFactors,
        notes: dto.notes,
      },
      include: {
        patient: { select: { fullName: true, mrn: true } },
        doctor: { select: { id: true, fullName: true } },
      },
    });

    // === تنبيهات Rh ===
    if (isRhNegative && dto.doctorId) {
      await this.sendRhNegativeAlerts(care, hospitalId, dto.doctorId);
    }

    return care;
  }

  /**
   * إرسال تنبيهات Rh عند تسجيل حمل لأم Rh-
   */
  private async sendRhNegativeAlerts(care: any, hospitalId: number, doctorId: number) {
    const patientName = care.patient?.fullName || 'مريضة';

    // تنبيه 1: الأم Rh سالب
    await this.notifications.create(
      hospitalId,
      doctorId,
      '⚠️ تنبيه Rh سالب — خطر عدم التوافق',
      `المريضة ${patientName} (MRN: ${care.patient?.mrn}) — عامل Rh سالب (-). ` +
      `يرجى التحقق من فصيلة دم الزوج وجدولة حقنة Anti-D في الأسبوع 28.`,
      `/obgyn/anc?careId=${care.id}`,
    );

    // تنبيه 2: إذا Rh الزوج غير معروف
    if (!care.partnerRhFactor || care.partnerRhFactor === 'Unknown') {
      await this.notifications.create(
        hospitalId,
        doctorId,
        '🔬 مطلوب: فحص Rh الزوج',
        `المريضة ${patientName} — Rh سالب. يرجى طلب فحص فصيلة دم الزوج لتحديد مستوى الخطر.`,
        `/obgyn/anc?careId=${care.id}`,
      );
    }

    this.logger.log(`[Rh Protocol] Alerts sent for patient ${care.patientId}, care #${care.id}`);
  }

  /**
   * تحديث Rh الزوج وإعادة حساب التوافق
   */
  async updatePartnerRh(hospitalId: number, careId: number, partnerRhFactor: string, doctorId?: number) {
    const care = await this.prisma.antenatalCare.findUnique({
      where: { id: careId },
      include: { patient: { select: { fullName: true, mrn: true } } },
    });

    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    const isMotherNeg = care.rhFactor === 'Negative';
    const rhIncompatible = isMotherNeg && partnerRhFactor !== 'Negative';

    // رفع الخطورة إذا عدم توافق
    let riskLevel = care.riskLevel;
    if (rhIncompatible && riskLevel === 'LOW') {
      riskLevel = 'MEDIUM';
    }
    // خفض الخطورة إذا الزوج سالب (الخطر زال)
    if (isMotherNeg && partnerRhFactor === 'Negative' && riskLevel === 'MEDIUM') {
      riskLevel = 'LOW';
    }

    const updated = await this.prisma.antenatalCare.update({
      where: { id: careId },
      data: {
        partnerRhFactor,
        rhIncompatible,
        riskLevel: riskLevel as any,
      },
    });

    // إرسال تنبيه حسب النتيجة
    const targetDoctor = doctorId || care.doctorId;
    if (targetDoctor) {
      const patientName = care.patient?.fullName || 'مريضة';
      if (rhIncompatible) {
        await this.notifications.create(
          hospitalId, targetDoctor,
          '🔴 عدم توافق Rh مؤكد — بروتوكول Anti-D',
          `الزوج Rh موجب (+) — المريضة ${patientName} تحتاج حقنة Anti-D في الأسبوع 28. ` +
          `يرجى جدولة الحقنة ومتابعة الحالة عن كثب.`,
          `/obgyn/anc?careId=${careId}`,
        );
      } else if (isMotherNeg && partnerRhFactor === 'Negative') {
        await this.notifications.create(
          hospitalId, targetDoctor,
          '✅ خطر Rh قد زال',
          `الزوج Rh سالب (-) مثل الأم — المريضة ${patientName}. الجنين سيكون Rh سالب حتماً. لا حاجة لحقنة Anti-D.`,
          `/obgyn/anc?careId=${careId}`,
        );
      }
    }

    return updated;
  }

  /**
   * تسجيل إعطاء حقنة Anti-D (أسبوع 28 أو بعد الولادة)
   */
  async recordAntiD(hospitalId: number, careId: number, type: 'week28' | 'postpartum') {
    const care = await this.prisma.antenatalCare.findUnique({ where: { id: careId } });
    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    const data = type === 'week28'
      ? { antiDWeek28Given: true }
      : { antiDPostpartumGiven: true };

    return this.prisma.antenatalCare.update({
      where: { id: careId },
      data,
    });
  }

  /**
   * إضافة زيارة متابعة حمل + تنبيه Anti-D عند الأسبوع 28
   */
  async addVisit(hospitalId: number, dto: CreateAntenatalVisitDto) {
    const care = await this.prisma.antenatalCare.findUnique({
      where: { id: dto.antenatalCareId },
      include: { patient: { select: { fullName: true } } },
    });

    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    if (care.status !== 'ACTIVE') {
      throw new BadRequestException('سجل الحمل مغلق. لا يمكن إضافة زيارات.');
    }

    // حساب أسبوع الحمل تلقائياً
    let gestationalWeek = dto.gestationalWeek;
    if (!gestationalWeek) {
      const diffMs = new Date().getTime() - care.lmpDate.getTime();
      gestationalWeek = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    }

    const visit = await this.prisma.antenatalVisit.create({
      data: {
        antenatalCareId: dto.antenatalCareId,
        gestationalWeek,
        weight: dto.weight,
        bloodPressureSys: dto.bloodPressureSys,
        bloodPressureDia: dto.bloodPressureDia,
        fundalHeight: dto.fundalHeight,
        fetalHeartRate: dto.fetalHeartRate,
        fetalMovement: dto.fetalMovement,
        presentation: dto.presentation,
        edema: dto.edema ?? false,
        urineProtein: dto.urineProtein,
        urineGlucose: dto.urineGlucose,
        hemoglobin: dto.hemoglobin,
        complaints: dto.complaints,
        notes: dto.notes,
        nextVisitDate: dto.nextVisitDate ? new Date(dto.nextVisitDate) : null,
      },
    });

    // === تنبيه Anti-D في الأسبوع 26-28 ===
    if (care.rhIncompatible && !care.antiDWeek28Given && gestationalWeek >= 26 && gestationalWeek <= 30) {
      if (care.doctorId) {
        const patientName = care.patient?.fullName || 'مريضة';
        await this.notifications.create(
          hospitalId, care.doctorId,
          '💉 موعد حقنة Anti-D — الأسبوع 28',
          `المريضة ${patientName} في الأسبوع ${gestationalWeek} — Rh غير متوافق. ` +
          `يجب إعطاء حقنة Anti-D الوقائية الآن (الأسبوع 28).`,
          `/obgyn/anc?careId=${care.id}`,
        );
      }
    }

    return visit;
  }

  /**
   * جلب سجلات الحمل لمريضة
   */
  async findByPatient(patientId: number) {
    return this.prisma.antenatalCare.findMany({
      where: { patientId },
      include: {
        doctor: { select: { fullName: true } },
        visits: { orderBy: { visitDate: 'desc' } },
        _count: { select: { visits: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * جلب سجل حمل معين مع جميع الزيارات
   */
  async findOne(hospitalId: number, id: number) {
    const care = await this.prisma.antenatalCare.findUnique({
      where: { id },
      include: {
        patient: { select: { fullName: true, mrn: true, dateOfBirth: true } },
        doctor: { select: { fullName: true } },
        visits: { orderBy: { visitDate: 'asc' } },
      },
    });

    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    const currentWeek = Math.floor(
      (new Date().getTime() - care.lmpDate.getTime()) / (1000 * 60 * 60 * 24 * 7),
    );

    return {
      ...care,
      currentGestationalWeek: currentWeek,
      daysToEDD: Math.floor(
        (care.eddDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      ),
    };
  }

  /**
   * إغلاق سجل حمل + تنبيهات Rh للإجهاض
   */
  async updateStatus(
    hospitalId: number,
    id: number,
    status: 'DELIVERED' | 'MISCARRIAGE' | 'ECTOPIC' | 'CANCELLED',
  ) {
    const care = await this.prisma.antenatalCare.findUnique({
      where: { id },
      include: { patient: { select: { fullName: true, mrn: true } } },
    });

    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    const updated = await this.prisma.antenatalCare.update({
      where: { id },
      data: { status },
    });

    // === تنبيه Anti-D عند الإجهاض لأم Rh- ===
    if ((status === 'MISCARRIAGE' || status === 'ECTOPIC') && care.rhFactor === 'Negative') {
      const patientName = care.patient?.fullName || 'مريضة';
      // تنبيه الطبيب المعالج
      if (care.doctorId) {
        await this.notifications.create(
          hospitalId, care.doctorId,
          '🚨 عاجل: حقنة Anti-D مطلوبة — إجهاض لأم Rh سالب',
          `المريضة ${patientName} (MRN: ${care.patient?.mrn}) — تم تسجيل ${status === 'MISCARRIAGE' ? 'إجهاض' : 'حمل خارج الرحم'}. ` +
          `يجب إعطاء حقنة Anti-D خلال 72 ساعة لحماية الأجنة المستقبلية.`,
          `/obgyn/anc?careId=${id}`,
        );
      }
      // تنبيه لجميع أطباء النساء والولادة
      await this.notifications.notifyRoles(
        hospitalId, ['DOCTOR'],
        '⚠️ حالة Rh حرجة — Anti-D مطلوب',
        `المريضة ${patientName} — ${status === 'MISCARRIAGE' ? 'إجهاض' : 'حمل خارج الرحم'} + Rh سالب. حقنة Anti-D خلال 72 ساعة.`,
        `/obgyn/anc?careId=${id}`,
      );
    }

    return updated;
  }

  /**
   * جلب جميع الحوامل النشطات + أعلام Rh
   */
  async findActivePregnancies(hospitalId: number) {
    return this.prisma.antenatalCare.findMany({
      where: { hospitalId, status: 'ACTIVE' },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        doctor: { select: { fullName: true } },
        _count: { select: { visits: true } },
      },
      orderBy: { eddDate: 'asc' },
    });
  }
}
