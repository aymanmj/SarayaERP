import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAntenatalCareDto, CreateAntenatalVisitDto } from '../dto/antenatal-care.dto';

@Injectable()
export class AntenatalCareService {
  private readonly logger = new Logger(AntenatalCareService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * تسجيل حمل جديد — حساب EDD تلقائي من LMP
   */
  async createCare(hospitalId: number, dto: CreateAntenatalCareDto) {
    // التحقق من المريضة
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });

    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريضة غير موجودة.');
    }

    // التحقق من عدم وجود حمل نشط
    const activeCare = await this.prisma.antenatalCare.findFirst({
      where: {
        hospitalId,
        patientId: dto.patientId,
        status: 'ACTIVE',
      },
    });

    if (activeCare) {
      throw new BadRequestException(
        'يوجد سجل حمل نشط لهذه المريضة بالفعل. يجب إغلاقه أولاً.',
      );
    }

    // حساب EDD (تاريخ الولادة المتوقع) = LMP + 280 يوم (قاعدة Naegele)
    const lmpDate = new Date(dto.lmpDate);
    const eddDate = new Date(lmpDate);
    eddDate.setDate(eddDate.getDate() + 280);

    return this.prisma.antenatalCare.create({
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
        riskLevel: dto.riskLevel ?? 'LOW',
        riskFactors: dto.riskFactors,
        notes: dto.notes,
      },
      include: {
        patient: { select: { fullName: true, mrn: true } },
        doctor: { select: { fullName: true } },
      },
    });
  }

  /**
   * إضافة زيارة متابعة حمل
   */
  async addVisit(hospitalId: number, dto: CreateAntenatalVisitDto) {
    const care = await this.prisma.antenatalCare.findUnique({
      where: { id: dto.antenatalCareId },
    });

    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    if (care.status !== 'ACTIVE') {
      throw new BadRequestException('سجل الحمل مغلق. لا يمكن إضافة زيارات.');
    }

    // حساب أسبوع الحمل تلقائياً إذا لم يُحدد
    let gestationalWeek = dto.gestationalWeek;
    if (!gestationalWeek) {
      const diffMs = new Date().getTime() - care.lmpDate.getTime();
      gestationalWeek = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    }

    return this.prisma.antenatalVisit.create({
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
  }

  /**
   * جلب سجلات الحمل لمريضة
   */
  async findByPatient(patientId: number) {
    return this.prisma.antenatalCare.findMany({
      where: { patientId },
      include: {
        doctor: { select: { fullName: true } },
        visits: {
          orderBy: { visitDate: 'desc' },
        },
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
        visits: {
          orderBy: { visitDate: 'asc' },
        },
      },
    });

    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    // حساب أسبوع الحمل الحالي
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
   * إغلاق سجل حمل (ولادة / إجهاض / إلخ)
   */
  async updateStatus(
    hospitalId: number,
    id: number,
    status: 'DELIVERED' | 'MISCARRIAGE' | 'ECTOPIC' | 'CANCELLED',
  ) {
    const care = await this.prisma.antenatalCare.findUnique({
      where: { id },
    });

    if (!care || care.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الحمل غير موجود.');
    }

    return this.prisma.antenatalCare.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * جلب جميع الحوامل النشطات في المستشفى
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
