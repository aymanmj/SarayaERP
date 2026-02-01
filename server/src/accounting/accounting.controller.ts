// src/accounting/accounting.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Patch,
  Param,
  HttpCode,
  Logger,
  BadRequestException,
  NotFoundException,
  UseGuards,
  ParseIntPipe,
  Delete,
} from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { CostCentersService } from './cost-centers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AccountingSourceModule } from '@prisma/client';
// import { LedgerResponseDto } from './dto/ledger.dto';
import type { SaveOpeningBalancesDto } from './dto/opening-balance.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import type { CreateManualEntryDto } from './dto/manual-entry.dto';
import {
  CloseFinancialYearDto,
  CloseFinancialYearResultDto,
} from './dto/close-financial-year.dto';
import {
  JournalEntrySummaryDto,
  JournalEntryDetailDto,
} from './dto/journal-entry.dto';
import { RequireFeature } from '../licensing/license.decorator';

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiOk<T> | ApiErr;

type AccountLite = {
  id: number;
  code: string;
  name: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // ممكن تضيف ACCOUNTANT لاحقاً
@Controller('accounting')
@RequireFeature('ACCOUNTS')
export class AccountingController {
  private readonly logger = new Logger(AccountingController.name);

  constructor(
    private readonly accountingService: AccountingService,
    private readonly costCentersService: CostCentersService,
  ) {}

  @Get('entries')
  async listEntries(
    @CurrentUser() user: JwtPayload,

    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sourceModule') sourceModule?: AccountingSourceModule,

    @Query('limit') limitStr?: string,
    @Query('page') page?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? Number(limitStr) : 50;
    const offset = offsetStr ? Number(offsetStr) : 0;

    // 🔍 هنا نتأكد فعليًا من القيم
    this.logger.debug('Entries filters', {
      hospitalId: user.hospitalId,
      from,
      to,
      sourceModule,
      limit,
      offset,
    });

    return this.accountingService.listEntries({
      hospitalId: user.hospitalId,
      fromDate: from, // ⬅️ يروح للـ service بنفس الأسماء اللي ينتظرها
      toDate: to,
      sourceModule: sourceModule || undefined,
      limit,
    });
  }

  @Get('trial-balance')
  async getTrialBalance(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('costCenterId') costCenterId?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const ccId = costCenterId ? Number(costCenterId) : undefined;

    return this.accountingService.getTrialBalance({
      hospitalId: user.hospitalId,
      fromDate,
      toDate,
      costCenterId: ccId,
    });
  }

  @Get('income-statement')
  async getIncomeStatement(
    @CurrentUser() user: JwtPayload,
    @Query('financialYearId') financialYearId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fyId = financialYearId ? Number(financialYearId) : undefined;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    return this.accountingService.getIncomeStatement({
      hospitalId: user.hospitalId,
      financialYearId: fyId,
      fromDate,
      toDate,
    });
  }

  @Get('ledger')
  @Roles('ADMIN', 'ACCOUNTANT') // عدّل الأدوار حسب نظامك
  async getLedger(
    @CurrentUser() user: JwtPayload,
    @Query('accountId', ParseIntPipe) accountId: number,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ) {
    const hospitalId = user.hospitalId;

    if (!fromStr || !toStr) {
      throw new BadRequestException('يجب تحديد تاريخي البداية والنهاية.');
    }

    const from = new Date(fromStr + 'T00:00:00.000Z');
    const to = new Date(toStr + 'T23:59:59.999Z');

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('صيغة التاريخ غير صحيحة.');
    }

    return this.accountingService.getLedger(hospitalId, accountId, {
      from,
      to,
    });
  }

  @Get('accounts-lite')
  async listAccountsLite(@CurrentUser() user: JwtPayload) {
    return this.accountingService.listAccountsLite(user.hospitalId);
  }

  @Post('opening-balances')
  async saveOpeningBalances(@Req() req, @Body() dto: SaveOpeningBalancesDto) {
    const hospitalId = req.user.hospitalId as number;
    const userId = req.user.id as number;

    return this.accountingService.saveOpeningBalances({
      hospitalId,
      userId,
      dto,
    });
  }

  // ===== دليل الحسابات =====

  @Get('accounts')
  async listAccounts(@CurrentUser() user: JwtPayload) {
    return this.accountingService.listAccounts(user.hospitalId);
  }

  @Post('accounts')
  async createAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountingService.createAccount(user.hospitalId, dto);
  }

  @Patch('accounts/:id')
  async updateAccount(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountingService.updateAccount(user.hospitalId, id, dto);
  }

  @Patch('accounts/:id/toggle-active')
  async toggleAccountActive(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accountingService.toggleAccountActive(user.hospitalId, id);
  }

  @Post('manual-entry')
  async createManualEntry(@Req() req, @Body() dto: CreateManualEntryDto) {
    const hospitalId = req.user.hospitalId as number;
    const userId = req.user.id as number;

    return this.accountingService.createManualEntry({
      hospitalId,
      userId,
      dto,
    });
  }

  // ===== الميزانية العمومية =====
  @Get('balance-sheet')
  async getBalanceSheet(
    @CurrentUser() user: JwtPayload,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const date = asOfDate ? new Date(asOfDate) : new Date();
    return this.accountingService.getBalanceSheet(user.hospitalId, date);
  }

  @Get('patients-aging')
  async getPatientsAging(@Req() req: any) {
    const hospitalId = req.user.hospitalId as number;
    return this.accountingService.getPatientsReceivablesAging(hospitalId);
  }

  @Get('equity-accounts')
  @HttpCode(200)
  async listEquityAccounts(
    @Req() req: any,
  ): Promise<ApiResponse<AccountLite[]>> {
    const user = req.user;
    const hospitalId = user.hospitalId;

    const accounts =
      await this.accountingService.listEquityAccounts(hospitalId);

    const data: AccountLite[] = accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
    }));

    return { success: true, data };
  }

  @Get('financial-years/:id/pending-documents')
  async getPendingDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const documents =
      await this.accountingService.getPendingDocumentsForClosing(
        req.user.hospitalId,
        id,
      );
    return { success: true, data: documents };
  }

  @Post('financial-years/:id/close')
  @HttpCode(200)
  async closeFinancialYear(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CloseFinancialYearDto,
    @Req() req: any,
  ): Promise<ApiResponse<CloseFinancialYearResultDto>> {
    const user = req.user;
    const hospitalId = user.hospitalId;
    const userId = user.id;

    const result = await this.accountingService.closeFinancialYear(
      hospitalId,
      userId,
      id,
      body,
    );

    return {
      success: true,
      data: result,
    };
  }

  // توليد أرصدة افتتاحية تلقائياً للسنة المحددة
  @Post('financial-years/:id/generate-opening-from-last')
  @HttpCode(200)
  async generateOpeningFromLastClosedYear(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() body?: { entryDate?: string },
  ): Promise<ApiResponse<any>> {
    try {
      const user = req.user;
      const hospitalId = user.hospitalId as number;
      const userId = user.id as number;

      const result =
        await this.accountingService.generateOpeningBalancesFromLastClosedYear({
          hospitalId,
          userId,
          targetFinancialYearId: id,
          entryDate: body?.entryDate,
        });

      return {
        success: true,
        data: result,
      };
    } catch (err) {
      this.logger.error(
        'Error generating auto opening balances from last closed year',
        err,
      );
      return {
        success: false,
        error: {
          code: 'AUTO_OPENING_FAILED',
          message: 'فشل في توليد الأرصدة الافتتاحية تلقائيًا.',
        },
      };
    }
  }

  @Get('journal')
  @HttpCode(200)
  async listJournalEntries(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sourceModule') sourceModule?: AccountingSourceModule,
    @Query('userId') userId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ): Promise<ApiResponse<{ items: JournalEntrySummaryDto[]; total: number }>> {
    try {
      const hospitalId = req.user.hospitalId;

      const result = await this.accountingService.listJournalEntries(
        hospitalId,
        {
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          sourceModule: sourceModule || undefined,
          userId: userId ? Number(userId) : undefined,
          page: Number(page) || 1,
          pageSize: Number(pageSize) || 50,
        },
      );

      return { success: true, data: result };
    } catch (err) {
      this.logger.error('Error listing journal entries', err);
      return {
        success: false,
        error: {
          code: 'JOURNAL_LIST_FAILED',
          message: 'فشل في تحميل دفتر اليومية.',
        },
      };
    }
  }

  @Get('journal/:id')
  @HttpCode(200)
  async getJournalEntry(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<JournalEntryDetailDto>> {
    try {
      const hospitalId = req.user.hospitalId;
      const entry = await this.accountingService.getJournalEntry(
        hospitalId,
        id,
      );
      return { success: true, data: entry };
    } catch (err) {
      if (err instanceof NotFoundException) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'القيد المطلوب غير موجود.' },
        };
      }
      this.logger.error('Error loading journal entry', err);
      return {
        success: false,
        error: {
          code: 'JOURNAL_DETAIL_FAILED',
          message: 'فشل في تحميل تفاصيل القيد.',
        },
      };
    }
  }

  /**
   * حذف قيد محاسبي يدوي
   * (محمي بالتحقق من السنة ونوع القيد)
   */
  @Delete('entries/:id')
  @Roles('ADMIN')
  async deleteEntry(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    // الـ Controller يمرر الطلب للخدمة فقط
    return this.accountingService.deleteManualEntry(user.hospitalId, id);
  }

  @Get('cost-centers')
  async listCostCenters(@CurrentUser() user: JwtPayload) {
    return this.costCentersService.findAll(user.hospitalId);
  }

  @Post('cost-centers')
  @Roles('ADMIN', 'ACCOUNTANT')
  async createCostCenter(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.costCentersService.create(user.hospitalId, body);
  }
}
