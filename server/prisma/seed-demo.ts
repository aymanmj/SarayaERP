import {
  AccountType,
  AccountingSourceModule,
  AdmissionPriority,
  AdmissionStatus,
  AdmissionType,
  AppointmentStatus,
  AppointmentType,
  BedStatus,
  ChargeSource,
  ClaimStatus,
  EncounterStatus,
  EncounterType,
  FinancialYearStatus,
  Gender,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  InvoiceStatus,
  LabResultStatus,
  MedicationFrequency,
  MedicationRoute,
  NoteType,
  OrderStatus,
  OrderType,
  OrgType,
  PaymentMethod,
  PharmacistVerificationStatus,
  PrescriptionStatus,
  PrismaClient,
  ProductType,
  RadiologyStatus,
  StockTransactionType,
  SurgeryStatus,
  SystemAccountKey,
  TriageLevel,
  AdministrationStatus,
} from '@prisma/client';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { appendChainedAudit } from '../src/audit/audit-chain';

const prisma = new PrismaClient();

const DEMO_SEED_KEY = 'demo.seed.version';
const DEMO_SEED_VERSION = '2026-11-26-v1';

const encKey =
  process.env.ENCRYPTION_KEY || 'your-secret-key-32-chars-long-!!!';
const encSalt = process.env.ENCRYPTION_SALT || 'saraya-default-salt-123';
const derivedKey = scryptSync(encKey, encSalt, 32);

function encryptPii(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function hashNormalized(value: string): string {
  return sha256(value.trim().toLowerCase());
}

async function main() {
  const hospital = await prisma.hospital.findUnique({
    where: { code: 'MAIN' },
  });
  if (!hospital) {
    throw new Error('Base hospital MAIN not found. Run prisma/seed.ts first.');
  }

  const existingMarker = await prisma.systemSetting.findUnique({
    where: {
      hospitalId_key: { hospitalId: hospital.id, key: DEMO_SEED_KEY },
    },
  });
  if (existingMarker?.value === DEMO_SEED_VERSION) {
    console.log('✅ Demo dataset already seeded (skipping duplicate seed).');
    return;
  }

  console.log('🏥 Seeding Libyan Hospital Executive Demo Dataset...');

  // 1. Ensure SUPER_ADMIN + QUALITY_OFFICER + RCM_MANAGER roles & Multi-Branch Organization
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      description: 'Enterprise Multi-Branch Platform Super Administrator',
      isSystem: true,
    },
  });

  const allPerms = await prisma.permission.findMany({ select: { id: true } });
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id },
      },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: perm.id },
    });
  }

  const org = await prisma.organization.upsert({
    where: { code: 'SARAYA-GRP' },
    update: { name: 'مجموعة السرايا الطبية — ليبيا' },
    create: {
      code: 'SARAYA-GRP',
      name: 'مجموعة السرايا الطبية — ليبيا',
      type: OrgType.NETWORK,
      currency: 'LYD',
      timezone: 'Africa/Tripoli',
      country: 'LY',
      locale: 'ar',
    },
  });

  await prisma.hospital.update({
    where: { id: hospital.id },
    data: {
      organizationId: org.id,
      city: 'طرابلس',
      phone: '+218 21 360 1100',
      email: 'info@saraya-tripoli.ly',
      addressLine1Ar: 'حي الأندلس — طرابلس، ليبيا',
      addressLine1En: 'Hay Al-Andalus, Tripoli, Libya',
    },
  });

  const benghaziBranch = await prisma.hospital.upsert({
    where: { code: 'BEN-01' },
    update: {
      organizationId: org.id,
      name: 'مستشفى السرايا التخصصي — بنغازي',
      nameAr: 'مستشفى السرايا التخصصي — بنغازي',
      nameEn: 'Saraya Specialty Hospital - Benghazi',
      displayName: 'Saraya Specialty Hospital - Benghazi',
      displayNameAr: 'مستشفى السرايا التخصصي — بنغازي',
      displayNameEn: 'Saraya Specialty Hospital - Benghazi',
      city: 'بنغازي',
      isActive: true,
    },
    create: {
      organizationId: org.id,
      code: 'BEN-01',
      name: 'مستشفى السرايا التخصصي — بنغازي',
      nameAr: 'مستشفى السرايا التخصصي — بنغازي',
      nameEn: 'Saraya Specialty Hospital - Benghazi',
      displayName: 'Saraya Specialty Hospital - Benghazi',
      displayNameAr: 'مستشفى السرايا التخصصي — بنغازي',
      displayNameEn: 'Saraya Specialty Hospital - Benghazi',
      city: 'بنغازي',
      phone: '+218 61 909 2200',
      email: 'benghazi@saraya.ly',
      isActive: true,
    },
  });

  // Lookup seeded staff users
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const drAhmed = await prisma.user.findUniqueOrThrow({ where: { username: 'dr_ahmed' } });
  const drSara = await prisma.user.findUniqueOrThrow({ where: { username: 'dr_sara' } });
  const nurseLaila = await prisma.user.findUniqueOrThrow({ where: { username: 'nurse_laila' } });
  const receptionUser = await prisma.user.findUniqueOrThrow({ where: { username: 'reception_user' } });
  const pharmAli = await prisma.user.findUniqueOrThrow({ where: { username: 'pharm_ali' } });
  const cashierMo = await prisma.user.findUniqueOrThrow({ where: { username: 'cashier_mo' } });
  const accSamir = await prisma.user.findUniqueOrThrow({ where: { username: 'acc_samir' } });
  const hrMuna = await prisma.user.findUniqueOrThrow({ where: { username: 'hr_muna' } });
  const labUser = await prisma.user.findUniqueOrThrow({ where: { username: 'lab_user' } });
  const radUser = await prisma.user.findUniqueOrThrow({ where: { username: 'rad_user' } });
  const storeKeeper = await prisma.user.findUniqueOrThrow({ where: { username: 'store_keeper' } });

  // Add Quality Officer + RCM Manager demo accounts
  const pass123456 = await bcrypt.hash('123456', 10);
  const ensureRoleUser = async (
    username: string,
    fullName: string,
    roleName: string,
    bioId: string,
  ) => {
    const u = await prisma.user.upsert({
      where: { username },
      update: { biometricId: bioId },
      create: {
        hospitalId: hospital.id,
        username,
        fullName,
        passwordHash: pass123456,
        email: `${username}@saraya.ly`,
        isActive: true,
        biometricId: bioId,
        basicSalary: '2800.000',
      },
    });
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: u.id, roleId: role.id } },
        update: {},
        create: { userId: u.id, roleId: role.id },
      });
    }
    return u;
  };

  const qualityUser = await ensureRoleUser('quality_omar', 'أ. عمر (الجودة والسلامة)', 'QUALITY_OFFICER', 'BIO-1013');
  const rcmUser = await ensureRoleUser('rcm_tariq', 'أ. طارق (المطالبات والتأمين)', 'RCM_MANAGER', 'BIO-1014');

  // Grant admin SUPER_ADMIN + branch access for Benghazi demo
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdminRole.id },
  });

  await prisma.userHospitalAccess.upsert({
    where: { userId_hospitalId: { userId: admin.id, hospitalId: hospital.id } },
    update: { isDefault: true },
    create: { userId: admin.id, hospitalId: hospital.id, isDefault: true },
  });
  await prisma.userHospitalAccess.upsert({
    where: { userId_hospitalId: { userId: admin.id, hospitalId: benghaziBranch.id } },
    update: {},
    create: { userId: admin.id, hospitalId: benghaziBranch.id, isDefault: false },
  });

  // Assign biometric IDs to key staff
  const bioAssignments: Array<[number, string]> = [
    [admin.id, 'BIO-1001'],
    [drAhmed.id, 'BIO-1002'],
    [drSara.id, 'BIO-1003'],
    [nurseLaila.id, 'BIO-1004'],
    [receptionUser.id, 'BIO-1005'],
    [pharmAli.id, 'BIO-1006'],
    [cashierMo.id, 'BIO-1007'],
    [accSamir.id, 'BIO-1008'],
    [hrMuna.id, 'BIO-1009'],
    [labUser.id, 'BIO-1010'],
    [radUser.id, 'BIO-1011'],
    [storeKeeper.id, 'BIO-1012'],
  ];
  for (const [uid, bid] of bioAssignments) {
    await prisma.user.update({
      where: { id: uid },
      data: { biometricId: bid },
    });
  }

  // Ensure Benghazi branch has basic department + financial year + bed so switching branch shows clean data
  const benYear = await prisma.financialYear.upsert({
    where: { hospitalId_code: { hospitalId: benghaziBranch.id, code: 'FY-2026' } },
    update: {},
    create: {
      hospitalId: benghaziBranch.id,
      name: 'السنة المالية 2026 — بنغازي',
      code: 'FY-2026',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      status: FinancialYearStatus.OPEN,
      isCurrent: true,
      createdById: admin.id,
    },
  });
  void benYear;

  // 2. Active Financial Year (2026), Periods, Extra GL Accounts, Currencies, Exchange Rates, Bank & Cost Centers
  const mainYear = await prisma.financialYear.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'FY-2026' } },
    update: { status: FinancialYearStatus.OPEN, isCurrent: true },
    create: {
      hospitalId: hospital.id,
      name: 'السنة المالية 2026',
      code: 'FY-2026',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      status: FinancialYearStatus.OPEN,
      isCurrent: true,
      createdById: admin.id,
    },
  });

  const periodDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let novPeriodId: number | null = null;
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const code = `2026-${mm}`;
    const start = new Date(Date.UTC(2026, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(2026, m - 1, periodDays[m - 1], 23, 59, 59));
    const p = await prisma.financialPeriod.upsert({
      where: {
        financialYearId_periodIndex: { financialYearId: mainYear.id, periodIndex: m },
      },
      update: { isOpen: true },
      create: {
        financialYearId: mainYear.id,
        periodIndex: m,
        periodCode: code,
        monthStartDate: start,
        monthEndDate: end,
        numberOfDays: periodDays[m - 1],
        isOpen: true,
        createdById: admin.id,
      },
    });
    if (m === 11) novPeriodId = p.id;
  }

  // Ensure complete Chart of Accounts & SystemAccountMappings
  const extraAccounts = [
    { code: '140100', name: 'ضريبة مدخلات قابلة للاسترداد', type: AccountType.ASSET },
    { code: '200500', name: 'أمانات ودفعات المرضى المقدمة', type: AccountType.LIABILITY },
    { code: '200600', name: 'حوالات تأمين غير موزعة', type: AccountType.LIABILITY },
    { code: '200700', name: 'مستحقات رسوم المقاصة الوطنية', type: AccountType.LIABILITY },
    { code: '300100', name: 'رأس المال المدفوع', type: AccountType.EQUITY },
    { code: '300200', name: 'الأرباح المبقاة والمرحّلة', type: AccountType.EQUITY },
    { code: '300300', name: 'صافي أرباح السنة الجارية', type: AccountType.EQUITY },
    { code: '400600', name: 'إيرادات العمليات الجراحية', type: AccountType.REVENUE },
    { code: '400700', name: 'إيرادات العناية المركزة ICU', type: AccountType.REVENUE },
    { code: '400800', name: 'خصومات وشطب تعاقدي للتأمين', type: AccountType.CONTRA_REVENUE },
    { code: '400900', name: 'مردودات ومسموحات المبيعات', type: AccountType.CONTRA_REVENUE },
    { code: '510900', name: 'ديون معدومة ومطالبات غير محصلة', type: AccountType.EXPENSE },
    { code: '511000', name: 'مصروف رسوم وعمولات المقاصة الوطنية', type: AccountType.EXPENSE },
  ];

  for (const acc of extraAccounts) {
    await prisma.account.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: acc.code } },
      update: {},
      create: { hospitalId: hospital.id, code: acc.code, name: acc.name, type: acc.type },
    });
  }

  const accByCode = async (code: string) =>
    prisma.account.findUniqueOrThrow({
      where: { hospitalId_code: { hospitalId: hospital.id, code } },
    });

  const extraMappings: Array<[SystemAccountKey, string]> = [
    [SystemAccountKey.REVENUE_SURGERY, '400600'],
    [SystemAccountKey.REVENUE_ICU, '400700'],
    [SystemAccountKey.DISCOUNT_ALLOWED, '400800'],
    [SystemAccountKey.SALES_RETURNS, '400900'],
    [SystemAccountKey.RETAINED_EARNINGS, '300200'],
    [SystemAccountKey.INSURANCE_UNALLOCATED_RECEIPTS, '200600'],
    [SystemAccountKey.GATEWAY_CLEARING_FEE_PAYABLE, '200700'],
    [SystemAccountKey.GATEWAY_CLEARING_FEE_EXPENSE, '511000'],
    [SystemAccountKey.INSURANCE_BAD_DEBT_EXPENSE, '510900'],
  ];
  for (const [key, code] of extraMappings) {
    const account = await accByCode(code);
    await prisma.systemAccountMapping.upsert({
      where: { hospitalId_key: { hospitalId: hospital.id, key } },
      update: { accountId: account.id },
      create: { hospitalId: hospital.id, key, accountId: account.id },
    });
  }

  // Cost Centers
  const ccOpd = await prisma.costCenter.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'CC-OPD' } },
    update: {},
    create: { hospitalId: hospital.id, code: 'CC-OPD', name: 'مركز تكلفة العيادات الخارجية', type: 'DEPARTMENT' },
  });
  const ccLab = await prisma.costCenter.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'CC-LAB' } },
    update: {},
    create: { hospitalId: hospital.id, code: 'CC-LAB', name: 'مركز تكلفة المختبر وبنك الدم', type: 'SERVICE' },
  });
  const ccSurg = await prisma.costCenter.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'CC-OT' } },
    update: {},
    create: { hospitalId: hospital.id, code: 'CC-OT', name: 'مركز تكلفة العمليات الجراحية', type: 'DEPARTMENT' },
  });
  void ccSurg;

  // Currencies & Exchange Rates (CAP09)
  const lyd = await prisma.currency.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'LYD' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'LYD',
      nameAr: 'دينار ليبي',
      nameEn: 'Libyan Dinar',
      symbol: 'د.ل',
      decimalPlaces: 3,
      isBase: true,
      isActive: true,
      createdById: accSamir.id,
    },
  });
  const usd = await prisma.currency.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'USD' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'USD',
      nameAr: 'دولار أمريكي',
      nameEn: 'US Dollar',
      symbol: '$',
      decimalPlaces: 3,
      isBase: false,
      isActive: true,
      createdById: accSamir.id,
    },
  });
  const eur = await prisma.currency.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'EUR' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'EUR',
      nameAr: 'يورو',
      nameEn: 'Euro',
      symbol: '€',
      decimalPlaces: 3,
      isBase: false,
      isActive: true,
      createdById: accSamir.id,
    },
  });

  const fxEffective = new Date('2026-11-01T00:00:00.000Z');
  await prisma.exchangeRate.upsert({
    where: {
      hospitalId_fromCurrencyId_toCurrencyId_effectiveDate_source: {
        hospitalId: hospital.id,
        fromCurrencyId: usd.id,
        toCurrencyId: lyd.id,
        effectiveDate: fxEffective,
        source: 'CBL_OFFICIAL',
      },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      fromCurrencyId: usd.id,
      toCurrencyId: lyd.id,
      rate: '4.850000',
      inverseRate: '0.206186',
      effectiveDate: fxEffective,
      source: 'CBL_OFFICIAL',
      referenceNote: 'نشرة مصرف ليبيا المركزي الاسترشادية',
      isVerified: true,
      createdById: accSamir.id,
      verifiedById: admin.id,
      verifiedAt: new Date(),
    },
  });
  await prisma.exchangeRate.upsert({
    where: {
      hospitalId_fromCurrencyId_toCurrencyId_effectiveDate_source: {
        hospitalId: hospital.id,
        fromCurrencyId: eur.id,
        toCurrencyId: lyd.id,
        effectiveDate: fxEffective,
        source: 'CBL_OFFICIAL',
      },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      fromCurrencyId: eur.id,
      toCurrencyId: lyd.id,
      rate: '5.240000',
      inverseRate: '0.190840',
      effectiveDate: fxEffective,
      source: 'CBL_OFFICIAL',
      referenceNote: 'نشرة مصرف ليبيا المركزي الاسترشادية',
      isVerified: true,
      createdById: accSamir.id,
      verifiedById: admin.id,
      verifiedAt: new Date(),
    },
  });

  const bankMainAcc = await accByCode('101100');
  await prisma.bankAccount.upsert({
    where: {
      hospitalId_accountNumber: {
        hospitalId: hospital.id,
        accountNumber: 'LY01-0021-889911-001',
      },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      accountId: bankMainAcc.id,
      currencyId: lyd.id,
      bankName: 'مصرف الجمهورية',
      branchName: 'فرع ذات العماد — طرابلس',
      accountNumber: 'LY01-0021-889911-001',
      iban: 'LY01002100000008899110001',
      swiftCode: 'JUMB LYLT',
      createdById: accSamir.id,
    },
  });

  // 3. Wards & Beds (ICU + VIP + General Ward)
  const departments = await prisma.department.findMany({
    where: { hospitalId: hospital.id },
  });
  const opdDept = departments.find((d) => d.nameEn === 'Outpatient Clinic') ?? departments[0];
  const erDept = departments.find((d) => d.nameEn === 'Emergency Department') ?? departments[0];
  const icuDept = departments.find((d) => d.nameEn === 'Intensive Care Unit') ?? departments[0];

  const genBed = await prisma.bed.findFirst({
    where: { hospitalId: hospital.id, bedNumber: 'A' },
    include: { room: true, ward: true },
  });

  const icuWard = await prisma.ward.create({
    data: {
      hospitalId: hospital.id,
      name: 'العناية المركزة (ICU)',
      type: 'ICU',
      gender: 'Mixed',
      departmentId: icuDept.id,
    },
  });
  const icuRoom = await prisma.room.create({
    data: { hospitalId: hospital.id, wardId: icuWard.id, roomNumber: 'ICU-01' },
  });
  const icuBed1 = await prisma.bed.create({
    data: {
      hospitalId: hospital.id,
      wardId: icuWard.id,
      roomId: icuRoom.id,
      bedNumber: 'ICU-1',
      status: BedStatus.OCCUPIED,
    },
  });
  await prisma.bed.create({
    data: {
      hospitalId: hospital.id,
      wardId: icuWard.id,
      roomId: icuRoom.id,
      bedNumber: 'ICU-2',
      status: BedStatus.AVAILABLE,
    },
  });

  const vipWard = await prisma.ward.create({
    data: {
      hospitalId: hospital.id,
      name: 'جناح كبار الشخصيات (VIP)',
      type: 'VIP',
      gender: 'Mixed',
    },
  });
  const vipRoom = await prisma.room.create({
    data: { hospitalId: hospital.id, wardId: vipWard.id, roomNumber: '201' },
  });
  await prisma.bed.create({
    data: {
      hospitalId: hospital.id,
      wardId: vipWard.id,
      roomId: vipRoom.id,
      bedNumber: 'VIP-201A',
      status: BedStatus.AVAILABLE,
    },
  });

  // 4. Insurance Providers & Policies (Libyan Clearinghouse)
  const libyaIns = await prisma.insuranceProvider.findUniqueOrThrow({
    where: { code: 'INS-LIBYA' },
  });
  await prisma.insuranceProvider.update({
    where: { id: libyaIns.id },
    data: {
      name: 'شركة ليبيا للتأمين الطبي',
      phone: '+218 21 444 1020',
      email: 'claims@libya-insurance.ly',
      address: 'طرابلس — شارع عمر المختار',
    },
  });
  const goldPolicy = await prisma.insurancePolicy.findFirstOrThrow({
    where: { insuranceProviderId: libyaIns.id },
  });

  const saharaIns = await prisma.insuranceProvider.upsert({
    where: { code: 'INS-SAHARA' },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'INS-SAHARA',
      name: 'شركة الصحارى للتأمين الصحي',
      phone: '+218 21 715 9900',
      email: 'medical@sahara-ins.ly',
      address: 'طرابلس — برج الفاتح',
    },
  });
  const saharaPolicy = await prisma.insurancePolicy.create({
    data: {
      insuranceProviderId: saharaIns.id,
      name: 'بوليصة الشركات الفضية (Sahara Silver)',
      policyNumber: 'SAH-2026-8800',
      patientCopayRate: '0.200000',
      maxCoverageAmount: '25000.000',
      isActive: true,
    },
  });

  // 5. Realistic Libyan Patients (Encrypted PII + National MPI + Allergies)
  const createDemoPatient = async (opts: {
    mrn: string;
    fullName: string;
    nationalId: string;
    phone: string;
    email: string;
    address: string;
    gender: Gender;
    dob: string;
    policyId?: number;
    memberId?: string;
    mpiLink?: boolean;
  }) => {
    let globalPatientId: number | undefined;
    if (opts.mpiLink !== false) {
      const gp = await prisma.globalPatient.upsert({
        where: { nationalIdHash: hashNormalized(opts.nationalId) },
        update: {},
        create: {
          fullName: opts.fullName,
          nationalId: encryptPii(opts.nationalId),
          nationalIdHash: hashNormalized(opts.nationalId),
          phoneHash: hashNormalized(opts.phone),
          emailHash: hashNormalized(opts.email),
          dateOfBirth: new Date(opts.dob),
          gender: opts.gender,
        },
      });
      globalPatientId = gp.id;
    }

    return prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        globalPatientId,
        mrn: opts.mrn,
        mrnHash: hashNormalized(opts.mrn),
        fullName: opts.fullName,
        nationalId: encryptPii(opts.nationalId),
        nationalIdHash: hashNormalized(opts.nationalId),
        phone: encryptPii(opts.phone),
        phoneHash: hashNormalized(opts.phone),
        email: encryptPii(opts.email),
        emailHash: hashNormalized(opts.email),
        address: encryptPii(opts.address),
        dateOfBirth: new Date(opts.dob),
        gender: opts.gender,
        insurancePolicyId: opts.policyId,
        insuranceMemberId: opts.memberId,
      },
    });
  };

  const p1 = await createDemoPatient({
    mrn: 'MRN-2026-1001',
    fullName: 'أحمد سالم المبروك الورفلي',
    nationalId: '119820456789',
    phone: '0912114455',
    email: 'ahmed.warfalli@example.ly',
    address: 'طرابلس — بن عاشور',
    gender: Gender.MALE,
    dob: '1982-04-12',
    policyId: goldPolicy.id,
    memberId: 'LIC-889120',
  });

  const p2 = await createDemoPatient({
    mrn: 'MRN-2026-1002',
    fullName: 'فاطمة علي السنوسي الزنتاني',
    nationalId: '219900778899',
    phone: '0923445566',
    email: 'fatima.zentani@example.ly',
    address: 'طرابلس — قرقارش',
    gender: Gender.FEMALE,
    dob: '1990-09-21',
    policyId: saharaPolicy.id,
    memberId: 'SAH-44102',
  });

  const p3 = await createDemoPatient({
    mrn: 'MRN-2026-1003',
    fullName: 'محمد رمضان الفيتوري',
    nationalId: '119750112233',
    phone: '0918887766',
    email: 'm.fitouri@example.ly',
    address: 'مصراتة — وسط المدينة',
    gender: Gender.MALE,
    dob: '1975-01-30',
  });

  const p4 = await createDemoPatient({
    mrn: 'MRN-2026-1004',
    fullName: 'خالد عبد السلام الغرياني',
    nationalId: '119640998877',
    phone: '0945551122',
    email: 'khaled.gharyani@example.ly',
    address: 'طرابلس — تاجوراء',
    gender: Gender.MALE,
    dob: '1964-11-05',
    policyId: goldPolicy.id,
    memberId: 'LIC-774501',
  });

  const p5 = await createDemoPatient({
    mrn: 'MRN-2026-1005',
    fullName: 'سعاد مفتاح البرعصي',
    nationalId: '219880334455',
    phone: '0927773344',
    email: 'suad.barasi@example.ly',
    address: 'طرابلس — السراج',
    gender: Gender.FEMALE,
    dob: '1988-06-18',
  });

  const p6 = await createDemoPatient({
    mrn: 'MRN-2026-1006',
    fullName: 'عائشة طارق الترهوني',
    nationalId: '220190556677',
    phone: '0913339988',
    email: 'aisha.tarhouni@example.ly',
    address: 'طرابلس — أبو سليم',
    gender: Gender.FEMALE,
    dob: '2019-03-10',
  });

  // Allergies & Active Clinical Profile on p1 (great for CDSS alerts)
  await prisma.patientAllergy.create({
    data: {
      patientId: p1.id,
      allergen: 'Penicillin / Amoxicillin',
      reaction: 'Anaphylactic rash & bronchospasm',
      severity: 'SEVERE',
    },
  });

  // 6. Active Encounters & Today Appointments
  const now = new Date();
  const todayAt = (hour: number, min = 0) => {
    const d = new Date(now);
    d.setHours(hour, min, 0, 0);
    return d;
  };

  // E1: Open OPD Consultation (CDSS + Doctor Workbench live demo)
  const encOpd = await prisma.encounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: p1.id,
      departmentId: opdDept.id,
      doctorId: drAhmed.id,
      type: EncounterType.OPD,
      status: EncounterStatus.OPEN,
      admissionDate: todayAt(9, 0),
      chiefComplaint: 'ألم صدري متقطع مع ارتفاع ضغط الدم وخفقان',
    },
  });

  // E2: Open ER Encounter with Triage
  const encEr = await prisma.encounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: p3.id,
      departmentId: erDept.id,
      doctorId: drAhmed.id,
      type: EncounterType.ER,
      status: EncounterStatus.OPEN,
      admissionDate: todayAt(10, 15),
      triageLevel: TriageLevel.URGENT,
      triageNote: 'ضيق تنفس حاد وحمى 39.2 مئوية',
      chiefComplaint: 'ضيق تنفس حاد وارتفاع درجة الحرارة',
    },
  });

  await prisma.triageAssessment.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encEr.id,
      level: TriageLevel.URGENT,
      chiefComplaint: 'ضيق تنفس حاد وارتفاع درجة الحرارة',
      temperature: '39.20',
      heartRate: 118,
      respRate: 26,
      bpSystolic: 145,
      bpDiastolic: 92,
      o2Sat: 91,
      painScore: 7,
      assessedById: nurseLaila.id,
    },
  });

  // E3: Open IPD Admitted to General Ward Bed A (Surgical Package + Nursing Station CLMA live demo)
  if (genBed) {
    await prisma.bed.update({
      where: { id: genBed.id },
      data: { status: BedStatus.OCCUPIED },
    });
  }
  const encIpd = await prisma.encounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: p2.id,
      departmentId: opdDept.id,
      doctorId: drSara.id,
      type: EncounterType.IPD,
      status: EncounterStatus.OPEN,
      admissionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      chiefComplaint: 'التهاب مرارة حاد — تحضير لاستئصال بالمنظار (Laparoscopic Cholecystectomy)',
    },
  });

  if (genBed) {
    await prisma.bedAssignment.create({
      data: {
        hospitalId: hospital.id,
        encounterId: encIpd.id,
        bedId: genBed.id,
        from: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.admission.create({
      data: {
        hospitalId: hospital.id,
        patientId: p2.id,
        encounterId: encIpd.id,
        admissionType: AdmissionType.ELECTIVE,
        admissionStatus: AdmissionStatus.ADMITTED,
        priority: AdmissionPriority.MEDIUM,
        admissionReason: 'استئصال المرارة بالمنظار مع باقة جراحية شاملة',
        wardId: genBed.wardId,
        roomId: genBed.roomId,
        bedId: genBed.id,
        departmentId: opdDept.id,
        admittingDoctorId: drSara.id,
        primaryPhysicianId: drSara.id,
        attendingNurseId: nurseLaila.id,
        actualAdmissionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        primaryDiagnosis: 'K80.0 - Acute cholecystitis with calculus of gallbladder',
        createdBy: admin.id,
      },
    });
  }

  // E4: Open ICU Patient
  const encIcu = await prisma.encounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: p4.id,
      departmentId: icuDept.id,
      doctorId: drAhmed.id,
      type: EncounterType.ICU,
      status: EncounterStatus.OPEN,
      admissionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      chiefComplaint: 'متابعة ما بعد قسطرة قلبية علاجية وتنظيم ضربات القلب',
    },
  });
  await prisma.bedAssignment.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encIcu.id,
      bedId: icuBed1.id,
      from: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.admission.create({
    data: {
      hospitalId: hospital.id,
      patientId: p4.id,
      encounterId: encIcu.id,
      admissionType: AdmissionType.EMERGENCY,
      admissionStatus: AdmissionStatus.ADMITTED,
      priority: AdmissionPriority.CRITICAL,
      admissionReason: 'متابعة مركزة ما بعد قسطرة قلبية علاجية',
      wardId: icuWard.id,
      roomId: icuRoom.id,
      bedId: icuBed1.id,
      departmentId: icuDept.id,
      admittingDoctorId: drAhmed.id,
      primaryPhysicianId: drAhmed.id,
      attendingNurseId: nurseLaila.id,
      actualAdmissionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      primaryDiagnosis: 'I21.4 - Non-ST elevation myocardial infarction',
      createdBy: admin.id,
    },
  });

  // E5: Closed Outpatient Encounter with full signed clinical records + completed invoice
  const encClosed = await prisma.encounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: p5.id,
      departmentId: opdDept.id,
      doctorId: drAhmed.id,
      type: EncounterType.OPD,
      status: EncounterStatus.CLOSED,
      admissionDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      dischargeDate: new Date(Date.now() - 22 * 60 * 60 * 1000),
      chiefComplaint: 'فحص دوري ومتابعة السكري والغدة الدرقية',
    },
  });

  // Today Appointments
  await prisma.appointment.createMany({
    data: [
      {
        hospitalId: hospital.id,
        patientId: p1.id,
        doctorId: drAhmed.id,
        departmentId: opdDept.id,
        encounterId: encOpd.id,
        status: AppointmentStatus.CHECKED_IN,
        type: AppointmentType.IN_PERSON,
        reason: 'متابعة ألم الصدر وضغط الدم',
        scheduledStart: todayAt(9, 30),
        scheduledEnd: todayAt(10, 0),
        queueNumber: 1,
      },
      {
        hospitalId: hospital.id,
        patientId: p6.id,
        doctorId: drAhmed.id,
        departmentId: opdDept.id,
        status: AppointmentStatus.CONFIRMED,
        type: AppointmentType.IN_PERSON,
        reason: 'كشف أطفال عام',
        scheduledStart: todayAt(11, 30),
        scheduledEnd: todayAt(12, 0),
        queueNumber: 2,
      },
      {
        hospitalId: hospital.id,
        patientId: p5.id,
        doctorId: drSara.id,
        departmentId: opdDept.id,
        status: AppointmentStatus.CONFIRMED,
        type: AppointmentType.ONLINE,
        meetingLink: 'https://telehealth.saraya.ly/room/demo-2026',
        reason: 'استشارة جراحية عن بُعد (Telehealth)',
        scheduledStart: todayAt(13, 0),
        scheduledEnd: todayAt(13, 30),
        queueNumber: 1,
      },
      {
        hospitalId: hospital.id,
        patientId: p3.id,
        doctorId: drAhmed.id,
        departmentId: erDept.id,
        encounterId: encEr.id,
        status: AppointmentStatus.CHECKED_IN,
        type: AppointmentType.IN_PERSON,
        isEmergency: true,
        reason: 'حالة طوارئ — ضيق تنفس',
        scheduledStart: todayAt(10, 15),
        scheduledEnd: todayAt(10, 45),
        queueNumber: 1,
      },
      {
        hospitalId: hospital.id,
        patientId: p5.id,
        doctorId: drAhmed.id,
        departmentId: opdDept.id,
        encounterId: encClosed.id,
        status: AppointmentStatus.COMPLETED,
        type: AppointmentType.IN_PERSON,
        reason: 'فحص الغدة الدرقية والسكري',
        scheduledStart: todayAt(8, 30),
        scheduledEnd: todayAt(9, 0),
        queueNumber: 0,
      },
    ],
  });

  // Vital signs & ICU Flowsheet
  await prisma.vitalSign.createMany({
    data: [
      {
        encounterId: encOpd.id,
        temperature: '37.10',
        bpSystolic: 152,
        bpDiastolic: 94,
        pulse: 86,
        respRate: 18,
        o2Sat: 98,
        weight: '82.50',
        height: '176.00',
        bmi: '26.63',
        createdById: nurseLaila.id,
      },
      {
        encounterId: encIpd.id,
        temperature: '37.80',
        bpSystolic: 124,
        bpDiastolic: 78,
        pulse: 82,
        respRate: 18,
        o2Sat: 98,
        createdById: nurseLaila.id,
      },
      {
        encounterId: encIcu.id,
        temperature: '36.90',
        bpSystolic: 118,
        bpDiastolic: 72,
        pulse: 74,
        respRate: 16,
        o2Sat: 99,
        createdById: nurseLaila.id,
      },
    ],
  });

  // Signed Clinical Note (CAP07)
  const noteSignedAt = new Date();
  const noteText =
    'المريض يتابع بانتظام، نتائج التروية والسكر التراكمي مستقرة، يستمر على العلاج التحفظي.';
  await prisma.clinicalNote.create({
    data: {
      encounterId: encClosed.id,
      type: NoteType.DOCTOR_ROUND,
      subjective: 'تحسن عام في الأعراض مع التزام بالعلاج.',
      objective: 'BP 122/78, HR 72, Temp 36.8 C, O2Sat 99%.',
      assessment: 'Stable type 2 DM & controlled hypothyroidism.',
      plan: 'استمرار العلاج وإعادة الفحص بعد 3 أشهر.',
      content: noteText,
      createdById: drAhmed.id,
      signedById: drAhmed.id,
      signedAt: noteSignedAt,
      signatureHash: sha256(
        `NOTE|${encClosed.id}|${drAhmed.id}|${noteSignedAt.toISOString()}|${noteText}`,
      ),
    },
  });

  // 7. Pharmacy: Products, Barcodes, Controlled Substance (CAP10), Consignment (CAP10), Prescriptions + 5-Rights CLMA
  const pharmWH = await prisma.warehouse.findFirstOrThrow({
    where: { hospitalId: hospital.id, code: 'WH-PHARM' },
  });
  const panadol = await prisma.product.findFirstOrThrow({
    where: { hospitalId: hospital.id, code: 'D001' },
  });
  await prisma.product.update({
    where: { id: panadol.id },
    data: { barcode: '6221000500011', route: MedicationRoute.ORAL },
  });
  const augmentin = await prisma.product.findFirstOrThrow({
    where: { hospitalId: hospital.id, code: 'D010' },
  });
  await prisma.product.update({
    where: { id: augmentin.id },
    data: { barcode: '6221000500028', route: MedicationRoute.ORAL },
  });

  // Controlled narcotic product (Schedule II)
  const morphine = await prisma.product.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'CTRL-MORPH10' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'CTRL-MORPH10',
      name: 'مورفين 10 ملغ أمبول (مخدّر مراقب)',
      nameAr: 'مورفين 10 ملغ أمبول',
      nameEn: 'Morphine Sulfate 10mg/mL Ampoule',
      genericName: 'Morphine Sulfate',
      strength: '10mg/mL',
      form: 'Injection',
      route: MedicationRoute.IV,
      type: ProductType.DRUG,
      costPrice: '8.5000',
      sellPrice: '18.0000',
      stockOnHand: '45.000',
      minStock: '10.000',
      isControlled: true,
      controlledSchedule: 'SCHEDULE_II',
      barcode: '6221000990012',
    },
  });

  await prisma.productStock.upsert({
    where: {
      warehouseId_productId_batchNumber: {
        warehouseId: pharmWH.id,
        productId: morphine.id,
        batchNumber: 'MORPH-2026-A1',
      },
    },
    update: { quantity: '45.000' },
    create: {
      hospitalId: hospital.id,
      warehouseId: pharmWH.id,
      productId: morphine.id,
      batchNumber: 'MORPH-2026-A1',
      expiryDate: new Date('2027-11-30'),
      quantity: '45.000',
      unitCost: '8.5000',
    },
  });

  const ctrlSeedHash1 = sha256(`CTRL|GENESIS|${hospital.id}|MORPH-2026-A1|50.000`);
  const ctrlSeedHash2 = sha256(`CTRL|${ctrlSeedHash1}|${encIpd.id}|-5.000|45.000`);
  await prisma.controlledSubstanceLog.create({
    data: {
      hospitalId: hospital.id,
      warehouseId: pharmWH.id,
      productId: morphine.id,
      batchNumber: 'MORPH-2026-A1',
      transactionType: 'RECEIPT',
      quantityBefore: '0.000',
      quantityChange: '50.000',
      quantityAfter: '50.000',
      wastedQuantity: '0.000',
      performedById: pharmAli.id,
      witnessedById: drSara.id,
      reason: 'استلام رصيد افتتاحي للعهدة المخدرة بإشراف صيدلي وطبيب',
      previousHash: 'GENESIS',
      entryHash: ctrlSeedHash1,
    },
  });
  await prisma.controlledSubstanceLog.create({
    data: {
      hospitalId: hospital.id,
      warehouseId: pharmWH.id,
      productId: morphine.id,
      batchNumber: 'MORPH-2026-A1',
      patientId: p2.id,
      encounterId: encIpd.id,
      transactionType: 'DISPENSE',
      quantityBefore: '50.000',
      quantityChange: '-5.000',
      quantityAfter: '45.000',
      wastedQuantity: '0.000',
      performedById: pharmAli.id,
      witnessedById: nurseLaila.id,
      reason: 'صرف مسكن ألم ما بعد التداخل الجراحي — توقيع ثنائي',
      previousHash: ctrlSeedHash1,
      entryHash: ctrlSeedHash2,
    },
  });

  // Supplier & Consignment Receipt
  const medSupplier = await prisma.supplier.create({
    data: {
      hospitalId: hospital.id,
      code: 'SUP-MED-01',
      name: 'الشركة الليبية لاستيراد الأدوية والمستلزمات الطبية',
      phone: '+218 21 333 4455',
      email: 'orders@libyamed-supply.ly',
      address: 'طرابلس — الطريق الدائري الثاني',
    },
  });

  const stent = await prisma.product.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'CONS-STENT-DES' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'CONS-STENT-DES',
      name: 'دعامة قلبية دوائية (DES Coronary Stent)',
      nameAr: 'دعامة قلبية دوائية',
      nameEn: 'Drug-Eluting Coronary Stent',
      type: ProductType.SUPPLY,
      costPrice: '1250.0000',
      sellPrice: '1650.0000',
      stockOnHand: '10.000',
      minStock: '2.000',
    },
  });
  await prisma.consignmentReceipt.create({
    data: {
      hospitalId: hospital.id,
      supplierId: medSupplier.id,
      warehouseId: pharmWH.id,
      productId: stent.id,
      batchNumber: 'STENT-2026-09',
      serialNumber: 'SN-CARD-9901',
      expiryDate: new Date('2028-06-30'),
      quantityReceived: '10.000',
      quantityConsumed: '0.000',
      quantityReturned: '0.000',
      agreedUnitPrice: '1250.0000',
      status: 'ACTIVE',
      receivedById: storeKeeper.id,
      notes: 'عهدة أمانة قسم القسطرة والعمليات',
    },
  });

  // Historical stock transactions across 4 months for Inventory Dashboard trend chart
  for (let mOffset = 1; mOffset <= 4; mOffset++) {
    const txDate = new Date(Date.UTC(2026, 10 - mOffset, 15, 10, 0, 0));
    await prisma.stockTransaction.create({
      data: {
        hospitalId: hospital.id,
        warehouseId: pharmWH.id,
        productId: panadol.id,
        type: StockTransactionType.IN,
        quantity: '200.000',
        baseQuantity: '200.000',
        unitCost: '1.5000',
        totalCost: '300.000',
        referenceType: 'DEMO_OPENING',
        notes: `توريد مخزني شهري (شهر ${11 - mOffset})`,
        createdAt: txDate,
        createdById: storeKeeper.id,
        batchNumber: 'INIT-2025',
      },
    });
  }

  // Prescriptions: 1 ACTIVE for IPD (with 1 5-Rights verified MAR + ready for nurse CLMA live demo), 1 ACTIVE pending pharmacy worklist
  const rxIpd = await prisma.prescription.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encIpd.id,
      patientId: p2.id,
      doctorId: drSara.id,
      status: PrescriptionStatus.ACTIVE,
      pharmacistVerificationStatus: PharmacistVerificationStatus.VERIFIED,
      verifiedById: pharmAli.id,
      verifiedAt: new Date(),
      notes: 'خافض حرارة ومسكن بعد التحضير الجراحي',
      items: {
        create: [
          {
            productId: panadol.id,
            dose: '500mg',
            route: MedicationRoute.ORAL,
            frequency: MedicationFrequency.TID,
            durationDays: 5,
            quantity: 15,
            notes: 'عند اللزوم أو كل 8 ساعات',
          },
        ],
      },
    },
    include: { items: true },
  });

  await prisma.medicationAdministration.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encIpd.id,
      prescriptionItemId: rxIpd.items[0].id,
      administeredAt: todayAt(8, 5),
      scheduledSlot: `${new Date().toISOString().slice(0, 10)}|08:00`,
      scheduledFor: todayAt(8, 0),
      status: AdministrationStatus.GIVEN,
      isBarcodeMatch: true,
      scannedPatientBarcode: p2.mrn,
      scannedDrugBarcode: '6221000500011',
      verificationScope: 'FULL_FIVE_RIGHTS',
      verifiedDose: '500mg',
      verifiedRoute: 'ORAL',
      timeVarianceMinutes: 5,
      isVerified5Rights: true,
      performerId: nurseLaila.id,
      notes: 'إعطاء مطابق بالكامل للحقوق الخمسة بالباركود',
    },
  });

  // Pending outpatient prescription ready for Pharmacy Worklist verification/dispensing demo
  await prisma.prescription.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encOpd.id,
      patientId: p1.id,
      doctorId: drAhmed.id,
      status: PrescriptionStatus.ACTIVE,
      pharmacistVerificationStatus: PharmacistVerificationStatus.PENDING,
      notes: 'جاهز للتحقق الصيدلاني والصرف المباشر',
      items: {
        create: [
          {
            productId: panadol.id,
            dose: '500mg',
            route: MedicationRoute.ORAL,
            frequency: MedicationFrequency.BID,
            durationDays: 5,
            quantity: 10,
          },
        ],
      },
    },
  });

  // 8. Lab Orders, Specimen Chain-of-Custody, Westgard QC + Levey-Jennings (CAP02)
  const cbcTest = await prisma.labTest.findFirstOrThrow({
    where: { hospitalId: hospital.id, code: 'CBC' },
    include: { parameters: true },
  });
  const creatTest = await prisma.labTest.findFirst({
    where: { hospitalId: hospital.id, code: 'CREAT' },
  });

  const ordLabDone = await prisma.order.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encClosed.id,
      orderedById: drAhmed.id,
      type: OrderType.LAB,
      status: OrderStatus.COMPLETED,
      paymentStatus: 'PAID',
      completedAt: new Date(),
    },
  });
  const labDone = await prisma.labOrder.create({
    data: {
      orderId: ordLabDone.id,
      testId: cbcTest.id,
      resultStatus: LabResultStatus.COMPLETED,
      resultValue: 'CBC Normal Panel',
      resultDate: new Date(),
      enteredById: labUser.id,
      enteredAt: new Date(),
      isVerified: true,
      verifiedById: drAhmed.id,
      verifiedAt: new Date(),
      verificationHash: sha256(`LAB-VERIFY|${ordLabDone.id}|CBC|COMPLETED`),
    },
  });
  const wbcParam = cbcTest.parameters.find((p) => p.code === 'WBC');
  const hgbParam = cbcTest.parameters.find((p) => p.code === 'HGB');
  await prisma.labOrderResult.createMany({
    data: [
      {
        labOrderId: labDone.id,
        parameterId: wbcParam?.id,
        parameterName: 'White Blood Cells',
        value: '7.4',
        unit: '10^3/uL',
        range: '4.0-10.0',
        flag: 'N',
      },
      {
        labOrderId: labDone.id,
        parameterId: hgbParam?.id,
        parameterName: 'Hemoglobin',
        value: '13.8',
        unit: 'g/dL',
        range: '13.0-17.0',
        flag: 'N',
      },
    ],
  });

  const ordLabPending = await prisma.order.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encOpd.id,
      orderedById: drAhmed.id,
      type: OrderType.LAB,
      status: OrderStatus.IN_PROGRESS,
      paymentStatus: 'PAID',
      notes: 'تحليل عاجل للعيادات الخارجية',
    },
  });
  const labInProg = await prisma.labOrder.create({
    data: {
      orderId: ordLabPending.id,
      testId: (creatTest ?? cbcTest).id,
      resultStatus: LabResultStatus.IN_PROGRESS,
    },
  });

  const specimen1 = await prisma.labSpecimen.create({
    data: {
      hospitalId: hospital.id,
      labOrderId: labInProg.id,
      barcode: 'SPEC-2026-00041',
      specimenType: 'SERUM',
      containerType: 'SST_GOLD',
      collectionSite: 'Left Antecubital Vein',
      status: 'RECEIVED',
      collectedById: nurseLaila.id,
      receivedById: labUser.id,
      receivedAt: new Date(),
      storageLocation: 'Rack A-04',
    },
  });
  await prisma.labSpecimenEvent.create({
    data: {
      hospitalId: hospital.id,
      specimenId: specimen1.id,
      eventType: 'RECEIVED',
      fromStatus: 'COLLECTED',
      toStatus: 'RECEIVED',
      actorId: labUser.id,
      notes: 'تم استلام العينة وفحص الباركود بالمختبر',
    },
  });

  // Lab Westgard QC Lot + 6 Runs for Levey-Jennings Chart
  const qcLot = await prisma.labQcLot.create({
    data: {
      hospitalId: hospital.id,
      testId: (creatTest ?? cbcTest).id,
      analyzerName: 'Cobas c311 #1',
      lotNumber: 'QC-BIO-2026-L2',
      level: 'LEVEL_2_NORMAL',
      targetMean: '1.2000',
      targetSd: '0.0500',
      unit: 'mg/dL',
      expiryDate: new Date('2027-08-31'),
      createdById: labUser.id,
    },
  });

  const qcSeries = [
    { val: '1.1900', z: '-0.2000', status: 'PASS', rules: [], daysAgo: 5 },
    { val: '1.2200', z: '0.4000', status: 'PASS', rules: [], daysAgo: 4 },
    { val: '1.2800', z: '1.6000', status: 'PASS', rules: [], daysAgo: 3 },
    { val: '1.3100', z: '2.2000', status: 'WARNING', rules: ['1-2s'], daysAgo: 2 },
    { val: '1.3600', z: '3.2000', status: 'REJECT', rules: ['1-3s'], daysAgo: 1, action: 'إعادة معايرة جهاز Cobas c311' },
    { val: '1.2050', z: '0.1000', status: 'PASS', rules: [], daysAgo: 0 },
  ];
  for (const r of qcSeries) {
    await prisma.labQcRun.create({
      data: {
        hospitalId: hospital.id,
        qcLotId: qcLot.id,
        measuredValue: r.val,
        zScore: r.z,
        status: r.status,
        violatedRules: r.rules,
        correctiveAction: r.action,
        performedById: labUser.id,
        reviewedById: r.status === 'REJECT' ? drAhmed.id : null,
        reviewedAt: r.status === 'REJECT' ? new Date() : null,
        measuredAt: new Date(Date.now() - r.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 9. Blood Bank (CAP04): Cleared Units & Active Crossmatch
  const unitOneg = await prisma.bloodUnit.create({
    data: {
      hospitalId: hospital.id,
      unitNumber: 'BB-2026-O-NEG-101',
      componentType: 'PRBC',
      bloodGroup: 'O-',
      volumeMl: 310,
      donorReference: 'LIBYA-BLOOD-BANK-701',
      collectedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      storageLocation: 'Fridge 1 - Shelf A',
      screeningStatus: 'CLEARED',
      screeningNotes: 'HIV/HBV/HCV/Syphilis Negative',
      status: 'CROSSMATCHED',
      receivedById: labUser.id,
      screenedById: drAhmed.id,
      screenedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.bloodUnit.createMany({
    data: [
      {
        hospitalId: hospital.id,
        unitNumber: 'BB-2026-A-POS-102',
        componentType: 'PRBC',
        bloodGroup: 'A+',
        volumeMl: 320,
        donorReference: 'LIBYA-BLOOD-BANK-702',
        collectedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
        storageLocation: 'Fridge 1 - Shelf B',
        screeningStatus: 'CLEARED',
        status: 'AVAILABLE',
        receivedById: labUser.id,
        screenedById: drAhmed.id,
        screenedAt: new Date(),
      },
      {
        hospitalId: hospital.id,
        unitNumber: 'BB-2026-B-POS-103',
        componentType: 'FFP',
        bloodGroup: 'B+',
        volumeMl: 250,
        donorReference: 'LIBYA-BLOOD-BANK-703',
        collectedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        storageLocation: 'Freezer -30C',
        screeningStatus: 'CLEARED',
        status: 'AVAILABLE',
        receivedById: labUser.id,
        screenedById: drAhmed.id,
        screenedAt: new Date(),
      },
    ],
  });

  await prisma.bloodCrossmatch.create({
    data: {
      hospitalId: hospital.id,
      patientId: p2.id,
      encounterId: encIpd.id,
      bloodUnitId: unitOneg.id,
      patientBloodGroup: 'A+',
      antibodyScreen: 'NEGATIVE',
      crossmatchResult: 'COMPATIBLE',
      status: 'ACTIVE',
      validUntil: new Date(Date.now() + 72 * 60 * 60 * 1000),
      performedById: labUser.id,
      verifiedById: drSara.id,
      verifiedAt: new Date(),
      notes: 'تطابق آمن مخصص لحالة الجراحة',
    },
  });

  // 10. Radiology Orders, Signed Report + RDSR Dose Tracking (CAP13)
  const cxrStudy = await prisma.radiologyStudy.findFirstOrThrow({
    where: { hospitalId: hospital.id, code: 'CXR' },
  });
  const ctAbdStudy = await prisma.radiologyStudy.findFirst({
    where: { hospitalId: hospital.id, code: 'CT-ABD' },
  });

  const ordRadDone = await prisma.order.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encIcu.id,
      orderedById: drAhmed.id,
      type: OrderType.RADIOLOGY,
      status: OrderStatus.COMPLETED,
      paymentStatus: 'PAID',
      completedAt: new Date(),
    },
  });

  const radSignedAt = new Date();
  const radOrderDone = await prisma.radiologyOrder.create({
    data: {
      orderId: ordRadDone.id,
      studyId: cxrStudy.id,
      status: RadiologyStatus.COMPLETED,
      dicomAccessionNumber: 'ACC-DEMO-2026-001',
      scheduledAt: todayAt(7, 30),
      reportedAt: radSignedAt,
      reportStatus: 'FINAL',
      indicationText: 'Post-PCI chest radiograph',
      techniqueText: 'Portable AP Chest X-Ray',
      findingsText: 'Clear lung fields. Normal cardiomediastinal silhouette. No pleural effusion.',
      impressionText: 'Normal post-procedural chest radiograph.',
      reportText: 'Normal post-procedural chest radiograph.',
      reportedById: radUser.id,
      signedById: drAhmed.id,
      signedAt: radSignedAt,
      signatureHash: sha256(
        `RAD|${ordRadDone.id}|ACC-DEMO-2026-001|FINAL|${radSignedAt.toISOString()}`,
      ),
    },
  });

  await prisma.radiologyDoseRecord.create({
    data: {
      hospitalId: hospital.id,
      radiologyOrderId: radOrderDone.id,
      patientId: p4.id,
      modality: 'DX',
      bodyRegion: 'Chest',
      dapGyCm2: '0.1400',
      effectiveDoseMsv: '0.1000',
      kvp: '110.00',
      mas: '3.20',
      exposureCount: 1,
      exceedsDrl: false,
      cumulative12mMsv: '0.1000',
      cumulativeWarning: false,
      recordedById: radUser.id,
      notes: 'جرعة قياسية ضمن حدود DRL',
    },
  });

  if (ctAbdStudy) {
    const ordRadPending = await prisma.order.create({
      data: {
        hospitalId: hospital.id,
        encounterId: encOpd.id,
        orderedById: drAhmed.id,
        type: OrderType.RADIOLOGY,
        status: OrderStatus.NEW,
        paymentStatus: 'PENDING',
      },
    });
    await prisma.radiologyOrder.create({
      data: {
        orderId: ordRadPending.id,
        studyId: ctAbdStudy.id,
        status: RadiologyStatus.PENDING,
        dicomAccessionNumber: 'ACC-DEMO-2026-002',
        scheduledAt: todayAt(14, 0),
        reportStatus: 'DRAFT',
        indicationText: 'Rule out abdominal aortic aneurysm',
      },
    });
  }

  // 11. Surgery Case + WHO Safety Checklist + DRG Surgical Packages (CAP05 / CAP08)
  const ot1 = await prisma.operatingTheatre.findFirstOrThrow({
    where: { hospitalId: hospital.id },
  });

  const pkgLapChole = await prisma.surgicalPackage.upsert({
    where: {
      hospitalId_code: { hospitalId: hospital.id, code: 'PKG-LAP-CHOLE' },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'PKG-LAP-CHOLE',
      name: 'باقة استئصال المرارة بالمنظار (DRG الشاملة)',
      nameEn: 'Laparoscopic Cholecystectomy Package',
      drgCode: 'DRG-417',
      description: 'تشمل العملية والتخدير وإقامة يومين والتحاليل الأساسية',
      packagePrice: '4500.000',
      includedStayDays: 2,
      createdById: admin.id,
      inclusions: {
        create: [
          { category: 'SURGERY', coverageMode: 'INCLUDED_UNLIMITED' },
          { category: 'ANESTHESIA', coverageMode: 'INCLUDED_UNLIMITED' },
          { category: 'ROOM', coverageMode: 'INCLUDED_CAPPED', capAmount: '500.000' },
          { category: 'PHARMACY', coverageMode: 'INCLUDED_CAPPED', capAmount: '600.000' },
          { category: 'LAB', coverageMode: 'INCLUDED_CAPPED', capAmount: '300.000' },
        ],
      },
    },
  });

  await prisma.surgicalPackage.upsert({
    where: {
      hospitalId_code: { hospitalId: hospital.id, code: 'PKG-CSECTION' },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'PKG-CSECTION',
      name: 'باقة الولادة القيصرية الشاملة',
      nameEn: 'Cesarean Section Comprehensive Package',
      drgCode: 'DRG-788',
      packagePrice: '3200.000',
      includedStayDays: 2,
      createdById: admin.id,
      inclusions: {
        create: [
          { category: 'SURGERY', coverageMode: 'INCLUDED_UNLIMITED' },
          { category: 'ROOM', coverageMode: 'INCLUDED_UNLIMITED' },
          { category: 'CONSUMABLES', coverageMode: 'INCLUDED_CAPPED', capAmount: '450.000' },
        ],
      },
    },
  });

  const surgCase = await prisma.surgeryCase.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encIpd.id,
      theatreId: ot1.id,
      surgeryName: 'استئصال المرارة بالمنظار (Lap. Cholecystectomy)',
      scheduledStart: todayAt(15, 0),
      scheduledEnd: todayAt(17, 0),
      status: SurgeryStatus.SCHEDULED,
      preOpDiagnosis: 'Acute calculous cholecystitis (K80.0)',
      surgeonNotes: 'مريض محجوز في باقة DRG-417 مع توفر كيس دم O- احتياطي',
    },
  });

  await prisma.surgicalSafetyChecklist.create({
    data: {
      hospitalId: hospital.id,
      surgeryCaseId: surgCase.id,
      phase: 'SIGN_IN',
      checklistItems: {
        patientIdentityConfirmed: true,
        siteMarked: true,
        anesthesiaSafetyCheckDone: true,
        pulseOximeterFunctioning: true,
      },
      siteMarked: true,
      consentConfirmed: true,
      allergyChecked: true,
      antibioticProphylaxisGiven: true,
      imagingDisplayed: true,
      performedById: nurseLaila.id,
      signatureHash: sha256(`WHO-SIGN-IN|${surgCase.id}|${nurseLaila.id}`),
      notes: 'اكتمل فحص ما قبل التخدير بنجاح',
    },
  });

  await prisma.encounterPackageEnrollment.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encIpd.id,
      packageId: pkgLapChole.id,
      status: 'ACTIVE',
      packagePriceSnapshot: '4500.000',
      actualChargesTotal: '3200.000',
      coveredByPackageAmount: '3200.000',
      overageAmount: '0.000',
      netBillableTotal: '4500.000',
      packageVariance: '1300.000',
      enrolledById: drSara.id,
      notes: 'تفعيل باقة DRG الجراحية — جاهزة للتسوية وإصدار الفاتورة النهائية عند الخروج',
    },
  });

  // 12. Billing, Cashier Session, Payments, Balanced GL Accounting Entries, Pre-Auths & Claim Batch
  const cashShift = await prisma.cashierSession.create({
    data: {
      hospitalId: hospital.id,
      cashierId: cashierMo.id,
      requestKey: 'demo-shift-open-req-2026-11-26',
      status: 'OPEN',
      openingAmount: '1500.000',
      reason: 'فتح عهدة الصندوق الصباحي للعرض التشغيلي',
      reviewedById: accSamir.id,
      reviewReason: 'اعتماد مدير الحسابات لافتتاح الوردية',
      openingReference: 'SHIFT-OPN-2026-001',
      openingKey: 'demo-shift-open-key-2026-11-26',
      openedAt: todayAt(8, 0),
    },
  });

  const invPaid1 = await prisma.invoice.create({
    data: {
      hospitalId: hospital.id,
      patientId: p5.id,
      encounterId: encClosed.id,
      status: InvoiceStatus.PAID,
      totalAmount: '450.000',
      discountAmount: '0.000',
      paidAmount: '450.000',
      patientShare: '450.000',
      insuranceShare: '0.000',
      currency: 'LYD',
      financialYearId: mainYear.id,
      financialPeriodId: novPeriodId,
      notes: 'فاتورة عيادات ومختبر مدفوعة نقداً',
    },
  });
  await prisma.payment.create({
    data: {
      hospitalId: hospital.id,
      invoiceId: invPaid1.id,
      amount: '450.000',
      method: PaymentMethod.CASH,
      paidAt: todayAt(9, 15),
      cashierId: cashierMo.id,
      sessionId: cashShift.id,
      reference: 'REC-2026-001',
      requestKey: 'demo-pay-req-001',
    },
  });

  const invPaid2 = await prisma.invoice.create({
    data: {
      hospitalId: hospital.id,
      patientId: p4.id,
      encounterId: encIcu.id,
      status: InvoiceStatus.PAID,
      totalAmount: '3200.000',
      discountAmount: '0.000',
      paidAmount: '320.000',
      patientShare: '320.000',
      insuranceShare: '2880.000',
      insuranceProviderId: libyaIns.id,
      coveragePolicyId: goldPolicy.id,
      claimStatus: 'SUBMITTED',
      currency: 'LYD',
      financialYearId: mainYear.id,
      financialPeriodId: novPeriodId,
      notes: 'فاتورة ICU — 10% تحمل مريض مدفوعة و90% مطالبة تأمين',
    },
  });
  await prisma.payment.create({
    data: {
      hospitalId: hospital.id,
      invoiceId: invPaid2.id,
      amount: '320.000',
      method: PaymentMethod.CARD,
      paidAt: todayAt(10, 0),
      cashierId: cashierMo.id,
      sessionId: cashShift.id,
      reference: 'POS-2026-8812',
      requestKey: 'demo-pay-req-002',
    },
  });

  // Unpaid ISSUED invoice ready for Cashier live payment collection demo
  const invDue = await prisma.invoice.create({
    data: {
      hospitalId: hospital.id,
      patientId: p3.id,
      encounterId: encEr.id,
      status: InvoiceStatus.ISSUED,
      totalAmount: '340.000',
      discountAmount: '0.000',
      paidAmount: '0.000',
      patientShare: '340.000',
      insuranceShare: '0.000',
      currency: 'LYD',
      financialYearId: mainYear.id,
      financialPeriodId: novPeriodId,
      notes: 'فاتورة طوارئ صادرة — جاهزة للتحصيل في شاشة الكاشير',
    },
  });
  void invDue;

  // Balanced GL Accounting Entries so Financial Statements (Income Statement, Balance Sheet, Trial Balance, Cash Flow) look rich & accurate
  const cashAcc = await accByCode('100100');
  const arInsAcc = await accByCode('120200');
  const arPatAcc = await accByCode('120100');
  const apSuppAcc = await accByCode('200100');
  const capitalAcc = await accByCode('300100');
  const retainedAcc = await accByCode('300200');
  const revOpdAcc = await accByCode('400100');
  const revIpdAcc = await accByCode('400200');
  const revLabAcc = await accByCode('400300');
  const revIcuAcc = await accByCode('400700');
  const expSalAcc = await accByCode('500100');
  const drugInvAcc = await accByCode('130100');

  await prisma.accountingEntry.create({
    data: {
      hospitalId: hospital.id,
      entryDate: new Date('2026-01-01T09:00:00.000Z'),
      description: 'القيد الافتتاحي للأرصدة — مستشفى السرايا الدولي 2026',
      financialYearId: mainYear.id,
      financialPeriodId: novPeriodId,
      sourceModule: AccountingSourceModule.OPENING,
      postingKey: 'demo-opening-2026',
      createdById: accSamir.id,
      lines: {
        create: [
          { accountId: bankMainAcc.id, description: 'رصيد البنك الرئيسي', debit: '125000.000', credit: '0.000' },
          { accountId: cashAcc.id, description: 'رصيد الصندوق الرئيسي', debit: '15000.000', credit: '0.000' },
          { accountId: drugInvAcc.id, description: 'مخزون الأدوية الافتتاحي', debit: '45000.000', credit: '0.000' },
          { accountId: apSuppAcc.id, description: 'ذمم الموردين الافتتاحية', debit: '0.000', credit: '25000.000' },
          { accountId: capitalAcc.id, description: 'رأس المال المدفوع', debit: '0.000', credit: '140000.000' },
          { accountId: retainedAcc.id, description: 'الأرباح المبقاة', debit: '0.000', credit: '20000.000' },
        ],
      },
    },
  });

  await prisma.accountingEntry.create({
    data: {
      hospitalId: hospital.id,
      entryDate: todayAt(9, 15),
      description: 'قيد إيرادات العيادات والمختبر والعمليات — العرض التنفيذي',
      financialYearId: mainYear.id,
      financialPeriodId: novPeriodId,
      sourceModule: AccountingSourceModule.BILLING,
      postingKey: 'demo-rev-entry-2026-001',
      createdById: accSamir.id,
      lines: {
        create: [
          { accountId: cashAcc.id, description: 'متحصلات نقدية من المرضى', debit: '12450.000', credit: '0.000', costCenterId: ccOpd.id },
          { accountId: arInsAcc.id, description: 'ذمم شركات التأمين المعتمدة', debit: '18880.000', credit: '0.000', costCenterId: ccOpd.id },
          { accountId: arPatAcc.id, description: 'ذمم مرضى تحت التحصيل', debit: '2340.000', credit: '0.000', costCenterId: ccOpd.id },
          { accountId: revOpdAcc.id, description: 'إيرادات العيادات الخارجية', debit: '0.000', credit: '11200.000', costCenterId: ccOpd.id },
          { accountId: revLabAcc.id, description: 'إيرادات المختبر وبنك الدم', debit: '0.000', credit: '8590.000', costCenterId: ccLab.id },
          { accountId: revIcuAcc.id, description: 'إيرادات العناية المركزة', debit: '0.000', credit: '9880.000', costCenterId: ccOpd.id },
          { accountId: revIpdAcc.id, description: 'إيرادات الإقامة والإيواء', debit: '0.000', credit: '4000.000', costCenterId: ccOpd.id },
        ],
      },
    },
  });

  await prisma.accountingEntry.create({
    data: {
      hospitalId: hospital.id,
      entryDate: todayAt(10, 30),
      description: 'إثبات مصروف الرواتب والأجور للشهر الحالي',
      financialYearId: mainYear.id,
      financialPeriodId: novPeriodId,
      sourceModule: AccountingSourceModule.PAYROLL,
      postingKey: 'demo-payroll-exp-2026-11',
      createdById: accSamir.id,
      lines: {
        create: [
          { accountId: expSalAcc.id, description: 'مرتبات الكادر الطبي والتمريضي', debit: '18500.000', credit: '0.000' },
          { accountId: bankMainAcc.id, description: 'سداد مصرفي للرواتب', debit: '0.000', credit: '18500.000' },
        ],
      },
    },
  });

  // Pre-Authorizations & Clearinghouse Claim Batch
  await prisma.preAuthorization.createMany({
    data: [
      {
        hospitalId: hospital.id,
        patientId: p1.id,
        policyId: goldPolicy.id,
        authCode: 'AUTH-LIC-2026-901',
        status: 'APPROVED',
        requestedAmount: '2500.000',
        approvedAmount: '2500.000',
        reviewedById: rcmUser.id,
        reviewedAt: new Date(),
        reviewRequestKey: 'demo-preauth-rev-001',
        decisionReason: 'تغطية موافقة عبر السجل الوطني الموحد MPI',
        notes: 'قسطرة تشخيصية وفحوصات قلبية',
      },
      {
        hospitalId: hospital.id,
        patientId: p2.id,
        policyId: saharaPolicy.id,
        status: 'PENDING',
        requestedAmount: '4500.000',
        notes: 'طلب موافقة مسبقة لعملية استئصال المرارة بالمنظار (جاهز للبَت في بوابة الجهات الضامنة)',
      },
    ],
  });

  const claimBatch = await prisma.claimBatch.create({
    data: {
      hospitalId: hospital.id,
      providerId: libyaIns.id,
      batchNumber: 'CLH-2026-TRIPOLI-001',
      clearingChannel: 'LOCAL_CLEARINGHOUSE',
      totalClaims: 1,
      totalAmount: '2880.000',
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submissionRequestKey: 'demo-clh-sub-001',
    },
  });

  await prisma.claim.create({
    data: {
      hospitalId: hospital.id,
      invoiceId: invPaid2.id,
      batchId: claimBatch.id,
      claimNumber: 'CLM-2026-0001',
      status: ClaimStatus.SUBMITTED,
      submittedAt: new Date(),
      claimedAmount: '2880.000',
    },
  });

  // 13. HR Credentialing (CAP12), Biometric ADMS (CAP11) & Holiday
  await prisma.staffCredential.createMany({
    data: [
      {
        hospitalId: hospital.id,
        userId: drAhmed.id,
        staffCategory: 'MEDICAL',
        credentialType: 'PRACTICE_LICENSE',
        title: 'إذن مزاولة مهنة الطب البشري — استشاري باطنة',
        licenseNumber: 'LMC-TRI-2026-4410',
        issuingAuthority: 'نقابة الأطباء / المجلس الطبي الليبي',
        specialty: 'Internal Medicine',
        issueDate: new Date('2025-01-15'),
        expiryDate: new Date('2028-01-15'),
        status: 'ACTIVE',
        verifiedById: hrMuna.id,
        verifiedAt: new Date('2025-01-20'),
        createdById: admin.id,
      },
      {
        hospitalId: hospital.id,
        userId: drSara.id,
        staffCategory: 'MEDICAL',
        credentialType: 'HEALTH_CERTIFICATE',
        title: 'الشهادة الصحية للخلو من الأمراض المعدية',
        licenseNumber: 'NCDC-HC-2026-8821',
        issuingAuthority: 'المركز الوطني لمكافحة الأمراض NCDC',
        issueDate: new Date('2025-12-10'),
        expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        alertDaysBefore: 30,
        status: 'ACTIVE',
        verifiedById: hrMuna.id,
        verifiedAt: new Date('2025-12-12'),
        createdById: admin.id,
        notes: 'تنتهي خلال 14 يوماً — تظهر تلقائياً في تنبيهات الانتهاء',
      },
    ],
  });

  await prisma.biometricDevice.upsert({
    where: { serialNumber: 'ZK-ER-DEMO-01' },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'بوابة حضور قسم الطوارئ الرئيسية',
      brand: 'ZKTECO',
      model: 'SpeedFace-V5L',
      serialNumber: 'ZK-ER-DEMO-01',
      ipAddress: '192.168.10.55',
      port: 4370,
      connectionMode: 'ADMS',
      location: 'مدخل الطوارئ — الدور الأرضي',
      deviceSecretHash: sha256('demo-zk-adms-secret'),
      isActive: true,
      lastSyncAt: new Date(),
      createdById: admin.id,
    },
  });

  await prisma.holiday.create({
    data: {
      hospitalId: hospital.id,
      name: 'عيد الاستقلال الليبي',
      nameEn: 'Libyan Independence Day',
      date: new Date('2026-12-24T00:00:00.000Z'),
      isAnnual: true,
      createdById: hrMuna.id,
    },
  });

  // 14. Quality Incident + Tamper-Evident Audit Chain
  await prisma.clinicalIncident.create({
    data: {
      hospitalId: hospital.id,
      incidentNumber: 'INC-2026-0001',
      incidentDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      reportedById: nurseLaila.id,
      incidentType: IncidentType.NEAR_MISS,
      severity: IncidentSeverity.NEAR_MISS,
      description: 'تم رصد تشابه أسماء بين مريضين عبر نظام تنبيه السجل الوطني قبل الصرف',
      descriptionAr: 'رصد تشابه أسماء عبر نظام السجل الوطني الموحد ومنع الخطأ قبل الصرف',
      location: 'صيدلية العيادات الخارجية',
      status: IncidentStatus.UNDER_REVIEW,
      investigatedById: qualityUser.id,
    },
  });

  await appendChainedAudit(prisma, {
    hospitalId: hospital.id,
    userId: admin.id,
    action: 'DEMO_ENVIRONMENT_INITIALIZED',
    entity: 'Hospital',
    entityId: hospital.id,
    details: { environment: 'client-live-demo', version: DEMO_SEED_VERSION },
  });

  await prisma.systemSetting.upsert({
    where: {
      hospitalId_key: { hospitalId: hospital.id, key: DEMO_SEED_KEY },
    },
    update: { value: DEMO_SEED_VERSION },
    create: {
      hospitalId: hospital.id,
      key: DEMO_SEED_KEY,
      value: DEMO_SEED_VERSION,
      type: 'STRING',
      group: 'SYSTEM',
      description: 'Marker for live executive client demo dataset',
    },
  });

  console.log('✅ Libyan Hospital Executive Demo Dataset seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
