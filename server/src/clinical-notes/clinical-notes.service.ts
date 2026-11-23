import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { NoteType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';

export interface ClinicalNoteAuditMeta {
  ipAddress?: string;
  clientName?: string;
}

interface SignableClinicalNotePayload {
  id: number;
  encounterId: number;
  type: NoteType;
  content: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  isAddendum: boolean;
  parentNoteId: number | null;
  addendumReason: string | null;
  shiftId: number | null;
  createdById: number;
  signedById: number;
  signedAt: Date;
}

const NOTE_USER_SELECT = { id: true, fullName: true } as const;

const NOTE_DETAIL_INCLUDE = {
  createdBy: { select: NOTE_USER_SELECT },
  signedBy: { select: NOTE_USER_SELECT },
  coSignedBy: { select: NOTE_USER_SELECT },
  appendages: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      createdBy: { select: NOTE_USER_SELECT },
      signedBy: { select: NOTE_USER_SELECT },
      coSignedBy: { select: NOTE_USER_SELECT },
    },
  },
};

export function hasClinicalNoteContent(fields: {
  content?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
}): boolean {
  return [
    fields.content,
    fields.subjective,
    fields.objective,
    fields.assessment,
    fields.plan,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

export function computeClinicalNoteSignatureHash(
  payload: SignableClinicalNotePayload,
): string {
  const canonical = JSON.stringify({
    v: 1,
    id: payload.id,
    encounterId: payload.encounterId,
    type: payload.type,
    content: payload.content ?? null,
    subjective: payload.subjective ?? null,
    objective: payload.objective ?? null,
    assessment: payload.assessment ?? null,
    plan: payload.plan ?? null,
    isAddendum: payload.isAddendum,
    parentNoteId: payload.parentNoteId ?? null,
    addendumReason: payload.addendumReason ?? null,
    shiftId: payload.shiftId ?? null,
    createdById: payload.createdById,
    signedById: payload.signedById,
    signedAt: payload.signedAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function computeClinicalNoteCoSignatureHash(
  signatureHash: string,
  coSignedById: number,
  coSignedAt: Date,
): string {
  const canonical = JSON.stringify({
    v: 1,
    signatureHash,
    coSignedById,
    coSignedAt: coSignedAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

@Injectable()
export class ClinicalNotesService {
  private readonly logger = new Logger(ClinicalNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    userId: number,
    hospitalId: number,
    dto: CreateClinicalNoteDto,
    auditMeta?: ClinicalNoteAuditMeta,
  ) {
    if (!hasClinicalNoteContent(dto)) {
      throw new BadRequestException(
        'يجب إدخال محتوى للملاحظة السريرية قبل الحفظ',
      );
    }

    const isAddendum = Boolean(dto.isAddendum);
    if (isAddendum && !dto.parentNoteId) {
      throw new BadRequestException(
        'الملحق (Addendum) يتطلب تحديد الملاحظة الأصلية الموقّعة',
      );
    }
    if (!isAddendum && dto.parentNoteId) {
      throw new BadRequestException(
        'لا يمكن ربط ملاحظة بملاحظة أصلية دون تحديدها كملحق (isAddendum=true)',
      );
    }
    if (!isAddendum && dto.addendumReason) {
      throw new BadRequestException('سبب الملحق مخصص للملاحق السريرية فقط');
    }

    const normalizedReason =
      dto.addendumReason !== undefined && dto.addendumReason.trim().length > 0
        ? dto.addendumReason.trim()
        : null;

    const action = isAddendum
      ? 'CLINICAL_NOTE_ADDENDUM_CREATED'
      : 'CLINICAL_NOTE_CREATED';

    const { note, encounter } = await this.prisma.$transaction(async (tx) => {
      const encounterRecord = await tx.encounter.findFirst({
        where: { id: dto.encounterId, hospitalId, isDeleted: false },
        select: { id: true, patientId: true, hospitalId: true },
      });
      if (!encounterRecord) {
        throw new NotFoundException('الحالة غير موجودة في هذه المنشأة');
      }

      if (isAddendum && dto.parentNoteId) {
        await tx.$executeRaw`SELECT id FROM "ClinicalNote" WHERE id = ${dto.parentNoteId} FOR UPDATE`;
        const parent = await tx.clinicalNote.findFirst({
          where: {
            id: dto.parentNoteId,
            encounterId: encounterRecord.id,
            encounter: { hospitalId },
          },
          select: { id: true, signedAt: true, isAddendum: true },
        });
        if (!parent) {
          throw new NotFoundException(
            'الملاحظة الأصلية غير موجودة في هذه الحالة',
          );
        }
        if (!parent.signedAt) {
          throw new ConflictException(
            'لا يمكن إضافة ملحق قبل توقيع الملاحظة الأصلية إلكترونيًا',
          );
        }
        if (parent.isAddendum) {
          throw new BadRequestException(
            'لا يمكن ربط ملحق بملحق آخر؛ يرجى ربط الملحق بالملاحظة الأصلية الموقّعة',
          );
        }
      }

      const createdNote = await tx.clinicalNote.create({
        data: {
          encounterId: encounterRecord.id,
          type: dto.type ?? NoteType.NURSING_ROUTINE,
          content: dto.content !== undefined ? dto.content : null,
          subjective: dto.subjective !== undefined ? dto.subjective : null,
          objective: dto.objective !== undefined ? dto.objective : null,
          assessment: dto.assessment !== undefined ? dto.assessment : null,
          plan: dto.plan !== undefined ? dto.plan : null,
          isAddendum,
          parentNoteId: isAddendum ? (dto.parentNoteId ?? null) : null,
          addendumReason: isAddendum ? normalizedReason : null,
          shiftId: dto.shiftId ?? null,
          createdById: userId,
        },
        include: NOTE_DETAIL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action,
        entity: 'ClinicalNote',
        entityId: createdNote.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          encounterId: encounterRecord.id,
          type: createdNote.type,
          isAddendum: createdNote.isAddendum,
          parentNoteId: createdNote.parentNoteId,
          addendumReason: createdNote.addendumReason,
        },
      });

      return { note: createdNote, encounter: encounterRecord };
    });

    publishCommittedCriticalAudit({
      action,
      entity: 'ClinicalNote',
      entityId: note.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        encounterId: encounter.id,
        type: note.type,
        isAddendum: note.isAddendum,
        parentNoteId: note.parentNoteId,
      },
    });

    return note;
  }

  async findAllByEncounter(encounterId: number, hospitalId: number) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId, isDeleted: false },
      select: { id: true },
    });
    if (!encounter) {
      throw new NotFoundException('الحالة غير موجودة في هذه المنشأة');
    }

    return this.prisma.clinicalNote.findMany({
      where: { encounterId, isAddendum: false },
      include: NOTE_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDraft(
    noteId: number,
    userId: number,
    hospitalId: number,
    dto: UpdateClinicalNoteDto,
    auditMeta?: ClinicalNoteAuditMeta,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "ClinicalNote" WHERE id = ${noteId} FOR UPDATE`;
      const existing = await tx.clinicalNote.findUnique({
        where: { id: noteId },
        include: { encounter: { select: { hospitalId: true } } },
      });
      if (!existing || existing.encounter.hospitalId !== hospitalId) {
        throw new NotFoundException('الملاحظة السريرية غير موجودة');
      }
      if (existing.signedAt !== null) {
        throw new ConflictException(
          'لا يمكن تعديل الملاحظة السريرية بعد توقيعها؛ يرجى إضافة ملحق (Addendum)',
        );
      }
      if (existing.createdById !== userId) {
        throw new ForbiddenException(
          'فقط كاتب المسودة يمكنه تعديلها قبل التوقيع',
        );
      }
      if (dto.addendumReason !== undefined && !existing.isAddendum) {
        throw new BadRequestException('سبب الملحق مخصص للملاحق السريرية فقط');
      }

      const nextContent =
        dto.content !== undefined ? dto.content : existing.content;
      const nextSubjective =
        dto.subjective !== undefined ? dto.subjective : existing.subjective;
      const nextObjective =
        dto.objective !== undefined ? dto.objective : existing.objective;
      const nextAssessment =
        dto.assessment !== undefined ? dto.assessment : existing.assessment;
      const nextPlan = dto.plan !== undefined ? dto.plan : existing.plan;

      if (
        !hasClinicalNoteContent({
          content: nextContent,
          subjective: nextSubjective,
          objective: nextObjective,
          assessment: nextAssessment,
          plan: nextPlan,
        })
      ) {
        throw new BadRequestException(
          'يجب أن تحتوي الملاحظة السريرية على محتوى غير فارغ',
        );
      }

      const nextReason =
        dto.addendumReason !== undefined
          ? dto.addendumReason.trim().length > 0
            ? dto.addendumReason.trim()
            : null
          : existing.addendumReason;

      const saved = await tx.clinicalNote.update({
        where: { id: noteId },
        data: {
          type: dto.type ?? existing.type,
          content: nextContent,
          subjective: nextSubjective,
          objective: nextObjective,
          assessment: nextAssessment,
          plan: nextPlan,
          shiftId: dto.shiftId !== undefined ? dto.shiftId : existing.shiftId,
          addendumReason: existing.isAddendum ? nextReason : null,
        },
        include: NOTE_DETAIL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'CLINICAL_NOTE_DRAFT_UPDATED',
        entity: 'ClinicalNote',
        entityId: saved.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          encounterId: saved.encounterId,
          type: saved.type,
          isAddendum: saved.isAddendum,
        },
      });

      return saved;
    });

    publishCommittedCriticalAudit({
      action: 'CLINICAL_NOTE_DRAFT_UPDATED',
      entity: 'ClinicalNote',
      entityId: updated.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { encounterId: updated.encounterId },
    });

    return updated;
  }

  async deleteDraft(
    noteId: number,
    userId: number,
    hospitalId: number,
    auditMeta?: ClinicalNoteAuditMeta,
  ) {
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "ClinicalNote" WHERE id = ${noteId} FOR UPDATE`;
      const existing = await tx.clinicalNote.findUnique({
        where: { id: noteId },
        include: { encounter: { select: { hospitalId: true } } },
      });
      if (!existing || existing.encounter.hospitalId !== hospitalId) {
        throw new NotFoundException('الملاحظة السريرية غير موجودة');
      }
      if (existing.signedAt !== null) {
        throw new ConflictException(
          'لا يمكن حذف الملاحظة السريرية بعد توقيعها؛ السجل الطبي مقفل نهائيًا',
        );
      }
      if (existing.createdById !== userId) {
        throw new ForbiddenException(
          'فقط كاتب المسودة يمكنه حذفها قبل التوقيع',
        );
      }

      await tx.clinicalNote.delete({ where: { id: noteId } });

      await appendChainedAuditInTransaction(tx, {
        action: 'CLINICAL_NOTE_DRAFT_DELETED',
        entity: 'ClinicalNote',
        entityId: noteId,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          encounterId: existing.encounterId,
          isAddendum: existing.isAddendum,
          parentNoteId: existing.parentNoteId,
        },
      });

      return { deleted: true, id: noteId, encounterId: existing.encounterId };
    });

    publishCommittedCriticalAudit({
      action: 'CLINICAL_NOTE_DRAFT_DELETED',
      entity: 'ClinicalNote',
      entityId: deleted.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { encounterId: deleted.encounterId },
    });

    return deleted;
  }

  async signNote(
    noteId: number,
    userId: number,
    hospitalId: number,
    auditMeta?: ClinicalNoteAuditMeta,
  ) {
    const { signed, patientId } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "ClinicalNote" WHERE id = ${noteId} FOR UPDATE`;
      const existing = await tx.clinicalNote.findUnique({
        where: { id: noteId },
        include: {
          encounter: { select: { hospitalId: true, patientId: true } },
        },
      });
      if (!existing || existing.encounter.hospitalId !== hospitalId) {
        throw new NotFoundException('الملاحظة السريرية غير موجودة');
      }
      if (existing.signedAt !== null) {
        throw new ConflictException(
          'الملاحظة السريرية موقّعة مسبقًا ولا يمكن إعادة توقيعها',
        );
      }
      if (existing.createdById !== userId) {
        throw new ForbiddenException(
          'فقط كاتب الملاحظة يمكنه توقيعها توقيعًا إلكترونيًا أساسيًا',
        );
      }
      if (!hasClinicalNoteContent(existing)) {
        throw new BadRequestException(
          'لا يمكن توقيع ملاحظة سريرية فارغة المحتوى',
        );
      }

      const signedAt = new Date();
      const signatureHash = computeClinicalNoteSignatureHash({
        id: existing.id,
        encounterId: existing.encounterId,
        type: existing.type,
        content: existing.content,
        subjective: existing.subjective,
        objective: existing.objective,
        assessment: existing.assessment,
        plan: existing.plan,
        isAddendum: existing.isAddendum,
        parentNoteId: existing.parentNoteId,
        addendumReason: existing.addendumReason,
        shiftId: existing.shiftId,
        createdById: existing.createdById,
        signedById: userId,
        signedAt,
      });

      const saved = await tx.clinicalNote.update({
        where: { id: noteId },
        data: {
          signedById: userId,
          signedAt,
          signatureHash,
        },
        include: NOTE_DETAIL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'CLINICAL_NOTE_SIGNED',
        entity: 'ClinicalNote',
        entityId: saved.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          encounterId: saved.encounterId,
          isAddendum: saved.isAddendum,
          parentNoteId: saved.parentNoteId,
          signatureHash,
          signedAt: signedAt.toISOString(),
        },
      });

      return { signed: saved, patientId: existing.encounter.patientId };
    });

    publishCommittedCriticalAudit({
      action: 'CLINICAL_NOTE_SIGNED',
      entity: 'ClinicalNote',
      entityId: signed.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        encounterId: signed.encounterId,
        signatureHash: signed.signatureHash,
      },
    });

    // Smart Follow-up — emit only after physician electronically signs & locks the note
    if (signed.plan && signed.plan.trim().length > 10) {
      this.logger.log(
        `📋 Signed Plan field detected in note #${signed.id} for encounter #${signed.encounterId}. Emitting follow-up extraction event.`,
      );
      this.eventEmitter.emit('clinical.note.plan_saved', {
        noteId: signed.id,
        encounterId: signed.encounterId,
        patientId,
        hospitalId,
        planText: signed.plan,
        createdById: userId,
      });
    }

    return signed;
  }

  async coSignNote(
    noteId: number,
    userId: number,
    hospitalId: number,
    auditMeta?: ClinicalNoteAuditMeta,
  ) {
    const coSigned = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "ClinicalNote" WHERE id = ${noteId} FOR UPDATE`;
      const existing = await tx.clinicalNote.findUnique({
        where: { id: noteId },
        include: { encounter: { select: { hospitalId: true } } },
      });
      if (!existing || existing.encounter.hospitalId !== hospitalId) {
        throw new NotFoundException('الملاحظة السريرية غير موجودة');
      }
      if (
        !existing.signedAt ||
        !existing.signedById ||
        !existing.signatureHash
      ) {
        throw new BadRequestException(
          'لا يمكن التوقيع المشترك قبل التوقيع الأساسي للملاحظة السريرية',
        );
      }
      if (existing.coSignedAt !== null) {
        throw new ConflictException(
          'تم التوقيع المشترك على هذه الملاحظة السريرية مسبقًا',
        );
      }
      if (existing.signedById === userId) {
        throw new ForbiddenException(
          'لا يجوز لنفس الطبيب الموقّع إجراء التوقيع المشترك (يلزم طبيب مستقل)',
        );
      }

      const coSignedAt = new Date();
      const coSignatureHash = computeClinicalNoteCoSignatureHash(
        existing.signatureHash,
        userId,
        coSignedAt,
      );

      const saved = await tx.clinicalNote.update({
        where: { id: noteId },
        data: {
          coSignedById: userId,
          coSignedAt,
          coSignatureHash,
        },
        include: NOTE_DETAIL_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'CLINICAL_NOTE_COSIGNED',
        entity: 'ClinicalNote',
        entityId: saved.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          encounterId: saved.encounterId,
          signedById: existing.signedById,
          coSignatureHash,
          coSignedAt: coSignedAt.toISOString(),
        },
      });

      return saved;
    });

    publishCommittedCriticalAudit({
      action: 'CLINICAL_NOTE_COSIGNED',
      entity: 'ClinicalNote',
      entityId: coSigned.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        encounterId: coSigned.encounterId,
        coSignatureHash: coSigned.coSignatureHash,
      },
    });

    return coSigned;
  }

  async verifyIntegrity(noteId: number, hospitalId: number) {
    const note = await this.prisma.clinicalNote.findFirst({
      where: { id: noteId, encounter: { hospitalId } },
      include: {
        signedBy: { select: NOTE_USER_SELECT },
        coSignedBy: { select: NOTE_USER_SELECT },
      },
    });
    if (!note) {
      throw new NotFoundException('الملاحظة السريرية غير موجودة');
    }

    const isSigned = Boolean(note.signedAt && note.signedById);
    const isCoSigned = Boolean(note.coSignedAt && note.coSignedById);

    const expectedSignatureHash =
      isSigned && note.signedAt && note.signedById
        ? computeClinicalNoteSignatureHash({
            id: note.id,
            encounterId: note.encounterId,
            type: note.type,
            content: note.content,
            subjective: note.subjective,
            objective: note.objective,
            assessment: note.assessment,
            plan: note.plan,
            isAddendum: note.isAddendum,
            parentNoteId: note.parentNoteId,
            addendumReason: note.addendumReason,
            shiftId: note.shiftId,
            createdById: note.createdById,
            signedById: note.signedById,
            signedAt: note.signedAt,
          })
        : null;

    const signatureValid =
      isSigned &&
      Boolean(note.signatureHash) &&
      note.signatureHash === expectedSignatureHash;

    const expectedCoSignatureHash =
      isCoSigned && note.signatureHash && note.coSignedById && note.coSignedAt
        ? computeClinicalNoteCoSignatureHash(
            note.signatureHash,
            note.coSignedById,
            note.coSignedAt,
          )
        : null;

    const coSignatureValid = isCoSigned
      ? Boolean(note.coSignatureHash) &&
        note.coSignatureHash === expectedCoSignatureHash
      : null;

    const integrityVerified = isSigned
      ? signatureValid && (isCoSigned ? Boolean(coSignatureValid) : true)
      : false;

    return {
      noteId: note.id,
      encounterId: note.encounterId,
      isAddendum: note.isAddendum,
      isSigned,
      isCoSigned,
      signatureValid,
      coSignatureValid,
      integrityVerified,
      signedBy: note.signedBy,
      signedAt: note.signedAt,
      signatureHash: note.signatureHash,
      coSignedBy: note.coSignedBy,
      coSignedAt: note.coSignedAt,
      coSignatureHash: note.coSignatureHash,
    };
  }
}
