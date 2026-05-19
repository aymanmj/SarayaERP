// src/types/organization.ts

export type OrganizationSettings = {
  id: number;
  displayName: string;
  legalName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string | null;
  printHeaderFooter?: boolean;
  mpiEnableFederation?: boolean;
  mpiRequirePatientOTP?: boolean;
};

export interface Branch {
  id: number;
  code: string;
  name: string;
  isCurrent?: boolean;
  city?: string | null;
  patientCount?: number;
  isActive?: boolean;
}

