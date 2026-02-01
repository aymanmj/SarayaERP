// src/accounting/listeners/accounting.listener.ts

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting.service';
import { InvoiceIssuedEvent } from '../../billing/events/invoice-issued.event';
import { DispenseCompletedEvent } from '../../pharmacy/events/dispense-completed.event';

@Injectable()
export class AccountingListener {
  private readonly logger = new Logger(AccountingListener.name);

  constructor(private readonly accountingService: AccountingService) {}

  // 👇 هذا المستمع سيعمل تلقائياً عند إطلاق الحدث
  @OnEvent('invoice.issued', { async: true })
  async handleInvoiceIssuedEvent(event: InvoiceIssuedEvent) {
    this.logger.log(
      `Processing accounting entry for invoice #${event.invoiceId}`,
    );

    try {
      await this.accountingService.recordInvoiceEntry({
        invoiceId: event.invoiceId,
        hospitalId: event.hospitalId,
        userId: event.userId,
        // ✅ تمرير بيانات التقسيم الجديدة
        patientShare: event.patientShare,
        insuranceShare: event.insuranceShare,
        insuranceProviderId: event.insuranceProviderId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to create accounting entry for invoice #${event.invoiceId}`,
        err,
      );
    }
  }

  @OnEvent('pharmacy.dispense_completed', { async: true })
  async handleDispenseCompleted(event: DispenseCompletedEvent) {
    this.logger.log(
      `Processing COGS entry for Dispense #${event.dispenseRecordId}`,
    );

    try {
      await this.accountingService.recordCogsEntry({
        sourceId: event.dispenseRecordId,
        hospitalId: event.hospitalId,
        userId: event.userId,
        totalCost: event.totalCost,
        module: 'PHARMACY', // لتمييز مصدر التكلفة
      });
    } catch (err) {
      this.logger.error('Failed to record COGS entry', err);
    }
  }
}
