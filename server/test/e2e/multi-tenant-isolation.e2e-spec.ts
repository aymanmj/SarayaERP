import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('E2E Tests - Multi-Tenant Isolation', () => {
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
    await prismaService.userHospitalAccess.deleteMany();
    await prismaService.userRole.deleteMany();
    await prismaService.user.deleteMany();
    await prismaService.hospital.deleteMany();
    await prismaService.organization.deleteMany();
  });

  describe('Tenant Data Isolation (Patients)', () => {
    it('users from different branches should not see each others data', async () => {
      // 1. Create Organization A & Branch 1
      const orgA = await prismaService.organization.create({
        data: {
          name: 'Org A',
          code: 'ORG-A',
        },
      });
      const branch1 = await prismaService.hospital.create({
        data: {
          name: 'Branch 1',
          code: 'BR-1',
          organizationId: orgA.id,
        },
      });

      // 2. Create Organization B & Branch 2
      const orgB = await prismaService.organization.create({
        data: {
          name: 'Org B',
          code: 'ORG-B',
        },
      });
      const branch2 = await prismaService.hospital.create({
        data: {
          name: 'Branch 2',
          code: 'BR-2',
          organizationId: orgB.id,
        },
      });

      // 3. Create Users and assign them
      const user1 = await prismaService.user.create({
        data: {
          username: 'user1',
          password: 'Password123!',
          fullName: 'User One',
          isActive: true,
          defaultHospitalId: branch1.id,
        },
      });
      await prismaService.userHospitalAccess.create({
        data: { userId: user1.id, hospitalId: branch1.id },
      });

      const user2 = await prismaService.user.create({
        data: {
          username: 'user2',
          password: 'Password123!',
          fullName: 'User Two',
          isActive: true,
          defaultHospitalId: branch2.id,
        },
      });
      await prismaService.userHospitalAccess.create({
        data: { userId: user2.id, hospitalId: branch2.id },
      });

      // 4. Login User 1
      const loginRes1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'user1', password: 'Password123!' })
        .expect(200);
      const token1 = loginRes1.body.accessToken;

      // 5. Login User 2
      const loginRes2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'user2', password: 'Password123!' })
        .expect(200);
      const token2 = loginRes2.body.accessToken;

      // 6. User 1 creates a Patient
      const patientData = {
        fullName: 'Patient Branch 1',
        mrn: 'MRN-B1-001',
        phone: '0910000001',
        gender: 'MALE',
      };
      await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${token1}`)
        .send(patientData)
        .expect(201);

      // 7. User 1 fetches patients -> should see the patient
      const res1 = await request(app.getHttpServer())
        .get('/patients')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      expect(res1.body.length).toBeGreaterThanOrEqual(1);
      expect(res1.body[0].fullName).toBe('Patient Branch 1');

      // 8. User 2 fetches patients -> should NOT see User 1's patient
      const res2 = await request(app.getHttpServer())
        .get('/patients')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
      
      const foundPatient = res2.body.find((p: any) => p.mrn === 'MRN-B1-001');
      expect(foundPatient).toBeUndefined();
    });
  });
});


