export interface UserProfile {
  id: number;
  username: string;
  fullName: string;
  roles: string[];
  email?: string;
  phone?: string;
  department?: string;
}

export interface AuthResponse {
  success: boolean;
  accessToken: string;
  user: UserProfile;
  message?: string;
}

export interface Patient {
  id: number;
  fullName: string;
  mrn: string;
  nationalId?: string;
  dateOfBirth?: string;
  gender?: string;
}

export interface Bed {
  id: number;
  bedNumber: string;
  ward: {
    id: number;
    name: string;
  };
}

export interface BedAssignment {
  id: number;
  bed: Bed;
}

export interface VitalSign {
  id: number;
  temperature?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  respRate?: number;
  o2Sat?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  note?: string;
  createdAt: string;
  createdBy: {
    id: number;
    fullName: string;
  };
}

export interface Encounter {
  id: number;
  patientId: number;
  status: 'OPEN' | 'CLOSED';
  patient: Patient;
  admission?: {
    primaryDiagnosis?: string;
  };
  bedAssignments: BedAssignment[];
  vitalSigns?: {
    bpSystolic: number;
    bpDiastolic: number;
    heartRate: number;
    temperature: number;
    createdAt: string;
  }[];
}

export interface ClinicalNote {
  id: number | string; // Can be string for local temp IDs
  content: string;
  createdAt: string;
  type: string;
  createdBy: {
    id?: number;
    fullName: string;
  };
}

export interface PrescriptionItem {
  id: number;
  drugItemId: number;
  drugItem?: {
    id: number;
    name: string;
    tradeName?: string;
    genericName?: string;
    code?: string;
  };
  dose: string;
  route: string;
  frequency: string;
  quantity: number;
  status: string;
  notes?: string;
}

export interface Prescription {
  id: number;
  encounterId: number;
  patient?: Patient;
  doctor?: {
    id: number;
    fullName: string;
  };
  status: string;
  items: PrescriptionItem[];
  createdAt: string;
}

export interface StockItem {
  id: number;
  name: string;
  tradeName?: string;
  genericName?: string;
  form?: string;
  stockOnHand: number;
  unitPrice: number;
  code?: string;
}

export interface PharmacyWorklistItem {
  id: number;
  encounterId: number;
  patient?: Patient;
  doctor?: {
    id: number;
    fullName: string;
  };
  status: 'PENDING' | 'DISPENSED' | 'CANCELLED';
  items: PrescriptionItem[];
  createdAt: string;
}

// Offline Storage Actions & Payloads
export type OfflineActionType =
  | 'CREATE_NOTE'
  | 'CREATE_VITALS'
  | 'ADMINISTER_MED'
  | 'DISPENSE_PRESCRIPTION'
  | 'ADJUST_STOCK';

export interface CreateNotePayload {
  encounterId: number;
  content: string;
  type: string;
}

export interface CreateVitalsPayload {
  encounterId: number;
  temperature?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  respRate?: number;
  o2Sat?: number;
  weight?: number;
  height?: number;
  note?: string;
}

export interface AdministerMedPayload {
  encounterId: number;
  prescriptionItemId: number;
  status: string;
  notes?: string;
}

export interface DispensePrescriptionItemPayload {
  prescriptionItemId: number;
  quantity: number;
}

export interface DispensePrescriptionPayload {
  prescriptionId: number;
  items: DispensePrescriptionItemPayload[];
  notes?: string;
}

export interface AdjustStockPayload {
  drugItemId: number;
  quantity: number;
  type: 'IN' | 'ADJUST';
  reason?: string;
}

export type OfflinePayload =
  | CreateNotePayload
  | CreateVitalsPayload
  | AdministerMedPayload
  | DispensePrescriptionPayload
  | AdjustStockPayload;

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: OfflinePayload;
  timestamp: number;
}

export interface FailedAction extends OfflineAction {
  error: string;
  failedAt: number;
}

export interface CDSSAlert {
  id: number;
  hospitalId: number;
  patientId: number;
  encounterId?: number;
  prescriptionId?: number;
  orderId?: number;
  alertType:
    | 'DRUG_INTERACTION'
    | 'DRUG_ALLERGY'
    | 'DUPLICATE_THERAPY'
    | 'DOSAGE_WARNING'
    | 'LAB_CRITICAL'
    | 'VITAL_CRITICAL'
    | 'AGE_CONTRAINDICATION'
    | 'RENAL_DOSE_ADJUST'
    | 'PREGNANCY_RISK'
    | 'DRUG_DISEASE'
    | 'PROTOCOL_RECOMMENDATION';
  severity: 'INFO' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  message: string;
  messageAr?: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'OVERRIDDEN' | 'RESOLVED';
  createdAt: string;
}

