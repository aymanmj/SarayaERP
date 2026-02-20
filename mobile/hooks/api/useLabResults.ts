import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export const useGetLabOrders = (encounterId: number) => {
  return useQuery({
    queryKey: ['labOrders', encounterId],
    queryFn: async () => {
      const data = await api.getLabOrders(encounterId);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!encounterId,
  });
};
