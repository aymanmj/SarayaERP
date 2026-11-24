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
    if (this.running) return;
    const scope = process.env.RADIOLOGY_MWL_HOSPITAL_ID;
    const envStation = process.env.RADIOLOGY_MWL_STATION_AET;

    const scopesToSync: Array<{
      hospitalId: number;
      fallbackStationAet: string | null;
      stationByModality: Map<string, string>;
    }> = [];

    if (scope) {
      const hospitalId = Number(scope);
      if (
        !/^[1-9]\d*$/u.test(scope) ||
        hospitalId > 2_147_483_647 ||
        !envStation ||
        !/^[A-Z0-9_-]{1,16}$/u.test(envStation)
      ) {
        this.logger.error('Invalid DICOM worklist scope or station');
        return;
      }
      scopesToSync.push({
        hospitalId,
        fallbackStationAet: envStation,
        stationByModality: new Map(),
      });
    } else if (process.env.RADIOLOGY_ORTHANC_URL) {
      const dbStations = await this.prisma.radiologyStation.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { hospitalId: true, modality: true, stationAet: true },
      });
      if (dbStations.length === 0) return;
      const grouped = new Map<number, Map<string, string>>();
      for (const st of dbStations) {
        const modMap = grouped.get(st.hospitalId) ?? new Map<string, string>();
        const modKey = st.modality.toUpperCase();
        if (!modMap.has(modKey)) modMap.set(modKey, st.stationAet);
        grouped.set(st.hospitalId, modMap);
      }
      for (const [hospitalId, stationByModality] of grouped.entries()) {
        scopesToSync.push({
          hospitalId,
          fallbackStationAet: null,
          stationByModality,
        });
      }
    } else {
      return;
    }

    this.running = true;
    try {
      const archive = orthancConfig();
      for (const target of scopesToSync) {
        await this.synchronizeHospital(archive, target);
      }
    } catch {
      this.logger.error(
        'DICOM worklist synchronization unavailable; will retry',
      );
    } finally {
      this.running = false;
    }
  }

  private async synchronizeHospital(
    archive: { base: string; authorization: string },
    target: {
      hospitalId: number;
      fallbackStationAet: string | null;
      stationByModality: Map<string, string>;
    },
  ) {
    const { hospitalId, fallbackStationAet, stationByModality } = target;
    const allowedModalities = fallbackStationAet
      ? [...xrayModalities]
      : [...stationByModality.keys()];
    if (allowedModalities.length === 0) return;

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
        modality: { in: allowedModalities, mode: 'insensitive' },
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
              station: { select: { stationAet: true, isActive: true } },
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
          const modalityUpper = exam?.study.modality?.toUpperCase() ?? '';
          const resolvedStation =
            (exam?.station?.isActive ? exam.station.stationAet : null) ??
            stationByModality.get(modalityUpper) ??
            fallbackStationAet;
          if (exam && resolvedStation) {
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
                    Modality: modalityUpper,
                    ScheduledStationAETitle: resolvedStation,
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
            data: {
              dicomMwlMayExist: Boolean(exam && resolvedStation),
              dicomMwlCheckedAt: new Date(),
            },
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
  }
}
