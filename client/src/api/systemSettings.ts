import { apiClient } from './apiClient';

export interface SystemSetting {
  id: number;
  hospitalId: number;
  key: string;
  value: string;
  group: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  description?: string;
  updatedAt: string;
}

export const systemSettingsApi = {
  findAll: async (): Promise<SystemSetting[]> => {
    const response = await apiClient.get('/system-settings');
    return response.data;
  },

  update: async (key: string, value: string): Promise<SystemSetting> => {
    const response = await apiClient.patch(`/system-settings/${key}`, { value });
    return response.data;
  },
};
