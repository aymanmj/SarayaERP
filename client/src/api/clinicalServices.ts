import { apiClient } from './apiClient';

const api = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (url: string, config?: any) => apiClient.get(`/clinical${url}`, config),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: (url: string, data?: any, config?: any) => apiClient.post(`/clinical${url}`, data, config),
};

export const clinicalServices = {
  // --- AI Coding ---
  suggestCodes: async (clinicalNote: string) => {
    const response = await api.post('/clinical/ai-coding/suggest', { clinicalNote });
    return response.data;
  },

  // --- Telehealth ---
  initSession: async (appointmentId: number) => {
    const response = await api.post(`/telehealth/session/${appointmentId}/init`);
    return response.data;
  },
  startSession: async (appointmentId: number) => {
    const response = await api.post(`/telehealth/session/${appointmentId}/start`);
    return response.data;
  },
  enterWaitingRoom: async (appointmentId: number) => {
    const response = await api.post(`/telehealth/session/${appointmentId}/waiting-room`);
    return response.data;
  },
  getPatientRoomAccess: async (appointmentId: number) => {
    const response = await api.get(`/telehealth/session/${appointmentId}/patient-access`);
    return response.data;
  },

  // --- Registries & Care Gaps ---
  getRegistries: async () => {
    const response = await api.get(`/registries`);
    return response.data;
  },
  getRegistry: async (registryId: number) => {
    const response = await api.get(`/registries/${registryId}`);
    return response.data;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createRegistry: async (data: any) => {
    const response = await api.post(`/registries`, data);
    return response.data;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateRegistry: async (registryId: number, data: any) => {
    const response = await apiClient.patch(`/clinical/registries/${registryId}`, data);
    return response.data;
  },
  getPatientCareGaps: async (patientId: number) => {
    const response = await api.get(`/registries/patient/${patientId}/gaps`);
    return response.data;
  },
  closeCareGap: async (gapId: number, notes: string) => {
    const response = await api.post(`/registries/gaps/${gapId}/close`, { reason: notes });
    return response.data;
  },
  getRegistryAnalytics: async (registryId: number) => {
    const response = await api.get(`/registries/${registryId}/analytics`);
    return response.data;
  },
  triggerMembershipEval: async () => {
    const response = await api.post(`/registries/trigger-membership-eval`);
    return response.data;
  },
  triggerGapsEval: async () => {
    const response = await api.post(`/registries/trigger-gaps-eval`);
    return response.data;
  },

  // --- Advanced Scheduling ---
  getResources: async (hospitalId: number) => {
    const response = await api.get(`/scheduling/hospitals/${hospitalId}/resources`);
    return response.data;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createResource: async (data: any) => {
    const response = await api.post(`/scheduling/resources`, data);
    return response.data;
  },
  getResourceBookings: async (resourceId: number, from: string, to: string) => {
    const response = await api.get(`/scheduling/resources/${resourceId}/bookings`, {
      params: { from, to },
    });
    return response.data;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBooking: async (data: any) => {
    const response = await api.post(`/scheduling/bookings`, data);
    return response.data;
  },
  cancelBooking: async (bookingId: number) => {
    const response = await api.post(`/scheduling/bookings/${bookingId}/cancel`);
    return response.data;
  },
  getWaitlist: async (hospitalId: number) => {
    const response = await api.get(`/scheduling/hospitals/${hospitalId}/waitlist`);
    return response.data;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joinWaitlist: async (data: any) => {
    const response = await api.post(`/scheduling/waitlist`, data);
    return response.data;
  },
};
