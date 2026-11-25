import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as net from 'node:net';

export type AvScannerMode = 'clamd' | 'eicar_builtin' | 'disabled';

export interface AvScanOptions {
  mode?: AvScannerMode;
  host?: string;
  port?: number;
  timeoutMs?: number;
  nodeEnv?: string;
  allowUnscannedUploads?: boolean;
}

export interface AvScanResult {
  clean: boolean;
  infected: boolean;
  engine: AvScannerMode;
  signature: string | null;
  durationMs: number;
}

const CLAMD_CHUNK_SIZE = 64 * 1024;

/**
 * Constructs the standard ISO/EICAR antivirus test signature dynamically at
 * runtime so source files never carry the literal signature bytes on disk.
 */
export function buildEicarTestSignature(): string {
  const parts = [
    'WDBPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9',
    'JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URV',
    'NULUZJTEUhJEgrSCo=',
  ];
  return Buffer.from(parts.join(''), 'base64').toString('ascii');
}

export function resolveAvScannerConfig(options?: AvScanOptions): {
  mode: AvScannerMode;
  host: string;
  port: number;
  timeoutMs: number;
  isProduction: boolean;
  allowUnscannedUploads: boolean;
} {
  const nodeEnv = (
    options?.nodeEnv ??
    process.env.NODE_ENV ??
    'development'
  ).toLowerCase();
  const isProduction = nodeEnv === 'production';

  const host = (options?.host ?? process.env.CLAMAV_HOST ?? '127.0.0.1').trim();
  const rawPort = options?.port ?? Number(process.env.CLAMAV_PORT ?? 3310);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3310;

  const rawTimeout =
    options?.timeoutMs ?? Number(process.env.CLAMAV_TIMEOUT_MS ?? 10000);
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout >= 100 ? rawTimeout : 10000;

  const allowUnscannedUploads =
    options?.allowUnscannedUploads ??
    process.env.ALLOW_UNSCANNED_UPLOADS === 'true';

  const envMode = (options?.mode ?? process.env.AV_SCANNER_MODE ?? '')
    .trim()
    .toLowerCase();

  let mode: AvScannerMode;
  if (
    envMode === 'clamd' ||
    envMode === 'eicar_builtin' ||
    envMode === 'disabled'
  ) {
    mode = envMode;
  } else if (process.env.CLAMAV_HOST?.trim() || isProduction) {
    mode = 'clamd';
  } else {
    mode = 'eicar_builtin';
  }

  return {
    mode,
    host,
    port,
    timeoutMs,
    isProduction,
    allowUnscannedUploads,
  };
}

/**
 * Streams a buffer directly to ClamAV clamd over TCP using the standard
 * zINSTREAM\0 chunked protocol (4-byte big-endian length prefix per chunk,
 * terminated by 0x00000000). Fails closed on network error or timeout.
 */
export async function scanWithClamdTcp(
  buffer: Buffer,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ clean: boolean; infected: boolean; signature: string | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const socket = net.createConnection({ host, port });

    const finishError = (reason: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(
        new ServiceUnavailableException(
          `خدمة فحص الفيروسات (ClamAV) غير متاحة حالياً (${reason})؛ تم حجب رفع المرفق حفاظاً على السلامة.`,
        ),
      );
    };

    const timer = setTimeout(() => {
      finishError('انتهت مهلة الاتصال');
    }, timeoutMs);

    const cleanupTimer = () => clearTimeout(timer);

    socket.on('error', (err) => {
      cleanupTimer();
      finishError(err.message || 'خطأ في الاتصال');
    });

    socket.on('connect', () => {
      try {
        socket.write(Buffer.from('zINSTREAM\0', 'ascii'));
        for (
          let offset = 0;
          offset < buffer.length;
          offset += CLAMD_CHUNK_SIZE
        ) {
          const slice = buffer.subarray(
            offset,
            Math.min(offset + CLAMD_CHUNK_SIZE, buffer.length),
          );
          const lenBuf = Buffer.allocUnsafe(4);
          lenBuf.writeUInt32BE(slice.length, 0);
          socket.write(lenBuf);
          socket.write(slice);
        }
        // Zero-length chunk signals end-of-stream to clamd
        socket.write(Buffer.alloc(4, 0));
      } catch (err) {
        cleanupTimer();
        finishError(err instanceof Error ? err.message : 'فشل إرسال البيانات');
      }
    });

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    socket.on('end', () => {
      cleanupTimer();
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks)
        .toString('utf8')
        .replace(/\0/g, '')
        .trim();

      if (/^stream:\s*OK$/i.test(raw)) {
        resolve({ clean: true, infected: false, signature: null });
        return;
      }

      const foundMatch = raw.match(/^stream:\s*(.+?)\s+FOUND$/i);
      if (foundMatch) {
        resolve({
          clean: false,
          infected: true,
          signature: foundMatch[1].trim(),
        });
        return;
      }

      reject(
        new ServiceUnavailableException(
          `استجابة غير صالحة من خدمة فحص الفيروسات (ClamAV): ${raw || 'EMPTY'}`,
        ),
      );
    });
  });
}

export async function scanAttachmentBuffer(
  buffer: Buffer,
  options?: AvScanOptions,
): Promise<AvScanResult> {
  const startedAt = Date.now();
  const cfg = resolveAvScannerConfig(options);

  if (cfg.mode === 'disabled') {
    if (cfg.isProduction && !cfg.allowUnscannedUploads) {
      throw new ServiceUnavailableException(
        'يُمنع تعطيل فحص الفيروسات (ClamAV) في بيئة الإنتاج.',
      );
    }
    return {
      clean: true,
      infected: false,
      engine: 'disabled',
      signature: null,
      durationMs: Date.now() - startedAt,
    };
  }

  // Fast deterministic EICAR signature check works in both eicar_builtin and clamd modes
  const eicarNeedle = Buffer.from(buildEicarTestSignature(), 'ascii');
  if (buffer.includes(eicarNeedle)) {
    return {
      clean: false,
      infected: true,
      engine: cfg.mode,
      signature: 'Eicar-Test-Signature',
      durationMs: Date.now() - startedAt,
    };
  }

  if (cfg.mode === 'eicar_builtin') {
    return {
      clean: true,
      infected: false,
      engine: 'eicar_builtin',
      signature: null,
      durationMs: Date.now() - startedAt,
    };
  }

  const clamdResult = await scanWithClamdTcp(
    buffer,
    cfg.host,
    cfg.port,
    cfg.timeoutMs,
  );
  return {
    clean: clamdResult.clean,
    infected: clamdResult.infected,
    engine: 'clamd',
    signature: clamdResult.signature,
    durationMs: Date.now() - startedAt,
  };
}

@Injectable()
export class AttachmentAvScannerService {
  private readonly logger = new Logger(AttachmentAvScannerService.name);

  async scanBuffer(
    buffer: Buffer,
    fileName?: string,
    options?: AvScanOptions,
  ): Promise<AvScanResult> {
    const result = await scanAttachmentBuffer(buffer, options);
    if (result.infected) {
      this.logger.warn(
        `🛡️ AV Scanner blocked infected upload "${fileName ?? 'unknown'}" (signature=${result.signature}, engine=${result.engine})`,
      );
    }
    return result;
  }
}
