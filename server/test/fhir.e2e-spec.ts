import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './db-reset';
import { JwtService } from '@nestjs/jwt';
import { FhirService } from '../src/integration/fhir/fhir.service';
import { AuthHelper } from './auth-helper';

describe('FHIR & SMART App Launch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exports a withdrawn prescription with cancelled status', async () => {
    const { user } = await new AuthHelper(
      prisma,
      app.get(JwtService),
    ).createTestUser();
    const { hospitalId } = user;
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        fullName: 'Synthetic cancelled prescription',
        mrn: 'FHIR-RX',
      },
    });
    const encounter = await prisma.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'OPD' },
    });
    const prescription = await prisma.prescription.create({
      data: {
        hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        doctorId: user.id,
        status: 'CANCELLED',
      },
    });
    expect(
      await app
        .get(FhirService)
        .getMedicationRequest(prescription.id, patient.id),
    ).toMatchObject({ resourceType: 'MedicationRequest', status: 'cancelled' });
  });

  describe('SMART on FHIR Discovery', () => {
    it('should return SMART configuration from .well-known endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/fhir/.well-known/smart-configuration')
        .expect(200);

      expect(response.body).not.toHaveProperty('authorization_endpoint');
      expect(response.body).toHaveProperty('token_endpoint');
      expect(response.body.grant_types_supported).toEqual([
        'client_credentials',
      ]);
      expect(response.body.capabilities).toContain(
        'client-confidential-symmetric',
      );
      expect(response.body.capabilities).not.toContain('launch-standalone');
    });

    it('should return basic Capability Statement', async () => {
      const response = await request(app.getHttpServer())
        .get('/fhir/metadata')
        .expect(200);

      expect(response.body.resourceType).toEqual('CapabilityStatement');
      expect(response.body.status).toEqual('active');
    });
  });

  describe('Patient Context Isolation (Authorization)', () => {
    it('should reject unauthenticated access to clinical data', async () => {
      return request(app.getHttpServer()).get('/fhir/Patient/1').expect(401); // Requires Bearer token
    });

    it('should block access if patient context does not match requested resource', async () => {
      // 1. Create two test patients
      const org = await prisma.organization.create({
        data: { code: 'TEST-ORG', name: 'Test Org', type: 'HOSPITAL' },
      });
      const hospital = await prisma.hospital.create({
        data: {
          code: 'TEST-HOSP',
          name: 'Test Hospital',
          organizationId: org.id,
        },
      });
      const patientA = await prisma.patient.create({
        data: {
          hospitalId: hospital.id,
          fullName: 'John Doe',
          mrn: 'MRN00A',
        },
      });
      const patientB = await prisma.patient.create({
        data: {
          hospitalId: hospital.id,
          fullName: 'Jane Smith',
          mrn: 'MRN00B',
        },
      });

      // 2. Generate a token scoped explicitly for Patient A
      // Using fhirAuthService logic directly or mocking. We can bypass by using the actual endpoint.
      // But we need a valid client and code. To simplify E2E, we can directly generate a token using JwtService
      // with the SMART payload structure format our Guard expects.

      const jwtService = app.get(JwtService);
      const tokenForPatientA = jwtService.sign(
        {
          sub: 'ext-app-client',
          aud: 'saraya-fhir',
          patient: patientA.id.toString(),
          hospitalId: hospital.id,
          scope: 'patient/Patient.read',
        },
        { secret: process.env.JWT_SECRET },
      );

      // 3. Request data for Patient A (Should succeed)
      await request(app.getHttpServer())
        .get(`/fhir/Patient/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenForPatientA}`)
        .expect(200);

      // 4. Request data for Patient B with Patient A's token (Should be Forbidden!)
      const response = await request(app.getHttpServer())
        .get(`/fhir/Patient/${patientB.id}`)
        .set('Authorization', `Bearer ${tokenForPatientA}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
      expect(response.body.message).toContain('prohibits cross-patient access');
    });
  });
});
