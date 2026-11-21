import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuditInTransaction } from '../audit/audit.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequireFeature } from '../licensing/license.decorator';
import { RadiologyPacsService } from './radiology-pacs.service';

class LinkDicomStudyDto {
  @IsString()
  studyInstanceUid!: string;
}

@Controller('radiology/orders')
@RequireFeature('RADIOLOGY')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RadiologyPacsController {
  constructor(private readonly pacs: RadiologyPacsService) {}

  @Post(':id/dicom-worklist')
  @Permissions('radiology:manage')
  prepare(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pacs.prepareWorklist(user.hospitalId, id);
  }

  @Post(':id/dicom-study')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  link(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() body: LinkDicomStudyDto,
  ) {
    return this.pacs.linkStudy(
      user.hospitalId,
      id,
      user.sub,
      body.studyInstanceUid,
    );
  }
}
