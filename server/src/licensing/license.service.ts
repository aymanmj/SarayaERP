// server/src/licensing/license.service.ts
// Professional Licensing System 4.0
// Docker-safe • Host-bound • Smart Renewal • Grace Period Fix

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
  plan: string;
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
  isExpired?: boolean;
  daysRemaining?: number;
  graceDaysRemaining?: number;
  error?: string;
  licensePath?: string;
}

export interface RenewalResult {
  success: boolean;
  message: string;
  newExpiryDate?: string;
  bonusDays?: number;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);

  // Grace period = exactly 7 full days
  private readonly GRACE_PERIOD_DAYS = 7;

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
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

  // ============================================================
  // INIT
  // ============================================================

  async onModuleInit() {
    this.logger.log('🔑 Initializing License Service v4.0...');
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
  // ACTIVATION (New install / First time)
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

      // Write the new license file
      const dir = path.dirname(this.licenseFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.licenseFilePath, key, 'utf8');

      // Invalidate cache to force re-validation
      this._cachedStatus = null;
      this._lastValidationTime = 0;

      this.logger.log(`✅ License activated for ${decoded.hospitalName}, expires ${decoded.expiryDate}`);

      return { success: true, message: 'تم تفعيل الترخيص بنجاح' };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  // ============================================================
  // RENEWAL (Smart renewal with remaining days)
  // ============================================================

  renewLicense(key: string): RenewalResult {
    if (!this._publicKey) {
      return { success: false, message: 'Public key missing' };
    }

    try {
      // 1. Decode the new license key
      const newLicense = jwt.verify(key, this._publicKey, {
        algorithms: ['RS256'],
      }) as LicensePayload;

      // 2. Validate machine ID
      if (newLicense.hwId !== this._machineId) {
        return { success: false, message: 'كود الجهاز غير مطابق. هذا المفتاح خاص بجهاز آخر.' };
      }

      // 3. Validate fingerprint
      const expectedFp = this._generateFingerprint(
        this._machineId,
        newLicense.hospitalName,
      );
      if (newLicense.hwFingerprint !== expectedFp) {
        return { success: false, message: 'بصمة الترخيص غير مطابقة.' };
      }

      // 4. Calculate bonus days from current license
      let bonusDays = 0;
      const currentStatus = this.getStatus(true);

      if (currentStatus.isValid && !currentStatus.isGracePeriod && !currentStatus.isExpired) {
        // License is still active and not in grace period → add remaining days
        const currentExpiry = new Date(currentStatus.expiryDate!);
        currentExpiry.setHours(23, 59, 59, 999);
        const now = new Date();
        const remainingMs = currentExpiry.getTime() - now.getTime();

        if (remainingMs > 0) {
          bonusDays = Math.floor(remainingMs / 86400000);
          this.logger.log(`📅 Remaining days from current license: ${bonusDays}`);
        }
      }

      // 5. Calculate new expiry date
      const newExpiry = new Date(newLicense.expiryDate);
      if (bonusDays > 0) {
        newExpiry.setDate(newExpiry.getDate() + bonusDays);
      }
      const finalExpiryDate = newExpiry.toISOString().split('T')[0];

      // 6. Create a modified payload with the adjusted expiry
      //    We re-sign if we have remaining days (bonus), otherwise just use the new key as-is
      if (bonusDays > 0) {
        // We need to create a new JWT with the adjusted expiry
        // But we only have the public key on server... so we store metadata separately
        // Strategy: Store the new license + bonus days metadata
        this._storeLicenseWithBonus(key, bonusDays, finalExpiryDate);
      } else {
        // No bonus days - just replace the license file
        const dir = path.dirname(this.licenseFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.licenseFilePath, key, 'utf8');
        // Clean up any bonus metadata
        this._clearBonusMetadata();
      }

      // 7. Invalidate cache
      this._cachedStatus = null;
      this._lastValidationTime = 0;

      this.logger.log(
        `🔄 License renewed for ${newLicense.hospitalName}. ` +
        `New expiry: ${finalExpiryDate} (bonus: +${bonusDays} days)`,
      );

      return {
        success: true,
        message: bonusDays > 0
          ? `تم تجديد الاشتراك بنجاح! تمت إضافة ${bonusDays} يوم متبقي من الاشتراك السابق. ينتهي في ${finalExpiryDate}`
          : `تم تجديد الاشتراك بنجاح! ينتهي في ${finalExpiryDate}`,
        newExpiryDate: finalExpiryDate,
        bonusDays,
      };
    } catch (e: any) {
      this.logger.error(`❌ Renewal failed: ${e.message}`);
      return { success: false, message: `فشل التجديد: ${e.message}` };
    }
  }

  // ============================================================
  // BONUS DAYS METADATA (for remaining days carry-over)
  // ============================================================

  private get _bonusMetadataPath(): string {
    return path.join(path.dirname(this.licenseFilePath), 'renewal.meta.json');
  }

  private _storeLicenseWithBonus(licenseKey: string, bonusDays: number, adjustedExpiry: string) {
    const dir = path.dirname(this.licenseFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Save the license key
    fs.writeFileSync(this.licenseFilePath, licenseKey, 'utf8');

    // Save bonus metadata
    const metadata = {
      bonusDays,
      adjustedExpiryDate: adjustedExpiry,
      renewedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this._bonusMetadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  private _loadBonusMetadata(): { bonusDays: number; adjustedExpiryDate: string } | null {
    try {
      if (fs.existsSync(this._bonusMetadataPath)) {
        const raw = fs.readFileSync(this._bonusMetadataPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch {
      // Ignore corrupt metadata
    }
    return null;
  }

  private _clearBonusMetadata() {
    try {
      if (fs.existsSync(this._bonusMetadataPath)) {
        fs.unlinkSync(this._bonusMetadataPath);
      }
    } catch {
      // Ignore
    }
  }

  // ============================================================
  // VALIDATION (Fixed Grace Period Calculation)
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

      // ── Determine effective expiry date ──
      // Check for bonus days from renewal
      const bonusMeta = this._loadBonusMetadata();
      let effectiveExpiryStr = decoded.expiryDate;
      if (bonusMeta?.adjustedExpiryDate) {
        effectiveExpiryStr = bonusMeta.adjustedExpiryDate;
      }

      const expiry = new Date(effectiveExpiryStr);
      expiry.setHours(23, 59, 59, 999);
      const now = new Date();

      // ── Calculate days remaining ──
      const diffMs = expiry.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / 86400000);

      // ── License is still active (not expired) ──
      if (now <= expiry) {
        return this._cache({
          isValid: true,
          machineId: this._machineId,
          hospitalName: decoded.hospitalName,
          plan: decoded.plan,
          expiryDate: effectiveExpiryStr,
          maxUsers: decoded.maxUsers,
          modules: decoded.modules,
          isGracePeriod: false,
          isExpired: false,
          daysRemaining: Math.max(0, daysRemaining),
          licensePath: this.licenseFilePath,
        });
      }

      // ── License expired - check grace period ──
      const daysPastExpiry = Math.floor(
        (now.getTime() - expiry.getTime()) / 86400000,
      );

      if (daysPastExpiry < this.GRACE_PERIOD_DAYS) {
        // In grace period
        const graceDaysLeft = this.GRACE_PERIOD_DAYS - daysPastExpiry;

        this.logger.warn(
          `⏳ Grace period: day ${daysPastExpiry + 1}/${this.GRACE_PERIOD_DAYS}, ` +
          `${graceDaysLeft} days left`,
        );

        return this._cache({
          isValid: true,
          machineId: this._machineId,
          hospitalName: decoded.hospitalName,
          plan: decoded.plan,
          expiryDate: effectiveExpiryStr,
          maxUsers: decoded.maxUsers,
          modules: decoded.modules,
          isGracePeriod: true,
          isExpired: true,
          daysRemaining: 0,
          graceDaysRemaining: graceDaysLeft,
          licensePath: this.licenseFilePath,
        });
      }

      // ── Grace period exhausted - license is dead ──
      this.logger.error(
        `❌ License expired ${daysPastExpiry} days ago. Grace period (${this.GRACE_PERIOD_DAYS} days) exhausted.`,
      );
      base.error = 'License expired';
      base.isExpired = true;
      return this._cache(base);
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
