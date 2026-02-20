import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export const useGetMedications = (encounterId: number) => {
  return useQuery({
    queryKey: ['medications', encounterId],
    queryFn: async () => {
      const data = await api.getPatientMAR(encounterId);
      return data;
    },
    enabled: !!encounterId,
  });
};
