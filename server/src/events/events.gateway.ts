// src/events/events.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: true, // السماح لجميع المصادر للتجربة
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth.token || client.handshake.headers.authorization;
      if (!token) {
        this.logger.warn(`Client ${client.id} has no token, disconnecting...`);
        client.disconnect();
        return;
      }

      const cleanToken = token.replace('Bearer ', '');
      const payload = await this.jwtService.verifyAsync(cleanToken, {
        secret: this.config.get('JWT_SECRET'),
      });

      // انضمام للغرف حسب الصلاحيات
      const roles = payload.roles || [];
      roles.forEach((role: string) => {
        const roomName = `ROLE_${role}`;
        client.join(roomName);
        this.logger.debug(`User ${payload.sub} joined room: ${roomName}`);
      });

      // انضمام لغرفة المستخدم الخاصة
      client.join(`USER_${payload.sub}`);

      this.logger.log(
        `✅ Socket Connected: ${client.id} (User: ${payload.sub})`,
      );
    } catch (e) {
      this.logger.error(`Socket auth failed: ${e.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Socket Disconnected: ${client.id}`);
  }

  // --- الأحداث ---

  @OnEvent('invoice.issued')
  handleInvoiceIssued(payload: any) {
    this.logger.log(`🔔 Notification: Invoice #${payload.invoiceId}`);

    // إرسال للكاشير، المحاسب، والأدمن
    this.server
      .to(['ROLE_CASHIER', 'ROLE_ACCOUNTANT', 'ROLE_ADMIN'])
      .emit('notification', {
        title: 'فاتورة جديدة',
        message: `تم إصدار فاتورة بقيمة ${payload.totalAmount} د.ل`,
        type: 'INFO',
        link: `/billing/invoices/${payload.invoiceId}`,
      });
  }

  @OnEvent('pharmacy.dispense_completed')
  handleDispense(payload: any) {
    this.logger.log(`🔔 Notification: Dispense #${payload.dispenseRecordId}`);

    this.server
      .to(['ROLE_STORE_KEEPER', 'ROLE_PHARMACIST', 'ROLE_ADMIN'])
      .emit('notification', {
        title: 'صرف أدوية',
        message: `تم صرف أدوية بتكلفة ${payload.totalCost} د.ل`,
        type: 'WARNING',
      });
  }

  @OnEvent('lab.order_created')
  handleLabOrder(payload: any) {
    this.logger.log(`🔔 Notification: Lab Order #${payload.orderId}`);

    // ✅ التعديل هنا: إضافة ROLE_ADMIN و ROLE_DOCTOR للقائمة
    this.server
      .to(['ROLE_LAB_TECH', 'ROLE_ADMIN', 'ROLE_DOCTOR'])
      .emit('notification', {
        title: 'طلب تحليل جديد',
        message: `المريض: ${payload.patientName} - عدد التحاليل: ${payload.testsCount}`,
        type: 'INFO',
        link: '/lab/',
      });
  }

  @OnEvent('radiology.order_created')
  handleRadiologyOrder(payload: any) {
    this.logger.log(`🔔 Notification: Radiology Order #${payload.orderId}`);

    this.server
      .to(['ROLE_RAD_TECH', 'ROLE_ADMIN', 'ROLE_DOCTOR'])
      .emit('notification', {
        title: 'طلب أشعة جديد',
        message: `المريض: ${payload.patientName} - الفحص: ${payload.studyName}`,
        type: 'INFO',
        link: '/radiology/worklist',
      });
  }
}

// // src/events/events.gateway.ts

// import {
//   WebSocketGateway,
//   WebSocketServer,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { OnEvent } from '@nestjs/event-emitter';
// import { Logger } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import { ConfigService } from '@nestjs/config';

// @WebSocketGateway({
//   cors: {
//     origin: '*', // في الإنتاج يجب تحديد الدومين
//   },
// })
// export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
//   @WebSocketServer()
//   server: Server;

//   private readonly logger = new Logger(EventsGateway.name);

//   constructor(
//     private jwtService: JwtService,
//     private config: ConfigService,
//   ) {}

//   async handleConnection(client: Socket) {
//     try {
//       // 1. استخراج التوكن
//       const token =
//         client.handshake.auth.token || client.handshake.headers.authorization;
//       if (!token) {
//         client.disconnect();
//         return;
//       }

//       const cleanToken = token.replace('Bearer ', '');

//       // 2. التحقق من التوكن
//       const payload = await this.jwtService.verifyAsync(cleanToken, {
//         secret: this.config.get('JWT_SECRET'),
//       });

//       // 3. انضمام المستخدم لغرف خاصة بناءً على دوره (Roles)
//       // مثال: الطبيب ينضم لغرفة 'DOCTOR'، المحاسب لغرفة 'ACCOUNTANT'
//       const roles = payload.roles || [];
//       roles.forEach((role: string) => {
//         client.join(`ROLE_${role}`);
//       });

//       // انضمام لغرفة خاصة بالمستخدم نفسه (للإشعارات الشخصية)
//       client.join(`USER_${payload.sub}`);

//       this.logger.log(`Client connected: ${client.id} (User: ${payload.sub})`);
//     } catch (e) {
//       this.logger.error('Socket authentication failed');
//       client.disconnect();
//     }
//   }

//   handleDisconnect(client: Socket) {
//     this.logger.log(`Client disconnected: ${client.id}`);
//   }

//   // --- الاستماع للأحداث الداخلية وإعادة بثها للعملاء ---

//   // 1. عند إصدار فاتورة -> إبلاغ الكاشير والمحاسبين
//   @OnEvent('invoice.issued')
//   handleInvoiceIssued(payload: any) {
//     this.server
//       .to('ROLE_CASHIER')
//       .to('ROLE_ACCOUNTANT')
//       .emit('notification', {
//         title: 'فاتورة جديدة',
//         message: `تم إصدار فاتورة بقيمة ${payload.totalAmount} د.ل`,
//         type: 'INFO',
//         link: `/billing/invoices/${payload.invoiceId}`,
//       });
//   }

//   // 2. عند اكتمال صرف دواء -> إبلاغ الطبيب (اختياري) أو المخازن
//   @OnEvent('pharmacy.dispense_completed')
//   handleDispense(payload: any) {
//     this.server.to('ROLE_STORE_KEEPER').emit('notification', {
//       title: 'صرف أدوية',
//       message: `تم صرف أدوية بتكلفة ${payload.totalCost} د.ل`,
//       type: 'WARNING', // تنبيه لمراقبة المخزون
//     });
//   }

//   // 3. عند طلب تحليل جديد -> إبلاغ المعمل
//   @OnEvent('lab.order_created')
//   handleLabOrder(payload: any) {
//     this.server.to('ROLE_LAB_TECH').emit('notification', {
//       title: 'طلب تحليل جديد',
//       message: `المريض: ${payload.patientName} - عدد التحاليل: ${payload.testsCount}`,
//       type: 'INFO',
//       link: '/lab/worklist',
//     });
//   }

//   // 4. عند طلب أشعة -> إبلاغ قسم الأشعة
//   @OnEvent('radiology.order_created')
//   handleRadiologyOrder(payload: any) {
//     this.server.to('ROLE_RAD_TECH').emit('notification', {
//       title: 'طلب أشعة جديد',
//       message: `المريض: ${payload.patientName} - الفحص: ${payload.studyName}`,
//       type: 'INFO',
//       link: '/radiology/worklist',
//     });
//   }
// }
