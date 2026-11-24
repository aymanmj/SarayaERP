import type { Request } from 'express';
import {
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
import { BloodBankService } from './blood-bank.service';
import {
  BedsideVerifyStepDto,
  CompleteTransfusionDto,
  CreateBloodUnitDto,
  CreateCrossmatchDto,
  DiscardBloodUnitDto,
  RecordTransfusionVitalsDto,
  ReportTransfusionReactionDto,
  ScreenBloodUnitDto,
} from './dto/blood-bank.dto';

function auditMeta(req: Request) {
  return {
    ipAddress: req.ip,
    clientName: req.get('user-agent')?.slice(0, 120),
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('LAB')
@Controller('blood-bank')
export class BloodBankController {
  constructor(private readonly bloodBank: BloodBankService) {}

  // =========================================================
  // Inventory & Serology Screening
  // =========================================================

  @Get('inventory')
  @Permissions('blood-bank:view')
  listInventory(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('bloodGroup') bloodGroup?: string,
    @Query('componentType') componentType?: string,
  ) {
    return this.bloodBank.listInventory(user.hospitalId, {
      status,
      bloodGroup,
      componentType,
    });
  }

  @Post('units')
  @Permissions('blood-bank:inventory:manage')
  @AuditInTransaction()
  registerUnit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBloodUnitDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.registerBloodUnit(
      user.hospitalId,
      user.sub,
      dto,
      auditMeta(req),
    );
  }

  @Post('units/:id/screen')
  @Permissions('blood-bank:inventory:manage')
  @AuditInTransaction()
  screenUnit(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScreenBloodUnitDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.screenBloodUnit(
      user.hospitalId,
      id,
      user.sub,
      dto,
      auditMeta(req),
    );
  }

  @Post('units/:id/discard')
  @Permissions('blood-bank:inventory:manage')
  @AuditInTransaction()
  discardUnit(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiscardBloodUnitDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.discardBloodUnit(
      user.hospitalId,
      id,
      user.sub,
      dto,
      auditMeta(req),
    );
  }

  // =========================================================
  // Crossmatch & 4-Eyes Verification
  // =========================================================

  @Get('crossmatches')
  @Permissions('blood-bank:view')
  listCrossmatches(
    @CurrentUser() user: JwtPayload,
    @Query('encounterId') encounterId?: string,
  ) {
    return this.bloodBank.listCrossmatches(
      user.hospitalId,
      encounterId ? Number(encounterId) : undefined,
    );
  }

  @Post('crossmatches')
  @Permissions('blood-bank:crossmatch:manage')
  @AuditInTransaction()
  createCrossmatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCrossmatchDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.createCrossmatch(
      user.hospitalId,
      user.sub,
      dto,
      auditMeta(req),
    );
  }

  @Post('crossmatches/:id/verify')
  @Permissions('blood-bank:crossmatch:manage')
  @AuditInTransaction()
  verifyCrossmatch(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.bloodBank.verifyCrossmatch(
      user.hospitalId,
      id,
      user.sub,
      auditMeta(req),
    );
  }

  @Post('crossmatches/:id/issue')
  @Permissions('blood-bank:crossmatch:manage')
  @AuditInTransaction()
  issueUnit(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.bloodBank.issueBloodUnit(
      user.hospitalId,
      id,
      user.sub,
      auditMeta(req),
    );
  }

  // =========================================================
  // Transfusion Safety (Bedside Dual-Check, Vitals, Reactions)
  // =========================================================

  @Get('transfusions')
  @Permissions('blood-bank:view')
  listTransfusions(
    @CurrentUser() user: JwtPayload,
    @Query('encounterId') encounterId?: string,
  ) {
    return this.bloodBank.listTransfusions(
      user.hospitalId,
      encounterId ? Number(encounterId) : undefined,
    );
  }

  @Post('transfusions/:id/bedside-verify')
  @Permissions('blood-bank:transfusion:manage')
  @AuditInTransaction()
  bedsideVerify(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BedsideVerifyStepDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.bedsideVerify(
      user.hospitalId,
      id,
      user.sub,
      dto,
      auditMeta(req),
    );
  }

  @Post('transfusions/:id/start')
  @Permissions('blood-bank:transfusion:manage')
  @AuditInTransaction()
  startTransfusion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.bloodBank.startTransfusion(
      user.hospitalId,
      id,
      user.sub,
      auditMeta(req),
    );
  }

  @Post('transfusions/:id/vitals')
  @Permissions('blood-bank:transfusion:manage')
  @AuditInTransaction()
  recordVitals(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordTransfusionVitalsDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.recordVitalsEvent(
      user.hospitalId,
      id,
      user.sub,
      dto,
      auditMeta(req),
    );
  }

  @Post('transfusions/:id/complete')
  @Permissions('blood-bank:transfusion:manage')
  @AuditInTransaction()
  completeTransfusion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteTransfusionDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.completeTransfusion(
      user.hospitalId,
      id,
      user.sub,
      dto,
      auditMeta(req),
    );
  }

  @Post('transfusions/:id/reaction')
  @Permissions('blood-bank:transfusion:manage')
  @AuditInTransaction()
  reportReaction(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReportTransfusionReactionDto,
    @Req() req: Request,
  ) {
    return this.bloodBank.reportTransfusionReaction(
      user.hospitalId,
      id,
      user.sub,
      dto,
      auditMeta(req),
    );
  }
}
