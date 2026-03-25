import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordVitalsDto } from './dto/icu.dto';
import { DailyAssessmentDto } from './dto/icu-assessment.dto';
import { CreateMedicationDripDto, TitrateDripDto } from './dto/icu-drip.dto';
import { CreateEquipmentUsageDto } from './dto/icu-equipment.dto';

@Injectable()
export class IcuService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // DASHBOARD & STATS
  // ==========================================

  async getIcuDashboardStats(hospitalId: number) {
    // We get all beds in wards that are marked as ICU.
    // Assuming type="ICU" or departmentId belongs to ICU department.
    // For now, let's use all beds to avoid overcomplicating department queries,
    // or we query admitted patients in ICU locations.
    
    // For realistic MVP, let's count active ICU admissions
    const activeTransfers = await this.prisma.transferOrder.count({
      where: { hospitalId, status: { in: ['REQUESTED', 'BED_ALLOCATED', 'HANDOVER_SIGNED'] } }
    });

    // In a real system, you'd filter by Ward type='ICU'
    const beds = await this.prisma.bed.findMany({
      where: { hospitalId }, // Ideally: ward: { department: { name: 'ICU' } }
      include: { ward: true }
    });

    const totalBeds = beds.length;
    const occupiedBeds = beds.filter(b => b.status === 'OCCUPIED').length;
    const cleaningBeds = beds.filter(b => b.status === 'NEEDS_CLEANING').length;

    // Count ventilated patients
    const activeVentilators = await this.prisma.iCUEquipmentUsage.count({
      where: { hospitalId, equipmentType: 'VENTILATOR', stoppedAt: null }
    });

    return {
      activeTransfers,
      beds: {
        total: totalBeds,
        occupied: occupiedBeds,
        available: totalBeds - occupiedBeds - cleaningBeds,
        cleaning: cleaningBeds
      },
      activeVentilators
    };
  }

  async getIcuPatients(hospitalId: number) {
    // Get all encounters currently assigned to an ICU bed
    // For simplicity of this module demo, we'll return all encounters with an active admission
    return this.prisma.admission.findMany({
      where: { 
        hospitalId, 
        admissionStatus: { in: ['ADMITTED', 'IN_PROGRESS'] }
        // Ideally filter by ward type = ICU
      },
      include: {
        patient: { select: { fullName: true, mrn: true, dateOfBirth: true, gender: true } },
        bed: { include: { room: true, ward: true } },
        admittingDoctor: { select: { fullName: true } }
      }
    });
  }

  // ==========================================
  // FLOWSHEET
  // ==========================================

  async recordFlowsheetEntry(hospitalId: number, userId: number, dto: RecordVitalsDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert flowsheet for today's shift
    const flowsheet = await this.prisma.iCUFlowsheet.upsert({
      where: {
        encounterId_shiftDate_shiftName: {
          encounterId: dto.encounterId,
          shiftDate: today,
          shiftName: dto.shiftName
        }
      },
      create: {
        hospitalId,
        encounterId: dto.encounterId,
        shiftDate: today,
        shiftName: dto.shiftName
      },
      update: {}
    });

    const entry = await this.prisma.iCUFlowsheetEntry.create({
      data: {
        flowsheetId: flowsheet.id,
        recordedById: userId,
        heartRate: dto.heartRate,
        respRate: dto.respRate,
        bpSystolic: dto.bpSystolic,
        bpDiastolic: dto.bpDiastolic,
        meanArterialBp: dto.meanArterialBp,
        temperature: dto.temperature,
        o2Sat: dto.o2Sat,
        intakeType: dto.intakeType,
        intakeAmount: dto.intakeAmount,
        outputType: dto.outputType,
        outputAmount: dto.outputAmount,
        gcsScore: dto.gcsScore,
        apgarScore: dto.apgarScore,
        notes: dto.notes,
        ventilatorLog: dto.ventMode ? {
          create: {
            mode: dto.ventMode,
            fio2: dto.ventFio2,
            peep: dto.ventPeep
          }
        } : undefined
      }
    });

    return entry;
  }

  async getFlowsheet(hospitalId: number, encounterId: number, date: string) {
    const shiftDate = new Date(date);
    shiftDate.setHours(0, 0, 0, 0);

    return this.prisma.iCUFlowsheet.findMany({
      where: { hospitalId, encounterId, shiftDate },
      include: {
        entries: {
          include: {
            recordedBy: { select: { fullName: true } },
            ventilatorLog: true
          },
          orderBy: { recordedAt: 'asc' }
        }
      }
    });
  }

  async getCumulativeIO(hospitalId: number, encounterId: number, date: string) {
    const shiftDate = new Date(date);
    shiftDate.setHours(0, 0, 0, 0);

    const flowsheets = await this.prisma.iCUFlowsheet.findMany({
      where: { hospitalId, encounterId, shiftDate },
      include: { entries: true }
    });

    let totalIntake = 0;
    let totalOutput = 0;

    flowsheets.forEach(f => {
      f.entries.forEach(e => {
        if (e.intakeAmount) totalIntake += Number(e.intakeAmount);
        if (e.outputAmount) totalOutput += Number(e.outputAmount);
      });
    });

    return { totalIntake, totalOutput, balance: totalIntake - totalOutput };
  }

  // ==========================================
  // DAILY CLINICAL ASSESSMENTS (GCS, SOFA, APACHE)
  // ==========================================

  async createDailyAssessment(hospitalId: number, userId: number, dto: DailyAssessmentDto) {
    const assessmentDate = new Date(dto.assessmentDate);
    assessmentDate.setHours(0, 0, 0, 0);

    return this.prisma.iCUDailyAssessment.upsert({
      where: {
        encounterId_assessmentDate: {
          encounterId: dto.encounterId,
          assessmentDate
        }
      },
      create: {
        hospitalId,
        assessedById: userId,
        ...dto,
        assessmentDate, // explicitly set overridden value
      },
      update: {
        assessedById: userId,
        ...dto,
        assessmentDate, // explicitly set overridden value
      }
    });
  }

  async getDailyAssessments(hospitalId: number, encounterId: number) {
    return this.prisma.iCUDailyAssessment.findMany({
      where: { hospitalId, encounterId },
      orderBy: { assessmentDate: 'desc' },
      include: { assessedBy: { select: { fullName: true } } }
    });
  }

  // ==========================================
  // DRIP & INFUSION MANAGEMENT
  // ==========================================

  async createMedicationDrip(hospitalId: number, userId: number, dto: CreateMedicationDripDto) {
    return this.prisma.iCUMedicationDrip.create({
      data: {
        hospitalId,
        encounterId: dto.encounterId,
        medicationName: dto.medicationName,
        concentration: dto.concentration,
        currentRate: dto.currentRate,
        doseUnit: dto.doseUnit,
        orderedById: userId,
        titrationLog: [{ 
          rate: dto.currentRate, 
          action: 'STARTED', 
          time: new Date().toISOString() 
        }]
      }
    });
  }

  async titrateDrip(hospitalId: number, dripId: number, userId: number, dto: TitrateDripDto) {
    const drip = await this.prisma.iCUMedicationDrip.findUnique({ where: { id: dripId, hospitalId } });
    if (!drip) throw new NotFoundException('Drip not found');
    if (drip.status !== 'RUNNING') throw new BadRequestException(`Cannot titrate a ${drip.status} drip`);

    const log: any[] = Array.isArray(drip.titrationLog) ? drip.titrationLog : [];
    log.push({
      rate: dto.newRate,
      action: 'TITRATED',
      reason: dto.reason,
      userId,
      time: new Date().toISOString()
    });

    return this.prisma.iCUMedicationDrip.update({
      where: { id: dripId },
      data: {
        currentRate: dto.newRate,
        titrationLog: log,
        updatedAt: new Date()
      }
    });
  }

  async stopDrip(hospitalId: number, dripId: number, userId: number, reason?: string) {
    const drip = await this.prisma.iCUMedicationDrip.findUnique({ where: { id: dripId, hospitalId } });
    if (!drip) throw new NotFoundException('Drip not found');

    const log: any[] = Array.isArray(drip.titrationLog) ? drip.titrationLog : [];
    log.push({
      rate: 0,
      action: 'STOPPED',
      reason,
      userId,
      time: new Date().toISOString()
    });

    return this.prisma.iCUMedicationDrip.update({
      where: { id: dripId },
      data: {
        status: 'STOPPED',
        stoppedAt: new Date(),
        currentRate: 0,
        titrationLog: log
      }
    });
  }

  async getActiveDrips(hospitalId: number, encounterId: number) {
    return this.prisma.iCUMedicationDrip.findMany({
      where: { hospitalId, encounterId, status: 'RUNNING' },
      orderBy: { startedAt: 'desc' },
      include: { orderedBy: { select: { fullName: true } } }
    });
  }

  // ==========================================
  // EQUIPMENT USAGE (BILLING PURPOSES)
  // ==========================================

  async createEquipmentUsage(hospitalId: number, dto: CreateEquipmentUsageDto) {
    return this.prisma.iCUEquipmentUsage.create({
      data: {
        hospitalId,
        encounterId: dto.encounterId,
        equipmentType: dto.equipmentType,
        equipmentName: dto.equipmentName,
        dailyRate: dto.dailyRate,
        notes: dto.notes
      }
    });
  }

  async stopEquipmentUsage(hospitalId: number, usageId: number) {
    const usage = await this.prisma.iCUEquipmentUsage.findUnique({ where: { id: usageId, hospitalId } });
    if (!usage) throw new NotFoundException('Equipment usage not found');

    return this.prisma.iCUEquipmentUsage.update({
      where: { id: usageId },
      data: { stoppedAt: new Date() }
    });
  }

  async getEquipmentUsage(hospitalId: number, encounterId: number) {
    return this.prisma.iCUEquipmentUsage.findMany({
      where: { hospitalId, encounterId },
      orderBy: { startedAt: 'desc' }
    });
  }

  // ==========================================
  // NICU SEPARATION
  // ==========================================
  async separateNewbornPatient(hospitalId: number, userId: number, motherPatientId: number, newbornArgs: any) {
    const mother = await this.prisma.patient.findUnique({ where: { id: motherPatientId, hospitalId } });
    if (!mother) throw new NotFoundException('Mother patient record not found');

    const newborn = await this.prisma.patient.create({
      data: {
        hospitalId,
        mrn: 'NB-' + new Date().getTime(), // Production: use real MRN seq
        fullName: 'Newborn of ' + mother.fullName,
        dateOfBirth: new Date(),
        motherId: mother.id,
        // Fallback to mother's insurance policy, OR fallback to parent as Guarantor
        insurancePolicyId: mother.insurancePolicyId,
        guarantorId: mother.insurancePolicyId ? null : mother.id
      }
    });

    return newborn;
  }
}
