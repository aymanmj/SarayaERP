import axios from "axios";
import { useAuthStore } from "../stores/authStore";

export const apiClient = axios.create({
  baseURL: "/api",
  withCredentials: true, // ✅ Important for Cookies
});

let isRefreshing = false;
 
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
  const currentLang = localStorage.getItem("language") || "ar";
  if (config.headers) {
    config.headers["Accept-Language"] = currentLang;
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
    const originalRequest = error.config;

    // Handle 401 (Unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (
        originalRequest.url.includes("/auth/login") ||
        originalRequest.url.includes("/auth/refresh") ||
        originalRequest.url.includes("/auth/logout")
      ) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Attempt Silent Refresh
        await apiClient.post("/auth/refresh");

        // Refresh success
        processQueue(null);
        isRefreshing = false;

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        isRefreshing = false;
        useAuthStore.getState().logout();
        // Redirect to login only if not already there
        if (window.location.pathname !== "/login") {
            window.location.href = "/login";
        }
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
