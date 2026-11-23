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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { RequireFeature } from '../licensing/license.decorator';
import { AuditInTransaction } from '../audit/audit.decorator';
import { CurrencyExchangeService } from './currency-exchange.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import {
  AutoMatchOptionsDto,
  ConvertCurrencyDto,
  CreateBankAccountDto,
  CreateCurrencyDto,
  CreateExchangeRateDto,
  CreateReconciliationSessionDto,
  ImportStatementItemsDto,
  ManualMatchStatementItemDto,
  PostBankAdjustmentDto,
} from './dto/treasury-fx.dto';

function extractAuditMeta(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined) || req.ip;
  return {
    ipAddress: ip,
    clientName: req.headers['user-agent']?.slice(0, 120),
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('ACCOUNTS')
@Controller('accounting/treasury')
export class TreasuryFxController {
  constructor(
    private readonly currencyExchange: CurrencyExchangeService,
    private readonly bankReconciliation: BankReconciliationService,
  ) {}

  // =========================================================
  // Currencies & Exchange Rates (DECIMAL 19,6)
  // =========================================================

  @Get('currencies')
  @Permissions('acc:treasury:view')
  listCurrencies(
    @CurrentUser() user: JwtPayload,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.currencyExchange.listCurrencies(
      user.hospitalId,
      includeInactive === 'true',
    );
  }

  @Post('currencies')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  createCurrency(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCurrencyDto,
    @Req() req: Request,
  ) {
    return this.currencyExchange.createCurrency(
      user.hospitalId,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Get('exchange-rates')
  @Permissions('acc:treasury:view')
  listExchangeRates(
    @CurrentUser() user: JwtPayload,
    @Query('fromCode') fromCode?: string,
    @Query('toCode') toCode?: string,
    @Query('verifiedOnly') verifiedOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.currencyExchange.listExchangeRates(user.hospitalId, {
      fromCode,
      toCode,
      verifiedOnly: verifiedOnly === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('exchange-rates')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  recordExchangeRate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateExchangeRateDto,
    @Req() req: Request,
  ) {
    return this.currencyExchange.recordExchangeRate(
      user.hospitalId,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Post('exchange-rates/:id/verify')
  @Permissions('acc:treasury:approve')
  @AuditInTransaction()
  verifyExchangeRate(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.currencyExchange.verifyExchangeRate(
      user.hospitalId,
      id,
      user.sub,
      extractAuditMeta(req),
    );
  }

  @Post('convert')
  @Permissions('acc:treasury:view')
  convertCurrency(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConvertCurrencyDto,
  ) {
    return this.currencyExchange.convertAmount(user.hospitalId, dto);
  }

  // =========================================================
  // Bank Accounts & General Bank Reconciliation
  // =========================================================

  @Get('bank-accounts')
  @Permissions('acc:treasury:view')
  listBankAccounts(@CurrentUser() user: JwtPayload) {
    return this.bankReconciliation.listBankAccounts(user.hospitalId);
  }

  @Post('bank-accounts')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  createBankAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBankAccountDto,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.createBankAccount(
      user.hospitalId,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Get('reconciliations')
  @Permissions('acc:treasury:view')
  listReconciliations(
    @CurrentUser() user: JwtPayload,
    @Query('bankAccountId') bankAccountId?: string,
  ) {
    return this.bankReconciliation.listReconciliationSessions(
      user.hospitalId,
      bankAccountId ? Number(bankAccountId) : undefined,
    );
  }

  @Post('reconciliations')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  createReconciliation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReconciliationSessionDto,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.createReconciliationSession(
      user.hospitalId,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Get('reconciliations/:id')
  @Permissions('acc:treasury:view')
  getReconciliation(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.bankReconciliation.getReconciliationSession(
      user.hospitalId,
      id,
    );
  }

  @Post('reconciliations/:id/items')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  importStatementItems(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ImportStatementItemsDto,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.importStatementItems(
      user.hospitalId,
      id,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Post('reconciliations/:id/auto-match')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  autoMatch(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AutoMatchOptionsDto,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.autoMatchStatementItems(
      user.hospitalId,
      id,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Post('reconciliations/items/:itemId/match')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  manualMatchItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: ManualMatchStatementItemDto,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.manualMatchStatementItem(
      user.hospitalId,
      itemId,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Post('reconciliations/items/:itemId/unmatch')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  unmatchItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.unmatchStatementItem(
      user.hospitalId,
      itemId,
      user.sub,
      extractAuditMeta(req),
    );
  }

  @Post('reconciliations/items/:itemId/adjust')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  postAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: PostBankAdjustmentDto,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.postStatementAdjustment(
      user.hospitalId,
      itemId,
      user.sub,
      dto,
      extractAuditMeta(req),
    );
  }

  @Post('reconciliations/:id/submit')
  @Permissions('acc:treasury:manage')
  @AuditInTransaction()
  submitReconciliation(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.submitReconciliationSession(
      user.hospitalId,
      id,
      user.sub,
      extractAuditMeta(req),
    );
  }

  @Post('reconciliations/:id/approve-close')
  @Permissions('acc:treasury:approve')
  @AuditInTransaction()
  approveAndClose(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.bankReconciliation.approveAndCloseReconciliationSession(
      user.hospitalId,
      id,
      user.sub,
      extractAuditMeta(req),
    );
  }
}
