import { apiClient } from "./apiClient";

// Matches CDSSAlertResult in backend
export type CDSSAlertResult = {
  type: string; // CDSSAlertType enum
  severity: "INFO" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  message: string;
  messageAr?: string;
  context?: Record<string, any>;
  requiresOverride: boolean;
};

// Matches CheckVitalsDto
export type CheckVitalsPayload = {
  patientId: number;
  encounterId?: number;
  temperature?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  respRate?: number;
  o2Sat?: number;
};

export const cdssApi = {
  checkVitals: async (data: CheckVitalsPayload) => {
    // Backend expects specific DTO structure. 
    // CDSSController.checkVitals calls cdssService.checkVitalsAndAlert
    const res = await apiClient.post<{ alerts: CDSSAlertResult[]; savedCount: number }>(
      "/cdss/check-vitals",
      data
    );
    return res.data.alerts;
  },

  checkLabResult: async (data: {
    patientId: number;
    encounterId?: number;
    testCode: string;
    value: number;
    unit: string;
    patientAge?: number;
    gender?: string;
  }) => {
    const res = await apiClient.post<{ alert: CDSSAlertResult | null; saved: boolean }>(
      "/cdss/check-lab-result",
      data
    );
    // Return array to be consistent with checkVitals usage in components
    return res.data.alert ? [res.data.alert] : [];
  },

  checkDrugInteractions: async (drugNames: string[]) => {
     const res = await apiClient.post<CDSSAlertResult[]>("/cdss/check-interactions", {
       drugs: drugNames
     });
     return res.data;
  }
};
