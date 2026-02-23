import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateFertilityCaseDto,
  CreateIVFCycleDto,
  UpdateIVFCycleDto,
  CreateEmbryoDto,
  CreateFertilityMedicationDto,
} from '../dto/fertility.dto';

@Injectable()
export class FertilityService {
  private readonly logger = new Logger(FertilityService.name);

  constructor(private prisma: PrismaService) {}

  // ===================== Fertility Case =====================

  async createCase(hospitalId: number, dto: CreateFertilityCaseDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريضة غير موجودة.');
    }

    return this.prisma.fertilityCase.create({
      data: {
        hospitalId,
        patientId: dto.patientId,
        partnerName: dto.partnerName,
        partnerAge: dto.partnerAge,
        infertilityType: (dto.infertilityType as any) ?? 'UNEXPLAINED',
        diagnosis: dto.diagnosis,
        durationYears: dto.durationYears,
        previousTreatments: dto.previousTreatments,
        amhLevel: dto.amhLevel,
        fshLevel: dto.fshLevel,
        lhLevel: dto.lhLevel,
        spermCount: dto.spermCount,
        spermMotility: dto.spermMotility,
        spermMorphology: dto.spermMorphology,
        notes: dto.notes,
      },
      include: {
        patient: { select: { fullName: true, mrn: true } },
      },
    });
  }

  async findCasesByPatient(patientId: number) {
    return this.prisma.fertilityCase.findMany({
      where: { patientId },
      include: {
        _count: { select: { cycles: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCase(hospitalId: number, id: number) {
    const fc = await this.prisma.fertilityCase.findUnique({
      where: { id },
      include: {
        patient: { select: { fullName: true, mrn: true, dateOfBirth: true } },
        cycles: {
          include: {
            embryos: true,
            medications: true,
          },
          orderBy: { cycleNumber: 'desc' },
        },
      },
    });
    if (!fc || fc.hospitalId !== hospitalId) {
      throw new NotFoundException('ملف العقم غير موجود.');
    }
    return fc;
  }

  async findActiveCases(hospitalId: number) {
    return this.prisma.fertilityCase.findMany({
      where: { hospitalId, status: 'ACTIVE' },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        _count: { select: { cycles: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateCaseStatus(hospitalId: number, id: number, status: string) {
    const fc = await this.prisma.fertilityCase.findUnique({ where: { id } });
    if (!fc || fc.hospitalId !== hospitalId) {
      throw new NotFoundException('ملف العقم غير موجود.');
    }
    return this.prisma.fertilityCase.update({
      where: { id },
      data: { status: status as any },
    });
  }

  // ===================== IVF Cycle =====================

  async createCycle(hospitalId: number, dto: CreateIVFCycleDto) {
    const fc = await this.prisma.fertilityCase.findUnique({
      where: { id: dto.fertilityCaseId },
    });
    if (!fc || fc.hospitalId !== hospitalId) {
      throw new NotFoundException('ملف العقم غير موجود.');
    }

    // حساب رقم الدورة تلقائياً
    const lastCycle = await this.prisma.iVFCycle.findFirst({
      where: { fertilityCaseId: dto.fertilityCaseId },
      orderBy: { cycleNumber: 'desc' },
    });

    return this.prisma.iVFCycle.create({
      data: {
        fertilityCaseId: dto.fertilityCaseId,
        cycleNumber: (lastCycle?.cycleNumber ?? 0) + 1,
        cycleType: (dto.cycleType as any) ?? 'IVF',
        protocol: dto.protocol,
        startDate: new Date(dto.startDate),
        notes: dto.notes,
      },
    });
  }

  async updateCycle(hospitalId: number, cycleId: number, dto: UpdateIVFCycleDto) {
    const cycle = await this.prisma.iVFCycle.findUnique({
      where: { id: cycleId },
      include: { fertilityCase: true },
    });
    if (!cycle || cycle.fertilityCase.hospitalId !== hospitalId) {
      throw new NotFoundException('الدورة غير موجودة.');
    }

    const data: any = { ...dto };
    if (dto.eggRetrievalDate) data.eggRetrievalDate = new Date(dto.eggRetrievalDate);
    if (dto.transferDate) data.transferDate = new Date(dto.transferDate);
    if (dto.betaHCGDate) data.betaHCGDate = new Date(dto.betaHCGDate);

    return this.prisma.iVFCycle.update({
      where: { id: cycleId },
      data,
      include: { embryos: true, medications: true },
    });
  }

  async getCycle(hospitalId: number, cycleId: number) {
    const cycle = await this.prisma.iVFCycle.findUnique({
      where: { id: cycleId },
      include: {
        fertilityCase: {
          include: { patient: { select: { fullName: true, mrn: true } } },
        },
        embryos: { orderBy: { embryoNumber: 'asc' } },
        medications: { orderBy: { startDate: 'asc' } },
      },
    });
    if (!cycle || cycle.fertilityCase.hospitalId !== hospitalId) {
      throw new NotFoundException('الدورة غير موجودة.');
    }
    return cycle;
  }

  // ===================== Embryos =====================

  async addEmbryo(hospitalId: number, dto: CreateEmbryoDto) {
    const cycle = await this.prisma.iVFCycle.findUnique({
      where: { id: dto.ivfCycleId },
      include: { fertilityCase: true },
    });
    if (!cycle || cycle.fertilityCase.hospitalId !== hospitalId) {
      throw new NotFoundException('الدورة غير موجودة.');
    }

    return this.prisma.embryoRecord.create({
      data: {
        ivfCycleId: dto.ivfCycleId,
        embryoNumber: dto.embryoNumber,
        day: dto.day,
        grade: dto.grade,
        cellCount: dto.cellCount,
        fragmentation: dto.fragmentation,
        status: (dto.status as any) ?? 'DEVELOPING',
        notes: dto.notes,
      },
    });
  }

  async updateEmbryoStatus(hospitalId: number, embryoId: number, status: string) {
    const embryo = await this.prisma.embryoRecord.findUnique({
      where: { id: embryoId },
      include: { ivfCycle: { include: { fertilityCase: true } } },
    });
    if (!embryo || embryo.ivfCycle.fertilityCase.hospitalId !== hospitalId) {
      throw new NotFoundException('سجل الجنين غير موجود.');
    }

    const data: any = { status };
    if (status === 'FROZEN') data.freezeDate = new Date();
    if (status === 'THAWED') data.thawDate = new Date();

    return this.prisma.embryoRecord.update({
      where: { id: embryoId },
      data,
    });
  }

  // ===================== Medications =====================

  async addMedication(hospitalId: number, dto: CreateFertilityMedicationDto) {
    const cycle = await this.prisma.iVFCycle.findUnique({
      where: { id: dto.ivfCycleId },
      include: { fertilityCase: true },
    });
    if (!cycle || cycle.fertilityCase.hospitalId !== hospitalId) {
      throw new NotFoundException('الدورة غير موجودة.');
    }

    return this.prisma.fertilityMedication.create({
      data: {
        ivfCycleId: dto.ivfCycleId,
        medicationName: dto.medicationName,
        dose: dto.dose,
        route: dto.route,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        durationDays: dto.durationDays,
        notes: dto.notes,
      },
    });
  }
}
