import { create } from "zustand";
import { apiClient } from "../api/apiClient";
import { useLicenseStore } from "./licenseStore"; 

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
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hydrateFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: typeof window !== "undefined" && localStorage.getItem("user_info") 
        ? JSON.parse(localStorage.getItem("user_info") || "null") 
        : null,
  isAuthenticated:
    typeof window !== "undefined" ? localStorage.getItem("auth_status") === "true" : false,

  async login(username, password) {
    const res = await apiClient.post("/auth/login", { username, password });
    const payload = res.data; // Response contains { user, success: true } (tokens in cookies)

    // Persist UI state
    localStorage.setItem("auth_status", "true");
    localStorage.setItem("user_info", JSON.stringify(payload.user));

    useLicenseStore.getState().reset();

    set({
      user: payload.user,
      isAuthenticated: true,
    });
  },

  async logout() {
    try {
        await apiClient.post("/auth/logout");
    } catch (e) {
        console.warn("Logout API failed, clearing local state anyway");
    }
    localStorage.removeItem("auth_status");
    localStorage.removeItem("user_info");
    set({ user: null, isAuthenticated: false });
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


// interface User {
//   id: number;
//   fullName: string;
//   username: string;
//   hospitalId: number;
//   roles: Role[];
//   permissions: string[];
// }

// interface AuthState {
//   token: string | null;
//   user: User | null;
//   isAuthenticated: boolean;
//   login: (username: string, password: string) => Promise<void>;
//   logout: () => void;

//   hydrateFromStorage: () => void;
// }

// export const useAuthStore = create<AuthState>((set) => ({
//   token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
//   user: null,
//   isAuthenticated:
//     typeof window !== "undefined" ? !!localStorage.getItem("token") : false,

//   // async login(username, password) {
//   //   const res = await apiClient.post("/auth/login", { username, password });

//   //   console.log("login response:", res.data);

//   //   const token: string | undefined = res.data.token ?? res.data.accessToken;
//   //   if (!token) {
//   //     throw new Error("لم يتم استلام رمز الدخول (token) من السيرفر.");
//   //   }

//   //   if (typeof window !== "undefined") {
//   //     localStorage.setItem("token", token);
//   //     localStorage.setItem("user", JSON.stringify(res.data.user));
//   //   }

//   //   set({
//   //     token,
//   //     user: res.data.user,
//   //     isAuthenticated: true,
//   //   });
//   // },

//   async login(username, password) {
//     const res = await apiClient.post("/auth/login", { username, password });

//     console.log("login response:", res.data);

//     // ✅ التعديل: الآن (res.data) هي البيانات الصافية بفضل الـ interceptor الجديد
//     // لم نعد بحاجة لـ res.data.data
//     const payload = res.data;

//     const token: string | undefined = payload?.accessToken || payload?.token;

//     if (!token) {
//       throw new Error("لم يتم استلام رمز الدخول (token) من السيرفر.");
//     }

//     if (typeof window !== "undefined") {
//       localStorage.setItem("token", token);
//       localStorage.setItem("user", JSON.stringify(payload.user));
//     }

//     set({
//       token,
//       user: payload.user,
//       isAuthenticated: true,
//     });
//   },

//   logout() {
//     if (typeof window !== "undefined") {
//       localStorage.removeItem("token");
//       localStorage.removeItem("user");
//     }
//     set({ token: null, user: null, isAuthenticated: false });
//   },

//   hydrateFromStorage() {
//     if (typeof window === "undefined") return;

//     const token = localStorage.getItem("token");
//     const rawUser = localStorage.getItem("user");

//     if (token && rawUser) {
//       try {
//         const user = JSON.parse(rawUser);
//         set({
//           token,
//           user,
//           isAuthenticated: true,
//         });
//       } catch {
//         // لو الـ JSON فاسد ننظف التخزين
//         localStorage.removeItem("token");
//         localStorage.removeItem("user");
//         set({
//           token: null,
//           user: null,
//           isAuthenticated: false,
//         });
//       }
//     } else {
//       set({
//         token: null,
//         user: null,
//         isAuthenticated: false,
//       });
//     }
//   },
// }));
