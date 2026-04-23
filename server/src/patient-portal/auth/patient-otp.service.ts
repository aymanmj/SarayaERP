/**
 * Patient OTP Service — Enterprise Implementation
 * 
 * Features:
 * - 6-digit OTP with bcrypt hashing (never stored in plaintext)
 * - 5-minute TTL with automatic expiry
 * - 3 max verification attempts (lockout protection)
 * - Rate limiting: max 5 OTPs per hour per patient
 * - Telegram Deep Linking for zero-friction account binding
 * - Channel Strategy: Telegram → Email → Console (fallback)
 * - Old unverified OTPs are auto-invalidated on new request
 * 
 * Authentication Flow:
 * ┌──────────────────────────────────────────────────┐
 * │  1. Patient enters MRN + Phone                   │
 * │  2. If Telegram linked → OTP sent directly       │
 * │  3. If NOT linked → Deep Link URL returned       │
 * │  4. Patient clicks link → Bot receives /start    │
 * │  5. Webhook links account + sends OTP instantly  │
 * └──────────────────────────────────────────────────┘
 */

import { Injectable, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import axios from 'axios';
import * as nodemailer from 'nodemailer';

// ===========================================
// OTP Delivery Channel Interface
// ===========================================
export interface OtpRecipientInfo {
  phone: string;
  patientName: string;
  email?: string | null;
  telegramChatId?: string | null;
}

export interface OtpChannel {
  readonly name: string;
  send(recipient: OtpRecipientInfo, code: string): Promise<boolean>;
}

// ===========================================
// Console Channel (Development)
// ===========================================
class ConsoleOtpChannel implements OtpChannel {
  readonly name = 'console';
  private readonly logger = new Logger('OTP-Console');

  async send(recipient: OtpRecipientInfo, code: string): Promise<boolean> {
    this.logger.warn(
      `\n` +
      `╔════════════════════════════════════════════╗\n` +
      `║  📱 OTP Code for Patient Portal            ║\n` +
      `╠════════════════════════════════════════════╣\n` +
      `║  Patient: ${recipient.patientName.padEnd(30)}  ║\n` +
      `║  Phone:   ${recipient.phone.padEnd(30)}  ║\n` +
      `║  Code:    ${code.padEnd(30)}  ║\n` +
      `║  Expires: 5 minutes                        ║\n` +
      `╚════════════════════════════════════════════╝`
    );
    return true;
  }
}

// ===========================================
// Telegram Channel (Primary)
// ===========================================
class TelegramOtpChannel implements OtpChannel {
  readonly name = 'telegram';
  private readonly logger = new Logger('OTP-Telegram');

  async send(recipient: OtpRecipientInfo, code: string): Promise<boolean> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken || !recipient.telegramChatId) {
      this.logger.warn(`Telegram is not configured or patient has no chat_id.`);
      return false; // Will fallback
    }

    try {
      this.logger.log(`📨 Sending Telegram OTP to Chat ID: ${recipient.telegramChatId}`);
      
      const message = `أهلاً ${recipient.patientName}،\n\nرمز التحقق الخاص بك هو: *${code}*\n\nالرمز صالح لمدة 5 دقائق.`;
      
      const response = await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          chat_id: recipient.telegramChatId,
          text: message,
          parse_mode: 'Markdown'
        },
        { timeout: 5000 }
      );

      if (response.status === 200) {
        this.logger.log(`✅ Telegram OTP successfully dispatched.`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send Telegram OTP. Error: ${error.message}`);
      return false;
    }
  }
}

// ===========================================
// Email Channel (Secondary / Fallback)
// ===========================================
class EmailOtpChannel implements OtpChannel {
  readonly name = 'email';
  private readonly logger = new Logger('OTP-Email');

  async send(recipient: OtpRecipientInfo, code: string): Promise<boolean> {
    if (!recipient.email) {
      this.logger.warn(`Patient has no email address. Cannot send Email OTP.`);
      return false;
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || 'noreply@sarayaerp.com';

    if (!host || !user || !pass) {
      this.logger.warn(`SMTP is not configured properly. Missing SMTP credentials.`);
      return false;
    }

    try {
      this.logger.log(`📨 Sending Email OTP to: ${recipient.email}`);
      
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: `"Saraya Patient Portal" <${from}>`,
        to: recipient.email,
        subject: 'رمز الدخول الخاص بك (OTP) - Saraya',
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right; padding: 20px; color: #333;">
            <h2>مرحباً ${recipient.patientName}،</h2>
            <p>رمز الدخول الخاص بك إلى بوابة المريض هو:</p>
            <h1 style="color: #2563eb; letter-spacing: 5px; font-size: 32px; background: #f3f4f6; padding: 15px; border-radius: 8px; display: inline-block;">${code}</h1>
            <p>هذا الرمز صالح لمدة 5 دقائق. يرجى عدم مشاركته مع أي شخص.</p>
          </div>
        `
      });

      this.logger.log(`✅ Email OTP successfully dispatched.`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send Email OTP. Error: ${error.message}`);
      return false;
    }
  }
}

// ===========================================
// OTP Service
// ===========================================
@Injectable()
export class PatientOtpService {
  private readonly logger = new Logger(PatientOtpService.name);
  private readonly telegramChannel = new TelegramOtpChannel();
  private readonly emailChannel = new EmailOtpChannel();
  private readonly consoleChannel = new ConsoleOtpChannel();

  // Configuration
  private readonly OTP_LENGTH = 6;
  private readonly OTP_TTL_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_OTPS_PER_HOUR = 5;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    this.logger.log(`📱 OTP Channels configured: Telegram -> Email -> Console`);
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
    const cleanMrn = mrn?.trim() || '';
    const cleanPhone = phone?.trim().replace(/\s+/g, '') || '';

    this.logger.debug(`Searching for patient - MRN: '${cleanMrn}', Phone: '${cleanPhone}'`);

    // 1. Find patient by MRN (case-insensitive)
    const patient = await this.prisma.patient.findFirst({
      where: {
        mrn: { equals: cleanMrn, mode: 'insensitive' },
        isActive: true,
        isDeleted: false,
      },
      select: { id: true, fullName: true, hospitalId: true, mrn: true, phone: true, telegramChatId: true, email: true },
    });

    if (!patient) {
      this.logger.warn(`Failed login attempt - MRN: '${cleanMrn}' not found or inactive.`);
      throw new UnauthorizedException('بيانات غير صحيحة. تأكد من رقم الملف ورقم الهاتف.');
    }

    // 2. Validate phone number (ignore spaces, dashes, and country code)
    const decryptedDbPhone = this.encryptionService.decrypt(patient.phone) || '';
    const dbPhone = decryptedDbPhone.replace(/\D/g, '');
    const inputPhone = cleanPhone.replace(/\D/g, '');

    if (!dbPhone.endsWith(inputPhone) || inputPhone.length < 6) {
      this.logger.warn(`Failed login attempt - MRN: '${cleanMrn}' exists, but phone mismatch. DB Phone (digits only): '${dbPhone}', Input: '${inputPhone}'`);
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

    // 4. Deep Linking Check: If Telegram is not linked, return a deep link URL.
    //    No OTP is generated at this stage — OTP will be generated by the webhook
    //    after the patient successfully links via Telegram.
    if (!patient.telegramChatId) {
      const linkToken = randomUUID();
      const linkExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
      
      await this.prisma.patient.update({
        where: { id: patient.id },
        data: {
          telegramLinkToken: linkToken,
          telegramLinkExpiresAt: linkExpiresAt
        }
      });

      const botUrl = process.env.TELEGRAM_BOT_URL || 'https://t.me/SarayaMedBot';
      const linkUrl = `${botUrl}?start=${linkToken}`;

      this.logger.log(`🔗 Deep link generated for Patient/${patient.id} — awaiting Telegram binding`);

      return {
        requiresTelegramLinking: true,
        linkUrl,
        message: 'يرجى ربط حسابك عبر تيليجرام لاستلام رمز الدخول.',
        expiresAt: linkExpiresAt
      };
    }

    // 5. Generate cryptographically secure 6-digit code
    const code = this.generateSecureCode();
    const hashedCode = await bcrypt.hash(code, 10);

    const expiresAt = new Date(Date.now() + this.OTP_TTL_MINUTES * 60 * 1000);

    // 6. Store hashed OTP in DB
    const otpRecord = await this.prisma.patientOtp.create({
      data: {
        patientId: patient.id,
        code: hashedCode,
        expiresAt,
        channel: 'pending',
      },
    });

    const recipient: OtpRecipientInfo = {
      phone: patient.phone || phone,
      patientName: patient.fullName,
      email: patient.email,
      telegramChatId: patient.telegramChatId,
    };

    // 6. Send via channel (Fallback Logic: Telegram -> Email -> Console)
    let delivered = false;
    let usedChannel = '';

    // Attempt 1: Telegram
    delivered = await this.telegramChannel.send(recipient, code);
    if (delivered) {
      usedChannel = this.telegramChannel.name;
    }

    // Attempt 2: Email (Fallback)
    if (!delivered) {
      delivered = await this.emailChannel.send(recipient, code);
      if (delivered) {
        usedChannel = this.emailChannel.name;
      }
    }

    // Attempt 3: Console (Development Fallback)
    if (!delivered) {
      delivered = await this.consoleChannel.send(recipient, code);
      if (delivered) {
        usedChannel = this.consoleChannel.name;
      }
    }

    if (!delivered) {
      this.logger.error(`Failed to deliver OTP to patient ${patient.id} via any channel`);
      throw new BadRequestException('فشل إرسال رمز التحقق. يرجى المحاولة مرة أخرى.');
    }

    // Update the DB record with the actual channel used
    await this.prisma.patientOtp.update({
      where: { id: otpRecord.id },
      data: { channel: usedChannel }
    });

    this.logger.log(`🔑 OTP requested for Patient/${patient.id} via ${usedChannel}`);

    return {
      message: 'تم إرسال رمز التحقق بنجاح',
      expiresIn: this.OTP_TTL_MINUTES * 60, // seconds
      channel: usedChannel,
    };
  }

  /**
   * Used by Webhook to immediately send OTP after linking.
   */
  async generateAndSendOtpForPatient(patientId: number, chatId: string): Promise<boolean> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId }
    });
    
    if (!patient) return false;

    // Invalidate previous unverified OTPs
    await this.prisma.patientOtp.updateMany({
      where: { patientId: patient.id, verified: false },
      data: { verified: true },
    });

    const code = this.generateSecureCode();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.patientOtp.create({
      data: {
        patientId: patient.id,
        code: hashedCode,
        expiresAt,
        channel: 'telegram',
      },
    });

    const recipient: OtpRecipientInfo = {
      phone: patient.phone || '',
      patientName: patient.fullName,
      telegramChatId: chatId,
    };

    return await this.telegramChannel.send(recipient, code);
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
    const cleanMrn = mrn?.trim() || '';

    // Find the patient
    const patient = await this.prisma.patient.findFirst({
      where: { 
        mrn: { equals: cleanMrn, mode: 'insensitive' }, 
        isActive: true, 
        isDeleted: false 
      },
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
