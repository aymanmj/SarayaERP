export class LabOrderStartedEvent {
  constructor(
    public readonly hospitalId: number,
    public readonly labOrderId: number,
    public readonly performedById: number,
  ) {}
}
