import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export function useGetVitals(encounterId: number) {
  return useQuery({
    queryKey: ['vitals', encounterId],
    queryFn: () => api.getVitals(encounterId),
    enabled: !!encounterId,
    staleTime: 1000 * 60 * 5,
  });
}
