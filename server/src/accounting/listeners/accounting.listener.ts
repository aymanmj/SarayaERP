import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InvoiceIssuedEvent } from '../../billing/events/invoice-issued.event';
/** Issuance posts the journal inside BillingService's transaction. Notifications must not post it again. */
@Injectable()
export class AccountingListener {
  private readonly logger = new Logger(AccountingListener.name);
  @OnEvent('invoice.issued')
  handleInvoiceIssuedEvent(event: InvoiceIssuedEvent) {
    this.logger.debug(
      `Invoice ${event.invoiceId} issued; financial posting belongs to its issuance transaction`,
    );
  }
}
