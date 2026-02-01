// scripts/resetData.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('⛔ DANGER: Cannot reset data in production environment!');
    process.exit(1);
  }

  console.log('⚠️ Resetting transactional data...');

  // الترتيب غير مهم مع CASCADE، لكننا نذكر الجداول للتوثيق
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
        "Notification",
        "AuditLog",
        
        -- HR & Payroll
        "PayrollSlip",
        "PayrollRun",
        "AttendanceRecord",
        "LeaveRequest",
        "EmployeeRoster",
        "WorkShift",

        -- Surgery
        "SurgeryConsumable",
        "SurgeryTeam",
        "SurgeryCase",
        "OperatingTheatre",

        -- Assets & Maintenance
        "MaintenanceTicket",
        "AssetDepreciation",
        "Asset",

        -- Finance & Billing
        "SupplierPayment",
        "Payment",
        "Invoice",
        "EncounterCharge",
        "PriceListItem",
        "PriceList",
        
        -- Inventory & Pharmacy
        "StockTransaction",
        "DispenseItem",
        "DispenseRecord",
        "PrescriptionItem",
        "Prescription",
        "ProductStock",
        "Product",
        "PurchaseInvoiceLine",
        "PurchaseInvoice",
        "Supplier",
        "Warehouse",

        -- Medical Records
        "LabOrder",
        "RadiologyOrder",
        "Order",
        "VisitDiagnosis",
        "EncounterDiagnosis",
        "VitalSign",
        "BedAssignment",
        "Visit",
        "Encounter",
        "Appointment",
        "Patient",
        "InsurancePolicy",
        "InsuranceProvider",

        -- Core Setup
        "DoctorSchedule",
        "UserRole",
        "RolePermission",
        "Permission",
        "User",
        "Role",
        "Bed",
        "Room",
        "Ward",
        "LabTest",
        "RadiologyStudy",
        "ServiceItem",
        "ServiceCategory",
        "Department",
        "Specialty",
        "SystemAccountMapping",
        "AccountingEntryLine",
        "AccountingEntry",
        "Account",
        "FinancialPeriod",
        "FinancialYear",
        "Hospital"
    RESTART IDENTITY CASCADE;
  `);

  console.log('✅ Done. All data reset successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// // scripts/resetData.ts

// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// async function main() {
//   // 🛡️ حماية: منع التشغيل في البيئة الإنتاجية بالخطأ
//   if (process.env.NODE_ENV === 'production') {
//     console.error('⛔ DANGER: Cannot reset data in production environment!');
//     process.exit(1);
//   }

//   console.log('⚠️ Resetting transactional data...');

//   // الترتيب مهم أحياناً بسبب القيود (Foreign Keys)، لكن CASCADE يحل معظمها
//   await prisma.$executeRawUnsafe(`
//     TRUNCATE TABLE
//         "AccountingEntryLine",
//         "AccountingEntry",
//         "DispenseItem",
//         "DispenseRecord",
//         "Invoice",
//         "CashierShiftClosing",
//         "Payment",
//         "SupplierPayment",

//         -- 👇 الجداول الجديدة للمخزون
//         "StockTransaction",
//         "Product",
//         "PurchaseInvoiceLine",
//         "PurchaseInvoice",

//         -- 👇 جداول الوصفات
//         "PrescriptionItem",
//         "Prescription",

//         -- 👇 جداول المختبر والأشعة
//         "LabOrder",
//         "LabTest",
//         "RadiologyOrder",
//         "RadiologyStudy",
//         "Order",
//         "EncounterCharge",
//         "Visit",
//         "BedAssignment",

//         -- 👇 الجداول الأساسية
//         "Encounter",
//         "Appointment",
//         "Patient",
//         "Supplier",

//         -- 👇 جداول المالية (احذر: هل تريد مسح السنوات المالية عند كل ريسيت؟)
//         "FinancialPeriod",
//         "FinancialYear",
//         "AuditLog"
//     RESTART IDENTITY CASCADE;
//   `);

//   console.log('✅ Done. Transactional data reset successfully.');
// }

// main()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });

// // // scripts/resetData.ts
// // import { PrismaClient } from '@prisma/client';

// // const prisma = new PrismaClient();

// // async function main() {
// //   console.log('⚠️ Resetting transactional data...');

// //   // الأفضل استخدام TRUNCATE من خلال executeRaw للحفاظ على FK و RESTART IDENTITY
// //   await prisma.$executeRawUnsafe(`
// //     TRUNCATE TABLE
// //      "AccountingEntryLine",
// //         "AccountingEntry",
// //         "DispenseItem",
// //         "DispenseRecord",
// //         "Invoice",
// //         "CashierShiftClosing",
// //         "Payment",
// //         "PharmacyStockTransaction",
// //         "Prescription",
// //         "PrescriptionItem",
// //         "PurchaseInvoice",
// //         "PurchaseInvoiceLine",
// //         "LabTest",
// //         "LabOrder",
// //         "Order",
// //         "RadiologyStudy",
// //         "RadiologyOrder",
// //         "Encounter",
// //         "Appointment",
// //         "Patient",
// //         "Supplier",
// //         "Visit",
// //         "SupplierPayment",
// //         "FinancialYear",
// //         "FinancialPeriod",
// //         "Patient"
// //     RESTART IDENTITY CASCADE;
// //   `);

// //   console.log('✅ Done. Transactional data reset successfully.');
// // }

// // main()
// //   .catch((e) => {
// //     console.error(e);
// //     process.exit(1);
// //   })
// //   .finally(async () => {
// //     await prisma.$disconnect();
// //   });
