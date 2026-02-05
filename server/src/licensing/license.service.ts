// server/src/licensing/license.service.ts
// Professional Licensing System 2.0

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// TYPES
// ============================================================

export interface LicensePayload {
  hwId: string;
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
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);

  // --- Paths ---
  private readonly licenseFilePath = path.join(process.cwd(), 'saraya.lic');

  // --- State (Cached) ---
  private _machineId: string = 'LOADING...';
  private _publicKey: string | null = null;
  private _cachedStatus: LicenseStatus | null = null;
  private _lastValidationTime: number = 0;
  private readonly CACHE_TTL_MS = 60 * 1000;

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async onModuleInit() {
    this.logger.log('🔑 License Service Initializing...');

    // 1. Load Public Key
    this._loadPublicKey();

    // 2. Generate Machine ID
    await this._initMachineId();

    // 3. Pre-validate license
    this._validateLicenseInternal();

    this.logger.log('🔑 License Service Ready.');
  }

  private _loadPublicKey(): void {
    const possiblePaths = [
      path.join(process.cwd(), 'src/licensing/public.key'),
      path.join(process.cwd(), 'dist/licensing/public.key'),
      path.join(process.cwd(), 'public.key'),
      path.join(__dirname, 'public.key'),
    ];

    for (const keyPath of possiblePaths) {
      try {
        if (fs.existsSync(keyPath)) {
          this._publicKey = fs.readFileSync(keyPath, 'utf8');
          this.logger.log(`✅ Public Key loaded from: ${keyPath}`);
          return;
        }
      } catch (err: any) {
        this.logger.warn(`Could not load key from ${keyPath}: ${err.message}`);
      }
    }

    this.logger.error('❌ PUBLIC KEY NOT FOUND!');
    this.logger.error('Searched paths:');
    possiblePaths.forEach(p => this.logger.error(`  - ${p}`));
  }

  private async _initMachineId(): Promise<void> {
    // Strategy 1: node-machine-id
    try {
      const nodeMachineId = require('node-machine-id');
      const id = nodeMachineId.machineIdSync(true);
      if (id && typeof id === 'string' && id.length > 10) {
        this._machineId = id;
        this.logger.log(`📍 Machine ID (node-machine-id): ${this._machineId}`);
        return;
      }
    } catch (err: any) {
      this.logger.warn(`⚠️ node-machine-id failed: ${err.message}`);
    }

    // Strategy 2: Windows Registry
    try {
      const { execSync } = require('child_process');
      const result = execSync(
        'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: 'utf8', timeout: 5000 }
      );
      const match = result.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
      if (match && match[1]) {
        this._machineId = match[1].replace(/-/g, '');
        this.logger.log(`📍 Machine ID (Windows Registry): ${this._machineId}`);
        return;
      }
    } catch (err: any) {
      this.logger.warn(`⚠️ Windows registry failed: ${err.message}`);
    }

    // Strategy 3: Hostname hash
    try {
      const os = require('os');
      const crypto = require('crypto');
      const data = `${os.hostname()}-${os.userInfo().username}-${os.platform()}`;
      this._machineId = crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
      this.logger.log(`📍 Machine ID (Hash): ${this._machineId}`);
      return;
    } catch (err: any) {
      this.logger.warn(`⚠️ Hash fallback failed: ${err.message}`);
    }

    this._machineId = `FALLBACK-${Date.now()}`;
    this.logger.error(`❌ All machine ID strategies failed!`);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  getMachineId(): string {
    return this._machineId;
  }

  getStatus(forceRefresh = false): LicenseStatus {
    const now = Date.now();
    if (!forceRefresh && this._cachedStatus && now - this._lastValidationTime < this.CACHE_TTL_MS) {
      return this._cachedStatus;
    }
    return this._validateLicenseInternal();
  }

  get isValid(): boolean {
    return this.getStatus().isValid;
  }

  get details(): LicensePayload | null {
    const status = this.getStatus();
    if (!status.isValid) return null;
    return {
      hwId: status.machineId,
      hospitalName: status.hospitalName || '',
      expiryDate: status.expiryDate || '',
      plan: (status.plan as any) || 'BASIC',
      maxUsers: status.maxUsers ?? 0,
      modules: status.modules || [],
    };
  }

  activateLicense(licenseKey: string): { success: boolean; message: string } {
    // 🔄 Always reload key from disk to support Hot-Swap (docker cp)
    this._loadPublicKey();

    if (!this._publicKey) {
      return { success: false, message: 'System error: No public key loaded.' };
    }

    try {
      const decoded = jwt.verify(licenseKey.trim(), this._publicKey, {
        algorithms: ['RS256'],
      }) as LicensePayload;

      if (decoded.hwId !== this._machineId) {
        return {
          success: false,
          message: `هذا المفتاح لجهاز مختلف. المعرف المتوقع: ${decoded.hwId}`,
        };
      }

      fs.writeFileSync(this.licenseFilePath, licenseKey.trim(), 'utf8');
      this.logger.log(`✅ License file saved: ${this.licenseFilePath}`);

      this._cachedStatus = null;
      const newStatus = this._validateLicenseInternal();

      if (newStatus.isValid) {
        return { success: true, message: 'تم تفعيل الترخيص بنجاح!' };
      } else {
        return { success: false, message: newStatus.error || 'فشل التحقق من الترخيص.' };
      }
    } catch (err: any) {
      this.logger.error(`Activation failed: ${err.message}`);
      return { success: false, message: `مفتاح غير صالح: ${err.message}` };
    }
  }

  isModuleEnabled(moduleName: string): boolean {
    const status = this.getStatus();
    if (!status.isValid || !status.modules) return false;
    return status.modules.includes(moduleName.toUpperCase());
  }

  canAddUser(currentUserCount: number): boolean {
    const status = this.getStatus();
    if (!status.isValid) return false;
    if (status.maxUsers === -1) return true;
    return currentUserCount < (status.maxUsers ?? 0);
  }

  checkUserLimit(currentUserCount: number): boolean {
    return this.canAddUser(currentUserCount);
  }

  // ============================================================
  // INTERNAL VALIDATION
  // ============================================================

  private _validateLicenseInternal(): LicenseStatus {
    const baseStatus: LicenseStatus = {
      isValid: false,
      machineId: this._machineId,
    };

    if (!this._publicKey) {
      baseStatus.error = 'System not configured: Missing public key.';
      this._updateCache(baseStatus);
      return baseStatus;
    }

    if (!fs.existsSync(this.licenseFilePath)) {
      baseStatus.error = 'No license file found.';
      this._updateCache(baseStatus);
      return baseStatus;
    }

    try {
      const token = fs.readFileSync(this.licenseFilePath, 'utf8').trim();
      const decoded = jwt.verify(token, this._publicKey, {
        algorithms: ['RS256'],
      }) as LicensePayload;

      if (decoded.hwId !== this._machineId) {
        baseStatus.error = `Hardware mismatch. License for: ${decoded.hwId}`;
        this._updateCache(baseStatus);
        return baseStatus;
      }

      const expiryDate = new Date(decoded.expiryDate);
      expiryDate.setHours(23, 59, 59, 999);
      const now = new Date();

      let isGracePeriod = false;
      let daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (now > expiryDate) {
        const daysPastExpiry = Math.abs(daysRemaining);
        if (daysPastExpiry <= 7) {
          isGracePeriod = true;
          daysRemaining = 7 - daysPastExpiry;
          this.logger.warn(`⚠️ License in GRACE PERIOD (${daysRemaining} days left)`);
        } else {
          baseStatus.error = `الترخيص منتهي منذ ${daysPastExpiry} يوم.`;
          this._updateCache(baseStatus);
          return baseStatus;
        }
      }

      const validStatus: LicenseStatus = {
        isValid: true,
        machineId: this._machineId,
        plan: decoded.plan,
        hospitalName: decoded.hospitalName,
        expiryDate: decoded.expiryDate,
        maxUsers: decoded.maxUsers,
        modules: decoded.modules,
        isGracePeriod,
        daysRemaining,
      };

      this.logger.log(
        `✅ License Valid: ${decoded.hospitalName} | Plan: ${decoded.plan} | Expires: ${decoded.expiryDate}${isGracePeriod ? ' [GRACE]' : ''}`
      );

      this._updateCache(validStatus);
      return validStatus;
    } catch (err: any) {
      baseStatus.error = `Verification failed: ${err.message}`;
      this._updateCache(baseStatus);
      return baseStatus;
    }
  }

  private _updateCache(status: LicenseStatus) {
    this._cachedStatus = status;
    this._lastValidationTime = Date.now();
  }
}
