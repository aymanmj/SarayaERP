// server/test/e2e/archive-dms-batch45.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { buildEicarTestSignature } from '../../src/common/security/attachment-av-scanner.service';

interface CategoryDto {
  id: number;
  code: string;
  parentId: number | null;
}

interface ArchiveDocDto {
  id: number;
  documentNo: string;
  storagePath: string;
  isEncrypted: boolean;
  versions: Array<{ id: number; versionNumber: number }>;
}

interface VersionDto {
  id: number;
  versionNumber: number;
}

interface CorrespondenceDto {
  id: number;
  correspondenceNo: string;
}

interface RoutingDto {
  id: number;
  readAt: string | null;
  actionTaken: string | null;
}

describe('Batch 45 Phase 4 — Electronic Archiving & Correspondence DMS (SEC05, Versioning, Routing & Tenant Isolation)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;
  let tempRoot: string;
  let prevRoot: string | undefined;

  beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saraya-archive-e2e-'));
    prevRoot = process.env.ARCHIVE_DOCUMENT_ROOT;
    process.env.ARCHIVE_DOCUMENT_ROOT = tempRoot;

    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
    auth = new AuthHelper(db, app.get(JwtService));
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prevRoot !== undefined) process.env.ARCHIVE_DOCUMENT_ROOT = prevRoot;
    else delete process.env.ARCHIVE_DOCUMENT_ROOT;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('supports default categories, SEC05 encrypted document upload & versioning, EICAR rejection, correspondence routing + inbox + notifications, and cross-hospital isolation', async () => {
    const perms = [
      'archive:view',
      'archive:manage',
      'archive:correspondence:route',
      'archive:delete',
    ];

    const archivist = await auth.createTestUser('b45-archivist', 'synthetic', {
      permissions: perms,
    });
    const hospitalId = archivist.user.hospitalId;

    const recipient = await auth.createTestUser('b45-director', 'synthetic', {
      hospitalId,
      permissions: ['archive:view', 'archive:correspondence:route'],
    });

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_ARC_B_${Date.now()}`,
        name: 'Other Hospital Archive B',
        isActive: true,
      },
    });
    const foreignArchivist = await auth.createTestUser(
      'b45-foreign-arch',
      'synthetic',
      {
        hospitalId: otherHospital.id,
        permissions: perms,
      },
    );

    const server = app.getHttpServer();

    // 1. Lazy auto-seed default categories
    const catsRes = await request(server)
      .get('/archive/categories')
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .expect(200);
    const categories = catsRes.body as CategoryDto[];
    expect(categories.length).toBeGreaterThanOrEqual(7);
    const licCat = categories.find((c) => c.code === 'CAT-LIC');
    expect(licCat).toBeDefined();

    // Create custom subcategory
    const subCatRes = await request(server)
      .post('/archive/categories')
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .send({
        name: 'تراخيص الأشعة',
        code: 'CAT-RAD-SUB',
        parentId: licCat!.id,
      })
      .expect(201);
    const subCat = subCatRes.body as CategoryDto;
    expect(subCat.parentId).toBe(licCat!.id);

    // 2. Upload encrypted PDF document (v1)
    const v1Bytes = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Title (Hospital Ministry License v1) >> endobj',
      'utf8',
    );
    const createDocRes = await request(server)
      .post('/archive/documents')
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .field('title', 'ترخيص وزارة الصحة للمستشفى')
      .field('categoryId', String(licCat!.id))
      .field('tags', 'ترخيص,رسمي')
      .attach('file', v1Bytes, {
        filename: 'license-v1.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const doc = createDocRes.body as ArchiveDocDto;
    const docId = doc.id;
    expect(doc.documentNo).toMatch(/^ARC-\d{4}-0001$/);
    expect(doc.isEncrypted).toBe(true);
    expect(doc.versions).toHaveLength(1);

    // Verify ciphertext at rest on disk
    const storedPath = path.join(tempRoot, doc.storagePath);
    const onDisk = fs.readFileSync(storedPath);
    expect(onDisk.subarray(0, 8).toString('utf8')).toBe('SRYENC1\0');
    expect(onDisk.includes(v1Bytes)).toBe(false);

    // Download & verify plaintext match
    const dlV1 = await request(server)
      .get(`/archive/documents/${docId}/download`)
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .expect(200);
    expect(Buffer.from(dlV1.body as Uint8Array).equals(v1Bytes)).toBe(true);

    // 3. Upload v2 version
    const v2Bytes = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Title (Hospital Ministry License v2 Renewed) >> endobj',
      'utf8',
    );
    const addVerRes = await request(server)
      .post(`/archive/documents/${docId}/versions`)
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .field('notes', 'النسخة المجددة 2026')
      .attach('file', v2Bytes, {
        filename: 'license-v2.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const v2 = addVerRes.body as VersionDto;
    expect(v2.versionNumber).toBe(2);

    const dlV2 = await request(server)
      .get(`/archive/documents/${docId}/versions/${v2.id}/download`)
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .expect(200);
    expect(Buffer.from(dlV2.body as Uint8Array).equals(v2Bytes)).toBe(true);

    // 4. Reject EICAR malware payload
    const eicarBytes = Buffer.from(buildEicarTestSignature(), 'utf8');
    await request(server)
      .post('/archive/documents')
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .field('title', 'مرفق مصاب')
      .attach('file', eicarBytes, {
        filename: 'infected.pdf',
        contentType: 'application/pdf',
      })
      .expect(422);

    // 5. Register Incoming Correspondence linked to Document
    const corrRes = await request(server)
      .post('/archive/correspondence')
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .send({
        type: 'INCOMING',
        subject: 'كتاب تجديد الاعتماد الصحي السنوي',
        senderOrg: 'وزارة الصحة',
        senderName: 'مكتب التراخيص الطبية',
        referenceNo: 'MOH-2026-884',
        priority: 'URGENT',
        documentId: docId,
      })
      .expect(201);

    const corr = corrRes.body as CorrespondenceDto;
    const corrId = corr.id;
    expect(corr.correspondenceNo).toMatch(/^IN-\d{4}-0001$/);

    // 6. Route correspondence to recipient user in same hospital
    const routeRes = await request(server)
      .post(`/archive/correspondence/${corrId}/route`)
      .set('Authorization', `Bearer ${archivist.accessToken}`)
      .send({
        toUserId: recipient.user.id,
        instructions: 'يرجى المراجعة والاعتماد خلال 48 ساعة',
      })
      .expect(201);
    const routing = routeRes.body as RoutingDto;
    const routingId = routing.id;

    // Verify notification created for recipient
    const notif = await db.notification.findFirst({
      where: { hospitalId, userId: recipient.user.id },
      orderBy: { id: 'desc' },
    });
    expect(notif).toBeTruthy();
    expect(notif?.link).toBe('/archive?tab=inbox');

    // Recipient checks inbox & acknowledges
    const inboxRes = await request(server)
      .get('/archive/correspondence/routing/inbox?unreadOnly=true')
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(200);
    const inbox = inboxRes.body as RoutingDto[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe(routingId);

    const ackRes = await request(server)
      .patch(`/archive/correspondence/routing/${routingId}/acknowledge`)
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .send({
        actionTaken: 'تم الاطلاع وإحالة النسخة للشؤون القانونية',
        updateCorrespondenceStatus: 'CLOSED',
      })
      .expect(200);
    const acked = ackRes.body as RoutingDto;
    expect(acked.readAt).toBeTruthy();
    expect(acked.actionTaken).toContain('للشؤون القانونية');

    // 7. Cross-hospital isolation check
    await request(server)
      .get(`/archive/documents/${docId}`)
      .set('Authorization', `Bearer ${foreignArchivist.accessToken}`)
      .expect(404);

    await request(server)
      .get(`/archive/documents/${docId}/download`)
      .set('Authorization', `Bearer ${foreignArchivist.accessToken}`)
      .expect(404);

    await request(server)
      .post(`/archive/correspondence/${corrId}/route`)
      .set('Authorization', `Bearer ${foreignArchivist.accessToken}`)
      .send({ toUserId: foreignArchivist.user.id })
      .expect(404);
  });
});
