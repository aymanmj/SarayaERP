/**
 * Patient Portal — API Client
 * 
 * Dedicated axios instance for the patient portal.
 * Uses Bearer token authentication (stored in portalAuthStore).
 */

import axios from 'axios';

export const portalApi = axios.create({
  baseURL: '/api/patient-portal/v1',
});

// Request interceptor: attach patient's JWT
portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('portal_access_token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: unwrap standard responses + handle 401
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

portalApi.interceptors.response.use(
  (response) => {
    // Unwrap standard NestJS response
    if (
      response.data &&
      typeof response.data === 'object' &&
      'data' in response.data &&
      'success' in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => portalApi(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('portal_refresh_token');
        const { data } = await portalApi.post('/auth/refresh', { refreshToken });

        localStorage.setItem('portal_access_token', data.accessToken);
        localStorage.setItem('portal_refresh_token', data.refreshToken);

        processQueue(null);
        isRefreshing = false;
        return portalApi(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        isRefreshing = false;
        localStorage.removeItem('portal_access_token');
        localStorage.removeItem('portal_refresh_token');
        localStorage.removeItem('portal_patient');
        if (!window.location.pathname.includes('/portal/login')) {
          window.location.href = '/portal/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// Helper for auth endpoints (no Bearer token needed)
export const portalAuthApi = axios.create({
  baseURL: '/api/patient-portal/v1',
});

portalAuthApi.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      typeof response.data === 'object' &&
      'data' in response.data &&
      'success' in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
);
