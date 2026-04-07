// client/src/stores/licenseStore.ts
// Professional Licensing System 4.0 - Smart Renewal + Periodic Re-check

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
  isExpired?: boolean;
  daysRemaining?: number;
  graceDaysRemaining?: number;
}

interface LicenseStoreState {
  // State
  licenseState: LicenseState;
  machineId: string;
  details: LicenseDetails | null;
  errorMessage: string | null;
  hasFetched: boolean;

  // Actions
  fetchLicenseStatus: () => Promise<void>;
  refetchLicenseStatus: () => Promise<void>;
  isModuleEnabled: (moduleName: string) => boolean;
  reset: () => void;
  startPeriodicCheck: () => void;
  stopPeriodicCheck: () => void;
}

// Interval ID for periodic checks
let periodicCheckInterval: ReturnType<typeof setInterval> | null = null;
const PERIODIC_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================
// Internal fetch logic
// ============================================================

async function doFetch(set: any, get: any) {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 10000);
    });

    const fetchPromise = apiClient.get("/license/status");
    const response = (await Promise.race([fetchPromise, timeoutPromise])) as any;

    let data = response.data;

    // Handle wrapped responses
    if (data && typeof data === "object") {
      if ("success" in data && "data" in data) {
        data = data.data;
      }
    }

    if (data?.isValid === true) {
      console.log("[LicenseStore] ✅ License VALID", {
        isGracePeriod: data.isGracePeriod,
        daysRemaining: data.daysRemaining,
        graceDaysRemaining: data.graceDaysRemaining,
      });
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
          isExpired: data.isExpired,
          daysRemaining: data.daysRemaining,
          graceDaysRemaining: data.graceDaysRemaining,
        },
        errorMessage: null,
      });

      // Start periodic checks when license is active
      get().startPeriodicCheck();
    } else {
      console.log("[LicenseStore] ❌ License INVALID:", data?.error);
      set({
        licenseState: "inactive",
        machineId: data?.machineId || "",
        details: null,
        errorMessage: data?.error || "الترخيص غير صالح",
      });

      // Stop periodic checks when license is inactive
      get().stopPeriodicCheck();
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
}

// ============================================================
// STORE
// ============================================================

export const useLicenseStore = create<LicenseStoreState>((set, get) => ({
  // Initial state
  licenseState: "idle",
  machineId: "",
  details: null,
  errorMessage: null,
  hasFetched: false,

  /**
   * Fetch license status from the backend (first time only).
   */
  fetchLicenseStatus: async () => {
    const { hasFetched, licenseState } = get();
    if (hasFetched || licenseState === "loading") {
      return;
    }
    set({ licenseState: "loading", hasFetched: true, errorMessage: null });
    await doFetch(set, get);
  },

  /**
   * Force re-fetch license status (bypasses hasFetched guard).
   * Used for periodic checks and manual refresh.
   */
  refetchLicenseStatus: async () => {
    const { licenseState } = get();
    if (licenseState === "loading") return;
    set({ licenseState: "loading", errorMessage: null });
    await doFetch(set, get);
  },

  /**
   * Start periodic license re-checks (every 5 minutes).
   * Ensures grace period expiry is detected without page reload.
   */
  startPeriodicCheck: () => {
    if (periodicCheckInterval) return; // Already running

    periodicCheckInterval = setInterval(() => {
      console.log("[LicenseStore] 🔄 Periodic license re-check...");
      get().refetchLicenseStatus();
    }, PERIODIC_CHECK_INTERVAL_MS);

    console.log("[LicenseStore] ⏱️ Periodic checks started (every 5 min)");
  },

  /**
   * Stop periodic checks.
   */
  stopPeriodicCheck: () => {
    if (periodicCheckInterval) {
      clearInterval(periodicCheckInterval);
      periodicCheckInterval = null;
      console.log("[LicenseStore] ⏱️ Periodic checks stopped");
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
   * Reset the store - MUST be called on logout!
   */
  reset: () => {
    get().stopPeriodicCheck();
    set({
      licenseState: "idle",
      machineId: "",
      details: null,
      errorMessage: null,
      hasFetched: false,
    });
  },
}));
