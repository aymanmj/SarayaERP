# ABAC & Tenant Isolation Coverage Report

**Generated:** 2026-11-21

| Metric | Count | Percentage |
|--------|-------|------------|
| Total Controllers | 100 | — |
| ABAC Guarded | 100 | 100% |
| Tenant Isolated | 100 | 100% |
| Exempt (Auth/Health/FHIR) | 12 | — |
| **Effective ABAC Coverage** | **88/88** | **100%** |

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
| BedsController | ✅ | ✅ |
| BillingController | ✅ | ✅ |
| CashierController | ✅ | ✅ |
| CashierSessionsController | ✅ | ✅ |
| CDSSController | ✅ | ✅ |
| ClaimController | ✅ | ✅ |
| ClinicalNotesController | ✅ | ✅ |
| ClinicalPathwaysController | ✅ | ✅ |
| ClinicalProfileController | ✅ | ✅ |
| CommissionController | ✅ | ✅ |
| ConsentFormsController | ✅ | ✅ |
| ConsumptionOperationsController | ✅ | ✅ |
| DashboardController | ✅ | ✅ |
| DeliveryController | ✅ | ✅ |
| DepartmentsController | ✅ | ✅ |
| DeveloperController | ✅ | ✅ |
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
| InvoiceAdjustmentsController | ✅ | ✅ |
| InvoiceRefundsController | ✅ | ✅ |
| LabController | ✅ | ✅ |
| LabOrdersController | ✅ | ✅ |
| MpiController | ✅ | ✅ |
| NoteTemplatesController | ✅ | ✅ |
| NotificationsController | ✅ | ✅ |
| NphiesController | ✅ | ✅ |
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
| ProcurementController | ✅ | ✅ |
| PurchaseReturnsController | ✅ | ✅ |
| PurchasesController | ✅ | ✅ |
| QualityController | ✅ | ✅ |
| RadiologyController | ✅ | ✅ |
| RadiologyPacsController | ✅ | ✅ |
| RadiologyViewerController | ✅ | ✅ |
| RecallDisposalController | ✅ | ✅ |
| ReferralController | ✅ | ✅ |
| RefundWorklistController | ✅ | ✅ |
| RegistriesController | ✅ | ✅ |
| ReportsController | ✅ | ✅ |
| SchedulingController | ✅ | ✅ |
| ServicesController | ✅ | ✅ |
| SettingsController | ✅ | ✅ |
| SuppliersController | ✅ | ✅ |
| SurgeryController | ✅ | ✅ |
| SystemSettingsController | ✅ | ✅ |
| TelehealthController | ✅ | ✅ |
| TenantController | ✅ | ✅ |
| TransfersController | ✅ | ✅ |
| TriageController | ✅ | ✅ |
| UsersController | ✅ | ✅ |
| VisitsController | ✅ | ✅ |
| VitalsController | ✅ | ✅ |
| VouchersController | ✅ | ✅ |
| WarehouseController | ✅ | ✅ |

## Exempt Controllers

> These controllers are intentionally exempt from ABAC: authentication endpoints, health probes, and FHIR standard integrations.

| Controller | Reason |
|------------|--------|
| AppController | Pre-auth / Infrastructure |
| AuthController | Pre-auth / Infrastructure |
| BackupController | Pre-auth / Infrastructure |
| CdsHooksController | Pre-auth / Infrastructure |
| ComplianceController | Pre-auth / Infrastructure |
| CronController | Pre-auth / Infrastructure |
| FhirController | Pre-auth / Infrastructure |
| HealthController | Pre-auth / Infrastructure |
| LicenseController | Pre-auth / Infrastructure |
| PortalTelegramController | Pre-auth / Infrastructure |
| SpecialtiesController | Pre-auth / Infrastructure |
| TerminologyController | Pre-auth / Infrastructure |
