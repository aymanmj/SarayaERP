// src/billing/events/invoice-issued.event.ts

export class InvoiceIssuedEvent {
  constructor(
    public readonly invoiceId: number,
    public readonly hospitalId: number,
    public readonly userId: number,
    public readonly totalAmount: number,
    public readonly issuedAt: Date,
    public readonly patientShare: number,
    public readonly insuranceShare: number,
    public readonly insuranceProviderId?: number,
  ) {}
}
