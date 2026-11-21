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
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { CashierSessionsService } from './cashier-sessions.service';
class SessionRequestDto {
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount: string;
  @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @IsUUID() requestId: string;
}
class SessionReasonDto {
  @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}
class SessionReviewDto extends SessionReasonDto {
  @IsString() @MinLength(5) @MaxLength(200) reference: string;
}
class SessionCountDto extends SessionReasonDto {
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount: string;
}
class CustodyCountDto extends SessionCountDto {
  @IsString() @MinLength(5) @MaxLength(200) reference: string;
  @Equals(true) confirmedCustody: boolean;
}
@Controller('cashier/cash-control')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashierSessionsController {
  constructor(private readonly service: CashierSessionsService) {}
  @Get()
  @Permissions('cashier:view', 'cashier:manage', 'cashier:sessions:approve')
  list(@CurrentUser() user: JwtPayload) {
    const all =
      user.roles?.includes('ADMIN') ||
      user.permissions?.includes('ADMIN_FULL_ACCESS') ||
      user.permissions?.includes('cashier:sessions:approve');
    return this.service.list(user.hospitalId, user.sub, !!all);
  }
  @Post()
  @Permissions('cashier:manage')
  @AuditInTransaction()
  request(@Body() dto: SessionRequestDto, @CurrentUser() user: JwtPayload) {
    return this.service.request(user.hospitalId, user.sub, dto);
  }
  @Post(':id/approve')
  @Permissions('cashier:sessions:approve')
  @AuditInTransaction()
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionReviewDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.review(
      user.hospitalId,
      id,
      user.sub,
      true,
      dto.reason,
      dto.reference,
    );
  }
  @Post(':id/reject')
  @Permissions('cashier:sessions:approve')
  @AuditInTransaction()
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionReviewDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.review(
      user.hospitalId,
      id,
      user.sub,
      false,
      dto.reason,
      dto.reference,
    );
  }
  @Post(':id/handovers')
  @Permissions('cashier:manage')
  @AuditInTransaction()
  handover(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.handover(user.hospitalId, id, user.sub, dto);
  }
  @Post(':id/handovers/:handoverId/approve')
  @Permissions('cashier:sessions:approve')
  @AuditInTransaction()
  approveHandover(
    @Param('id', ParseIntPipe) id: number,
    @Param('handoverId', ParseIntPipe) handoverId: number,
    @Body() dto: SessionReviewDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reviewHandover(
      user.hospitalId,
      id,
      handoverId,
      user.sub,
      true,
      dto.reason,
      dto.reference,
    );
  }
  @Post(':id/handovers/:handoverId/reject')
  @Permissions('cashier:sessions:approve')
  @AuditInTransaction()
  rejectHandover(
    @Param('id', ParseIntPipe) id: number,
    @Param('handoverId', ParseIntPipe) handoverId: number,
    @Body() dto: SessionReviewDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reviewHandover(
      user.hospitalId,
      id,
      handoverId,
      user.sub,
      false,
      dto.reason,
      dto.reference,
    );
  }
  @Post(':id/count')
  @Permissions('cashier:manage')
  @AuditInTransaction()
  count(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionCountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.count(
      user.hospitalId,
      id,
      user.sub,
      dto.amount,
      dto.reason,
    );
  }
  @Post(':id/custody-count')
  @Permissions('cashier:sessions:approve')
  @AuditInTransaction()
  custodyCount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CustodyCountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.custodyCount(user.hospitalId, id, user.sub, dto);
  }
  @Post(':id/reject-count')
  @Permissions('cashier:sessions:approve')
  @AuditInTransaction()
  rejectCount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionReasonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.rejectCount(user.hospitalId, id, user.sub, dto.reason);
  }
  @Post(':id/close')
  @Permissions('cashier:sessions:approve')
  @AuditInTransaction()
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionReasonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.close(user.hospitalId, id, user.sub, dto.reason);
  }
  @Post(':id/withdraw')
  @Permissions('cashier:manage', 'cashier:sessions:approve')
  @AuditInTransaction()
  withdraw(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionReasonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.withdraw(user.hospitalId, id, user.sub, dto.reason);
  }
}
