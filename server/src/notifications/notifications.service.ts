import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private expo: Expo;
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {
    this.expo = new Expo();
  }

  // 1. تسجيل جهاز جديد
  async registerDevice(userId: number, token: string, platform?: string) {
    // التحقق من صحة الكود
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Push token ${token} is not a valid Expo push token`);
      // قد نقرر رمي خطأ أو تجاهله، سأتجاهله هنا وأعيد false
      return false;
    }

    // Upsert: إذا كان موجوداً، نحدثه (مثلاً آخر ظهور)
    await this.prisma.userDevice.upsert({
      where: { token },
      update: { userId, platform, updatedAt: new Date() },
      create: { userId, token, platform },
    });
    return true;
  }

  // 2. إرسال Push Notification لمستخدم معين
  async sendPushNotification(
    userId: number,
    title: string,
    body: string,
    data?: any,
  ) {
    // جلب أجهزة المستخدم
    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
    });

    if (devices.length === 0) return;

    const messages: ExpoPushMessage[] = [];
    for (const device of devices) {
      if (!Expo.isExpoPushToken(device.token)) {
        this.logger.error(
          `Push token ${device.token} is not valid Expo push token`,
        );
        continue;
      }
      messages.push({
        to: device.token,
        sound: 'default',
        title,
        body,
        data,
      });
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        // يمكن هنا معالجة التذاكر (Tickets) للتأكد من الإرسال
        this.logger.log(`Sent ${chunk.length} push notifications`);
      } catch (error) {
        this.logger.error(error);
      }
    }
  }

  // 3. إنشاء إشعار داخلي + Push
  async create(
    hospitalId: number,
    userId: number,
    title: string,
    message: string,
    link?: string,
  ) {
    // 1. حفظ في قاعدة البيانات
    const notification = await this.prisma.notification.create({
      data: {
        hospitalId,
        userId,
        title,
        message,
        link,
      },
    });

    // 2. إرسال Push Notification
    await this.sendPushNotification(userId, title, message, { link, notificationId: notification.id });

    return notification;
  }

  // 4. إرسال لمجموعة أدوار (مع Push)
  async notifyRoles(
    hospitalId: number,
    roles: string[],
    title: string,
    message: string,
    link?: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        hospitalId,
        isActive: true,
        userRoles: {
          some: {
            role: { name: { in: roles } },
          },
        },
      },
      select: { id: true },
    });

    if (users.length > 0) {
      // Create DB Notifications
      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          hospitalId,
          userId: u.id,
          title,
          message,
          link,
        })),
      });

      // Send Push to all users (Async/Independent)
      // Note: For large numbers, this should be a Job Queue (BullMQ)
      for (const u of users) {
        this.sendPushNotification(u.id, title, message, { link });
      }
    }
  }

  // 5. جلب إشعارات المستخدم
  async getUserNotifications(
    hospitalId: number,
    userId: number,
    unreadOnly = false,
  ) {
    return this.prisma.notification.findMany({
      where: {
        hospitalId,
        userId,
        isRead: unreadOnly ? false : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // 6. تحديد كـ مقروء
  async markAsRead(hospitalId: number, userId: number, notificationId: number) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId, hospitalId },
      data: { isRead: true },
    });
  }

  // 7. تحديد الكل كمقروء
  async markAllRead(hospitalId: number, userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, hospitalId, isRead: false },
      data: { isRead: true },
    });
  }
}
