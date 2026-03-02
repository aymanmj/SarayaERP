// src/note-templates/note-templates.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NoteType } from '@prisma/client';

@Injectable()
export class NoteTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(hospitalId: number, specialty?: string) {
    return this.prisma.clinicalNoteTemplate.findMany({
      where: {
        hospitalId,
        isActive: true,
        ...(specialty && { specialty }),
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(hospitalId: number, userId: number, data: {
    name: string;
    specialty?: string;
    noteType: NoteType;
    content: string;
  }) {
    return this.prisma.clinicalNoteTemplate.create({
      data: {
        hospitalId,
        createdById: userId,
        name: data.name,
        specialty: data.specialty || null,
        noteType: data.noteType,
        content: data.content,
      },
    });
  }

  async update(hospitalId: number, id: number, data: {
    name?: string;
    specialty?: string;
    noteType?: NoteType;
    content?: string;
    isActive?: boolean;
  }) {
    const template = await this.prisma.clinicalNoteTemplate.findFirst({
      where: { id, hospitalId },
    });
    if (!template) throw new NotFoundException('القالب غير موجود.');
    return this.prisma.clinicalNoteTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.specialty !== undefined && { specialty: data.specialty }),
        ...(data.noteType !== undefined && { noteType: data.noteType }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async remove(hospitalId: number, id: number) {
    const template = await this.prisma.clinicalNoteTemplate.findFirst({
      where: { id, hospitalId },
    });
    if (!template) throw new NotFoundException('القالب غير موجود.');
    return this.prisma.clinicalNoteTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
