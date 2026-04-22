import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import axios from 'axios';

@Controller('patient-portal/telegram')
export class PortalTelegramController {
  private readonly logger = new Logger(PortalTelegramController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService
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
      } else if (update.message && update.message.text === '/start') {
          const chatId = update.message.chat.id.toString();
          this.logger.log(`Received /start command from Chat ID: ${chatId}`);
          
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
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
