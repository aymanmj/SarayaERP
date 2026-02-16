// server/src/licensing/license.service.ts
// Professional Licensing System 3.1
// Docker-safe • Host-bound • Backward Compatible

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================
// TYPES
// ============================================================

export interface LicensePayload {
  hwId: string;
  hwFingerprint: string;
  hospitalName: string;
  expiryDate: string;
  plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  maxUsers: number;
  modules: string[];
}

export interface LicenseStatus {
  isValid: boolean;
  machineId: string;
  plan?: string;
  hospitalName?: string;
  expiryDate?: string;
  maxUsers?: number;
  modules?: string[];
  isGracePeriod?: boolean;
  daysRemaining?: number;
  error?: string;
  licensePath?: string;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);

  private readonly licenseFilePath =
    process.env.LICENSE_PATH ||
    path.join(process.cwd(), 'license', 'saraya.lic');

  private readonly machineIdFilePath = path.join(
    path.dirname(this.licenseFilePath),
    'machine.id',
  );

  private _machineId = 'LOADING';
  private _publicKey: string | null = null;

  private _cachedStatus: LicenseStatus | null = null;
  private _lastValidationTime = 0;
  private readonly CACHE_TTL_MS = 60 * 1000;

  // ============================================================
  // INIT
  // ============================================================

  async onModuleInit() {
    this.logger.log('🔑 Initializing License Service...');
    this._loadPublicKey();
    await this._initMachineId();
    this._validateLicenseInternal();
    this.logger.log('🔑 License Service Ready');
  }

  // ============================================================
  // MACHINE ID
  // ============================================================

  private async _initMachineId(): Promise<void> {
    // 1️⃣ Persistent ID
    if (fs.existsSync(this.machineIdFilePath)) {
      this._machineId = fs.readFileSync(this.machineIdFilePath, 'utf8').trim();
      this.logger.log(`📍 Machine ID loaded: ${this._machineId}`);
      return;
    }

    // 2️⃣ Host Machine ID (Docker-safe)
    const hostPath = process.env.MACHINE_ID_PATH;
    if (hostPath && fs.existsSync(hostPath)) {
      this._machineId = fs.readFileSync(hostPath, 'utf8').trim();
      this.logger.log(`🏠 Host Machine ID detected`);
      this._persistMachineId();
      return;
    }

    // 3️⃣ Fallback (DEV only)
    this._machineId = crypto.randomUUID().replace(/-/g, '');
    this.logger.warn('⚠️ Fallback Machine ID generated');
    this._persistMachineId();
  }

  private _persistMachineId() {
    const dir = path.dirname(this.machineIdFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.machineIdFilePath, this._machineId, 'utf8');
  }

  getMachineId(): string {
    return this._machineId;
  }

  // ============================================================
  // CRYPTO
  // ============================================================

  private _generateFingerprint(machineId: string, hospitalName: string): string {
    return crypto
      .createHash('sha256')
      .update(`${machineId}::${hospitalName}`)
      .digest('hex');
  }

  private _loadPublicKey() {
    const paths = [
      path.join(path.dirname(this.licenseFilePath), 'public.key'),
      path.join(process.cwd(), 'src/licensing/public.key'),
      path.join(process.cwd(), 'dist/licensing/public.key'),
      path.join(process.cwd(), 'public.key'),
      path.join(__dirname, 'public.key'),
    ];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        this._publicKey = fs.readFileSync(p, 'utf8');
        this.logger.log(`✅ Public key loaded`);
        return;
      }
    }

    this.logger.error('❌ Public key not found');
  }

  // ============================================================
  // PUBLIC STATUS API
  // ============================================================

  getStatus(force = false): LicenseStatus {
    if (
      !force &&
      this._cachedStatus &&
      Date.now() - this._lastValidationTime < this.CACHE_TTL_MS
    ) {
      return this._cachedStatus;
    }
    return this._validateLicenseInternal();
  }

  // 🔁 Backward compatibility
  get details(): LicenseStatus | null {
    const status = this.getStatus();
    return status.isValid ? status : null;
  }

  // ============================================================
  // FEATURE CHECKS (GUARD SUPPORT)
  // ============================================================

  isModuleEnabled(module: string): boolean {
    const status = this.getStatus();
    if (!status.isValid || !status.modules) return false;
    return status.modules.includes(module);
  }

  checkUserLimit(activeUsers: number): boolean {
    const status = this.getStatus();
    if (!status.isValid || !status.maxUsers) return false;
    return activeUsers < status.maxUsers;
  }

  // ============================================================
  // ACTIVATION
  // ============================================================

  activateLicense(key: string): { success: boolean; message: string } {
    if (!this._publicKey) {
      return { success: false, message: 'Public key missing' };
    }

    try {
      const decoded = jwt.verify(key, this._publicKey, {
        algorithms: ['RS256'],
      }) as LicensePayload;

      if (decoded.hwId !== this._machineId) {
        return { success: false, message: 'Machine ID mismatch' };
      }

      const expectedFp = this._generateFingerprint(
        this._machineId,
        decoded.hospitalName,
      );

      if (decoded.hwFingerprint !== expectedFp) {
        return { success: false, message: 'License fingerprint mismatch' };
      }

      fs.writeFileSync(this.licenseFilePath, key, 'utf8');
      this._cachedStatus = null;

      return { success: true, message: 'تم تفعيل الترخيص بنجاح' };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  private _validateLicenseInternal(): LicenseStatus {
    const base: LicenseStatus = {
      isValid: false,
      machineId: this._machineId,
      licensePath: this.licenseFilePath,
    };

    if (!this._publicKey || !fs.existsSync(this.licenseFilePath)) {
      base.error = 'License missing';
      return this._cache(base);
    }

    try {
      const token = fs.readFileSync(this.licenseFilePath, 'utf8');
      const decoded = jwt.verify(token, this._publicKey, {
        algorithms: ['RS256'],
      }) as LicensePayload;

      if (decoded.hwId !== this._machineId) {
        base.error = 'Machine mismatch';
        return this._cache(base);
      }

      const fp = this._generateFingerprint(
        this._machineId,
        decoded.hospitalName,
      );
      if (fp !== decoded.hwFingerprint) {
        base.error = 'Fingerprint mismatch';
        return this._cache(base);
      }

      const expiry = new Date(decoded.expiryDate);
      expiry.setHours(23, 59, 59, 999);
      const now = new Date();

      let grace = false;
      let days = Math.ceil(
        (expiry.getTime() - now.getTime()) / 86400000,
      );

      if (now > expiry) {
        if (Math.abs(days) <= 7) {
          grace = true;
          days = 7 - Math.abs(days);
        } else {
          base.error = 'License expired';
          return this._cache(base);
        }
      }

      return this._cache({
        isValid: true,
        machineId: this._machineId,
        hospitalName: decoded.hospitalName,
        plan: decoded.plan,
        expiryDate: decoded.expiryDate,
        maxUsers: decoded.maxUsers,
        modules: decoded.modules,
        isGracePeriod: grace,
        daysRemaining: days,
        licensePath: this.licenseFilePath,
      });
    } catch (e: any) {
      base.error = e.message;
      return this._cache(base);
    }
  }

  private _cache(status: LicenseStatus): LicenseStatus {
    this._cachedStatus = status;
    this._lastValidationTime = Date.now();
    return status;
  }
}


