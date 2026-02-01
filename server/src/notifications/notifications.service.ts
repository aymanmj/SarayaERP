import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // 1. إنشاء إشعار لمستخدم معين
  async create(
    hospitalId: number,
    userId: number,
    title: string,
    message: string,
    link?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        hospitalId,
        userId,
        title,
        message,
        link,
      },
    });
  }

  // 2. إنشاء إشعار لمجموعة مستخدمين بناءً على الصلاحية (Role)
  // مثال: إشعار نقص مخزون يذهب لكل الصيادلة وأمناء المخازن
  async notifyRoles(
    hospitalId: number,
    roles: string[],
    title: string,
    message: string,
    link?: string,
  ) {
    // نجد المستخدمين الذين يملكون هذه الأدوار
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

    // إنشاء الإشعارات دفعة واحدة
    if (users.length > 0) {
      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          hospitalId,
          userId: u.id,
          title,
          message,
          link,
        })),
      });
    }
  }

  // 3. جلب إشعارات المستخدم
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
      take: 50, // آخر 50 إشعار
    });
  }

  // 4. تحديد كـ مقروء
  async markAsRead(hospitalId: number, userId: number, notificationId: number) {
    // نستخدم updateMany للأمان (للتأكد أن الإشعار يخص المستخدم)
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId, hospitalId },
      data: { isRead: true },
    });
  }

  // 5. تحديد الكل كمقروء
  async markAllRead(hospitalId: number, userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, hospitalId, isRead: false },
      data: { isRead: true },
    });
  }
}
