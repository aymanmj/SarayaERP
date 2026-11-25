import {
  IsBoolean,
  IsUUID,
  MaxLength,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdministrationStatus } from '@prisma/client';

export class VerifyFiveRightsDto {
  @ApiProperty({ description: 'Prescription Item ID' })
  @IsInt()
  @Min(1)
  prescriptionItemId: number;

  @ApiProperty({ description: 'Scanned Patient Wristband Barcode (MRN or ID)' })
  @IsString()
  @IsNotEmpty()
  patientBarcode: string;

  @ApiProperty({
    description: 'Scanned Drug Barcode (Barcode or Product Code)',
  })
  @IsString()
  @IsNotEmpty()
  drugBarcode: string;

  @ApiPropertyOptional({
    description: 'Nurse-confirmed dose for Right #3 check',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  confirmedDose?: string;

  @ApiPropertyOptional({
    description: 'Nurse-confirmed administration route for Right #4 check',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  confirmedRoute?: string;

  @ApiPropertyOptional({
    description: 'Scheduled MAR slot (YYYY-MM-DDTHH:mm) for Right #5 check',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  scheduledSlot?: string;
}

class MedicationRequestDto {
  @IsUUID('4') requestId!: string;
  @ApiPropertyOptional({
    description: 'Local dose slot returned by the MAR schedule',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  scheduledSlot?: string;
}

export class AdministerBarcodeDto extends MedicationRequestDto {
  @ApiProperty({ description: 'Prescription Item ID' })
  @IsInt()
  @Min(1)
  prescriptionItemId: number;

  @ApiProperty({ description: 'Scanned Patient Wristband Barcode' })
  @IsString()
  @IsNotEmpty()
  patientBarcode: string;

  @ApiProperty({ description: 'Scanned Drug Barcode' })
  @IsString()
  @IsNotEmpty()
  drugBarcode: string;

  @ApiPropertyOptional({ description: 'Nurse-confirmed dose (Right #3)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  confirmedDose?: string;

  @ApiPropertyOptional({ description: 'Nurse-confirmed route (Right #4)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  confirmedRoute?: string;

  @ApiPropertyOptional({
    description: 'Emergency override flag if 5-rights mismatch',
  })
  @IsOptional()
  @IsBoolean()
  isEmergencyOverride?: boolean;

  @ApiPropertyOptional({
    description: 'Required reason if emergency override is active',
  })
  @IsOptional()
  @IsString()
  varianceReason?: string;

  @ApiPropertyOptional({ description: 'Clinical administration notes' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class AdministerMedicationDto extends MedicationRequestDto {
  @ApiProperty({ description: 'Prescription Item ID' })
  @IsInt()
  @Min(1)
  prescriptionItemId: number;

  @ApiProperty({
    enum: AdministrationStatus,
    description: 'Administration status',
  })
  @IsEnum(AdministrationStatus)
  status: AdministrationStatus;

  @ApiPropertyOptional({ description: 'Reason or notes for administration' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class AddNursingNoteDto {
  @ApiProperty({ description: 'Clinical nursing note' })
  @IsString()
  @IsNotEmpty()
  note: string;

  @ApiPropertyOptional({ description: 'Shift handover flag' })
  @IsOptional()
  @IsBoolean()
  isShiftHandover?: boolean;
}
