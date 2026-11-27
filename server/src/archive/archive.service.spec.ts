// server/src/archive/archive.service.spec.ts
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { ArchiveService } from './archive.service';
import { buildEicarTestSignature } from '../common/security/attachment-av-scanner.service';

interface MockPrismaShape {
  archiveCategory: {
    count: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  archiveDocument: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  documentVersion: {
    create: jest.Mock;
  };
  correspondence: {
    findFirst: jest.Mock;
  };
  user: {
    findFirst: jest.Mock;
  };
  auditLog: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
}

describe('ArchiveService (SEC05 & Multi-Tenancy)', () => {
  const prevEnv = process.env.ATTACHMENT_ENCRYPTION_KEY;
  let tempRoot: string;

  beforeAll(() => {
    process.env.ATTACHMENT_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('hex');
  });

  afterAll(() => {
    if (prevEnv !== undefined) process.env.ATTACHMENT_ENCRYPTION_KEY = prevEnv;
    else delete process.env.ATTACHMENT_ENCRYPTION_KEY;
  });

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saraya-arc-unit-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function createService() {
    const loggedAudits: Array<{ hospitalId?: number; action?: string }> = [];
    const prisma: MockPrismaShape = {
      archiveCategory: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 7 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, code: 'CAT-LIC', name: 'رخص' }]),
        findFirst: jest.fn(),
      },
      archiveDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      documentVersion: {
        create: jest.fn(),
      },
      correspondence: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) => {
            loggedAudits.push(
              args.data as { hospitalId?: number; action?: string },
            );
            return Promise.resolve({ id: 1, ...args.data });
          }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (cb: (tx: MockPrismaShape) => Promise<unknown>) => cb(prisma),
    );
    const notifications = {
      create: jest.fn(),
    } as unknown as NotificationsService;
    return {
      service: new ArchiveService(
        prisma as unknown as PrismaService,
        notifications,
      ),
      prisma,
      notifications,
      loggedAudits,
    };
  }

  it('auto-seeds default hospital categories when none exist', async () => {
    const { service, prisma } = createService();
    const cats = await service.getCategories(5);
    expect(prisma.archiveCategory.createMany).toHaveBeenCalledTimes(1);
    expect(cats).toHaveLength(1);
  });

  it('rejects EICAR malware payload and logs SECURITY_MALWARE_BLOCKED audit', async () => {
    const { service, loggedAudits } = createService();
    const eicarBuffer = Buffer.from(buildEicarTestSignature(), 'utf8');

    await expect(
      service.createDocument(
        5,
        10,
        { title: 'ملف مصاب' },
        {
          originalname: 'bad.pdf',
          mimetype: 'application/pdf',
          buffer: eicarBuffer,
          size: eicarBuffer.length,
        },
        { configRoot: tempRoot },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(loggedAudits).toHaveLength(1);
    expect(loggedAudits[0].hospitalId).toBe(5);
    expect(loggedAudits[0].action).toBe('SECURITY_MALWARE_BLOCKED');
  });

  it('encrypts uploaded document on disk with SRYENC1 magic header and decrypts intact', async () => {
    const { service, prisma } = createService();
    const sampleBytes = Buffer.from('%PDF-1.4 Saraya Secret Contract', 'utf8');

    let savedDoc: {
      id: number;
      storagePath: string | null;
      documentNo: string;
      [key: string]: unknown;
    } | null = null;
    prisma.archiveDocument.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        savedDoc = {
          id: 77,
          storagePath: (data.storagePath as string | null) ?? null,
          documentNo: String(data.documentNo),
          ...data,
          deletedAt: null,
          category: null,
          createdBy: { id: 10, fullName: 'Admin', username: 'admin' },
          versions: [],
          correspondence: [],
        };
        return Promise.resolve(savedDoc);
      },
    );
    prisma.archiveDocument.findFirst.mockImplementation(() =>
      Promise.resolve(savedDoc),
    );

    const created = await service.createDocument(
      5,
      10,
      { title: 'عقد صيانة' },
      {
        originalname: 'contract.pdf',
        mimetype: 'application/pdf',
        buffer: sampleBytes,
        size: sampleBytes.length,
      },
      { configRoot: tempRoot },
    );

    expect(created.documentNo).toBe('ARC-2026-0001');
    const diskPath = path.join(tempRoot, created.storagePath!);
    const diskBytes = fs.readFileSync(diskPath);
    expect(diskBytes.subarray(0, 8).toString('utf8')).toBe('SRYENC1\0');
    expect(diskBytes.includes(sampleBytes)).toBe(false);

    const downloaded = await service.downloadDocument(5, 77, 10, {
      configRoot: tempRoot,
    });
    expect(downloaded.buffer.equals(sampleBytes)).toBe(true);
  });

  it('rejects cross-hospital correspondence routing targets with NotFoundException', async () => {
    const { service, prisma } = createService();
    prisma.correspondence.findFirst.mockResolvedValue({
      id: 12,
      hospitalId: 5,
      correspondenceNo: 'IN-2026-0001',
      subject: 'كتاب رسمي',
      status: 'NEW',
    });
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.routeCorrespondence(5, 12, 10, { toUserId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
