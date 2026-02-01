export class LabResultVerifiedEvent {
  hospitalId: number;
  labOrderId: number;
  patientId: number;
  testCode: string;
  value: number;
  unit: string;
  verifiedAt: Date;
}
