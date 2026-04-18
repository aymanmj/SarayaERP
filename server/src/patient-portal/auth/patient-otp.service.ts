/**
 * Patient OTP Service — Enterprise Implementation
 * 
 * Features:
 * - 6-digit OTP with bcrypt hashing (never stored in plaintext)
 * - 5-minute TTL with automatic expiry
 * - 3 max verification attempts (lockout protection)
 * - Rate limiting: max 5 OTPs per hour per patient
 * - Channel Strategy (console → WhatsApp → SMS → email)
 * - Old unverified OTPs are auto-invalidated on new request
 * 
 * Channel Architecture:
 * ┌─────────────────────────────────┐
 * │       OTP Service               │
 * │  generate() → deliver() → verify()  │
 * └──────────┬──────────────────────┘
 *            │ (Strategy Pattern)
 *   ┌────────┼────────┬────────────┐
 *   │        │        │            │
 * Console  WhatsApp  SMS        Email
 * (dev)    (prod v1) (prod v2)  (fallback)
 */

import { Injectable, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// ===========================================
// OTP Delivery Channel Interface
// ===========================================
export interface OtpChannel {
  readonly name: string;
  send(phone: string, code: string, patientName: string): Promise<boolean>;
}

// ===========================================
// Console Channel (Development)
// ===========================================
class ConsoleOtpChannel implements OtpChannel {
  readonly name = 'console';
  private readonly logger = new Logger('OTP-Console');

  async send(phone: string, code: string, patientName: string): Promise<boolean> {
    this.logger.warn(
      `\n` +
      `╔════════════════════════════════════════════╗\n` +
      `║  📱 OTP Code for Patient Portal            ║\n` +
      `╠════════════════════════════════════════════╣\n` +
      `║  Patient: ${patientName.padEnd(30)}  ║\n` +
      `║  Phone:   ${phone.padEnd(30)}  ║\n` +
      `║  Code:    ${code.padEnd(30)}  ║\n` +
      `║  Expires: 5 minutes                        ║\n` +
      `╚════════════════════════════════════════════╝`
    );
    return true;
  }
}

// ===========================================
// WhatsApp Channel (Production - Future)
// ===========================================
class WhatsAppOtpChannel implements OtpChannel {
  readonly name = 'whatsapp';
  private readonly logger = new Logger('OTP-WhatsApp');

  async send(phone: string, code: string, patientName: string): Promise<boolean> {
    // TODO: Integrate with WhatsApp Business API
    // Options:
    //   1. Meta Cloud API (graph.facebook.com/v18.0)
    //   2. Twilio WhatsApp Sandbox (free for dev)
    //   3. WATI / Infobip / MessageBird
    //
    // Template message example:
    // "مرحباً {patientName}، رمز التحقق الخاص بك لبوابة المريض في السرايا: {code}
    //  صالح لمدة 5 دقائق. لا تشاركه مع أحد."
    
    this.logger.log(`📨 WhatsApp OTP would be sent to ${phone} (not configured yet)`);
    
    // Fallback to console for now
    const consoleFallback = new ConsoleOtpChannel();
    return consoleFallback.send(phone, code, patientName);
  }
}

// ===========================================
// OTP Service
// ===========================================
@Injectable()
export class PatientOtpService {
  private readonly logger = new Logger(PatientOtpService.name);
  private readonly channel: OtpChannel;

  // Configuration
  private readonly OTP_LENGTH = 6;
  private readonly OTP_TTL_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_OTPS_PER_HOUR = 5;

  constructor(private prisma: PrismaService) {
    // Select channel based on environment
    const channelName = process.env.OTP_CHANNEL || 'console';
    
    switch (channelName) {
      case 'whatsapp':
        this.channel = new WhatsAppOtpChannel();
        break;
      case 'console':
      default:
        this.channel = new ConsoleOtpChannel();
        break;
    }
    
    this.logger.log(`📱 OTP Channel: ${this.channel.name}`);
  }

  /**
   * Generate and send OTP to the patient.
   * 
   * 1. Validates the patient exists with matching phone
   * 2. Rate-limits OTP requests (5/hour)
   * 3. Invalidates previous unverified OTPs
   * 4. Generates cryptographically secure 6-digit code
   * 5. Stores bcrypt hash in DB
   * 6. Delivers via configured channel
   */
  async requestOtp(mrn: string, phone: string) {
    // 1. Find patient by MRN + phone (prevents enumeration)
    const patient = await this.prisma.patient.findFirst({
      where: {
        mrn,
        phone,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true, fullName: true, hospitalId: true, mrn: true, phone: true },
    });

    if (!patient) {
      // Intentionally vague error to prevent user enumeration
      throw new UnauthorizedException('بيانات غير صحيحة. تأكد من رقم الملف ورقم الهاتف.');
    }

    // 2. Rate limit: max 5 OTPs per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtps = await this.prisma.patientOtp.count({
      where: {
        patientId: patient.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtps >= this.MAX_OTPS_PER_HOUR) {
      throw new BadRequestException(
        'تم تجاوز الحد الأقصى لطلبات رمز التحقق. يرجى المحاولة بعد ساعة.'
      );
    }

    // 3. Invalidate previous unverified OTPs
    await this.prisma.patientOtp.updateMany({
      where: {
        patientId: patient.id,
        verified: false,
      },
      data: { verified: true }, // Mark as consumed
    });

    // 4. Generate cryptographically secure 6-digit code
    const code = this.generateSecureCode();
    const hashedCode = await bcrypt.hash(code, 10);

    const expiresAt = new Date(Date.now() + this.OTP_TTL_MINUTES * 60 * 1000);

    // 5. Store in DB
    await this.prisma.patientOtp.create({
      data: {
        patientId: patient.id,
        code: hashedCode,
        expiresAt,
        channel: this.channel.name,
      },
    });

    // 6. Send via channel
    const delivered = await this.channel.send(
      patient.phone || phone,
      code,
      patient.fullName,
    );

    if (!delivered) {
      this.logger.error(`Failed to deliver OTP to patient ${patient.id}`);
      throw new BadRequestException('فشل إرسال رمز التحقق. يرجى المحاولة مرة أخرى.');
    }

    this.logger.log(`🔑 OTP requested for Patient/${patient.id} via ${this.channel.name}`);

    return {
      message: 'تم إرسال رمز التحقق بنجاح',
      expiresIn: this.OTP_TTL_MINUTES * 60, // seconds
      channel: this.channel.name,
    };
  }

  /**
   * Verify OTP and return patient data if valid.
   * 
   * Security:
   * - Max 3 attempts per OTP
   * - OTP expires after 5 minutes
   * - OTP is consumed after successful verification
   * - bcrypt comparison (timing-safe)
   */
  async verifyOtp(mrn: string, code: string) {
    // Find the patient
    const patient = await this.prisma.patient.findFirst({
      where: { mrn, isActive: true, isDeleted: false },
      select: { id: true, fullName: true, mrn: true, hospitalId: true },
    });

    if (!patient) {
      throw new UnauthorizedException('بيانات غير صحيحة.');
    }

    // Find the latest unverified OTP for this patient
    const otp = await this.prisma.patientOtp.findFirst({
      where: {
        patientId: patient.id,
        verified: false,
        expiresAt: { gt: new Date() }, // Not expired
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('رمز التحقق منتهي الصلاحية أو غير موجود. اطلب رمزاً جديداً.');
    }

    // Check attempts
    if (otp.attempts >= this.MAX_ATTEMPTS) {
      // Invalidate this OTP
      await this.prisma.patientOtp.update({
        where: { id: otp.id },
        data: { verified: true },
      });
      throw new UnauthorizedException('تم تجاوز عدد المحاولات المسموحة. اطلب رمزاً جديداً.');
    }

    // Increment attempts
    await this.prisma.patientOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    // Verify the code (timing-safe bcrypt comparison)
    const isValid = await bcrypt.compare(code, otp.code);

    if (!isValid) {
      const remaining = this.MAX_ATTEMPTS - otp.attempts - 1;
      throw new UnauthorizedException(
        `رمز التحقق غير صحيح. ${remaining > 0 ? `لديك ${remaining} محاولة متبقية.` : 'اطلب رمزاً جديداً.'}`
      );
    }

    // Mark OTP as verified (consumed)
    await this.prisma.patientOtp.update({
      where: { id: otp.id },
      data: { verified: true },
    });

    this.logger.log(`✅ OTP verified for Patient/${patient.id}`);

    return patient;
  }

  /**
   * Generate a cryptographically secure 6-digit code.
   * Uses crypto.randomInt for uniform distribution.
   */
  private generateSecureCode(): string {
    const min = Math.pow(10, this.OTP_LENGTH - 1); // 100000
    const max = Math.pow(10, this.OTP_LENGTH) - 1;  // 999999
    const code = crypto.randomInt(min, max + 1);
    return code.toString();
  }
}
