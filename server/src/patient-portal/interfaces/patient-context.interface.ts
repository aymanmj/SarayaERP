/**
 * Patient Portal — Type-safe JWT Payload Interface
 * 
 * This interface defines the claims embedded in patient portal tokens.
 * The 'aud' claim ensures portal tokens are logically separated from staff tokens.
 */
export interface PatientJwtPayload {
  /** Patient DB ID */
  sub: number;
  /** Medical Record Number */
  mrn: string;
  /** Hospital ID for multi-tenant data isolation */
  hospitalId: number;
  /** Role discriminator — always 'PATIENT' for portal tokens */
  role: 'PATIENT';
  /** Token type discriminator */
  type: 'access' | 'refresh';
  /** Audience — always 'patient-portal' to separate from staff JWT */
  aud: 'patient-portal';
}

export interface PatientContext {
  sub: number;
  mrn: string;
  hospitalId: number;
  role: 'PATIENT';
  aud: 'patient-portal';
}
