-- CreateEnum
CREATE TYPE "BabyStatus" AS ENUM ('ALIVE', 'STILLBORN', 'NICU');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('NVD', 'ASSISTED_NVD', 'CS_ELECTIVE', 'CS_EMERGENCY', 'VBAC');

-- CreateEnum
CREATE TYPE "InductionMethod" AS ENUM ('NONE', 'OXYTOCIN', 'PROSTAGLANDIN', 'MECHANICAL');

-- CreateEnum
CREATE TYPE "PlacentaDelivery" AS ENUM ('SPONTANEOUS', 'MANUAL');

-- CreateEnum
CREATE TYPE "PerinealTear" AS ENUM ('NONE', 'DEGREE_1', 'DEGREE_2', 'DEGREE_3', 'DEGREE_4');

-- CreateEnum
CREATE TYPE "PregnancyRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('ACTIVE', 'DELIVERED', 'MISCARRIAGE', 'ECTOPIC', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CryoItemType" AS ENUM ('SPERM', 'OOCYTES', 'EMBRYO_D3', 'EMBRYO_D5', 'TESTICULAR_TISSUE');

-- CreateEnum
CREATE TYPE "CryoStatus" AS ENUM ('FROZEN', 'THAWED', 'DISCARDED', 'TRANSFERRED_OUT');

-- CreateEnum
CREATE TYPE "SpermSource" AS ENUM ('EJACULATE', 'TESE', 'PESA', 'FROZEN_SPERM');

-- CreateEnum
CREATE TYPE "FertilizationMethod" AS ENUM ('CONVENTIONAL_IVF', 'ICSI', 'IMSI', 'PICSI');

-- CreateEnum
CREATE TYPE "InfertilityType" AS ENUM ('MALE_FACTOR', 'FEMALE_FACTOR', 'COMBINED', 'UNEXPLAINED');

-- CreateEnum
CREATE TYPE "CycleType" AS ENUM ('ICSI', 'IVF', 'IUI', 'FET', 'EGG_FREEZING');

-- CreateEnum
CREATE TYPE "FertilityCaseStatus" AS ENUM ('ACTIVE', 'SUCCESSFUL', 'DISCONTINUED', 'REFERRED');

-- CreateEnum
CREATE TYPE "PregnancyResult" AS ENUM ('PENDING', 'POSITIVE', 'NEGATIVE', 'BIOCHEMICAL', 'ECTOPIC', 'MISCARRIAGE');

-- CreateEnum
CREATE TYPE "EmbryoStatus" AS ENUM ('DEVELOPING', 'TRANSFERRED', 'FROZEN', 'ARRESTED', 'DONATED');

-- CreateEnum
CREATE TYPE "SystemSettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "EncounterType" AS ENUM ('OPD', 'ER', 'IPD', 'ICU', 'NICU', 'PICU');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'NEEDS_CLEANING', 'MAINTENANCE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('LAB', 'RADIOLOGY', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "LabResultStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RadiologyStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'SOFT_DELETE', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('CONSULTATION', 'LAB', 'RADIOLOGY', 'PROCEDURE', 'SURGERY', 'BED', 'PHARMACY', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeSource" AS ENUM ('MANUAL', 'LAB_ORDER', 'RADIOLOGY_ORDER', 'BED', 'SURGERY', 'OTHER', 'PHARMACY', 'ICU');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'PARTIALLY_COMPLETED');

-- CreateEnum
CREATE TYPE "PharmacistVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'MODIFIED');

-- CreateEnum
CREATE TYPE "MedicationRoute" AS ENUM ('ORAL', 'IV', 'IM', 'SC', 'TOPICAL', 'INHALATION', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicationFrequency" AS ENUM ('ONCE', 'BID', 'TID', 'QID', 'QHS', 'PRN', 'DAILY', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'CALLED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "FinancialYearStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTRA_ASSET', 'CONTRA_REVENUE');

-- CreateEnum
CREATE TYPE "AccountingSourceModule" AS ENUM ('BILLING', 'PAYROLL', 'INVENTORY', 'MANUAL', 'OPENING', 'CLOSING', 'CASHIER', 'SUPPLIER_PAYMENT', 'PROCUREMENT_GRN', 'PROCUREMENT_INV', 'PURCHASE_RETURN', 'PATIENT_REFUND', 'INVENTORY_ADJUSTMENT', 'JOURNAL_REVERSAL', 'VOUCHER');

-- CreateEnum
CREATE TYPE "PurchaseReturnStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('DRUG', 'SUPPLY', 'ASSET', 'LAB_REAGENT', 'OTHER');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PRStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GRNStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SystemAccountKey" AS ENUM ('CASH_MAIN', 'CASH_PETTY', 'BANK_MAIN', 'RECEIVABLE_PATIENTS', 'RECEIVABLE_INSURANCE', 'REVENUE_OUTPATIENT', 'REVENUE_INPATIENT', 'REVENUE_ER', 'REVENUE_SURGERY', 'REVENUE_ICU', 'REVENUE_LAB', 'REVENUE_RADIOLOGY', 'REVENUE_PHARMACY', 'SALES_RETURNS', 'DISCOUNT_ALLOWED', 'REVENUE_WRITE_OFF', 'INVENTORY_DRUGS', 'INVENTORY_SUPPLIES', 'INVENTORY_LAB', 'INVENTORY_RADIOLOGY', 'COGS_DRUGS', 'COGS_SUPPLIES', 'COGS_LAB', 'COGS_RADIOLOGY', 'CASH_SHORT_OVER', 'ROUNDING_DIFF', 'VAT_PAYABLE', 'SALARIES_EXPENSE', 'SALARIES_PAYABLE', 'VAT_RECOVERABLE', 'PAYABLE_SUPPLIERS', 'PAYABLE_SUPPLIERS_LOCAL', 'PAYABLE_SUPPLIERS_FOREIGN', 'GRN_SUSPENSE', 'INVENTORY_GAIN', 'INVENTORY_LOSS', 'RETAINED_EARNINGS');

-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('LOCAL', 'FOREIGN');

-- CreateEnum
CREATE TYPE "DiagnosisType" AS ENUM ('PRIMARY', 'SECONDARY', 'RULE_OUT');

-- CreateEnum
CREATE TYPE "AdministrationStatus" AS ENUM ('GIVEN', 'NOT_GIVEN', 'REFUSED', 'HELD');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'EVENING', 'NIGHT', 'FULL_DAY');

-- CreateEnum
CREATE TYPE "SurgeryStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'RECOVERY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurgeryRole" AS ENUM ('SURGEON', 'ASSISTANT_SURGEON', 'ANESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_SERVICE', 'UNDER_MAINTENANCE', 'RETIRED', 'SOLD');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IntegrationProtocol" AS ENUM ('HL7_V2', 'DICOM', 'API_JSON');

-- CreateEnum
CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CopayType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "CoverageRuleType" AS ENUM ('INCLUSION', 'EXCLUSION');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('NON_URGENT', 'LESS_URGENT', 'URGENT', 'EMERGENT', 'RESUSCITATION');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "CDSSAlertType" AS ENUM ('DRUG_INTERACTION', 'DRUG_ALLERGY', 'DUPLICATE_THERAPY', 'DOSAGE_WARNING', 'LAB_CRITICAL', 'VITAL_CRITICAL', 'AGE_CONTRAINDICATION', 'RENAL_DOSE_ADJUST', 'PREGNANCY_RISK', 'DRUG_DISEASE', 'PROTOCOL_RECOMMENDATION');

-- CreateEnum
CREATE TYPE "CDSSAlertSeverity" AS ENUM ('INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CDSSAlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'OVERRIDDEN', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DrugInteractionSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'CONTRAINDICATED');

-- CreateEnum
CREATE TYPE "JobRank" AS ENUM ('CONSULTANT', 'SPECIALIST', 'RESIDENT', 'GENERAL_PRACTITIONER');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryCountType" AS ENUM ('FULL', 'QUARTERLY', 'SPOT_CHECK');

-- CreateEnum
CREATE TYPE "CarePlanType" AS ENUM ('MEDICATION', 'VITALS', 'LAB_ORDER', 'RADIOLOGY', 'DIET', 'ACTIVITY', 'NURSING_CARE', 'OTHER');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCONTINUED', 'HELD');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('NURSING_ROUTINE', 'NURSING_HANDOVER', 'DOCTOR_ROUND', 'DOCTOR_ADMISSION', 'DOCTOR_DISCHARGE', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('PERSONAL_ID', 'PASSPORT');

-- CreateEnum
CREATE TYPE "AdmissionType" AS ENUM ('EMERGENCY', 'URGENT', 'ELECTIVE', 'TRANSFER', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('SCHEDULED', 'ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING', 'DISCHARGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdmissionPriority" AS ENUM ('CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DischargeDisposition" AS ENUM ('HOME', 'TRANSFER_TO_ANOTHER_FACILITY', 'REHABILITATION', 'LONG_TERM_CARE', 'HOME_HEALTH_CARE', 'HOSPICE', 'LEFT_AGAINST_MEDICAL_ADVICE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IsolationType" AS ENUM ('NONE', 'STANDARD', 'DROPLET', 'AIRBORNE', 'CONTACT', 'PROTECTIVE');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ConsentFormType" AS ENUM ('GENERAL', 'SURGERY', 'ANESTHESIA', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferOrderStatus" AS ENUM ('REQUESTED', 'BED_ALLOCATED', 'HANDOVER_DRAFTED', 'HANDOVER_SIGNED', 'TRANSFERRED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProblemType" AS ENUM ('ACTIVE', 'RESOLVED', 'CHRONIC', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProblemSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING');

-- CreateEnum
CREATE TYPE "SmokingStatus" AS ENUM ('NEVER', 'FORMER', 'CURRENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FamilyRelation" AS ENUM ('FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'SON', 'DAUGHTER', 'GRANDFATHER', 'GRANDMOTHER', 'UNCLE', 'AUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicationSource" AS ENUM ('PATIENT_REPORTED', 'PHARMACY_RECORD', 'REFERRAL_LETTER', 'PREVIOUS_ADMISSION');

-- CreateEnum
CREATE TYPE "CareTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CareTaskType" AS ENUM ('ASSESSMENT', 'MEDICATION_CHECK', 'PATIENT_EDUCATION', 'MONITORING', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderSetItemType" AS ENUM ('LAB', 'RADIOLOGY', 'MEDICATION', 'PROCEDURE', 'NURSING');

-- CreateEnum
CREATE TYPE "PathwayEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEVIATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VarianceType" AS ENUM ('DELAY', 'OMISSION', 'COMPLICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicalContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ClinicalContentEventType" AS ENUM ('CREATED', 'UPDATED', 'VERSION_CLONED', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('PAYMENT', 'RECEIPT');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TerminologySystem" AS ENUM ('ICD10', 'SNOMED_CT', 'LOINC', 'ATC', 'RXNORM', 'LOCAL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('PATIENT_TO_DOCTOR', 'DOCTOR_TO_PATIENT', 'SYSTEM_NOTIFICATION');

-- CreateEnum
CREATE TYPE "RefillStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'DISPENSED');

-- CreateTable
CREATE TABLE "Hospital" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "displayName" TEXT,
    "email" TEXT,
    "legalName" TEXT,
    "logoUrl" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "printHeaderFooter" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "costCenterId" INTEGER,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "defaultPrice" DECIMAL(18,3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBillable" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "discountAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "financialPeriodId" INTEGER,
    "financialYearId" INTEGER,
    "claimStatus" TEXT,
    "rejectionReason" TEXT,
    "insuranceProviderId" INTEGER,
    "insuranceShare" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "patientShare" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "originalInvoiceId" INTEGER,
    "type" "InvoiceType" NOT NULL DEFAULT 'INVOICE',
    "notes" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashierId" INTEGER,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDoctor" BOOLEAN NOT NULL DEFAULT false,
    "specialtyId" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "basicSalary" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "annualLeaveBalance" INTEGER NOT NULL DEFAULT 21,
    "jobRank" "JobRank" DEFAULT 'GENERAL_PRACTITIONER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedByToken" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "mrn" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationalId" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "motherName" TEXT,
    "familyBooklet" TEXT,
    "familySheet" TEXT,
    "registryNumber" TEXT,
    "identityType" "IdentityType",
    "identityNumber" TEXT,
    "maritalStatus" "MaritalStatus",
    "phone" TEXT,
    "address" TEXT,
    "email" TEXT,
    "telegramChatId" TEXT,
    "telegramLinkToken" TEXT,
    "telegramLinkExpiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "insuranceMemberId" TEXT,
    "insurancePolicyId" INTEGER,
    "guarantorId" INTEGER,
    "webPassword" TEXT,
    "nationalIdHash" TEXT,
    "identityNumberHash" TEXT,
    "phoneHash" TEXT,
    "emailHash" TEXT,
    "mrnHash" TEXT,
    "motherId" INTEGER,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientOtp" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL DEFAULT 'console',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientRefreshToken" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedByToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAllergy" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "allergen" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reaction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "doctorId" INTEGER,
    "type" "EncounterType" NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'OPEN',
    "admissionDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "chiefComplaint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "triageLevel" "TriageLevel",
    "triageNote" TEXT,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriageAssessment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "level" "TriageLevel" NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "temperature" DECIMAL(4,2),
    "heartRate" INTEGER,
    "respRate" INTEGER,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "o2Sat" INTEGER,
    "painScore" INTEGER,
    "notes" TEXT,
    "assessedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterCharge" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "serviceItemId" INTEGER NOT NULL,
    "sourceType" "ChargeSource" NOT NULL,
    "sourceId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" INTEGER,
    "performerId" INTEGER,

    CONSTRAINT "EncounterCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "diagnosisText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationAdministration" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "prescriptionItemId" INTEGER NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AdministrationStatus" NOT NULL DEFAULT 'GIVEN',
    "notes" TEXT,
    "infusionRate" DECIMAL(10,2),
    "titrationLog" JSONB,
    "scannedPatientBarcode" TEXT,
    "scannedDrugBarcode" TEXT,
    "isVerified5Rights" BOOLEAN NOT NULL DEFAULT false,
    "isEmergencyOverride" BOOLEAN NOT NULL DEFAULT false,
    "varianceReason" TEXT,
    "performerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationAdministration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NursingNote" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "isShiftHandover" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NursingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "orderedById" INTEGER NOT NULL,
    "type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "serviceItemId" INTEGER,
    "arabicName" TEXT,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTestParameter" (
    "id" SERIAL NOT NULL,
    "labTestId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unit" TEXT,
    "refRange" TEXT,

    CONSTRAINT "LabTestParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "testId" INTEGER NOT NULL,
    "resultValue" TEXT,
    "resultUnit" TEXT,
    "referenceRange" TEXT,
    "resultStatus" "LabResultStatus" NOT NULL DEFAULT 'PENDING',
    "resultDate" TIMESTAMP(3),

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrderResult" (
    "id" SERIAL NOT NULL,
    "labOrderId" INTEGER NOT NULL,
    "parameterId" INTEGER,
    "parameterName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "range" TEXT,
    "flag" TEXT,

    CONSTRAINT "LabOrderResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiologyStudy" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality" TEXT,
    "bodyPart" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "serviceItemId" INTEGER,
    "arabicName" TEXT,

    CONSTRAINT "RadiologyStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiologyOrder" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "studyId" INTEGER NOT NULL,
    "status" "RadiologyStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "reportText" TEXT,
    "pacsUrl" TEXT,

    CONSTRAINT "RadiologyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ward" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "type" TEXT,
    "serviceItemId" INTEGER,
    "departmentId" INTEGER,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" SERIAL NOT NULL,
    "wardId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "roomNumber" TEXT NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "bedNumber" TEXT NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "wardId" INTEGER NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedAssignment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "bedId" INTEGER NOT NULL,
    "from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "to" TIMESTAMP(3),

    CONSTRAINT "BedAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'DRUG',
    "genericName" TEXT,
    "strength" TEXT,
    "form" TEXT,
    "route" "MedicationRoute",
    "costPrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "stockOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "maxStock" DECIMAL(18,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expenseAccountId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "barcode" TEXT,
    "rxNormCode" TEXT,
    "terminologyConceptId" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "requestNumber" TEXT,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "status" "PRStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purchaseOrderId" INTEGER,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" SERIAL NOT NULL,
    "purchaseRequestId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "poNumber" TEXT,
    "poDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalPrice" DECIMAL(18,3) NOT NULL,
    "receivedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObstetricHistory" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "gravida" INTEGER NOT NULL DEFAULT 0,
    "para" INTEGER NOT NULL DEFAULT 0,
    "abortion" INTEGER NOT NULL DEFAULT 0,
    "prevCSCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryDate" TIMESTAMP(3),
    "bloodGroup" TEXT,
    "riskFactors" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObstetricHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAdmission" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "inductionMethod" "InductionMethod" NOT NULL DEFAULT 'NONE',
    "placentaDelivery" "PlacentaDelivery" NOT NULL DEFAULT 'SPONTANEOUS',
    "episiotomy" BOOLEAN NOT NULL DEFAULT false,
    "perinealTear" "PerinealTear" NOT NULL DEFAULT 'NONE',
    "bloodLoss" INTEGER,
    "babyCount" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "DeliveryAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BabyProfile" (
    "id" SERIAL NOT NULL,
    "deliveryAdmissionId" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "weight" DECIMAL(5,3),
    "length" DECIMAL(5,1),
    "headCircumference" DECIMAL(5,1),
    "birthTime" TIMESTAMP(3) NOT NULL,
    "apgarScore1" INTEGER,
    "apgarScore5" INTEGER,
    "apgarScore10" INTEGER,
    "status" "BabyStatus" NOT NULL DEFAULT 'ALIVE',
    "vitaminKGiven" BOOLEAN NOT NULL DEFAULT false,
    "bcgVaccineGiven" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "generatedPatientId" INTEGER,

    CONSTRAINT "BabyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntenatalCare" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "lmpDate" TIMESTAMP(3) NOT NULL,
    "eddDate" TIMESTAMP(3) NOT NULL,
    "gravida" INTEGER NOT NULL DEFAULT 1,
    "para" INTEGER NOT NULL DEFAULT 0,
    "bloodGroup" TEXT,
    "rhFactor" TEXT,
    "partnerRhFactor" TEXT,
    "rhIncompatible" BOOLEAN NOT NULL DEFAULT false,
    "antiDWeek28Given" BOOLEAN NOT NULL DEFAULT false,
    "antiDPostpartumGiven" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" "PregnancyRisk" NOT NULL DEFAULT 'LOW',
    "riskFactors" TEXT,
    "status" "PregnancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AntenatalCare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntenatalVisit" (
    "id" SERIAL NOT NULL,
    "antenatalCareId" INTEGER NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gestationalWeek" INTEGER,
    "weight" DECIMAL(5,1),
    "bloodPressureSys" INTEGER,
    "bloodPressureDia" INTEGER,
    "fundalHeight" DECIMAL(5,1),
    "fetalHeartRate" INTEGER,
    "fetalMovement" BOOLEAN,
    "presentation" TEXT,
    "edema" BOOLEAN NOT NULL DEFAULT false,
    "urineProtein" TEXT,
    "urineGlucose" TEXT,
    "hemoglobin" DECIMAL(4,1),
    "complaints" TEXT,
    "notes" TEXT,
    "nextVisitDate" TIMESTAMP(3),

    CONSTRAINT "AntenatalVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndrologyVisit" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "fertilityCaseId" INTEGER,
    "chiefComplaint" TEXT,
    "infertilityMonths" INTEGER,
    "previousPregnancies" INTEGER,
    "coitalFrequency" TEXT,
    "erectileDisfunc" BOOLEAN NOT NULL DEFAULT false,
    "ejaculatoryDisfunc" BOOLEAN NOT NULL DEFAULT false,
    "retrogradeEjac" BOOLEAN NOT NULL DEFAULT false,
    "libidoLevel" TEXT,
    "prematureEjac" BOOLEAN NOT NULL DEFAULT false,
    "smokingHabit" TEXT,
    "alcoholUse" TEXT,
    "occupationalExposure" TEXT,
    "bmi" DECIMAL(4,1),
    "cryptorchidismHistory" BOOLEAN NOT NULL DEFAULT false,
    "orchitisHistory" BOOLEAN NOT NULL DEFAULT false,
    "inguinalSurgery" BOOLEAN NOT NULL DEFAULT false,
    "chemotherapy" BOOLEAN NOT NULL DEFAULT false,
    "radiationExposure" BOOLEAN NOT NULL DEFAULT false,
    "currentMedications" TEXT,
    "surgicalHistory" TEXT,
    "medicalConditions" TEXT,
    "varicoceleGrade" TEXT,
    "varicoceleRight" TEXT,
    "varicoceleLeft" TEXT,
    "testicularVolR" DECIMAL(4,1),
    "testicularVolL" DECIMAL(4,1),
    "testisConsistency" TEXT,
    "epididymalFindings" TEXT,
    "vasPresence" TEXT,
    "penileExam" TEXT,
    "gynecomastia" BOOLEAN NOT NULL DEFAULT false,
    "bodyHairPattern" TEXT,
    "fshLevel" DECIMAL(5,2),
    "lhLevel" DECIMAL(5,2),
    "testosterone" DECIMAL(6,2),
    "prolactin" DECIMAL(5,2),
    "diagnosis" TEXT,
    "whoClassification" TEXT,
    "treatmentPlan" TEXT,
    "followUpDate" TIMESTAMP(3),
    "referralNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AndrologyVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemenAnalysis" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "fertilityCaseId" INTEGER,
    "sampleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abstinenceDays" INTEGER,
    "collectionMethod" TEXT,
    "collectionTime" TIMESTAMP(3),
    "analysisTime" TIMESTAMP(3),
    "volumeMl" DECIMAL(4,1),
    "ph" DECIMAL(3,1),
    "appearance" TEXT,
    "color" TEXT,
    "viscosity" TEXT,
    "liquefaction" TEXT,
    "liquefactionMinutes" INTEGER,
    "countMilPerMl" DECIMAL(8,2),
    "totalCountMil" DECIMAL(8,2),
    "progressivePR" DECIMAL(5,2),
    "nonProgressiveNP" DECIMAL(5,2),
    "immotileIM" DECIMAL(5,2),
    "totalMotility" DECIMAL(5,2),
    "normalForms" DECIMAL(5,2),
    "headDefects" DECIMAL(5,2),
    "midpieceDefects" DECIMAL(5,2),
    "tailDefects" DECIMAL(5,2),
    "vitality" DECIMAL(5,2),
    "wbcCount" DECIMAL(5,2),
    "roundCells" DECIMAL(5,2),
    "agglutination" TEXT,
    "marTestIgG" TEXT,
    "marTestIgA" TEXT,
    "dnaFragmentation" DECIMAL(5,2),
    "dfiMethod" TEXT,
    "autoClassification" TEXT,
    "conclusion" TEXT,
    "doctorNotes" TEXT,

    CONSTRAINT "SemenAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HormoneTest" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fsh" DECIMAL(6,2),
    "lh" DECIMAL(6,2),
    "totalTestosterone" DECIMAL(7,2),
    "freeTestosterone" DECIMAL(6,2),
    "estradiol" DECIMAL(6,2),
    "prolactin" DECIMAL(6,2),
    "tsh" DECIMAL(5,2),
    "inhibinB" DECIMAL(6,2),
    "shbg" DECIMAL(6,2),
    "amhMale" DECIMAL(6,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HormoneTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndrologySurgery" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "surgeryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procedure" TEXT NOT NULL,
    "technique" TEXT,
    "surgeonName" TEXT,
    "findings" TEXT,
    "outcome" TEXT,
    "complications" TEXT,
    "spermRetrieved" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AndrologySurgery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndrologyMedication" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "medication" TEXT NOT NULL,
    "category" TEXT,
    "dose" TEXT,
    "frequency" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "response" TEXT,
    "sideEffects" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AndrologyMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AndrologyInvestigation" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "investigationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "facilityName" TEXT,
    "findings" TEXT NOT NULL,
    "interpretation" TEXT,
    "normalRange" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AndrologyInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryoTank" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,

    CONSTRAINT "CryoTank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryoCanister" (
    "id" SERIAL NOT NULL,
    "tankId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "CryoCanister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryoItem" (
    "id" SERIAL NOT NULL,
    "canisterId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "itemType" "CryoItemType" NOT NULL,
    "freezeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "thawDate" TIMESTAMP(3),
    "status" "CryoStatus" NOT NULL DEFAULT 'FROZEN',
    "caneCode" TEXT,
    "gobletColor" TEXT,
    "visotubeColor" TEXT,
    "strawCount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "ivfCycleId" INTEGER,

    CONSTRAINT "CryoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FertilityCase" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "femalePatientId" INTEGER NOT NULL,
    "malePatientId" INTEGER,
    "infertilityType" "InfertilityType" NOT NULL DEFAULT 'UNEXPLAINED',
    "diagnosis" TEXT,
    "durationYears" INTEGER,
    "previousTreatments" TEXT,
    "amhLevel" DECIMAL(5,2),
    "fshLevel" DECIMAL(5,2),
    "lhLevel" DECIMAL(5,2),
    "status" "FertilityCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FertilityCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IVFCycle" (
    "id" SERIAL NOT NULL,
    "fertilityCaseId" INTEGER NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "cycleType" "CycleType" NOT NULL DEFAULT 'ICSI',
    "protocol" TEXT,
    "startDate" TIMESTAMP(3),
    "eggRetrievalDate" TIMESTAMP(3),
    "eggsRetrieved" INTEGER,
    "eggsMatureMII" INTEGER,
    "eggsMI" INTEGER,
    "eggsGV" INTEGER,
    "spermSource" "SpermSource" NOT NULL DEFAULT 'EJACULATE',
    "fertilizationMethod" "FertilizationMethod" NOT NULL DEFAULT 'ICSI',
    "eggsInjected" INTEGER,
    "eggsFertilized2PN" INTEGER,
    "embryosDay3" INTEGER,
    "embryosDay5" INTEGER,
    "transferDate" TIMESTAMP(3),
    "embryosTransferred" INTEGER,
    "endometrialThickness" DECIMAL(4,1),
    "embryosFrozen" INTEGER,
    "betaHCGDate" TIMESTAMP(3),
    "betaHCGResult" DECIMAL(8,2),
    "pregnancyResult" "PregnancyResult" NOT NULL DEFAULT 'PENDING',
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IVFCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbryoRecord" (
    "id" SERIAL NOT NULL,
    "ivfCycleId" INTEGER NOT NULL,
    "embryoNumber" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "grade" TEXT,
    "fragmentation" TEXT,
    "status" "EmbryoStatus" NOT NULL DEFAULT 'DEVELOPING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbryoRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FertilityMedication" (
    "id" SERIAL NOT NULL,
    "ivfCycleId" INTEGER NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "durationDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FertilityMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "grnNumber" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER,
    "warehouseId" INTEGER NOT NULL,
    "receivedById" INTEGER NOT NULL,
    "status" "GRNStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "purchaseInvoiceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" SERIAL NOT NULL,
    "goodsReceiptId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStock" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "maxStock" DECIMAL(18,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "productId" INTEGER NOT NULL,
    "type" "StockTransactionType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,3) NOT NULL,
    "totalCost" DECIMAL(18,3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,
    "purchaseInvoiceId" INTEGER,
    "dispenseRecordId" INTEGER,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "pharmacistVerificationStatus" "PharmacistVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" SERIAL NOT NULL,
    "prescriptionId" INTEGER NOT NULL,
    "dose" TEXT NOT NULL,
    "route" "MedicationRoute" NOT NULL,
    "frequency" "MedicationFrequency" NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenseRecord" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "prescriptionId" INTEGER NOT NULL,
    "dispensedById" INTEGER NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "DispenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenseItem" (
    "id" SERIAL NOT NULL,
    "dispenseRecordId" INTEGER NOT NULL,
    "prescriptionItemId" INTEGER,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "DispenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "departmentId" INTEGER,
    "encounterId" INTEGER,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "reason" TEXT,
    "notes" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meetingLink" TEXT,
    "type" "AppointmentType" NOT NULL DEFAULT 'IN_PERSON',
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "queueNumber" INTEGER,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER,
    "userId" INTEGER,
    "entityId" INTEGER,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientName" TEXT,
    "details" JSONB,
    "oldValues" JSONB,
    "newValues" JSONB,
    "entity" TEXT,
    "action" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorSchedule" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "maxPerDay" INTEGER,
    "allowOverbook" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endTime" TEXT DEFAULT '16:00',
    "maxEmergency" INTEGER DEFAULT 10,
    "reservedNumbers" TEXT DEFAULT '1,3,5,7,9',
    "slotDuration" INTEGER DEFAULT 15,
    "specialty" TEXT,
    "startTime" TEXT DEFAULT '08:00',
    "workDays" TEXT DEFAULT '0,1,2,3,4',
    "consultationPrice" DECIMAL(18,3) DEFAULT 0,

    CONSTRAINT "DoctorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialYear" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FinancialYearStatus" NOT NULL DEFAULT 'OPEN',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "deletedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriod" (
    "id" SERIAL NOT NULL,
    "financialYearId" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "periodCode" TEXT NOT NULL,
    "monthStartDate" TIMESTAMP(3) NOT NULL,
    "monthEndDate" TIMESTAMP(3) NOT NULL,
    "numberOfDays" INTEGER NOT NULL,
    "payrollStartDate" TIMESTAMP(3),
    "payrollEndDate" TIMESTAMP(3),
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "deletedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAccountMapping" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "key" "SystemAccountKey" NOT NULL,
    "accountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,

    CONSTRAINT "SystemAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "group" TEXT,
    "type" "SystemSettingType" NOT NULL DEFAULT 'STRING',
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "financialYearId" INTEGER,
    "financialPeriodId" INTEGER,
    "sourceModule" "AccountingSourceModule" NOT NULL,
    "sourceId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntryLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(18,3) NOT NULL,
    "credit" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "costCenterId" INTEGER,

    CONSTRAINT "AccountingEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashierShiftClosing" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "cashierId" INTEGER NOT NULL,
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "systemCashTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualCashTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "difference" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingEntryId" INTEGER,

    CONSTRAINT "CashierShiftClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "taxNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "SupplierType" NOT NULL DEFAULT 'LOCAL',

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "InventoryCountType" NOT NULL DEFAULT 'FULL',
    "assignedToId" INTEGER,
    "approvedById" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" SERIAL NOT NULL,
    "inventoryCountId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "systemQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "physicalQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "variance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "discountAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,3) NOT NULL,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,
    "warehouseId" INTEGER,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "vatAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,3) NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturnLine" (
    "id" SERIAL NOT NULL,
    "purchaseReturnId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "PurchaseReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceLine" (
    "id" SERIAL NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "expenseAccountId" INTEGER,
    "productId" INTEGER,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "purchaseInvoiceId" INTEGER,
    "amount" DECIMAL(18,3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "accountingEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosisCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "icd10Code" TEXT,
    "terminologyConceptId" INTEGER,

    CONSTRAINT "DiagnosisCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitDiagnosis" (
    "id" SERIAL NOT NULL,
    "visitId" INTEGER NOT NULL,
    "diagnosisCodeId" INTEGER NOT NULL,
    "type" "DiagnosisType" NOT NULL DEFAULT 'PRIMARY',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalSign" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "temperature" DECIMAL(4,2),
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "pulse" INTEGER,
    "respRate" INTEGER,
    "o2Sat" INTEGER,
    "height" DECIMAL(5,2),
    "weight" DECIMAL(5,2),
    "bmi" DECIMAL(4,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "VitalSign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterDiagnosis" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "diagnosisCodeId" INTEGER NOT NULL,
    "type" "DiagnosisType" NOT NULL DEFAULT 'PRIMARY',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "EncounterDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalBasic" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalAllowances" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER,
    "approvedById" INTEGER,
    "accountingEntryId" INTEGER,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSlip" (
    "id" SERIAL NOT NULL,
    "payrollRunId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "basicSalary" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" TEXT,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceProvider" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "accountId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" SERIAL NOT NULL,
    "insuranceProviderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "policyNumber" TEXT,
    "patientCopayRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "maxCoverageAmount" DECIMAL(18,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priceListId" INTEGER,
    "planId" INTEGER,
    "endDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePlan" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCopayRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "maxCopayAmount" DECIMAL(18,3),

    CONSTRAINT "InsurancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageRule" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "serviceCategoryId" INTEGER,
    "serviceItemId" INTEGER,
    "ruleType" "CoverageRuleType" NOT NULL DEFAULT 'INCLUSION',
    "copayType" "CopayType" NOT NULL DEFAULT 'PERCENTAGE',
    "copayValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CoverageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAuthorization" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "policyId" INTEGER NOT NULL,
    "serviceItemId" INTEGER,
    "diagnosisCodeId" INTEGER,
    "authCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAmount" DECIMAL(18,3),
    "approvedAmount" DECIMAL(18,3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShiftType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRoster" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "workShiftId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isOffDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmployeeRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "daysCount" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingTheatre" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OperatingTheatre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryCase" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "theatreId" INTEGER NOT NULL,
    "surgeryName" TEXT NOT NULL,
    "serviceItemId" INTEGER,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" "SurgeryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "preOpDiagnosis" TEXT,
    "postOpDiagnosis" TEXT,
    "procedureConceptId" INTEGER,
    "preOpDiagnosisConceptId" INTEGER,
    "postOpDiagnosisConceptId" INTEGER,
    "surgeonNotes" TEXT,
    "anesthesiaNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgeryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryTeam" (
    "id" SERIAL NOT NULL,
    "surgeryCaseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "SurgeryRole" NOT NULL,
    "commissionAmount" DECIMAL(18,3),

    CONSTRAINT "SurgeryTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryConsumable" (
    "id" SERIAL NOT NULL,
    "surgeryCaseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalPrice" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "SurgeryConsumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "tagNumber" TEXT NOT NULL,
    "productId" INTEGER,
    "departmentId" INTEGER,
    "roomId" INTEGER,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "purchaseCost" DECIMAL(18,3) NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL,
    "salvageValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "currentValue" DECIMAL(18,3) NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciation" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "financialYearId" INTEGER NOT NULL,
    "periodId" INTEGER,
    "amount" DECIMAL(18,3) NOT NULL,
    "bookValueAfter" DECIMAL(18,3) NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    "accountingEntryId" INTEGER,

    CONSTRAINT "AssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "issueDescription" TEXT,
    "technicianNotes" TEXT,
    "cost" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "requestedBy" INTEGER NOT NULL,
    "assignedTo" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" SERIAL NOT NULL,
    "priceListId" INTEGER NOT NULL,
    "serviceItemId" INTEGER,
    "productId" INTEGER,
    "price" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "userId" INTEGER,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalDevice" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" "IntegrationProtocol" NOT NULL DEFAULT 'HL7_V2',
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "type" "NoteType" NOT NULL DEFAULT 'NURSING_ROUTINE',
    "content" TEXT,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "isAddendum" BOOLEAN NOT NULL DEFAULT false,
    "parentNoteId" INTEGER,
    "signedById" INTEGER,
    "signedAt" TIMESTAMP(3),
    "coSignedById" INTEGER,
    "coSignedAt" TIMESTAMP(3),
    "shiftId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanItem" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "frequency" TEXT,
    "startDate" TIMESTAMP(3),
    "type" "CarePlanType" NOT NULL DEFAULT 'OTHER',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "CarePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanExecution" (
    "id" SERIAL NOT NULL,
    "carePlanItemId" INTEGER NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedById" INTEGER NOT NULL,
    "resultValue" TEXT,
    "note" TEXT,

    CONSTRAINT "CarePlanExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestMapping" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "serviceItemId" INTEGER,
    "labTestId" INTEGER,
    "deviceTestCode" TEXT NOT NULL,

    CONSTRAINT "TestMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "direction" "IntegrationDirection" NOT NULL,
    "messageType" TEXT,
    "rawMessage" TEXT NOT NULL,
    "parsedData" JSONB,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugInteraction" (
    "id" SERIAL NOT NULL,
    "drugAGeneric" TEXT NOT NULL,
    "drugBGeneric" TEXT NOT NULL,
    "severity" "DrugInteractionSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "recommendation" TEXT,
    "source" TEXT,
    "evidenceLevel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrugInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CDSSAlert" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "prescriptionId" INTEGER,
    "orderId" INTEGER,
    "alertType" "CDSSAlertType" NOT NULL,
    "severity" "CDSSAlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "messageAr" TEXT,
    "context" JSONB,
    "status" "CDSSAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledgedById" INTEGER,
    "acknowledgedAt" TIMESTAMP(3),
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CDSSAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DosageRule" (
    "id" SERIAL NOT NULL,
    "drugGeneric" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "weightMin" DECIMAL(5,2),
    "weightMax" DECIMAL(5,2),
    "renalFunction" TEXT,
    "minDose" DECIMAL(10,3),
    "maxDose" DECIMAL(10,3),
    "doseUnit" TEXT,
    "adjustmentFactor" DECIMAL(5,2),
    "recommendation" TEXT,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DosageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCriticalValue" (
    "id" SERIAL NOT NULL,
    "labTestCode" TEXT NOT NULL,
    "labTestName" TEXT NOT NULL,
    "criticalLow" DECIMAL(10,3),
    "criticalHigh" DECIMAL(10,3),
    "panicLow" DECIMAL(10,3),
    "panicHigh" DECIMAL(10,3),
    "unit" TEXT NOT NULL,
    "ageGroup" TEXT,
    "gender" "Gender",
    "action" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LabCriticalValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalCriticalValue" (
    "id" SERIAL NOT NULL,
    "vitalType" TEXT NOT NULL,
    "vitalName" TEXT NOT NULL,
    "criticalLow" DECIMAL(6,2),
    "criticalHigh" DECIMAL(6,2),
    "unit" TEXT NOT NULL,
    "ageGroup" TEXT,
    "action" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VitalCriticalValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CPTCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPTCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "doctorId" INTEGER,
    "doctorRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "hospitalRate" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "admissionType" "AdmissionType" NOT NULL,
    "admissionStatus" "AdmissionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "priority" "AdmissionPriority" NOT NULL,
    "scheduledAdmissionDate" TIMESTAMP(3),
    "actualAdmissionDate" TIMESTAMP(3) NOT NULL,
    "dischargeDate" TIMESTAMP(3),
    "expectedDischargeDate" TIMESTAMP(3),
    "medicalClearance" BOOLEAN NOT NULL DEFAULT false,
    "financialClearance" BOOLEAN NOT NULL DEFAULT false,
    "bedId" INTEGER,
    "roomId" INTEGER,
    "wardId" INTEGER,
    "departmentId" INTEGER,
    "admittingDoctorId" INTEGER NOT NULL,
    "primaryPhysicianId" INTEGER NOT NULL,
    "referringDoctorId" INTEGER,
    "attendingNurseId" INTEGER,
    "insuranceProviderId" TEXT,
    "insurancePolicyId" TEXT,
    "preAuthNumber" TEXT,
    "insuranceStatus" TEXT,
    "admissionReason" TEXT NOT NULL,
    "primaryDiagnosis" TEXT,
    "secondaryDiagnoses" JSONB,
    "procedures" JSONB,
    "medications" JSONB,
    "allergies" JSONB,
    "specialInstructions" TEXT,
    "fallRisk" TEXT,
    "pressureUlcerRisk" TEXT,
    "nutritionRisk" TEXT,
    "infectionRisk" TEXT,
    "isolationRequired" BOOLEAN NOT NULL DEFAULT false,
    "isolationType" "IsolationType" NOT NULL DEFAULT 'NONE',
    "isolationStartDate" TIMESTAMP(3),
    "isolationEndDate" TIMESTAMP(3),
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContact" JSONB,
    "emergencyNotes" TEXT,
    "isReadmission" BOOLEAN NOT NULL DEFAULT false,
    "previousAdmissionId" INTEGER,
    "readmissionReason" TEXT,
    "readmissionWithin30Days" BOOLEAN NOT NULL DEFAULT false,
    "dischargeDisposition" "DischargeDisposition",
    "dischargeInstructions" JSONB,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpInstructions" JSONB,
    "estimatedCost" DECIMAL(65,30),
    "actualCost" DECIMAL(65,30),
    "paymentStatus" TEXT,
    "billingStatus" TEXT,
    "lengthOfStay" INTEGER,
    "complicationFlag" BOOLEAN NOT NULL DEFAULT false,
    "complicationDetails" JSONB,
    "createdBy" INTEGER NOT NULL,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_notes" (
    "id" SERIAL NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discharge_planning" (
    "id" SERIAL NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "plannedDischargeDate" TIMESTAMP(3) NOT NULL,
    "dischargePlanningDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medicalStability" BOOLEAN NOT NULL DEFAULT false,
    "vitalsStable" BOOLEAN NOT NULL DEFAULT false,
    "painControlled" BOOLEAN NOT NULL DEFAULT false,
    "medicationsReady" BOOLEAN NOT NULL DEFAULT false,
    "educationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "dischargeDisposition" "DischargeDisposition" NOT NULL,
    "destinationFacility" TEXT,
    "homeHealthRequired" BOOLEAN NOT NULL DEFAULT false,
    "equipmentNeeded" JSONB,
    "homeModifications" JSONB,
    "followUpAppointment" TIMESTAMP(3),
    "followUpDoctorId" INTEGER,
    "followUpInstructions" TEXT,
    "caseManagerId" INTEGER,
    "socialWorkerId" INTEGER,
    "familyNotified" BOOLEAN NOT NULL DEFAULT false,
    "familyInstructions" JSONB,
    "insuranceApproval" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DECIMAL(65,30),
    "paymentArrangements" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "completedDate" TIMESTAMP(3),
    "barriers" JSONB,
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discharge_planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DischargeSummary" (
    "id" SERIAL NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "admissionDate" TIMESTAMP(3) NOT NULL,
    "dischargeDate" TIMESTAMP(3) NOT NULL,
    "lengthOfStay" INTEGER NOT NULL,
    "admissionDiagnosis" TEXT NOT NULL,
    "dischargeDiagnosis" TEXT NOT NULL,
    "proceduresPerformed" JSONB,
    "consultations" JSONB,
    "hospitalCourse" TEXT NOT NULL,
    "significantFindings" TEXT,
    "dischargeMedications" JSONB,
    "followUpInstructions" TEXT,
    "followUpDate" TIMESTAMP(3),
    "followUpDoctor" TEXT,
    "activityRestrictions" TEXT,
    "dietInstructions" TEXT,
    "patientEducation" TEXT,
    "warningSignsToWatch" TEXT,
    "createdById" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DischargeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_transfers" (
    "id" SERIAL NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "fromBedId" INTEGER NOT NULL,
    "fromRoomId" INTEGER NOT NULL,
    "fromWardId" INTEGER NOT NULL,
    "toBedId" INTEGER NOT NULL,
    "toRoomId" INTEGER NOT NULL,
    "toWardId" INTEGER NOT NULL,
    "transferReason" TEXT NOT NULL,
    "transferType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "requestedBy" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "completedBy" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bed_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentForm" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "doctorId" INTEGER,
    "formType" "ConsentFormType" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "signature" TEXT,
    "signedByRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConsentForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "referringDoctorId" INTEGER NOT NULL,
    "receivingDoctorId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "clinicalSummary" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNoteTemplate" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "noteType" "NoteType" NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferOrder" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "fromBedId" INTEGER,
    "toBedId" INTEGER,
    "status" "TransferOrderStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" INTEGER NOT NULL,
    "allocatedById" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "TransferOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverNote" (
    "id" SERIAL NOT NULL,
    "transferOrderId" INTEGER NOT NULL,
    "situation" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "draftedById" INTEGER,
    "signedById" INTEGER,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "HandoverNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICUFlowsheet" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "shiftDate" DATE NOT NULL,
    "shiftName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ICUFlowsheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICUFlowsheetEntry" (
    "id" SERIAL NOT NULL,
    "flowsheetId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" INTEGER NOT NULL,
    "heartRate" INTEGER,
    "respRate" INTEGER,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "meanArterialBp" INTEGER,
    "temperature" DECIMAL(4,2),
    "o2Sat" INTEGER,
    "intakeType" TEXT,
    "intakeAmount" DECIMAL(10,2),
    "outputType" TEXT,
    "outputAmount" DECIMAL(10,2),
    "gcsScore" INTEGER,
    "apgarScore" INTEGER,
    "notes" TEXT,

    CONSTRAINT "ICUFlowsheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentilatorLog" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "fio2" DECIMAL(5,2),
    "peep" DECIMAL(5,2),
    "pip" DECIMAL(5,2),
    "tidalVolume" INTEGER,
    "respRateSet" INTEGER,
    "respRateActual" INTEGER,

    CONSTRAINT "VentilatorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICUDailyAssessment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "assessmentDate" DATE NOT NULL,
    "gcsEye" INTEGER,
    "gcsVerbal" INTEGER,
    "gcsMotor" INTEGER,
    "gcsTotal" INTEGER,
    "apacheIIScore" INTEGER,
    "sofaScore" INTEGER,
    "rassScore" INTEGER,
    "painScore" INTEGER,
    "pupilLeft" TEXT,
    "pupilRight" TEXT,
    "sedationTarget" TEXT,
    "oxygenDevice" TEXT,
    "fio2" DECIMAL(5,2),
    "centralLine" TEXT,
    "arterialLine" TEXT,
    "foleyPresent" BOOLEAN NOT NULL DEFAULT false,
    "drains" JSONB,
    "skinIntegrity" TEXT,
    "pressureUlcer" TEXT,
    "woundNotes" TEXT,
    "dailyGoals" TEXT,
    "nutritionPlan" TEXT,
    "mobilityPlan" TEXT,
    "assessedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ICUDailyAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICUMedicationDrip" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "medicationName" TEXT NOT NULL,
    "concentration" TEXT,
    "currentRate" DECIMAL(10,2),
    "doseUnit" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "titrationLog" JSONB,
    "orderedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ICUMedicationDrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICUEquipmentUsage" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "equipmentName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "dailyRate" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ICUEquipmentUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProblem" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "diagnosisCodeId" INTEGER,
    "description" TEXT NOT NULL,
    "type" "ProblemType" NOT NULL DEFAULT 'ACTIVE',
    "severity" "ProblemSeverity",
    "onsetDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "notes" TEXT,
    "isChronic" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMedicalHistory" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "smokingStatus" "SmokingStatus",
    "alcoholUse" TEXT,
    "occupation" TEXT,
    "exerciseLevel" TEXT,
    "dietNotes" TEXT,
    "socialNotes" TEXT,
    "mobilityStatus" TEXT,
    "adlStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientMedicalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPMHEntry" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "diagnosisYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPMHEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSurgicalEntry" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "procedure" TEXT NOT NULL,
    "surgeryYear" INTEGER,
    "hospitalName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientSurgicalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientFamilyHistoryEntry" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "relation" "FamilyRelation" NOT NULL,
    "condition" TEXT NOT NULL,
    "ageOfOnset" INTEGER,
    "isDeceased" BOOLEAN NOT NULL DEFAULT false,
    "causeOfDeath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientFamilyHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeMedication" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "route" TEXT,
    "prescribedBy" TEXT,
    "reason" TEXT,
    "startDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" "MedicationSource" NOT NULL DEFAULT 'PATIENT_REPORTED',
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSet" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "contentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "category" TEXT,
    "specialty" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ClinicalContentStatus" NOT NULL DEFAULT 'DRAFT',
    "previousVersionId" INTEGER,
    "submittedById" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "retiredById" INTEGER,
    "retiredAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "changeSummary" TEXT,
    "releaseNotes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSetItem" (
    "id" SERIAL NOT NULL,
    "orderSetId" INTEGER NOT NULL,
    "itemType" "OrderSetItemType" NOT NULL,
    "labTestId" INTEGER,
    "radiologyStudyId" INTEGER,
    "productId" INTEGER,
    "dose" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "serviceItemId" INTEGER,
    "terminologyConceptId" INTEGER,
    "nursingAction" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "instructions" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalPathway" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "contentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "targetDiagnosis" TEXT,
    "expectedLOS" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ClinicalContentStatus" NOT NULL DEFAULT 'DRAFT',
    "previousVersionId" INTEGER,
    "submittedById" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "retiredById" INTEGER,
    "retiredAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "changeSummary" TEXT,
    "releaseNotes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalPathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalPathwayStep" (
    "id" SERIAL NOT NULL,
    "pathwayId" INTEGER NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "phase" TEXT,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "description" TEXT,
    "orderSetId" INTEGER,
    "expectedOutcome" TEXT,
    "milestones" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClinicalPathwayStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayEnrollment" (
    "id" SERIAL NOT NULL,
    "pathwayId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "enrolledById" INTEGER NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PathwayEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentDay" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "PathwayEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayVariance" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "varianceType" "VarianceType" NOT NULL,
    "reason" TEXT NOT NULL,
    "reportedById" INTEGER NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PathwayVariance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareTask" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CareTaskType" NOT NULL DEFAULT 'OTHER',
    "status" "CareTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToId" INTEGER,
    "completedById" INTEGER,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSetReviewEvent" (
    "id" SERIAL NOT NULL,
    "orderSetId" INTEGER NOT NULL,
    "eventType" "ClinicalContentEventType" NOT NULL,
    "actorId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSetReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalPathwayReviewEvent" (
    "id" SERIAL NOT NULL,
    "pathwayId" INTEGER NOT NULL,
    "eventType" "ClinicalContentEventType" NOT NULL,
    "actorId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalPathwayReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT,
    "type" "VoucherType" NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "accountId" INTEGER NOT NULL,
    "cashAccountId" INTEGER NOT NULL,
    "notes" TEXT,
    "payeeOrPayer" TEXT,
    "reference" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminologyConcept" (
    "id" SERIAL NOT NULL,
    "system" "TerminologySystem" NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "displayAr" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT,
    "parentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerminologyConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMessage" (
    "id" SERIAL NOT NULL,
    "threadId" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "hospitalId" INTEGER NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationRefillRequest" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "status" "RefillStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationRefillRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_code_key" ON "Hospital"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_code_key" ON "Specialty"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItem_code_key" ON "ServiceItem"("code");

-- CreateIndex
CREATE INDEX "Invoice_hospitalId_status_idx" ON "Invoice"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");

-- CreateIndex
CREATE INDEX "Invoice_encounterId_idx" ON "Invoice"("encounterId");

-- CreateIndex
CREATE INDEX "Payment_hospitalId_invoiceId_idx" ON "Payment"("hospitalId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_hashedToken_key" ON "RefreshToken"("hashedToken");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_mrn_key" ON "Patient"("mrn");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nationalIdHash_key" ON "Patient"("nationalIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_identityNumberHash_key" ON "Patient"("identityNumberHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_phoneHash_key" ON "Patient"("phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_emailHash_key" ON "Patient"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_mrnHash_key" ON "Patient"("mrnHash");

-- CreateIndex
CREATE INDEX "Patient_hospitalId_phone_idx" ON "Patient"("hospitalId", "phone");

-- CreateIndex
CREATE INDEX "Patient_hospitalId_fullName_idx" ON "Patient"("hospitalId", "fullName");

-- CreateIndex
CREATE INDEX "Patient_nationalId_idx" ON "Patient"("nationalId");

-- CreateIndex
CREATE INDEX "Patient_telegramLinkToken_idx" ON "Patient"("telegramLinkToken");

-- CreateIndex
CREATE INDEX "PatientOtp_patientId_createdAt_idx" ON "PatientOtp"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientRefreshToken_patientId_idx" ON "PatientRefreshToken"("patientId");

-- CreateIndex
CREATE INDEX "PatientAllergy_patientId_idx" ON "PatientAllergy"("patientId");

-- CreateIndex
CREATE INDEX "Encounter_hospitalId_type_status_idx" ON "Encounter"("hospitalId", "type", "status");

-- CreateIndex
CREATE INDEX "Encounter_patientId_idx" ON "Encounter"("patientId");

-- CreateIndex
CREATE INDEX "TriageAssessment_hospitalId_encounterId_idx" ON "TriageAssessment"("hospitalId", "encounterId");

-- CreateIndex
CREATE INDEX "MedicationAdministration_encounterId_idx" ON "MedicationAdministration"("encounterId");

-- CreateIndex
CREATE INDEX "MedicationAdministration_prescriptionItemId_idx" ON "MedicationAdministration"("prescriptionItemId");

-- CreateIndex
CREATE INDEX "NursingNote_encounterId_idx" ON "NursingNote"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_code_key" ON "LabTest"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_hospitalId_code_key" ON "LabTest"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "LabTestParameter_labTestId_idx" ON "LabTestParameter"("labTestId");

-- CreateIndex
CREATE INDEX "LabOrder_resultStatus_idx" ON "LabOrder"("resultStatus");

-- CreateIndex
CREATE INDEX "LabOrder_orderId_idx" ON "LabOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyStudy_code_key" ON "RadiologyStudy"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyStudy_hospitalId_code_key" ON "RadiologyStudy"("hospitalId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyOrder_orderId_key" ON "RadiologyOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_hospitalId_name_idx" ON "Product"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "Product_hospitalId_code_idx" ON "Product"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "Product_hospitalId_type_idx" ON "Product"("hospitalId", "type");

-- CreateIndex
CREATE INDEX "Product_rxNormCode_idx" ON "Product"("rxNormCode");

-- CreateIndex
CREATE INDEX "Product_terminologyConceptId_idx" ON "Product"("terminologyConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_hospitalId_code_key" ON "Product"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "PurchaseRequest_hospitalId_status_idx" ON "PurchaseRequest"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_hospitalId_supplierId_idx" ON "PurchaseOrder"("hospitalId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ObstetricHistory_patientId_key" ON "ObstetricHistory"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAdmission_encounterId_key" ON "DeliveryAdmission"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "BabyProfile_generatedPatientId_key" ON "BabyProfile"("generatedPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "AndrologyVisit_encounterId_key" ON "AndrologyVisit"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "CryoTank_code_key" ON "CryoTank"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_accountingEntryId_key" ON "GoodsReceipt"("accountingEntryId");

-- CreateIndex
CREATE INDEX "ProductStock_hospitalId_warehouseId_idx" ON "ProductStock"("hospitalId", "warehouseId");

-- CreateIndex
CREATE INDEX "ProductStock_expiryDate_idx" ON "ProductStock"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStock_warehouseId_productId_batchNumber_key" ON "ProductStock"("warehouseId", "productId", "batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_hospitalId_name_key" ON "Warehouse"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "StockTransaction_hospitalId_productId_idx" ON "StockTransaction"("hospitalId", "productId");

-- CreateIndex
CREATE INDEX "StockTransaction_referenceType_referenceId_idx" ON "StockTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "Prescription_hospitalId_status_idx" ON "Prescription"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_hospitalId_doctorId_scheduledStart_queueNumber_idx" ON "Appointment"("hospitalId", "doctorId", "scheduledStart", "queueNumber");

-- CreateIndex
CREATE INDEX "AuditLog_hospitalId_userId_action_idx" ON "AuditLog"("hospitalId", "userId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorSchedule_doctorId_key" ON "DoctorSchedule"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialYear_hospitalId_code_key" ON "FinancialYear"("hospitalId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriod_financialYearId_periodIndex_key" ON "FinancialPeriod"("financialYearId", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriod_financialYearId_periodCode_key" ON "FinancialPeriod"("financialYearId", "periodCode");

-- CreateIndex
CREATE UNIQUE INDEX "SystemAccountMapping_hospitalId_key_key" ON "SystemAccountMapping"("hospitalId", "key");

-- CreateIndex
CREATE INDEX "SystemSetting_hospitalId_group_idx" ON "SystemSetting"("hospitalId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_hospitalId_key_key" ON "SystemSetting"("hospitalId", "key");

-- CreateIndex
CREATE INDEX "Account_hospitalId_type_idx" ON "Account"("hospitalId", "type");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_hospitalId_code_key" ON "Account"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "AccountingEntry_hospitalId_entryDate_idx" ON "AccountingEntry"("hospitalId", "entryDate");

-- CreateIndex
CREATE INDEX "AccountingEntry_hospitalId_financialYearId_financialPeriodI_idx" ON "AccountingEntry"("hospitalId", "financialYearId", "financialPeriodId");

-- CreateIndex
CREATE INDEX "AccountingEntry_sourceModule_sourceId_idx" ON "AccountingEntry"("sourceModule", "sourceId");

-- CreateIndex
CREATE INDEX "AccountingEntryLine_accountId_idx" ON "AccountingEntryLine"("accountId");

-- CreateIndex
CREATE INDEX "AccountingEntryLine_entryId_idx" ON "AccountingEntryLine"("entryId");

-- CreateIndex
CREATE INDEX "AccountingEntryLine_costCenterId_idx" ON "AccountingEntryLine"("costCenterId");

-- CreateIndex
CREATE INDEX "CashierShiftClosing_hospitalId_idx" ON "CashierShiftClosing"("hospitalId");

-- CreateIndex
CREATE INDEX "CashierShiftClosing_cashierId_idx" ON "CashierShiftClosing"("cashierId");

-- CreateIndex
CREATE INDEX "CashierShiftClosing_accountingEntryId_idx" ON "CashierShiftClosing"("accountingEntryId");

-- CreateIndex
CREATE INDEX "Supplier_hospitalId_name_idx" ON "Supplier"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "Supplier_hospitalId_code_idx" ON "Supplier"("hospitalId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_accountingEntryId_key" ON "InventoryCount"("accountingEntryId");

-- CreateIndex
CREATE INDEX "InventoryCount_hospitalId_warehouseId_idx" ON "InventoryCount"("hospitalId", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryCount_date_idx" ON "InventoryCount"("date");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_inventoryCountId_productId_batchNumber_key" ON "InventoryCountLine"("inventoryCountId", "productId", "batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_accountingEntryId_key" ON "PurchaseInvoice"("accountingEntryId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_hospitalId_supplierId_idx" ON "PurchaseInvoice"("hospitalId", "supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_hospitalId_invoiceDate_idx" ON "PurchaseInvoice"("hospitalId", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_accountingEntryId_key" ON "PurchaseReturn"("accountingEntryId");

-- CreateIndex
CREATE INDEX "PurchaseReturn_hospitalId_supplierId_idx" ON "PurchaseReturn"("hospitalId", "supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_purchaseInvoiceId_idx" ON "PurchaseInvoiceLine"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "SupplierPayment_hospitalId_supplierId_idx" ON "SupplierPayment"("hospitalId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_hospitalId_paidAt_idx" ON "SupplierPayment"("hospitalId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosisCode_code_key" ON "DiagnosisCode"("code");

-- CreateIndex
CREATE INDEX "DiagnosisCode_code_idx" ON "DiagnosisCode"("code");

-- CreateIndex
CREATE INDEX "DiagnosisCode_nameEn_idx" ON "DiagnosisCode"("nameEn");

-- CreateIndex
CREATE INDEX "DiagnosisCode_icd10Code_idx" ON "DiagnosisCode"("icd10Code");

-- CreateIndex
CREATE INDEX "DiagnosisCode_terminologyConceptId_idx" ON "DiagnosisCode"("terminologyConceptId");

-- CreateIndex
CREATE INDEX "VisitDiagnosis_visitId_idx" ON "VisitDiagnosis"("visitId");

-- CreateIndex
CREATE INDEX "VitalSign_encounterId_idx" ON "VitalSign"("encounterId");

-- CreateIndex
CREATE INDEX "EncounterDiagnosis_encounterId_idx" ON "EncounterDiagnosis"("encounterId");

-- CreateIndex
CREATE INDEX "EncounterDiagnosis_diagnosisCodeId_idx" ON "EncounterDiagnosis"("diagnosisCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_accountingEntryId_key" ON "PayrollRun"("accountingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_hospitalId_month_year_key" ON "PayrollRun"("hospitalId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_userId_date_key" ON "AttendanceRecord"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceProvider_code_key" ON "InsuranceProvider"("code");

-- CreateIndex
CREATE INDEX "EmployeeRoster_date_idx" ON "EmployeeRoster"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRoster_userId_date_key" ON "EmployeeRoster"("userId", "date");

-- CreateIndex
CREATE INDEX "SurgeryCase_procedureConceptId_idx" ON "SurgeryCase"("procedureConceptId");

-- CreateIndex
CREATE INDEX "SurgeryCase_preOpDiagnosisConceptId_idx" ON "SurgeryCase"("preOpDiagnosisConceptId");

-- CreateIndex
CREATE INDEX "SurgeryCase_postOpDiagnosisConceptId_idx" ON "SurgeryCase"("postOpDiagnosisConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tagNumber_key" ON "Asset"("tagNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciation_accountingEntryId_key" ON "AssetDepreciation"("accountingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_hospitalId_name_key" ON "PriceList"("hospitalId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_serviceItemId_key" ON "PriceListItem"("priceListId", "serviceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_productId_key" ON "PriceListItem"("priceListId", "productId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "ClinicalNote_encounterId_idx" ON "ClinicalNote"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalNote_type_idx" ON "ClinicalNote"("type");

-- CreateIndex
CREATE INDEX "CarePlanItem_encounterId_idx" ON "CarePlanItem"("encounterId");

-- CreateIndex
CREATE INDEX "CarePlanExecution_carePlanItemId_idx" ON "CarePlanExecution"("carePlanItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TestMapping_deviceId_labTestId_key" ON "TestMapping"("deviceId", "labTestId");

-- CreateIndex
CREATE UNIQUE INDEX "TestMapping_deviceId_deviceTestCode_key" ON "TestMapping"("deviceId", "deviceTestCode");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_hospitalId_code_key" ON "CostCenter"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "DrugInteraction_drugAGeneric_idx" ON "DrugInteraction"("drugAGeneric");

-- CreateIndex
CREATE INDEX "DrugInteraction_drugBGeneric_idx" ON "DrugInteraction"("drugBGeneric");

-- CreateIndex
CREATE UNIQUE INDEX "DrugInteraction_drugAGeneric_drugBGeneric_key" ON "DrugInteraction"("drugAGeneric", "drugBGeneric");

-- CreateIndex
CREATE INDEX "CDSSAlert_hospitalId_patientId_idx" ON "CDSSAlert"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "CDSSAlert_hospitalId_status_idx" ON "CDSSAlert"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "CDSSAlert_alertType_severity_idx" ON "CDSSAlert"("alertType", "severity");

-- CreateIndex
CREATE INDEX "DosageRule_drugGeneric_idx" ON "DosageRule"("drugGeneric");

-- CreateIndex
CREATE UNIQUE INDEX "LabCriticalValue_labTestCode_ageGroup_gender_key" ON "LabCriticalValue"("labTestCode", "ageGroup", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "VitalCriticalValue_vitalType_ageGroup_key" ON "VitalCriticalValue"("vitalType", "ageGroup");

-- CreateIndex
CREATE UNIQUE INDEX "CPTCode_code_key" ON "CPTCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRule_hospitalId_serviceType_doctorId_key" ON "CommissionRule"("hospitalId", "serviceType", "doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_encounterId_key" ON "admissions"("encounterId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_admissionStatus_idx" ON "admissions"("hospitalId", "admissionStatus");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_patientId_idx" ON "admissions"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_actualAdmissionDate_idx" ON "admissions"("hospitalId", "actualAdmissionDate");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_dischargeDate_idx" ON "admissions"("hospitalId", "dischargeDate");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_wardId_idx" ON "admissions"("hospitalId", "wardId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_departmentId_idx" ON "admissions"("hospitalId", "departmentId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_admittingDoctorId_idx" ON "admissions"("hospitalId", "admittingDoctorId");

-- CreateIndex
CREATE INDEX "admission_notes_admissionId_type_idx" ON "admission_notes"("admissionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "discharge_planning_admissionId_key" ON "discharge_planning"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "DischargeSummary_admissionId_key" ON "DischargeSummary"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "DischargeSummary_encounterId_key" ON "DischargeSummary"("encounterId");

-- CreateIndex
CREATE INDEX "DischargeSummary_hospitalId_idx" ON "DischargeSummary"("hospitalId");

-- CreateIndex
CREATE INDEX "bed_transfers_admissionId_status_idx" ON "bed_transfers"("admissionId", "status");

-- CreateIndex
CREATE INDEX "bed_transfers_hospitalId_status_idx" ON "bed_transfers"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_token_key" ON "UserDevice"("token");

-- CreateIndex
CREATE INDEX "UserDevice_userId_idx" ON "UserDevice"("userId");

-- CreateIndex
CREATE INDEX "Referral_hospitalId_status_idx" ON "Referral"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "Referral_receivingDoctorId_status_idx" ON "Referral"("receivingDoctorId", "status");

-- CreateIndex
CREATE INDEX "ClinicalNoteTemplate_hospitalId_specialty_idx" ON "ClinicalNoteTemplate"("hospitalId", "specialty");

-- CreateIndex
CREATE INDEX "TransferOrder_hospitalId_status_idx" ON "TransferOrder"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "TransferOrder_encounterId_idx" ON "TransferOrder"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverNote_transferOrderId_key" ON "HandoverNote"("transferOrderId");

-- CreateIndex
CREATE INDEX "ICUFlowsheet_hospitalId_idx" ON "ICUFlowsheet"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "ICUFlowsheet_encounterId_shiftDate_shiftName_key" ON "ICUFlowsheet"("encounterId", "shiftDate", "shiftName");

-- CreateIndex
CREATE UNIQUE INDEX "VentilatorLog_entryId_key" ON "VentilatorLog"("entryId");

-- CreateIndex
CREATE INDEX "ICUDailyAssessment_hospitalId_idx" ON "ICUDailyAssessment"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "ICUDailyAssessment_encounterId_assessmentDate_key" ON "ICUDailyAssessment"("encounterId", "assessmentDate");

-- CreateIndex
CREATE INDEX "ICUMedicationDrip_hospitalId_encounterId_idx" ON "ICUMedicationDrip"("hospitalId", "encounterId");

-- CreateIndex
CREATE INDEX "ICUMedicationDrip_encounterId_status_idx" ON "ICUMedicationDrip"("encounterId", "status");

-- CreateIndex
CREATE INDEX "ICUEquipmentUsage_hospitalId_encounterId_idx" ON "ICUEquipmentUsage"("hospitalId", "encounterId");

-- CreateIndex
CREATE INDEX "PatientProblem_patientId_type_idx" ON "PatientProblem"("patientId", "type");

-- CreateIndex
CREATE INDEX "PatientProblem_hospitalId_patientId_idx" ON "PatientProblem"("hospitalId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientMedicalHistory_patientId_key" ON "PatientMedicalHistory"("patientId");

-- CreateIndex
CREATE INDEX "PatientMedicalHistory_patientId_idx" ON "PatientMedicalHistory"("patientId");

-- CreateIndex
CREATE INDEX "PatientPMHEntry_patientId_idx" ON "PatientPMHEntry"("patientId");

-- CreateIndex
CREATE INDEX "PatientSurgicalEntry_patientId_idx" ON "PatientSurgicalEntry"("patientId");

-- CreateIndex
CREATE INDEX "PatientFamilyHistoryEntry_patientId_idx" ON "PatientFamilyHistoryEntry"("patientId");

-- CreateIndex
CREATE INDEX "HomeMedication_patientId_isActive_idx" ON "HomeMedication"("patientId", "isActive");

-- CreateIndex
CREATE INDEX "HomeMedication_hospitalId_patientId_idx" ON "HomeMedication"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "OrderSet_hospitalId_category_idx" ON "OrderSet"("hospitalId", "category");

-- CreateIndex
CREATE INDEX "OrderSet_hospitalId_specialty_idx" ON "OrderSet"("hospitalId", "specialty");

-- CreateIndex
CREATE INDEX "OrderSet_hospitalId_status_idx" ON "OrderSet"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "OrderSet_hospitalId_contentKey_idx" ON "OrderSet"("hospitalId", "contentKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSet_hospitalId_contentKey_version_key" ON "OrderSet"("hospitalId", "contentKey", "version");

-- CreateIndex
CREATE INDEX "OrderSetItem_orderSetId_idx" ON "OrderSetItem"("orderSetId");

-- CreateIndex
CREATE INDEX "ClinicalPathway_hospitalId_targetDiagnosis_idx" ON "ClinicalPathway"("hospitalId", "targetDiagnosis");

-- CreateIndex
CREATE INDEX "ClinicalPathway_hospitalId_status_idx" ON "ClinicalPathway"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "ClinicalPathway_hospitalId_contentKey_idx" ON "ClinicalPathway"("hospitalId", "contentKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalPathway_hospitalId_contentKey_version_key" ON "ClinicalPathway"("hospitalId", "contentKey", "version");

-- CreateIndex
CREATE INDEX "ClinicalPathwayStep_pathwayId_dayNumber_idx" ON "ClinicalPathwayStep"("pathwayId", "dayNumber");

-- CreateIndex
CREATE INDEX "PathwayEnrollment_encounterId_idx" ON "PathwayEnrollment"("encounterId");

-- CreateIndex
CREATE INDEX "PathwayEnrollment_status_idx" ON "PathwayEnrollment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PathwayEnrollment_pathwayId_encounterId_key" ON "PathwayEnrollment"("pathwayId", "encounterId");

-- CreateIndex
CREATE INDEX "PathwayVariance_enrollmentId_idx" ON "PathwayVariance"("enrollmentId");

-- CreateIndex
CREATE INDEX "CareTask_enrollmentId_idx" ON "CareTask"("enrollmentId");

-- CreateIndex
CREATE INDEX "CareTask_status_idx" ON "CareTask"("status");

-- CreateIndex
CREATE INDEX "CareTask_assignedToId_idx" ON "CareTask"("assignedToId");

-- CreateIndex
CREATE INDEX "OrderSetReviewEvent_orderSetId_createdAt_idx" ON "OrderSetReviewEvent"("orderSetId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalPathwayReviewEvent_pathwayId_createdAt_idx" ON "ClinicalPathwayReviewEvent"("pathwayId", "createdAt");

-- CreateIndex
CREATE INDEX "Voucher_hospitalId_idx" ON "Voucher"("hospitalId");

-- CreateIndex
CREATE INDEX "Voucher_accountId_idx" ON "Voucher"("accountId");

-- CreateIndex
CREATE INDEX "Voucher_cashAccountId_idx" ON "Voucher"("cashAccountId");

-- CreateIndex
CREATE INDEX "TerminologyConcept_system_idx" ON "TerminologyConcept"("system");

-- CreateIndex
CREATE INDEX "TerminologyConcept_code_idx" ON "TerminologyConcept"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TerminologyConcept_system_code_key" ON "TerminologyConcept"("system", "code");

-- CreateIndex
CREATE INDEX "PatientMessage_patientId_createdAt_idx" ON "PatientMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientMessage_doctorId_isRead_idx" ON "PatientMessage"("doctorId", "isRead");

-- CreateIndex
CREATE INDEX "PatientMessage_threadId_idx" ON "PatientMessage"("threadId");

-- CreateIndex
CREATE INDEX "MedicationRefillRequest_patientId_status_idx" ON "MedicationRefillRequest"("patientId", "status");

-- CreateIndex
CREATE INDEX "MedicationRefillRequest_hospitalId_status_idx" ON "MedicationRefillRequest"("hospitalId", "status");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_insuranceProviderId_fkey" FOREIGN KEY ("insuranceProviderId") REFERENCES "InsuranceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_insurancePolicyId_fkey" FOREIGN KEY ("insurancePolicyId") REFERENCES "InsurancePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_motherId_fkey" FOREIGN KEY ("motherId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientOtp" ADD CONSTRAINT "PatientOtp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefreshToken" ADD CONSTRAINT "PatientRefreshToken_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterCharge" ADD CONSTRAINT "EncounterCharge_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterCharge" ADD CONSTRAINT "EncounterCharge_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterCharge" ADD CONSTRAINT "EncounterCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterCharge" ADD CONSTRAINT "EncounterCharge_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterCharge" ADD CONSTRAINT "EncounterCharge_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NursingNote" ADD CONSTRAINT "NursingNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NursingNote" ADD CONSTRAINT "NursingNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NursingNote" ADD CONSTRAINT "NursingNote_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestParameter" ADD CONSTRAINT "LabTestParameter_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderResult" ADD CONSTRAINT "LabOrderResult_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderResult" ADD CONSTRAINT "LabOrderResult_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "LabTestParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyStudy" ADD CONSTRAINT "RadiologyStudy_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyStudy" ADD CONSTRAINT "RadiologyStudy_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyOrder" ADD CONSTRAINT "RadiologyOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyOrder" ADD CONSTRAINT "RadiologyOrder_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "RadiologyStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_terminologyConceptId_fkey" FOREIGN KEY ("terminologyConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObstetricHistory" ADD CONSTRAINT "ObstetricHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAdmission" ADD CONSTRAINT "DeliveryAdmission_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BabyProfile" ADD CONSTRAINT "BabyProfile_deliveryAdmissionId_fkey" FOREIGN KEY ("deliveryAdmissionId") REFERENCES "DeliveryAdmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BabyProfile" ADD CONSTRAINT "BabyProfile_generatedPatientId_fkey" FOREIGN KEY ("generatedPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalVisit" ADD CONSTRAINT "AntenatalVisit_antenatalCareId_fkey" FOREIGN KEY ("antenatalCareId") REFERENCES "AntenatalCare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndrologyVisit" ADD CONSTRAINT "AndrologyVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndrologyVisit" ADD CONSTRAINT "AndrologyVisit_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndrologyVisit" ADD CONSTRAINT "AndrologyVisit_fertilityCaseId_fkey" FOREIGN KEY ("fertilityCaseId") REFERENCES "FertilityCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemenAnalysis" ADD CONSTRAINT "SemenAnalysis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemenAnalysis" ADD CONSTRAINT "SemenAnalysis_fertilityCaseId_fkey" FOREIGN KEY ("fertilityCaseId") REFERENCES "FertilityCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HormoneTest" ADD CONSTRAINT "HormoneTest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndrologySurgery" ADD CONSTRAINT "AndrologySurgery_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndrologySurgery" ADD CONSTRAINT "AndrologySurgery_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndrologyMedication" ADD CONSTRAINT "AndrologyMedication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AndrologyInvestigation" ADD CONSTRAINT "AndrologyInvestigation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryoTank" ADD CONSTRAINT "CryoTank_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryoCanister" ADD CONSTRAINT "CryoCanister_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "CryoTank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryoItem" ADD CONSTRAINT "CryoItem_canisterId_fkey" FOREIGN KEY ("canisterId") REFERENCES "CryoCanister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryoItem" ADD CONSTRAINT "CryoItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryoItem" ADD CONSTRAINT "CryoItem_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_femalePatientId_fkey" FOREIGN KEY ("femalePatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_malePatientId_fkey" FOREIGN KEY ("malePatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IVFCycle" ADD CONSTRAINT "IVFCycle_fertilityCaseId_fkey" FOREIGN KEY ("fertilityCaseId") REFERENCES "FertilityCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbryoRecord" ADD CONSTRAINT "EmbryoRecord_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilityMedication" ADD CONSTRAINT "FertilityMedication_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_dispenseRecordId_fkey" FOREIGN KEY ("dispenseRecordId") REFERENCES "DispenseRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseRecord" ADD CONSTRAINT "DispenseRecord_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseRecord" ADD CONSTRAINT "DispenseRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseRecord" ADD CONSTRAINT "DispenseRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_dispenseRecordId_fkey" FOREIGN KEY ("dispenseRecordId") REFERENCES "DispenseRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSchedule" ADD CONSTRAINT "DoctorSchedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSchedule" ADD CONSTRAINT "DoctorSchedule_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccountMapping" ADD CONSTRAINT "SystemAccountMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccountMapping" ADD CONSTRAINT "SystemAccountMapping_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccountMapping" ADD CONSTRAINT "SystemAccountMapping_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryLine" ADD CONSTRAINT "AccountingEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryLine" ADD CONSTRAINT "AccountingEntryLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryLine" ADD CONSTRAINT "AccountingEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShiftClosing" ADD CONSTRAINT "CashierShiftClosing_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShiftClosing" ADD CONSTRAINT "CashierShiftClosing_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShiftClosing" ADD CONSTRAINT "CashierShiftClosing_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisCode" ADD CONSTRAINT "DiagnosisCode_terminologyConceptId_fkey" FOREIGN KEY ("terminologyConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitDiagnosis" ADD CONSTRAINT "VisitDiagnosis_diagnosisCodeId_fkey" FOREIGN KEY ("diagnosisCodeId") REFERENCES "DiagnosisCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitDiagnosis" ADD CONSTRAINT "VisitDiagnosis_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_diagnosisCodeId_fkey" FOREIGN KEY ("diagnosisCodeId") REFERENCES "DiagnosisCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceProvider" ADD CONSTRAINT "InsuranceProvider_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceProvider" ADD CONSTRAINT "InsuranceProvider_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_insuranceProviderId_fkey" FOREIGN KEY ("insuranceProviderId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InsurancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InsurancePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRoster" ADD CONSTRAINT "EmployeeRoster_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRoster" ADD CONSTRAINT "EmployeeRoster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRoster" ADD CONSTRAINT "EmployeeRoster_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingTheatre" ADD CONSTRAINT "OperatingTheatre_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "OperatingTheatre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_procedureConceptId_fkey" FOREIGN KEY ("procedureConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_preOpDiagnosisConceptId_fkey" FOREIGN KEY ("preOpDiagnosisConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_postOpDiagnosisConceptId_fkey" FOREIGN KEY ("postOpDiagnosisConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryTeam" ADD CONSTRAINT "SurgeryTeam_surgeryCaseId_fkey" FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryTeam" ADD CONSTRAINT "SurgeryTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryConsumable" ADD CONSTRAINT "SurgeryConsumable_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryConsumable" ADD CONSTRAINT "SurgeryConsumable_surgeryCaseId_fkey" FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalDevice" ADD CONSTRAINT "MedicalDevice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_coSignedById_fkey" FOREIGN KEY ("coSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_parentNoteId_fkey" FOREIGN KEY ("parentNoteId") REFERENCES "ClinicalNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanExecution" ADD CONSTRAINT "CarePlanExecution_carePlanItemId_fkey" FOREIGN KEY ("carePlanItemId") REFERENCES "CarePlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanExecution" ADD CONSTRAINT "CarePlanExecution_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestMapping" ADD CONSTRAINT "TestMapping_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MedicalDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestMapping" ADD CONSTRAINT "TestMapping_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MedicalDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_admittingDoctorId_fkey" FOREIGN KEY ("admittingDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_primaryPhysicianId_fkey" FOREIGN KEY ("primaryPhysicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_referringDoctorId_fkey" FOREIGN KEY ("referringDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_attendingNurseId_fkey" FOREIGN KEY ("attendingNurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_previousAdmissionId_fkey" FOREIGN KEY ("previousAdmissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_notes" ADD CONSTRAINT "admission_notes_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_notes" ADD CONSTRAINT "admission_notes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_caseManagerId_fkey" FOREIGN KEY ("caseManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_socialWorkerId_fkey" FOREIGN KEY ("socialWorkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_followUpDoctorId_fkey" FOREIGN KEY ("followUpDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeSummary" ADD CONSTRAINT "DischargeSummary_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeSummary" ADD CONSTRAINT "DischargeSummary_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeSummary" ADD CONSTRAINT "DischargeSummary_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeSummary" ADD CONSTRAINT "DischargeSummary_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referringDoctorId_fkey" FOREIGN KEY ("referringDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_receivingDoctorId_fkey" FOREIGN KEY ("receivingDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNoteTemplate" ADD CONSTRAINT "ClinicalNoteTemplate_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNoteTemplate" ADD CONSTRAINT "ClinicalNoteTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_transferOrderId_fkey" FOREIGN KEY ("transferOrderId") REFERENCES "TransferOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_draftedById_fkey" FOREIGN KEY ("draftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheet" ADD CONSTRAINT "ICUFlowsheet_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheet" ADD CONSTRAINT "ICUFlowsheet_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheetEntry" ADD CONSTRAINT "ICUFlowsheetEntry_flowsheetId_fkey" FOREIGN KEY ("flowsheetId") REFERENCES "ICUFlowsheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheetEntry" ADD CONSTRAINT "ICUFlowsheetEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentilatorLog" ADD CONSTRAINT "VentilatorLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ICUFlowsheetEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUDailyAssessment" ADD CONSTRAINT "ICUDailyAssessment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUDailyAssessment" ADD CONSTRAINT "ICUDailyAssessment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUDailyAssessment" ADD CONSTRAINT "ICUDailyAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUMedicationDrip" ADD CONSTRAINT "ICUMedicationDrip_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUMedicationDrip" ADD CONSTRAINT "ICUMedicationDrip_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUMedicationDrip" ADD CONSTRAINT "ICUMedicationDrip_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUEquipmentUsage" ADD CONSTRAINT "ICUEquipmentUsage_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUEquipmentUsage" ADD CONSTRAINT "ICUEquipmentUsage_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProblem" ADD CONSTRAINT "PatientProblem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProblem" ADD CONSTRAINT "PatientProblem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProblem" ADD CONSTRAINT "PatientProblem_diagnosisCodeId_fkey" FOREIGN KEY ("diagnosisCodeId") REFERENCES "DiagnosisCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProblem" ADD CONSTRAINT "PatientProblem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedicalHistory" ADD CONSTRAINT "PatientMedicalHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedicalHistory" ADD CONSTRAINT "PatientMedicalHistory_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPMHEntry" ADD CONSTRAINT "PatientPMHEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPMHEntry" ADD CONSTRAINT "PatientPMHEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSurgicalEntry" ADD CONSTRAINT "PatientSurgicalEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSurgicalEntry" ADD CONSTRAINT "PatientSurgicalEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFamilyHistoryEntry" ADD CONSTRAINT "PatientFamilyHistoryEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFamilyHistoryEntry" ADD CONSTRAINT "PatientFamilyHistoryEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeMedication" ADD CONSTRAINT "HomeMedication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeMedication" ADD CONSTRAINT "HomeMedication_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeMedication" ADD CONSTRAINT "HomeMedication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeMedication" ADD CONSTRAINT "HomeMedication_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSet" ADD CONSTRAINT "OrderSet_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSet" ADD CONSTRAINT "OrderSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSet" ADD CONSTRAINT "OrderSet_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSet" ADD CONSTRAINT "OrderSet_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSet" ADD CONSTRAINT "OrderSet_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSet" ADD CONSTRAINT "OrderSet_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSet" ADD CONSTRAINT "OrderSet_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "OrderSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetItem" ADD CONSTRAINT "OrderSetItem_orderSetId_fkey" FOREIGN KEY ("orderSetId") REFERENCES "OrderSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetItem" ADD CONSTRAINT "OrderSetItem_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetItem" ADD CONSTRAINT "OrderSetItem_radiologyStudyId_fkey" FOREIGN KEY ("radiologyStudyId") REFERENCES "RadiologyStudy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetItem" ADD CONSTRAINT "OrderSetItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetItem" ADD CONSTRAINT "OrderSetItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetItem" ADD CONSTRAINT "OrderSetItem_terminologyConceptId_fkey" FOREIGN KEY ("terminologyConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "ClinicalPathway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathwayStep" ADD CONSTRAINT "ClinicalPathwayStep_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathwayStep" ADD CONSTRAINT "ClinicalPathwayStep_orderSetId_fkey" FOREIGN KEY ("orderSetId") REFERENCES "OrderSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayEnrollment" ADD CONSTRAINT "PathwayEnrollment_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayEnrollment" ADD CONSTRAINT "PathwayEnrollment_enrolledById_fkey" FOREIGN KEY ("enrolledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayVariance" ADD CONSTRAINT "PathwayVariance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "PathwayEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayVariance" ADD CONSTRAINT "PathwayVariance_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ClinicalPathwayStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayVariance" ADD CONSTRAINT "PathwayVariance_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "PathwayEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ClinicalPathwayStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetReviewEvent" ADD CONSTRAINT "OrderSetReviewEvent_orderSetId_fkey" FOREIGN KEY ("orderSetId") REFERENCES "OrderSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSetReviewEvent" ADD CONSTRAINT "OrderSetReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathwayReviewEvent" ADD CONSTRAINT "ClinicalPathwayReviewEvent_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathwayReviewEvent" ADD CONSTRAINT "ClinicalPathwayReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
