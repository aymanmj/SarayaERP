import { create } from "zustand";
import { apiClient } from "../api/apiClient";
import { useLicenseStore } from "./licenseStore"; 

// ============================================
// Types
// ============================================

export interface Branch {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
}

interface User {
  id: number;
  fullName: string;
  username: string;
  hospitalId: number;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  // ✅ Multi-Branch
  accessibleBranches: Branch[];
  currentBranchId: number | null;
  isSwitchingBranch: boolean;
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  switchBranch: (targetHospitalId: number) => Promise<void>;
  hydrateFromStorage: () => void;
}

// ============================================
// Store
// ============================================

export const useAuthStore = create<AuthState>((set, get) => ({
  user: typeof window !== "undefined" && localStorage.getItem("user_info") 
        ? JSON.parse(localStorage.getItem("user_info") || "null") 
        : null,
  token: typeof window !== "undefined" ? localStorage.getItem("auth_token") : null,
  isAuthenticated:
    typeof window !== "undefined" ? localStorage.getItem("auth_status") === "true" : false,
  
  // ✅ Multi-Branch State
  accessibleBranches: typeof window !== "undefined" && localStorage.getItem("accessible_branches")
    ? JSON.parse(localStorage.getItem("accessible_branches") || "[]")
    : [],
  currentBranchId: typeof window !== "undefined" && localStorage.getItem("current_branch_id")
    ? Number(localStorage.getItem("current_branch_id"))
    : null,
  isSwitchingBranch: false,

  async login(username, password) {
    const res = await apiClient.post("/auth/login", { username, password });
    const payload = res.data;

    const branches: Branch[] = payload.accessibleBranches || [];
    const currentBranchId = payload.user?.hospitalId || null;

    // Persist UI state
    localStorage.setItem("auth_status", "true");
    localStorage.setItem("user_info", JSON.stringify(payload.user));
    localStorage.setItem("auth_token", payload.token || "");
    localStorage.setItem("accessible_branches", JSON.stringify(branches));
    if (currentBranchId) {
      localStorage.setItem("current_branch_id", String(currentBranchId));
    }

    useLicenseStore.getState().reset();

    set({
      user: payload.user,
      token: payload.token || null,
      isAuthenticated: true,
      accessibleBranches: branches,
      currentBranchId,
    });
  },

  async logout() {
    // 1. Clear State Immediately
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      accessibleBranches: [],
      currentBranchId: null,
    });
    localStorage.removeItem("auth_status");
    localStorage.removeItem("user_info");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("accessible_branches");
    localStorage.removeItem("current_branch_id");

    // 2. Attempt API Logout (Fire & Forget)
    try {
        await apiClient.post("/auth/logout");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
        // Ignore errors, we are already logged out locally
    }
  },

  /**
   * ✅ Multi-Branch: تبديل الفرع النشط
   * يُرسل طلب للخادم لإصدار JWT جديد مرتبط بالفرع الجديد
   * ثم يُعيد تحميل الصفحة لتحديث كل البيانات
   */
  async switchBranch(targetHospitalId: number) {
    const state = get();
    if (state.currentBranchId === targetHospitalId) return;
    if (state.isSwitchingBranch) return;

    set({ isSwitchingBranch: true });

    try {
      const res = await apiClient.post("/auth/switch-branch", { targetHospitalId });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { currentBranch } = res.data;

      // Update user's hospitalId in local state
      const updatedUser = state.user ? { ...state.user, hospitalId: targetHospitalId } : null;

      localStorage.setItem("current_branch_id", String(targetHospitalId));
      if (updatedUser) {
        localStorage.setItem("user_info", JSON.stringify(updatedUser));
      }

      set({
        user: updatedUser,
        currentBranchId: targetHospitalId,
        isSwitchingBranch: false,
      });

      // Reload page to refresh all data with new branch context
      window.location.reload();
    } catch (error) {
      set({ isSwitchingBranch: false });
      throw error;
    }
  },

  hydrateFromStorage: () => {
    // Cleanup Legacy Keys
    if (typeof window !== "undefined") {
        const legacyKeys = ['token', 'refreshToken', 'user', 'auth-storage'];
        legacyKeys.forEach(key => localStorage.removeItem(key));
    }
  },
}));

// Run on init
useAuthStore.getState().hydrateFromStorage();
