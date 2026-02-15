import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
    const response = await axios.get(`${API_URL}/system-settings`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    return response.data;
  },

  update: async (key: string, value: string): Promise<SystemSetting> => {
    const response = await axios.patch(
      `${API_URL}/system-settings/${key}`,
      { value },
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
    );
    return response.data;
  },
};
