import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/authStore";

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 30000,
  withCredentials: true, // ✅ Important for Cookies
  headers: { "X-Client-Name": "saraya-web" },
});

let isRefreshing = false;

type StaffRequest = InternalAxiosRequestConfig & {
  _retry?: boolean;
  staffScope?: string;
};

function staffScope(userId?: number, hospitalId?: number | null) {
  return `${userId ?? ""}:${hospitalId ?? ""}`;
}

function currentStaffScope() {
  const state = useAuthStore.getState();
  return staffScope(state.user?.id, state.currentBranchId);
}
 
let failedQueue: any[] = [];

 
const processQueue = (error: any) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};
// 1. Request Interceptor (Minimal - just return config)
apiClient.interceptors.request.use((config) => {
  (config as StaffRequest).staffScope ??= currentStaffScope();
  const currentLang = localStorage.getItem("language") || "ar";
  if (config.headers) {
    config.headers["Accept-Language"] = currentLang;
    // Prevent browser from caching API GET requests (fixes language switch caching)
    config.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    config.headers["Pragma"] = "no-cache";
    config.headers["Expires"] = "0";
  }
  return config;
});
// 2. Response Interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Unwrapping Data
    if (
      response.data &&
      typeof response.data === "object" &&
      "data" in response.data &&
      "success" in response.data &&
      Object.keys(response.data).length === 3 // Check structure loosely or strict
    ) {
        // Standard NestJS reponse format wrapper
        // But if 'data' field is meant to be the body...
        // The original code unwrapped strictly.
        // Let's keep it safe:
        if ('statusCode' in response.data && 'message' in response.data) {
             // It's likely the standardized success response?
             // Actually, original code:
             // if (response.data.data && "success" in response.data) response.data = response.data.data
        }
    }
    // Restore original unwrapping logic if possible, or simplified.
    // Original:
    if (
      response.data &&
      typeof response.data === "object" &&
      "data" in response.data &&
      "success" in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config as StaffRequest | undefined;

    // Handle 401 (Unauthorized)
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (
        originalRequest.url?.includes("/auth/login") ||
        originalRequest.url?.includes("/auth/refresh") ||
        originalRequest.url?.includes("/auth/logout")
      ) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      if (originalRequest.staffScope !== currentStaffScope()) return Promise.reject(error);
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            if (originalRequest.staffScope !== currentStaffScope()) throw error;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        // Attempt Silent Refresh
        const { data } = await apiClient.post<{ hospitalId: number; userId: number }>("/auth/refresh");
        if (
          originalRequest.staffScope !== staffScope(data.userId, data.hospitalId) ||
          !useAuthStore.getState().acceptRefreshedSession(data.hospitalId, data.userId)
        )
          throw new Error("Staff session branch changed");

        // Refresh success
        processQueue(null);
        isRefreshing = false;

        return apiClient(originalRequest);
      } catch (refreshError) {
        if (axios.isAxiosError(refreshError)) {
          const status = refreshError.response?.status;
          if (status === 409 && refreshError.response?.data?.message === "AUTH_REFRESH_CONFLICT") {
            const config: AxiosRequestConfig & { _retry: boolean } = { _retry: true };
            try {
              const { data } = await apiClient.get<{ sub: number; hospitalId: number }>("/auth/me", config);
              if (
                originalRequest.staffScope === staffScope(data.sub, data.hospitalId) &&
                useAuthStore.getState().acceptRefreshedSession(data.hospitalId, data.sub)
              ) {
                isRefreshing = false;
                processQueue(null);
                return apiClient(originalRequest);
              }
            } catch {
              // The other tab may not have installed its cookies yet.
            }
          }
          if (status === 401 || (status === 403 && refreshError.response?.data?.message !== "LICENSE_REQUIRED")) {
            if (originalRequest.staffScope === currentStaffScope()) {
              useAuthStore.getState().clearSession();
              if (window.location.pathname !== "/login") window.location.href = "/login";
            }
          }
        }
        isRefreshing = false;
        processQueue(refreshError);
        return Promise.reject(refreshError);
      }
    }

    // 🛡️ التحقق من خطأ الترخيص - التوجيه لصفحة التفعيل
    if (
      error.response &&
      error.response.status === 403 &&
      error.response.data?.message === "LICENSE_REQUIRED"
    ) {
      if (!window.location.pathname.includes("/activation")) {
        window.location.href = "/activation";
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

// // src/api/apiClient.ts

// import axios from "axios";
// import { useAuthStore } from "../stores/authStore";

// export const apiClient = axios.create({
//   baseURL: "http://localhost:3000",
//   withCredentials: false,
// });

// // 1. Request Interceptor: إضافة التوكن تلقائياً
// apiClient.interceptors.request.use((config) => {
//   const token = useAuthStore.getState().token;
//   if (token) {
//     config.headers = config.headers ?? {};
//     config.headers.Authorization = `Bearer ${token}`;
//   }
//   return config;
// });

// // 2. Response Interceptor: فك تغليف البيانات (Unwrapping) ✅ هذا هو الحل الجذري
// apiClient.interceptors.response.use(
//   (response) => {
//     // التحقق: هل الرد يأتي بالهيكلية الموحدة الجديدة؟
//     // { success: true, data: ... }
//     if (
//       response.data &&
//       typeof response.data === "object" &&
//       "data" in response.data &&
//       "success" in response.data
//     ) {
//       // نعم، نقوم باستبدال الـ data المغلفة بالبيانات الحقيقية الموجودة بداخلها
//       // حتى تعمل الصفحات (map, filter) بدون تعديل
//       response.data = response.data.data;
//     }
//     return response;
//   },
//   (error) => {
//     // 🛡️ التحقق من خطأ الترخيص
//     if (
//       error.response &&
//       error.response.status === 403 &&
//       error.response.data.message === "LICENSE_REQUIRED"
//     ) {
//       if (!window.location.pathname.includes("/activation")) {
//         window.location.href = "/activation";
//       }
//     }
//     return Promise.reject(error);
//   },
// );
