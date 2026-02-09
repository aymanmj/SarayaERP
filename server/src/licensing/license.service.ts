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




// // server/src/licensing/license.service.ts
// // Professional Licensing System 3.0 (Docker & Host-Safe)

// import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// import * as jwt from 'jsonwebtoken';
// import * as fs from 'fs';
// import * as path from 'path';
// import * as crypto from 'crypto';

// // ============================================================
// // TYPES
// // ============================================================

// export interface LicensePayload {
//   hwId: string;
//   hwFingerprint?: string;
//   hospitalName: string;
//   expiryDate: string;
//   plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
//   maxUsers: number;
//   modules: string[];
// }

// export interface LicenseStatus {
//   isValid: boolean;
//   machineId: string;
//   plan?: string;
//   hospitalName?: string;
//   expiryDate?: string;
//   maxUsers?: number;
//   modules?: string[];
//   isGracePeriod?: boolean;
//   daysRemaining?: number;
//   error?: string;
//   licensePath?: string;
// }

// // ============================================================
// // SERVICE
// // ============================================================

// @Injectable()
// export class LicenseService implements OnModuleInit {
//   private readonly logger = new Logger(LicenseService.name);

//   private readonly licenseFilePath =
//     process.env.LICENSE_PATH || path.join(process.cwd(), 'license', 'saraya.lic');

//   private readonly machineIdFilePath = path.join(
//     path.dirname(this.licenseFilePath),
//     'machine.id',
//   );

//   private _machineId = 'LOADING';
//   private _publicKey: string | null = null;
//   private _cachedStatus: LicenseStatus | null = null;
//   private _lastValidationTime = 0;
//   private readonly CACHE_TTL_MS = 60 * 1000;

//   // ============================================================
//   // INIT
//   // ============================================================

//   async onModuleInit() {
//     this.logger.log('🔑 Initializing License Service...');
//     this._loadPublicKey();
//     await this._initMachineId();
//     this._validateLicenseInternal();
//     this.logger.log('🔑 License Service Ready');
//   }

//   // ============================================================
//   // MACHINE ID
//   // ============================================================

//   private async _initMachineId(): Promise<void> {
//     // 1️⃣ Load from persistent storage
//     if (fs.existsSync(this.machineIdFilePath)) {
//       this._machineId = fs.readFileSync(this.machineIdFilePath, 'utf8').trim();
//       this.logger.log(`📍 Machine ID loaded: ${this._machineId}`);
//       return;
//     }

//     // 2️⃣ Host Machine ID (Docker)
//     const hostMachineIdPath = process.env.MACHINE_ID_PATH;
//     if (hostMachineIdPath && fs.existsSync(hostMachineIdPath)) {
//       this._machineId = fs.readFileSync(hostMachineIdPath, 'utf8').trim();
//       this.logger.log(`🏠 Host Machine ID detected: ${this._machineId}`);
//       this._persistMachineId();
//       return;
//     }

//     // 3️⃣ Fallback (DEV ONLY)
//     this._machineId = crypto.randomUUID().replace(/-/g, '');
//     this.logger.warn('⚠️ Fallback Machine ID generated');
//     this._persistMachineId();
//   }

//   private _persistMachineId() {
//     const dir = path.dirname(this.machineIdFilePath);
//     if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
//     fs.writeFileSync(this.machineIdFilePath, this._machineId, 'utf8');
//   }

//   getMachineId(): string {
//     return this._machineId;
//   }

//   // ============================================================
//   // CRYPTO
//   // ============================================================

//   private _generateFingerprint(machineId: string, hospitalName: string): string {
//     return crypto
//       .createHash('sha256')
//       .update(`${machineId}::${hospitalName}`)
//       .digest('hex');
//   }

//   private _loadPublicKey() {
//     const possiblePaths = [
//       path.join(path.dirname(this.licenseFilePath), 'public.key'),
//       path.join(process.cwd(), 'public.key'),
//       path.join(__dirname, 'public.key'),
//     ];

//     for (const p of possiblePaths) {
//       if (fs.existsSync(p)) {
//         this._publicKey = fs.readFileSync(p, 'utf8');
//         this.logger.log(`✅ Public key loaded from ${p}`);
//         return;
//       }
//     }

//     this.logger.error('❌ Public key not found');
//   }

//   // ============================================================
//   // STATUS
//   // ============================================================

//   getStatus(force = false): LicenseStatus {
//     if (
//       !force &&
//       this._cachedStatus &&
//       Date.now() - this._lastValidationTime < this.CACHE_TTL_MS
//     ) {
//       return this._cachedStatus;
//     }
//     return this._validateLicenseInternal();
//   }

//   // ============================================================
//   // ACTIVATION
//   // ============================================================

//   activateLicense(key: string): { success: boolean; message: string } {
//     if (!this._publicKey) {
//       return { success: false, message: 'Public key missing' };
//     }

//     try {
//       const decoded = jwt.verify(key, this._publicKey, {
//         algorithms: ['RS256'],
//       }) as LicensePayload;

//       if (decoded.hwId !== this._machineId) {
//         return { success: false, message: 'Machine ID mismatch' };
//       }

//       const expectedFp = this._generateFingerprint(
//         this._machineId,
//         decoded.hospitalName,
//       );

//       if (decoded.hwFingerprint !== expectedFp) {
//         return { success: false, message: 'License fingerprint mismatch' };
//       }

//       fs.writeFileSync(this.licenseFilePath, key, 'utf8');
//       this._cachedStatus = null;

//       return { success: true, message: 'تم تفعيل الترخيص بنجاح' };
//     } catch (e: any) {
//       return { success: false, message: e.message };
//     }
//   }

//   // ============================================================
//   // VALIDATION
//   // ============================================================

//   private _validateLicenseInternal(): LicenseStatus {
//     const base: LicenseStatus = {
//       isValid: false,
//       machineId: this._machineId,
//       licensePath: this.licenseFilePath,
//     };

//     if (!this._publicKey || !fs.existsSync(this.licenseFilePath)) {
//       base.error = 'License missing';
//       return this._cache(base);
//     }

//     try {
//       const token = fs.readFileSync(this.licenseFilePath, 'utf8');
//       const decoded = jwt.verify(token, this._publicKey, {
//         algorithms: ['RS256'],
//       }) as LicensePayload;

//       if (decoded.hwId !== this._machineId) {
//         base.error = 'Machine mismatch';
//         return this._cache(base);
//       }

//       const fp = this._generateFingerprint(
//         this._machineId,
//         decoded.hospitalName,
//       );
//       if (fp !== decoded.hwFingerprint) {
//         base.error = 'Fingerprint mismatch';
//         return this._cache(base);
//       }

//       const expiry = new Date(decoded.expiryDate);
//       expiry.setHours(23, 59, 59, 999);
//       const now = new Date();

//       let grace = false;
//       let days = Math.ceil(
//         (expiry.getTime() - now.getTime()) / 86400000,
//       );

//       if (now > expiry) {
//         if (Math.abs(days) <= 7) {
//           grace = true;
//           days = 7 - Math.abs(days);
//         } else {
//           base.error = 'License expired';
//           return this._cache(base);
//         }
//       }

//       return this._cache({
//         isValid: true,
//         machineId: this._machineId,
//         hospitalName: decoded.hospitalName,
//         plan: decoded.plan,
//         expiryDate: decoded.expiryDate,
//         maxUsers: decoded.maxUsers,
//         modules: decoded.modules,
//         isGracePeriod: grace,
//         daysRemaining: days,
//         licensePath: this.licenseFilePath,
//       });
//     } catch (e: any) {
//       base.error = e.message;
//       return this._cache(base);
//     }
//   }

//   private _cache(status: LicenseStatus): LicenseStatus {
//     this._cachedStatus = status;
//     this._lastValidationTime = Date.now();
//     return status;
//   }
// }




// // server/src/licensing/license.service.ts
// // Professional Licensing System 2.0

// import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// import * as jwt from 'jsonwebtoken';
// import * as fs from 'fs';
// import * as path from 'path';
// import * as crypto from 'crypto';

// // ============================================================
// // TYPES
// // ============================================================

// export interface LicensePayload {
//   hwId: string;
//   hwFingerprint: string;
//   hospitalName: string;
//   expiryDate: string;
//   plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
//   maxUsers: number;
//   modules: string[];
// }

// export interface LicenseStatus {
//   isValid: boolean;
//   machineId: string;
//   plan?: string;
//   hospitalName?: string;
//   expiryDate?: string;
//   maxUsers?: number;
//   modules?: string[];
//   isGracePeriod?: boolean;
//   daysRemaining?: number;
//   error?: string;
//   licensePath?: string;
// }

// // ============================================================
// // SERVICE
// // ============================================================

// @Injectable()
// export class LicenseService implements OnModuleInit {
//   private readonly logger = new Logger(LicenseService.name);

//   // --- Paths ---
//   private readonly licenseFilePath = process.env.LICENSE_PATH || path.join(process.cwd(), 'saraya.lic');
//   private readonly machineIdFilePath = path.join(path.dirname(this.licenseFilePath), 'machine.id');

//   // --- State (Cached) ---
//   private _machineId: string = 'LOADING...';
//   private _publicKey: string | null = null;
//   private _cachedStatus: LicenseStatus | null = null;
//   private _lastValidationTime: number = 0;
//   private readonly CACHE_TTL_MS = 60 * 1000;

//   // ============================================================
//   // INITIALIZATION
//   // ============================================================

//   async onModuleInit() {
//     this.logger.log('🔑 License Service Initializing...');

//     // 1. Load Public Key
//     this._loadPublicKey();

//     // 2. Generate Machine ID
//     await this._initMachineId();

//     // 3. Pre-validate license
//     this._validateLicenseInternal();

//     this.logger.log('🔑 License Service Ready.');
//   }

//   private _loadPublicKey(): void {
//     const possiblePaths = [
//       path.join(path.dirname(this.licenseFilePath), 'public.key'), // Check persistent dir first
//       path.join(process.cwd(), 'src/licensing/public.key'),
//       path.join(process.cwd(), 'dist/licensing/public.key'),
//       path.join(process.cwd(), 'public.key'),
//       path.join(__dirname, 'public.key'),
//     ];

//     for (const keyPath of possiblePaths) {
//       try {
//         if (fs.existsSync(keyPath)) {
//           this._publicKey = fs.readFileSync(keyPath, 'utf8');
//           this.logger.log(`✅ Public Key loaded from: ${keyPath}`);
//           return;
//         }
//       } catch (err: any) {
//         this.logger.warn(`Could not load key from ${keyPath}: ${err.message}`);
//       }
//     }

//     this.logger.error('❌ PUBLIC KEY NOT FOUND!');
//     this.logger.error('Searched paths:');
//     possiblePaths.forEach(p => this.logger.error(`  - ${p}`));
//   }

//   private async _initMachineId(): Promise<void> {
//   // ✅ Strategy 0: Host Machine ID (Docker-safe & stable)
//   const hostMachineIdPath = process.env.MACHINE_ID_PATH;

//   if (hostMachineIdPath && fs.existsSync(hostMachineIdPath)) {
//     const hostId = fs.readFileSync(hostMachineIdPath, 'utf8').trim();
//     if (hostId.length > 10) {
//       this._machineId = hostId;
//       this.logger.log(`🏠 Host Machine ID loaded: ${this._machineId}`);
//       this._persistMachineId();
//       return;
//     }
//   }

//   // 🟡 Fallback ONLY for non-docker / dev
//   this.logger.warn('⚠️ Falling back to local machine-id strategies');

//   try {
//     const nodeMachineId = require('node-machine-id');
//     const id = nodeMachineId.machineIdSync(true);
//     if (id && id.length > 10) {
//       this._machineId = id;
//       this._persistMachineId();
//       return;
//     }
//   } catch {}

//   this._machineId = `FALLBACK-${Date.now()}`;
//   this._persistMachineId();
// }

//   private _persistMachineId() {
//     try {
//         // Ensure directory exists
//         const dir = path.dirname(this.machineIdFilePath);
//         if (!fs.existsSync(dir)) {
//             fs.mkdirSync(dir, { recursive: true });
//         }
        
//         fs.writeFileSync(this.machineIdFilePath, this._machineId, 'utf8');
//         this.logger.log(`💾 Machine ID persisted to: ${this.machineIdFilePath}`);
//     } catch (err: any) {
//         this.logger.error(`❌ Failed to persist Machine ID: ${err.message}`);
//     }
//   }

//   // ============================================================
//   // PUBLIC API
//   // ============================================================

//   getMachineId(): string {
//     return this._machineId;
//   }

//   getStatus(forceRefresh = false): LicenseStatus {
//     const now = Date.now();
//     if (!forceRefresh && this._cachedStatus && now - this._lastValidationTime < this.CACHE_TTL_MS) {
//       return this._cachedStatus;
//     }
//     return this._validateLicenseInternal();
//   }

//   get isValid(): boolean {
//     return this.getStatus().isValid;
//   }

//   get details(): LicensePayload | null {
//     const status = this.getStatus();
//     if (!status.isValid) return null;
//     return {
//       hwId: status.machineId,
//       hospitalName: status.hospitalName || '',
//       expiryDate: status.expiryDate || '',
//       plan: (status.plan as any) || 'BASIC',
//       maxUsers: status.maxUsers ?? 0,
//       modules: status.modules || [],
//     };
//   }

//   activateLicense(licenseKey: string): { success: boolean; message: string } {
//     // 🔄 Always reload key from disk to support Hot-Swap (docker cp)
//     this._loadPublicKey();

//     if (!this._publicKey) {
//       return { success: false, message: 'System error: No public key loaded.' };
//     }

//     try {
//       const decoded = jwt.verify(licenseKey.trim(), this._publicKey, {
//         algorithms: ['RS256'],
//       }) as LicensePayload;

//       if (decoded.hwId !== this._machineId) {
//         return {
//           success: false,
//           message: `هذا المفتاح لجهاز مختلف. المعرف المتوقع: ${decoded.hwId}`,
//         };
//       }

//       fs.writeFileSync(this.licenseFilePath, licenseKey.trim(), 'utf8');
//       this.logger.log(`✅ License file saved: ${this.licenseFilePath}`);

//       this._cachedStatus = null;
//       const newStatus = this._validateLicenseInternal();

//       if (newStatus.isValid) {
//         return { success: true, message: 'تم تفعيل الترخيص بنجاح!' };
//       } else {
//         return { success: false, message: newStatus.error || 'فشل التحقق من الترخيص.' };
//       }
//     } catch (err: any) {
//       this.logger.error(`Activation failed: ${err.message}`);
//       return { success: false, message: `مفتاح غير صالح: ${err.message}` };
//     }
//   }

//   isModuleEnabled(moduleName: string): boolean {
//     const status = this.getStatus();
//     if (!status.isValid || !status.modules) return false;
//     return status.modules.includes(moduleName.toUpperCase());
//   }

//   canAddUser(currentUserCount: number): boolean {
//     const status = this.getStatus();
//     if (!status.isValid) return false;
//     if (status.maxUsers === -1) return true;
//     return currentUserCount < (status.maxUsers ?? 0);
//   }

//   checkUserLimit(currentUserCount: number): boolean {
//     return this.canAddUser(currentUserCount);
//   }

//   // ============================================================
//   // INTERNAL VALIDATION
//   // ============================================================

//   private _generateFingerprint(machineId: string, hospitalName: string): string {
//   return crypto
//     .createHash('sha256')
//     .update(`${machineId}::${hospitalName}`)
//     .digest('hex');
// }

//   private _validateLicenseInternal(): LicenseStatus {
//     const baseStatus: LicenseStatus = {
//       isValid: false,
//       machineId: this._machineId,
//     };

//     if (!this._publicKey) {
//       baseStatus.error = 'System not configured: Missing public key.';
//       this._updateCache(baseStatus);
//       return baseStatus;
//     }

//     if (!fs.existsSync(this.licenseFilePath)) {
//       baseStatus.error = 'No license file found.';
//       baseStatus.licensePath = this.licenseFilePath;
//       this._updateCache(baseStatus);
//       return baseStatus;
//     }

//     try {
//       const token = fs.readFileSync(this.licenseFilePath, 'utf8').trim();
//       const decoded = jwt.verify(token, this._publicKey, {
//         algorithms: ['RS256'],
//       }) as LicensePayload;

//       if (decoded.hwId !== this._machineId) {
//         baseStatus.error = `Hardware mismatch. License for: ${decoded.hwId}`;
//         this._updateCache(baseStatus);
//         return baseStatus;
//       }

//       const expiryDate = new Date(decoded.expiryDate);
//       expiryDate.setHours(23, 59, 59, 999);
//       const now = new Date();

//       let isGracePeriod = false;
//       let daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

//       if (now > expiryDate) {
//         const daysPastExpiry = Math.abs(daysRemaining);
//         if (daysPastExpiry <= 7) {
//           isGracePeriod = true;
//           daysRemaining = 7 - daysPastExpiry;
//           this.logger.warn(`⚠️ License in GRACE PERIOD (${daysRemaining} days left)`);
//         } else {
//           baseStatus.error = `الترخيص منتهي منذ ${daysPastExpiry} يوم.`;
//           this._updateCache(baseStatus);
//           return baseStatus;
//         }
//       }

//       const validStatus: LicenseStatus = {
//         isValid: true,
//         machineId: this._machineId,
//         plan: decoded.plan,
//         hospitalName: decoded.hospitalName,
//         expiryDate: decoded.expiryDate,
//         maxUsers: decoded.maxUsers,
//         modules: decoded.modules,
//         isGracePeriod,
//         daysRemaining,
//         licensePath: this.licenseFilePath,
//       };

//       this.logger.log(
//         `✅ License Valid: ${decoded.hospitalName} | Plan: ${decoded.plan} | Expires: ${decoded.expiryDate}${isGracePeriod ? ' [GRACE]' : ''}`
//       );

//       this._updateCache(validStatus);
//       return validStatus;
//     } catch (err: any) {
//       baseStatus.error = `Verification failed: ${err.message}`;
//       this._updateCache(baseStatus);
//       return baseStatus;
//     }
//   }

//   private _updateCache(status: LicenseStatus) {
//     this._cachedStatus = status;
//     this._lastValidationTime = Date.now();
//   }
// }
