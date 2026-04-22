import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { systemSettingsApi } from './systemSettings';
import { apiClient } from './apiClient';

describe('systemSettingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should fetch all system settings', async () => {
      const mockSettings = [
        {
          id: 1,
          hospitalId: 1,
          key: 'hospital.name',
          value: 'Saraya Medical Center',
          group: 'general',
          type: 'STRING' as const,
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          hospitalId: 1,
          key: 'billing.tax.rate',
          value: '15',
          group: 'billing',
          type: 'NUMBER' as const,
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockSettings,
      });

      const result = await systemSettingsApi.findAll();

      expect(apiClient.get).toHaveBeenCalledWith('/system-settings');
      expect(result).toEqual(mockSettings);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no settings exist', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
      });

      const result = await systemSettingsApi.findAll();
      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update a setting by key', async () => {
      const updatedSetting = {
        id: 1,
        hospitalId: 1,
        key: 'hospital.name',
        value: 'Saraya Premium Hospital',
        group: 'general',
        type: 'STRING' as const,
        updatedAt: '2026-04-22T00:00:00Z',
      };

      (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: updatedSetting,
      });

      const result = await systemSettingsApi.update('hospital.name', 'Saraya Premium Hospital');

      expect(apiClient.patch).toHaveBeenCalledWith('/system-settings/hospital.name', {
        value: 'Saraya Premium Hospital',
      });
      expect(result).toEqual(updatedSetting);
    });

    it('should propagate errors on update failure', async () => {
      (apiClient.patch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Setting not found')
      );

      await expect(
        systemSettingsApi.update('nonexistent.key', 'value')
      ).rejects.toThrow('Setting not found');
    });
  });
});
