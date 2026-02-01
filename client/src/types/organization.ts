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
};
