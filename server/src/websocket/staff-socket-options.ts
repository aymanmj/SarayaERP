import type { IncomingMessage } from 'node:http';
import { TLSSocket } from 'node:tls';
import type { ServerOptions } from 'socket.io';

function configuredSocketOrigin(origin: string): boolean {
  return (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .some((value) => value.trim() === origin && /^https?:\/\//.test(origin));
}

function allowsSocketOrigin(request: IncomingMessage): boolean {
  const { origin, host, 'x-forwarded-proto': forwardedProto } = request.headers;
  if (origin === undefined) {
    const site = request.headers['sec-fetch-site'];
    return site === undefined || site === 'same-origin';
  }
  if (configuredSocketOrigin(origin)) return true;
  const protocol =
    request.socket instanceof TLSSocket || forwardedProto === 'https'
      ? 'https'
      : 'http';
  return !!host && origin === `${protocol}://${host}`;
}

export const staffSocketOptions = {
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, origin !== undefined && configuredSocketOrigin(origin)),
    credentials: true,
  },
  allowRequest: (request, callback) =>
    callback(null, allowsSocketOrigin(request)),
} satisfies Partial<ServerOptions>;

export function readStaffSocketCookie(cookie?: string): string | undefined {
  return cookie?.match(/(?:^|;\s*)Authentication=([^;]+)/)?.[1];
}

export function matchesStaffSocketScope(
  scope: unknown,
  staff: { sub: number; hospitalId: number },
): boolean {
  if (scope === undefined) return true;
  if (!scope || typeof scope !== 'object') return false;
  const expected = scope as { userId?: unknown; hospitalId?: unknown };
  return (
    expected.userId === staff.sub && expected.hospitalId === staff.hospitalId
  );
}
