import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Agent, fetch as undiciFetch, type RequestInit } from 'undici';
import { PrismaService } from '../prisma/prisma.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { lockRadiologyExecution } from './radiology-release';

type DicomMetadata = Record<string, { Value?: unknown[] }>;
export const xrayModalities = new Set(['DX', 'CR']);
const archiveDispatcher = new Agent();

export function fetchOrthanc(url: string, options: RequestInit) {
  // Keep imaging traffic on the configured PACS route, outside the global Internet proxy.
  return undiciFetch(url, { ...options, dispatcher: archiveDispatcher });
}

export function dicomAccession(hospitalId: number, id: number) {
  return `S${hospitalId.toString(36)}-${id.toString(36)}`.toUpperCase();
}

export function mwlStudyUid(id: string) {
  return `2.25.${BigInt(`0x${id.replaceAll('-', '')}`)}`;
}

async function loadPacsExam(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  id: number,
) {
  const exam = await tx.radiologyOrder.findFirst({
    where: {
      id,
      study: { hospitalId, isDeleted: false },
      order: {
        hospitalId,
        encounter: {
          hospitalId,
          isDeleted: false,
          patient: { hospitalId, isDeleted: false },
        },
      },
    },
    select: {
      status: true,
      dicomAccessionNumber: true,
      dicomStudyUid: true,
      dicomMwlId: true,
      study: { select: { modality: true, name: true } },
      order: {
        select: {
          encounter: {
            select: { patient: { select: { mrn: true, fullName: true } } },
          },
        },
      },
    },
  });
  if (!exam)
    throw new NotFoundException('مراجع طلب الأشعة غير متاحة في المنشأة');
  return exam;
}

export function orthancConfig() {
  const base = process.env.RADIOLOGY_ORTHANC_URL;
  const username = process.env.RADIOLOGY_ORTHANC_USERNAME;
  const password = process.env.RADIOLOGY_ORTHANC_PASSWORD;
  if (!base || !username || !password)
    throw new ServiceUnavailableException('تكامل أرشيف الأشعة غير مهيأ');
  if (!URL.canParse(base))
    throw new ServiceUnavailableException('إعداد أرشيف الأشعة غير صالح');
  const url = new URL(base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ServiceUnavailableException('إعداد أرشيف الأشعة غير صالح');
  return {
    base: url.href.replace(/\/+$/, ''),
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}

@Injectable()
export class RadiologyPacsService {
  constructor(private readonly prisma: PrismaService) {}

  async prepareWorklist(hospitalId: number, id: number) {
    orthancConfig();
    return this.prisma.$transaction(async (tx) => {
      await lockRadiologyExecution(tx, hospitalId, id);
      const exam = await loadPacsExam(tx, hospitalId, id);
      const modality = exam.study.modality?.toUpperCase() ?? '';
      if (!xrayModalities.has(modality))
        throw new BadRequestException(
          'قائمة التكامل الحالية للأشعة العامة DX وCR',
        );
      if (exam.dicomStudyUid || exam.status === 'COMPLETED')
        throw new ConflictException('للطلب دراسة مرتبطة أو نتيجة مكتملة');
      const accession =
        exam.dicomAccessionNumber ?? dicomAccession(hospitalId, id);
      if (!exam.dicomAccessionNumber) {
        await tx.radiologyOrder.update({
          where: { id },
          data: { dicomAccessionNumber: accession },
        });
      }
      return {
        PatientID: exam.order.encounter.patient.mrn,
        PatientName: exam.order.encounter.patient.fullName,
        ...(exam.dicomMwlId && {
          StudyInstanceUID: mwlStudyUid(exam.dicomMwlId),
        }),
        AccessionNumber: accession,
        RequestedProcedureID: accession,
        RequestedProcedureDescription: exam.study.name,
        ScheduledProcedureStepSequence: [
          {
            Modality: modality,
            ScheduledProcedureStepID: accession,
            ScheduledProcedureStepDescription: exam.study.name,
          },
        ],
      };
    });
  }

  async linkStudy(
    hospitalId: number,
    id: number,
    actorId: number,
    uid: string,
  ) {
    if (
      !uid ||
      uid.length > 64 ||
      !/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))+$/u.test(uid)
    )
      throw new BadRequestException('معرّف دراسة DICOM غير صالح');
    const { base, authorization } = orthancConfig();
    // Resolve only an eligible order before contacting the configured archive.
    const eligible = await this.prisma.$transaction(async (tx) => {
      await lockRadiologyExecution(tx, hospitalId, id);
      const exam = await loadPacsExam(tx, hospitalId, id);
      if (
        !exam.dicomAccessionNumber ||
        (!exam.dicomStudyUid && exam.status !== 'IN_PROGRESS')
      )
        throw new BadRequestException(
          'يلزم تأهيل الطلب وبدء الفحص قبل ربط الدراسة',
        );
      if (exam.dicomStudyUid && exam.dicomStudyUid !== uid)
        throw new ConflictException('ترتبط بالطلب دراسة أخرى');
      if (exam.dicomMwlId && mwlStudyUid(exam.dicomMwlId) !== uid)
        throw new BadRequestException('معرّف الدراسة لا يطابق قائمة الجهاز');
      return exam.dicomStudyUid;
    });
    if (eligible) return { studyInstanceUid: eligible };

    let metadata: unknown;
    try {
      const response = await fetchOrthanc(
        `${base}/dicom-web/studies/${uid}/metadata`,
        {
          headers: { authorization, accept: 'application/dicom+json' },
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        },
      );
      if (response.status === 404)
        throw new BadRequestException('الدراسة غير موجودة في الأرشيف');
      if (!response.ok) throw new Error('Archive response failed');
      metadata = await response.json();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadGatewayException('تعذر التحقق من دراسة الأرشيف');
    }
    if (!Array.isArray(metadata) || !metadata.length || metadata.length > 128)
      throw new BadRequestException(
        'دراسة الأشعة العامة فارغة أو خارج نطاق الربط الحالي',
      );
    const verifiedInstances = metadata as DicomMetadata[];
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockRadiologyExecution(tx, hospitalId, id);
        const exam = await loadPacsExam(tx, hospitalId, id);
        if (exam.dicomStudyUid === uid) return { studyInstanceUid: uid };
        if (exam.dicomStudyUid)
          throw new ConflictException('ترتبط بالطلب دراسة أخرى');
        if (exam.status !== 'IN_PROGRESS' || !exam.dicomAccessionNumber)
          throw new BadRequestException('الطلب غير متاح لربط الدراسة');
        if (exam.dicomMwlId && mwlStudyUid(exam.dicomMwlId) !== uid)
          throw new BadRequestException('معرّف الدراسة لا يطابق قائمة الجهاز');
        const mrn = exam.order.encounter.patient.mrn;
        const modality = exam.study.modality?.toUpperCase() ?? '';
        if (
          !xrayModalities.has(modality) ||
          !verifiedInstances.every(
            (instance) =>
              instance?.['0020000D']?.Value?.[0] === uid &&
              instance?.['00080050']?.Value?.[0] ===
                exam.dicomAccessionNumber &&
              instance?.['00100020']?.Value?.[0] === mrn &&
              instance?.['00080060']?.Value?.[0] === modality,
          )
        )
          throw new BadRequestException(
            'الدراسة لا تطابق هوية المريض أو رقم الطلب أو نوع الفحص',
          );
        await tx.radiologyOrder.update({
          where: { id },
          data: { dicomStudyUid: uid },
        });
        await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: actorId,
          action: 'RADIOLOGY_DICOM_STUDY_LINKED',
          entity: 'RadiologyOrder',
          entityId: id,
          details: {
            studyInstanceUid: uid,
            accessionNumber: exam.dicomAccessionNumber,
          },
        });
        return { studyInstanceUid: uid };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('الدراسة مرتبطة بطلب آخر');
      throw error;
    }
  }
}
