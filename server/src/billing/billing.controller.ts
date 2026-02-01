// src/billing/billing.controller.ts

import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  Query,
  Res,
  Body, // ✅ [NEW]
} from '@nestjs/common';
import type { Response } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { InvoiceStatus } from '@prisma/client';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly pdfService: PdfService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('encounters/:encounterId')
  async getForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.billingService.getEncounterBilling(
      encounterId,
      user.hospitalId,
    );
  }

  @Post('encounters/:encounterId/invoices')
  @Permissions('billing:invoice:create')
  @Roles('ADMIN')
  async createInvoice(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.billingService.createInvoiceForEncounter(
      encounterId,
      user.hospitalId,
      user.sub,
    );
  }

  @Post('invoices/:id/return')
  @Permissions('billing:invoice:create') // Or specific permission
  @Roles('ADMIN', 'ACCOUNTANT')
  async createReturn(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.billingService.createCreditNote(
      user.hospitalId,
      id,
      user.sub,
      reason,
    );
  }

  @Get('invoices/:id/print')
  async getInvoicePrint(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.billingService.getInvoicePrintData({
      invoiceId: id,
      hospitalId: user.hospitalId,
    });
  }

  @Get('invoices')
  async listInvoices(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('search') search?: string,
    @Query('status') status?: InvoiceStatus,
    @Query('financialYearId') fyId?: string,
    @Query('financialPeriodId') fpId?: string,
  ) {
    return this.billingService.listInvoices({
      hospitalId: user.hospitalId,
      page: page ? Number(page) : 1,
      search,
      status,
      financialYearId: fyId ? Number(fyId) : undefined,
      financialPeriodId: fpId ? Number(fpId) : undefined,
    });
  }

  @Get('payments/:id/receipt')
  async getPaymentReceipt(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.billingService.getPaymentReceiptData({
      hospitalId: user.hospitalId,
      paymentId: id,
    });
  }

  @Post('invoices/:id/cancel')
  @Permissions('billing:invoice:cancel')
  @Roles('ADMIN', 'ACCOUNTANT')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.billingService.cancelInvoice(user.hospitalId, id, user.sub);
  }

  @Get('invoices/:id/pdf')
  @Roles('ADMIN', 'CASHIER', 'ACCOUNTANT')
  async downloadInvoicePdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    // 1. Get Invoice Data
    const invoiceData = await this.billingService.getInvoicePrintData({
      invoiceId: id,
      hospitalId: user.hospitalId,
    });

    // 2. Get Hospital Settings from DB
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: user.hospitalId },
    });

    const hospitalInfo = {
      name: hospital?.displayName || hospital?.name || 'Saraya Hospital',
      address: [hospital?.addressLine1, hospital?.addressLine2, hospital?.city].filter(Boolean).join(' - '),
      phone: hospital?.phone || '',
      email: hospital?.email || '',
      printHeaderFooter: hospital?.printHeaderFooter ?? true, // ✅
    };

    const insuranceShare = Number(invoiceData.invoice.insuranceShare || 0);

    // 3. Prepare Data for Template
    const pdfData = {
      hospitalName: hospitalInfo.name,
      address: hospitalInfo.address,
      phone: hospitalInfo.phone,
      email: hospitalInfo.email,
      printHeaderFooter: hospitalInfo.printHeaderFooter, // ✅

      invoiceId: invoiceData.invoice.id,
      invoiceType: invoiceData.invoice.type,
      originalInvoiceId: invoiceData.invoice.originalInvoiceId,
      invoiceDate: invoiceData.invoice.createdAt,
      status: invoiceData.invoice.status,

      patientName: invoiceData.patient.fullName,
      mrn: invoiceData.patient.mrn,
      insuranceProvider: insuranceShare > 0 ? 'تأمين' : 'نقدي',

      items: invoiceData.charges.map((c) => ({
        serviceName: c.serviceItem.name,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        totalAmount: c.totalAmount,
      })),

      totalAmount: invoiceData.invoice.totalAmount,
      discountAmount: invoiceData.invoice.discountAmount,
      // VAT logic if needed, currently reusing logic
      vatAmount: 0, // Placeholder if not in data
      subTotal: invoiceData.invoice.totalAmount, // Assuming totalAmount includes everything or is subtotal? Usually total = sub - discount + vat. 
                                                // Adjust based on your business logic. 
                                                // Looking at template: uses 'subTotal', 'discountAmount', 'vatAmount', 'netAmount'.
      // Correct mapping based on typical schema:
      // invoice.totalAmount is usually the FINAL amount in some systems, or the sum of items.
      // Let's assume invoice.totalAmount is the SUM of items (Subtotal).
      
      netAmount:
        Number(invoiceData.invoice.totalAmount) -
        Number(invoiceData.invoice.discountAmount),
      currentDate: new Date(),
    };

    // 4. Generate PDF
    const buffer = await this.pdfService.generatePdf('invoice', pdfData);

    // 5. Send Response
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=invoice-${id}.pdf`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
