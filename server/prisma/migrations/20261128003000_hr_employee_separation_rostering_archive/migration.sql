-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'RESIGNED', 'PROBATION');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PERMANENT', 'TEMPORARY', 'PART_TIME', 'LOCUM', 'CONSULTANT_CONTRACT', 'PROBATION');

-- CreateEnum
CREATE TYPE "StaffCategory" AS ENUM ('MEDICAL', 'NURSING', 'ALLIED_HEALTH', 'PHARMACY', 'LABORATORY', 'RADIOLOGY', 'ADMINISTRATIVE', 'SUPPORT_SERVICES', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "RosterDayType" AS ENUM ('WORK', 'REST', 'OFF', 'LEAVE');

-- CreateEnum
CREATE TYPE "EmployeeActionType" AS ENUM ('HIRE', 'PROMOTION', 'TRANSFER', 'SALARY_CHANGE', 'WARNING', 'SUSPENSION', 'REINSTATEMENT', 'TERMINATION', 'RESIGNATION');

-- CreateEnum
CREATE TYPE "CorrespondenceType" AS ENUM ('INCOMING', 'OUTGOING', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CorrespondencePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CorrespondenceStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'REPLIED', 'ARCHIVED', 'CLOSED');

-- DropForeignKey
ALTER TABLE "AttendanceRecord" DROP CONSTRAINT "AttendanceRecord_userId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeRoster" DROP CONSTRAINT "EmployeeRoster_userId_fkey";

-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_userId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollSlip" DROP CONSTRAINT "PayrollSlip_userId_fkey";

-- DropForeignKey
ALTER TABLE "StaffCredential" DROP CONSTRAINT "StaffCredential_userId_fkey";

-- AlterTable
ALTER TABLE "AttendanceMovement" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "employeeId" INTEGER,
ADD COLUMN     "hospitalId" INTEGER,
ADD COLUMN     "overtimeHours" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "shiftId" INTEGER,
ADD COLUMN     "source" VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "BiometricPunchLog" ADD COLUMN     "employeeId" INTEGER;

-- AlterTable
ALTER TABLE "EmployeeAdvance" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmployeeDeduction" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmployeeRoster" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmployeeSettlement" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OvertimeRequest" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PayrollSlip" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StaffCredential" ADD COLUMN     "employeeId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkShift" ADD COLUMN     "code" VARCHAR(16),
ADD COLUMN     "holidayMultiplier" DECIMAL(6,3) NOT NULL DEFAULT 2.0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isFlexible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOvernight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isScrubShift" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "nightAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "overtimeMultiplier" DECIMAL(6,3) NOT NULL DEFAULT 1.5,
ADD COLUMN     "workHours" DECIMAL(6,3) NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "nameEn" VARCHAR(160),
    "code" VARCHAR(48),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "nameEn" VARCHAR(160),
    "code" VARCHAR(48),
    "level" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeNo" VARCHAR(64) NOT NULL,
    "altamamEmployeeNo" VARCHAR(64),
    "biometricId" VARCHAR(64),
    "userId" INTEGER,
    "firstNameAr" VARCHAR(120) NOT NULL,
    "secondNameAr" VARCHAR(120) NOT NULL DEFAULT '',
    "thirdNameAr" VARCHAR(120) NOT NULL DEFAULT '',
    "lastNameAr" VARCHAR(120) DEFAULT '',
    "firstNameEn" VARCHAR(120),
    "secondNameEn" VARCHAR(120),
    "thirdNameEn" VARCHAR(120),
    "lastNameEn" VARCHAR(120),
    "fullName" VARCHAR(255) NOT NULL,
    "photoPath" VARCHAR(500),
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender" NOT NULL DEFAULT 'MALE',
    "nationality" VARCHAR(80),
    "religion" VARCHAR(80),
    "maritalStatus" "MaritalStatus",
    "dependentsCount" INTEGER NOT NULL DEFAULT 0,
    "nationalId" VARCHAR(64),
    "nationalIdExpiry" TIMESTAMP(3),
    "passportNo" VARCHAR(64),
    "passportExpiry" TIMESTAMP(3),
    "residenceNo" VARCHAR(64),
    "residenceExpiry" TIMESTAMP(3),
    "phone" VARCHAR(64),
    "phone2" VARCHAR(64),
    "email" VARCHAR(160),
    "address" VARCHAR(255),
    "city" VARCHAR(120),
    "emergencyContactName" VARCHAR(160),
    "emergencyContactPhone" VARCHAR(64),
    "emergencyRelation" VARCHAR(80),
    "departmentId" INTEGER,
    "sectionId" INTEGER,
    "jobTitleId" INTEGER,
    "secondaryDepartmentId" INTEGER,
    "secondaryJobTitleId" INTEGER,
    "managerId" INTEGER,
    "specialtyId" INTEGER,
    "staffCategory" "StaffCategory" NOT NULL DEFAULT 'ADMINISTRATIVE',
    "medicalRank" "JobRank",
    "hireDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractType" "ContractType" NOT NULL DEFAULT 'PERMANENT',
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "probationEndDate" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminationDate" TIMESTAMP(3),
    "terminationReason" VARCHAR(500),
    "payBasis" VARCHAR(24) NOT NULL DEFAULT 'MONTHLY',
    "basicSalary" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "fixedShift6hRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "fixedShift12hRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "fixedShift24hRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "onCallDailyRate" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "standardMonthlyHours" INTEGER NOT NULL DEFAULT 160,
    "currency" VARCHAR(12) NOT NULL DEFAULT 'LYD',
    "bankName" VARCHAR(120),
    "bankAccountNo" VARCHAR(80),
    "iban" VARCHAR(64),
    "socialInsuranceNo" VARCHAR(64),
    "socialInsuranceRate" DECIMAL(19,6),
    "medicalInsuranceNo" VARCHAR(64),
    "medicalInsuranceClass" VARCHAR(64),
    "medicalInsuranceExpiry" TIMESTAMP(3),
    "isTaxExempt" BOOLEAN NOT NULL DEFAULT false,
    "isSocialInsuranceExempt" BOOLEAN NOT NULL DEFAULT false,
    "payrollExemptionReason" VARCHAR(255),
    "annualLeaveBalance" INTEGER NOT NULL DEFAULT 21,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeQualification" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "degree" VARCHAR(120) NOT NULL,
    "major" VARCHAR(160),
    "institution" VARCHAR(200) NOT NULL,
    "graduationYear" INTEGER,
    "grade" VARCHAR(64),
    "documentRef" VARCHAR(255),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTrainingCourse" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "courseName" VARCHAR(200) NOT NULL,
    "provider" VARCHAR(200) NOT NULL,
    "completionDate" TIMESTAMP(3),
    "hoursCount" INTEGER,
    "certificateNo" VARCHAR(120),
    "documentRef" VARCHAR(255),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(80),
    "storagePath" VARCHAR(500) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "expiryDate" TIMESTAMP(3),
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(500),
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAction" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "actionType" "EmployeeActionType" NOT NULL,
    "fromValue" VARCHAR(255),
    "toValue" VARCHAR(255),
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" VARCHAR(500),
    "approvedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "entitledDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "usedDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carriedOverDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeShiftDay" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "rosterDate" DATE NOT NULL,
    "dayType" "RosterDayType" NOT NULL DEFAULT 'WORK',
    "shiftId" INTEGER,
    "notes" VARCHAR(500),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeShiftDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPeriod" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "attendanceRecordId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "periodType" VARCHAR(24) NOT NULL DEFAULT 'WORK',
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveCategory" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "nameEn" VARCHAR(160),
    "parentId" INTEGER,
    "code" VARCHAR(48) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveDocument" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "documentNo" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "categoryId" INTEGER,
    "description" VARCHAR(1000),
    "date" DATE NOT NULL,
    "storagePath" VARCHAR(500),
    "originalName" VARCHAR(255),
    "mimeType" VARCHAR(120),
    "fileSize" INTEGER,
    "sha256" VARCHAR(64),
    "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[],
    "relatedEntityType" VARCHAR(64),
    "relatedEntityId" INTEGER,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storagePath" VARCHAR(500) NOT NULL,
    "originalName" VARCHAR(255),
    "mimeType" VARCHAR(120),
    "fileSize" INTEGER,
    "sha256" VARCHAR(64),
    "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondence" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "correspondenceNo" VARCHAR(64) NOT NULL,
    "type" "CorrespondenceType" NOT NULL,
    "date" DATE NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "senderName" VARCHAR(160),
    "senderOrg" VARCHAR(200),
    "receiverName" VARCHAR(160),
    "receiverOrg" VARCHAR(200),
    "referenceNo" VARCHAR(120),
    "relatedCorrespondenceId" INTEGER,
    "priority" "CorrespondencePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CorrespondenceStatus" NOT NULL DEFAULT 'NEW',
    "notes" VARCHAR(1000),
    "documentId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrespondenceRouting" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "correspondenceId" INTEGER NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "instructions" VARCHAR(500),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "actionTaken" VARCHAR(500),
    "notes" VARCHAR(500),

    CONSTRAINT "CorrespondenceRouting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Section_hospitalId_departmentId_idx" ON "Section"("hospitalId", "departmentId");

-- CreateIndex
CREATE INDEX "JobTitle_hospitalId_isActive_idx" ON "JobTitle"("hospitalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_hospitalId_departmentId_idx" ON "Employee"("hospitalId", "departmentId");

-- CreateIndex
CREATE INDEX "Employee_hospitalId_status_isActive_idx" ON "Employee"("hospitalId", "status", "isActive");

-- CreateIndex
CREATE INDEX "Employee_hospitalId_staffCategory_idx" ON "Employee"("hospitalId", "staffCategory");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_hospitalId_employeeNo_key" ON "Employee"("hospitalId", "employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_hospitalId_altamamEmployeeNo_key" ON "Employee"("hospitalId", "altamamEmployeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_hospitalId_biometricId_key" ON "Employee"("hospitalId", "biometricId");

-- CreateIndex
CREATE INDEX "EmployeeQualification_hospitalId_employeeId_idx" ON "EmployeeQualification"("hospitalId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeTrainingCourse_hospitalId_employeeId_idx" ON "EmployeeTrainingCourse"("hospitalId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_hospitalId_employeeId_idx" ON "EmployeeDocument"("hospitalId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_hospitalId_expiryDate_idx" ON "EmployeeDocument"("hospitalId", "expiryDate");

-- CreateIndex
CREATE INDEX "EmployeeAction_hospitalId_employeeId_idx" ON "EmployeeAction"("hospitalId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_hospitalId_employeeId_year_leaveType_key" ON "LeaveBalance"("hospitalId", "employeeId", "year", "leaveType");

-- CreateIndex
CREATE INDEX "ShiftAssignment_hospitalId_employeeId_startDate_idx" ON "ShiftAssignment"("hospitalId", "employeeId", "startDate");

-- CreateIndex
CREATE INDEX "EmployeeShiftDay_hospitalId_rosterDate_idx" ON "EmployeeShiftDay"("hospitalId", "rosterDate");

-- CreateIndex
CREATE INDEX "EmployeeShiftDay_shiftId_idx" ON "EmployeeShiftDay"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeShiftDay_employeeId_rosterDate_key" ON "EmployeeShiftDay"("employeeId", "rosterDate");

-- CreateIndex
CREATE INDEX "WorkPeriod_attendanceRecordId_idx" ON "WorkPeriod"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "ArchiveCategory_hospitalId_isActive_idx" ON "ArchiveCategory"("hospitalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveCategory_hospitalId_code_key" ON "ArchiveCategory"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "ArchiveDocument_hospitalId_categoryId_idx" ON "ArchiveDocument"("hospitalId", "categoryId");

-- CreateIndex
CREATE INDEX "ArchiveDocument_hospitalId_date_idx" ON "ArchiveDocument"("hospitalId", "date");

-- CreateIndex
CREATE INDEX "ArchiveDocument_hospitalId_relatedEntityType_relatedEntityI_idx" ON "ArchiveDocument"("hospitalId", "relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveDocument_hospitalId_documentNo_key" ON "ArchiveDocument"("hospitalId", "documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "Correspondence_hospitalId_type_date_idx" ON "Correspondence"("hospitalId", "type", "date");

-- CreateIndex
CREATE INDEX "Correspondence_hospitalId_status_idx" ON "Correspondence"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Correspondence_hospitalId_correspondenceNo_key" ON "Correspondence"("hospitalId", "correspondenceNo");

-- CreateIndex
CREATE INDEX "CorrespondenceRouting_hospitalId_toUserId_readAt_idx" ON "CorrespondenceRouting"("hospitalId", "toUserId", "readAt");

-- CreateIndex
CREATE INDEX "CorrespondenceRouting_correspondenceId_idx" ON "CorrespondenceRouting"("correspondenceId");

-- CreateIndex
CREATE INDEX "AttendanceMovement_hospitalId_employeeId_movementTime_idx" ON "AttendanceMovement"("hospitalId", "employeeId", "movementTime");

-- CreateIndex
CREATE INDEX "AttendanceRecord_hospitalId_date_idx" ON "AttendanceRecord"("hospitalId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE INDEX "BiometricPunchLog_hospitalId_employeeId_punchTime_idx" ON "BiometricPunchLog"("hospitalId", "employeeId", "punchTime");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_hospitalId_employeeId_status_idx" ON "EmployeeAdvance"("hospitalId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeDeduction_hospitalId_employeeId_isActive_idx" ON "EmployeeDeduction"("hospitalId", "employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRoster_employeeId_date_key" ON "EmployeeRoster"("employeeId", "date");

-- CreateIndex
CREATE INDEX "EmployeeSettlement_hospitalId_employeeId_status_idx" ON "EmployeeSettlement"("hospitalId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_hospitalId_employeeId_status_idx" ON "LeaveRequest"("hospitalId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "OvertimeRequest_hospitalId_employeeId_date_idx" ON "OvertimeRequest"("hospitalId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "PayrollSlip_payrollRunId_employeeId_idx" ON "PayrollSlip"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "StaffCredential_hospitalId_employeeId_credentialType_idx" ON "StaffCredential"("hospitalId", "employeeId", "credentialType");

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRoster" ADD CONSTRAINT "EmployeeRoster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRoster" ADD CONSTRAINT "EmployeeRoster_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCredential" ADD CONSTRAINT "StaffCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCredential" ADD CONSTRAINT "StaffCredential_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDeduction" ADD CONSTRAINT "EmployeeDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSettlement" ADD CONSTRAINT "EmployeeSettlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricPunchLog" ADD CONSTRAINT "BiometricPunchLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMovement" ADD CONSTRAINT "AttendanceMovement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTitle" ADD CONSTRAINT "JobTitle_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_secondaryDepartmentId_fkey" FOREIGN KEY ("secondaryDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_secondaryJobTitleId_fkey" FOREIGN KEY ("secondaryJobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTrainingCourse" ADD CONSTRAINT "EmployeeTrainingCourse_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTrainingCourse" ADD CONSTRAINT "EmployeeTrainingCourse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAction" ADD CONSTRAINT "EmployeeAction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAction" ADD CONSTRAINT "EmployeeAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAction" ADD CONSTRAINT "EmployeeAction_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftDay" ADD CONSTRAINT "EmployeeShiftDay_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftDay" ADD CONSTRAINT "EmployeeShiftDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftDay" ADD CONSTRAINT "EmployeeShiftDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftDay" ADD CONSTRAINT "EmployeeShiftDay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPeriod" ADD CONSTRAINT "WorkPeriod_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPeriod" ADD CONSTRAINT "WorkPeriod_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveCategory" ADD CONSTRAINT "ArchiveCategory_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveCategory" ADD CONSTRAINT "ArchiveCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveDocument" ADD CONSTRAINT "ArchiveDocument_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveDocument" ADD CONSTRAINT "ArchiveDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveDocument" ADD CONSTRAINT "ArchiveDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ArchiveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_relatedCorrespondenceId_fkey" FOREIGN KEY ("relatedCorrespondenceId") REFERENCES "Correspondence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ArchiveDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceRouting" ADD CONSTRAINT "CorrespondenceRouting_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceRouting" ADD CONSTRAINT "CorrespondenceRouting_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "Correspondence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceRouting" ADD CONSTRAINT "CorrespondenceRouting_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceRouting" ADD CONSTRAINT "CorrespondenceRouting_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

