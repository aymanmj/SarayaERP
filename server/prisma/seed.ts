// prisma/seed.ts

import {
  PrismaClient,
  AccountType,
  ProductType,
  ServiceType,
  SystemAccountKey,
  ShiftType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { seedCDSS } from './seeds/seed-cdss';
import { seedMedicalData } from './seeds/data/seed-medical-data';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Enterprise Seeding for Saraya ERP...');

  // ====================================================
  // 1. الأساسيات (المستشفى، الأقسام، الأدوار)
  // ====================================================

  const hospital = await prisma.hospital.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      code: 'MAIN',
      name: 'مستشفى السرايا الدولي',
      displayName: 'Saraya International Hospital',
      isActive: true,
      printHeaderFooter: true,
    },
  });

  console.log('🏥 Hospital Setup: Done.');

  // الأقسام
  const depts = [
    'الاستقبال العام',
    'الطوارئ',
    'العيادات الخارجية',
    'المختبر',
    'الأشعة',
    'الصيدلية',
    'العمليات',
    'العناية المركزة',
    'الموارد البشرية',
    'الحسابات',
  ];

  for (const d of depts) {
    await prisma.department.upsert({
      where: { id: depts.indexOf(d) + 1 }, // تبسيط للـ ID
      update: {},
      create: { hospitalId: hospital.id, name: d },
    });
  }

  // الأدوار (Roles)
  const rolesData = [
    { name: 'ADMIN', description: 'System Administrator' },
    { name: 'DOCTOR', description: 'Medical Doctor' },
    { name: 'NURSE', description: 'Nursing Staff' },
    { name: 'RECEPTION', description: 'Receptionist' },
    { name: 'PHARMACIST', description: 'Pharmacist' },
    { name: 'ACCOUNTANT', description: 'Accountant' },
    { name: 'CASHIER', description: 'Cashier' },
    { name: 'STORE_KEEPER', description: 'Inventory Manager' },
    { name: 'HR', description: 'Human Resources' },
    { name: 'LAB_TECH', description: 'Lab Technician' },
    { name: 'RAD_TECH', description: 'Radiology Technician' },
    { name: 'IT_ADMIN', description: 'IT & Integration Admin' },
  ];

  for (const r of rolesData) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: { name: r.name, description: r.description, isSystem: true },
    });
  }

  // ====================================================
  // 2. تعريف الصلاحيات القياسية (System Permissions) ✅ [NEW]
  // ====================================================
  const permissionsList = [
    // موديول الفوترة
    { code: 'billing:invoice:create', description: 'إصدار فاتورة مريض' },
    { code: 'billing:invoice:cancel', description: 'إلغاء فاتورة مريض معتمدة' },
    {
      code: 'billing:invoice:view',
      description: 'عرض التقارير المالية للفواتير',
    },

    // موديول المشتريات
    { code: 'purchases:invoice:create', description: 'إنشاء فاتورة مشتريات' },
    {
      code: 'purchases:invoice:approve',
      description: 'اعتماد المشتريات وتحديث المخزن',
    },
    { code: 'purchases:payment:record', description: 'تسجيل دفعات للموردين' },

    // موديول المحاسبة
    { code: 'acc:entry:create', description: 'إدخال قيود محاسبية يدوية' },
    { code: 'acc:year:close', description: 'إقفال السنة المالية' },
    {
      code: 'acc:report:view',
      description: 'الاطلاع على الميزانية وميزان المراجعة',
    },

    // موديول الملف الطبي
    { code: 'emr:patient:view', description: 'الاطلاع على الملف الطبي للمريض' },
    { code: 'emr:diagnosis:edit', description: 'إضافة وتعديل التشخيصات' },
    { code: 'emr:vitals:record', description: 'تسجيل العلامات الحيوية' },

    // موديول التنويم (Inpatient)
    { code: 'INPATIENT_VIEW_ALL_PATIENTS', description: 'عرض كل المرضى في القسم (تمريض)' },
    { code: 'INPATIENT_VIEW_MY_PATIENTS', description: 'عرض قائمة مرضى الطبيب' },
    { code: 'INPATIENT_VIEW_NOTES', description: 'عرض ملاحظات التمريض والمرور' },
    { code: 'INPATIENT_ADD_NOTE', description: 'إضافة ملاحظة جديدة' },
    { code: 'INPATIENT_VIEW_CARE_PLAN', description: 'عرض خطة الرعاية' },
    { code: 'INPATIENT_ADD_ORDER', description: 'إضافة أمر طبي (طبيب)' },
    { code: 'INPATIENT_COMPLETE_ORDER', description: 'إكمال تنفيذ أمر طبي' },
    { code: 'INPATIENT_EXECUTE_ORDER', description: 'تنفيذ أمر طبي (تمريض)' },
    { code: 'INPATIENT_VIEW_EXECUTIONS', description: 'سجل تنفيذ الأوامر' },

    // موديول المواعيد
    {
      code: 'clinical:doctors:list',
      description: 'رؤية قائمة الأطباء فقط لحجز المواعيد',
    },
    { code: 'clinical:appointment:create', description: 'حجز موعد طبي' },
    { code: 'clinical:appointment:view', description: 'عرض المواعيد الطبية' },
    {
      code: 'system:users:manage',
      description: 'إدارة الموظفين والرواتب (أدمن فقط)',
    },
  ];

  for (const p of permissionsList) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description },
      create: { code: p.code, description: p.description },
    });
  }

  console.log('🔑 Permissions created.');

  // ====================================================
  // 3. ربط الصلاحيات بالأدوار (Role-Permission Mapping) ✅ [NEW]
  // ====================================================

  // ====================================================
  // 3. ربط الصلاحيات بالأدوار (Role-Permission Mapping) ✅ [ROBUST] SOURCE OF TRUTH
  // ====================================================

  const rolePermissionMapping: Record<string, string[]> = {
    ADMIN: permissionsList.map((p) => p.code), // الأدمن له كل شيء

    NURSE: [
        // Inpatient / Nursing Station
        'INPATIENT_VIEW_ALL_PATIENTS',
        'INPATIENT_VIEW_NOTES',
        'INPATIENT_ADD_NOTE',
        'INPATIENT_VIEW_CARE_PLAN',
        'INPATIENT_ADD_ORDER',
        'INPATIENT_COMPLETE_ORDER',
        'INPATIENT_EXECUTE_ORDER',
        'INPATIENT_VIEW_EXECUTIONS',
        'INPATIENT_VIEW_MY_PATIENTS',
        // EMR & Vitals
        'emr:patient:view',
        'emr:vitals:record',
    ],

    ACCOUNTANT: [
      'billing:invoice:view',
      'purchases:invoice:create',
      'purchases:invoice:approve',
      'purchases:payment:record',
      'acc:entry:create',
      'acc:report:view',
    ],

    // RECEPTION: [
    //   'billing:invoice:create',
    //   'emr:patient:view',
    //   'clinical:appointment:view',
    //   'clinical:appointment:create',
    // ],

    RECEPTION: [
      'clinical:doctors:list',
      'clinical:appointment:create',
      'clinical:appointment:view',
      'emr:patient:view',
      'billing:invoice:create',
    ],

    DOCTOR: [
      'emr:patient:view',
      'emr:diagnosis:edit',
      'emr:vitals:record',
      'clinical:appointment:view',
      'INPATIENT_VIEW_MY_PATIENTS',
      'INPATIENT_VIEW_NOTES',
      'INPATIENT_ADD_NOTE',
      'INPATIENT_VIEW_CARE_PLAN',
      'INPATIENT_ADD_ORDER',
      'INPATIENT_VIEW_EXECUTIONS',
    ],
  };

  for (const [roleName, permissions] of Object.entries(rolePermissionMapping)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;

    for (const permCode of permissions) {
      const permission = await prisma.permission.findUnique({
        where: { code: permCode },
      });
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log('🔗 Roles and Permissions linked successfully.');

  // ====================================================
  // ✅ 1.5 إنشاء المستخدمين (Users) - الجزء المضاف
  // ====================================================

  // كلمة المرور الموحدة للتجربة: 123456
  // للأدمن: admin123
  const adminPass = await bcrypt.hash('admin123', 10);
  const userPass = await bcrypt.hash('123456', 10);

  const createUser = async (
    username: string,
    name: string,
    roles: string[],
    passwordHash: string,
    isDoctor = false,
  ) => {
    const user = await prisma.user.upsert({
      where: { username },
      update: { passwordHash },
      create: {
        hospitalId: hospital.id,
        fullName: name,
        username,
        passwordHash,
        isDoctor,
        isActive: true,
        basicSalary: 3000,
        email: `${username}@saraya.ly`, // بريد افتراضي
      },
    });

    for (const r of roles) {
      const roleObj = await prisma.role.findUnique({ where: { name: r } });
      if (roleObj) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: roleObj.id } },
          update: {},
          create: { userId: user.id, roleId: roleObj.id },
        });
      }
    }

    // إذا كان طبيباً، ننشئ له جدول مواعيد افتراضي
    if (isDoctor) {
      await prisma.doctorSchedule.upsert({
        where: { doctorId: user.id },
        update: {},
        create: {
          hospitalId: hospital.id,
          doctorId: user.id,
          maxPerDay: 20,
        },
      });
    }
  };

  // إنشاء حساب الأدمن الرئيسي
  await createUser(
    'admin',
    'System Administrator',
    ['ADMIN', 'IT_ADMIN'],
    adminPass,
  );

  // إنشاء حسابات الأطباء والموظفين للتجربة
  await createUser(
    'dr_ahmed',
    'د. أحمد علي (باطنة)',
    ['DOCTOR'],
    userPass,
    true,
  );
  await createUser(
    'dr_sara',
    'د. سارة محمد (جراحة)',
    ['DOCTOR'],
    userPass,
    true,
  );
  await createUser('nurse_laila', 'الممرضة ليلى', ['NURSE'], userPass);
  await createUser('reception_user', 'موظف الاستقبال', ['RECEPTION'], userPass);
  await createUser('pharm_ali', 'د. علي (صيدلي)', ['PHARMACIST'], userPass);
  await createUser('cashier_mo', 'محمد (كاشير)', ['CASHIER'], userPass);
  await createUser('acc_samir', 'سمير (محاسب)', ['ACCOUNTANT'], userPass);
  await createUser('hr_muna', 'منى (HR)', ['HR'], userPass);
  await createUser('lab_user', 'فني مختبر', ['LAB_TECH'], userPass);
  await createUser('rad_user', 'فني أشعة', ['RAD_TECH'], userPass);
  await createUser('store_keeper', 'أمين المخزن', ['STORE_KEEPER'], userPass);

  console.log('👥 Users & Roles: Done.');

  // ====================================================
  // 2. المخازن والمنتجات (أدوية شاملة)
  // ====================================================

  const mainWH = await prisma.warehouse.upsert({
    where: {
      hospitalId_name: { hospitalId: hospital.id, name: 'المخزن الرئيسي' },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'المخزن الرئيسي',
      code: 'WH-MAIN',
    },
  });

  const pharmWH = await prisma.warehouse.upsert({
    where: {
      hospitalId_name: { hospitalId: hospital.id, name: 'صيدلية المستشفى' },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'صيدلية المستشفى',
      code: 'WH-PHARM',
    },
  });

  const otWH = await prisma.warehouse.upsert({
    where: { hospitalId_name: { hospitalId: hospital.id, name: 'OT Store' } },
    update: {},
    create: { hospitalId: hospital.id, name: 'OT Store', code: 'WH-OT' },
  });

  // قائمة أدوية واقعية وشاملة
  const drugs = [
    // مسكنات وخافضات حرارة
    {
      code: 'D001',
      name: 'Panadol 500mg',
      generic: 'Paracetamol',
      form: 'Tablet',
      cost: 1.5,
      sell: 3,
      stock: 1000,
    },
    {
      code: 'D002',
      name: 'Panadol Extra',
      generic: 'Paracetamol/Caffeine',
      form: 'Tablet',
      cost: 2,
      sell: 4.5,
      stock: 500,
    },
    {
      code: 'D003',
      name: 'Brufen 400mg',
      generic: 'Ibuprofen',
      form: 'Tablet',
      cost: 3,
      sell: 6,
      stock: 800,
    },
    {
      code: 'D004',
      name: 'Cataflam 50mg',
      generic: 'Diclofenac Potassium',
      form: 'Tablet',
      cost: 4,
      sell: 8,
      stock: 600,
    },
    {
      code: 'D005',
      name: 'Voltaren 75mg',
      generic: 'Diclofenac Sodium',
      form: 'Injection',
      cost: 5,
      sell: 15,
      stock: 300,
    },

    // مضادات حيوية
    {
      code: 'D010',
      name: 'Augmentin 1g',
      generic: 'Amoxicillin/Clavulanate',
      form: 'Tablet',
      cost: 15,
      sell: 25,
      stock: 400,
    },
    {
      code: 'D011',
      name: 'Augmentin 625mg',
      generic: 'Amoxicillin/Clavulanate',
      form: 'Tablet',
      cost: 12,
      sell: 20,
      stock: 300,
    },
    {
      code: 'D012',
      name: 'Zithromax 500mg',
      generic: 'Azithromycin',
      form: 'Tablet',
      cost: 20,
      sell: 35,
      stock: 200,
    },
    {
      code: 'D013',
      name: 'Ceftriaxone 1g',
      generic: 'Ceftriaxone',
      form: 'Injection',
      cost: 10,
      sell: 25,
      stock: 500,
    },
    {
      code: 'D014',
      name: 'Cipro 500mg',
      generic: 'Ciprofloxacin',
      form: 'Tablet',
      cost: 18,
      sell: 30,
      stock: 250,
    },

    // جهاز هضمي
    {
      code: 'D020',
      name: 'Nexium 40mg',
      generic: 'Esomeprazole',
      form: 'Tablet',
      cost: 25,
      sell: 45,
      stock: 300,
    },
    {
      code: 'D021',
      name: 'Pantozol 40mg',
      generic: 'Pantoprazole',
      form: 'Tablet',
      cost: 22,
      sell: 40,
      stock: 300,
    },
    {
      code: 'D022',
      name: 'Buscopan 10mg',
      generic: 'Hyoscine',
      form: 'Tablet',
      cost: 5,
      sell: 10,
      stock: 600,
    },
    {
      code: 'D023',
      name: 'Flagyl',
      generic: 'Metronidazole',
      form: 'Tablet',
      cost: 4,
      sell: 8,
      stock: 400,
    },

    // أمراض مزمنة (ضغط/سكر)
    {
      code: 'D030',
      name: 'Concor 5mg',
      generic: 'Bisoprolol',
      form: 'Tablet',
      cost: 12,
      sell: 20,
      stock: 500,
    },
    {
      code: 'D031',
      name: 'Glucophage 1000mg',
      generic: 'Metformin',
      form: 'Tablet',
      cost: 8,
      sell: 15,
      stock: 800,
    },
    {
      code: 'D032',
      name: 'Daonil 5mg',
      generic: 'Glibenclamide',
      form: 'Tablet',
      cost: 6,
      sell: 12,
      stock: 400,
    },
    {
      code: 'D033',
      name: 'Amlor 5mg',
      generic: 'Amlodipine',
      form: 'Tablet',
      cost: 14,
      sell: 24,
      stock: 500,
    },
    {
      code: 'D034',
      name: 'Lipitor 20mg',
      generic: 'Atorvastatin',
      form: 'Tablet',
      cost: 30,
      sell: 55,
      stock: 300,
    },

    // محاليل ومستلزمات
    {
      code: 'S001',
      name: 'Normal Saline 0.9% 500ml',
      generic: 'Sodium Chloride',
      form: 'Solution',
      cost: 3,
      sell: 10,
      stock: 2000,
      type: ProductType.SUPPLY,
    },
    {
      code: 'S002',
      name: 'Glucose 5% 500ml',
      generic: 'Dextrose',
      form: 'Solution',
      cost: 3,
      sell: 10,
      stock: 1500,
      type: ProductType.SUPPLY,
    },
    {
      code: 'S003',
      name: 'Cannula G20 (Pink)',
      generic: 'IV Cannula',
      form: 'Unit',
      cost: 1,
      sell: 5,
      stock: 3000,
      type: ProductType.SUPPLY,
    },
    {
      code: 'S004',
      name: 'Cannula G22 (Blue)',
      generic: 'IV Cannula',
      form: 'Unit',
      cost: 1,
      sell: 5,
      stock: 3000,
      type: ProductType.SUPPLY,
    },
    {
      code: 'S005',
      name: 'Surgical Gloves 7.5',
      generic: 'Gloves',
      form: 'Pair',
      cost: 2,
      sell: 5,
      stock: 5000,
      type: ProductType.SUPPLY,
    },
    {
      code: 'ANESTH',
      name: 'General Anesthesia Vial',
      type: ProductType.DRUG,
      cost: 50.0,
      sell: 120.0,
      stock: 50,
    },
  ];

  for (const d of drugs) {
    const product = await prisma.product.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: d.code } },
      update: { stockOnHand: d.stock },
      create: {
        hospitalId: hospital.id,
        code: d.code,
        name: d.name,
        genericName: d.generic,
        form: d.form,
        type: d.type || ProductType.DRUG, // Default DRUG
        costPrice: d.cost,
        sellPrice: d.sell,
        stockOnHand: d.stock,
        minStock: 50,
      },
    });

    // إضافة رصيد للصيدلية
    await prisma.productStock.upsert({
      where: {
        warehouseId_productId_batchNumber: {
          warehouseId: pharmWH.id,
          productId: product.id,
          batchNumber: 'INIT-2025',
        },
      },
      update: { quantity: d.stock },
      create: {
        hospitalId: hospital.id,
        warehouseId: pharmWH.id,
        productId: product.id,
        batchNumber: 'INIT-2025',
        expiryDate: new Date('2026-12-31'),
        quantity: d.stock,
      },
    });

    // رصيد في العمليات (للتخدير فقط)
    if (d.code === 'ANESTH') {
      await prisma.productStock.upsert({
        where: {
          warehouseId_productId_batchNumber: {
            warehouseId: otWH.id,
            productId: product.id,
            batchNumber: 'INIT-2025',
          },
        },
        update: { quantity: 20 },
        create: {
          hospitalId: hospital.id,
          warehouseId: otWH.id,
          productId: product.id,
          batchNumber: 'INIT-2025',
          expiryDate: new Date('2027-01-01'),
          quantity: 20,
        },
      });
    }
  }

  console.log('💊 Pharmacy & Inventory: Done.');

  // ====================================================
  // 3. التحاليل الطبية الشاملة (Lab Tests with Parameters)
  // ====================================================

  // قوائم الأسعار (تعريفها قبل التحاليل)
  const cashList = await prisma.priceList.upsert({
    where: {
      hospitalId_name: {
        hospitalId: hospital.id,
        name: 'قائمة النقدي (الأساسية)',
      },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'قائمة النقدي (الأساسية)',
      isDefault: true,
    },
  });

  const insuranceList = await prisma.priceList.upsert({
    where: {
      hospitalId_name: {
        hospitalId: hospital.id,
        name: 'Libya Insurance - Class A',
      },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'Libya Insurance - Class A',
      isDefault: false,
    },
  });

  // ✅ القائمة الجديدة والمعدلة
  const labTestsData = [
    // --- 1. CBC (Panel) ---
    {
      code: 'CBC',
      name: 'Complete Blood Count',
      cat: 'Hematology',
      price: 25,
      params: [
        {
          code: 'WBC',
          name: 'White Blood Cells',
          unit: '10^3/uL',
          ref: '4.0-10.0',
        },
        {
          code: 'RBC',
          name: 'Red Blood Cells',
          unit: '10^6/uL',
          ref: '4.5-5.5',
        },
        { code: 'HGB', name: 'Hemoglobin', unit: 'g/dL', ref: '13.0-17.0' },
        { code: 'HCT', name: 'Hematocrit', unit: '%', ref: '40-50' },
        {
          code: 'MCV',
          name: 'Mean Corpuscular Volume',
          unit: 'fL',
          ref: '80-100',
        },
        { code: 'PLT', name: 'Platelets', unit: '10^3/uL', ref: '150-450' },
        { code: 'LYM', name: 'Lymphocytes %', unit: '%', ref: '20-40' },
        { code: 'NEUT', name: 'Neutrophils %', unit: '%', ref: '40-60' },
      ],
    },

    // --- 2. Lipid Profile (Panel) ---
    {
      code: 'LIPID',
      name: 'Lipid Profile',
      cat: 'Biochemistry',
      price: 60,
      params: [
        { code: 'CHOL', name: 'Total Cholesterol', unit: 'mg/dL', ref: '<200' },
        { code: 'TRIG', name: 'Triglycerides', unit: 'mg/dL', ref: '<150' },
        { code: 'HDL', name: 'HDL Cholesterol', unit: 'mg/dL', ref: '>40' },
        { code: 'LDL', name: 'LDL Cholesterol', unit: 'mg/dL', ref: '<100' },
      ],
    },

    // --- 3. Liver Function (Panel) ---
    {
      code: 'LFT',
      name: 'Liver Function Tests',
      cat: 'Biochemistry',
      price: 70,
      params: [
        { code: 'ALT', name: 'ALT (SGPT)', unit: 'U/L', ref: '0-41' },
        { code: 'AST', name: 'AST (SGOT)', unit: 'U/L', ref: '0-40' },
        {
          code: 'ALP',
          name: 'Alkaline Phosphatase',
          unit: 'U/L',
          ref: '40-129',
        },
        {
          code: 'BIL-T',
          name: 'Bilirubin Total',
          unit: 'mg/dL',
          ref: '0.1-1.2',
        },
        { code: 'ALB', name: 'Albumin', unit: 'g/dL', ref: '3.5-5.0' },
      ],
    },

    // --- 4. Single Tests ---
    {
      code: 'FBS',
      name: 'Fasting Blood Sugar',
      cat: 'Biochemistry',
      price: 10,
      params: [],
    },
    {
      code: 'HBA1C',
      name: 'HbA1c',
      cat: 'Biochemistry',
      price: 40,
      params: [],
    },
    {
      code: 'TSH',
      name: 'Thyroid Stimulating Hormone',
      cat: 'Hormones',
      price: 35,
      params: [],
    },
    {
      code: 'VITD',
      name: 'Vitamin D',
      cat: 'Hormones',
      price: 80,
      params: [],
    },
    {
      code: 'UREA',
      name: 'Urea',
      cat: 'Biochemistry',
      price: 15,
      params: [],
    },
    {
      code: 'CREAT',
      name: 'Creatinine',
      cat: 'Biochemistry',
      price: 15,
      params: [],
    },
    // تحاليل إضافية
    {
      code: 'ESR',
      name: 'Erythrocyte Sedimentation Rate',
      cat: 'Hematology',
      price: 10,
      params: [],
    },
    {
      code: 'ABO',
      name: 'Blood Grouping & Rh',
      cat: 'Hematology',
      price: 15,
      params: [],
    },
    {
      code: 'PT',
      name: 'Prothrombin Time',
      cat: 'Hematology',
      price: 20,
      params: [],
    },
    {
      code: 'URINE',
      name: 'Urine Analysis',
      cat: 'Microbiology',
      price: 15,
      params: [],
    },
  ];

  for (const t of labTestsData) {
    // 1. Service Item
    const srv = await prisma.serviceItem.upsert({
      where: { code: `LAB-${t.code}` },
      update: { defaultPrice: t.price },
      create: {
        hospitalId: hospital.id,
        code: `LAB-${t.code}`,
        name: t.name,
        type: ServiceType.LAB,
        defaultPrice: t.price,
      },
    });

    // 2. Lab Test
    const labTest = await prisma.labTest.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: t.code } },
      update: {},
      create: {
        hospitalId: hospital.id,
        code: t.code,
        name: t.name,
        category: t.cat,
        serviceItemId: srv.id,
      },
    });

    // 3. Parameters (Sub-tests)
    if (t.params && t.params.length > 0) {
      for (const p of t.params) {
        // نبحث عن المعيار داخل هذا التحليل
        const existingParam = await prisma.labTestParameter.findFirst({
          where: { labTestId: labTest.id, code: p.code },
        });

        if (!existingParam) {
          await prisma.labTestParameter.create({
            data: {
              labTestId: labTest.id,
              code: p.code,
              name: p.name,
              unit: p.unit,
              refRange: p.ref,
            },
          });
        }
      }
    }

    // 4. Price List
    await prisma.priceListItem.upsert({
      where: {
        priceListId_serviceItemId: {
          priceListId: cashList.id,
          serviceItemId: srv.id,
        },
      },
      update: { price: t.price },
      create: {
        priceListId: cashList.id,
        serviceItemId: srv.id,
        price: t.price,
      },
    });
  }

  console.log('🧪 Lab Tests & Panels: Done.');

  // ====================================================
  // 4. الأشعة (Radiology)
  // ====================================================

  const radiology = [
    // X-Ray
    {
      code: 'CXR',
      name: 'Chest X-Ray PA View',
      mod: 'X-Ray',
      body: 'Chest',
      price: 50,
    },
    {
      code: 'AXR',
      name: 'Abdominal X-Ray Erect/Supine',
      mod: 'X-Ray',
      body: 'Abdomen',
      price: 50,
    },
    {
      code: 'KNEE-XR',
      name: 'Knee X-Ray AP/LAT',
      mod: 'X-Ray',
      body: 'Knee',
      price: 60,
    },
    {
      code: 'LSPINE-XR',
      name: 'Lumbar Spine X-Ray',
      mod: 'X-Ray',
      body: 'Spine',
      price: 70,
    },

    // Ultrasound
    {
      code: 'US-ABD',
      name: 'Ultrasound Abdomen',
      mod: 'Ultrasound',
      body: 'Abdomen',
      price: 80,
    },
    {
      code: 'US-PELVIS',
      name: 'Ultrasound Pelvis',
      mod: 'Ultrasound',
      body: 'Pelvis',
      price: 80,
    },
    {
      code: 'US-OBS',
      name: 'Obstetric Ultrasound',
      mod: 'Ultrasound',
      body: 'OB/GYN',
      price: 100,
    },
    {
      code: 'US-THY',
      name: 'Thyroid Ultrasound',
      mod: 'Ultrasound',
      body: 'Neck',
      price: 90,
    },

    // CT Scan
    {
      code: 'CT-BRAIN',
      name: 'CT Brain (Plain)',
      mod: 'CT',
      body: 'Head',
      price: 250,
    },
    {
      code: 'CT-CHEST',
      name: 'CT Chest',
      mod: 'CT',
      body: 'Chest',
      price: 300,
    },
    {
      code: 'CT-ABD',
      name: 'CT Abdomen with Contrast',
      mod: 'CT',
      body: 'Abdomen',
      price: 400,
    },

    // MRI
    {
      code: 'MRI-BRAIN',
      name: 'MRI Brain',
      mod: 'MRI',
      body: 'Head',
      price: 500,
    },
    {
      code: 'MRI-LS',
      name: 'MRI Lumbar Spine',
      mod: 'MRI',
      body: 'Spine',
      price: 550,
    },
    {
      code: 'MRI-KNEE',
      name: 'MRI Knee',
      mod: 'MRI',
      body: 'Knee',
      price: 550,
    },
  ];

  for (const r of radiology) {
    const srv = await prisma.serviceItem.upsert({
      where: { code: `RAD-${r.code}` },
      update: { defaultPrice: r.price },
      create: {
        hospitalId: hospital.id,
        code: `RAD-${r.code}`,
        name: r.name,
        type: ServiceType.RADIOLOGY,
        defaultPrice: r.price,
      },
    });

    await prisma.radiologyStudy.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: r.code } },
      update: {},
      create: {
        hospitalId: hospital.id,
        code: r.code,
        name: r.name,
        modality: r.mod,
        bodyPart: r.body,
        serviceItemId: srv.id,
      },
    });

    await prisma.priceListItem.upsert({
      where: {
        priceListId_serviceItemId: {
          priceListId: cashList.id,
          serviceItemId: srv.id,
        },
      },
      update: { price: r.price },
      create: {
        priceListId: cashList.id,
        serviceItemId: srv.id,
        price: r.price,
      },
    });
  }

  console.log('☢️ Radiology Studies: Done.');

  // ====================================================
  // 5. الحسابات المالية (Accounting)
  // ====================================================

  const accounts = [
    { code: '100100', name: 'الصندوق الرئيسي', type: AccountType.ASSET },
    { code: '101100', name: 'البنك الرئيسي', type: AccountType.ASSET },
    { code: '120100', name: 'ذمم المرضى', type: AccountType.ASSET },
    { code: '120200', name: 'ذمم شركات التأمين', type: AccountType.ASSET },
    { code: '130100', name: 'مخزون الأدوية', type: AccountType.ASSET },
    { code: '130200', name: 'مخزون المستلزمات', type: AccountType.ASSET },

    // الالتزامات
    { code: '200100', name: 'دائنون (موردين)', type: AccountType.LIABILITY },
    { code: '200300', name: 'رواتب مستحقة', type: AccountType.LIABILITY },
    {
      code: '200900',
      name: 'وسيط مشتريات (GRN Suspense)',
      type: AccountType.LIABILITY,
    }, // ✅ الوسيط الجديد

    // الإيرادات
    {
      code: '400100',
      name: 'إيرادات العيادات الخارجية',
      type: AccountType.REVENUE,
    },
    { code: '400200', name: 'إيرادات الإيواء', type: AccountType.REVENUE },
    { code: '400300', name: 'إيرادات المختبر', type: AccountType.REVENUE },
    { code: '400400', name: 'إيرادات الأشعة', type: AccountType.REVENUE },
    { code: '400500', name: 'إيرادات الصيدلية', type: AccountType.REVENUE },

    // المصروفات
    { code: '500100', name: 'مصروف الرواتب', type: AccountType.EXPENSE },
    {
      code: '500200',
      name: 'تكلفة البضاعة المباعة (أدوية)',
      type: AccountType.EXPENSE,
    },
    {
      code: '500300',
      name: 'تكلفة البضاعة المباعة (مستلزمات)',
      type: AccountType.EXPENSE,
    },
    { code: '500400', name: 'تكلفة محاليل المختبر', type: AccountType.EXPENSE },
    {
      code: '500500',
      name: 'تكلفة أفلام ومواد الأشعة',
      type: AccountType.EXPENSE,
    },
  ];

  for (const acc of accounts) {
    await prisma.account.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: acc.code } },
      update: {},
      create: { ...acc, hospitalId: hospital.id },
    });
  }

  // ربط الحسابات النظامية
  const systemMappings = [
    { k: SystemAccountKey.CASH_MAIN, c: '100100' },
    { k: SystemAccountKey.BANK_MAIN, c: '101100' },
    { k: SystemAccountKey.RECEIVABLE_PATIENTS, c: '120100' },
    { k: SystemAccountKey.RECEIVABLE_INSURANCE, c: '120200' },
    { k: SystemAccountKey.INVENTORY_DRUGS, c: '130100' },
    { k: SystemAccountKey.INVENTORY_SUPPLIES, c: '130200' },
    { k: SystemAccountKey.GRN_SUSPENSE, c: '200900' }, // ✅
    { k: SystemAccountKey.PAYABLE_SUPPLIERS, c: '200100' },

    // ربط إيرادات
    { k: SystemAccountKey.REVENUE_OUTPATIENT, c: '400100' },
    { k: SystemAccountKey.REVENUE_INPATIENT, c: '400200' },
    { k: SystemAccountKey.REVENUE_LAB, c: '400300' },
    { k: SystemAccountKey.REVENUE_RADIOLOGY, c: '400400' },
    { k: SystemAccountKey.REVENUE_PHARMACY, c: '400500' },

    // ربط تكلفة
    { k: SystemAccountKey.COGS_DRUGS, c: '500200' },
    { k: SystemAccountKey.SALARIES_EXPENSE, c: '500100' },
    { k: SystemAccountKey.SALARIES_PAYABLE, c: '200300' },
  ];

  for (const m of systemMappings) {
    const acc = await prisma.account.findFirst({
      where: { hospitalId: hospital.id, code: m.c },
    });
    if (acc) {
      await prisma.systemAccountMapping.upsert({
        where: { hospitalId_key: { hospitalId: hospital.id, key: m.k } },
        update: { accountId: acc.id },
        create: { hospitalId: hospital.id, key: m.k, accountId: acc.id },
      });
    }
  }

  console.log('💰 Accounting & Mapping: Done.');

  // ====================================================
  // 6. خدمات إضافية (كشوفات وإقامة)
  // ====================================================
  const otherServices = [
    // ✅ [FIX] إضافة خدمة الكشف الأساسية
    {
      code: 'CONSULT-OPD',
      name: 'كشف عيادة خارجية (عام)',
      price: 50,
      type: ServiceType.CONSULTATION,
    },

    {
      code: 'CONSULT-GEN',
      name: 'كشف ممارس عام',
      price: 30,
      type: ServiceType.CONSULTATION,
    },
    {
      code: 'CONSULT-SPEC',
      name: 'كشف أخصائي',
      price: 50,
      type: ServiceType.CONSULTATION,
    },
    {
      code: 'CONSULT-CONS',
      name: 'كشف استشاري',
      price: 80,
      type: ServiceType.CONSULTATION,
    },
    {
      code: 'ER-VISIT',
      name: 'كشف طوارئ',
      price: 40,
      type: ServiceType.CONSULTATION,
    },
    {
      code: 'BED-GEN',
      name: 'إقامة - غرفة عامة',
      price: 100,
      type: ServiceType.BED,
    },
    {
      code: 'BED-ICU',
      name: 'إقامة - عناية مركزة',
      price: 300,
      type: ServiceType.BED,
    },
  ];

  for (const s of otherServices) {
    await prisma.serviceItem.upsert({
      where: { code: s.code },
      update: {},
      create: {
        hospitalId: hospital.id,
        code: s.code,
        name: s.name,
        type: s.type,
        defaultPrice: s.price,
      },
    });
  }

  // 9. شركات التأمين
  const provider = await prisma.insuranceProvider.upsert({
    where: { code: 'INS-LIBYA' },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'INS-LIBYA',
      name: 'Libya Insurance Co.',
    },
  });

  await prisma.insurancePolicy.create({
    data: {
      insuranceProviderId: provider.id,
      name: 'Gold Policy',
      priceListId: insuranceList.id,
      patientCopayRate: 0.1, // 10%
    },
  });

  // 10. العنابر وغرف العمليات
  const wardExists = await prisma.ward.findFirst({
    where: { hospitalId: hospital.id, name: 'General Ward' },
  });
  let wardId = wardExists?.id;

  if (!wardExists) {
    const ward = await prisma.ward.create({
      data: {
        hospitalId: hospital.id,
        name: 'General Ward',
        type: 'General',
        gender: 'Mixed',
      },
    });
    wardId = ward.id;

    const room = await prisma.room.create({
      data: {
        hospitalId: hospital.id,
        wardId: ward.id,
        roomNumber: '101',
      },
    });

    await prisma.bed.createMany({
      data: [
        {
          hospitalId: hospital.id,
          wardId: ward.id,
          roomId: room.id,
          bedNumber: 'A',
          status: 'AVAILABLE',
        },
        {
          hospitalId: hospital.id,
          wardId: ward.id,
          roomId: room.id,
          bedNumber: 'B',
          status: 'AVAILABLE',
        },
      ],
    });
  }

  const otExists = await prisma.operatingTheatre.findFirst({
    where: { hospitalId: hospital.id },
  });
  if (!otExists) {
    await prisma.operatingTheatre.create({
      data: {
        hospitalId: hospital.id,
        name: 'OT Room 1 (General)',
      },
    });
  }

  // 11. الورديات
  const shiftExists = await prisma.workShift.findFirst({
    where: { hospitalId: hospital.id },
  });
  if (!shiftExists) {
    await prisma.workShift.create({
      data: {
        hospitalId: hospital.id,
        name: 'Morning Shift',
        type: ShiftType.MORNING,
        startTime: '08:00',
        endTime: '16:00',
      },
    });
  }

  console.log('✅ ALL SEEDS COMPLETED SUCCESSFULLY! System is ready.');

  // ====================================================
  // 12. CDSS Rules (قواعد دعم القرار) ✅ [NEW]
  // ====================================================

  // 1. Vital Signs Critical Values
  const vitalRules = [
    {
      vitalType: 'BP_SYS',
      vitalName: 'Systolic Blood Pressure',
      unit: 'mmHg',
      criticalHigh: 180,
      criticalLow: 90,
      action: 'Notify Physician immediately',
    },
    {
      vitalType: 'BP_DIA',
      vitalName: 'Diastolic Blood Pressure',
      unit: 'mmHg',
      criticalHigh: 120,
      criticalLow: 60,
      action: 'Notify Physician immediately',
    },
    {
      vitalType: 'TEMP',
      vitalName: 'Temperature',
      unit: 'C',
      criticalHigh: 39.5,
      criticalLow: 35,
      action: 'Check for infection/hypothermia',
    },
    {
      vitalType: 'SPO2',
      vitalName: 'Oxygen Saturation',
      unit: '%',
      criticalHigh: undefined,
      criticalLow: 90,
      action: 'Administer Oxygen if needed',
    },
    {
      vitalType: 'HR', // Pulse
      vitalName: 'Heart Rate',
      unit: 'bpm',
      criticalHigh: 120,
      criticalLow: 50,
      action: 'ECG required',
    },
  ];

  for (const r of vitalRules) {
    await prisma.vitalCriticalValue.upsert({
      where: {
        vitalType_ageGroup: {
          vitalType: r.vitalType,
          ageGroup: 'ADULT', // Default to ADULT for now
        },
      },
      update: {},
      create: {
        vitalType: r.vitalType,
        vitalName: r.vitalName,
        unit: r.unit,
        criticalHigh: r.criticalHigh ? Number(r.criticalHigh) : undefined,
        criticalLow: r.criticalLow ? Number(r.criticalLow) : undefined,
        action: r.action,
        isActive: true,
        ageGroup: 'ADULT',
      },
    });
  }

  // 2. Lab Critical Values
  const labRules = [
    {
      code: 'FBS',
      name: 'Fasting Blood Sugar',
      unit: 'mg/dL',
      panicHigh: 400,
      panicLow: 40,
      criticalHigh: 200,
      criticalLow: 60,
    },
    {
      code: 'HGB',
      name: 'Hemoglobin',
      unit: 'g/dL',
      panicHigh: 20,
      panicLow: 6,
      criticalHigh: 18,
      criticalLow: 8,
    },
    {
      code: 'PLT',
      name: 'Platelets',
      unit: '10^3/uL',
      panicHigh: 1000,
      panicLow: 20,
      criticalHigh: 600,
      criticalLow: 100,
    },
  ];

  for (const r of labRules) {
    await prisma.labCriticalValue.upsert({
      where: {
        labTestCode_ageGroup_gender: {
          labTestCode: r.code,
          ageGroup: 'ADULT', // Default
          gender: 'MALE', // Default (schema requires unique, implying we might need separate rules per gender or use a specific enum value if allowed to be null, but compound unique usually dislikes nulls in some DBs. Let's use specific values)
        },
      },
      update: {},
      create: {
        labTestCode: r.code,
        labTestName: r.name,
        unit: r.unit,
        panicHigh: r.panicHigh,
        panicLow: r.panicLow,
        criticalHigh: r.criticalHigh,
        criticalLow: r.criticalLow,
        action: 'Immediate Notification',
        isActive: true,
        ageGroup: 'ADULT',
        gender: 'MALE',
      },
    });
  }

  // 3. Drug Interactions & CDSS ✅ [MODULAR]
  await seedCDSS();

  // 4. Clinical Data (ICD-10 & Products) ✅ [MODULAR]
  await seedMedicalData();

  console.log('✅ ALL SEEDS COMPLETED SUCCESSFULLY! System is ready.');

  // 12. إعدادات النظام الافتراضية (System Settings)
  const defaultSettings = [
    {
      key: 'billing.debtLimit',
      value: '0.01',
      type: 'NUMBER',
      group: 'BILLING',
      description: 'الحد الأدنى للمديونية المسموح بها',
    },
    {
      key: 'billing.currency',
      value: 'LYD',
      type: 'STRING',
      group: 'BILLING',
      description: 'العملة الافتراضية للنظام',
    },
    {
      key: 'accounting.allowNegativeStock',
      value: 'false',
      type: 'BOOLEAN',
      group: 'INVENTORY',
      description: 'السماح بالسحب بالسالب من المخزون',
    },
    {
      key: 'medical.defaultLanguage',
      value: 'ar',
      type: 'STRING',
      group: 'MEDICAL',
      description: 'اللغة الافتراضية للتقارير الطبية',
    },
  ];

  for (const s of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { hospitalId_key: { hospitalId: hospital.id, key: s.key } },
      update: {},
      create: {
        hospitalId: hospital.id,
        key: s.key,
        value: s.value,
        type: s.type as any,
        group: s.group,
        description: s.description,
      },
    });
  }
  console.log('⚙️ System Settings: Done.');

  console.log('✅ ALL SEEDS COMPLETED SUCCESSFULLY! System is ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
