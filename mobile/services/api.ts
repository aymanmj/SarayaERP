
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import StorageService from './StorageService';

// UPDATE THIS IP WITH YOUR COMPUTER'S LAN IP
const BASE_URL = "https://erp.alsarayatech.ly/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to attach the token
api.interceptors.request.use(
  async (config) => {
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

// Response interceptor to unwrap the 'data' property
api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success && response.data.data !== undefined) {
      console.log('API Response Interceptor: Unwrapping data');
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 400) {
      console.error('API Validation Error:', JSON.stringify(error.response.data, null, 2));
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

import AsyncStorage from '@react-native-async-storage/async-storage';

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
  getMyRotation: async () => {
    if (await StorageService.isOnline()) {
      try {
        const response = await api.get("/clinical/inpatient/my-rotation");
        // Save to offline storage
        if (response.data) {
             await StorageService.saveRounds(response.data);
        }
        return response.data;
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
  getPharmacyWorklist: async () => {
    if (await StorageService.isOnline()) {
        try {
            const res = await api.get('/pharmacy/worklist');
            await StorageService.savePatientDetails('pharmacy_worklist', res.data);
            return res.data;
        } catch(e) {
            console.warn("Online fetch pharmacy worklist failed", e);
            return await StorageService.getPatientDetails('pharmacy_worklist') || [];
        }
    } else {
        return await StorageService.getPatientDetails('pharmacy_worklist') || [];
    }
  },

  getDrugStock: async (query?: string) => {
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

  dispensePrescription: async (prescriptionId: number, items: any[], notes?: string) => {
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

  adjustStock: async (drugItemId: number, quantity: number, type: 'IN' | 'ADJUST', reason?: string) => {
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
