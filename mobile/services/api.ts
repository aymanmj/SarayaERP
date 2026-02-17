import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// UPDATE THIS IP WITH YOUR COMPUTER'S LAN IP
// If using Tunnel, this might not matter as much, but for LAN it's critical.
// For Android Emulator, use 'http://10.0.2.2:3000'
// For Physical Device, use your PC's IP, e.g., 'http://192.168.1.5:3000'
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

export default api;
