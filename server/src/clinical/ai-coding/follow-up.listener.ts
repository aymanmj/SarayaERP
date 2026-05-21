import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AiCodingService, FollowUpExtraction } from './ai-coding.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * يستمع لحدث حفظ حقل Plan في الملاحظات السريرية (SOAP)
 * ويستخرج خطط المتابعة باستخدام AI ثم ينشئ إشعارات/مهام تلقائية.
 */
@Injectable()
export class FollowUpListener {
  private readonly logger = new Logger(FollowUpListener.name);

  constructor(
    private aiService: AiCodingService,
    private prisma: PrismaService,
  ) {}

  @OnEvent('clinical.note.plan_saved', { async: true })
  async handlePlanSaved(payload: {
    noteId: number;
    encounterId: number;
    patientId: number;
    hospitalId: number;
    planText: string;
    createdById: number;
  }) {
    this.logger.log(
      `🤖 Processing follow-up extraction for note #${payload.noteId}, encounter #${payload.encounterId}`,
    );

    try {
      const followUps = await this.aiService.extractFollowUpPlan(
        payload.planText,
      );

      if (followUps.length === 0) {
        this.logger.log(
          `ℹ️ No follow-up items extracted from note #${payload.noteId}`,
        );
        return;
      }

      this.logger.log(
        `✅ Extracted ${followUps.length} follow-up items from note #${payload.noteId}`,
      );

      // حفظ كل بند متابعة كـ Notification للاستقبال/الجدولة
      for (const item of followUps) {
        await this.createFollowUpNotification(payload, item);
      }
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to process follow-up for note #${payload.noteId}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async createFollowUpNotification(
    payload: {
      noteId: number;
      encounterId: number;
      patientId: number;
      hospitalId: number;
      createdById: number;
    },
    item: FollowUpExtraction,
  ) {
    // حساب التاريخ المتوقع للمتابعة
    const suggestedDate = new Date();
    suggestedDate.setDate(suggestedDate.getDate() + item.timeframeDays);

    // الحصول على بيانات المريض
    const patient = await this.prisma.patient.findUnique({
      where: { id: payload.patientId },
      select: { fullName: true, mrn: true },
    });

    const message =
      `🔔 متابعة ذكية (AI): المريض ${patient?.fullName || ''} (${patient?.mrn || ''}) ` +
      `يحتاج ${item.actionAr || item.action} ` +
      `خلال ${item.timeframe}. ` +
      `القسم المقترح: ${item.department}. ` +
      (item.notes ? `ملاحظات: ${item.notes}` : '');

    // إرسال إشعار لجميع موظفي الاستقبال (يمتلكون صلاحية appointments:manage)
    const receptionUsers = await this.prisma.user.findMany({
      where: {
        hospitalId: payload.hospitalId,
        isActive: true,
        userRoles: {
          some: {
            role: {
              rolePermissions: {
                some: {
                  permission: {
                    code: 'appointments:manage',
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    for (const user of receptionUsers) {
      await this.prisma.notification.create({
        data: {
          hospitalId: payload.hospitalId,
          userId: user.id,
          title: `متابعة ذكية: ${item.actionAr || item.action}`,
          message,
          // type: 'AI_FOLLOW_UP',
          // referenceType: 'ENCOUNTER',
          // referenceId: payload.encounterId,
        },
      });
    }

    this.logger.log(
      `📨 Sent follow-up notifications to ${receptionUsers.length} reception staff for: ${item.action}`,
    );
  }
}
