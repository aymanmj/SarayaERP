
import { Controller, Get, Post, Body, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('clinical-notes')
@UseGuards(JwtAuthGuard)
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  @Post()
  create(@Request() req, @Body() createClinicalNoteDto: CreateClinicalNoteDto) {
    return this.clinicalNotesService.create(req.user.id, createClinicalNoteDto);
  }

  @Get('encounter/:id')
  findAllByEncounter(@Param('id', ParseIntPipe) id: number) {
    return this.clinicalNotesService.findAllByEncounter(id);
  }
}
