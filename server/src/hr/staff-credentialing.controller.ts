import type { Request } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
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
import { StaffCredentialingService } from './staff-credentialing.service';
import {
  CreateStaffCredentialDto,
  SuspendStaffCredentialDto,
} from './dto/staff-credential.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('hr/credentials')
@RequireFeature('HR')
export class StaffCredentialingController {
  constructor(
    private readonly credentialingService: StaffCredentialingService,
  ) {}

  @Get()
  @Permissions('hr:credentials:view', 'hr:view')
  listCredentials(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
    @Query('staffCategory') staffCategory?: string,
    @Query('credentialType') credentialType?: string,
    @Query('complianceStatus') complianceStatus?: string,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (
      userId &&
      (!Number.isInteger(parsedUserId) || (parsedUserId ?? 0) <= 0)
    ) {
      throw new BadRequestException('معرّف الموظف غير صالح');
    }
    return this.credentialingService.listCredentials(user.hospitalId, {
      userId: parsedUserId,
      staffCategory,
      credentialType,
      complianceStatus,
    });
  }

  @Get('alerts')
  @Permissions('hr:credentials:view', 'hr:view')
  getComplianceAlerts(@CurrentUser() user: JwtPayload) {
    return this.credentialingService.getComplianceAlerts(user.hospitalId);
  }

  @Get('staff/:userId/eligibility')
  @Permissions('hr:credentials:view', 'hr:view')
  checkEligibility(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('date') dateStr?: string,
  ) {
    let asOfDate: Date | undefined;
    if (dateStr) {
      asOfDate = new Date(dateStr);
      if (Number.isNaN(asOfDate.getTime())) {
        throw new BadRequestException('تاريخ التحقق غير صالح');
      }
    }
    return this.credentialingService.checkEligibility(
      user.hospitalId,
      userId,
      asOfDate,
    );
  }

  @Post()
  @Permissions('hr:credentials:manage', 'hr:manage')
  @AuditInTransaction()
  createCredential(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStaffCredentialDto,
    @Req() req: Request,
  ) {
    return this.credentialingService.createCredential(
      user.hospitalId,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Post(':id/verify')
  @Permissions('hr:credentials:verify')
  @AuditInTransaction()
  verifyCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.credentialingService.verifyCredential(
      user.hospitalId,
      id,
      user.sub,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Post(':id/suspend')
  @Permissions('hr:credentials:verify')
  @AuditInTransaction()
  suspendCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuspendStaffCredentialDto,
    @Req() req: Request,
  ) {
    return this.credentialingService.suspendOrRevokeCredential(
      user.hospitalId,
      id,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Post(':id/reinstate')
  @Permissions('hr:credentials:verify')
  @AuditInTransaction()
  reinstateCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.credentialingService.reinstateCredential(
      user.hospitalId,
      id,
      user.sub,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }
}
