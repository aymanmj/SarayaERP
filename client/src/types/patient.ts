// Patient types for Saraya ERP

export type Gender = "MALE" | "FEMALE" | "OTHER" | null;

export interface PatientInsurancePolicy {
  id: number;
  name: string;
  provider: { id: number; name: string };
}

export interface Patient {
  id: number;
  mrn: string;
  fullName: string;
  nationalId: string | null;
  dateOfBirth: string | null;
  gender: Gender;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  insurancePolicyId: number | null;
  insuranceMemberId: string | null;
  insurancePolicy?: PatientInsurancePolicy | null;
  // Additional fields for extended patient info
  motherName?: string | null;
  familyBooklet?: string | null;
  familySheet?: string | null;
  registryNumber?: string | null;
  identityType?: string | null;
  identityNumber?: string | null;
  maritalStatus?: string | null;
}

export interface PatientLite {
  id: number;
  fullName: string;
  mrn: string;
}

export interface PatientAgingRow {
  patientId: number;
  patientName: string;
  mrn?: string | null;
  balance0_30: number;
  balance31_60: number;
  balance61_90: number;
  balance91_plus: number;
  total: number;
}

export interface PatientAgingResponse {
  asOf: string;
  patients: PatientAgingRow[];
  grandTotals: {
    balance0_30: number;
    balance31_60: number;
    balance61_90: number;
    balance91_plus: number;
    total: number;
  };
}

export interface PatientsListResponse {
  items: Patient[];
  meta: any;
}
