export class RadiologyOrderCreatedEvent {
  constructor(
    public readonly hospitalId: number,
    public readonly orderId: number,
    public readonly patientName: string,
    public readonly doctorName: string,
    public readonly studyName: string,
  ) {}
}
