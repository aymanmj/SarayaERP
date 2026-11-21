// src/cron/nightly-billing.service.ts

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { lockBedEncounter } from '../beds/bed-allocation';
import { pendingRoomCharges } from '../admission/room-charge';
import type { RoomAllocation } from '../admission/room-allocation';
import { PrismaService } from '../prisma/prisma.service';
import { EncounterType, EncounterStatus, ChargeSource } from '@prisma/client';

@Injectable()
export class NightlyBillingService {
  private readonly logger = new Logger(NightlyBillingService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_11PM)
  async scheduledBedCharges() {
    return this.runDailyBedCharges();
  }

  async runDailyBedCharges(hospitalId?: number) {
    const encounters = await this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        isDeleted: false,
        OR: [
          { bedAssignments: { some: { to: null } } },
          {
            admission: {
              is: {
                admissionStatus: {
                  in: ['ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING'],
                },
              },
            },
          },
        ],
      },
      select: { id: true, hospitalId: true },
    });
    let count = 0;
    let deferredCount = 0;
    const errors: string[] = [];
    for (const encounter of encounters) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            await lockBedEncounter(tx, encounter.hospitalId, encounter.id);
            const admission = await tx.admission.findFirst({
              where: {
                hospitalId: encounter.hospitalId,
                encounterId: encounter.id,
                admissionStatus: {
                  in: ['ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING'],
                },
              },
            });
            if (!admission)
              throw new BadRequestException(
                'توجد حالة تشغل سريرًا بلا سجل دخول نشط؛ يلزم استكمال بيانات الدخول قبل الفوترة',
              );
            const at = new Date();
            const plan = await pendingRoomCharges(
              tx,
              encounter.hospitalId,
              encounter.id,
              at,
            );
            if (plan.reviewReason)
              throw new BadRequestException(plan.reviewReason);
            let posted = 0;
            let deferred = 0;
            for (const charge of plan.charges) {
              // Invoice issuance handles legacy charges. Never freeze a partial/minimum day in a background job.
              const allocation = charge.roomAllocation as
                | RoomAllocation
                | undefined;
              if (
                !charge.roomBillingKey ||
                !allocation ||
                Date.parse(allocation.periodEnd) > at.getTime()
              ) {
                deferred++;
                continue;
              }
              await tx.encounterCharge.create({ data: charge });
              posted++;
            }
            return { posted, deferred };
          },
          { maxWait: 10000, timeout: 20000 },
        );
        count += result.posted;
        deferredCount += result.deferred;
      } catch (error) {
        const message =
          'Encounter #' +
          encounter.id +
          ': ' +
          (error instanceof Error ? error.message : 'Room billing failed');
        errors.push(message);
        this.logger.warn(message);
      }
    }
    await this.runVentilatorCharges(hospitalId);
    return {
      success: errors.length === 0,
      chargedCount: count,
      deferredCount,
      errors,
    };
  }

  private async runVentilatorCharges(hospitalId?: number) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const flowsheets = await this.prisma.iCUFlowsheet.findMany({
      where: {
        hospitalId,
        shiftDate: { gte: todayStart, lte: todayEnd },
        entries: { some: { ventilatorLog: { isNot: null } } },
        encounter: { status: EncounterStatus.OPEN, isDeleted: false },
      },
      select: { hospitalId: true, encounterId: true },
    });
    for (const flowsheet of flowsheets) {
      await this.prisma.$transaction(async (tx) => {
        await lockBedEncounter(tx, flowsheet.hospitalId, flowsheet.encounterId);
        const service = await tx.serviceItem.findFirst({
          where: {
            hospitalId: flowsheet.hospitalId,
            code: 'VENT-USAGE-DAY',
            isActive: true,
            isDeleted: false,
            isBillable: true,
          },
        });
        if (!service) return;
        const existing = await tx.encounterCharge.count({
          where: {
            hospitalId: flowsheet.hospitalId,
            encounterId: flowsheet.encounterId,
            serviceItemId: service.id,
            sourceType: ChargeSource.MANUAL,
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        });
        if (existing) return;
        await tx.encounterCharge.create({
          data: {
            hospitalId: flowsheet.hospitalId,
            encounterId: flowsheet.encounterId,
            serviceItemId: service.id,
            sourceType: ChargeSource.MANUAL,
            quantity: 1,
            unitPrice: service.defaultPrice,
            totalAmount: service.defaultPrice,
          },
        });
      });
    }
  }
}
