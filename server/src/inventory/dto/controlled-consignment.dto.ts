import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CONTROLLED_TX_TYPES,
  type ControlledTxType,
} from '../controlled-consignment.util';

export class RecordControlledTransactionDto {
  @Type(() => Number)
  @IsInt()
  warehouseId!: number;

  @Type(() => Number)
  @IsInt()
  productId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  batchNumber!: string;

  @IsIn(CONTROLLED_TX_TYPES)
  transactionType!: ControlledTxType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wastedQuantity?: number;

  @Type(() => Number)
  @IsInt()
  witnessedById!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  patientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  encounterId?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReceiveConsignmentDto {
  @Type(() => Number)
  @IsInt()
  supplierId!: number;

  @Type(() => Number)
  @IsInt()
  warehouseId!: number;

  @Type(() => Number)
  @IsInt()
  productId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  batchNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantityReceived!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  agreedUnitPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ConsumeConsignmentDto {
  @Type(() => Number)
  @IsInt()
  encounterId!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  witnessedById?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReturnConsignmentToSupplierDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RequestWardReturnDto {
  @Type(() => Number)
  @IsInt()
  warehouseId!: number;

  @Type(() => Number)
  @IsInt()
  productId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  wardId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  encounterId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsBoolean()
  sealIntact!: boolean;

  @IsBoolean()
  coldChainMaintained!: boolean;
}

export class ReviewWardReturnDto {
  @IsIn(['APPROVE_RESTOCK', 'REJECT_DESTROY'])
  decision!: 'APPROVE_RESTOCK' | 'REJECT_DESTROY';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNotes?: string;
}

export class GenerateConsignmentSupplierInvoiceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  consumptionIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
