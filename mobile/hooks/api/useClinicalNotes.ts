import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export function useGetClinicalNotes(encounterId: number) {
  return useQuery({
    queryKey: ['clinicalNotes', encounterId],
    queryFn: () => api.getClinicalNotes(encounterId),
    enabled: !!encounterId,
    staleTime: 1000 * 60 * 5,
  });
}
