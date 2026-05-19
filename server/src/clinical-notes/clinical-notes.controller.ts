import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.type';

@Controller('clinical-notes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  @Permissions('clinical-notes:manage')
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() createClinicalNoteDto: CreateClinicalNoteDto,
  ) {
    return this.clinicalNotesService.create(user.sub, user.hospitalId, createClinicalNoteDto);
  }

  @Permissions('clinical-notes:view')
  @Get('encounter/:id')
  findAllByEncounter(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.clinicalNotesService.findAllByEncounter(id, user.hospitalId);
  }

  @Permissions('clinical-notes:manage')
  @Post(':id/sign')
  signNote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.clinicalNotesService.signNote(id, user.sub);
  }

  @Permissions('clinical-notes:manage')
  @Post(':id/cosign')
  coSignNote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.clinicalNotesService.coSignNote(id, user.sub);
  }
}
