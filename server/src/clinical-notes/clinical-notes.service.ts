
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';

@Injectable()
export class ClinicalNotesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, createClinicalNoteDto: CreateClinicalNoteDto) {
    return this.prisma.clinicalNote.create({
      data: {
        ...createClinicalNoteDto,
        content: createClinicalNoteDto.content !== undefined ? createClinicalNoteDto.content : null,
        createdById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
        signedBy: { select: { fullName: true } },
        coSignedBy: { select: { fullName: true } },
        appendages: true,
      }
    });
  }

  async findAllByEncounter(encounterId: number) {
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
          }
        }
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
      }
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
      }
    });
  }
}
