import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { PharmacyWorklistItem } from '../../types';

export const usePharmacyWorklist = (limit: number = 10) => {
  return useInfiniteQuery({
    queryKey: ['pharmacyWorklist', limit],
    queryFn: async ({ pageParam = 1 }) => {
      const data = await api.getPharmacyWorklist(pageParam, limit);
      return (data || []) as PharmacyWorklistItem[];
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: PharmacyWorklistItem[], allPages: PharmacyWorklistItem[][]) => {
      if (lastPage.length < limit) {
        return undefined;
      }
      return allPages.length + 1;
    },
  });
};
