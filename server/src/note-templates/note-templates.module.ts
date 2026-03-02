// src/note-templates/note-templates.module.ts

import { Module } from '@nestjs/common';
import { NoteTemplatesService } from './note-templates.service';
import { NoteTemplatesController } from './note-templates.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NoteTemplatesController],
  providers: [NoteTemplatesService],
  exports: [NoteTemplatesService],
})
export class NoteTemplatesModule {}
