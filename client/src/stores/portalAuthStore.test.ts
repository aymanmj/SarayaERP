import { describe, it, expect, beforeEach } from 'vitest';
import { usePortalAuthStore } from './portalAuthStore';

describe('portalAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePortalAuthStore.setState({
      isAuthenticated: false,
      patient: null,
      accessToken: null,
    });
  });

  // ─── Initial State ─────────────────────────────────────────
  describe('Initial State', () => {
    it('should not be authenticated by default', () => {
      expect(usePortalAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should have null patient by default', () => {
      expect(usePortalAuthStore.getState().patient).toBeNull();
    });

    it('should have null accessToken by default', () => {
      expect(usePortalAuthStore.getState().accessToken).toBeNull();
    });
  });

  // ─── Login ─────────────────────────────────────────────────
  describe('login', () => {
    const mockPatient = {
      id: 42,
      fullName: 'Ahmed Mohamed',
      mrn: 'MRN-001',
    };

    it('should set authenticated state on login', () => {
      usePortalAuthStore.getState().login(mockPatient, 'access-123', 'refresh-456');

      const state = usePortalAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.patient).toEqual(mockPatient);
      expect(state.accessToken).toBe('access-123');
    });

    it('should persist tokens and patient to localStorage', () => {
      usePortalAuthStore.getState().login(mockPatient, 'access-123', 'refresh-456');

      expect(localStorage.getItem('portal_access_token')).toBe('access-123');
      expect(localStorage.getItem('portal_refresh_token')).toBe('refresh-456');
      expect(localStorage.getItem('portal_patient')).toBe(JSON.stringify(mockPatient));
    });
  });

  // ─── Logout ────────────────────────────────────────────────
  describe('logout', () => {
    it('should clear all auth state on logout', () => {
      // Setup authenticated state first
      usePortalAuthStore.setState({
        isAuthenticated: true,
        patient: { id: 1, fullName: 'Test', mrn: 'MRN-TEST' },
        accessToken: 'token-123',
      });

      usePortalAuthStore.getState().logout();

      const state = usePortalAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.patient).toBeNull();
      expect(state.accessToken).toBeNull();
    });

    it('should clear localStorage on logout', () => {
      localStorage.setItem('portal_access_token', 'token');
      localStorage.setItem('portal_refresh_token', 'refresh');
      localStorage.setItem('portal_patient', '{}');

      usePortalAuthStore.getState().logout();

      expect(localStorage.getItem('portal_access_token')).toBeNull();
      expect(localStorage.getItem('portal_refresh_token')).toBeNull();
      expect(localStorage.getItem('portal_patient')).toBeNull();
    });
  });

  // ─── Hydrate From Storage ─────────────────────────────────
  describe('hydrateFromStorage', () => {
    it('should restore session from valid localStorage data', () => {
      const patient = { id: 10, fullName: 'Patient X', mrn: 'MRN-010' };
      localStorage.setItem('portal_access_token', 'valid-token');
      localStorage.setItem('portal_patient', JSON.stringify(patient));

      usePortalAuthStore.getState().hydrateFromStorage();

      const state = usePortalAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.patient).toEqual(patient);
      expect(state.accessToken).toBe('valid-token');
    });

    it('should not hydrate if token is missing', () => {
      localStorage.setItem('portal_patient', '{"id":1}');
      // No token set

      usePortalAuthStore.getState().hydrateFromStorage();

      expect(usePortalAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should not hydrate if patient data is missing', () => {
      localStorage.setItem('portal_access_token', 'token');
      // No patient set

      usePortalAuthStore.getState().hydrateFromStorage();

      expect(usePortalAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should clear corrupted data and not throw', () => {
      localStorage.setItem('portal_access_token', 'token');
      localStorage.setItem('portal_patient', 'INVALID_JSON{{{');

      // Should not throw
      usePortalAuthStore.getState().hydrateFromStorage();

      expect(usePortalAuthStore.getState().isAuthenticated).toBe(false);
      expect(localStorage.getItem('portal_access_token')).toBeNull();
      expect(localStorage.getItem('portal_refresh_token')).toBeNull();
      expect(localStorage.getItem('portal_patient')).toBeNull();
    });
  });
});
