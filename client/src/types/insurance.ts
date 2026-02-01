// src/types/insurance.ts

export type CopayType = "PERCENTAGE" | "FIXED_AMOUNT";
export type CoverageRuleType = "INCLUSION" | "EXCLUSION";

export type InsurancePlan = {
  id: number;
  name: string;
  defaultCopayRate: number; // e.g. 0.20
  maxCopayAmount?: number | null;
  _count?: { rules: number };
};

export type CoverageRule = {
  id: number;
  ruleType: CoverageRuleType;
  copayType: CopayType;
  copayValue: number;
  requiresApproval: boolean;
  serviceCategory?: { id: number; name: string };
  serviceItem?: { id: number; name: string; code: string };
};

export type PreAuthorization = {
  id: number;
  authCode: string | null;
  status: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  expiresAt: string | null;
  patient: { fullName: string; mrn: string };
  serviceItem?: { name: string };
  policy: { provider: { name: string } };
  createdAt: string;
};
