// src/notifications/notifications.listener.ts

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { InvoiceIssuedEvent } from '../billing/events/invoice-issued.event';
import { DispenseCompletedEvent } from '../pharmacy/events/dispense-completed.event';
// ✅ الاستيرادات الجديدة
import { LabOrderCreatedEvent } from '../labs/events/lab-order-created.event';
import { RadiologyOrderCreatedEvent } from '../radiology/events/radiology-order-created.event';

@Injectable()
export class NotificationListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('invoice.issued')
  async handleInvoiceIssued(event: InvoiceIssuedEvent) {
    await this.notifications.notifyRoles(
      event.hospitalId,
      ['ACCOUNTANT', 'ADMIN', 'CASHIER'],
      'فاتورة جديدة',
      `تم إصدار فاتورة جديدة للمريض بمبلغ ${event.totalAmount}`,
      `/billing/invoices/${event.invoiceId}`,
    );
  }

  @OnEvent('pharmacy.dispense_completed')
  async handleDispense(event: DispenseCompletedEvent) {
    // يمكن تفعيل تنبيهات المخزون هنا لاحقاً
  }

  // ✅ 3. تنبيه عند طلب تحليل جديد
  @OnEvent('lab.order_created')
  async handleLabOrder(event: LabOrderCreatedEvent) {
    await this.notifications.notifyRoles(
      event.hospitalId,
      ['LAB_TECH', 'ADMIN'], // إشعار لفني المختبر
      'طلب تحليل جديد',
      `طلب د. ${event.doctorName} عدد ${event.testsCount} تحليل للمريض ${event.patientName}`,
      '/lab', // رابط لصفحة المعمل
    );
  }

  // ✅ 4. تنبيه عند طلب أشعة جديد
  @OnEvent('radiology.order_created')
  async handleRadiologyOrder(event: RadiologyOrderCreatedEvent) {
    await this.notifications.notifyRoles(
      event.hospitalId,
      ['RAD_TECH', 'ADMIN'], // إشعار لفني الأشعة
      'طلب أشعة جديد',
      `طلب د. ${event.doctorName} فحص (${event.studyName}) للمريض ${event.patientName}`,
      '/radiology', // رابط لصفحة الأشعة
    );
  }
}

// import { Injectable } from '@nestjs/common';
// import { OnEvent } from '@nestjs/event-emitter';
// import { NotificationsService } from './notifications.service';
// import { InvoiceIssuedEvent } from '../billing/events/invoice-issued.event';
// import { DispenseCompletedEvent } from '../pharmacy/events/dispense-completed.event';

// // يمكنك إنشاء أحداث جديدة حسب الحاجة، مثلاً OrderCreatedEvent
// // سنفترض وجود أحداث بسيطة حالياً

// @Injectable()
// export class NotificationListener {
//   constructor(private readonly notifications: NotificationsService) {}

//   // 1. عند إصدار فاتورة جديدة -> تنبيه للمحاسبين
//   @OnEvent('invoice.issued')
//   async handleInvoiceIssued(event: InvoiceIssuedEvent) {
//     await this.notifications.notifyRoles(
//       event.hospitalId,
//       ['ACCOUNTANT', 'ADMIN'], // الأدوار المستهدفة
//       'فاتورة جديدة',
//       `تم إصدار فاتورة جديدة بقيمة ${event.totalAmount}`,
//       `/billing/invoices/${event.invoiceId}`,
//     );
//   }

//   // 2. عند صرف دواء -> تنبيه (مثلاً للمخازن لمراقبة الرصيد، أو مجرد سجل)
//   @OnEvent('pharmacy.dispense_completed')
//   async handleDispense(event: DispenseCompletedEvent) {
//     // يمكن هنا التحقق من الرصيد وإرسال تنبيه نقص المخزون
//     // للتبسيط، سنرسل تنبيهاً للمدير الطبي
//     // await this.notifications.notifyRoles(...)
//   }

//   // مثال: نحتاج لإطلاق حدث عند إنشاء طلب معمل
//   // @OnEvent('lab.order_created')
//   // async handleLabOrder(event: any) {
//   //   await this.notifications.notifyRoles(
//   //     event.hospitalId,
//   //     ['LAB_TECH'],
//   //     'طلب تحليل جديد',
//   //     `هناك طلب تحليل جديد للمريض ${event.patientName}`,
//   //     `/lab`
//   //   );
//   // }
// }
