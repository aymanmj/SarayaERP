# ABAC & Tenant Isolation Coverage Report

**Generated:** 2026-05-19

| Metric | Count | Percentage |
|--------|-------|------------|
| Total Controllers | 89 | — |
| ABAC Guarded | 89 | 100% |
| Tenant Isolated | 75 | 84% |
| Exempt (Auth/Health/FHIR) | 6 | — |
| **Effective ABAC Coverage** | **83/83** | **100%** |

## Compliant Controllers

| Controller | Tenant Isolated | ABAC Guarded |
|------------|:---------------:|:------------:|
| AccountingController | ✅ | ✅ |
| AdmissionController | ✅ | ✅ |
| AiCodingController | ✅ | ✅ |
| AnalyticsController | ✅ | ✅ |
| AntenatalCareController | ✅ | ✅ |
| AppointmentsController | ✅ | ✅ |
| AssetsController | ✅ | ✅ |
| AttendanceController | ✅ | ✅ |
| AuditController | ✅ | ✅ |
| BackupController | ⚠️ | ✅ |
| BedsController | ✅ | ✅ |
| BillingController | ✅ | ✅ |
| CashierController | ✅ | ✅ |
| CDSSController | ✅ | ✅ |
| ClaimController | ✅ | ✅ |
| ClinicalNotesController | ✅ | ✅ |
| ClinicalPathwaysController | ✅ | ✅ |
| ClinicalProfileController | ✅ | ✅ |
| CommissionController | ✅ | ✅ |
| ComplianceController | ⚠️ | ✅ |
| ConsentFormsController | ✅ | ✅ |
| CronController | ⚠️ | ✅ |
| DashboardController | ✅ | ✅ |
| DeliveryController | ✅ | ✅ |
| DepartmentsController | ✅ | ✅ |
| DiagnosisController | ✅ | ✅ |
| DischargeSummaryController | ✅ | ✅ |
| EncountersController | ✅ | ✅ |
| FertilityController | ✅ | ✅ |
| FinancialYearsController | ✅ | ✅ |
| HrController | ✅ | ✅ |
| IcuController | ✅ | ✅ |
| InpatientRoundsController | ✅ | ✅ |
| InsuranceController | ✅ | ✅ |
| IntegrationController | ✅ | ✅ |
| InventoryController | ✅ | ✅ |
| InventoryCountController | ✅ | ✅ |
| LabController | ✅ | ✅ |
| LabOrdersController | ✅ | ✅ |
| LicenseController | ⚠️ | ✅ |
| MpiController | ✅ | ✅ |
| NoteTemplatesController | ✅ | ✅ |
| NotificationsController | ✅ | ✅ |
| NphiesController | ⚠️ | ✅ |
| NursingController | ✅ | ✅ |
| ObstetricHistoryController | ✅ | ✅ |
| OrdersController | ✅ | ✅ |
| OrderSetsController | ✅ | ✅ |
| PatientsController | ✅ | ✅ |
| PayrollController | ✅ | ✅ |
| PharmacyController | ✅ | ✅ |
| PortalAppointmentsController | ✅ | ✅ |
| PortalAuthController | ✅ | ✅ |
| PortalDirectoryController | ✅ | ✅ |
| PortalFhirExportController | ✅ | ✅ |
| PortalFinancialController | ✅ | ✅ |
| PortalMedicalController | ✅ | ✅ |
| PortalMessagingController | ✅ | ✅ |
| PortalRefillController | ✅ | ✅ |
| PriceListsController | ✅ | ✅ |
| PurchaseReturnsController | ✅ | ✅ |
| PurchasesController | ✅ | ✅ |
| QualityController | ✅ | ✅ |
| RadiologyController | ✅ | ✅ |
| ReferralController | ✅ | ✅ |
| RegistriesController | ✅ | ✅ |
| ReportsController | ✅ | ✅ |
| SchedulingController | ✅ | ✅ |
| ServicesController | ✅ | ✅ |
| SettingsController | ✅ | ✅ |
| SpecialtiesController | ⚠️ | ✅ |
| SuppliersController | ✅ | ✅ |
| SurgeryController | ✅ | ✅ |
| SystemSettingsController | ✅ | ✅ |
| TelehealthController | ⚠️ | ✅ |
| TenantController | ✅ | ✅ |
| TerminologyController | ⚠️ | ✅ |
| TransfersController | ✅ | ✅ |
| TriageController | ✅ | ✅ |
| UsersController | ✅ | ✅ |
| VisitsController | ✅ | ✅ |
| VitalsController | ✅ | ✅ |
| VouchersController | ✅ | ✅ |

## Exempt Controllers

> These controllers are intentionally exempt from ABAC: authentication endpoints, health probes, and FHIR standard integrations.

| Controller | Reason |
|------------|--------|
| AppController | Pre-auth / Infrastructure |
| AuthController | Pre-auth / Infrastructure |
| CdsHooksController | Pre-auth / Infrastructure |
| FhirController | Pre-auth / Infrastructure |
| HealthController | Pre-auth / Infrastructure |
| PortalTelegramController | Pre-auth / Infrastructure |
