import { SetMetadata } from '@nestjs/common';

export const CLINICAL_RELATION_KEY = 'requireClinicalRelation';

export interface ClinicalRelationOptions {
  paramName: string; // The request param that contains the patientId e.g., 'id' or 'patientId'
  allowBreakGlass?: boolean; // Whether the user is allowed to override this guard in emergencies (Audited)
}

export const RequireClinicalRelation = (options: ClinicalRelationOptions) =>
  SetMetadata(CLINICAL_RELATION_KEY, options);
