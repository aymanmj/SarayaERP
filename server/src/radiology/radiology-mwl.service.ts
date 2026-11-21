import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, RadiologyStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { RequestInit } from 'undici';
import { TimeZoneUtils } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  dicomAccession,
  fetchOrthanc,
  mwlStudyUid,
  orthancConfig,
  xrayModalities,
} from './radiology-pacs.service';
import {
  lockRadiologyOrder,
  radiologyReleasedPaymentStatuses,
} from './radiology-release';

@Injectable()
export class RadiologyMwlService {
  private readonly logger = new Logger(RadiologyMwlService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval('radiology-mwl-reconcile', 10_000)
  async synchronize() {
    const scope = process.env.RADIOLOGY_MWL_HOSPITAL_ID;
    if (!scope || this.running) return;
    const hospitalId = Number(scope);
    const station = process.env.RADIOLOGY_MWL_STATION_AET;
    if (
      !/^[1-9]\d*$/u.test(scope) ||
      hospitalId > 2_147_483_647 ||
      !station ||
      !/^[A-Z0-9_-]{1,16}$/u.test(station)
    ) {
      this.logger.error('Invalid DICOM worklist scope or station');
      return;
    }
    this.running = true;
    try {
      const archive = orthancConfig();
      const eligible: Prisma.RadiologyOrderWhereInput = {
        status: {
          in: [
            RadiologyStatus.PENDING,
            RadiologyStatus.SCHEDULED,
            RadiologyStatus.IN_PROGRESS,
          ],
        },
        dicomStudyUid: null,
        study: {
          hospitalId,
          isDeleted: false,
          modality: { in: [...xrayModalities], mode: 'insensitive' },
        },
        order: {
          hospitalId,
          type: 'RADIOLOGY',
          isDeleted: false,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
          paymentStatus: { in: radiologyReleasedPaymentStatuses },
          encounter: {
            hospitalId,
            isDeleted: false,
            patient: { hospitalId, isDeleted: false },
          },
        },
      };
      const orders = await this.prisma.radiologyOrder.findMany({
        where: {
          order: { hospitalId, type: 'RADIOLOGY' },
          OR: [{ dicomMwlMayExist: true }, eligible],
        },
        select: { id: true },
        orderBy: [
          { dicomMwlCheckedAt: { sort: 'asc', nulls: 'first' } },
          { id: 'asc' },
        ],
        take: 8,
      });
      for (const { id } of orders) {
        try {
          // Commit the stable remote identifier before attempting any external write.
          await this.prisma.$transaction(async (tx) => {
            const locked = await lockRadiologyOrder(tx, hospitalId, id);
            if (!locked) return;
            const exam = await tx.radiologyOrder.findFirst({
              where: { id, ...eligible },
              select: { dicomMwlId: true, dicomMwlMayExist: true },
            });
            if (!exam || exam.dicomMwlMayExist) return;
            await tx.radiologyOrder.update({
              where: { id },
              data: {
                dicomMwlId: exam.dicomMwlId ?? randomUUID(),
                dicomMwlMayExist: true,
                dicomAccessionNumber:
                  locked.dicomAccessionNumber ?? dicomAccession(hospitalId, id),
              },
            });
          });

          await this.prisma.$transaction(async (tx) => {
            // Serialize archive writes with order release and with other workers.
            const locked = await lockRadiologyOrder(tx, hospitalId, id);
            if (!locked) return;
            const publication = await tx.radiologyOrder.findUniqueOrThrow({
              where: { id },
              select: { dicomMwlId: true, dicomMwlMayExist: true },
            });
            const { dicomMwlId } = publication;
            if (
              !publication.dicomMwlMayExist ||
              !dicomMwlId ||
              !locked.dicomAccessionNumber
            )
              return;
            const exam = await tx.radiologyOrder.findFirst({
              where: { id, ...eligible },
              select: {
                scheduledAt: true,
                study: { select: { name: true, modality: true } },
                order: {
                  select: {
                    createdAt: true,
                    hospital: {
                      select: { organization: { select: { timezone: true } } },
                    },
                    encounter: {
                      select: {
                        patient: { select: { mrn: true, fullName: true } },
                      },
                    },
                  },
                },
              },
            });
            const options: RequestInit = {
              method: 'DELETE',
              headers: {
                authorization: archive.authorization,
                'content-type': 'application/json',
              },
              redirect: 'error',
              signal: AbortSignal.timeout(2_500),
            };
            if (exam) {
              const parts = TimeZoneUtils.localParts(
                exam.scheduledAt ?? exam.order.createdAt,
                exam.order.hospital.organization?.timezone ?? undefined,
              );
              const format = (...values: number[]) =>
                values.map((value) => String(value).padStart(2, '0')).join('');
              const accession = locked.dicomAccessionNumber;
              const patient = exam.order.encounter.patient;
              options.method = 'PUT';
              options.body = JSON.stringify({
                Force: false,
                Tags: {
                  PatientID: patient.mrn,
                  PatientName: patient.fullName,
                  StudyInstanceUID: mwlStudyUid(dicomMwlId),
                  AccessionNumber: accession,
                  RequestedProcedureID: accession,
                  RequestedProcedureDescription: exam.study.name,
                  ScheduledProcedureStepSequence: [
                    {
                      Modality: exam.study.modality?.toUpperCase(),
                      ScheduledStationAETitle: station,
                      ScheduledProcedureStepID: accession,
                      ScheduledProcedureStepDescription: exam.study.name,
                      ScheduledProcedureStepStartDate: format(
                        parts.year,
                        parts.month,
                        parts.day,
                      ),
                      ScheduledProcedureStepStartTime: format(
                        parts.hour,
                        parts.minute,
                        parts.second,
                      ),
                    },
                  ],
                },
              });
            }
            const response = await fetchOrthanc(
              `${archive.base}/worklists/${dicomMwlId}`,
              options,
            );
            await response.body?.cancel();
            if (!response.ok && (exam || response.status !== 404))
              throw new Error(`Orthanc worklist HTTP ${response.status}`);
            await tx.radiologyOrder.update({
              where: { id },
              data: { dicomMwlMayExist: !!exam, dicomMwlCheckedAt: new Date() },
            });
          });
        } catch {
          this.logger.warn(
            `DICOM worklist synchronization failed for order ${id}; will retry`,
          );
          // Move this order behind other eligible orders even if the archive rejected the write.
          await this.prisma.radiologyOrder.updateMany({
            where: { id, order: { hospitalId } },
            data: { dicomMwlCheckedAt: new Date() },
          });
        }
      }
    } catch {
      this.logger.error(
        'DICOM worklist synchronization unavailable; will retry',
      );
    } finally {
      this.running = false;
    }
  }
}
