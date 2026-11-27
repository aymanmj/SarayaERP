// server/src/archive/archive.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CorrespondencePriority,
  CorrespondenceStatus,
  CorrespondenceType,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { scanAttachmentBuffer } from '../common/security/attachment-av-scanner.service';
import {
  decryptAttachmentBuffer,
  encryptAttachmentBuffer,
} from '../common/security/attachment-crypto.util';
import type { UploadedAttachmentFile } from '../insurance/preauth-attachments';
import {
  AcknowledgeRoutingDto,
  CreateArchiveCategoryDto,
  CreateArchiveDocumentDto,
  CreateCorrespondenceDto,
  CreateDocumentVersionDto,
  RouteCorrespondenceDto,
  UpdateArchiveCategoryDto,
  UpdateArchiveDocumentDto,
  UpdateCorrespondenceDto,
} from './dto/archive.dto';

export interface ArchiveAuditMeta {
  ipAddress?: string;
  clientName?: string;
  configRoot?: string | null;
}

const MAX_ARCHIVE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_ARCHIVE_EXTS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
]);

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
};

const DEFAULT_CATEGORIES: ReadonlyArray<{
  code: string;
  name: string;
  nameEn: string;
}> = [
  {
    code: 'CAT-LIC',
    name: 'رخص واعتمادات المنشأة',
    nameEn: 'Facility Licenses & Accreditations',
  },
  {
    code: 'CAT-HR',
    name: 'الموارد البشرية والشؤون الإدارية',
    nameEn: 'HR & Administrative Documents',
  },
  {
    code: 'CAT-FIN',
    name: 'المالية والمحاسبة',
    nameEn: 'Financial & Accounting Documents',
  },
  {
    code: 'CAT-CON',
    name: 'العقود والاتفاقيات',
    nameEn: 'Contracts & Agreements',
  },
  {
    code: 'CAT-MGMT',
    name: 'القرارات والتعاميم الإدارية',
    nameEn: 'Management Decisions & Circulars',
  },
  {
    code: 'CAT-CORR',
    name: 'الصادر والوارد الرسمي',
    nameEn: 'Official Correspondence',
  },
  {
    code: 'CAT-QUAL',
    name: 'الجودة وسلامة المرضى',
    nameEn: 'Quality & Patient Safety',
  },
];

function normalizeOptional(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  private resolveArchiveRoot(overrideRoot?: string | null): string {
    return path.resolve(
      overrideRoot ||
        process.env.ARCHIVE_DOCUMENT_ROOT ||
        path.join(process.cwd(), 'uploads', 'archive'),
    );
  }

  private isInsideRoot(root: string, target: string): boolean {
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(target);
    return (
      resolvedTarget === resolvedRoot ||
      resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
    );
  }

  private async ensureDefaultCategories(hospitalId: number) {
    const count = await this.prisma.archiveCategory.count({
      where: { hospitalId },
    });
    if (count > 0) return;

    await this.prisma.archiveCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({
        hospitalId,
        code: c.code,
        name: c.name,
        nameEn: c.nameEn,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  private async scanAndPrepareEncryptedFile(
    hospitalId: number,
    actorUserId: number,
    file: UploadedAttachmentFile,
    auditMeta?: ArchiveAuditMeta,
  ) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('الملف المرفق فارغ أو غير صالح.');
    }
    if (file.buffer.length > MAX_ARCHIVE_FILE_BYTES) {
      throw new PayloadTooLargeException(
        'حجم الملف يتجاوز الحد الأقصى المسموح (25 ميجابايت).',
      );
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_ARCHIVE_EXTS.has(ext)) {
      throw new BadRequestException(
        'امتداد الملف غير مسموح. الصيغ المقبولة: PDF, JPG, PNG, WEBP, DOC/X, XLS/X, TXT.',
      );
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const avScan = await scanAttachmentBuffer(file.buffer);
    if (!avScan.clean) {
      const blockedAudit = await this.prisma.$transaction((tx) =>
        appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: actorUserId,
          action: 'SECURITY_MALWARE_BLOCKED',
          entity: 'ArchiveDocument',
          entityId: null,
          ipAddress: auditMeta?.ipAddress,
          clientName: auditMeta?.clientName,
          details: {
            originalName: path.basename(file.originalname || ''),
            sha256,
            signature: avScan.signature,
            avScanEngine: avScan.engine,
          },
        }),
      );
      publishCommittedCriticalAudit(blockedAudit);
      throw new UnprocessableEntityException(
        `تم رفض الملف لاكتشاف برمجية خبيثة (${avScan.signature ?? 'MALWARE'}).`,
      );
    }

    const encryptedBytes = encryptAttachmentBuffer(file.buffer);
    const mimeType =
      file.mimetype || EXT_TO_MIME[ext] || 'application/octet-stream';

    return {
      ext,
      sha256,
      avScan,
      encryptedBytes,
      mimeType,
      fileSize: file.buffer.length,
      originalName: path.basename(file.originalname || `document${ext}`),
    };
  }

  private writeEncryptedBytes(
    root: string,
    relativePath: string,
    encryptedBytes: Buffer,
  ): string {
    const finalPath = path.resolve(root, relativePath);
    if (!this.isInsideRoot(root, finalPath)) {
      throw new BadRequestException('مسار تخزين الملف غير صالح.');
    }
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.tmp`;
    fs.writeFileSync(tmpPath, encryptedBytes, { flag: 'wx' });
    fs.renameSync(tmpPath, finalPath);
    return finalPath;
  }

  // =========================================================================
  // 1. STATS & CATEGORIES
  // =========================================================================

  async getStats(hospitalId: number, userId: number) {
    await this.ensureDefaultCategories(hospitalId);
    const [
      totalDocuments,
      totalCategories,
      starredDocuments,
      incomingCount,
      outgoingCount,
      internalCount,
      unreadInboxCount,
    ] = await Promise.all([
      this.prisma.archiveDocument.count({
        where: { hospitalId, deletedAt: null },
      }),
      this.prisma.archiveCategory.count({
        where: { hospitalId, isActive: true },
      }),
      this.prisma.archiveDocument.count({
        where: { hospitalId, deletedAt: null, isStarred: true },
      }),
      this.prisma.correspondence.count({
        where: { hospitalId, type: CorrespondenceType.INCOMING },
      }),
      this.prisma.correspondence.count({
        where: { hospitalId, type: CorrespondenceType.OUTGOING },
      }),
      this.prisma.correspondence.count({
        where: { hospitalId, type: CorrespondenceType.INTERNAL },
      }),
      this.prisma.correspondenceRouting.count({
        where: { hospitalId, toUserId: userId, readAt: null },
      }),
    ]);

    return {
      totalDocuments,
      totalCategories,
      starredDocuments,
      incomingCount,
      outgoingCount,
      internalCount,
      unreadInboxCount,
    };
  }

  async getCategories(hospitalId: number) {
    await this.ensureDefaultCategories(hospitalId);
    return this.prisma.archiveCategory.findMany({
      where: { hospitalId, isActive: true },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            documents: { where: { deletedAt: null } },
            children: true,
          },
        },
      },
      orderBy: [{ parentId: 'asc' }, { id: 'asc' }],
    });
  }

  async createCategory(
    hospitalId: number,
    actorUserId: number,
    dto: CreateArchiveCategoryDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    if (dto.parentId) {
      const parent = await this.prisma.archiveCategory.findFirst({
        where: { id: dto.parentId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('التصنيف الأب غير موجود في هذه المنشأة.');
      }
    }

    const code = (
      dto.code?.trim() || `CAT-${Date.now().toString().slice(-5)}`
    ).toUpperCase();

    const dup = await this.prisma.archiveCategory.findFirst({
      where: { hospitalId, code },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException(`رمز التصنيف ${code} مستخدم مسبقاً.`);
    }

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const cat = await tx.archiveCategory.create({
        data: {
          hospitalId,
          name: dto.name.trim(),
          nameEn: normalizeOptional(dto.nameEn),
          parentId: dto.parentId ?? null,
          code,
          isActive: true,
        },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'ARCHIVE_CATEGORY_CREATED',
        entity: 'ArchiveCategory',
        entityId: cat.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { code: cat.code, name: cat.name },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return cat;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async updateCategory(
    hospitalId: number,
    id: number,
    actorUserId: number,
    dto: UpdateArchiveCategoryDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.archiveCategory.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('التصنيف غير موجود في هذه المنشأة.');
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('لا يمكن ربط التصنيف بنفسه كتصنيف أب.');
      }
      const parent = await this.prisma.archiveCategory.findFirst({
        where: { id: dto.parentId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('التصنيف الأب غير موجود أو غير نشط.');
      }
    }

    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const saved = await tx.archiveCategory.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.nameEn !== undefined
            ? { nameEn: normalizeOptional(dto.nameEn) }
            : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'ARCHIVE_CATEGORY_UPDATED',
        entity: 'ArchiveCategory',
        entityId: saved.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { name: saved.name },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  async deleteCategory(
    hospitalId: number,
    id: number,
    actorUserId: number,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.archiveCategory.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('التصنيف غير موجود في هذه المنشأة.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.archiveCategory.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'ARCHIVE_CATEGORY_DELETED',
        entity: 'ArchiveCategory',
        entityId: saved.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { code: saved.code, name: saved.name },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      publishCommittedCriticalAudit(auditFields);
      return saved;
    });
    return updated;
  }

  // =========================================================================
  // 2. DOCUMENTS & SECURE VERSIONED FILE STORAGE (SEC05)
  // =========================================================================

  async findAllDocuments(
    hospitalId: number,
    filter: {
      categoryId?: number;
      isStarred?: string;
      tag?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      relatedEntityType?: string;
      relatedEntityId?: number;
    },
  ) {
    const where: Prisma.ArchiveDocumentWhereInput = {
      hospitalId,
      deletedAt: null,
    };

    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.relatedEntityType) {
      where.relatedEntityType = filter.relatedEntityType;
    }
    if (filter.relatedEntityId) where.relatedEntityId = filter.relatedEntityId;
    if (filter.isStarred === 'true') where.isStarred = true;
    if (filter.isStarred === 'false') where.isStarred = false;
    if (filter.tag?.trim()) where.tags = { has: filter.tag.trim() };

    if (filter.startDate || filter.endDate) {
      where.date = {};
      if (filter.startDate) where.date.gte = new Date(filter.startDate);
      if (filter.endDate) where.date.lte = new Date(filter.endDate);
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { documentNo: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ];
    }

    return this.prisma.archiveDocument.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        _count: { select: { versions: true, correspondence: true } },
      },
      orderBy: [{ isStarred: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOneDocument(hospitalId: number, id: number) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id, hospitalId, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            createdBy: { select: { id: true, fullName: true, username: true } },
          },
        },
        correspondence: {
          orderBy: { date: 'desc' },
          select: {
            id: true,
            correspondenceNo: true,
            type: true,
            subject: true,
            date: true,
            status: true,
          },
        },
      },
    });
    if (!doc) {
      throw new NotFoundException('المستند المؤرشف غير موجود في هذه المنشأة.');
    }
    return doc;
  }

  async createDocument(
    hospitalId: number,
    actorUserId: number,
    dto: CreateArchiveDocumentDto,
    file?: UploadedAttachmentFile,
    auditMeta?: ArchiveAuditMeta,
  ) {
    if (dto.categoryId) {
      const cat = await this.prisma.archiveCategory.findFirst({
        where: { id: dto.categoryId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!cat) {
        throw new BadRequestException('التصنيف المحدد غير موجود في المنشأة.');
      }
    }

    const prepared = file
      ? await this.scanAndPrepareEncryptedFile(
          hospitalId,
          actorUserId,
          file,
          auditMeta,
        )
      : null;

    const year = new Date().getFullYear();
    const prefix = `ARC-${year}-`;
    const lockKey = `archive-doc:${hospitalId}:${year}`;
    const root = this.resolveArchiveRoot(auditMeta?.configRoot);
    let writtenPath: string | null = null;

    try {
      let committedAudit: Record<string, unknown> | null = null;
      const created = await this.prisma.$transaction(async (tx) => {
        committedAudit = null;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const last = await tx.archiveDocument.findFirst({
          where: { hospitalId, documentNo: { startsWith: prefix } },
          orderBy: { documentNo: 'desc' },
          select: { documentNo: true },
        });
        let nextNum = 1;
        if (last?.documentNo) {
          const seq = parseInt(last.documentNo.split('-').pop() || '0', 10);
          if (Number.isFinite(seq) && seq >= 1) nextNum = seq + 1;
        }
        const documentNo = `${prefix}${String(nextNum).padStart(4, '0')}`;

        let storagePath: string | null = null;
        if (prepared) {
          storagePath = `${hospitalId}/${randomUUID()}${prepared.ext}`;
          writtenPath = this.writeEncryptedBytes(
            root,
            storagePath,
            prepared.encryptedBytes,
          );
        }

        const doc = await tx.archiveDocument.create({
          data: {
            hospitalId,
            documentNo,
            title: dto.title.trim(),
            categoryId: dto.categoryId ?? null,
            description: normalizeOptional(dto.description),
            date: dto.date ? new Date(dto.date) : new Date(),
            storagePath,
            originalName: prepared?.originalName ?? null,
            mimeType: prepared?.mimeType ?? null,
            fileSize: prepared?.fileSize ?? null,
            sha256: prepared?.sha256 ?? null,
            isEncrypted: Boolean(prepared),
            tags: dto.tags ?? [],
            relatedEntityType: normalizeOptional(dto.relatedEntityType),
            relatedEntityId: dto.relatedEntityId ?? null,
            createdById: actorUserId,
          },
        });

        if (prepared && storagePath) {
          await tx.documentVersion.create({
            data: {
              hospitalId,
              documentId: doc.id,
              versionNumber: 1,
              storagePath,
              originalName: prepared.originalName,
              mimeType: prepared.mimeType,
              fileSize: prepared.fileSize,
              sha256: prepared.sha256,
              isEncrypted: true,
              notes: 'النسخة الأولى',
              createdById: actorUserId,
            },
          });
        }

        const auditFields = {
          hospitalId,
          userId: actorUserId,
          action: 'ARCHIVE_DOCUMENT_CREATED',
          entity: 'ArchiveDocument',
          entityId: doc.id,
          ipAddress: auditMeta?.ipAddress,
          clientName: auditMeta?.clientName,
          details: {
            documentNo: doc.documentNo,
            title: doc.title,
            hasFile: Boolean(prepared),
            sha256: prepared?.sha256 ?? null,
            encryptedAtRest: Boolean(prepared),
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return doc;
      });

      if (committedAudit) publishCommittedCriticalAudit(committedAudit);
      return this.findOneDocument(hospitalId, created.id);
    } catch (err) {
      if (writtenPath) {
        try {
          fs.rmSync(writtenPath, { force: true });
        } catch {
          // Ignore cleanup failure
        }
      }
      throw err;
    }
  }

  async updateDocument(
    hospitalId: number,
    id: number,
    actorUserId: number,
    dto: UpdateArchiveDocumentDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.archiveDocument.findFirst({
      where: { id, hospitalId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('المستند غير موجود في هذه المنشأة.');
    }

    if (dto.categoryId) {
      const cat = await this.prisma.archiveCategory.findFirst({
        where: { id: dto.categoryId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!cat) {
        throw new BadRequestException('التصنيف المحدد غير موجود في المنشأة.');
      }
    }

    let committedAudit: Record<string, unknown> | null = null;
    await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const saved = await tx.archiveDocument.update({
        where: { id: existing.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.categoryId !== undefined
            ? { categoryId: dto.categoryId }
            : {}),
          ...(dto.description !== undefined
            ? { description: normalizeOptional(dto.description) }
            : {}),
          ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.isStarred !== undefined ? { isStarred: dto.isStarred } : {}),
        },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'ARCHIVE_DOCUMENT_UPDATED',
        entity: 'ArchiveDocument',
        entityId: saved.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { documentNo: saved.documentNo, title: saved.title },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return this.findOneDocument(hospitalId, id);
  }

  async toggleStar(
    hospitalId: number,
    id: number,
    actorUserId: number,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.archiveDocument.findFirst({
      where: { id, hospitalId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('المستند غير موجود في هذه المنشأة.');
    }
    return this.updateDocument(
      hospitalId,
      id,
      actorUserId,
      { isStarred: !existing.isStarred },
      auditMeta,
    );
  }

  async addVersion(
    hospitalId: number,
    documentId: number,
    actorUserId: number,
    file: UploadedAttachmentFile,
    dto: CreateDocumentVersionDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id: documentId, hospitalId, deletedAt: null },
    });
    if (!doc) {
      throw new NotFoundException('المستند غير موجود في هذه المنشأة.');
    }

    const prepared = await this.scanAndPrepareEncryptedFile(
      hospitalId,
      actorUserId,
      file,
      auditMeta,
    );
    const root = this.resolveArchiveRoot(auditMeta?.configRoot);
    const storagePath = `${hospitalId}/${randomUUID()}${prepared.ext}`;
    let writtenPath: string | null = null;

    try {
      let committedAudit: Record<string, unknown> | null = null;
      const version = await this.prisma.$transaction(async (tx) => {
        committedAudit = null;
        const lastVersion = await tx.documentVersion.findFirst({
          where: { documentId: doc.id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

        writtenPath = this.writeEncryptedBytes(
          root,
          storagePath,
          prepared.encryptedBytes,
        );

        const createdVersion = await tx.documentVersion.create({
          data: {
            hospitalId,
            documentId: doc.id,
            versionNumber: nextVersion,
            storagePath,
            originalName: prepared.originalName,
            mimeType: prepared.mimeType,
            fileSize: prepared.fileSize,
            sha256: prepared.sha256,
            isEncrypted: true,
            notes: normalizeOptional(dto.notes),
            createdById: actorUserId,
          },
        });

        await tx.archiveDocument.update({
          where: { id: doc.id },
          data: {
            storagePath,
            originalName: prepared.originalName,
            mimeType: prepared.mimeType,
            fileSize: prepared.fileSize,
            sha256: prepared.sha256,
            isEncrypted: true,
          },
        });

        const auditFields = {
          hospitalId,
          userId: actorUserId,
          action: 'ARCHIVE_DOCUMENT_VERSION_ADDED',
          entity: 'DocumentVersion',
          entityId: createdVersion.id,
          ipAddress: auditMeta?.ipAddress,
          clientName: auditMeta?.clientName,
          details: {
            documentId: doc.id,
            documentNo: doc.documentNo,
            versionNumber: nextVersion,
            sha256: prepared.sha256,
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return createdVersion;
      });

      if (committedAudit) publishCommittedCriticalAudit(committedAudit);
      return version;
    } catch (err) {
      if (writtenPath) {
        try {
          fs.rmSync(writtenPath, { force: true });
        } catch {
          // Ignore cleanup failure
        }
      }
      throw err;
    }
  }

  private async decryptAndAuditStoredFile(params: {
    hospitalId: number;
    actorUserId: number;
    entity: 'ArchiveDocument' | 'DocumentVersion';
    entityId: number;
    storagePath: string | null;
    originalName: string | null;
    mimeType: string | null;
    sha256: string | null;
    auditMeta?: ArchiveAuditMeta;
  }) {
    const {
      hospitalId,
      actorUserId,
      entity,
      entityId,
      storagePath,
      originalName,
      mimeType,
      sha256,
      auditMeta,
    } = params;

    if (
      !storagePath ||
      storagePath.includes('..') ||
      path.isAbsolute(storagePath)
    ) {
      throw new ConflictException('مرجع تخزين الملف غير صالح أو غير مرفق.');
    }

    const root = this.resolveArchiveRoot(auditMeta?.configRoot);
    const target = path.resolve(root, storagePath);
    if (
      !fs.existsSync(root) ||
      !fs.existsSync(target) ||
      !this.isInsideRoot(root, target)
    ) {
      throw new ConflictException('ملف الوثيقة مفقود أو خارج نطاق التخزين.');
    }

    const realRoot = fs.realpathSync(root);
    const realTarget = fs.realpathSync(target);
    if (!this.isInsideRoot(realRoot, realTarget)) {
      throw new ConflictException('سلامة مسار الملف غير مطابقة.');
    }

    const stored = fs.readFileSync(realTarget);
    const { plaintext } = decryptAttachmentBuffer(stored);
    const actualSha = createHash('sha256').update(plaintext).digest('hex');
    if (sha256 && actualSha !== sha256) {
      throw new ConflictException('بصمة الملف المفكوك تشفيره غير مطابقة.');
    }

    const audit = await this.prisma.$transaction((tx) =>
      appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: actorUserId,
        action: 'ARCHIVE_DOCUMENT_DOWNLOADED',
        entity,
        entityId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { sha256: actualSha, sizeBytes: plaintext.length },
      }),
    );
    publishCommittedCriticalAudit(audit);

    return {
      buffer: plaintext,
      mimeType: mimeType || 'application/octet-stream',
      originalName: originalName || `archive-${entityId}`,
    };
  }

  async downloadDocument(
    hospitalId: number,
    id: number,
    actorUserId: number,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id, hospitalId, deletedAt: null },
    });
    if (!doc) {
      throw new NotFoundException('المستند غير موجود في هذه المنشأة.');
    }
    return this.decryptAndAuditStoredFile({
      hospitalId,
      actorUserId,
      entity: 'ArchiveDocument',
      entityId: doc.id,
      storagePath: doc.storagePath,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      sha256: doc.sha256,
      auditMeta,
    });
  }

  async downloadVersion(
    hospitalId: number,
    documentId: number,
    versionId: number,
    actorUserId: number,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId,
        hospitalId,
        document: { deletedAt: null },
      },
    });
    if (!version) {
      throw new NotFoundException('نسخة المستند غير موجودة في هذه المنشأة.');
    }
    return this.decryptAndAuditStoredFile({
      hospitalId,
      actorUserId,
      entity: 'DocumentVersion',
      entityId: version.id,
      storagePath: version.storagePath,
      originalName: version.originalName,
      mimeType: version.mimeType,
      sha256: version.sha256,
      auditMeta,
    });
  }

  async softDeleteDocument(
    hospitalId: number,
    id: number,
    actorUserId: number,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.archiveDocument.findFirst({
      where: { id, hospitalId, deletedAt: null },
      select: { id: true, documentNo: true, title: true },
    });
    if (!existing) {
      throw new NotFoundException('المستند غير موجود في هذه المنشأة.');
    }

    const audit = await this.prisma.$transaction(async (tx) => {
      await tx.archiveDocument.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      return appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: actorUserId,
        action: 'ARCHIVE_DOCUMENT_DELETED',
        entity: 'ArchiveDocument',
        entityId: existing.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { documentNo: existing.documentNo, title: existing.title },
      });
    });
    publishCommittedCriticalAudit(audit);
    return { deleted: true, id: existing.id };
  }

  // =========================================================================
  // 3. CORRESPONDENCE & INTERNAL ROUTING (الصادر والوارد والإحالات)
  // =========================================================================

  async findAllCorrespondence(
    hospitalId: number,
    filter: {
      type?: CorrespondenceType;
      status?: CorrespondenceStatus;
      priority?: CorrespondencePriority;
      search?: string;
    },
  ) {
    const where: Prisma.CorrespondenceWhereInput = { hospitalId };
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.priority) where.priority = filter.priority;

    if (filter.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { correspondenceNo: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { senderOrg: { contains: q, mode: 'insensitive' } },
        { receiverOrg: { contains: q, mode: 'insensitive' } },
        { referenceNo: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.correspondence.findMany({
      where,
      include: {
        document: {
          select: { id: true, documentNo: true, title: true, mimeType: true },
        },
        createdBy: { select: { id: true, fullName: true, username: true } },
        routing: {
          orderBy: { sentAt: 'desc' },
          include: {
            fromUser: { select: { id: true, fullName: true, username: true } },
            toUser: { select: { id: true, fullName: true, username: true } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  async findOneCorrespondence(hospitalId: number, id: number) {
    const item = await this.prisma.correspondence.findFirst({
      where: { id, hospitalId },
      include: {
        document: true,
        createdBy: { select: { id: true, fullName: true, username: true } },
        relatedCorrespondence: {
          select: { id: true, correspondenceNo: true, subject: true },
        },
        replies: {
          select: {
            id: true,
            correspondenceNo: true,
            subject: true,
            date: true,
          },
        },
        routing: {
          orderBy: { sentAt: 'desc' },
          include: {
            fromUser: { select: { id: true, fullName: true, username: true } },
            toUser: { select: { id: true, fullName: true, username: true } },
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('المراسلة غير موجودة في هذه المنشأة.');
    }
    return item;
  }

  async createCorrespondence(
    hospitalId: number,
    actorUserId: number,
    dto: CreateCorrespondenceDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    if (dto.documentId) {
      const doc = await this.prisma.archiveDocument.findFirst({
        where: { id: dto.documentId, hospitalId, deletedAt: null },
        select: { id: true },
      });
      if (!doc) {
        throw new BadRequestException('المستند المرتبط غير موجود في المنشأة.');
      }
    }
    if (dto.relatedCorrespondenceId) {
      const rel = await this.prisma.correspondence.findFirst({
        where: { id: dto.relatedCorrespondenceId, hospitalId },
        select: { id: true },
      });
      if (!rel) {
        throw new BadRequestException('المراسلة المرجعية غير موجودة.');
      }
    }

    const prefix =
      dto.type === CorrespondenceType.INCOMING
        ? 'IN'
        : dto.type === CorrespondenceType.OUTGOING
          ? 'OUT'
          : 'INT';
    const year = new Date().getFullYear();
    const noPrefix = `${prefix}-${year}-`;
    const lockKey = `archive-corr:${hospitalId}:${prefix}:${year}`;

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const last = await tx.correspondence.findFirst({
        where: { hospitalId, correspondenceNo: { startsWith: noPrefix } },
        orderBy: { correspondenceNo: 'desc' },
        select: { correspondenceNo: true },
      });
      let nextNum = 1;
      if (last?.correspondenceNo) {
        const seq = parseInt(last.correspondenceNo.split('-').pop() || '0', 10);
        if (Number.isFinite(seq) && seq >= 1) nextNum = seq + 1;
      }
      const correspondenceNo = `${noPrefix}${String(nextNum).padStart(4, '0')}`;

      const item = await tx.correspondence.create({
        data: {
          hospitalId,
          correspondenceNo,
          type: dto.type,
          date: dto.date ? new Date(dto.date) : new Date(),
          subject: dto.subject.trim(),
          senderName: normalizeOptional(dto.senderName),
          senderOrg: normalizeOptional(dto.senderOrg),
          receiverName: normalizeOptional(dto.receiverName),
          receiverOrg: normalizeOptional(dto.receiverOrg),
          referenceNo: normalizeOptional(dto.referenceNo),
          relatedCorrespondenceId: dto.relatedCorrespondenceId ?? null,
          priority: dto.priority ?? CorrespondencePriority.NORMAL,
          status: CorrespondenceStatus.NEW,
          notes: normalizeOptional(dto.notes),
          documentId: dto.documentId ?? null,
          createdById: actorUserId,
        },
        include: {
          document: {
            select: { id: true, documentNo: true, title: true },
          },
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'CORRESPONDENCE_CREATED',
        entity: 'Correspondence',
        entityId: item.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          correspondenceNo: item.correspondenceNo,
          type: item.type,
          subject: item.subject,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return item;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async updateCorrespondence(
    hospitalId: number,
    id: number,
    actorUserId: number,
    dto: UpdateCorrespondenceDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.correspondence.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('المراسلة غير موجودة في هذه المنشأة.');
    }
    if (dto.documentId) {
      const doc = await this.prisma.archiveDocument.findFirst({
        where: { id: dto.documentId, hospitalId, deletedAt: null },
        select: { id: true },
      });
      if (!doc) {
        throw new BadRequestException('المستند المرتبط غير موجود.');
      }
    }

    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const saved = await tx.correspondence.update({
        where: { id: existing.id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
          ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
          ...(dto.senderName !== undefined
            ? { senderName: normalizeOptional(dto.senderName) }
            : {}),
          ...(dto.senderOrg !== undefined
            ? { senderOrg: normalizeOptional(dto.senderOrg) }
            : {}),
          ...(dto.receiverName !== undefined
            ? { receiverName: normalizeOptional(dto.receiverName) }
            : {}),
          ...(dto.receiverOrg !== undefined
            ? { receiverOrg: normalizeOptional(dto.receiverOrg) }
            : {}),
          ...(dto.referenceNo !== undefined
            ? { referenceNo: normalizeOptional(dto.referenceNo) }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined
            ? { notes: normalizeOptional(dto.notes) }
            : {}),
          ...(dto.documentId !== undefined
            ? { documentId: dto.documentId }
            : {}),
        },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'CORRESPONDENCE_UPDATED',
        entity: 'Correspondence',
        entityId: saved.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          correspondenceNo: saved.correspondenceNo,
          status: saved.status,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  async deleteCorrespondence(
    hospitalId: number,
    id: number,
    actorUserId: number,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.correspondence.findFirst({
      where: { id, hospitalId },
      select: { id: true, correspondenceNo: true },
    });
    if (!existing) {
      throw new NotFoundException('المراسلة غير موجودة في هذه المنشأة.');
    }

    const audit = await this.prisma.$transaction(async (tx) => {
      await tx.correspondence.delete({ where: { id: existing.id } });
      return appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: actorUserId,
        action: 'CORRESPONDENCE_DELETED',
        entity: 'Correspondence',
        entityId: existing.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { correspondenceNo: existing.correspondenceNo },
      });
    });
    publishCommittedCriticalAudit(audit);
    return { deleted: true, id: existing.id };
  }

  async routeCorrespondence(
    hospitalId: number,
    correspondenceId: number,
    fromUserId: number,
    dto: RouteCorrespondenceDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const correspondence = await this.prisma.correspondence.findFirst({
      where: { id: correspondenceId, hospitalId },
    });
    if (!correspondence) {
      throw new NotFoundException('المراسلة غير موجودة في هذه المنشأة.');
    }

    const toUser = await this.prisma.user.findFirst({
      where: {
        id: dto.toUserId,
        hospitalId,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true, fullName: true, username: true },
    });
    if (!toUser) {
      throw new NotFoundException(
        'المستخدم المحال إليه غير موجود أو غير نشط في هذه المنشأة.',
      );
    }

    let committedAudit: Record<string, unknown> | null = null;
    const routing = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const created = await tx.correspondenceRouting.create({
        data: {
          hospitalId,
          correspondenceId,
          fromUserId,
          toUserId: dto.toUserId,
          instructions: normalizeOptional(dto.instructions),
          notes: normalizeOptional(dto.notes),
        },
        include: {
          fromUser: { select: { id: true, fullName: true, username: true } },
          toUser: { select: { id: true, fullName: true, username: true } },
        },
      });

      if (correspondence.status === CorrespondenceStatus.NEW) {
        await tx.correspondence.update({
          where: { id: correspondenceId },
          data: { status: CorrespondenceStatus.IN_PROGRESS },
        });
      }

      const auditFields = {
        hospitalId,
        userId: fromUserId,
        action: 'CORRESPONDENCE_ROUTED',
        entity: 'CorrespondenceRouting',
        entityId: created.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          correspondenceId,
          correspondenceNo: correspondence.correspondenceNo,
          toUserId: dto.toUserId,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return created;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);

    if (this.notificationsService) {
      await this.notificationsService.create(
        hospitalId,
        dto.toUserId,
        'إحالة مراسلة جديدة',
        `تمت إحالة المراسلة ${correspondence.correspondenceNo} (${correspondence.subject}) إليك للمتابعة.`,
        '/archive?tab=inbox',
      );
    }

    return routing;
  }

  async getInbox(hospitalId: number, userId: number, unreadOnly = false) {
    return this.prisma.correspondenceRouting.findMany({
      where: {
        hospitalId,
        toUserId: userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      include: {
        correspondence: {
          include: {
            document: {
              select: {
                id: true,
                documentNo: true,
                title: true,
                mimeType: true,
                originalName: true,
              },
            },
          },
        },
        fromUser: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  async acknowledgeRouting(
    hospitalId: number,
    routingId: number,
    currentUserId: number,
    dto: AcknowledgeRoutingDto,
    auditMeta?: ArchiveAuditMeta,
  ) {
    const existing = await this.prisma.correspondenceRouting.findFirst({
      where: { id: routingId, hospitalId },
      include: { correspondence: true },
    });
    if (!existing) {
      throw new NotFoundException('سجل إحالة المراسلة غير موجود.');
    }
    if (existing.toUserId !== currentUserId) {
      throw new ForbiddenException(
        'لا يمكنك تأكيد أو تحديث إحالة موجهة لمستخدم آخر.',
      );
    }

    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const saved = await tx.correspondenceRouting.update({
        where: { id: existing.id },
        data: {
          readAt: existing.readAt ?? new Date(),
          ...(dto.actionTaken !== undefined
            ? { actionTaken: normalizeOptional(dto.actionTaken) }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: normalizeOptional(dto.notes) }
            : {}),
        },
        include: {
          fromUser: { select: { id: true, fullName: true, username: true } },
          toUser: { select: { id: true, fullName: true, username: true } },
        },
      });

      if (dto.updateCorrespondenceStatus) {
        await tx.correspondence.update({
          where: { id: existing.correspondenceId },
          data: { status: dto.updateCorrespondenceStatus },
        });
      }

      const auditFields = {
        hospitalId,
        userId: currentUserId,
        action: 'CORRESPONDENCE_ROUTING_ACKNOWLEDGED',
        entity: 'CorrespondenceRouting',
        entityId: saved.id,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          correspondenceId: existing.correspondenceId,
          actionTaken: saved.actionTaken,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  async listRoutableUsers(hospitalId: number) {
    return this.prisma.user.findMany({
      where: { hospitalId, isActive: true, isDeleted: false },
      select: {
        id: true,
        fullName: true,
        username: true,
        jobRank: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }
}
