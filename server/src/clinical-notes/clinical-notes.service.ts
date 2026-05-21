import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ClinicalNotesService {
  private readonly logger = new Logger(ClinicalNotesService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(
    userId: number,
    hospitalId: number,
    createClinicalNoteDto: CreateClinicalNoteDto,
  ) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: createClinicalNoteDto.encounterId, hospitalId },
    });
    if (!encounter)
      throw new ForbiddenException('Encounter not found or access denied');

    const note = await this.prisma.clinicalNote.create({
      data: {
        ...createClinicalNoteDto,
        content:
          createClinicalNoteDto.content !== undefined
            ? createClinicalNoteDto.content
            : null,
        createdById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
        signedBy: { select: { fullName: true } },
        coSignedBy: { select: { fullName: true } },
        appendages: true,
      },
    });

    // Phase 3: Smart Follow-up – إطلاق حدث عند وجود حقل Plan
    if (createClinicalNoteDto.plan && createClinicalNoteDto.plan.trim().length > 10) {
      this.logger.log(
        `📋 Plan field detected in note #${note.id} for encounter #${encounter.id}. Emitting follow-up extraction event.`,
      );
      this.eventEmitter.emit('clinical.note.plan_saved', {
        noteId: note.id,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        hospitalId,
        planText: createClinicalNoteDto.plan,
        createdById: userId,
      });
    }

    return note;
  }

  async findAllByEncounter(encounterId: number, hospitalId: number) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId },
    });
    if (!encounter)
      throw new ForbiddenException('Encounter not found or access denied');

    return this.prisma.clinicalNote.findMany({
      where: { encounterId },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        signedBy: { select: { id: true, fullName: true } },
        coSignedBy: { select: { id: true, fullName: true } },
        appendages: {
          include: {
            createdBy: { select: { id: true, fullName: true } },
            signedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async signNote(noteId: number, userId: number) {
    return this.prisma.clinicalNote.update({
      where: { id: noteId },
      data: {
        signedById: userId,
        signedAt: new Date(),
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        signedBy: { select: { id: true, fullName: true } },
        coSignedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async coSignNote(noteId: number, userId: number) {
    return this.prisma.clinicalNote.update({
      where: { id: noteId },
      data: {
        coSignedById: userId,
        coSignedAt: new Date(),
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        signedBy: { select: { id: true, fullName: true } },
        coSignedBy: { select: { id: true, fullName: true } },
      },
    });
  }
}
