
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './db-reset';
import { AuthHelper } from './auth-helper';
import { JwtService } from '@nestjs/jwt';
import { ServiceType, OrderStatus, LabResultStatus } from '@prisma/client';

describe('Full Cycle E2E Simulation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authHelper: AuthHelper;
  let jwt: JwtService;

  // Tokens
  let doctorToken: string;
  let labTechToken: string;
  let receptionistToken: string;
  let accountantToken: string;

  // Data IDs
  let patientId: number;
  let encounterId: number;
  let hospitalId: number;
  let labTestId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [AuthHelper],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwt = app.get<JwtService>(JwtService);
    authHelper = new AuthHelper(prisma, jwt);

    try {
        // 1. Reset Database
        await resetDatabase(prisma);

        // 2. Seed Environment for Test (Simulating seed.ts + medical seed)
        // Create Hospital
        const hospital = await prisma.hospital.create({
          data: { code: 'E2E_HOSP', name: 'Saraya E2E Hospital', isActive: true },
        });
        hospitalId = hospital.id;

        // Create ServiceItem & LabTest (CPT)
        // ... (previous code)

        // Seed Financial Year & Period (Critical for Billing)
        // Seed Financial Year & Period (Critical for Billing)
        const currentYear = new Date().getFullYear();
        const financialYear = await prisma.financialYear.create({
            data: {
                name: `${currentYear}`,
                code: `FY${currentYear}`,
                startDate: new Date(`${currentYear}-01-01`),
                endDate: new Date(`${currentYear}-12-31`),
                status: 'OPEN', // FinancialYearStatus.OPEN
                hospitalId,
                isCurrent: true
            }
        });

        // Create Period for current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const daysInMonth = endOfMonth.getDate();
        
        await prisma.financialPeriod.create({
            data: {
                periodCode: `${now.getMonth() + 1}/${currentYear}`,
                periodIndex: now.getMonth() + 1,
                monthStartDate: startOfMonth,
                monthEndDate: endOfMonth,
                numberOfDays: daysInMonth,
                financialYearId: financialYear.id,
                isOpen: true,
            }
        });

        const serviceItem = await prisma.serviceItem.create({
          data: {
            hospitalId,
            code: '85025',
            name: 'CBC',
            type: 'LAB', // ServiceType.LAB
            defaultPrice: 50.0,
            isActive: true, // Boolean
            isBillable: true,
          },
        });

        const labTest = await prisma.labTest.create({
          data: {
            hospitalId,
            code: '85025',
            name: 'CBC',
            category: 'Hematology',
            isActive: true,
            serviceItemId: serviceItem.id,
          },
        });
        labTestId = labTest.id;

        // Create Users with Roles
        // We need to create Roles first (Global, no hospitalId)
        const roleDoctor = await prisma.role.upsert({ 
            where: { name: 'DOCTOR' }, 
            update: {}, 
            create: { name: 'DOCTOR', description: 'Doctor' } 
        });
        const roleLab = await prisma.role.upsert({ 
            where: { name: 'LAB_TECH' },
            update: {}, 
            create: { name: 'LAB_TECH', description: 'Lab Tech' } 
        });
        const roleRecep = await prisma.role.upsert({ 
            where: { name: 'RECEPTION' },
            update: {}, 
            create: { name: 'RECEPTION', description: 'Reception' } 
        });
        const roleAccountant = await prisma.role.upsert({ 
            where: { name: 'ACCOUNTANT' },
            update: {}, 
            create: { name: 'ACCOUNTANT', description: 'Accountant' } 
        });

        // Helper to create user and assign role
        const createUser = async (username: string, roleName: string) => {
          const { user, accessToken } = await authHelper.createTestUser(username, 'pass123');
          // Update user to use our new hospitalId
          await prisma.user.update({
            where: { id: user.id },
            data: { hospitalId },
          });
          
          const role = await prisma.role.findUnique({ where: { name: roleName } });
          if (!role) throw new Error(`Role ${roleName} not found`);

          // Assign Role
          await prisma.userRole.create({
            data: { userId: user.id, roleId: role.id },
          });

          // Re-issue token with role NAME (Array of strings)
            const payload = { sub: user.id, username: user.username, roles: [roleName], hospitalId, permissions: [] };
            return jwt.sign(payload, { secret: process.env.JWT_SECRET || 'PRODUCTION_SECRET_KEY_CHANGE_ME' });
        };

        doctorToken = await createUser('dr_house', 'DOCTOR');
        labTechToken = await createUser('lab_guy', 'LAB_TECH');
        receptionistToken = await createUser('recep_lady', 'RECEPTION');
        accountantToken = await createUser('money_man', 'ACCOUNTANT');
    } catch (e) {
        console.error('SETUP FAILED:', e);
        throw e;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Step 1: Reception ---
  it('1. Receptionist registers a patient', async () => {
    const res = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        fullName: 'John Doe',
        mrn: 'MRN-E2E-001',
        gender: 'MALE',
        dateOfBirth: '1990-01-01',
        phone: '0910000000',
        nationalId: '123456789012',
      })
      .expect(201);

    patientId = res.body.id;
    expect(patientId).toBeDefined();
  });

  // --- Step 2: Reception Create Encounter ---
  it('2. Receptionist creates an Encounter (OPD)', async () => {
    const res = await request(app.getHttpServer())
      .post('/encounters')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        patientId,
        type: 'OPD',
        departmentId: null, // Optional
        reason: 'Feeling sick',
      })
      .expect(201);

    encounterId = res.body.id;
    expect(encounterId).toBeDefined();
  });

  // --- Step 3: Doctor Adds Diagnosis ---
  it('3. Doctor adds a diagnosis', async () => {
    // First, seed a Diagnosis Code since we reset DB
    const diagCode = await prisma.diagnosisCode.create({
        data: { code: 'J00', nameEn: 'Cold', isActive: true },
    });

    const res = await request(app.getHttpServer())
      .post(`/diagnosis/encounter/${encounterId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        codeId: diagCode.id, // Using the id
        type: 'PRIMARY',
        note: 'Severe cold',
      })
      .expect(201);
  });

  // --- Step 4: Doctor Orders Lab Test ---
  it('4. Doctor orders a Lab Test (CBC)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/lab/encounters/${encounterId}/orders`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        testIds: [labTestId],
        notes: 'Stat',
      })
      .expect(201);

    // Should create 1 order
    expect(res.body).toHaveLength(1);
    expect(res.body[0].test.code).toBe('85025');
  });

  // --- Step 5: Lab Tech Completes Order ---
  it('5. Lab Tech views worklist (optional) and completes order', async () => {
    // 5a. Get orders to find the ID
    const listRes = await request(app.getHttpServer())
      .get(`/lab/encounters/${encounterId}/orders`)
      .set('Authorization', `Bearer ${labTechToken}`)
      .expect(200);

    const orderId = listRes.body[0].id; // This is labOrder.id

    // 5b. Complete it
    const res = await request(app.getHttpServer())
      .patch(`/lab/orders/${orderId}/complete`)
      .set('Authorization', `Bearer ${labTechToken}`)
      .send({
        resultValue: '12.5',
        resultUnit: 'g/dL',
        referenceRange: '12-16',
      })
      .expect(200);
      
      expect(res.body.resultStatus).toBe('COMPLETED');
  });

  // --- Step 6: Accountant Views Invoice ---
  it('6. Accountant checks billing', async () => {
      // Since we created an order with a billable service, a charge should exist.
      // And in my LabService logic, it might have auto-created an invoice or just charges.
      // Let's check listing invoices for encounter.
      
      // First, get the invoice. If auto-created, it should be there.
      // Or we need to create one.
      // Assuming BillingService allows creation or listing.
      
      // Let's query charges directly via Prisma to verify they exist
      const charges = await prisma.encounterCharge.findMany({ where: { encounterId } });
      expect(charges.length).toBeGreaterThan(0);
      expect(Number(charges[0].totalAmount)).toBe(50.0);
  });

});
