// server/src/attendance/adms-device.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  isTrustedPrivateIp,
  normalizeClientIp,
  verifyDeviceSecretHash,
} from './biometric-adms.util';

export interface AdmsAuthenticatedDevice {
  id: number;
  hospitalId: number;
  serialNumber: string;
  ipAddress: string;
  name: string;
}

export type AdmsRequest = Request & {
  admsDevice?: AdmsAuthenticatedDevice;
  admsClientIp?: string;
};

/**
 * Zero-Trust Hardware Guard for ZKTeco ADMS Cloud Push (`/iclock/cdata`):
 * 1. Verifies caller originates from a trusted private LAN / loopback / Tailscale IP.
 * 2. Requires a registered, active `BiometricDevice` matched by unique `serialNumber`.
 * 3. Enforces IP match against registered device IP (unless `ADMS_ALLOW_IP_CHANGE=true`).
 * 4. Enforces constant-time SHA-256 verification when a per-device `deviceSecretHash` is configured.
 * 5. Binds `device.hospitalId` onto the request so punches never cross tenant boundaries.
 */
@Injectable()
export class AdmsDeviceGuard implements CanActivate {
  private readonly logger = new Logger(AdmsDeviceGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AdmsRequest>();
    const rawIp = req.ip || req.socket?.remoteAddress || '';
    const clientIp = normalizeClientIp(rawIp);

    if (!isTrustedPrivateIp(clientIp)) {
      this.logger.warn(`[ADMS Denied] Untrusted source IP=${clientIp}`);
      throw new ForbiddenException('FORBIDDEN_DEVICE_SOURCE');
    }

    const rawSn =
      typeof req.query.SN === 'string'
        ? req.query.SN
        : typeof req.query.sn === 'string'
          ? req.query.sn
          : '';
    const serialNumber = rawSn.trim().toUpperCase();
    if (!serialNumber) {
      throw new ForbiddenException('DEVICE_SERIAL_REQUIRED');
    }

    const device = await this.prisma.biometricDevice.findUnique({
      where: { serialNumber },
      select: {
        id: true,
        hospitalId: true,
        serialNumber: true,
        ipAddress: true,
        name: true,
        isActive: true,
        deviceSecretHash: true,
      },
    });

    if (!device) {
      this.logger.warn(
        `[ADMS Denied] Unregistered device SN=${serialNumber}, IP=${clientIp}`,
      );
      throw new ForbiddenException('DEVICE_NOT_REGISTERED');
    }

    if (!device.isActive) {
      this.logger.warn(`[ADMS Denied] Deactivated device SN=${serialNumber}`);
      throw new ForbiddenException('DEVICE_DEACTIVATED');
    }

    const allowIpChange = process.env.ADMS_ALLOW_IP_CHANGE === 'true';
    const expectedIp = normalizeClientIp(device.ipAddress);
    if (!allowIpChange && expectedIp && clientIp !== expectedIp) {
      this.logger.warn(
        `[ADMS Denied] IP mismatch for SN=${serialNumber}: expected=${expectedIp}, received=${clientIp}`,
      );
      throw new ForbiddenException('DEVICE_IP_MISMATCH');
    }

    if (device.deviceSecretHash) {
      const providedToken =
        (typeof req.query.token === 'string' ? req.query.token : '') ||
        (typeof req.headers['x-device-secret'] === 'string'
          ? req.headers['x-device-secret']
          : '');
      if (
        !providedToken ||
        !verifyDeviceSecretHash(providedToken, device.deviceSecretHash)
      ) {
        this.logger.warn(
          `[ADMS Denied] Invalid device secret for SN=${serialNumber}`,
        );
        throw new ForbiddenException('INVALID_DEVICE_SECRET');
      }
    }

    req.admsDevice = {
      id: device.id,
      hospitalId: device.hospitalId,
      serialNumber: device.serialNumber,
      ipAddress: device.ipAddress,
      name: device.name,
    };
    req.admsClientIp = clientIp;

    return true;
  }
}
