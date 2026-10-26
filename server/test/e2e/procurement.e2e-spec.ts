import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDatabase } from '../db-reset';
import { AuthHelper } from '../auth-helper';

describe('Procurement & Supply Chain E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storeKeeperToken: string;
  let readOnlyToken: string;
  let hospitalId: number;
  let productId: number;
  let uomId: number;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const authHelper = new AuthHelper(prisma, app.get(JwtService));
    // Run only against an isolated, disposable E2E database.
    await resetDatabase(prisma);
    const hospital = await prisma.hospital.create({
      data: { code: 'PROC_HOSP', name: 'Procurement Hospital', isActive: true },
    });
    hospitalId = hospital.id;
    storeKeeperToken = (
      await authHelper.createTestUser('storekeeper', 'test-password', {
        hospitalId,
        roles: ['STORE_KEEPER'],
        permissions: ['inventory:manage'],
      })
    ).accessToken;
    readOnlyToken = (
      await authHelper.createTestUser('reader', 'test-password', {
        hospitalId,
        permissions: ['inventory:view'],
      })
    ).accessToken;
    const uom = await prisma.unitOfMeasure.create({
      data: { hospitalId, name: 'Piece', code: 'PCS' },
    });
    uomId = uom.id;
    const product = await prisma.product.create({
      data: {
        hospitalId,
        code: 'PARACETAMOL',
        name: 'Paracetamol 500mg',
        type: 'DRUG',
        baseUomId: uomId,
        costPrice: 5,
        isActive: true,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates a request and persists its tenant, quantity and UOM', async () => {
    const response = await request(app.getHttpServer())
      .post('/procurement/requests')
      .set('Authorization', `Bearer ${storeKeeperToken}`)
      .send({
        notes: 'Urgent paracetamol',
        items: [{ productId, uomId, quantity: 100 }],
      })
      .expect(201);
    const saved = await prisma.purchaseRequest.findFirstOrThrow({
      where: { hospitalId, notes: 'Urgent paracetamol' },
      include: { items: true },
    });
    expect(response.body).toMatchObject({ id: saved.id, status: 'PENDING' });
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].productId).toBe(productId);
    expect(saved.items[0].uomId).toBe(uomId);
    expect(Number(saved.items[0].quantity)).toBe(100);
    expect(Number(saved.items[0].baseQuantity)).toBe(100);
  });

  it('denies creation to a user with view permission only', async () => {
    await request(app.getHttpServer())
      .post('/procurement/requests')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ items: [{ productId, uomId, quantity: 1 }] })
      .expect(403);
  });
});
