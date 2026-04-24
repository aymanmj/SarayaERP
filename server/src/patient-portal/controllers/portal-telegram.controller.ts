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
 * 
 * Webhook Registration:
 * - Automatic on startup when TELEGRAM_WEBHOOK_URL is set
 * - Manual via POST /api/patient-portal/v1/telegram/register-webhook
 * - Status check via GET /api/patient-portal/v1/telegram/status
 */

import { Controller, Post, Get, Body, Logger, HttpCode, HttpStatus, OnModuleInit } from '@nestjs/common';
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
    // ── Load Bot Token ──────────────────────────────────────
    try {
      const token =
        await this.vaultService.getOptionalSecret('TELEGRAM_BOT_TOKEN')
        || process.env.TELEGRAM_BOT_TOKEN
        || null;

      if (token) {
        this.botToken = token;
        this.logger.log(`✅ Telegram Bot Token loaded (${token.substring(0, 6)}...)`);
      } else {
        this.logger.warn('⚠️ TELEGRAM_BOT_TOKEN not configured — webhook responses disabled');
        return; // No point registering webhook without a token
      }
    } catch (err: any) {
      const fallback = process.env.TELEGRAM_BOT_TOKEN;
      if (fallback) {
        this.botToken = fallback;
        this.logger.warn(`⚠️ Vault unreachable, using TELEGRAM_BOT_TOKEN from env (${fallback.substring(0, 6)}...)`);
      } else {
        this.logger.warn(`⚠️ Failed to load Telegram Bot Token: ${err.message}`);
        return;
      }
    }

    // ── Auto-register Webhook ───────────────────────────────
    const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL;
    if (webhookBaseUrl) {
      // Give the server a moment to finish booting
      setTimeout(() => this.registerWebhookInternal(webhookBaseUrl), 3000);
    } else {
      this.logger.warn(
        '⚠️ TELEGRAM_WEBHOOK_URL not set — skipping auto webhook registration. ' +
        'Set it to your public URL (e.g. https://your-domain.com/api) to enable.'
      );
    }
  }

  // ===========================================
  //  Webhook Registration
  // ===========================================

  /**
   * Internal helper to register the webhook with Telegram.
   */
  private async registerWebhookInternal(baseUrl: string): Promise<{ success: boolean; message: string }> {
    if (!this.botToken) {
      const msg = 'Cannot register webhook — BOT_TOKEN not configured';
      this.logger.warn(msg);
      return { success: false, message: msg };
    }

    // Build the full webhook URL
    const cleanBase = baseUrl.replace(/\/+$/, ''); // Remove trailing slash
    const webhookUrl = `${cleanBase}/patient-portal/v1/telegram/webhook`;

    try {
      this.logger.log(`📡 Registering Telegram webhook → ${webhookUrl}`);

      const response = await axios.post(
        `https://api.telegram.org/bot${this.botToken}/setWebhook`,
        {
          url: webhookUrl,
          allowed_updates: ['message'], // Only message updates (not edits, etc.)
          drop_pending_updates: false,
        },
        { timeout: 10000 }
      );

      if (response.data?.ok) {
        this.logger.log(`✅ Telegram webhook registered successfully at: ${webhookUrl}`);
        return { success: true, message: `Webhook registered: ${webhookUrl}` };
      } else {
        const errMsg = `Telegram API returned: ${JSON.stringify(response.data)}`;
        this.logger.error(`❌ Webhook registration failed — ${errMsg}`);
        return { success: false, message: errMsg };
      }
    } catch (error: any) {
      const errMsg = `Webhook registration error: ${error.message}`;
      this.logger.error(`❌ ${errMsg}`);
      return { success: false, message: errMsg };
    }
  }

  /**
   * Manual webhook registration endpoint.
   * POST /api/patient-portal/v1/telegram/register-webhook
   * 
   * Can be called manually to re-register the webhook if needed.
   * Uses TELEGRAM_WEBHOOK_URL from environment.
   */
  @Post('register-webhook')
  @HttpCode(HttpStatus.OK)
  async registerWebhook() {
    const baseUrl = process.env.TELEGRAM_WEBHOOK_URL;
    if (!baseUrl) {
      return {
        success: false,
        message: 'TELEGRAM_WEBHOOK_URL is not configured. Set it in your environment variables.',
      };
    }
    return this.registerWebhookInternal(baseUrl);
  }

  /**
   * Diagnostic endpoint to check bot status and webhook configuration.
   * GET /api/patient-portal/v1/telegram/status
   */
  @Get('status')
  async getStatus() {
    const result: any = {
      botTokenConfigured: !!this.botToken,
      webhookUrlConfigured: !!process.env.TELEGRAM_WEBHOOK_URL,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || null,
      botUrl: process.env.TELEGRAM_BOT_URL || null,
      timestamp: new Date().toISOString(),
    };

    // Check bot info from Telegram API
    if (this.botToken) {
      try {
        const [meResponse, webhookResponse] = await Promise.all([
          axios.get(`https://api.telegram.org/bot${this.botToken}/getMe`, { timeout: 5000 }),
          axios.get(`https://api.telegram.org/bot${this.botToken}/getWebhookInfo`, { timeout: 5000 }),
        ]);

        result.bot = {
          id: meResponse.data?.result?.id,
          username: meResponse.data?.result?.username,
          firstName: meResponse.data?.result?.first_name,
          isBot: meResponse.data?.result?.is_bot,
        };

        const webhookInfo = webhookResponse.data?.result;
        result.webhook = {
          url: webhookInfo?.url || '(not set)',
          hasCustomCertificate: webhookInfo?.has_custom_certificate,
          pendingUpdateCount: webhookInfo?.pending_update_count,
          lastErrorDate: webhookInfo?.last_error_date
            ? new Date(webhookInfo.last_error_date * 1000).toISOString()
            : null,
          lastErrorMessage: webhookInfo?.last_error_message || null,
          maxConnections: webhookInfo?.max_connections,
        };
      } catch (error: any) {
        result.error = `Failed to query Telegram API: ${error.message}`;
      }
    }

    return result;
  }

  // ===========================================
  //  Webhook Handler
  // ===========================================

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
