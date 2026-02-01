// client/src/stores/licenseStore.ts
// Professional Licensing System 2.0 - Fixed Version

import { create } from "zustand";
import { apiClient } from "../api/apiClient";

// ============================================================
// TYPES
// ============================================================

export type LicenseState = "idle" | "loading" | "active" | "inactive" | "error";

interface LicenseDetails {
  plan?: string;
  hospitalName?: string;
  expiryDate?: string;
  maxUsers?: number;
  modules?: string[];
  isGracePeriod?: boolean;
  daysRemaining?: number;
}

interface LicenseStoreState {
  // State
  licenseState: LicenseState;
  machineId: string;
  details: LicenseDetails | null;
  errorMessage: string | null;
  hasFetched: boolean; // Track if we've attempted to fetch

  // Actions
  fetchLicenseStatus: () => Promise<void>;
  isModuleEnabled: (moduleName: string) => boolean;
  reset: () => void;
}

// ============================================================
// STORE
// ============================================================

export const useLicenseStore = create<LicenseStoreState>((set, get) => ({
  // Initial state - IDLE means we haven't even started checking
  licenseState: "idle",
  machineId: "",
  details: null,
  errorMessage: null,
  hasFetched: false,

  /**
   * Fetch license status from the backend.
   */
  fetchLicenseStatus: async () => {
    // Prevent double-fetching
    const { hasFetched, licenseState } = get();
    if (hasFetched || licenseState === "loading") {
      console.log("[LicenseStore] Already fetched or loading, skipping...");
      return;
    }

    console.log("[LicenseStore] Starting fetchLicenseStatus...");
    set({ licenseState: "loading", hasFetched: true, errorMessage: null });

    try {
      // Simple timeout using Promise.race
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), 10000);
      });

      console.log("[LicenseStore] Making API call to /license/status...");
      
      const fetchPromise = apiClient.get("/license/status");
      const response = await Promise.race([fetchPromise, timeoutPromise]) as any;

      console.log("[LicenseStore] Raw response:", response);
      
      // Handle both wrapped and unwrapped responses
      let data = response.data;
      
      // If apiClient unwrapped { success, data } to just data, we have the real data
      // If not, we need to check
      if (data && typeof data === "object") {
        // Check if this is a wrapped response
        if ("success" in data && "data" in data) {
          data = data.data;
        }
      }

      console.log("[LicenseStore] Parsed data:", data);

      if (data?.isValid === true) {
        console.log("[LicenseStore] ✅ License VALID - state -> active");
        set({
          licenseState: "active",
          machineId: data.machineId || "",
          details: {
            plan: data.plan,
            hospitalName: data.hospitalName,
            expiryDate: data.expiryDate,
            maxUsers: data.maxUsers,
            modules: data.modules,
            isGracePeriod: data.isGracePeriod,
            daysRemaining: data.daysRemaining,
          },
          errorMessage: null,
        });
      } else {
        console.log("[LicenseStore] ❌ License INVALID - state -> inactive");
        set({
          licenseState: "inactive",
          machineId: data?.machineId || "",
          details: null,
          errorMessage: data?.error || "الترخيص غير صالح",
        });
      }
    } catch (err: any) {
      console.error("[LicenseStore] ❌ Error:", err);
      set({
        licenseState: "error",
        machineId: "",
        details: null,
        errorMessage: err.message || "حدث خطأ أثناء التحقق من الترخيص.",
      });
    }
  },

  /**
   * Check if a specific module is enabled.
   */
  isModuleEnabled: (moduleName: string): boolean => {
    const { licenseState, details } = get();
    if (licenseState !== "active" || !details?.modules) return false;
    return details.modules.includes(moduleName.toUpperCase());
  },

  /**
   * Reset the store - MUST be called on login!
   */
  reset: () => {
    console.log("[LicenseStore] Resetting store...");
    set({
      licenseState: "idle",
      machineId: "",
      details: null,
      errorMessage: null,
      hasFetched: false,
    });
  },
}));
