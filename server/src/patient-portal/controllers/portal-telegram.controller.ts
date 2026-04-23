/**
 * Patient Portal — Telegram Webhook Controller
 * 
 * Handles incoming Telegram Bot updates via webhook.
 * Supports two account-linking flows:
 * 
 * 1. **Deep Linking (Primary)**: Patient clicks a personalized link from the
 *    login page → `/start <UUID>` → account is linked and OTP sent instantly.
 * 
 * 2. **Contact Sharing (Legacy)**: Patient manually shares their phone number
 *    via the Telegram keyboard button → account is linked by phone match.
 * 
 * Webhook URL: POST /api/patient-portal/v1/telegram/webhook
 */

import { Controller, Post, Body, Logger, HttpCode, HttpStatus, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { VaultService } from '../../common/vault/vault.service';
import { PatientOtpService } from '../auth/patient-otp.service';
import axios from 'axios';

@Controller('patient-portal/v1/telegram')
export class PortalTelegramController implements OnModuleInit {
  private readonly logger = new Logger(PortalTelegramController.name);
  private botToken: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly vaultService: VaultService,
    private readonly otpService: PatientOtpService
  ) {}

  async onModuleInit() {
    try {
      const token = await this.vaultService.getOptionalSecret('TELEGRAM_BOT_TOKEN');
      if (token) {
        this.botToken = token;
        this.logger.log(`✅ Telegram Bot Token loaded from Vault (${token.substring(0, 6)}...)`);
      } else {
        this.logger.warn('⚠️ TELEGRAM_BOT_TOKEN not found in Vault — webhook responses disabled');
      }
    } catch (err: any) {
      this.logger.warn(`⚠️ Failed to load Telegram Bot Token: ${err.message}`);
    }
  }

  /**
   * Webhook endpoint to receive updates from Telegram Bot.
   * Always returns 200 OK to prevent Telegram from retrying.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() update: any) {
    this.logger.debug(`Received Telegram Webhook Update`);

    try {
      if (update.message && update.message.contact) {
        await this.handleContactSharing(update.message);
      } else if (update.message?.text?.startsWith('/start')) {
        await this.handleStartCommand(update.message);
      }
    } catch (error: any) {
      this.logger.error(`Error processing Telegram webhook: ${error.message}`);
    }

    // Always return 200 OK to Telegram so they stop retrying
    return { ok: true };
  }

  // ===========================================
  //  Deep Linking: /start <UUID>
  // ===========================================
  private async handleStartCommand(message: any) {
    const chatId = message.chat.id.toString();
    const text = message.text.trim();
    const parts = text.split(' ');

    // Deep linking flow: /start <UUID>
    if (parts.length === 2 && parts[1].length > 10) {
      const linkToken = parts[1];
      this.logger.log(`Received deep link /start from Chat ID: ${chatId} with token: ${linkToken}`);

      const patient = await this.prisma.patient.findFirst({
        where: {
          telegramLinkToken: linkToken,
          telegramLinkExpiresAt: { gt: new Date() },
          isActive: true,
          isDeleted: false
        }
      });

      if (patient) {
        // Valid token found! Link the account.
        await this.prisma.patient.update({
          where: { id: patient.id },
          data: {
            telegramChatId: chatId,
            telegramLinkToken: null,
            telegramLinkExpiresAt: null
          }
        });

        this.logger.log(`✅ Deep-linked Patient ${patient.mrn} to Chat ID ${chatId}`);

        // Send activation confirmation
        await this.sendTelegramMessage(chatId, 'تم تفعيل حسابك بنجاح! يتم الآن إرسال رمز الدخول... ✅');

        // Generate and send OTP immediately
        const otpSent = await this.otpService.generateAndSendOtpForPatient(patient.id, chatId);
        if (!otpSent) {
          this.logger.error(`Failed to send OTP after deep-linking Patient ${patient.mrn}`);
        }
        return;
      }

      // Invalid or expired token
      this.logger.warn(`Invalid or expired link token received: ${linkToken}`);
      await this.sendTelegramMessage(
        chatId,
        'رابط التفعيل غير صالح أو منتهي الصلاحية. يرجى المحاولة مرة أخرى من بوابة المريض.'
      );
      return;
    }

    // Normal /start flow (no UUID — fallback to contact sharing prompt)
    this.logger.log(`Received normal /start command from Chat ID: ${chatId}`);
    await this.sendTelegramMessage(
      chatId,
      'مرحباً بك في بوابة المرضى التابعة لـ Saraya ERP.\nيرجى مشاركة رقم هاتفك لربط حسابك وتلقي الإشعارات ورموز التحقق.',
      {
        keyboard: [[{ text: 'مشاركة رقم الهاتف 📱', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    );
  }

  // ===========================================
  //  Contact Sharing (Legacy Flow)
  // ===========================================
  private async handleContactSharing(message: any) {
    const chatId = message.chat.id.toString();
    const phoneNumber = message.contact.phone_number;

    // Clean phone number (e.g., removing +, handling local vs international)
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '218' + cleanPhone.substring(1);
    else if (cleanPhone.length === 9) cleanPhone = '218' + cleanPhone;

    // Fetch patients to find a match.
    // In a large db, phoneHash should be used. For now, we iterate active patients and decrypt.
    const patients = await this.prisma.patient.findMany({
      where: { isActive: true, isDeleted: false },
      select: { id: true, mrn: true, phone: true }
    });

    const matchedPatient = patients.find(p => {
      if (!p.phone) return false;
      try {
        const decryptedPhone = this.encryptionService.decrypt(p.phone);
        if (!decryptedPhone) return false;
        const pPhone = decryptedPhone.replace(/\D/g, '');
        return pPhone.endsWith(cleanPhone) || cleanPhone.endsWith(pPhone);
      } catch (e) {
        return false;
      }
    });

    if (matchedPatient) {
      await this.prisma.patient.update({
        where: { id: matchedPatient.id },
        data: { telegramChatId: chatId }
      });

      this.logger.log(`Linked Telegram Chat ID ${chatId} to Patient ${matchedPatient.mrn}`);
      await this.sendTelegramMessage(
        chatId,
        'تم تفعيل خدمة تلقي رموز التحقق (OTP) والإشعارات لحسابك بنجاح. ✅'
      );
    } else {
      this.logger.warn(`Received contact ${phoneNumber} but no matching patient found.`);
      await this.sendTelegramMessage(
        chatId,
        'لم يتم العثور على ملف طبي مرتبط بهذا الرقم. يرجى التأكد من رقم هاتفك أو مراجعة قسم الاستقبال.'
      );
    }
  }

  // ===========================================
  //  Telegram API Helper
  // ===========================================
  private async sendTelegramMessage(chatId: string, text: string, replyMarkup?: any): Promise<void> {
    if (!this.botToken) {
      this.logger.warn('Cannot send Telegram message — BOT_TOKEN not configured');
      return;
    }

    try {
      const payload: any = { chat_id: chatId, text };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }
      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        payload,
        { timeout: 5000 }
      );
    } catch (e: any) {
      this.logger.error(`Failed to send Telegram message to ${chatId}: ${e.message}`);
    }
  }
}
