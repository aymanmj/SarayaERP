// server/src/hr/dto/employee.dto.ts
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ContractType,
  EmployeeActionType,
  EmployeeStatus,
  Gender,
  JobRank,
  MaritalStatus,
  StaffCategory,
} from '@prisma/client';

export class CreateSectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId!: number;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  code?: string;
}

export class UpdateSectionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateJobTitleDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  level?: number;
}

export class UpdateJobTitleDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  level?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateEmployeeQualificationDto {
  @IsString()
  @MaxLength(120)
  degree!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  major?: string;

  @IsString()
  @MaxLength(200)
  institution!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  graduationYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  grade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateEmployeeTrainingCourseDto {
  @IsString()
  @MaxLength(200)
  courseName!: string;

  @IsString()
  @MaxLength(200)
  provider!: string;

  @IsOptional()
  @IsDateString()
  completionDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  hoursCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  certificateNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateEmployeeActionDto {
  @IsEnum(EmployeeActionType)
  actionType!: EmployeeActionType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  toValue?: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateEmployeeDocumentMetaDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  alertDaysBefore?: number;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  employeeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  altamamEmployeeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  biometricId?: string;

  @IsString()
  @MaxLength(120)
  firstNameAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secondNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  thirdNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secondNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  thirdNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastNameEn?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  religion?: string;

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  dependentsCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationalId?: string;

  @IsOptional()
  @IsDateString()
  nationalIdExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  passportNo?: string;

  @IsOptional()
  @IsDateString()
  passportExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  residenceNo?: string;

  @IsOptional()
  @IsDateString()
  residenceExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone2?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  emergencyRelation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sectionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  jobTitleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  secondaryDepartmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  secondaryJobTitleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  managerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  specialtyId?: number;

  @IsOptional()
  @IsEnum(StaffCategory)
  staffCategory?: StaffCategory;

  @IsOptional()
  @IsEnum(JobRank)
  medicalRank?: JobRank;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsDateString()
  contractStartDate?: string;

  @IsOptional()
  @IsDateString()
  contractEndDate?: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  payBasis?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  housingAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift6hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift12hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift24hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  onCallDailyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(744)
  standardMonthlyHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  socialInsuranceNo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  socialInsuranceRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  medicalInsuranceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  medicalInsuranceClass?: string;

  @IsOptional()
  @IsDateString()
  medicalInsuranceExpiry?: string;

  @IsOptional()
  @IsBoolean()
  isTaxExempt?: boolean;

  @IsOptional()
  @IsBoolean()
  isSocialInsuranceExempt?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payrollExemptionReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  annualLeaveBalance?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeQualificationDto)
  qualifications?: CreateEmployeeQualificationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeTrainingCourseDto)
  trainingCourses?: CreateEmployeeTrainingCourseDto[];
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  employeeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  altamamEmployeeNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  biometricId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secondNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  thirdNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secondNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  thirdNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastNameEn?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  religion?: string;

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  dependentsCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationalId?: string;

  @IsOptional()
  @IsDateString()
  nationalIdExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  passportNo?: string;

  @IsOptional()
  @IsDateString()
  passportExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  residenceNo?: string;

  @IsOptional()
  @IsDateString()
  residenceExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone2?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  emergencyRelation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sectionId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  jobTitleId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  secondaryDepartmentId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  secondaryJobTitleId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  managerId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  specialtyId?: number | null;

  @IsOptional()
  @IsEnum(StaffCategory)
  staffCategory?: StaffCategory;

  @IsOptional()
  @IsEnum(JobRank)
  medicalRank?: JobRank | null;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsDateString()
  contractStartDate?: string;

  @IsOptional()
  @IsDateString()
  contractEndDate?: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsDateString()
  terminationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  terminationReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  payBasis?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  housingAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift6hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift12hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift24hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  onCallDailyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(744)
  standardMonthlyHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  socialInsuranceNo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  socialInsuranceRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  medicalInsuranceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  medicalInsuranceClass?: string;

  @IsOptional()
  @IsDateString()
  medicalInsuranceExpiry?: string;

  @IsOptional()
  @IsBoolean()
  isTaxExempt?: boolean;

  @IsOptional()
  @IsBoolean()
  isSocialInsuranceExempt?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payrollExemptionReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  annualLeaveBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BulkImportEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsObject({ each: true })
  employees!: Record<string, unknown>[];
}

export class LinkEmployeeUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleNames?: string[];

  @IsOptional()
  @IsBoolean()
  isDoctor?: boolean;
}
