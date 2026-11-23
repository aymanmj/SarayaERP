import type { Request } from 'express';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { RequireFeature } from '../licensing/license.decorator';
import { AuditInTransaction } from '../audit/audit.decorator';
import { LabSpecimenService } from './lab-specimen.service';
import {
  CollectSpecimenDto,
  ReceiveSpecimenDto,
  RejectSpecimenDto,
  UpdateSpecimenStatusDto,
  UpsertCultureReportDto,
} from './dto/lab-specimen.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lab/specimens')
@RequireFeature('LAB')
export class LabSpecimenController {
  constructor(private readonly specimenService: LabSpecimenService) {}

  @Post('collect')
  @Permissions('lab:specimens:collect', 'labs:manage')
  @AuditInTransaction()
  collect(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CollectSpecimenDto,
    @Req() req: Request,
  ) {
    return this.specimenService.collectSpecimen(
      user.hospitalId,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Get('barcode/:barcode')
  @Permissions('labs:view', 'lab:requests:view')
  findByBarcode(
    @CurrentUser() user: JwtPayload,
    @Param('barcode') barcode: string,
  ) {
    return this.specimenService.findByBarcode(user.hospitalId, barcode);
  }

  @Get('order/:labOrderId')
  @Permissions('labs:view', 'lab:requests:view')
  getOrderSpecimensAndCultures(
    @CurrentUser() user: JwtPayload,
    @Param('labOrderId', ParseIntPipe) labOrderId: number,
  ) {
    return this.specimenService.getOrderSpecimensAndCultures(
      user.hospitalId,
      labOrderId,
    );
  }

  @Post(':id/receive')
  @Permissions('lab:specimens:receive', 'labs:manage')
  @AuditInTransaction()
  receive(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReceiveSpecimenDto,
    @Req() req: Request,
  ) {
    return this.specimenService.receiveSpecimen(
      user.hospitalId,
      id,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Post(':id/reject')
  @Permissions('lab:specimens:receive', 'labs:manage')
  @AuditInTransaction()
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectSpecimenDto,
    @Req() req: Request,
  ) {
    return this.specimenService.rejectSpecimen(
      user.hospitalId,
      id,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Post(':id/status')
  @Permissions('lab:specimens:receive', 'labs:manage')
  @AuditInTransaction()
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpecimenStatusDto,
    @Req() req: Request,
  ) {
    return this.specimenService.updateSpecimenStatus(
      user.hospitalId,
      id,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Post('cultures')
  @Permissions('lab:results:enter', 'labs:manage')
  @AuditInTransaction()
  upsertCulture(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertCultureReportDto,
    @Req() req: Request,
  ) {
    return this.specimenService.upsertCultureReport(
      user.hospitalId,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Post('cultures/:id/verify')
  @Permissions('lab:results:verify')
  @AuditInTransaction()
  verifyCulture(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.specimenService.verifyCultureReport(
      user.hospitalId,
      id,
      user.sub,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }
}
