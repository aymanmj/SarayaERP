import {
  Body,
  Controller,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { PurchaseReturnsService } from './purchase-returns.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountingService } from '../accounting/accounting.service'; // Import needed to trigger accounting

@Controller('purchases/returns')
@UseGuards(JwtAuthGuard)
export class PurchaseReturnsController {
  constructor(
    private readonly service: PurchaseReturnsService,
    private readonly accounting: AccountingService,
  ) {}

  @Post()
  async create(@Request() req, @Body() dto: CreatePurchaseReturnDto) {
    const userId = req.user.id;
    const hospitalId = req.user.hospitalId;

    // 1. Create the Return record (Transaction inside service)
    const purchaseReturn = await this.service.createReturn(
      hospitalId,
      userId,
      dto,
    );

    // 2. Trigger Accounting Entry (After transaction commit)
    // We execute this asynchronously or await it depending on strictness. 
    // Usually, we want to ensure it happens, so await is safer for error reporting.
    try {
      await this.accounting.recordPurchaseReturnEntry({
        purchaseReturnId: purchaseReturn.id,
        hospitalId,
        userId,
      });
    } catch (error) {
      console.error('Failed to create accounting entry for return:', error);
      // We might want to return a warning, but the return itself is created.
    }

    return purchaseReturn;
  }
}
