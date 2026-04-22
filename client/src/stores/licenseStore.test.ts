import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock apiClient before importing the store
vi.mock('../api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { useLicenseStore } from './licenseStore';
import { apiClient } from '../api/apiClient';

describe('licenseStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Reset the store to initial state
    useLicenseStore.getState().stopPeriodicCheck();
    useLicenseStore.setState({
      licenseState: 'idle',
      machineId: '',
      details: null,
      edition: 'STANDARD',
      features: [],
      errorMessage: null,
      hasFetched: false,
    });
  });

  afterEach(() => {
    useLicenseStore.getState().stopPeriodicCheck();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── Initial State ─────────────────────────────────────────
  describe('Initial State', () => {
    it('should have idle license state', () => {
      expect(useLicenseStore.getState().licenseState).toBe('idle');
    });

    it('should have STANDARD edition by default', () => {
      expect(useLicenseStore.getState().edition).toBe('STANDARD');
    });

    it('should not have fetched yet', () => {
      expect(useLicenseStore.getState().hasFetched).toBe(false);
    });

    it('should have empty features', () => {
      expect(useLicenseStore.getState().features).toEqual([]);
    });
  });

  // ─── isModuleEnabled ───────────────────────────────────────
  describe('isModuleEnabled', () => {
    it('should return false when license is not active', () => {
      useLicenseStore.setState({ licenseState: 'idle' });
      expect(useLicenseStore.getState().isModuleEnabled('PHARMACY')).toBe(false);
    });

    it('should return false when details have no modules', () => {
      useLicenseStore.setState({
        licenseState: 'active',
        details: { modules: undefined },
      });
      expect(useLicenseStore.getState().isModuleEnabled('PHARMACY')).toBe(false);
    });

    it('should return true when module is in list (case-insensitive match)', () => {
      useLicenseStore.setState({
        licenseState: 'active',
        details: { modules: ['PHARMACY', 'LAB', 'RADIOLOGY'] },
      });
      expect(useLicenseStore.getState().isModuleEnabled('pharmacy')).toBe(true);
      expect(useLicenseStore.getState().isModuleEnabled('PHARMACY')).toBe(true);
    });

    it('should return false when module is NOT in list', () => {
      useLicenseStore.setState({
        licenseState: 'active',
        details: { modules: ['LAB'] },
      });
      expect(useLicenseStore.getState().isModuleEnabled('PHARMACY')).toBe(false);
    });
  });

  // ─── hasFeature ────────────────────────────────────────────
  describe('hasFeature', () => {
    it('should return false when license is not active', () => {
      useLicenseStore.setState({ licenseState: 'inactive' });
      expect(useLicenseStore.getState().hasFeature('CDSS')).toBe(false);
    });

    it('should return true when feature exists', () => {
      useLicenseStore.setState({
        licenseState: 'active',
        features: ['CDSS', 'FHIR', 'ADVANCED_BILLING'],
      });
      expect(useLicenseStore.getState().hasFeature('CDSS')).toBe(true);
    });

    it('should return false when feature does NOT exist', () => {
      useLicenseStore.setState({
        licenseState: 'active',
        features: ['CDSS'],
      });
      expect(useLicenseStore.getState().hasFeature('FHIR')).toBe(false);
    });
  });

  // ─── reset ─────────────────────────────────────────────────
  describe('reset', () => {
    it('should reset store to initial state', () => {
      useLicenseStore.setState({
        licenseState: 'active',
        machineId: 'MACHINE-123',
        details: { plan: 'ENTERPRISE', hospitalName: 'Saraya' },
        edition: 'ENTERPRISE',
        features: ['CDSS', 'FHIR'],
        errorMessage: null,
        hasFetched: true,
      });

      useLicenseStore.getState().reset();

      const state = useLicenseStore.getState();
      expect(state.licenseState).toBe('idle');
      expect(state.machineId).toBe('');
      expect(state.details).toBeNull();
      expect(state.edition).toBe('STANDARD');
      expect(state.features).toEqual([]);
      expect(state.hasFetched).toBe(false);
    });
  });

  // ─── fetchLicenseStatus ────────────────────────────────────
  describe('fetchLicenseStatus', () => {
    it('should not fetch if already fetched', async () => {
      useLicenseStore.setState({ hasFetched: true, licenseState: 'active' });

      await useLicenseStore.getState().fetchLicenseStatus();

      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should not fetch if currently loading', async () => {
      useLicenseStore.setState({ licenseState: 'loading', hasFetched: false });

      await useLicenseStore.getState().fetchLicenseStatus();

      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should set license as active on valid response', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          data: {
            isValid: true,
            machineId: 'M-001',
            plan: 'ENTERPRISE',
            hospitalName: 'Saraya Medical Center',
            expiryDate: '2027-01-01',
            maxUsers: 50,
            modules: ['PHARMACY', 'LAB'],
            daysRemaining: 365,
          },
        })
        .mockResolvedValueOnce({
          data: { edition: 'ENTERPRISE', features: ['CDSS', 'FHIR'] },
        });

      await useLicenseStore.getState().fetchLicenseStatus();

      const state = useLicenseStore.getState();
      expect(state.licenseState).toBe('active');
      expect(state.machineId).toBe('M-001');
      expect(state.details?.plan).toBe('ENTERPRISE');
      expect(state.edition).toBe('ENTERPRISE');
      expect(state.features).toEqual(['CDSS', 'FHIR']);
    });

    it('should set license as inactive on invalid response', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          data: {
            isValid: false,
            error: 'License expired',
            machineId: 'M-001',
          },
        })
        .mockResolvedValueOnce({
          data: { edition: 'STANDARD', features: [] },
        });

      await useLicenseStore.getState().fetchLicenseStatus();

      const state = useLicenseStore.getState();
      expect(state.licenseState).toBe('inactive');
      expect(state.errorMessage).toBe('License expired');
    });

    it('should handle network errors gracefully', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await useLicenseStore.getState().fetchLicenseStatus();

      const state = useLicenseStore.getState();
      expect(state.licenseState).toBe('error');
      expect(state.errorMessage).toBe('Network timeout');
    });
  });

  // ─── refetchLicenseStatus ──────────────────────────────────
  describe('refetchLicenseStatus', () => {
    it('should bypass hasFetched guard', async () => {
      useLicenseStore.setState({ hasFetched: true, licenseState: 'active' });

      (apiClient.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          data: { isValid: true, machineId: 'M-001' },
        })
        .mockResolvedValueOnce({
          data: { edition: 'STANDARD', features: [] },
        });

      await useLicenseStore.getState().refetchLicenseStatus();

      expect(apiClient.get).toHaveBeenCalled();
    });

    it('should not refetch if already loading', async () => {
      useLicenseStore.setState({ licenseState: 'loading' });

      await useLicenseStore.getState().refetchLicenseStatus();

      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });
});
