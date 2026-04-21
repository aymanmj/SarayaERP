/**
 * Patient Portal — Auth Store (Zustand)
 * 
 * Manages patient authentication state:
 * - OTP flow (request → verify → tokens)
 * - Token storage + refresh
 * - Session hydration from localStorage
 */

import { create } from 'zustand';

interface PortalPatient {
  id: number;
  fullName: string;
  mrn: string;
}

interface PortalAuthState {
  isAuthenticated: boolean;
  patient: PortalPatient | null;
  accessToken: string | null;

  // Actions
  login: (patient: PortalPatient, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  hydrateFromStorage: () => void;
}

export const usePortalAuthStore = create<PortalAuthState>((set) => ({
  isAuthenticated: false,
  patient: null,
  accessToken: null,

  login: (patient, accessToken, refreshToken) => {
    localStorage.setItem('portal_access_token', accessToken);
    localStorage.setItem('portal_refresh_token', refreshToken);
    localStorage.setItem('portal_patient', JSON.stringify(patient));
    set({ isAuthenticated: true, patient, accessToken });
  },

  logout: () => {
    localStorage.removeItem('portal_access_token');
    localStorage.removeItem('portal_refresh_token');
    localStorage.removeItem('portal_patient');
    set({ isAuthenticated: false, patient: null, accessToken: null });
  },

  hydrateFromStorage: () => {
    const token = localStorage.getItem('portal_access_token');
    const patientJson = localStorage.getItem('portal_patient');

    if (token && patientJson) {
      try {
        const patient = JSON.parse(patientJson);
        set({ isAuthenticated: true, patient, accessToken: token });
      } catch {
        // Corrupted data, clear it
        localStorage.removeItem('portal_access_token');
        localStorage.removeItem('portal_refresh_token');
        localStorage.removeItem('portal_patient');
      }
    }
  },
}));
