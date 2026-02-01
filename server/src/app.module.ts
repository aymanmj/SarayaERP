import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; // ✅ Rate Limiting

// Modules
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { EncountersModule } from './encounters/encounters.module';
import { VisitsModule } from './visits/visits.module';
import { OrdersModule } from './orders/orders.module';
import { BedsModule } from './beds/beds.module';
import { BillingModule } from './billing/billing.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { AuditModule } from './audit/audit.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { LabModule } from './labs/labs.module';
import { RadiologyModule } from './radiology/radiology.module';
import { LabOrdersModule } from './lab-orders/lab-orders.module';
import { CashierModule } from './cashier/cashier.module';
import { FinancialYearsModule } from './financial-years/financial-years.module';
import { SettingsModule } from './settings/settings.module';
import { AccountingModule } from './accounting/accounting.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { InventoryModule } from './inventory/inventory.module';
import { CronModule } from './cron/cron.module';
import { DiagnosisModule } from './diagnosis/diagnosis.module';
import { VitalsModule } from './vitals/vitals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ServicesModule } from './services/services.module';
import { UsersModule } from './users/users.module';
import { PayrollModule } from './payroll/payroll.module';
import { AttendanceModule } from './attendance/attendance.module';
import { InsuranceModule } from './insurance/insurance.module';
import { HealthModule } from './health/health.module';
import { NursingModule } from './nursing/nursing.module';
import { HrModule } from './hr/hr.module';
import { SurgeryModule } from './surgery/surgery.module';
import { AssetsModule } from './assets/assets.module';
import { ReportsModule } from './reports/reports.module';
import { PriceListsModule } from './price-lists/price-lists.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntegrationModule } from './integration/integration.module';
import { TriageModule } from './triage/triage.module';
import { DepartmentsModule } from './departments/departments.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { ClinicalModule } from './clinical/clinical.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PatientPortalModule } from './patient-portal/patient-portal.module';
import { PdfModule } from './pdf/pdf.module';
import { CDSSModule } from './cdss/cdss.module'; // ✅ [NEW] نظام دعم القرار السريري
import { AuditInterceptor } from './audit/audit.interceptor';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';

// Services & Controllers
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SoftDeleteService } from './common/soft-delete.service';
import { LicensingModule } from './licensing/licensing.module';
import { EventsGateway } from './events/events.gateway';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    
    // ✅ Rate Limiting Configuration
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'short',
          ttl: 1000,    // 1 second
          limit: 10,    // 10 requests per second
        },
        {
          name: 'medium',
          ttl: 10000,   // 10 seconds
          limit: 50,    // 50 requests per 10 seconds
        },
        {
          name: 'long',
          ttl: 60000,   // 1 minute
          limit: 200,   // 200 requests per minute
        },
      ],
    }),

    // Core Modules
    HealthModule,
    SettingsModule,
    AuthModule,
    AuditModule,

    // Medical & Clinical
    PatientsModule,
    EncountersModule,
    VisitsModule,
    AppointmentsModule,
    DiagnosisModule,
    VitalsModule,
    NursingModule,
    SurgeryModule,
    TriageModule,

    // Services
    OrdersModule,
    LabModule,
    LabOrdersModule,
    RadiologyModule,
    BedsModule,
    ServicesModule,
    PdfModule,
    LicensingModule,

    // Inventory & Pharmacy
    PharmacyModule,
    InventoryModule,
    SuppliersModule,
    PurchasesModule,

    // Finance & Billing
    BillingModule,
    CashierModule,
    AccountingModule,
    FinancialYearsModule,
    PayrollModule,
    InsuranceModule,
    AssetsModule,
    PriceListsModule,

    // HR
    AttendanceModule,
    UsersModule,
    HrModule,

    ClinicalModule,
    CDSSModule,       // ✅ [NEW] نظام دعم القرار السريري

    // Departments & Specialties
    DepartmentsModule,
    SpecialtiesModule,

    // Reports
    ReportsModule,

    // System
    CronModule,
    DashboardModule,
    NotificationsModule,
    IntegrationModule,
    AnalyticsModule,
    PatientPortalModule, // 👈 Phase 5: Patient Access
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SoftDeleteService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    // ✅ Rate Limiting Guard (global)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    EventsGateway,
    JwtService,
  ],
})
export class AppModule {}

// import { Module } from '@nestjs/common';
// import { ConfigModule } from '@nestjs/config';
// import { PrismaModule } from './prisma/prisma.module';
// import { EventEmitterModule } from '@nestjs/event-emitter';
// import { AuthModule } from './auth/auth.module';
// import { PatientsModule } from './patients/patients.module';
// import { EncountersModule } from './encounters/encounters.module';
// import { VisitsModule } from './visits/visits.module';
// import { OrdersModule } from './orders/orders.module';
// import { BedsModule } from './beds/beds.module';
// import { BillingModule } from './billing/billing.module';
// import { PharmacyModule } from './pharmacy/pharmacy.module';
// import { AuditModule } from './audit/audit.module';
// import { SoftDeleteService } from './common/soft-delete.service';
// import { AppointmentsModule } from './appointments/appointments.module';
// import { LabModule } from './labs/labs.module';
// import { RadiologyModule } from './radiology/radiology.module';
// import { LabOrdersModule } from './lab-orders/lab-orders.module';
// import { CashierService } from './cashier/cashier.service';
// import { CashierController } from './cashier/cashier.controller';
// import { CashierModule } from './cashier/cashier.module';
// import { FinancialYearsModule } from './financial-years/financial-years.module';
// import { SettingsModule } from './settings/settings.module';
// import { AccountingModule } from './accounting/accounting.module';
// import { SuppliersModule } from './suppliers/suppliers.module';
// import { PurchasesModule } from './purchases/purchases.module';
// import { HealthModule } from './health/health.module';
// import { InventoryModule } from './inventory/inventory.module';
// import { ScheduleModule } from '@nestjs/schedule';
// import { CronModule } from './cron/cron.module';
// import { DiagnosisModule } from './diagnosis/diagnosis.module';
// import { VitalsModule } from './vitals/vitals.module';
// import { DashboardModule } from './dashboard/dashboard.module';
// import { ServicesModule } from './services/services.module';
// import { UsersModule } from './users/users.module';
// import { PayrollModule } from './payroll/payroll.module';
// import { AttendanceModule } from './attendance/attendance.module';
// import { InsuranceModule } from './insurance/insurance.module';
// import { NursingModule } from './nursing/nursing.module';
// import { HrModule } from './hr/hr.module';

// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true }),
//     PrismaModule,
//     EventEmitterModule.forRoot(),
//     HealthModule,
//     SettingsModule,
//     AuthModule,
//     AccountingModule,
//     PatientsModule,
//     EncountersModule,
//     VisitsModule,
//     OrdersModule,
//     BedsModule,
//     BillingModule,
//     PharmacyModule,
//     AuditModule,
//     AppointmentsModule,
//     LabModule,
//     RadiologyModule,
//     LabOrdersModule,
//     CashierModule,
//     FinancialYearsModule,
//     SuppliersModule,
//     PurchasesModule,
//     InventoryModule,
//     ScheduleModule.forRoot(),
//     CronModule,
//     DiagnosisModule,
//     VitalsModule,
//     DashboardModule,
//     ServicesModule,
//     UsersModule,
//     PayrollModule,
//     AttendanceModule,
//     InsuranceModule,
//     NursingModule,
//     HrModule,
//   ],
//   providers: [SoftDeleteService, CashierService],
//   controllers: [CashierController],
// })
// export class AppModule {}

// @Module({
//   imports: [PatientsModule, AuthModule],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {}
