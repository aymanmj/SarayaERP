// server/src/surgery/surgical-package.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { SurgicalPackageService } from './surgical-package.service';
import {
  CreateSurgicalPackageDto,
  EnrollEncounterPackageDto,
  GeneratePackageInvoiceDto,
  SettlePackageEnrollmentDto,
} from './dto/surgical-package.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('surgery/packages')
export class SurgicalPackageController {
  constructor(private readonly service: SurgicalPackageService) {}

  @Get()
  @Permissions('surgery:view', 'billing:view')
  listPackages(@CurrentUser() user: JwtPayload) {
    return this.service.listPackages(user.hospitalId);
  }

  @Post()
  @AuditInTransaction()
  @Permissions('surgery:manage', 'billing:manage')
  createPackage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSurgicalPackageDto,
  ) {
    return this.service.createPackage(user.hospitalId, user.sub, dto);
  }

  @Get('enrollments')
  @Permissions('surgery:view', 'billing:view')
  listEnrollments(
    @CurrentUser() user: JwtPayload,
    @Query('encounterId') encounterId?: string,
  ) {
    return this.service.listEnrollments(
      user.hospitalId,
      encounterId ? Number(encounterId) : undefined,
    );
  }

  @Post('enrollments')
  @AuditInTransaction()
  @Permissions('surgery:manage', 'billing:manage')
  enrollEncounter(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EnrollEncounterPackageDto,
  ) {
    return this.service.enrollEncounter(user.hospitalId, user.sub, dto);
  }

  @Get('enrollments/:id/preview')
  @Permissions('surgery:view', 'billing:view')
  previewReconciliation(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.previewReconciliation(user.hospitalId, id);
  }

  @Post('enrollments/:id/settle')
  @AuditInTransaction()
  @Permissions('surgery:manage', 'billing:manage')
  settleEnrollment(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SettlePackageEnrollmentDto,
  ) {
    return this.service.settleEnrollment(user.hospitalId, id, user.sub, dto);
  }

  @Post('enrollments/:id/generate-invoice')
  @AuditInTransaction()
  @Permissions('billing:manage', 'surgery:manage')
  generatePackageInvoice(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GeneratePackageInvoiceDto,
  ) {
    return this.service.generatePackageInvoice(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }

  @Get('enrollments/:id/verify')
  @Permissions('surgery:view', 'billing:view')
  verifyEnrollment(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.verifyEnrollment(user.hospitalId, id);
  }
}
