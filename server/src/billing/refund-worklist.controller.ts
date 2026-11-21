import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { InvoiceRefundsService } from './invoice-refunds.service';
@Controller('cashier/refund-worklist')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RefundWorklistController {
  constructor(private readonly service: InvoiceRefundsService) {}
  @Get()
  @Permissions(
    'cashier:refunds:request',
    'cashier:refunds:approve',
    'cashier:refunds:execute',
  )
  list(@CurrentUser() user: JwtPayload) {
    return this.service.worklist(user.hospitalId);
  }
}
