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

  // ✅ 5. تنبيه الجودة - الإبلاغ عن حادث
  @OnEvent('quality.incident_reported')
  async handleIncidentReported(event: any) {
    await this.notifications.notifyRoles(
      event.hospitalId,
      ['QUALITY_MANAGER', 'ADMIN'],
      'حادثة سريرية جديدة',
      `تم الإبلاغ عن حادثة (${event.incidentNumber}) بخطورة ${event.severity} بواسطة ${event.reporterName}`,
      '/quality-safety',
    );
  }

  // ✅ 6. تنبيه الجودة - تكليف CAPA
  @OnEvent('quality.capa_added')
  async handleCapaAdded(event: any) {
    await this.notifications.notifyRoles(
      event.hospitalId,
      ['QUALITY_MANAGER', 'ADMIN'],
      'إجراء CAPA جديد',
      `تم تكليف ${event.assignedToName} بإجراء تصحيحي لحادثة ${event.incidentId}`,
      '/quality-safety',
    );
  }
}
