import { Controller, Get, Post, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.type'; // Assuming this type exists or I can use any

@Controller('clinical-notes')
@UseGuards(JwtAuthGuard)
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() createClinicalNoteDto: CreateClinicalNoteDto) {
    // CurrentUser returns payload with sub as userId
    return this.clinicalNotesService.create(user.sub, createClinicalNoteDto);
  }

  @Get('encounter/:id')
  findAllByEncounter(@Param('id', ParseIntPipe) id: number) {
    return this.clinicalNotesService.findAllByEncounter(id);
  }
}
