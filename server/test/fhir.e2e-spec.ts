import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './db-reset';

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

  describe('SMART on FHIR Discovery', () => {
    it('should return SMART configuration from .well-known endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/fhir/.well-known/smart-configuration')
        .expect(200);

      expect(response.body).toHaveProperty('authorization_endpoint');
      expect(response.body).toHaveProperty('token_endpoint');
      expect(response.body.capabilities).toContain('launch-standalone');
      expect(response.body.capabilities).toContain('context-standalone-patient');
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
      return request(app.getHttpServer())
        .get('/fhir/Patient/1')
        .expect(401); // Requires Bearer token
    });

    it('should block access if patient context does not match requested resource', async () => {
      // 1. Create two test patients
      const hospital = await prisma.hospital.create({ data: { name: 'Test Hospital' } });
      const org = await prisma.organization.create({ data: { name: 'Test Org', type: 'HOSPITAL' } });
      const patientA = await prisma.patient.create({
        data: {
          hospitalId: hospital.id,
          firstName: 'John',
          lastName: 'Doe',
          mrn: 'MRN00A',
        },
      });
      const patientB = await prisma.patient.create({
        data: {
          hospitalId: hospital.id,
          firstName: 'Jane',
          lastName: 'Smith',
          mrn: 'MRN00B',
        },
      });

      // 2. Generate a token scoped explicitly for Patient A
      // Using fhirAuthService logic directly or mocking. We can bypass by using the actual endpoint.
      // But we need a valid client and code. To simplify E2E, we can directly generate a token using JwtService 
      // with the SMART payload structure format our Guard expects.
      
      const jwtService = app.get('JwtService'); // From imports, assuming global
      const tokenForPatientA = jwtService.sign({
        sub: 'ext-app-client',
        aud: 'saraya-fhir',
        smartContext: { patient: patientA.id.toString() },
        scope: 'patient/Patient.read',
      });

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
