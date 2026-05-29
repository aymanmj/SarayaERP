
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import StorageService from './StorageService';
import { PharmacyWorklistItem, StockItem, CDSSAlert, DispensePrescriptionItemPayload } from "../types";

import AsyncStorage from '@react-native-async-storage/async-storage';

// Read from environment variable, fallback to hardcoded URL if missing
export const getApiUrl = async (): Promise<string> => {
  try {
    const customUrl = await AsyncStorage.getItem("custom_api_url");
    return customUrl || process.env.EXPO_PUBLIC_API_URL || "https://alrehab.alsarayatech.ly/api";
  } catch (e) {
    return process.env.EXPO_PUBLIC_API_URL || "https://alrehab.alsarayatech.ly/api";
  }
};

export const setApiUrl = async (url: string) => {
  try {
    await AsyncStorage.setItem("custom_api_url", url);
  } catch (e) {
    console.error("Failed to save API URL", e);
  }
};

const api = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to attach the token and resolve baseURL dynamically
api.interceptors.request.use(
  async (config) => {
    config.baseURL = await getApiUrl();
    const token = await SecureStore.getItemAsync("userToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor to unwrap the 'data' property and handle errors in a user-friendly way
api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success && response.data.data !== undefined) {
      console.log('API Response Interceptor: Unwrapping data');
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    let friendlyMessage = "حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.";
    
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 400:
          // Try to extract the custom validation error message from NestJS
          let rawMsg = error.response.data?.message;
          
          // Parse if NestJS returned messages as a stringified JSON array
          if (typeof rawMsg === 'string' && (rawMsg.startsWith('[') || rawMsg.startsWith('{'))) {
             try {
                rawMsg = JSON.parse(rawMsg);
             } catch (e) {
                // Ignore parsing errors
             }
          }

          if (Array.isArray(rawMsg)) {
             friendlyMessage = rawMsg.map((msg: any) => {
                if (typeof msg === 'string') return msg;
                if (msg && typeof msg === 'object') {
                   if (msg.constraints) {
                      return Array.isArray(msg.constraints) 
                         ? msg.constraints.join(", ") 
                         : Object.values(msg.constraints).join(", ");
                   }
                   if (msg.message) return msg.message;
                }
                return JSON.stringify(msg);
             }).join("\n");
          } else if (rawMsg && typeof rawMsg === 'object') {
             if (rawMsg.constraints) {
                friendlyMessage = Array.isArray(rawMsg.constraints) 
                   ? rawMsg.constraints.join(", ") 
                   : Object.values(rawMsg.constraints).join(", ");
             } else if (rawMsg.message) {
                friendlyMessage = rawMsg.message;
             } else {
                friendlyMessage = JSON.stringify(rawMsg);
             }
          } else {
             friendlyMessage = rawMsg || "البيانات المدخلة غير صالحة. يرجى مراجعة الحقول.";
          }
          break;
        case 401:
          friendlyMessage = "اسم المستخدم أو كلمة المرور غير صحيحة، أو انتهت صلاحية الجلسة.";
          break;
        case 403:
          friendlyMessage = "عذراً، ليس لديك الصلاحية للوصول إلى هذه الخدمة أو تنفيذ هذا الإجراء.";
          break;
        case 404:
          friendlyMessage = "الخدمة أو الصفحة المطلوبة غير موجودة.";
          break;
        case 429:
          friendlyMessage = "لقد قمت بالعديد من الطلبات في وقت قصير. يرجى الانتظار دقيقة والمحاولة مجدداً.";
          break;
        case 500:
          friendlyMessage = "حدث خطأ داخلي في الخادم. يرجى الاتصال بالدعم الفني للسرايا.";
          break;
        case 502:
        case 503:
        case 504:
          friendlyMessage = "الخادم قيد الصيانة حالياً أو غير متاح. يرجى المحاولة بعد قليل.";
          break;
        case 530:
          friendlyMessage = "تعذر الاتصال بخادم المستشفى أو المركز الطبي. يرجى التحقق من اتصال السيرفر بالشبكة.";
          break;
        default:
          friendlyMessage = `تعذر إكمال العملية (رمز الاستجابة ${status}).`;
      }
      console.error(`API Error [${status}]:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // Network error or timeout (no response was received)
      friendlyMessage = "تعذر الاتصال بالخادم. يرجى التحقق من اتصال شبكة الإنترنت بجهازك.";
    } else {
      friendlyMessage = error.message || "حدث خطأ أثناء الاتصال بالشبكة.";
    }

    // Override the error message so all catch blocks display this friendly text
    error.message = friendlyMessage;

    // Also override response data message for components that fetch it directly
    if (error.response) {
      if (!error.response.data) {
        error.response.data = {};
      }
      error.response.data.message = friendlyMessage;
    }

    return Promise.reject(error);
  }
);

export const setAuthToken = async (token: string) => {
  if (Platform.OS === 'web') {
    localStorage.setItem('userToken', token);
  } else {
    await SecureStore.setItemAsync("userToken", token);
  }
};

export const getAuthToken = async () => {
  if (Platform.OS === 'web') {
    return localStorage.getItem('userToken');
  } else {
    return await SecureStore.getItemAsync("userToken");
  }
};

export const removeAuthToken = async () => {
  if (Platform.OS === 'web') {
    localStorage.removeItem('userToken');
  } else {
    await SecureStore.deleteItemAsync("userToken");
  }
};



export const setUserInfo = async (userInfo: any) => {
  const jsonValue = JSON.stringify(userInfo);
  try {
    await AsyncStorage.setItem("userInfo", jsonValue);
  } catch (e) {
    console.error("Failed to save user info", e);
  }
};

export const getUserInfo = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem("userInfo");
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error("Failed to get user info", e);
    return null;
  }
};

export const removeUserInfo = async () => {
    try {
      await AsyncStorage.removeItem("userInfo");
    } catch (e) {
      console.error("Failed to remove user info", e);
    }
  };

// Extend the api object with custom methods
const extendedApi = {
  ...api,
  get: api.get,
  post: api.post,
  put: api.put,
  delete: api.delete,
  defaults: api.defaults,
  interceptors: api.interceptors,

  // Rounds - Offline Capable
  getMyRotation: async (page?: number, limit?: number) => {
    if (await StorageService.isOnline()) {
      try {
        const url = page && limit ? `/clinical/inpatient/my-rotation?page=${page}&limit=${limit}` : "/clinical/inpatient/my-rotation";
        const response = await api.get(url);
        // Extract array from paginated format or use directly
        const items = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        
        // Save to offline storage for the first page
        if (items && items.length > 0 && (!page || page === 1)) {
             await StorageService.saveRounds(items);
        }
        return items;
      } catch (error) {
        console.warn("Online fetch failed, falling back to offline", error);
        return await StorageService.getRounds();
      }
    } else {
      return await StorageService.getRounds();
    }
  },
  
  // Clinical Notes - Offline Capable
  getClinicalNotes: async (encounterId: number) => {
     if (await StorageService.isOnline()) {
         try {
             const res = await api.get(`/clinical-notes/encounter/${encounterId}`);
             // We serve patient details as a whole usually, but here we can't easily cache *just* notes unless we structured it that way.
             // For now, let's cache what we get if we build a 'getPatientDetails' aggregate.
             // Or we just rely on online for now for details, OR we cache individual parts.
             // Simpler approach: lets cache this specific response
             await StorageService.savePatientDetails(encounterId, { ...await StorageService.getPatientDetails(encounterId), notes: res.data });
             return res.data;
         } catch(e) {
             const cached = await StorageService.getPatientDetails(encounterId);
             return cached?.notes || [];
         }
     } else {
         const cached = await StorageService.getPatientDetails(encounterId);
         return cached?.notes || [];
     }
  },

  createClinicalNote: async (encounterId: number, content: string, type: string = 'DOCTOR_ROUND') => {
    if (await StorageService.isOnline()) {
        return api.post('/clinical-notes', { encounterId, content, type }).then((res) => res.data);
    } else {
        // Queue action
        await StorageService.queueAction({
            type: 'CREATE_NOTE',
            payload: { encounterId, content, type }
        });
        // Return fake success
        return { success: true, offline: true, message: 'Saved offline' };
    }
  },

  // Lab Results - Offline Capable
  getLabOrders: async (encounterId: number) => {
    if (await StorageService.isOnline()) {
        try {
            const res = await api.get(`/lab/encounters/${encounterId}/orders`);
            await StorageService.savePatientDetails(`${encounterId}_labs`, res.data);
            return res.data;
        } catch(e) {
            console.warn("Online fetch labs failed", e);
            return await StorageService.getPatientDetails(`${encounterId}_labs`) || [];
        }
    } else {
        return await StorageService.getPatientDetails(`${encounterId}_labs`) || [];
    }
  },

  // Vitals - Offline Capable
  getVitals: async (encounterId: number) => {
    if (await StorageService.isOnline()) {
        try {
            const res = await api.get(`/vitals/encounter/${encounterId}`);
            await StorageService.savePatientDetails(`${encounterId}_vitals`, res.data);
            return res.data;
        } catch(e) {
            console.warn("Online fetch vitals failed", e);
            return await StorageService.getPatientDetails(`${encounterId}_vitals`) || [];
        }
    } else {
        return await StorageService.getPatientDetails(`${encounterId}_vitals`) || [];
    }
  },

  createVitals: async (encounterId: number, data: any) => {
    if (await StorageService.isOnline()) {
        return extendedApi.post(`/vitals/encounter/${encounterId}`, data).then((res: any) => res.data);
    } else {
        await StorageService.queueAction({
            type: 'CREATE_VITALS',
            payload: { encounterId, ...data }
        });
        return { success: true, offline: true, message: 'Vitals saved offline' };
    }
  },

  // Radiology - Offline Capable
  getRadiologyOrders: async (encounterId: number) => {
    if (await StorageService.isOnline()) {
        try {
            const res = await api.get(`/radiology/encounters/${encounterId}/orders`);
            await StorageService.savePatientDetails(`${encounterId}_radiology`, res.data);
            return res.data;
        } catch(e) {
            console.warn("Online fetch radiology failed", e);
            return await StorageService.getPatientDetails(`${encounterId}_radiology`) || [];
        }
    } else {
       return await StorageService.getPatientDetails(`${encounterId}_radiology`) || [];
    }
  },

  // Nursing / eMAR - Offline Capable
  getPatientMAR: async (encounterId: number) => {
    if (await StorageService.isOnline()) {
        try {
            const res = await extendedApi.get(`/nursing/encounters/${encounterId}/mar`);
            await StorageService.savePatientDetails(`${encounterId}_mar`, res.data);
            return res.data;
        } catch(e) {
            console.warn("Online fetch MAR failed", e);
            return await StorageService.getPatientDetails(`${encounterId}_mar`) || [];
        }
    } else {
        return await StorageService.getPatientDetails(`${encounterId}_mar`) || [];
    }
  },

  administerMedication: async (encounterId: number, prescriptionItemId: number, status: string, notes?: string) => {
    if (await StorageService.isOnline()) {
        return extendedApi.post(`/nursing/encounters/${encounterId}/administer-med`, {
          prescriptionItemId,
          status, 
          notes
        }).then((res: any) => res.data);
    } else {
        await StorageService.queueAction({
            type: 'ADMINISTER_MED',
            payload: { encounterId, prescriptionItemId, status, notes }
        });
        return { success: true, offline: true, message: 'Administration queued offline' };
    }
  },

  // Push Notifications
  registerDevice: (token: string, platform?: string) =>
    extendedApi.post('/notifications/devices', { token, platform }).then((res: any) => res.data),
  // Pharmacy & Inventory
  getPharmacyWorklist: async (page?: number, limit?: number): Promise<PharmacyWorklistItem[]> => {
    if (await StorageService.isOnline()) {
        try {
            const url = page && limit ? `/pharmacy/worklist?page=${page}&limit=${limit}` : '/pharmacy/worklist';
            const res = await api.get(url);
            const items = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            
            if (items && items.length > 0 && (!page || page === 1)) {
                await StorageService.savePatientDetails('pharmacy_worklist', items);
            }
            return items;
        } catch(e) {
            console.warn("Online fetch pharmacy worklist failed", e);
            return await StorageService.getPatientDetails('pharmacy_worklist') || [];
        }
    } else {
        return await StorageService.getPatientDetails('pharmacy_worklist') || [];
    }
  },

  getDrugStock: async (query?: string): Promise<StockItem[]> => {
    // Stock is large, maybe only cache if query is empty (full list) or handles specifics?
    // For simplicity, we cache the full list if query is empty
    if (await StorageService.isOnline()) {
        try {
            const res = await api.get('/pharmacy/stock', { params: { q: query } });
            if (!query) {
                await StorageService.savePatientDetails('pharmacy_stock', res.data);
            }
            return res.data;
        } catch(e) {
             if (!query) {
                 return await StorageService.getPatientDetails('pharmacy_stock') || [];
             }
             throw e;
        }
    } else {
        if (!query) {
            return await StorageService.getPatientDetails('pharmacy_stock') || [];
        }
        return [];
    }
  },

  dispensePrescription: async (prescriptionId: number, items: DispensePrescriptionItemPayload[], notes?: string): Promise<any> => {
    // Offline dispensing is tricky due to stock checks. 
    // We will allow queuing but warn user that stock might not be available.
    if (await StorageService.isOnline()) {
        return api.post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, { items, notes }).then((res) => res.data);
    } else {
         await StorageService.queueAction({
            type: 'DISPENSE_PRESCRIPTION',
            payload: { prescriptionId, items, notes }
        });
        return { success: true, offline: true, message: 'Dispense queued offline' };
    }
  },

  getPatientAlerts: async (patientId: number): Promise<CDSSAlert[]> => {
    if (await StorageService.isOnline()) {
        try {
            const res = await api.get(`/cdss/alerts/patient/${patientId}`);
            return res.data || [];
        } catch(e) {
            console.warn("Online fetch CDSS alerts failed", e);
            return [];
        }
    } else {
        return [];
    }
  },

  adjustStock: async (drugItemId: number, quantity: number, type: 'IN' | 'ADJUST', reason?: string): Promise<any> => {
      if (await StorageService.isOnline()) {
        return api.post('/pharmacy/stock/transactions', { drugItemId, quantity, type, notes: reason }).then((res) => res.data);
      } else {
           await StorageService.queueAction({
            type: 'ADJUST_STOCK',
            payload: { drugItemId, quantity, type, reason }
        });
        return { success: true, offline: true, message: 'Adjustment queued offline' };
      }
  }
};

export default extendedApi;
