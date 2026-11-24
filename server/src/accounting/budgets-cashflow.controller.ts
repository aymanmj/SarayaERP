// server/src/accounting/budgets-cashflow.controller.ts
import {
  Body,
  Controller,
  Get,
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
import { BudgetsCashFlowService } from './budgets-cashflow.service';
import { UpsertBudgetLineDto } from './dto/budgets-cashflow.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('accounting/corporate')
export class BudgetsCashFlowController {
  constructor(private readonly service: BudgetsCashFlowService) {}

  @Get('budgets')
  @Permissions('accounting:view')
  listBudgetLines(
    @CurrentUser() user: JwtPayload,
    @Query('financialYearId', ParseIntPipe) financialYearId: number,
  ) {
    return this.service.listBudgetLines(user.hospitalId, financialYearId);
  }

  @Post('budgets')
  @AuditInTransaction()
  @Permissions('accounting:manage')
  upsertBudgetLine(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertBudgetLineDto,
  ) {
    return this.service.upsertBudgetLine(user.hospitalId, user.sub, dto);
  }

  @Get('budgets/vs-actual')
  @Permissions('accounting:view')
  getBudgetVsActual(
    @CurrentUser() user: JwtPayload,
    @Query('financialYearId', ParseIntPipe) financialYearId: number,
    @Query('costCenterId') costCenterId?: string,
  ) {
    return this.service.getBudgetVsActual(
      user.hospitalId,
      financialYearId,
      costCenterId ? Number(costCenterId) : undefined,
    );
  }

  @Get('cash-flow')
  @Permissions('accounting:view')
  getCashFlowStatement(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('costCenterId') costCenterId?: string,
  ) {
    return this.service.getCashFlowStatement(
      user.hospitalId,
      startDate,
      endDate,
      costCenterId ? Number(costCenterId) : undefined,
    );
  }

  @Get('tafqeet')
  @Permissions('accounting:view')
  tafqeet(
    @CurrentUser() _user: JwtPayload,
    @Query('amount') amount: string,
    @Query('currency') currency?: string,
  ) {
    return this.service.tafqeet(amount ?? '0', currency ?? 'LYD');
  }
}
