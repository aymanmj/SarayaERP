import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { PurchaseReturnsService } from './purchase-returns.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccountingService } from '../accounting/accounting.service';

@Controller('purchases/returns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseReturnsController {
  constructor(
    private readonly service: PurchaseReturnsService,
    private readonly accounting: AccountingService,
  ) {}

  @Permissions('purchases:manage')
  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreatePurchaseReturnDto) {
    const userId = user.sub;
    const hospitalId = user.hospitalId;

    const purchaseReturn = await this.service.createReturn(
      hospitalId,
      userId,
      dto,
    );

    try {
      await this.accounting.recordPurchaseReturnEntry({
        purchaseReturnId: purchaseReturn.id,
        hospitalId,
        userId,
      });
    } catch (error) {
      console.error('Failed to create accounting entry for return:', error);
    }

    return purchaseReturn;
  }
}

