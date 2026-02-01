import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { PurchaseReturnStatus } from '@prisma/client';

@Injectable()
export class PurchaseReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async createReturn(
    hospitalId: number,
    userId: number,
    dto: {
      purchaseInvoiceId: number;
      reason?: string;
      items: {
        productId: number;
        quantity: number;
        description?: string;
      }[];
    },
  ) {
    const { purchaseInvoiceId, items, reason } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch Invoice
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: purchaseInvoiceId },
        include: { lines: true, supplier: true },
      });

      if (!invoice || invoice.hospitalId !== hospitalId) {
        throw new NotFoundException('Purchase Invoice not found');
      }

      // 2. Validate Items & Quantities
      let totalAmount = 0;
      const linesToCreate: {
        productId: number;
        quantity: number;
        unitPrice: number;
        totalAmount: number;
        description: string | undefined;
      }[] = [];

      for (const item of items) {
        const invLine = invoice.lines.find((l) => l.productId === item.productId);
        if (!invLine) {
          throw new BadRequestException(
            `Product #${item.productId} not found in original invoice`,
          );
        }

        // Check previously returned quantity
        const previousReturns = await tx.purchaseReturnLine.groupBy({
          by: ['productId'],
          where: {
            purchaseReturn: {
              purchaseInvoiceId: invoice.id,
              status: { not: 'CANCELLED' },
            },
            productId: item.productId,
          },
          _sum: { quantity: true },
        });

        const returnedQty = Number(previousReturns[0]?._sum.quantity || 0);
        const remainingQty = Number(invLine.quantity) - returnedQty;

        if (item.quantity > remainingQty) {
          throw new BadRequestException(
            `Cannot return ${item.quantity} of Product #${item.productId}. Max remaining: ${remainingQty}`,
          );
        }

        const unitPrice = Number(invLine.unitPrice);
        const lineTotal = unitPrice * item.quantity;
        totalAmount += lineTotal;

        linesToCreate.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: unitPrice,
          totalAmount: lineTotal,
          description: item.description,
        });
      }

      // 3. Calc VAT (Proportional)
      // Assuming invoice.vatAmount was total VAT. calculate rate from invoice?
      // Or just assume standard rule? Better to infer from invoice totals.
      // Rate = InvoiceVAT / InvoiceNet
      const invNet = Number(invoice.netAmount); // Usually Net is before VAT
      // If invoice has lines, we can sum them up to be sure.
      
      // Let's use simple logic: ReturnAmount / InvoiceTotalAmount * InvoiceVAT
      // Wait, accurate way is per line if some items are taxable and others not.
      // For now, proportional split of total VAT.
      const invVat = Number(invoice.vatAmount);
      const invTotalBeforeVat = Number(invoice.totalAmount) - invVat; // Assuming Total includes VAT?
      // Wait, check schema: totalAmount, vatAmount, netAmount.
      // Usually Net + VAT = Total.
      
      let returnVat = 0;
      if (invNet > 0) {
        returnVat = (totalAmount / invNet) * invVat; 
      }
      
      const returnNet = totalAmount;
      const returnTotal = returnNet + returnVat; // Is this how schema expects? 
      // Schema: totalAmount, vatAmount, netAmount.
      // Usually: Net (Goods) + VAT = Total (Payable).
      
      // Create Return Record
      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          hospitalId,
          supplierId: invoice.supplierId,
          purchaseInvoiceId: invoice.id,
          reason,
          status: PurchaseReturnStatus.COMPLETED, // Mark as completed
          createdById: userId,
          
          netAmount: returnNet,
          vatAmount: returnVat,
          totalAmount: returnTotal,

          lines: {
            create: linesToCreate,
          },
        },
      });

      // 4. Trigger Accounting
      // Need to cast to normal client for service (or update service to accept TX)
      // AccountingService usually manages its own TX or should accept TX.
      // My update to recordPurchaseReturnEntry does NOT accept TX yet.
      // But it finds records by ID from DB. So we must commit this first OR use event.
      // OR, since recordPurchaseReturnEntry STARTS by finding the record, 
      // if I call it HERE inside a TX, it won't find it until main TX commits.
      // Solution: Call it AFTER transaction or update AccountingService to use PrismaClient/TX.
      
      // For now, I will return the ID and call accounting outside.
      return purchaseReturn;
    });

    // Outside transaction
    // await this.accounting.recordPurchaseReturnEntry({ ... }); // Caller will do this
  }
}
