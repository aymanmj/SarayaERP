
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

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

// Extend the api object with custom methods
const extendedApi = {
  ...api,
  get: api.get,
  post: api.post,
  put: api.put,
  delete: api.delete,
  defaults: api.defaults,
  interceptors: api.interceptors,
  
  // Clinical Notes
  getClinicalNotes: (encounterId: number) => 
    api.get(`/clinical-notes/encounter/${encounterId}`).then((res) => res.data),

  createClinicalNote: (encounterId: number, content: string, type: string = 'DOCTOR_ROUND') =>
    api.post('/clinical-notes', { encounterId, content, type }).then((res) => res.data),

  // Lab Results
  getLabOrders: (encounterId: number) =>
    api.get(`/lab/encounters/${encounterId}/orders`).then((res) => res.data),
};

export default extendedApi;
