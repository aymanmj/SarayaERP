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
  IsBoolean,
  IsInt,
  IsOptional,
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
import { InvoiceAdjustmentsService } from './invoice-adjustments.service';

class RequestAdjustmentDto {
  @IsInt() @Min(1) chargeId: number;
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/)
  correctedAmount: string;
  @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @IsUUID() requestId: string;
  @IsOptional() @IsBoolean() insuranceOnly?: boolean;
  @IsOptional() @IsBoolean() partialDispense?: boolean;
}
class ReviewAdjustmentDto {
  @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}

@Controller('billing/invoices/:invoiceId/adjustments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoiceAdjustmentsController {
  constructor(private readonly service: InvoiceAdjustmentsService) {}
  @Get()
  @Permissions(
    'billing:view',
    'billing:manage',
    'billing:adjustments:request',
    'billing:adjustments:approve',
  )
  list(
    @Param('invoiceId', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.list(user.hospitalId, id);
  }
  @Post()
  @Permissions('billing:adjustments:request')
  @AuditInTransaction()
  request(
    @Param('invoiceId', ParseIntPipe) id: number,
    @Body() dto: RequestAdjustmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.request(user.hospitalId, id, user.sub, dto);
  }
  @Post(':id/approve')
  @Permissions('billing:adjustments:approve')
  @AuditInTransaction()
  approve(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAdjustmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.review(
      user.hospitalId,
      invoiceId,
      id,
      user.sub,
      'POST',
      dto.reason,
    );
  }
  @Post(':id/reject')
  @Permissions('billing:adjustments:approve')
  @AuditInTransaction()
  reject(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAdjustmentDto,
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
  @Permissions('billing:adjustments:request')
  @AuditInTransaction()
  cancel(
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAdjustmentDto,
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
}
