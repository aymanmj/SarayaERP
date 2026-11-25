import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { scanAttachmentBuffer } from '../common/security/attachment-av-scanner.service';
import {
  decryptAttachmentBuffer,
  encryptAttachmentBuffer,
} from '../common/security/attachment-crypto.util';

export const MAX_PREAUTH_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ACTIVE_PREAUTH_ATTACHMENTS = 20;

export const PREAUTH_ATTACHMENT_CATEGORIES = [
  'MEDICAL_REPORT',
  'LAB_RESULT',
  'IMAGING',
  'PRESCRIPTION',
  'REFERRAL',
  'ID_DOCUMENT',
  'OTHER',
] as const;

export type PreAuthAttachmentCategory =
  (typeof PREAUTH_ATTACHMENT_CATEGORIES)[number];

export interface UploadedAttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type PreAuthAttachmentUploadInput = {
  category: string;
  title?: string;
};

export type PreAuthAttachmentRetireInput = {
  reason: string;
};

export type PreAuthAttachmentContext = {
  hospitalId: number;
  userId: number;
  preAuthId: number;
  configRoot?: string | null;
};

const ATTACHMENT_SELECT = {
  id: true,
  hospitalId: true,
  preAuthId: true,
  category: true,
  title: true,
  originalFileName: true,
  contentType: true,
  sizeBytes: true,
  sha256: true,
  storageKey: true,
  uploadedById: true,
  createdAt: true,
  retiredAt: true,
  retiredById: true,
  retireReason: true,
  uploadedBy: { select: { id: true, fullName: true, username: true } },
  retiredBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.PreAuthorizationAttachmentSelect;

export function resolveAttachmentRoot(configRoot?: string | null): string {
  const configured =
    configRoot?.trim() ||
    process.env.INSURANCE_ATTACHMENT_ROOT?.trim() ||
    'uploads/insurance';
  return path.resolve(configured);
}

function normalizeForContainment(target: string): string {
  return process.platform === 'win32' ? target.toLowerCase() : target;
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const rel = path.relative(
    normalizeForContainment(rootPath),
    normalizeForContainment(targetPath),
  );
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function detectContentType(buf: Buffer): {
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png';
  ext: 'pdf' | 'jpg' | 'png';
} {
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return { contentType: 'application/pdf', ext: 'pdf' };
  }

  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { contentType: 'image/png', ext: 'png' };
  }

  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return { contentType: 'image/jpeg', ext: 'jpg' };
  }

  throw new BadRequestException(
    'محتوى الملف غير مدعوم؛ يُسمح فقط بملفات PDF أو JPEG أو PNG',
  );
}

export function sanitizeFileName(name: string, ext: string): string {
  const base = (name ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200);
  if (!cleaned) {
    return `attachment.${ext}`;
  }
  return cleaned;
}

function safeUnlink(filePath: string) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup after rejected DB persistence
  }
}

async function lockPendingPreAuth(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  preAuthId: number,
) {
  const rows = await tx.$queryRaw<Array<{ id: number; status: string }>>`
    SELECT id, status FROM "PreAuthorization"
    WHERE id = ${preAuthId} AND "hospitalId" = ${hospitalId}
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new NotFoundException('طلب الموافقة المسبقة غير موجود');
  }
  if (rows[0].status !== 'PENDING') {
    throw new ConflictException(
      'لا يمكن تعديل مرفقات الموافقة المسبقة بعد البت في الطلب',
    );
  }
}

export async function listPreAuthAttachments(
  prisma: PrismaClient,
  hospitalId: number,
  preAuthId: number,
) {
  const preAuth = await prisma.preAuthorization.findFirst({
    where: { id: preAuthId, hospitalId },
    select: { id: true },
  });
  if (!preAuth) {
    throw new NotFoundException('طلب الموافقة المسبقة غير موجود');
  }

  return prisma.preAuthorizationAttachment.findMany({
    where: { hospitalId, preAuthId },
    select: ATTACHMENT_SELECT,
    orderBy: [
      { retiredAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  });
}

export async function uploadPreAuthAttachment(
  prisma: PrismaClient,
  ctx: PreAuthAttachmentContext,
  file: UploadedAttachmentFile | undefined,
  input: PreAuthAttachmentUploadInput,
) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('ملف المرفق مطلوب');
  }
  if (
    file.buffer.length <= 0 ||
    file.buffer.length > MAX_PREAUTH_ATTACHMENT_BYTES ||
    file.size > MAX_PREAUTH_ATTACHMENT_BYTES
  ) {
    if (file.buffer.length === 0) {
      throw new BadRequestException('ملف المرفق فارغ');
    }
    throw new PayloadTooLargeException(
      'حجم المرفق يتجاوز الحد الأقصى المسموح به (10 ميجابايت)',
    );
  }

  if (
    !PREAUTH_ATTACHMENT_CATEGORIES.includes(
      input.category as PreAuthAttachmentCategory,
    )
  ) {
    throw new BadRequestException('تصنيف المرفق غير صالح');
  }

  const trimmedTitle =
    typeof input.title === 'string' && input.title.trim().length > 0
      ? input.title.trim()
      : null;
  if (trimmedTitle && trimmedTitle.length > 200) {
    throw new BadRequestException('عنوان المرفق يجب ألا يتجاوز 200 حرف');
  }

  const detected = detectContentType(file.buffer);
  const declaredType = (file.mimetype ?? '').trim().toLowerCase();
  if (declaredType !== detected.contentType) {
    throw new BadRequestException(
      'نوع الملف المعلن لا يطابق بصمة المحتوى الفعلية',
    );
  }

  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  const originalFileName = sanitizeFileName(file.originalname, detected.ext);

  // SEC05: Mandatory antivirus/malware scan BEFORE writing any bytes to disk
  const avScan = await scanAttachmentBuffer(file.buffer);
  if (avScan.infected) {
    const blockedAudit = await prisma.$transaction(async (tx) =>
      appendChainedAuditInTransaction(tx, {
        hospitalId: ctx.hospitalId,
        userId: ctx.userId,
        entity: 'PreAuthorizationAttachment',
        entityId: ctx.preAuthId,
        action: 'SECURITY_MALWARE_BLOCKED',
        details: {
          preAuthId: ctx.preAuthId,
          originalFileName,
          contentType: detected.contentType,
          sizeBytes: file.buffer.length,
          sha256,
          signature: avScan.signature,
          avScanEngine: avScan.engine,
        },
      }),
    );
    publishCommittedCriticalAudit(blockedAudit);
    throw new UnprocessableEntityException(
      `تم رفض الملف المرفق لاكتشاف برمجية خبيثة أو توقيع فيروسي (${avScan.signature ?? 'MALWARE'}).`,
    );
  }

  const storageKey = `${ctx.hospitalId}/preauth/${ctx.preAuthId}/${randomUUID()}.${detected.ext}`;

  const root = resolveAttachmentRoot(ctx.configRoot);
  const finalPath = path.resolve(root, storageKey);
  if (!isWithinRoot(root, finalPath)) {
    throw new BadRequestException('مسار حفظ المرفق غير صالح');
  }

  const tmpPath = `${finalPath}.tmp`;
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  // SEC05: Encrypt attachment bytes at rest (AES-256-GCM) before persisting to disk
  const encryptedBytes = encryptAttachmentBuffer(file.buffer);
  fs.writeFileSync(tmpPath, encryptedBytes, { flag: 'wx' });

  let movedToFinal = false;
  try {
    fs.renameSync(tmpPath, finalPath);
    movedToFinal = true;

    return await prisma.$transaction(
      async (tx) => {
        await lockPendingPreAuth(tx, ctx.hospitalId, ctx.preAuthId);

        const activeUser = await tx.user.findFirst({
          where: {
            id: ctx.userId,
            hospitalId: ctx.hospitalId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!activeUser) {
          throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
        }

        const activeCount = await tx.preAuthorizationAttachment.count({
          where: {
            hospitalId: ctx.hospitalId,
            preAuthId: ctx.preAuthId,
            retiredAt: null,
          },
        });
        if (activeCount >= MAX_ACTIVE_PREAUTH_ATTACHMENTS) {
          throw new ConflictException(
            `تم بلوغ الحد الأقصى للمرفقات النشطة (${MAX_ACTIVE_PREAUTH_ATTACHMENTS}) لهذا الطلب`,
          );
        }

        const duplicate = await tx.preAuthorizationAttachment.findFirst({
          where: {
            preAuthId: ctx.preAuthId,
            sha256,
            retiredAt: null,
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(
            'هذا المرفق موجود مسبقًا ضمن الطلب النشط',
          );
        }

        const created = await tx.preAuthorizationAttachment.create({
          data: {
            hospitalId: ctx.hospitalId,
            preAuthId: ctx.preAuthId,
            category: input.category,
            title: trimmedTitle,
            originalFileName,
            contentType: detected.contentType,
            sizeBytes: file.buffer.length,
            sha256,
            storageKey,
            uploadedById: ctx.userId,
          },
          select: ATTACHMENT_SELECT,
        });

        await appendChainedAuditInTransaction(tx, {
          hospitalId: ctx.hospitalId,
          userId: ctx.userId,
          entity: 'PreAuthorizationAttachment',
          entityId: created.id,
          action: 'UPLOAD_PREAUTH_ATTACHMENT',
          details: {
            preAuthId: ctx.preAuthId,
            category: input.category,
            contentType: detected.contentType,
            sizeBytes: file.buffer.length,
            sha256,
            avScanStatus: 'CLEAN',
            avScanEngine: avScan.engine,
            avScanDurationMs: avScan.durationMs,
            encryptedAtRest: true,
            cipher: 'AES-256-GCM',
          },
        });

        return created;
      },
      { maxWait: 10000, timeout: 30000 },
    );
  } catch (err) {
    if (movedToFinal) {
      safeUnlink(finalPath);
    } else {
      safeUnlink(tmpPath);
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('هذا المرفق موجود مسبقًا ضمن الطلب النشط');
    }
    throw err;
  }
}

export async function readPreAuthAttachment(
  prisma: PrismaClient,
  ctx: PreAuthAttachmentContext & { attachmentId: number },
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const row = await prisma.preAuthorizationAttachment.findFirst({
    where: {
      id: ctx.attachmentId,
      hospitalId: ctx.hospitalId,
      preAuthId: ctx.preAuthId,
    },
  });
  if (!row) {
    throw new NotFoundException('المرفق المطلوب غير موجود');
  }

  if (
    !row.storageKey ||
    row.storageKey.includes('..') ||
    path.isAbsolute(row.storageKey)
  ) {
    throw new ConflictException('سلامة المرفق غير مطابقة');
  }

  const root = resolveAttachmentRoot(ctx.configRoot);
  const target = path.resolve(root, row.storageKey);
  if (
    !fs.existsSync(root) ||
    !fs.existsSync(target) ||
    !isWithinRoot(root, target)
  ) {
    throw new ConflictException('سلامة المرفق غير مطابقة');
  }

  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(target);
  if (!isWithinRoot(realRoot, realTarget)) {
    throw new ConflictException('سلامة المرفق غير مطابقة');
  }

  const stat = fs.statSync(realTarget);
  if (!stat.isFile()) {
    throw new ConflictException('سلامة المرفق غير مطابقة');
  }

  const rawStored = fs.readFileSync(realTarget);
  const { plaintext: buffer } = decryptAttachmentBuffer(rawStored);
  const actualSha256 = createHash('sha256').update(buffer).digest('hex');
  if (buffer.length !== row.sizeBytes || actualSha256 !== row.sha256) {
    throw new ConflictException('سلامة المرفق غير مطابقة');
  }

  await prisma.$transaction(async (tx) => {
    await appendChainedAuditInTransaction(tx, {
      hospitalId: ctx.hospitalId,
      userId: ctx.userId,
      entity: 'PreAuthorizationAttachment',
      entityId: row.id,
      action: 'DOWNLOAD_PREAUTH_ATTACHMENT',
      details: {
        preAuthId: ctx.preAuthId,
        sha256: row.sha256,
        sizeBytes: row.sizeBytes,
      },
    });
  });

  return {
    buffer,
    contentType: row.contentType,
    fileName: row.originalFileName,
  };
}

export async function retirePreAuthAttachment(
  prisma: PrismaClient,
  ctx: Omit<PreAuthAttachmentContext, 'configRoot'>,
  attachmentId: number,
  input: PreAuthAttachmentRetireInput,
) {
  const reason = (input.reason ?? '').trim();
  if (reason.length < 5 || reason.length > 1000) {
    throw new BadRequestException(
      'يلزم إدخال سبب واضح لسحب المرفق (5 إلى 1000 حرف)',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      await lockPendingPreAuth(tx, ctx.hospitalId, ctx.preAuthId);

      const activeUser = await tx.user.findFirst({
        where: {
          id: ctx.userId,
          hospitalId: ctx.hospitalId,
          isActive: true,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!activeUser) {
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      }

      const existing = await tx.preAuthorizationAttachment.findFirst({
        where: {
          id: attachmentId,
          hospitalId: ctx.hospitalId,
          preAuthId: ctx.preAuthId,
        },
      });
      if (!existing) {
        throw new NotFoundException('المرفق المطلوب غير موجود');
      }
      if (existing.retiredAt !== null) {
        throw new ConflictException('تم سحب هذا المرفق مسبقًا');
      }

      const updated = await tx.preAuthorizationAttachment.update({
        where: { id: existing.id },
        data: {
          retiredAt: new Date(),
          retiredById: ctx.userId,
          retireReason: reason,
        },
        select: ATTACHMENT_SELECT,
      });

      await appendChainedAuditInTransaction(tx, {
        hospitalId: ctx.hospitalId,
        userId: ctx.userId,
        entity: 'PreAuthorizationAttachment',
        entityId: updated.id,
        action: 'RETIRE_PREAUTH_ATTACHMENT',
        details: {
          preAuthId: ctx.preAuthId,
          reason,
          sha256: existing.sha256,
        },
      });

      return updated;
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
