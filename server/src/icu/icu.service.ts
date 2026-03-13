import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordVitalsDto } from './dto/icu.dto';

@Injectable()
export class IcuService {
  constructor(private readonly prisma: PrismaService) {}

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

  // NICU Logic: Separation of Mother and Newborn with Guarantor Fallback
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
