import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateFertilityCaseDto,
  CreateIVFCycleDto,
  UpdateIVFCycleDto,
  CreateEmbryoDto,
  CreateFertilityMedicationDto,
  CreateSemenAnalysisDto,
  CreateAndrologyVisitDto,
  CreateCryoTankDto,
  CreateCryoCanisterDto,
  CreateCryoItemDto,
  ThawCryoItemDto,
  CreateHormoneTestDto,
  CreateAndrologySurgeryDto,
  CreateAndrologyMedicationDto,
} from '../dto/fertility.dto';

@Injectable()
export class FertilityService {
  private readonly logger = new Logger(FertilityService.name);

  constructor(private prisma: PrismaService) {}

  // ===================== Fertility Case (Couple-Centric) =====================

  async createCase(hospitalId: number, dto: CreateFertilityCaseDto) {
    // Validate female patient
    const femalePatient = await this.prisma.patient.findUnique({
      where: { id: dto.femalePatientId },
    });
    if (!femalePatient || femalePatient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريضة (الزوجة) غير موجودة.');
    }

    // Validate male patient if provided
    if (dto.malePatientId) {
      const malePatient = await this.prisma.patient.findUnique({
        where: { id: dto.malePatientId },
      });
      if (!malePatient || malePatient.hospitalId !== hospitalId) {
        throw new NotFoundException('المريض (الزوج) غير موجود.');
      }
    }

    return this.prisma.fertilityCase.create({
      data: {
        hospitalId,
        femalePatientId: dto.femalePatientId,
        malePatientId: dto.malePatientId,
        infertilityType: (dto.infertilityType as any) ?? 'UNEXPLAINED',
        diagnosis: dto.diagnosis,
        durationYears: dto.durationYears,
        previousTreatments: dto.previousTreatments,
        amhLevel: dto.amhLevel,
        fshLevel: dto.fshLevel,
        lhLevel: dto.lhLevel,
        notes: dto.notes,
      },
      include: {
        femalePatient: { select: { id: true, fullName: true, mrn: true } },
        malePatient: { select: { id: true, fullName: true, mrn: true } },
      },
    });
  }

  async findCasesByPatient(patientId: number) {
    return this.prisma.fertilityCase.findMany({
      where: {
        OR: [
          { femalePatientId: patientId },
          { malePatientId: patientId },
        ],
      },
      include: {
        femalePatient: { select: { id: true, fullName: true, mrn: true } },
        malePatient: { select: { id: true, fullName: true, mrn: true } },
        _count: { select: { cycles: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCase(hospitalId: number, id: number) {
    const fc = await this.prisma.fertilityCase.findUnique({
      where: { id },
      include: {
        femalePatient: { select: { id: true, fullName: true, mrn: true, dateOfBirth: true, gender: true } },
        malePatient: { select: { id: true, fullName: true, mrn: true, dateOfBirth: true, gender: true } },
        cycles: {
          include: {
            embryos: true,
            medications: true,
          },
          orderBy: { cycleNumber: 'desc' },
        },
        semenAnalyses: { orderBy: { sampleDate: 'desc' } },
        andrologyVisits: { orderBy: { createdAt: 'desc' } },
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
        femalePatient: { select: { id: true, fullName: true, mrn: true } },
        malePatient: { select: { id: true, fullName: true, mrn: true } },
        _count: { select: { cycles: true, semenAnalyses: true } },
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

  async linkMalePatient(hospitalId: number, caseId: number, malePatientId: number) {
    const fc = await this.prisma.fertilityCase.findUnique({ where: { id: caseId } });
    if (!fc || fc.hospitalId !== hospitalId) {
      throw new NotFoundException('ملف العقم غير موجود.');
    }
    const patient = await this.prisma.patient.findUnique({ where: { id: malePatientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض (الزوج) غير موجود.');
    }
    return this.prisma.fertilityCase.update({
      where: { id: caseId },
      data: { malePatientId },
      include: {
        femalePatient: { select: { id: true, fullName: true, mrn: true } },
        malePatient: { select: { id: true, fullName: true, mrn: true } },
      },
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

    const lastCycle = await this.prisma.iVFCycle.findFirst({
      where: { fertilityCaseId: dto.fertilityCaseId },
      orderBy: { cycleNumber: 'desc' },
    });

    return this.prisma.iVFCycle.create({
      data: {
        fertilityCaseId: dto.fertilityCaseId,
        cycleNumber: (lastCycle?.cycleNumber ?? 0) + 1,
        cycleType: (dto.cycleType as any) ?? 'ICSI',
        protocol: dto.protocol,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
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
          include: {
            femalePatient: { select: { fullName: true, mrn: true } },
            malePatient: { select: { fullName: true, mrn: true } },
          },
        },
        embryos: { orderBy: { embryoNumber: 'asc' } },
        medications: { orderBy: { startDate: 'asc' } },
        cryoItems: true,
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

    return this.prisma.embryoRecord.update({
      where: { id: embryoId },
      data: { status: status as any },
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

  // ===================== Semen Analysis (أمراض الذكورة) =====================

  private calculateWHOClassification(dto: CreateSemenAnalysisDto): string | null {
    if (!dto.countMilPerMl) return null;

    const count = dto.countMilPerMl;
    const motilityPR = dto.progressivePR ?? 0;
    const morphologyNormal = dto.normalForms ?? 0;

    if (count === 0) return 'AZOOSPERMIA';

    const isOligo = count < 16;
    const isAstheno = motilityPR < 30;
    const isTerato = morphologyNormal < 4;

    if (isOligo && isAstheno && isTerato) return 'OAT (Oligoasthenoteratozoospermia)';
    if (isOligo && isAstheno) return 'Oligoasthenozoospermia';
    if (isOligo && isTerato) return 'Oligoteratozoospermia';
    if (isAstheno && isTerato) return 'Asthenoteratozoospermia';
    if (isOligo) return 'Oligozoospermia';
    if (isAstheno) return 'Asthenozoospermia';
    if (isTerato) return 'Teratozoospermia';

    return 'NORMOZOOSPERMIA';
  }

  async createSemenAnalysis(hospitalId: number, dto: CreateSemenAnalysisDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }

    const totalMotility = (dto.progressivePR || 0) + (dto.nonProgressiveNP || 0);
    const autoClassification = this.calculateWHOClassification(dto);

    return this.prisma.semenAnalysis.create({
      data: {
        patientId: dto.patientId,
        fertilityCaseId: dto.fertilityCaseId,
        sampleDate: dto.sampleDate ? new Date(dto.sampleDate) : new Date(),
        abstinenceDays: dto.abstinenceDays,
        collectionMethod: dto.collectionMethod,
        collectionTime: dto.collectionTime ? new Date(dto.collectionTime) : null,
        analysisTime: dto.analysisTime ? new Date(dto.analysisTime) : null,
        volumeMl: dto.volumeMl,
        ph: dto.ph,
        appearance: dto.appearance,
        color: dto.color,
        viscosity: dto.viscosity,
        liquefaction: dto.liquefaction,
        liquefactionMinutes: dto.liquefactionMinutes,
        countMilPerMl: dto.countMilPerMl,
        totalCountMil: dto.totalCountMil,
        progressivePR: dto.progressivePR,
        nonProgressiveNP: dto.nonProgressiveNP,
        immotileIM: dto.immotileIM,
        totalMotility: totalMotility > 0 ? totalMotility : undefined,
        normalForms: dto.normalForms,
        headDefects: dto.headDefects,
        midpieceDefects: dto.midpieceDefects,
        tailDefects: dto.tailDefects,
        vitality: dto.vitality,
        wbcCount: dto.wbcCount,
        roundCells: dto.roundCells,
        agglutination: dto.agglutination,
        marTestIgG: dto.marTestIgG,
        marTestIgA: dto.marTestIgA,
        dnaFragmentation: dto.dnaFragmentation,
        dfiMethod: dto.dfiMethod,
        conclusion: dto.conclusion,
        doctorNotes: dto.doctorNotes,
        autoClassification,
      },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
      },
    });
  }

  async getSemenAnalyses(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.semenAnalysis.findMany({
      where: { patientId },
      orderBy: { sampleDate: 'desc' },
    });
  }

  // ===================== Andrology Visit =====================

  async createAndrologyVisit(hospitalId: number, dto: CreateAndrologyVisitDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }

    return this.prisma.andrologyVisit.create({
      data: {
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        fertilityCaseId: dto.fertilityCaseId,
        chiefComplaint: dto.chiefComplaint,
        infertilityMonths: dto.infertilityMonths,
        previousPregnancies: dto.previousPregnancies,
        coitalFrequency: dto.coitalFrequency,
        erectileDisfunc: dto.erectileDisfunc ?? false,
        ejaculatoryDisfunc: dto.ejaculatoryDisfunc ?? false,
        retrogradeEjac: dto.retrogradeEjac ?? false,
        libidoLevel: dto.libidoLevel,
        prematureEjac: dto.prematureEjac ?? false,
        smokingHabit: dto.smokingHabit,
        alcoholUse: dto.alcoholUse,
        occupationalExposure: dto.occupationalExposure,
        bmi: dto.bmi,
        cryptorchidismHistory: dto.cryptorchidismHistory ?? false,
        orchitisHistory: dto.orchitisHistory ?? false,
        inguinalSurgery: dto.inguinalSurgery ?? false,
        chemotherapy: dto.chemotherapy ?? false,
        radiationExposure: dto.radiationExposure ?? false,
        currentMedications: dto.currentMedications,
        surgicalHistory: dto.surgicalHistory,
        medicalConditions: dto.medicalConditions,
        varicoceleGrade: dto.varicoceleGrade,
        varicoceleRight: dto.varicoceleRight,
        varicoceleLeft: dto.varicoceleLeft,
        testicularVolR: dto.testicularVolR,
        testicularVolL: dto.testicularVolL,
        testisConsistency: dto.testisConsistency,
        epididymalFindings: dto.epididymalFindings,
        vasPresence: dto.vasPresence,
        penileExam: dto.penileExam,
        gynecomastia: dto.gynecomastia ?? false,
        bodyHairPattern: dto.bodyHairPattern,
        fshLevel: dto.fshLevel,
        lhLevel: dto.lhLevel,
        testosterone: dto.testosterone,
        prolactin: dto.prolactin,
        diagnosis: dto.diagnosis,
        treatmentPlan: dto.treatmentPlan,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        referralNotes: dto.referralNotes,
      },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
      },
    });
  }

  async getAndrologyVisits(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.andrologyVisit.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===================== Hormone Tests =====================

  async createHormoneTest(hospitalId: number, dto: CreateHormoneTestDto) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.hormoneTest.create({
      data: {
        patientId: dto.patientId,
        testDate: dto.testDate ? new Date(dto.testDate) : new Date(),
        fsh: dto.fsh,
        lh: dto.lh,
        totalTestosterone: dto.totalTestosterone,
        freeTestosterone: dto.freeTestosterone,
        estradiol: dto.estradiol,
        prolactin: dto.prolactin,
        tsh: dto.tsh,
        inhibinB: dto.inhibinB,
        shbg: dto.shbg,
        amhMale: dto.amhMale,
        notes: dto.notes,
      },
    });
  }

  async getHormoneTests(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.hormoneTest.findMany({
      where: { patientId },
      orderBy: { testDate: 'desc' },
    });
  }

  // ===================== Andrology Surgery =====================

  async createAndrologySurgery(hospitalId: number, dto: CreateAndrologySurgeryDto) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.andrologySurgery.create({
      data: {
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        surgeryDate: dto.surgeryDate ? new Date(dto.surgeryDate) : new Date(),
        procedure: dto.procedure,
        technique: dto.technique,
        surgeonName: dto.surgeonName,
        findings: dto.findings,
        outcome: dto.outcome,
        complications: dto.complications,
        spermRetrieved: dto.spermRetrieved ?? false,
        notes: dto.notes,
      },
    });
  }

  async getAndrologySurgeries(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.andrologySurgery.findMany({
      where: { patientId },
      orderBy: { surgeryDate: 'desc' },
    });
  }

  // ===================== Andrology Medication =====================

  async createAndrologyMedication(hospitalId: number, dto: CreateAndrologyMedicationDto) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.andrologyMedication.create({
      data: {
        patientId: dto.patientId,
        medication: dto.medication,
        category: dto.category,
        dose: dto.dose,
        frequency: dto.frequency,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        response: dto.response,
        sideEffects: dto.sideEffects,
        notes: dto.notes,
      },
    });
  }

  async getAndrologyMedications(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }
    return this.prisma.andrologyMedication.findMany({
      where: { patientId },
      orderBy: { startDate: 'desc' },
    });
  }

  // ===================== Cryo Bank =====================

  async createCryoTank(hospitalId: number, dto: CreateCryoTankDto) {
    return this.prisma.cryoTank.create({
      data: {
        hospitalId,
        code: dto.code,
        name: dto.name,
        location: dto.location,
      },
    });
  }

  async getCryoTanks(hospitalId: number) {
    return this.prisma.cryoTank.findMany({
      where: { hospitalId },
      include: {
        canisters: {
          include: { _count: { select: { items: true } } },
        },
      },
    });
  }

  async addCryoCanister(hospitalId: number, dto: CreateCryoCanisterDto) {
    const tank = await this.prisma.cryoTank.findUnique({ where: { id: dto.tankId } });
    if (!tank || tank.hospitalId !== hospitalId) {
      throw new NotFoundException('التانك غير موجود.');
    }
    return this.prisma.cryoCanister.create({
      data: { tankId: dto.tankId, code: dto.code },
    });
  }

  async addCryoItem(hospitalId: number, dto: CreateCryoItemDto) {
    const canister = await this.prisma.cryoCanister.findUnique({
      where: { id: dto.canisterId },
      include: { tank: true },
    });
    if (!canister || canister.tank.hospitalId !== hospitalId) {
      throw new NotFoundException('الحاوية غير موجودة.');
    }

    return this.prisma.cryoItem.create({
      data: {
        canisterId: dto.canisterId,
        patientId: dto.patientId,
        itemType: dto.itemType as any,
        freezeDate: dto.freezeDate ? new Date(dto.freezeDate) : new Date(),
        caneCode: dto.caneCode,
        gobletColor: dto.gobletColor,
        visotubeColor: dto.visotubeColor,
        strawCount: dto.strawCount ?? 1,
        description: dto.description,
        ivfCycleId: dto.ivfCycleId,
      },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        canister: { include: { tank: { select: { code: true, name: true } } } },
      },
    });
  }

  async thawCryoItem(hospitalId: number, itemId: number, dto: ThawCryoItemDto) {
    const item = await this.prisma.cryoItem.findUnique({
      where: { id: itemId },
      include: { canister: { include: { tank: true } } },
    });
    if (!item || item.canister.tank.hospitalId !== hospitalId) {
      throw new NotFoundException('العنصر المجمد غير موجود.');
    }
    if (item.status !== 'FROZEN') {
      throw new BadRequestException('هذا العنصر ليس مجمداً حالياً.');
    }
    return this.prisma.cryoItem.update({
      where: { id: itemId },
      data: {
        status: 'THAWED',
        thawDate: dto.thawDate ? new Date(dto.thawDate) : new Date(),
      },
    });
  }

  async getCryoItemsByPatient(hospitalId: number, patientId: number) {
    return this.prisma.cryoItem.findMany({
      where: { patientId },
      include: {
        canister: { include: { tank: { select: { code: true, name: true } } } },
      },
      orderBy: { freezeDate: 'desc' },
    });
  }

  async discardCryoItem(hospitalId: number, itemId: number) {
    const item = await this.prisma.cryoItem.findUnique({
      where: { id: itemId },
      include: { canister: { include: { tank: true } } },
    });
    if (!item || item.canister.tank.hospitalId !== hospitalId) {
      throw new NotFoundException('العنصر المجمد غير موجود.');
    }
    return this.prisma.cryoItem.update({
      where: { id: itemId },
      data: { status: 'DISCARDED' },
    });
  }
}
