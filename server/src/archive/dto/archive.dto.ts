// server/src/archive/dto/archive.dto.ts
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  CorrespondencePriority,
  CorrespondenceStatus,
  CorrespondenceType,
} from '@prisma/client';

export class CreateArchiveCategoryDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  code?: string;
}

export class UpdateArchiveCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateArchiveDocumentDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (Array.isArray(parsed)) {
            return parsed
              .map((v) => String(v).trim())
              .filter((v) => v.length > 0);
          }
        } catch {
          // Fall back to comma split
        }
      }
      return trimmed
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
    return [];
  })
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  relatedEntityType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  relatedEntityId?: number;
}

export class UpdateArchiveDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isStarred?: boolean;
}

export class CreateDocumentVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateCorrespondenceDto {
  @IsEnum(CorrespondenceType)
  type!: CorrespondenceType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsString()
  @MaxLength(255)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderOrg?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiverOrg?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  relatedCorrespondenceId?: number;

  @IsOptional()
  @IsEnum(CorrespondencePriority)
  priority?: CorrespondencePriority;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  documentId?: number;
}

export class UpdateCorrespondenceDto {
  @IsOptional()
  @IsEnum(CorrespondenceType)
  type?: CorrespondenceType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderOrg?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiverOrg?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNo?: string;

  @IsOptional()
  @IsEnum(CorrespondencePriority)
  priority?: CorrespondencePriority;

  @IsOptional()
  @IsEnum(CorrespondenceStatus)
  status?: CorrespondenceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  documentId?: number | null;
}

export class RouteCorrespondenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toUserId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AcknowledgeRoutingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionTaken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsEnum(CorrespondenceStatus)
  updateCorrespondenceStatus?: CorrespondenceStatus;
}
