export class RadiologyOrderStartedEvent {
  constructor(
    public readonly hospitalId: number,
    public readonly radiologyOrderId: number,
    public readonly performedById: number,
  ) {}
}
