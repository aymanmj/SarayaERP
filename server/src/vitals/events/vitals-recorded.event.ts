export class VitalsRecordedEvent {
  hospitalId: number;
  encounterId: number;
  patientId: number;
  vitals: {
    temperature?: number;
    bpSystolic?: number;
    bpDiastolic?: number;
    pulse?: number;
    respRate?: number;
    o2Sat?: number;
  };
  recordedAt: Date;
}
