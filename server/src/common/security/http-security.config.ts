import { isIP } from 'node:net';

export interface CorsCheckOptions {
  isProduction: boolean;
  configuredOrigins: string[];
}

export interface CorsCheckResult {
  allowed: boolean;
  reflectOrigin?: string | boolean;
}

export interface CspOptions {
  isProduction: boolean;
  enableStrictCsp: boolean;
  sarayaDomain?: string;
}

export interface AuthCookieOptionsInput {
  isProduction?: boolean;
  cookieSecure?: string;
}

export interface AuthCookieBaseOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
}

export function parseConfiguredOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isLocalOrPrivateHost(origin: string): boolean {
  try {
    const originUrl = new URL(origin);
    const host = originUrl.hostname;
    return (
      host === 'localhost' ||
      (isIP(host) === 4 &&
        (host.startsWith('127.') ||
          host.startsWith('10.') ||
          host.startsWith('192.168.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host)))
    );
  } catch {
    return false;
  }
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  opts: CorsCheckOptions,
): CorsCheckResult {
  if (!origin) {
    return { allowed: true, reflectOrigin: true };
  }

  if (opts.isProduction) {
    if (origin !== '*' && opts.configuredOrigins.includes(origin)) {
      return { allowed: true, reflectOrigin: origin };
    }
    return { allowed: false };
  }

  if (
    opts.configuredOrigins.length === 0 ||
    opts.configuredOrigins.includes('*') ||
    isLocalOrPrivateHost(origin) ||
    opts.configuredOrigins.includes(origin)
  ) {
    return { allowed: true, reflectOrigin: origin };
  }

  return { allowed: false };
}

export function buildCspDirectives(opts: CspOptions) {
  const sarayaDomain = (opts.sarayaDomain || '').trim();
  const connectSrc: string[] = ["'self'"];

  if (!opts.isProduction) {
    connectSrc.push('http://localhost:*', 'ws://localhost:*');
  }

  if (sarayaDomain) {
    connectSrc.push(`https://${sarayaDomain}`, `wss://${sarayaDomain}`);
  }

  const strictScript = opts.isProduction && opts.enableStrictCsp;

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    scriptSrc: strictScript
      ? ["'self'"]
      : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    mediaSrc: ["'self'", 'data:', 'blob:'],
    connectSrc,
    workerSrc: ["'self'", 'blob:'],
  };
}

export function buildAuthCookieOptions(
  opts?: AuthCookieOptionsInput,
): AuthCookieBaseOptions {
  const isProduction =
    opts?.isProduction ?? process.env.NODE_ENV === 'production';
  const cookieSecure = opts?.cookieSecure ?? process.env.COOKIE_SECURE;
  const secure =
    cookieSecure === 'true' || (isProduction && cookieSecure !== 'false');

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  };
}
