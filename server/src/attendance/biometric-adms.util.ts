// server/src/attendance/biometric-adms.util.ts
import { createHash, timingSafeEqual } from 'node:crypto';

export function normalizeClientIp(rawIp: string | undefined): string {
  if (!rawIp) return '';
  return rawIp.replace(/^::ffff:/i, '').trim();
}

/**
 * Validates that a biometric device IP belongs to a private LAN, loopback, or Tailscale CGNAT.
 * Prevents SSRF / spoofed public-internet punch injection (ported from SarayaManager AdmsController).
 */
export function isTrustedPrivateIp(rawIp: string | undefined): boolean {
  const ip = normalizeClientIp(rawIp);
  if (!ip) return false;
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  ) {
    return true;
  }
  return false;
}

export function hashDeviceSecret(secret: string): string {
  return createHash('sha256').update(secret.trim(), 'utf8').digest('hex');
}

export function verifyDeviceSecretHash(
  providedSecret: string,
  expectedHash: string,
): boolean {
  const actualHash = hashDeviceSecret(providedSecret);
  const a = Buffer.from(actualHash, 'utf8');
  const b = Buffer.from(expectedHash.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface ParsedAdmsPunch {
  biometricId: string;
  punchTime: Date;
  punchType:
    | 'CHECK_IN'
    | 'CHECK_OUT'
    | 'BREAK_OUT'
    | 'BREAK_IN'
    | 'OVERTIME_IN'
    | 'OVERTIME_OUT'
    | 'UNKNOWN';
  verifyMode: 'PASSWORD' | 'FINGERPRINT' | 'CARD' | 'FACE' | 'UNKNOWN';
  rawLine: string;
}

const ZK_STATUS_MAP: Record<string, ParsedAdmsPunch['punchType']> = {
  '0': 'CHECK_IN',
  '1': 'CHECK_OUT',
  '2': 'BREAK_OUT',
  '3': 'BREAK_IN',
  '4': 'OVERTIME_IN',
  '5': 'OVERTIME_OUT',
};

const ZK_VERIFY_MAP: Record<string, ParsedAdmsPunch['verifyMode']> = {
  '0': 'PASSWORD',
  '1': 'FINGERPRINT',
  '2': 'CARD',
  '3': 'PASSWORD',
  '4': 'CARD',
  '15': 'FACE',
};

/**
 * Parses ZKTeco ADMS ATTLOG tab-separated lines:
 *   `<PIN>\t<YYYY-MM-DD HH:mm:ss>\t<status>\t<verify>\t...`
 * Converts local wall-clock timestamps using `tzOffsetHours` (default +2 for Africa/Tripoli).
 */
export function parseAdmsAttlogLines(
  rawBody: string,
  tzOffsetHours = 2,
): ParsedAdmsPunch[] {
  if (!rawBody || !rawBody.trim()) return [];
  const results: ParsedAdmsPunch[] = [];
  const lines = rawBody
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\t+/);
    if (parts.length < 2) continue;
    const biometricId = parts[0].trim();
    const tsRaw = parts[1].trim();
    if (!biometricId || !tsRaw) continue;

    let punchTime: Date;
    const localMatch =
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(tsRaw);
    if (localMatch) {
      const [, y, mo, d, h, mi, s = '00'] = localMatch;
      const utcMs =
        Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s),
        ) -
        tzOffsetHours * 3600000;
      punchTime = new Date(utcMs);
    } else {
      punchTime = new Date(tsRaw);
    }

    if (Number.isNaN(punchTime.getTime())) continue;

    const statusCode = (parts[2] ?? '').trim();
    const verifyCode = (parts[3] ?? '').trim();

    results.push({
      biometricId,
      punchTime,
      punchType: ZK_STATUS_MAP[statusCode] ?? 'UNKNOWN',
      verifyMode: ZK_VERIFY_MAP[verifyCode] ?? 'UNKNOWN',
      rawLine: line.slice(0, 500),
    });
  }
  return results;
}

export function buildAdmsHandshakeResponse(
  serialNumber: string,
  attStamp = '0',
  opStamp = '0',
): string {
  return [
    `GET OPTION FROM: ${serialNumber}`,
    `Stamp=${attStamp}`,
    `OpStamp=${opStamp}`,
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=1111000000',
    'TimeZone=2',
    'Realtime=1',
    'Encrypt=0',
    '',
  ].join('\n');
}
