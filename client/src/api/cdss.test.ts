import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock apiClient BEFORE importing
vi.mock('./apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

import { cdssApi } from './cdss';
import { apiClient } from './apiClient';

describe('cdssApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── checkVitals ───────────────────────────────────────────
  describe('checkVitals', () => {
    it('should send vitals to backend and return alerts', async () => {
      const mockAlerts = [
        {
          type: 'VITAL_ABNORMAL',
          severity: 'HIGH',
          message: 'Blood pressure critically high',
          requiresOverride: true,
        },
      ];

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { alerts: mockAlerts, savedCount: 1 },
      });

      const result = await cdssApi.checkVitals({
        patientId: 1,
        bpSystolic: 200,
        bpDiastolic: 130,
      });

      expect(apiClient.post).toHaveBeenCalledWith('/cdss/check-vitals', {
        patientId: 1,
        bpSystolic: 200,
        bpDiastolic: 130,
      });
      expect(result).toEqual(mockAlerts);
    });

    it('should return empty alerts when no issues detected', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { alerts: [], savedCount: 0 },
      });

      const result = await cdssApi.checkVitals({
        patientId: 1,
        temperature: 37.0,
        pulse: 72,
      });

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network Error')
      );

      await expect(
        cdssApi.checkVitals({ patientId: 1 })
      ).rejects.toThrow('Network Error');
    });
  });

  // ─── checkLabResult ────────────────────────────────────────
  describe('checkLabResult', () => {
    it('should return alert array when lab result is abnormal', async () => {
      const mockAlert = {
        type: 'LAB_ABNORMAL',
        severity: 'MODERATE',
        message: 'Glucose level elevated',
        requiresOverride: false,
      };

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { alert: mockAlert, saved: true },
      });

      const result = await cdssApi.checkLabResult({
        patientId: 1,
        testCode: 'GLUCOSE',
        value: 300,
        unit: 'mg/dL',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/cdss/check-lab-result', {
        patientId: 1,
        testCode: 'GLUCOSE',
        value: 300,
        unit: 'mg/dL',
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockAlert);
    });

    it('should return empty array when lab result is normal', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { alert: null, saved: false },
      });

      const result = await cdssApi.checkLabResult({
        patientId: 1,
        testCode: 'CBC',
        value: 12.5,
        unit: 'g/dL',
      });

      expect(result).toEqual([]);
    });
  });

  // ─── checkDrugInteractions ─────────────────────────────────
  describe('checkDrugInteractions', () => {
    it('should check drug interactions and return alerts', async () => {
      const mockAlerts = [
        {
          type: 'DRUG_INTERACTION',
          severity: 'CRITICAL',
          message: 'Warfarin + Aspirin: Major bleeding risk',
          requiresOverride: true,
        },
      ];

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockAlerts,
      });

      const result = await cdssApi.checkDrugInteractions(['Warfarin', 'Aspirin']);

      expect(apiClient.post).toHaveBeenCalledWith('/cdss/check-interactions', {
        drugs: ['Warfarin', 'Aspirin'],
      });
      expect(result).toEqual(mockAlerts);
    });

    it('should return empty array when no interactions found', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
      });

      const result = await cdssApi.checkDrugInteractions(['Paracetamol']);

      expect(result).toEqual([]);
    });
  });
});
