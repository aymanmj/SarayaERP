// server/src/hr/hr-financial.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { HrFinancialService } from './hr-financial.service';
import {
  ApproveEmployeeAdvanceDto,
  ApproveOvertimeRequestDto,
  ApproveSettlementDto,
  CreateEmployeeAdvanceDto,
  CreateEmployeeDeductionDto,
  CreateEndOfServiceDto,
  CreateOvertimeRequestDto,
  CreateTaxBracketDto,
  PaySettlementDto,
  PreviewEndOfServiceDto,
  UpdateEmployeeCompensationDto,
  UpdateSettlementClearanceDto,
} from './dto/hr-financial.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('hr/financial')
export class HrFinancialController {
  constructor(private readonly service: HrFinancialService) {}

  // --- Pay Basis Classification (MONTHLY / HOURLY / FIXED_SHIFT) & Tax Brackets ---
  @Get('employees-compensation')
  @Permissions('hr:view', 'payroll:view')
  listEmployeesCompensation(@CurrentUser() user: JwtPayload) {
    return this.service.listEmployeesCompensation(user.hospitalId);
  }

  @Patch('employees/:userId/compensation')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  updateEmployeeCompensation(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateEmployeeCompensationDto,
  ) {
    return this.service.updateEmployeeCompensation(
      user.hospitalId,
      userId,
      user.sub,
      dto,
    );
  }

  @Get('tax-brackets')
  @Permissions('hr:view', 'payroll:view')
  listTaxBrackets(@CurrentUser() user: JwtPayload) {
    return this.service.listTaxBrackets(user.hospitalId);
  }

  @Post('tax-brackets')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  createTaxBracket(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTaxBracketDto,
  ) {
    return this.service.createTaxBracket(user.hospitalId, user.sub, dto);
  }

  @Patch('tax-brackets/:id/deactivate')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  deactivateTaxBracket(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deactivateTaxBracket(user.hospitalId, id, user.sub);
  }

  // --- Advances / Loans ---
  @Get('advances')
  @Permissions('hr:view', 'payroll:view')
  listAdvances(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listAdvances(
      user.hospitalId,
      userId ? Number(userId) : undefined,
      status,
    );
  }

  @Post('advances')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  createAdvance(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEmployeeAdvanceDto,
  ) {
    return this.service.createAdvance(user.hospitalId, user.sub, dto);
  }

  @Post('advances/:id/approve')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  approveAdvance(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveEmployeeAdvanceDto,
  ) {
    return this.service.approveAdvance(user.hospitalId, id, user.sub, dto);
  }

  @Post('advances/:id/reject')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  rejectAdvance(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body('notes') notes?: string,
  ) {
    return this.service.rejectAdvance(user.hospitalId, id, user.sub, notes);
  }

  // --- Recurring & One-Time Allowances / Deductions ---
  @Get('deductions')
  @Permissions('hr:view', 'payroll:view')
  listDeductions(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
    @Query('kind') kind?: string,
  ) {
    return this.service.listDeductions(
      user.hospitalId,
      userId ? Number(userId) : undefined,
      kind,
    );
  }

  @Post('deductions')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  createDeduction(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEmployeeDeductionDto,
  ) {
    return this.service.createDeduction(user.hospitalId, user.sub, dto);
  }

  @Patch('deductions/:id/deactivate')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  deactivateDeduction(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deactivateDeduction(user.hospitalId, id, user.sub);
  }

  // --- Overtime Requests ---
  @Get('overtime')
  @Permissions('hr:view', 'payroll:view')
  listOvertimes(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listOvertimes(
      user.hospitalId,
      userId ? Number(userId) : undefined,
      status,
    );
  }

  @Post('overtime')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  createOvertime(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOvertimeRequestDto,
  ) {
    return this.service.createOvertime(user.hospitalId, user.sub, dto);
  }

  @Post('overtime/:id/approve')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  approveOvertime(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveOvertimeRequestDto,
  ) {
    return this.service.approveOvertime(user.hospitalId, id, user.sub, dto);
  }

  // --- End-of-Service Settlements (EOS) ---
  @Post('settlements/preview')
  @Permissions('hr:view', 'payroll:view')
  previewSettlement(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PreviewEndOfServiceDto,
  ) {
    return this.service.previewSettlement(user.hospitalId, dto);
  }

  @Get('settlements')
  @Permissions('hr:view', 'payroll:view')
  listSettlements(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.service.listSettlements(user.hospitalId, status);
  }

  @Post('settlements')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  createSettlement(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEndOfServiceDto,
  ) {
    return this.service.createSettlement(user.hospitalId, user.sub, dto);
  }

  @Patch('settlements/:id/clearance')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  updateClearance(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSettlementClearanceDto,
  ) {
    return this.service.updateSettlementClearance(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }

  @Post('settlements/:id/approve')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  approveSettlement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveSettlementDto,
  ) {
    return this.service.approveAndExecuteSettlement(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }

  @Post('settlements/:id/pay')
  @AuditInTransaction()
  @Permissions('hr:manage', 'payroll:manage')
  paySettlement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaySettlementDto,
  ) {
    return this.service.paySettlement(user.hospitalId, id, user.sub, dto);
  }

  @Get('settlements/:id/verify')
  @Permissions('hr:view', 'payroll:view')
  verifySettlement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.verifySettlement(user.hospitalId, id);
  }
}
