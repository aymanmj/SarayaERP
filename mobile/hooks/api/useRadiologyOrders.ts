import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export const useGetRadiologyOrders = (encounterId: number) => {
  return useQuery({
    queryKey: ['radiologyOrders', encounterId],
    queryFn: async () => {
      const data = await api.getRadiologyOrders(encounterId);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!encounterId,
  });
};
