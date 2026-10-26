import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('E2E Tests - Multi-Tenant Isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns only the authenticated branch patients in both directions', async () => {
    // Run only against an isolated, disposable E2E database.
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const tokens: string[] = [];
    const patientIds: number[] = [];
    for (const branch of ['A', 'B']) {
      const organization = await prisma.organization.create({
        data: { name: `Organization ${branch}`, code: `ORG-${branch}` },
      });
      const hospital = await prisma.hospital.create({
        data: {
          name: `Branch ${branch}`,
          code: `BR-${branch}`,
          organizationId: organization.id,
        },
      });
      const staff = await auth.createTestUser(
        `user-${branch}`,
        'test-password',
        {
          hospitalId: hospital.id,
          permissions: ['patients:view'],
        },
      );
      tokens.push(staff.accessToken);
      const patient = await prisma.patient.create({
        data: {
          hospitalId: hospital.id,
          fullName: `Patient ${branch}`,
          mrn: `MRN-${branch}`,
          gender: 'MALE',
        },
      });
      patientIds.push(patient.id);
    }
    for (const [index, token] of tokens.entries()) {
      const response = await request(app.getHttpServer())
        .get('/patients')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = response.body as { items: { id: number }[] };
      const ids = body.items.map((patient) => patient.id);
      expect(ids).toContain(patientIds[index]);
      expect(ids).not.toContain(patientIds[1 - index]);
    }
  });
});
