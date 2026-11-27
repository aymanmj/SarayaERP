import { create } from "zustand";
import { apiClient } from "../api/apiClient";
import { useLicenseStore } from "./licenseStore"; 
import { useSocketStore } from "./socketStore";

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
  mfaEnabled?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  sessionRevision: number;
  // ✅ Multi-Branch
  accessibleBranches: Branch[];
  currentBranchId: number | null;
  isSwitchingBranch: boolean;
  // Actions
  setAuth: (payload: { user: User; accessibleBranches?: Branch[] }) => void;
  login: (username: string, password: string, mfaCode?: string) => Promise<void>;
  logout: () => void;
  clearSession: () => void;
  acceptRefreshedSession: (hospitalId: number, userId: number) => boolean;
  switchBranch: (targetHospitalId: number) => Promise<void>;
  hydrateFromStorage: () => void;
}

// ============================================
// Store
// ============================================

function safeJsonParse<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: safeJsonParse<User | null>("user_info", null),
  sessionRevision: 0,
  isAuthenticated:
    typeof window !== "undefined" ? localStorage.getItem("auth_status") === "true" : false,
  
  // ✅ Multi-Branch State
  accessibleBranches: safeJsonParse<Branch[]>("accessible_branches", []),
  currentBranchId: typeof window !== "undefined" && localStorage.getItem("current_branch_id")
    ? Number(localStorage.getItem("current_branch_id"))
    : null,
  isSwitchingBranch: false,

  setAuth(payload) {
    const branches: Branch[] = payload.accessibleBranches || [];
    const currentBranchId = payload.user?.hospitalId || null;

    localStorage.setItem("auth_status", "true");
    localStorage.setItem("user_info", JSON.stringify(payload.user));
    localStorage.removeItem("auth_token");
    localStorage.setItem("accessible_branches", JSON.stringify(branches));
    if (currentBranchId) {
      localStorage.setItem("current_branch_id", String(currentBranchId));
    }

    useLicenseStore.getState().reset();

    set({
      user: payload.user,
      isAuthenticated: true,
      accessibleBranches: branches,
      currentBranchId,
    });
  },

  async login(username, password, mfaCode) {
    const res = await apiClient.post(
      "/auth/login",
      mfaCode ? { username, password, mfaCode } : { username, password },
    );
    const payload = res.data;

    get().setAuth(payload);
  },

  clearSession() {
    // 1. Disconnect WebSocket & Clear State Immediately
    try {
      useSocketStore.getState().disconnect();
    } catch {
      // Ignore if socket store is not initialized
    }

    set({
      user: null,
      isAuthenticated: false,
      accessibleBranches: [],
      currentBranchId: null,
    });
    localStorage.removeItem("auth_status");
    localStorage.removeItem("user_info");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("accessible_branches");
    localStorage.removeItem("current_branch_id");
  },

  acceptRefreshedSession(hospitalId, userId) {
    const state = get();
    if (!state.isAuthenticated || state.currentBranchId !== hospitalId || state.user?.id !== userId) return false;
    set({ sessionRevision: state.sessionRevision + 1 });
    const realtime = useSocketStore.getState();
    if (realtime.socket) {
      realtime.disconnect();
      realtime.connect();
    }
    return true;
  },

  async logout() {
    get().clearSession();
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
      const { data } = await apiClient.post<{ currentBranch: { id: number } }>(
        "/auth/switch-branch", { targetHospitalId },
      );
      if (data.currentBranch.id !== targetHospitalId || get().user?.id !== state.user?.id)
        throw new Error("Invalid staff branch response");

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
        const legacyKeys = ['auth_token', 'token', 'refreshToken', 'user', 'auth-storage'];
        legacyKeys.forEach(key => localStorage.removeItem(key));
    }
  },
}));

// Run on init
useAuthStore.getState().hydrateFromStorage();
