
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
        createdById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
      }
    });
  }

  async findAllByEncounter(encounterId: number) {
    return this.prisma.clinicalNote.findMany({
      where: { encounterId },
      include: {
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
