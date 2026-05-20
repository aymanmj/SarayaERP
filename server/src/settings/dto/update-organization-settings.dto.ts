// src/settings/dto/update-organization-settings.dto.ts
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsString()
  legalName?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  website?: string | null;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  printHeaderFooter?: boolean;

  @IsOptional()
  @IsBoolean()
  mpiEnableFederation?: boolean;

  @IsOptional()
  @IsBoolean()
  mpiRequirePatientOTP?: boolean;

  @IsOptional()
  @IsBoolean()
  inventoryRequireMaterialRequestApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  inventoryAutoFefoAllocation?: boolean;
}
