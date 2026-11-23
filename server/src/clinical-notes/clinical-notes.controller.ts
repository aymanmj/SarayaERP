import type { Request } from 'express';
import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';

@Controller('clinical-notes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  @Permissions('clinical-notes:manage')
  @AuditInTransaction()
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() createClinicalNoteDto: CreateClinicalNoteDto,
    @Req() req: Request,
  ) {
    return this.clinicalNotesService.create(
      user.sub,
      user.hospitalId,
      createClinicalNoteDto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Permissions('clinical-notes:view')
  @Get('encounter/:id')
  findAllByEncounter(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicalNotesService.findAllByEncounter(id, user.hospitalId);
  }

  @Permissions('clinical-notes:manage')
  @AuditInTransaction()
  @Patch(':id')
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() updateClinicalNoteDto: UpdateClinicalNoteDto,
    @Req() req: Request,
  ) {
    return this.clinicalNotesService.updateDraft(
      id,
      user.sub,
      user.hospitalId,
      updateClinicalNoteDto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Permissions('clinical-notes:manage')
  @AuditInTransaction()
  @Delete(':id')
  deleteDraft(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.clinicalNotesService.deleteDraft(
      id,
      user.sub,
      user.hospitalId,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Permissions('clinical-notes:manage')
  @AuditInTransaction()
  @Post(':id/sign')
  signNote(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.clinicalNotesService.signNote(id, user.sub, user.hospitalId, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Permissions('clinical-notes:cosign')
  @AuditInTransaction()
  @Post(':id/cosign')
  coSignNote(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.clinicalNotesService.coSignNote(id, user.sub, user.hospitalId, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Permissions('clinical-notes:view')
  @Get(':id/verify')
  verifyIntegrity(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicalNotesService.verifyIntegrity(id, user.hospitalId);
  }
}
