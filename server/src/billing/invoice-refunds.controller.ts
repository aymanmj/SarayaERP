import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  Equals,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { InvoiceRefundsService } from './invoice-refunds.service';
class RefundRequestDto {
  @IsInt() @Min(1) adjustmentId: number;
  @IsInt() @Min(1) paymentId: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount: string;
  @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @IsUUID() requestId: string;
}
class ReviewRefundDto {
  @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}
class ExecuteRefundDto {
  @IsString() @MinLength(5) @MaxLength(200) reference: string;
  @IsString() @MinLength(5) @MaxLength(1000) evidence: string;
  @IsUUID() requestId: string;
  @Equals(true) confirmedPaid: boolean;
}
class PrepareRefundDto {
  @IsUUID() requestId: string;
}
class ReleaseRefundDto extends ReviewRefundDto {
  @Equals(true) confirmedNotPaid: boolean;
}
@Controller('billing/invoices/:invoiceId/refunds')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoiceRefundsController {
  constructor(private readonly service: InvoiceRefundsService) {}
  @Get()
  @Permissions(
    'billing:view',
    'cashier:view',
    'cashier:refunds:request',
    'cashier:refunds:approve',
    'cashier:refunds:execute',
  )
  list(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.list(user.hospitalId, invoiceId);
  }
  @Post()
  @Permissions('cashier:refunds:request')
  @AuditInTransaction()
  request(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Body() dto: RefundRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.request(user.hospitalId, invoiceId, user.sub, dto);
  }
  @Post(':id/approve')
  @Permissions('cashier:refunds:approve')
  @AuditInTransaction()
  approve(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.review(
      user.hospitalId,
      invoiceId,
      id,
      user.sub,
      'APPROVE',
      dto.reason,
    );
  }
  @Post(':id/reject')
  @Permissions('cashier:refunds:approve')
  @AuditInTransaction()
  reject(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.review(
      user.hospitalId,
      invoiceId,
      id,
      user.sub,
      'REJECT',
      dto.reason,
    );
  }
  @Post(':id/cancel')
  @Permissions('cashier:refunds:request')
  @AuditInTransaction()
  cancel(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.review(
      user.hospitalId,
      invoiceId,
      id,
      user.sub,
      'CANCEL',
      dto.reason,
    );
  }
  @Post(':id/prepare')
  @Permissions('cashier:refunds:execute')
  @AuditInTransaction()
  prepare(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrepareRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.prepare(
      user.hospitalId,
      invoiceId,
      id,
      user.sub,
      dto.requestId,
    );
  }
  @Post(':id/release')
  @Permissions('cashier:refunds:approve')
  @AuditInTransaction()
  release(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReleaseRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.release(
      user.hospitalId,
      invoiceId,
      id,
      user.sub,
      dto.reason,
      dto.confirmedNotPaid,
    );
  }
  @Post(':id/execute')
  @Permissions('cashier:refunds:execute')
  @AuditInTransaction()
  execute(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExecuteRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.execute(user.hospitalId, invoiceId, id, user.sub, dto);
  }
}
