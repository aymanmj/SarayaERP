import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface PatientJwtPayload {
  sub: number;
  hospitalId: number;
  role: 'PATIENT';
  type: 'access' | 'refresh';
  aud: string;
  mrn?: string;
  fullName?: string;
  iat?: number;
  exp?: number;
}

export type PatientAuthenticatedRequest = Request & {
  patient?: PatientJwtPayload;
};

export const CurrentPatient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PatientJwtPayload | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<PatientAuthenticatedRequest>();
    return request.patient;
  },
);
