import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { PatientOtpService } from '../auth/patient-otp.service';
import axios from 'axios';

@Controller('patient-portal/v1/telegram')
export class PortalTelegramController {
  private readonly logger = new Logger(PortalTelegramController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly otpService: PatientOtpService
  ) {}

  /**
   * Webhook endpoint to receive updates from Telegram Bot.
   * Configure this URL in your Telegram Bot using setWebhook.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() update: any) {
    this.logger.debug(`Received Telegram Webhook Update`);

    try {
      if (update.message && update.message.contact) {
        // User shared their contact info via Telegram button
        const chatId = update.message.chat.id.toString();
        const phoneNumber = update.message.contact.phone_number;

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

        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (matchedPatient) {
          await this.prisma.patient.update({
            where: { id: matchedPatient.id },
            data: { telegramChatId: chatId }
          });
          
          this.logger.log(`Linked Telegram Chat ID ${chatId} to Patient ${matchedPatient.mrn}`);
          
          // Send welcome/success message via Telegram API
          if (botToken) {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: chatId,
              text: 'تم تفعيل خدمة تلقي رموز التحقق (OTP) والإشعارات لحسابك بنجاح. ✅',
            }).catch(e => this.logger.error(`Failed to send telegram welcome message: ${e.message}`));
          }
        } else {
          this.logger.warn(`Received contact ${phoneNumber} but no matching patient found.`);
          if (botToken) {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: chatId,
              text: 'لم يتم العثور على ملف طبي مرتبط بهذا الرقم. يرجى التأكد من رقم هاتفك أو مراجعة قسم الاستقبال.',
            }).catch(e => this.logger.error(`Failed to send telegram failure message: ${e.message}`));
          }
        }
      } else if (update.message && update.message.text && update.message.text.startsWith('/start')) {
          const chatId = update.message.chat.id.toString();
          const text = update.message.text.trim();
          const parts = text.split(' ');
          const botToken = process.env.TELEGRAM_BOT_TOKEN;

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

              this.logger.log(`Successfully deep-linked Patient ${patient.mrn} to Chat ID ${chatId}`);

              // Immediately generate and send OTP
              if (botToken) {
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  chat_id: chatId,
                  text: 'تم تفعيل حسابك بنجاح! يتم الآن إرسال رمز الدخول...',
                }).catch(e => this.logger.error(`Failed to send telegram welcome message: ${e.message}`));
              }

              // Send actual OTP using the service
              await this.otpService.generateAndSendOtpForPatient(patient.id, chatId);
              return { ok: true };
            } else {
              this.logger.warn(`Invalid or expired link token received: ${linkToken}`);
              if (botToken) {
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  chat_id: chatId,
                  text: 'رابط التفعيل غير صالح أو منتهي الصلاحية. يرجى المحاولة مرة أخرى من بوابة المريض.',
                }).catch(e => this.logger.error(`Failed to send telegram invalid token message: ${e.message}`));
              }
              return { ok: true };
            }
          }

          // Normal /start flow (fallback)
          this.logger.log(`Received normal /start command from Chat ID: ${chatId}`);
          
          if (botToken) {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: chatId,
              text: 'مرحباً بك في بوابة المرضى التابعة لـ Saraya ERP.\nيرجى مشاركة رقم هاتفك لربط حسابك وتلقي الإشعارات ورموز التحقق.',
              reply_markup: {
                keyboard: [[{ text: 'مشاركة رقم الهاتف 📱', request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }).catch(e => this.logger.error(`Failed to send start message: ${e.message}`));
          }
      }
    } catch (error: any) {
      this.logger.error(`Error processing Telegram webhook: ${error.message}`);
    }

    // Always return 200 OK to Telegram so they stop retrying
    return { ok: true };
  }
}
