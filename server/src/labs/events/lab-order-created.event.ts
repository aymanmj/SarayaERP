export class LabOrderCreatedEvent {
  constructor(
    public readonly hospitalId: number,
    public readonly orderId: number,
    public readonly patientName: string,
    public readonly doctorName: string,
    public readonly testsCount: number,
  ) {}
}
