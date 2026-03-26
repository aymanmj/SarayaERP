import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordVitalsDto } from './dto/icu.dto';
import { DailyAssessmentDto } from './dto/icu-assessment.dto';
import { CreateMedicationDripDto, TitrateDripDto } from './dto/icu-drip.dto';
import { CreateEquipmentUsageDto } from './dto/icu-equipment.dto';
import { ChargeSource } from '@prisma/client';

@Injectable()
export class IcuService {
  private readonly logger = new Logger(IcuService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // BILLING HELPER
  // ==========================================

  /**
   * Creates an EncounterCharge for an ICU service if the service item exists.
   * Silently skips if no matching ServiceItem is found (admin can add later).
   */
  private async createIcuCharge(opts: {
    hospitalId: number;
    encounterId: number;
    serviceCode: string;
    quantity: number;
    overridePrice?: number;
    sourceId?: number;
    performerId?: number;
  }) {
    try {
      const serviceItem = await this.prisma.serviceItem.findFirst({
        where: { code: opts.serviceCode, hospitalId: opts.hospitalId },
      });

      if (!serviceItem) {
        this.logger.warn(`ServiceItem '${opts.serviceCode}' not found for hospital ${opts.hospitalId}. Skipping ICU charge.`);
        return null;
      }

      const unitPrice = opts.overridePrice ?? Number(serviceItem.defaultPrice);
      const totalAmount = unitPrice * opts.quantity;

      const charge = await this.prisma.encounterCharge.create({
        data: {
          hospitalId: opts.hospitalId,
          encounterId: opts.encounterId,
          serviceItemId: serviceItem.id,
          sourceType: ChargeSource.ICU,
          sourceId: opts.sourceId,
          quantity: opts.quantity,
          unitPrice,
          totalAmount,
          performerId: opts.performerId,
        },
      });

      this.logger.log(`ICU Charge created: ${opts.serviceCode} x${opts.quantity} = ${totalAmount} for encounter #${opts.encounterId}`);
      return charge;
    } catch (err) {
      this.logger.error(`Failed to create ICU charge for ${opts.serviceCode}`, err);
      return null;
    }
  }

  /** Maps equipment type to a default service item code */
  private getEquipmentServiceCode(equipmentType: string): string {
    const map: Record<string, string> = {
      VENTILATOR: 'ICU_VENTILATOR_DAILY',
      CARDIAC_MONITOR: 'ICU_MONITOR_DAILY',
      INFUSION_PUMP: 'ICU_INFUSION_PUMP_DAILY',
      FEEDING_PUMP: 'ICU_FEEDING_PUMP_DAILY',
      DIALYSIS_CRRT: 'ICU_DIALYSIS_DAILY',
      ECMO: 'ICU_ECMO_DAILY',
    };
    return map[equipmentType] || 'ICU_EQUIPMENT_DAILY';
  }

  // ==========================================
  // DASHBOARD & STATS
  // ==========================================
  async getIcuDashboardStats(hospitalId: number) {
    // Universal condition to identify ICU wards/departments
    const icuWardCondition = {
      hospitalId,
      OR: [
        { type: 'ICU' },
        { name: { contains: 'عناية' } },
        { name: { contains: 'ICU' } } // PostgreSQL in Prisma usually supports mode: 'insensitive' but let's stick to standard if it's strict
      ]
    };

    const activeTransfers = await this.prisma.transferOrder.count({
      where: { hospitalId, status: { in: ['REQUESTED', 'BED_ALLOCATED', 'HANDOVER_SIGNED'] }, encounter: { status: 'OPEN' } } // ensure open encounters only
    });

    const beds = await this.prisma.bed.findMany({
      where: { 
        hospitalId, 
        ward: icuWardCondition 
      },
      include: { ward: true }
    });

    const totalBeds = beds.length;
    const occupiedBeds = beds.filter(b => b.status === 'OCCUPIED').length;
    const cleaningBeds = beds.filter(b => b.status === 'NEEDS_CLEANING').length;

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
    const icuWardCondition = {
      hospitalId,
      OR: [
        { type: 'ICU' },
        { name: { contains: 'عناية' } },
        { name: { contains: 'ICU' } }
      ]
    };

    return this.prisma.admission.findMany({
      where: { 
        hospitalId, 
        admissionStatus: { in: ['ADMITTED', 'IN_PROGRESS'] },
        bed: { ward: icuWardCondition }
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
    const drip = await this.prisma.iCUMedicationDrip.create({
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

    // ── BILLING: Charge for IV drip administration ──
    await this.createIcuCharge({
      hospitalId,
      encounterId: dto.encounterId,
      serviceCode: 'ICU_DRIP_ADMIN',
      quantity: 1,
      sourceId: drip.id,
      performerId: userId,
    });

    return drip;
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
    const usage = await this.prisma.iCUEquipmentUsage.create({
      data: {
        hospitalId,
        encounterId: dto.encounterId,
        equipmentType: dto.equipmentType,
        equipmentName: dto.equipmentName,
        dailyRate: dto.dailyRate,
        notes: dto.notes
      }
    });

    // ── BILLING: Create initial 1-day charge ──
    const serviceCode = this.getEquipmentServiceCode(dto.equipmentType);
    await this.createIcuCharge({
      hospitalId,
      encounterId: dto.encounterId,
      serviceCode,
      quantity: 1,
      overridePrice: dto.dailyRate ? Number(dto.dailyRate) : undefined,
      sourceId: usage.id,
    });

    return usage;
  }

  async stopEquipmentUsage(hospitalId: number, usageId: number) {
    const usage = await this.prisma.iCUEquipmentUsage.findUnique({ where: { id: usageId, hospitalId } });
    if (!usage) throw new NotFoundException('Equipment usage not found');

    const now = new Date();
    const result = await this.prisma.iCUEquipmentUsage.update({
      where: { id: usageId },
      data: { stoppedAt: now }
    });

    // ── BILLING: Update charge with actual days used ──
    const totalDays = Math.max(1, Math.ceil((now.getTime() - usage.startedAt.getTime()) / (1000 * 60 * 60 * 24)));
    const existingCharge = await this.prisma.encounterCharge.findFirst({
      where: { hospitalId, encounterId: usage.encounterId, sourceType: ChargeSource.ICU, sourceId: usageId, invoiceId: null },
    });

    if (existingCharge && totalDays > 1) {
      const unitPrice = Number(existingCharge.unitPrice);
      await this.prisma.encounterCharge.update({
        where: { id: existingCharge.id },
        data: { quantity: totalDays, totalAmount: unitPrice * totalDays },
      });
      this.logger.log(`Updated equipment charge #${existingCharge.id}: ${totalDays} days × ${unitPrice} = ${unitPrice * totalDays}`);
    }

    return result;
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
