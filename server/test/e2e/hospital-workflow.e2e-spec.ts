import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('E2E Tests - Complete Hospital Workflow', () => {
  let app: INestApplication;
  let prismaService: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    prismaService = moduleFixture.get('PrismaService');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prismaService.patient.deleteMany();
    await prismaService.encounter.deleteMany();
    await prismaService.invoice.deleteMany();
  });

  describe('Complete Patient Journey E2E', () => {
    it('should handle complete patient journey from registration to billing', async () => {
      // 1. Register new patient
      const patientData = {
        fullName: 'محمد أحمد',
        mrn: 'MRN-E2E-001',
        phone: '0912345678',
        email: 'mohammed@test.com',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
        address: 'شارع الملك فهد، الرياض',
      };

      const response = await request(app.getHttpServer())
        .post('/patients')
        .send(patientData)
        .expect(201);

      const patient = response.body;
      expect(patient.id).toBeDefined();
      expect(patient.fullName).toBe(patientData.fullName);

      // 2. Create encounter
      const encounterData = {
        patientId: patient.id,
        type: 'OUTPATIENT',
        departmentId: 1,
        doctorId: 1,
        chiefComplaint: 'صداع وحمى',
      };

      const encounterResponse = await request(app.getHttpServer())
        .post('/encounters')
        .send(encounterData)
        .expect(201);

      const encounter = encounterResponse.body;
      expect(encounter.id).toBeDefined();
      expect(encounter.status).toBe('OPEN');

      // 3. Add services/charges
      const chargeData = {
        encounterId: encounter.id,
        serviceItemId: 1,
        quantity: 1,
      };

      await request(app.getHttpServer())
        .post('/encounter-charges')
        .send(chargeData)
        .expect(201);

      // 4. Create invoice
      const invoiceResponse = await request(app.getHttpServer())
        .post(`/invoices/encounter/${encounter.id}`)
        .expect(201);

      const invoice = invoiceResponse.body;
      expect(invoice.id).toBeDefined();
      expect(invoice.status).toBe('DRAFT');

      // 5. Issue invoice
      const issuedInvoice = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/issue`)
        .expect(200);

      expect(issuedInvoice.body.status).toBe('ISSUED');

      // 6. Add payment
      const paymentData = {
        invoiceId: invoice.id,
        amount: invoice.totalAmount,
        method: 'CASH',
      };

      const paymentResponse = await request(app.getHttpServer())
        .post('/payments')
        .send(paymentData)
        .expect(201);

      expect(paymentResponse.body.status).toBe('PAID');

      // 7. Verify final state
      const finalInvoice = await request(app.getHttpServer())
        .get(`/invoices/${invoice.id}`)
        .expect(200);

      expect(finalInvoice.body.status).toBe('PAID');
      expect(finalInvoice.body.payments).toHaveLength(1);
    });

    it('should handle emergency patient workflow', async () => {
      // 1. Register emergency patient
      const emergencyPatient = {
        fullName: 'مريض طارئ',
        mrn: 'EMERGENCY-001',
        phone: '0998765432',
        isEmergency: true,
      };

      const patientResponse = await request(app.getHttpServer())
        .post('/patients')
        .send(emergencyPatient)
        .expect(201);

      const patient = patientResponse.body;

      // 2. Create emergency encounter
      const emergencyEncounter = {
        patientId: patient.id,
        type: 'EMERGENCY',
        departmentId: 2, // Emergency department
        priority: 'HIGH',
        triageLevel: 'RED',
      };

      const encounterResponse = await request(app.getHttpServer())
        .post('/encounters')
        .send(emergencyEncounter)
        .expect(201);

      const encounter = encounterResponse.body;
      expect(encounter.priority).toBe('HIGH');
      expect(encounter.triageLevel).toBe('RED');

      // 3. Add urgent lab orders
      const labOrderData = {
        encounterId: encounter.id,
        urgency: 'STAT',
        tests: [
          { labTestId: 1, instructions: 'طوارئ' },
          { labTestId: 2, instructions: 'طوارئ' },
        ],
      };

      await request(app.getHttpServer())
        .post('/lab-orders')
        .send(labOrderData)
        .expect(201);

      // 4. Add urgent radiology
      const radiologyData = {
        encounterId: encounter.id,
        radiologyTestId: 1,
        urgency: 'STAT',
        scheduledDate: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/radiology-studies')
        .send(radiologyData)
        .expect(201);

      // 5. Verify emergency workflow
      const encounterDetails = await request(app.getHttpServer())
        .get(`/encounters/${encounter.id}`)
        .expect(200);

      expect(encounterDetails.body.labOrders).toHaveLength(1);
      expect(encounterDetails.body.radiologyStudies).toHaveLength(1);
    });

    it('should handle inpatient admission and discharge workflow', async () => {
      // 1. Register patient
      const patientData = {
        fullName: 'مريض إقامة',
        mrn: 'INPATIENT-001',
        phone: '0955551234',
      };

      const patientResponse = await request(app.getHttpServer())
        .post('/patients')
        .send(patientData)
        .expect(201);

      const patient = patientResponse.body;

      // 2. Admit as inpatient
      const admissionData = {
        patientId: patient.id,
        type: 'INPATIENT',
        departmentId: 3, // Internal medicine
        admissionDate: new Date().toISOString(),
        bedId: 1,
        roomNumber: '101',
        wardId: 1,
      };

      const encounterResponse = await request(app.getHttpServer())
        .post('/encounters')
        .send(admissionData)
        .expect(201);

      const encounter = encounterResponse.body;
      expect(encounter.type).toBe('INPATIENT');
      expect(encounter.bedId).toBe(1);

      // 3. Add daily services
      for (let day = 1; day <= 3; day++) {
        const dailyService = {
          encounterId: encounter.id,
          serviceItemId: 10, // Room charge
          quantity: 1,
          serviceDate: new Date(Date.now() + day * 24 * 60 * 60 * 1000).toISOString(),
        };

        await request(app.getHttpServer())
          .post('/encounter-charges')
          .send(dailyService)
          .expect(201);
      }

      // 4. Add medications
      const prescriptionData = {
        encounterId: encounter.id,
        items: [
          {
            drugItemId: 1,
            dose: '500mg',
            route: 'IV',
            frequency: 'QID',
            durationDays: 3,
            quantity: 12,
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/prescriptions')
        .send(prescriptionData)
        .expect(201);

      // 5. Discharge patient
      const dischargeData = {
        dischargeDate: new Date().toISOString(),
        dischargeType: 'HOME',
        summary: 'تحسن الحالة بشكل كامل',
        instructions: 'متابعة في العيادة',
      };

      const dischargeResponse = await request(app.getHttpServer())
        .post(`/encounters/${encounter.id}/discharge`)
        .send(dischargeData)
        .expect(200);

      expect(dischargeResponse.body.status).toBe('DISCHARGED');

      // 6. Generate final bill
      const finalBillResponse = await request(app.getHttpServer())
        .post(`/invoices/encounter/${encounter.id}`)
        .expect(201);

      const finalBill = finalBillResponse.body;
      expect(finalBill.charges.length).toBeGreaterThan(3); // Room + medications
    });
  });

  describe('API Performance and Security', () => {
    it('should handle concurrent requests properly', async () => {
      // Create multiple concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) => 
        request(app.getHttpServer())
          .get('/patients')
          .query({ page: i + 1, limit: 10 })
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.items).toBeDefined();
      });
    });

    it('should validate input data properly', async () => {
      // Test invalid patient data
      const invalidPatient = {
        fullName: '', // Empty name
        mrn: 'INVALID-MRN',
        phone: '123', // Invalid phone
      };

      await request(app.getHttpServer())
        .post('/patients')
        .send(invalidPatient)
        .expect(400);

      // Test invalid encounter data
      const invalidEncounter = {
        patientId: 99999, // Non-existent patient
        type: 'INVALID_TYPE',
      };

      await request(app.getHttpServer())
        .post('/encounters')
        .send(invalidEncounter)
        .expect(400);
    });

    it('should handle authentication and authorization', async () => {
      // Test without authentication
      await request(app.getHttpServer())
        .get('/admin/users')
        .expect(401);

      // Test with invalid token
      await request(app.getHttpServer())
        .get('/patients')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Data Integrity and Consistency', () => {
    it('should maintain data consistency across operations', async () => {
      // Create patient
      const patientResponse = await request(app.getHttpServer())
        .post('/patients')
        .send({
          fullName: 'اختبار التكامل',
          mrn: 'INTEGRATION-001',
          phone: '0911111111',
        })
        .expect(201);

      const patient = patientResponse.body;

      // Create encounter
      const encounterResponse = await request(app.getHttpServer())
        .post('/encounters')
        .send({
          patientId: patient.id,
          type: 'OUTPATIENT',
          departmentId: 1,
        })
        .expect(201);

      const encounter = encounterResponse.body;

      // Verify patient data consistency
      const patientCheck = await request(app.getHttpServer())
        .get(`/patients/${patient.id}`)
        .expect(200);

      expect(patientCheck.body.id).toBe(patient.id);
      expect(patientCheck.body.encounters).toContain(encounter.id);

      // Delete encounter and verify consistency
      await request(app.getHttpServer())
        .delete(`/encounters/${encounter.id}`)
        .expect(200);

      const patientCheckAfter = await request(app.getHttpServer())
        .get(`/patients/${patient.id}`)
        .expect(200);

      expect(patientCheckAfter.body.encounters).not.toContain(encounter.id);
    });
  });
});
