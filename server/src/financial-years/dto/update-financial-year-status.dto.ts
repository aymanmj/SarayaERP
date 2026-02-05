// src/financial-years/dto/update-financial-year-status.dto.ts

import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { FinancialYearStatus } from '@prisma/client';

export class UpdateFinancialYearStatusDto {
  @IsOptional()
  @IsEnum(['OPEN', 'CLOSED', 'ARCHIVED'], {
    message: 'الحالة يجب أن تكون OPEN أو CLOSED أو ARCHIVED',
  })
  status?: FinancialYearStatus;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
