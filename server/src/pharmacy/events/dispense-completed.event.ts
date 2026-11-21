/** Best-effort UI refresh after commit; never an accounting posting command. */
export class DispenseCompletedEvent {
  constructor(
    public readonly dispenseRecordId: number,
    public readonly hospitalId: number,
    public readonly userId: number,
    public readonly partialClosureInvoiceId?: number,
  ) {}
}
