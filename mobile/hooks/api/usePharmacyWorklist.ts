import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../../services/api';

export const usePharmacyWorklist = (limit: number = 10) => {
  return useInfiniteQuery({
    queryKey: ['pharmacyWorklist', limit],
    queryFn: async ({ pageParam = 1 }) => {
      const data = await api.getPharmacyWorklist(pageParam, limit);
      return data || [];
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: any[], allPages: any[]) => {
      if (lastPage.length < limit) {
        return undefined;
      }
      return allPages.length + 1;
    },
  });
};
