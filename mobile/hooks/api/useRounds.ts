import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../../services/api';

export function useGetRounds(limit: number = 10) {
  return useInfiniteQuery({
    queryKey: ['rounds'],
    queryFn: ({ pageParam = 1 }) => api.getMyRotation(pageParam, limit),
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === limit ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 1000 * 60 * 5,
  });
}
