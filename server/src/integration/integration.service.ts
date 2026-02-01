// src/integration/integration.service.ts

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as net from 'net';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  wrapInMLLP,
  extractMessagesFromBuffer,
  createACK,
  getHL7Date,
  CR,
} from './hl7.utils';
import { IntegrationDirection, IntegrationProtocol } from '@prisma/client';

@Injectable()
export class IntegrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationService.name);
  private server: net.Server;
  private readonly LISTENER_PORT = 6661; // Changed from 6661 to avoid EACCES

  constructor(
    private prisma: PrismaService,
    @InjectQueue('hl7-queue') private hl7Queue: Queue,
  ) {}

  async onModuleInit() {
    this.startHL7Listener(this.LISTENER_PORT);
  }

  async onModuleDestroy() {
    if (this.server) {
      this.server.close();
      this.logger.log('🛑 LIS Integration Server stopped.');
    }
  }

  // ... (startHL7Listener & saveInboundMessage كما هي) ...
  private startHL7Listener(port: number) {
    this.server = net.createServer((socket) => {
      const clientAddr = socket.remoteAddress?.replace('::ffff:', '');
      this.logger.log(`🔌 Device connected: ${clientAddr}`);
      let buffer = '';
      socket.on('data', async (data) => {
        buffer += data.toString();
        const { messages, remainingBuffer } = extractMessagesFromBuffer(buffer);
        buffer = remainingBuffer;
        for (const cleanMsg of messages) {
          try {
            const logEntry = await this.saveInboundMessage(
              cleanMsg,
              clientAddr,
            );
            await this.hl7Queue.add(
              'process-hl7',
              { logId: logEntry.id, rawMessage: cleanMsg },
              { attempts: 3, removeOnComplete: true },
            );
            this.logger.debug(`📨 Inbound HL7 Queued (Log #${logEntry.id})`);
            const ack = createACK(cleanMsg, 'AA');
            socket.write(wrapInMLLP(ack));
          } catch (e) {
            this.logger.error('❌ Critical Error', e);
            const nack = createACK(cleanMsg, 'AE', 'Internal Error');
            socket.write(wrapInMLLP(nack));
          }
        }
      });
      socket.on('error', (err) =>
        this.logger.error(`Socket error: ${err.message}`),
      );
    });

    // Add Error Handler for Server Binding
    this.server.on('error', (err: any) => {
      if (err.code === 'EACCES') {
        this.logger.error(`❌ Permission Denied on port ${port}. Try running as Admin or change port.`);
      } else if (err.code === 'EADDRINUSE') {
        this.logger.error(`❌ Port ${port} is already in use.`);
      } else {
        this.logger.error(`❌ HL7 Server Error: ${err.message}`);
      }
    });

    this.server.listen(port, () => {
      this.logger.log(`🏥 Async HL7 Listener running on port ${port}`);
    });
  }

  private async saveInboundMessage(rawMsg: string, ip?: string) {
    const segments = rawMsg.split(/[\r\n]+/);
    const msh = segments[0].split('|');
    const sendingApp = msh[2];
    const msgType = msh[8];
    let device = await this.prisma.medicalDevice.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { equals: sendingApp, mode: 'insensitive' } },
          { ipAddress: ip },
        ],
      },
    });
    if (!device)
      device = await this.prisma.medicalDevice.findFirst({
        where: { isActive: true },
      });
    return this.prisma.integrationLog.create({
      data: {
        deviceId: device?.id ?? 1,
        direction: IntegrationDirection.INBOUND,
        messageType: msgType,
        rawMessage: rawMsg,
        status: 'PENDING',
      },
    });
  }

  // =================================================================
  // 2. Outbound Layer: الإرسال (من النظام إلى الجهاز) - ✅ المصحح
  // =================================================================

  async sendOrderToDevice(orderId: number, hospitalId: number) {
    this.logger.log(`🚀 Starting Outbound LAB for Order #${orderId}`);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        encounter: { include: { patient: true } },
        labOrders: { include: { test: true } },
      },
    });

    if (!order) {
      this.logger.error(`❌ Order #${orderId} not found in DB`);
      return;
    }

    // البحث عن جهاز مختبر
    // ملاحظة: تأكد أن نوع الجهاز في الداتابيس هو 'LAB'
    const device = await this.prisma.medicalDevice.findFirst({
      where: {
        hospitalId,
        isActive: true,
        type: 'LAB',
      },
    });

    if (!device) {
      this.logger.error(
        `❌ No active LAB device found for Hospital #${hospitalId}`,
      );
      return;
    }

    this.logger.log(
      `🎯 Device Found: ${device.name} -> ${device.ipAddress}:${device.port}`,
    );

    // بناء الرسالة
    const msgId = `MSG${Date.now()}`;
    const msh = `MSH|^~\\&|SARAYA|LIS|${device.name}|LAB|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
    const p = order.encounter.patient;
    const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
    const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
    const pv1 = `PV1|1|O`;

    let hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}`;

    for (let i = 0; i < order.labOrders.length; i++) {
      const labOrder = order.labOrders[i];
      const mapping = await this.prisma.testMapping.findFirst({
        where: { deviceId: device.id, labTestId: labOrder.testId },
      });
      const testCode = mapping?.deviceTestCode ?? labOrder.test.code;
      const obr = `OBR|${i + 1}|${order.id}|${labOrder.id}|${testCode}^${labOrder.test.name}|||${getHL7Date()}`;
      hl7Message += `${obr}${CR}`;
    }

    const mllpMessage = wrapInMLLP(hl7Message);

    // تسجيل في الـ Log
    const log = await this.logOutbound(device.id, 'ORM^O01', hl7Message);
    this.logger.log(`📝 Log #${log.id} created. Attempting connection...`);

    // الإرسال والانتظار
    try {
      await this.sendToSocket(device, mllpMessage, log.id);
      this.logger.log(`✅ Success: Order #${orderId} sent to ${device.name}`);
    } catch (err: any) {
      this.logger.error(`❌ Failed to send Order #${orderId}: ${err.message}`);
    }
  }

  // نفس المنطق لـ Radiology
  async sendRadiologyOrder(orderId: number, hospitalId: number) {
    this.logger.log(`🚀 Starting Outbound RADIOLOGY for Order #${orderId}`);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        encounter: { include: { patient: true } },
        radiologyOrder: { include: { study: true } },
      },
    });

    if (!order || !order.radiologyOrder) return;

    const device = await this.prisma.medicalDevice.findFirst({
      where: { hospitalId, isActive: true, type: 'RADIOLOGY' },
    });

    if (!device) {
      this.logger.error(`❌ No active RADIOLOGY device found`);
      return;
    }

    const msgId = `MSG${Date.now()}`;
    const msh = `MSH|^~\\&|SARAYA|RIS|${device.name}|MODALITY|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
    const p = order.encounter.patient;
    const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
    const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
    const pv1 = `PV1|1|O`;
    const study = order.radiologyOrder.study;
    const obr = `OBR|1|${order.id}|${order.radiologyOrder.id}|${study.code}^${study.name}|||${getHL7Date()}|||||||||${study.modality}`;

    const hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}${obr}${CR}`;
    const mllpMessage = wrapInMLLP(hl7Message);

    const log = await this.logOutbound(device.id, 'ORM^O01', hl7Message);

    try {
      await this.sendToSocket(device, mllpMessage, log.id);
      this.logger.log(`✅ Success: Radiology Order #${orderId} sent`);
    } catch (err: any) {
      this.logger.error(`❌ Failed: ${err.message}`);
    }
  }

  // --- Helpers ---

  private async logOutbound(deviceId: number, type: string, msg: string) {
    return this.prisma.integrationLog.create({
      data: {
        deviceId,
        direction: IntegrationDirection.OUTBOUND,
        messageType: type,
        rawMessage: msg,
        status: 'PENDING',
      },
    });
  }

  private sendToSocket(
    device: { ipAddress: string; port: number; name: string },
    message: string,
    logId: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      client.setTimeout(5000); // 5s timeout

      client.connect(device.port, device.ipAddress, async () => {
        this.logger.debug(
          `Sending data to ${device.ipAddress}:${device.port}...`,
        );
        client.write(message);

        await this.prisma.integrationLog.update({
          where: { id: logId },
          data: { status: 'SENT' },
        });
      });

      client.on('data', async (data) => {
        const response = data.toString();
        this.logger.debug(`📩 ACK Received: ${response.substring(0, 20)}...`);

        if (response.includes('MSA|AA') || response.includes('MSA|CA')) {
          await this.prisma.integrationLog.update({
            where: { id: logId },
            data: { status: 'SUCCESS', parsedData: { ack: 'AA' } },
          });
          resolve();
        } else {
          await this.prisma.integrationLog.update({
            where: { id: logId },
            data: { status: 'REJECTED', errorMessage: 'Negative ACK' },
          });
          resolve(); // نعتبره تم (استلمنا رد حتى لو رفض)
        }
        client.destroy();
      });

      client.on('timeout', async () => {
        const err = `Timeout connecting to ${device.ipAddress}:${device.port}`;
        this.logger.error(err);
        await this.prisma.integrationLog.update({
          where: { id: logId },
          data: { status: 'TIMEOUT', errorMessage: err },
        });
        client.destroy();
        reject(new Error(err));
      });

      client.on('error', async (err) => {
        this.logger.error(`Socket Error: ${err.message}`);
        await this.prisma.integrationLog.update({
          where: { id: logId },
          data: { status: 'ERROR', errorMessage: err.message },
        });
        client.destroy();
        reject(err);
      });
    });
  }
}

// // src/integration/integration.service.ts

// import {
//   Injectable,
//   Logger,
//   OnModuleInit,
//   OnModuleDestroy,
// } from '@nestjs/common';
// import * as net from 'net';
// import { PrismaService } from '../prisma/prisma.service';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';
// import {
//   wrapInMLLP,
//   extractMessagesFromBuffer,
//   createACK,
//   getHL7Date,
//   CR,
// } from './hl7.utils';
// import { IntegrationDirection, IntegrationProtocol } from '@prisma/client';

// @Injectable()
// export class IntegrationService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(IntegrationService.name);
//   private server: net.Server;
//   private readonly LISTENER_PORT = 6661; // المنفذ الذي يستمع عليه النظام للنتائج القادمة

//   constructor(
//     private prisma: PrismaService,
//     @InjectQueue('hl7-queue') private hl7Queue: Queue,
//   ) {}

//   async onModuleInit() {
//     this.startHL7Listener(this.LISTENER_PORT);
//   }

//   async onModuleDestroy() {
//     if (this.server) {
//       this.server.close();
//       this.logger.log('🛑 LIS Integration Server stopped.');
//     }
//   }

//   // =================================================================
//   // 1. Inbound Layer: الاستقبال (من الجهاز إلى النظام)
//   // =================================================================
//   private startHL7Listener(port: number) {
//     this.server = net.createServer((socket) => {
//       const clientAddr = socket.remoteAddress?.replace('::ffff:', '');
//       this.logger.log(`🔌 Device connected: ${clientAddr}`);

//       let buffer = '';

//       socket.on('data', async (data) => {
//         buffer += data.toString();
//         const { messages, remainingBuffer } = extractMessagesFromBuffer(buffer);
//         buffer = remainingBuffer;

//         for (const cleanMsg of messages) {
//           try {
//             // 1. حفظ في DB
//             const logEntry = await this.saveInboundMessage(
//               cleanMsg,
//               clientAddr,
//             );

//             // 2. إرسال للطابور للمعالجة الخلفية
//             await this.hl7Queue.add(
//               'process-hl7',
//               { logId: logEntry.id, rawMessage: cleanMsg },
//               { attempts: 3, removeOnComplete: true },
//             );

//             this.logger.debug(`📨 Inbound HL7 Queued (Log #${logEntry.id})`);

//             // 3. الرد بـ ACK
//             const ack = createACK(cleanMsg, 'AA');
//             socket.write(wrapInMLLP(ack));
//           } catch (e) {
//             this.logger.error('❌ Critical Error receiving message', e);
//             const nack = createACK(cleanMsg, 'AE', 'Internal Error');
//             socket.write(wrapInMLLP(nack));
//           }
//         }
//       });

//       socket.on('error', (err) =>
//         this.logger.error(`Socket error: ${err.message}`),
//       );
//     });

//     this.server.listen(port, () => {
//       this.logger.log(`🏥 Async HL7 Listener running on port ${port}`);
//     });
//   }

//   private async saveInboundMessage(rawMsg: string, ip?: string) {
//     const segments = rawMsg.split(/[\r\n]+/);
//     const msh = segments[0].split('|');
//     const sendingApp = msh[2];
//     const msgType = msh[8];

//     let device = await this.prisma.medicalDevice.findFirst({
//       where: {
//         isActive: true,
//         OR: [
//           { name: { equals: sendingApp, mode: 'insensitive' } },
//           { ipAddress: ip },
//         ],
//       },
//     });

//     if (!device) {
//       device = await this.prisma.medicalDevice.findFirst({
//         where: { isActive: true },
//       });
//     }

//     return this.prisma.integrationLog.create({
//       data: {
//         deviceId: device?.id ?? 1,
//         direction: IntegrationDirection.INBOUND,
//         messageType: msgType,
//         rawMessage: rawMsg,
//         status: 'PENDING',
//       },
//     });
//   }

//   // =================================================================
//   // 2. Outbound Layer: الإرسال (من النظام إلى الجهاز) - ✅ تم التصحيح
//   // =================================================================

//   /**
//    * إرسال طلب تحليل (Lab Order)
//    */
//   async sendOrderToDevice(orderId: number, hospitalId: number) {
//     this.logger.log(`🚀 Starting Outbound LAB for Order #${orderId}`);

//     // 1. جلب البيانات
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         labOrders: { include: { test: true } },
//       },
//     });

//     if (!order) {
//       this.logger.error(`❌ Order #${orderId} not found in DB`);
//       return;
//     }

//     if (order.labOrders.length === 0) {
//       this.logger.warn(`⚠️ Order #${orderId} has no tests.`);
//       return;
//     }

//     // 2. البحث عن الجهاز (السبب الأكثر شيوعاً للمشاكل)
//     // نبحث عن أي جهاز نوعه LAB ونشط في نفس المستشفى
//     const device = await this.prisma.medicalDevice.findFirst({
//       where: {
//         hospitalId,
//         isActive: true,
//         type: 'LAB', // تأكد أن النوع في الداتابيس LAB بحروف كبيرة
//       },
//     });

//     if (!device) {
//       this.logger.error(
//         `❌ No active LAB device found in DB for Hospital #${hospitalId}. Please check 'MedicalDevice' table.`,
//       );
//       return;
//     }

//     this.logger.log(
//       `🎯 Device Found: ${device.name} -> Target: ${device.ipAddress}:${device.port}`,
//     );

//     // 3. بناء الرسالة HL7
//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|LIS|${device.name}|LAB|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`; // O = Outpatient

//     let hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}`;

//     for (let i = 0; i < order.labOrders.length; i++) {
//       const labOrder = order.labOrders[i];
//       // محاولة إيجاد Mapping، وإلا استخدام الكود الافتراضي
//       const mapping = await this.prisma.testMapping.findFirst({
//         where: { deviceId: device.id, labTestId: labOrder.testId },
//       });
//       const testCode = mapping?.deviceTestCode ?? labOrder.test.code;

//       const obr = `OBR|${i + 1}|${order.id}|${labOrder.id}|${testCode}^${labOrder.test.name}|||${getHL7Date()}`;
//       hl7Message += `${obr}${CR}`;
//     }

//     const mllpMessage = wrapInMLLP(hl7Message);

//     // 4. حفظ السجل (PENDING)
//     const log = await this.logOutbound(device.id, 'ORM^O01', hl7Message);
//     this.logger.log(`📝 Outbound Log #${log.id} created. Sending now...`);

//     // 5. الإرسال (مع انتظار النتيجة)
//     try {
//       await this.sendToSocket(device, mllpMessage, log.id);
//       this.logger.log(
//         `✅ Successfully sent Order #${orderId} to ${device.name}`,
//       );
//     } catch (err: any) {
//       this.logger.error(`❌ Failed to send Order #${orderId}: ${err.message}`);
//     }
//   }

//   /**
//    * إرسال طلب أشعة (Radiology Order)
//    */
//   async sendRadiologyOrder(orderId: number, hospitalId: number) {
//     this.logger.log(`🚀 Starting Outbound RADIOLOGY for Order #${orderId}`);

//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         radiologyOrder: { include: { study: true } },
//       },
//     });

//     if (!order || !order.radiologyOrder) {
//       this.logger.warn(`⚠️ Order #${orderId} has no radiology details.`);
//       return;
//     }

//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'RADIOLOGY' },
//     });

//     if (!device) {
//       this.logger.error(
//         `❌ No active RADIOLOGY device found for Hospital #${hospitalId}.`,
//       );
//       return;
//     }

//     this.logger.log(
//       `🎯 Device Found: ${device.name} -> Target: ${device.ipAddress}:${device.port}`,
//     );

//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|RIS|${device.name}|MODALITY|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`;

//     const study = order.radiologyOrder.study;
//     const obr = `OBR|1|${order.id}|${order.radiologyOrder.id}|${study.code}^${study.name}|||${getHL7Date()}|||||||||${study.modality}`;

//     const hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}${obr}${CR}`;
//     const mllpMessage = wrapInMLLP(hl7Message);

//     const log = await this.logOutbound(device.id, 'ORM^O01', hl7Message);

//     try {
//       await this.sendToSocket(device, mllpMessage, log.id);
//       this.logger.log(`✅ Successfully sent Radiology Order #${orderId}`);
//     } catch (err: any) {
//       this.logger.error(
//         `❌ Failed to send Radiology Order #${orderId}: ${err.message}`,
//       );
//     }
//   }

//   // --- Helpers ---

//   private async logOutbound(deviceId: number, type: string, msg: string) {
//     return this.prisma.integrationLog.create({
//       data: {
//         deviceId,
//         direction: IntegrationDirection.OUTBOUND,
//         messageType: type,
//         rawMessage: msg,
//         status: 'PENDING',
//       },
//     });
//   }

//   /**
//    * ✅ الدالة المحسنة: ترجع Promise لتتمكن من انتظار النتيجة واكتشاف الخطأ
//    */
//   private sendToSocket(
//     device: { ipAddress: string; port: number; name: string },
//     message: string,
//     logId: number,
//   ): Promise<void> {
//     return new Promise((resolve, reject) => {
//       const client = new net.Socket();

//       // مهلة 5 ثواني
//       client.setTimeout(5000);

//       client.connect(device.port, device.ipAddress, async () => {
//         this.logger.debug(
//           `Connected to ${device.ipAddress}:${device.port}. Writing data...`,
//         );
//         client.write(message);

//         // تحديث الحالة إلى SENT مبدئياً
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'SENT' },
//         });
//       });

//       client.on('data', async (data) => {
//         const response = data.toString();
//         this.logger.debug(`📩 ACK Received: ${response.substring(0, 50)}...`);

//         if (response.includes('MSA|AA') || response.includes('MSA|CA')) {
//           await this.prisma.integrationLog.update({
//             where: { id: logId },
//             data: { status: 'SUCCESS', parsedData: { ack: 'AA' } },
//           });
//           resolve(); // نجاح
//         } else {
//           await this.prisma.integrationLog.update({
//             where: { id: logId },
//             data: { status: 'REJECTED', errorMessage: 'Negative ACK received' },
//           });
//           // لا نعتبر الـ NACK خطأ فني (reject)، بل استجابة سلبية، لكن العملية اكتملت
//           resolve();
//         }
//         client.destroy();
//       });

//       client.on('timeout', async () => {
//         const errMsg = `Connection timeout to ${device.ipAddress}:${device.port}`;
//         this.logger.error(errMsg);
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'TIMEOUT', errorMessage: errMsg },
//         });
//         client.destroy();
//         reject(new Error(errMsg)); // فشل
//       });

//       client.on('error', async (err) => {
//         const errMsg = `Socket Error (${device.name}): ${err.message}`;
//         this.logger.error(errMsg);
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'ERROR', errorMessage: err.message },
//         });
//         client.destroy();
//         reject(err); // فشل
//       });
//     });
//   }
// }

// // src/integration/integration.service.ts

// import {
//   Injectable,
//   Logger,
//   OnModuleInit,
//   OnModuleDestroy,
// } from '@nestjs/common';
// import * as net from 'net';
// import { PrismaService } from '../prisma/prisma.service';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';
// import {
//   wrapInMLLP,
//   extractMessagesFromBuffer,
//   createACK,
//   getHL7Date,
//   CR,
// } from './hl7.utils';
// import { IntegrationDirection, IntegrationProtocol } from '@prisma/client';

// @Injectable()
// export class IntegrationService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(IntegrationService.name);
//   private server: net.Server;
//   private readonly LISTENER_PORT = 6661;

//   constructor(
//     private prisma: PrismaService,
//     // حقن الطابور لإرسال المهام إليه
//     @InjectQueue('hl7-queue') private hl7Queue: Queue,
//   ) {}

//   async onModuleInit() {
//     this.startHL7Listener(this.LISTENER_PORT);
//   }

//   async onModuleDestroy() {
//     if (this.server) {
//       this.server.close();
//       this.logger.log('🛑 LIS Integration Server stopped.');
//     }
//   }

//   // =================================================================
//   // 1. Inbound Layer: الاستقبال غير المتزامن (Asynchronous Reception)
//   // =================================================================

//   private startHL7Listener(port: number) {
//     this.server = net.createServer((socket) => {
//       const clientAddr = socket.remoteAddress?.replace('::ffff:', '');
//       this.logger.log(`🔌 Device connected: ${clientAddr}`);

//       let buffer = '';

//       socket.on('data', async (data) => {
//         buffer += data.toString();

//         // استخدام دالة استخراج الرسائل للتعامل مع التجزئة (Fragmentation) أو الالتصاق (Batching)
//         const { messages, remainingBuffer } = extractMessagesFromBuffer(buffer);
//         buffer = remainingBuffer;

//         for (const cleanMsg of messages) {
//           try {
//             // أ) Persistence: حفظ الرسالة الخام فوراً في القاعدة (حالة PENDING)
//             // هذا يضمن عدم ضياع البيانات حتى لو تعطلت المعالجة لاحقاً
//             const logEntry = await this.saveInboundMessage(
//               cleanMsg,
//               clientAddr,
//             );

//             // ب) Queueing: إرسال المهمة إلى Redis ليقوم الـ Consumer بمعالجتها
//             await this.hl7Queue.add(
//               'process-hl7',
//               {
//                 logId: logEntry.id,
//                 rawMessage: cleanMsg,
//               },
//               {
//                 attempts: 3, // إعادة المحاولة 3 مرات في حال الفشل
//                 backoff: {
//                   type: 'exponential',
//                   delay: 5000,
//                 },
//                 removeOnComplete: true, // تنظيف Redis بعد النجاح
//                 removeOnFail: false, // الاحتفاظ بالمهمة الفاشلة للتحقيق
//               },
//             );

//             this.logger.debug(
//               `📨 Queued HL7 Message #${logEntry.id} for processing`,
//             );

//             // ج) Acknowledgment: الرد بـ ACK إيجابي فوراً للجهاز
//             // الجهاز لا يهتم بنتيجة التحليل، يهمه فقط أننا استلمنا الرسالة
//             const ack = createACK(cleanMsg, 'AA');
//             socket.write(wrapInMLLP(ack));
//           } catch (e) {
//             this.logger.error(
//               '❌ Critical Error receiving/queueing message',
//               e,
//             );

//             // في حال فشل الحفظ في DB أو الـ Queue، نرسل NACK للجهاز ليعيد الإرسال
//             const nack = createACK(cleanMsg, 'AE', 'Internal Server Error');
//             socket.write(wrapInMLLP(nack));
//           }
//         }
//       });

//       socket.on('error', (err) =>
//         this.logger.error(`Socket error from ${clientAddr}: ${err.message}`),
//       );

//       socket.on('close', () => {
//         this.logger.debug(`🔌 Device disconnected: ${clientAddr}`);
//       });
//     });

//     this.server.listen(port, () => {
//       this.logger.log(
//         `🏥 Async HL7 Server listening on port ${port} (Production Ready 🚀)`,
//       );
//     });
//   }

//   /**
//    * حفظ الرسالة الواردة وربطها بالجهاز المناسب
//    */
//   private async saveInboundMessage(rawMsg: string, ip?: string) {
//     const segments = rawMsg.split(/[\r\n]+/);
//     const msh = segments[0].split('|');
//     const sendingApp = msh[2]; // اسم الجهاز المرسل
//     const msgType = msh[8]; // نوع الرسالة (ORU^R01, etc.)

//     // محاولة العثور على الجهاز في قاعدة البيانات
//     let device = await this.prisma.medicalDevice.findFirst({
//       where: {
//         isActive: true,
//         OR: [
//           { name: { equals: sendingApp, mode: 'insensitive' } },
//           { ipAddress: ip },
//         ],
//       },
//     });

//     // Fallback: استخدام أول جهاز نشط إذا لم يتم التعرف عليه
//     if (!device) {
//       device = await this.prisma.medicalDevice.findFirst({
//         where: { isActive: true },
//       });
//     }

//     // إنشاء السجل
//     return this.prisma.integrationLog.create({
//       data: {
//         deviceId: device?.id ?? 1, // Fallback ID if DB is empty
//         direction: IntegrationDirection.INBOUND,
//         messageType: msgType,
//         rawMessage: rawMsg,
//         status: 'PENDING', // الحالة المبدئية، سيقوم الـ Consumer بتغييرها
//       },
//     });
//   }

//   // =================================================================
//   // 2. Outbound Layer: إرسال الطلبات للأجهزة (Orders)
//   // (هذا الجزء ما زال متزامناً، ويمكن تحويله لطابور في مرحلة لاحقة)
//   // =================================================================

//   /**
//    * إرسال طلب تحليل (Lab Order) إلى جهاز المختبر (LIS)
//    */
//   async sendOrderToDevice(orderId: number, hospitalId: number) {
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         labOrders: { include: { test: true } },
//       },
//     });

//     if (!order || order.labOrders.length === 0) return;

//     // البحث عن جهاز مختبر
//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'LAB' },
//     });

//     if (!device) {
//       this.logger.warn(
//         `⚠️ No active LAB device found for hospital ${hospitalId}`,
//       );
//       return;
//     }

//     // بناء رسالة HL7 ORM^O01
//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|LIS|${device.name}|LAB|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;

//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`; // O = Outpatient (يمكن تحسينه حسب EncounterType)

//     let hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}`;

//     for (let i = 0; i < order.labOrders.length; i++) {
//       const labOrder = order.labOrders[i];

//       // البحث عن الكود المقابل في الجهاز (Mapping)
//       const mapping = await this.prisma.testMapping.findFirst({
//         where: { deviceId: device.id, labTestId: labOrder.testId },
//       });
//       const testCode = mapping?.deviceTestCode ?? labOrder.test.code;

//       // OBR Segment
//       const obr = `OBR|${i + 1}|${order.id}|${labOrder.id}|${testCode}^${labOrder.test.name}|||${getHL7Date()}`;
//       hl7Message += `${obr}${CR}`;
//     }

//     const mllpMessage = wrapInMLLP(hl7Message);

//     // تسجيل الرسالة الصادرة
//     const logId = await this.logOutbound(device.id, 'ORM^O01', hl7Message);

//     // الإرسال عبر السوكيت
//     this.sendToSocket(device, mllpMessage, logId);
//   }

//   /**
//    * إرسال طلب أشعة (Radiology Order) إلى الـ PACS/RIS
//    */
//   async sendRadiologyOrder(orderId: number, hospitalId: number) {
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         radiologyOrder: { include: { study: true } },
//       },
//     });

//     if (!order || !order.radiologyOrder) return;

//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'RADIOLOGY' },
//     });

//     if (!device) {
//       this.logger.warn(
//         `⚠️ No active RADIOLOGY device found for hospital ${hospitalId}`,
//       );
//       return;
//     }

//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|RIS|${device.name}|MODALITY|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;

//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`;

//     const study = order.radiologyOrder.study;
//     // OBR includes Modality
//     const obr = `OBR|1|${order.id}|${order.radiologyOrder.id}|${study.code}^${study.name}|||${getHL7Date()}|||||||||${study.modality}`;

//     const hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}${obr}${CR}`;
//     const mllpMessage = wrapInMLLP(hl7Message);

//     const logId = await this.logOutbound(device.id, 'ORM^O01', hl7Message);
//     this.sendToSocket(device, mllpMessage, logId);
//   }

//   // --- Helpers ---

//   private async logOutbound(deviceId: number, type: string, msg: string) {
//     const log = await this.prisma.integrationLog.create({
//       data: {
//         deviceId,
//         direction: IntegrationDirection.OUTBOUND,
//         messageType: type,
//         rawMessage: msg,
//         status: 'PENDING',
//       },
//     });
//     return log.id;
//   }

//   private sendToSocket(
//     device: { ipAddress: string; port: number; name: string },
//     message: string,
//     logId: number,
//   ) {
//     const client = new net.Socket();
//     client.setTimeout(5000); // 5 seconds timeout

//     client.on('timeout', async () => {
//       client.destroy();
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'TIMEOUT', errorMessage: 'Connection timed out' },
//       });
//       this.logger.error(`⏱️ Timeout sending to ${device.name}`);
//     });

//     client.on('error', async (err) => {
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'ERROR', errorMessage: err.message },
//       });
//       this.logger.error(`❌ Send Error to ${device.name}: ${err.message}`);
//       client.destroy();
//     });

//     try {
//       client.connect(device.port, device.ipAddress, async () => {
//         this.logger.log(`📤 Sending order to ${device.name}...`);
//         client.write(message);

//         // نعتبرها مرسلة مبدئياً، وننتظر الـ ACK في حدث الـ data
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'SENT' }, // Sent but waiting for ACK
//         });
//       });

//       client.on('data', async (data) => {
//         const response = data.toString();
//         // التحقق البسيط من ACK
//         if (response.includes('MSA|AA') || response.includes('MSA|CA')) {
//           await this.prisma.integrationLog.update({
//             where: { id: logId },
//             data: { status: 'SUCCESS', parsedData: { ack: 'AA' } },
//           });
//           this.logger.log(`✅ ACK Received from ${device.name}`);
//         } else {
//           await this.prisma.integrationLog.update({
//             where: { id: logId },
//             data: { status: 'REJECTED', errorMessage: 'Negative ACK received' },
//           });
//           this.logger.warn(`⚠️ Negative ACK from ${device.name}`);
//         }
//         client.destroy();
//       });
//     } catch (e: any) {
//       this.logger.error('Connection logic error', e);
//       client.destroy();
//     }
//   }
// }

// import {
//   Injectable,
//   Logger,
//   OnModuleInit,
//   OnModuleDestroy,
// } from '@nestjs/common';
// import * as net from 'net';
// import { PrismaService } from '../prisma/prisma.service';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';
// import {
//   wrapInMLLP,
//   extractMessagesFromBuffer,
//   createACK,
//   CR,
// } from './hl7.utils';
// import { IntegrationDirection } from '@prisma/client';

// @Injectable()
// export class IntegrationService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(IntegrationService.name);
//   private server: net.Server;
//   private readonly LISTENER_PORT = 6661;

//   constructor(
//     private prisma: PrismaService,
//     @InjectQueue('hl7-queue') private hl7Queue: Queue, // حقن الطابور
//   ) {}

//   async onModuleInit() {
//     this.startHL7Listener(this.LISTENER_PORT);
//   }

//   async onModuleDestroy() {
//     if (this.server) {
//       this.server.close();
//       this.logger.log('🛑 LIS Integration Server stopped.');
//     }
//   }

//   private startHL7Listener(port: number) {
//     this.server = net.createServer((socket) => {
//       const clientAddr = socket.remoteAddress?.replace('::ffff:', '');
//       this.logger.log(`🔌 Device connected: ${clientAddr}`);

//       let buffer = '';

//       socket.on('data', async (data) => {
//         buffer += data.toString();
//         const { messages, remainingBuffer } = extractMessagesFromBuffer(buffer);
//         buffer = remainingBuffer;

//         for (const cleanMsg of messages) {
//           try {
//             // 1. Persistence: حفظ الرسالة في قاعدة البيانات أولاً (حالة PENDING)
//             const logEntry = await this.saveInboundMessage(
//               cleanMsg,
//               clientAddr,
//             );

//             // 2. Queueing: إضافة المهمة للطابور للمعالجة في الخلفية
//             // نستخدم removeOnComplete لتنظيف Redis، أو نتركه للتدقيق
//             await this.hl7Queue.add(
//               'process-hl7',
//               { logId: logEntry.id, rawMessage: cleanMsg },
//               {
//                 attempts: 3, // محاولة 3 مرات في حال الفشل
//                 backoff: 5000, // انتظار 5 ثواني بين المحاولات
//                 removeOnComplete: true,
//               },
//             );

//             this.logger.debug(`QC Queued: Log #${logEntry.id}`);

//             // 3. Acknowledgment: الرد فوراً بـ ACK (تم الاستلام بنجاح)
//             // الجهاز لا ينتظر المعالجة، فقط يهمه أننا استلمنا الرسالة
//             const ack = createACK(cleanMsg, 'AA');
//             socket.write(wrapInMLLP(ack));
//           } catch (e) {
//             this.logger.error(
//               '❌ Critical Error receiving/queueing message',
//               e,
//             );
//             // في حال فشل الحفظ في DB أو الـ Queue، نرسل خطأ للجهاز ليعيد الإرسال
//             const nack = createACK(cleanMsg, 'AE', 'Internal Server Error');
//             socket.write(wrapInMLLP(nack));
//           }
//         }
//       });

//       socket.on('error', (err) =>
//         this.logger.error(`Socket error: ${err.message}`),
//       );
//     });

//     this.server.listen(port, () => {
//       this.logger.log(
//         `🏥 Async HL7 Server listening on port ${port} (Ready for Production)`,
//       );
//     });
//   }

//   private async saveInboundMessage(rawMsg: string, ip?: string) {
//     const segments = rawMsg.split('\r');
//     const msh = segments[0].split('|');
//     const sendingApp = msh[2];
//     const msgType = msh[8];

//     // محاولة ربط الرسالة بجهاز معرف
//     let device = await this.prisma.medicalDevice.findFirst({
//       where: {
//         isActive: true,
//         OR: [
//           { name: { equals: sendingApp, mode: 'insensitive' } },
//           { ipAddress: ip },
//         ],
//       },
//     });

//     if (!device) {
//       device = await this.prisma.medicalDevice.findFirst({
//         where: { isActive: true },
//       });
//     }

//     return this.prisma.integrationLog.create({
//       data: {
//         deviceId: device?.id ?? 1,
//         direction: IntegrationDirection.INBOUND,
//         messageType: msgType,
//         rawMessage: rawMsg,
//         status: 'PENDING', // الحالة المبدئية
//       },
//     });
//   }

//   // ... (دوال الإرسال Outbound تبقى كما هي، أو يمكن تحويلها لطابور أيضاً لاحقاً)
//   // async sendOrderToDevice(...) { ... }
// }

// // src/integration/integration.service.ts

// import {
//   Injectable,
//   Logger,
//   OnModuleInit,
//   OnModuleDestroy,
// } from '@nestjs/common';
// import * as net from 'net';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   wrapInMLLP,
//   extractMessagesFromBuffer,
//   createACK,
//   getHL7Date,
//   CR,
// } from './hl7.utils';
// import { IntegrationDirection, IntegrationProtocol } from '@prisma/client';
// import { Cron, CronExpression } from '@nestjs/schedule';

// @Injectable()
// export class IntegrationService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(IntegrationService.name);
//   private server: net.Server;
//   private readonly LISTENER_PORT = 6661;

//   constructor(private prisma: PrismaService) {}

//   async onModuleInit() {
//     this.startHL7Listener(this.LISTENER_PORT);
//   }

//   async onModuleDestroy() {
//     if (this.server) {
//       this.server.close();
//       this.logger.log('🛑 LIS Integration Server stopped.');
//     }
//   }

//   // =================================================================
//   // 1. طبقة الاستقبال (Reception Layer) - سريعة وخفيفة
//   // =================================================================
//   private startHL7Listener(port: number) {
//     this.server = net.createServer((socket) => {
//       const clientAddr = socket.remoteAddress?.replace('::ffff:', '');
//       this.logger.log(`🔌 Device connected: ${clientAddr}`);

//       let buffer = '';

//       socket.on('data', async (data) => {
//         buffer += data.toString();

//         // استخدام الدالة المحسنة للتعامل مع التجزئة
//         const { messages, remainingBuffer } = extractMessagesFromBuffer(buffer);
//         buffer = remainingBuffer; // الاحتفاظ بالمتبقي للحزمة التالية

//         for (const cleanMsg of messages) {
//           try {
//             // 1. حفظ الرسالة الخام فوراً في القاعدة (Persistence First)
//             // حتى لو فشلت المعالجة لاحقاً، البيانات محفوظة
//             const logEntry = await this.saveInboundMessage(
//               cleanMsg,
//               clientAddr,
//             );

//             // 2. إرسال ACK إيجابي للجهاز ليعرف أننا استلمنا الرسالة
//             const ack = createACK(cleanMsg, 'AA');
//             socket.write(wrapInMLLP(ack));

//             // 3. (اختياري) يمكن استدعاء المعالجة فوراً أو تركها للـ Cron Job
//             // سنقوم باستدعائها فوراً للسرعة، لكن الخطأ لن يوقف الـ ACK
//             this.processMessageAsync(logEntry.id, cleanMsg).catch((err) => {
//               this.logger.error(
//                 `Async processing failed for log #${logEntry.id}`,
//                 err,
//               );
//             });
//           } catch (e) {
//             this.logger.error('❌ Critical Error receiving message', e);
//             // إرسال NACK في حالة الخطأ الجسيم
//             socket.write(
//               wrapInMLLP(createACK(cleanMsg, 'AE', 'Internal Error')),
//             );
//           }
//         }
//       });

//       socket.on('error', (err) =>
//         this.logger.error(`Socket error: ${err.message}`),
//       );
//     });

//     this.server.listen(port, () => {
//       this.logger.log(
//         `🏥 HL7 Server listening on port ${port} (Production Mode)`,
//       );
//     });
//   }

//   private async saveInboundMessage(rawMsg: string, ip?: string) {
//     const segments = rawMsg.split('\r');
//     const msh = segments[0].split('|');
//     const sendingApp = msh[2];
//     const msgType = msh[8];

//     // محاولة ربط الرسالة بجهاز معرف مسبقاً
//     let device = await this.prisma.medicalDevice.findFirst({
//       where: {
//         isActive: true,
//         OR: [
//           { name: { equals: sendingApp, mode: 'insensitive' } },
//           { ipAddress: ip },
//         ],
//       },
//     });

//     // Fallback device (يجب أن يكون لديك جهاز افتراضي في الـ seed)
//     if (!device) {
//       device = await this.prisma.medicalDevice.findFirst({
//         where: { isActive: true },
//       });
//     }

//     return this.prisma.integrationLog.create({
//       data: {
//         deviceId: device?.id ?? 1, // Fallback ID
//         direction: IntegrationDirection.INBOUND,
//         messageType: msgType,
//         rawMessage: rawMsg,
//         status: 'PENDING', // حالة مبدئية: بانتظار المعالجة
//       },
//     });
//   }

//   // =================================================================
//   // 2. طبقة المعالجة (Processing Layer) - منطق الأعمال
//   // =================================================================

//   // معالجة الرسائل المعلقة (Queue Processor)
//   @Cron(CronExpression.EVERY_30_SECONDS)
//   async processPendingMessagesCron() {
//     // نأخذ الرسائل التي فشلت سابقاً أو لم تعالج لسبب ما
//     const pendingLogs = await this.prisma.integrationLog.findMany({
//       where: {
//         direction: IntegrationDirection.INBOUND,
//         status: 'PENDING',
//       },
//       take: 10, // معالجة 10 رسائل في كل دورة لتخفيف الحمل
//     });

//     for (const log of pendingLogs) {
//       await this.processMessageAsync(log.id, log.rawMessage);
//     }
//   }

//   private async processMessageAsync(logId: number, rawMsg: string) {
//     try {
//       const segments = rawMsg.split(/[\r\n]+/); // Handle both \r and \n just in case
//       // ابحث عن نوع الرسالة
//       const msh = segments[0].split('|');
//       const msgType = msh[8]; // e.g. ORU^R01

//       if (msgType && msgType.includes('ORU')) {
//         await this.handleORU(segments);
//       }

//       // تحديث السجل إلى مكتمل
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'SUCCESS', errorMessage: null },
//       });
//     } catch (err: any) {
//       this.logger.error(`Error processing Log #${logId}`, err);
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'ERROR', errorMessage: err.message },
//       });
//     }
//   }

//   // منطق تحليل النتائج (المحسن)
//   private async handleORU(segments: string[]) {
//     let orderId: number | null = null;
//     let pacsLink: string | null = null;

//     // استخدام خريطة لتجميع نتائج التحاليل
//     // Key: Test Code, Value: Result
//     const labResults: {
//       code: string;
//       value: string;
//       unit: string;
//       range: string;
//     }[] = [];
//     const radiologyReportLines: string[] = [];

//     // 1. Parsing Phase
//     for (const seg of segments) {
//       const fields = seg.split('|');
//       const segmentType = fields[0];

//       if (segmentType === 'OBR') {
//         // محاولة قراءة Placer Order Number (النظام الخاص بنا)
//         // غالباً يكون في الحقل 2، وأحياناً الجهاز يعيده في 3
//         const placerOrder = fields[2];
//         if (placerOrder) orderId = parseInt(placerOrder);
//       }

//       if (segmentType === 'OBX') {
//         const valueType = fields[2]; // ST, NM, TX, RP
//         const observationId = fields[3]; // Code^Name^System
//         const observationVal = fields[5];
//         const units = fields[6];
//         const references = fields[7];

//         const testCode = observationId.split('^')[0];

//         if (
//           valueType === 'RP' ||
//           (observationVal && observationVal.includes('http'))
//         ) {
//           // رابط صورة (PACS)
//           pacsLink = observationVal;
//         } else {
//           // نتيجة عادية
//           labResults.push({
//             code: testCode,
//             value: observationVal,
//             unit: units,
//             range: references,
//           });
//           // أيضاً نجمع النص للأشعة
//           if (observationVal) radiologyReportLines.push(observationVal);
//         }
//       }
//     }

//     if (!orderId) {
//       throw new Error('No Order ID found in OBR segment');
//     }

//     // 2. Database Update Phase
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         labOrders: { include: { test: { include: { parameters: true } } } },
//         radiologyOrder: true,
//       },
//     });

//     if (!order) throw new Error(`Order #${orderId} not found in DB`);

//     if (order.type === 'LAB') {
//       // مطابقة نتائج المختبر
//       for (const res of labResults) {
//         // البحث عن LabOrder مطابق عبر الكود
//         // نبحث أولاً في الباراميترز (لأن بعض الأجهزة ترسل كود الباراميتر وليس كود التحليل الرئيسي)
//         for (const labOrder of order.labOrders) {
//           // هل هذا الكود يطابق باراميتر؟
//           const param = labOrder.test.parameters.find(
//             (p) => p.code === res.code,
//           );
//           if (param) {
//             await this.prisma.labOrderResult.create({
//               data: {
//                 labOrderId: labOrder.id,
//                 parameterId: param.id,
//                 parameterName: param.name,
//                 value: res.value,
//                 unit: res.unit || param.unit,
//                 range: res.range || param.refRange,
//               },
//             });
//             // نعتبر الطلب مكتملاً
//             await this.prisma.labOrder.update({
//               where: { id: labOrder.id },
//               data: { resultStatus: 'COMPLETED', resultDate: new Date() },
//             });
//             continue; // انتقل للنتيجة التالية
//           }

//           // هل هذا الكود يطابق التحليل الرئيسي؟
//           if (labOrder.test.code === res.code) {
//             await this.prisma.labOrder.update({
//               where: { id: labOrder.id },
//               data: {
//                 resultValue: res.value,
//                 resultUnit: res.unit,
//                 referenceRange: res.range,
//                 resultStatus: 'COMPLETED',
//                 resultDate: new Date(),
//               },
//             });
//           }
//         }
//       }
//       // تحديث الطلب الرئيسي
//       await this.prisma.order.update({
//         where: { id: order.id },
//         data: { status: 'COMPLETED', completedAt: new Date() },
//       });
//     } else if (order.type === 'RADIOLOGY' && order.radiologyOrder) {
//       // تحديث الأشعة
//       const reportText = radiologyReportLines.join('\n');

//       await this.prisma.radiologyOrder.update({
//         where: { id: order.radiologyOrder.id },
//         data: {
//           status: 'COMPLETED',
//           reportedAt: new Date(),
//           reportText: reportText || 'See Image',
//           pacsUrl: pacsLink,
//         },
//       });

//       await this.prisma.order.update({
//         where: { id: order.id },
//         data: { status: 'COMPLETED', completedAt: new Date() },
//       });
//     }
//   }

//   // =================================================================
//   // 3. طبقة الإرسال (Sending Layer)
//   // =================================================================
//   // هذه الدوال (sendOrderToDevice) تبقى كما هي، ولكن أنصح
//   // بتحويلها أيضاً لتعمل بنظام Queue مستقبلاً

//   async sendOrderToDevice(orderId: number, hospitalId: number) {
//     // ... (نفس الكود السابق لإرسال الطلب)
//     // لكن بدلاً من Socket.write مباشرة، يفضل حفظها في Log بحالة PENDING_SEND
//     // وعمل Cron Job آخر يرسل الـ OUTBOUND messages
//     // سأترك الكود القديم هنا لعدم تعقيد الأمور الآن،
//     // لكن المبدأ هو فصل الإرسال عن وقت إنشاء الطلب.
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         labOrders: { include: { test: true } },
//       },
//     });
//     if (!order || order.labOrders.length === 0) return;

//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'LAB' },
//     });
//     if (!device) return;

//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|LIS|${device.name}|LAB|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`;

//     let hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}`;

//     for (let i = 0; i < order.labOrders.length; i++) {
//       const labOrder = order.labOrders[i];
//       // OBR Segment
//       // Field 2: Placer Order Number (Order ID الخاص بنا)
//       // Field 4: Universal Service ID (Code^Name)
//       const obr = `OBR|${i + 1}|${order.id}||${labOrder.test.code}^${labOrder.test.name}|||${getHL7Date()}`;
//       hl7Message += `${obr}${CR}`;
//     }

//     const mllpMessage = wrapInMLLP(hl7Message);

//     // حفظ في السجل أولاً
//     const log = await this.prisma.integrationLog.create({
//       data: {
//         deviceId: device.id,
//         direction: IntegrationDirection.OUTBOUND,
//         messageType: 'ORM^O01',
//         rawMessage: hl7Message,
//         status: 'PENDING',
//       },
//     });

//     // المحاولة الفورية للإرسال
//     this.sendToSocket(device, mllpMessage, log.id);
//   }

//   private sendToSocket(device: any, message: string, logId: number) {
//     const client = new net.Socket();
//     client.setTimeout(5000); // 5 ثواني مهلة

//     client.connect(device.port, device.ipAddress, async () => {
//       this.logger.log(`📤 Sending order to ${device.name}...`);
//       client.write(message);
//     });

//     client.on('data', async (data) => {
//       // استلام ACK
//       const ack = data.toString();
//       if (ack.includes('MSA|AA')) {
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'SUCCESS', parsedData: { ack: 'AA' } },
//         });
//         client.destroy();
//       } else {
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'ERROR', errorMessage: 'Received Negative ACK' },
//         });
//       }
//     });

//     client.on('timeout', async () => {
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'TIMEOUT' },
//       });
//       client.destroy();
//     });

//     client.on('error', async (err) => {
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'ERROR', errorMessage: err.message },
//       });
//       client.destroy();
//     });
//   }
// }

// // src/integration/integration.service.ts

// import {
//   Injectable,
//   Logger,
//   OnModuleInit,
//   OnModuleDestroy,
// } from '@nestjs/common';
// import * as net from 'net';
// import { PrismaService } from '../prisma/prisma.service';
// import { LabService } from '../labs/labs.service';
// import { RadiologyService } from '../radiology/radiology.service';
// import { VT, FS, CR, unwrapMLLP, wrapInMLLP, getHL7Date } from './hl7.utils';
// import { IntegrationDirection } from '@prisma/client';

// @Injectable()
// export class IntegrationService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(IntegrationService.name);
//   private server: net.Server;
//   private readonly LISTENER_PORT = 6661;

//   constructor(
//     private prisma: PrismaService,
//     private labService: LabService,
//     private radiologyService: RadiologyService,
//   ) {}

//   async onModuleInit() {
//     this.startHL7Listener(this.LISTENER_PORT);
//   }

//   async onModuleDestroy() {
//     if (this.server) {
//       this.server.close();
//       this.logger.log('🛑 LIS Integration Server stopped.');
//     }
//   }

//   // ... (startHL7Listener كما هي) ...
//   private startHL7Listener(port: number) {
//     this.server = net.createServer((socket) => {
//       this.logger.log(`🔌 Device connected: ${socket.remoteAddress}`);

//       let buffer = '';

//       socket.on('data', async (data) => {
//         buffer += data.toString();
//         if (buffer.includes(FS + CR)) {
//           const rawMessages = buffer.split(FS + CR);
//           for (const rawMsg of rawMessages) {
//             if (!rawMsg.includes(VT)) continue;
//             const cleanMsg = unwrapMLLP(rawMsg + FS + CR);
//             this.logger.debug(
//               `📥 Received HL7: ${cleanMsg.substring(0, 50)}...`,
//             );
//             try {
//               await this.processIncomingHL7(cleanMsg, socket.remoteAddress);
//               const ackMessage = this.createACK(cleanMsg);
//               socket.write(wrapInMLLP(ackMessage));
//             } catch (e) {
//               this.logger.error('❌ Error processing HL7 message', e);
//             }
//           }
//           buffer = '';
//         }
//       });
//       socket.on('error', (err) =>
//         this.logger.error(`Socket error: ${err.message}`),
//       );
//       socket.on('close', () => this.logger.debug('Device disconnected'));
//     });
//     this.server.listen(port, () => {
//       this.logger.log(`🏥 Integration Server is listening on port ${port}`);
//     });
//   }

//   // ✅ [UPDATED] البحث عن الجهاز بالاسم
//   private async processIncomingHL7(rawMsg: string, ip?: string) {
//     const segments = rawMsg.split(CR);
//     const msh = segments[0].split('|');
//     const sendingApp = msh[2]; // اسم المرسل (مثلاً PACS_SIM)
//     const msgType = msh[8];

//     // محاولة العثور على الجهاز
//     // 1. بالاسم القادم في الرسالة (الأدق)
//     let device = await this.prisma.medicalDevice.findFirst({
//       where: {
//         isActive: true,
//         OR: [
//           { name: { equals: sendingApp, mode: 'insensitive' } }, // تطابق الاسم
//           { ipAddress: ip?.replace('::ffff:', '') }, // تطابق الـ IP
//         ],
//       },
//     });

//     // 2. إذا لم نجد، نأخذ الجهاز الافتراضي (Fallback)
//     if (!device) {
//       device = await this.prisma.medicalDevice.findFirst({
//         where: { isActive: true },
//       });
//     }

//     await this.prisma.integrationLog.create({
//       data: {
//         deviceId: device?.id ?? 1,
//         direction: IntegrationDirection.INBOUND,
//         messageType: msgType,
//         rawMessage: rawMsg,
//         status: 'RECEIVED',
//       },
//     });

//     if (msgType && msgType.includes('ORU')) {
//       await this.handleORU(segments);
//     }
//   }

//   // ✅ [UPDATED] معالجة النتائج + الصور
//   private async handleORU(segments: string[]) {
//     let orderId: number | null = null;
//     let resultTextBuilder: string[] = [];
//     let pacsLink: string | null = null;

//     for (const seg of segments) {
//       const fields = seg.split('|');
//       if (fields[0] === 'OBR') {
//         orderId = parseInt(fields[2]);
//       }
//     }

//     if (!orderId) {
//       this.logger.warn('⚠️ ORU received without valid Order ID');
//       return;
//     }

//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         labOrders: { include: { test: { include: { parameters: true } } } },
//         radiologyOrder: true,
//       },
//     });

//     if (!order) {
//       this.logger.error(`❌ Order #${orderId} not found`);
//       return;
//     }

//     // --- مختبر ---
//     if (order.type === 'LAB' && order.labOrders.length > 0) {
//       this.logger.log(`🧪 Processing LAB results for Order #${orderId}`);
//       await this.processLabResults(segments, order.labOrders);
//     }
//     // --- أشعة ---
//     else if (order.type === 'RADIOLOGY' && order.radiologyOrder) {
//       this.logger.log(`☢️ Processing RADIOLOGY report for Order #${orderId}`);

//       for (const seg of segments) {
//         const fields = seg.split('|');
//         if (fields[0] === 'OBX') {
//           const value = fields[5];
//           const valueType = fields[2]; // TX, RP, etc.

//           // التحقق من الرابط (سواء كان RP أو رابط نصي)
//           if (
//             valueType === 'RP' ||
//             (value && (value.startsWith('http') || value.startsWith('www')))
//           ) {
//             pacsLink = value;
//             this.logger.debug(`🔗 Found Image Link: ${pacsLink}`);
//           } else if (value && value !== pacsLink) {
//             resultTextBuilder.push(value);
//           }
//         }
//       }

//       const fullReport = resultTextBuilder.join('\n');

//       await this.prisma.radiologyOrder.update({
//         where: { id: order.radiologyOrder.id },
//         data: {
//           status: 'COMPLETED',
//           reportedAt: new Date(),
//           reportText: fullReport || undefined,
//           pacsUrl: pacsLink || undefined, // ✅ حفظ
//         },
//       });

//       await this.prisma.order.update({
//         where: { id: orderId },
//         data: { status: 'COMPLETED', completedAt: new Date() },
//       });

//       this.logger.log(
//         `✅ Radiology Report Saved for Order #${orderId} (Image: ${
//           pacsLink ? 'Yes' : 'No'
//         })`,
//       );
//     }
//   }

//   // ... (باقي الدوال createACK, processLabResults, sendOrderToDevice, sendRadiologyOrder, logOutbound, sendToSocket كما هي في الملف السابق دون تغيير) ...
//   // انسخها من الملف السابق الذي أرسلته لك إذا لم تكن موجودة أدناه

//   private createACK(originalMsg: string): string {
//     const segments = originalMsg.split(CR);
//     const msh = segments[0].split('|');
//     const msgControlId = msh[9];
//     return `MSH|^~\\&|SARAYA|HIS|ANALYZER|LAB|${getHL7Date()}||ACK^R01|ACK${Date.now()}|P|2.4${CR}MSA|AA|${msgControlId}${CR}`;
//   }

//   private async processLabResults(segments: string[], labOrders: any[]) {
//     let currentFillerOrder: number | null = null;
//     for (const seg of segments) {
//       const fields = seg.split('|');
//       if (fields[0] === 'OBR') {
//         currentFillerOrder = parseInt(fields[3]);
//       }
//       if (fields[0] === 'OBX') {
//         const rawCode = fields[3];
//         const paramCode = rawCode.split('^')[0];
//         const value = fields[5];
//         const unit = fields[6];
//         const range = fields[7];
//         const flag = fields[8];

//         let targetLabOrder = currentFillerOrder
//           ? labOrders.find((lo) => lo.id === currentFillerOrder)
//           : null;

//         if (!targetLabOrder) {
//           for (const lo of labOrders) {
//             if (
//               lo.test.parameters.some((p: any) => p.code === paramCode) ||
//               lo.test.code === paramCode
//             ) {
//               targetLabOrder = lo;
//               break;
//             }
//           }
//         }
//         if (!targetLabOrder) continue;

//         const paramDef = targetLabOrder.test.parameters.find(
//           (p: any) => p.code === paramCode,
//         );

//         if (paramDef) {
//           await this.prisma.labOrderResult.create({
//             data: {
//               labOrderId: targetLabOrder.id,
//               parameterId: paramDef.id,
//               parameterName: paramDef.name,
//               value: value,
//               unit: unit || paramDef.unit,
//               range: range || paramDef.refRange,
//               flag: flag,
//             },
//           });
//           await this.prisma.labOrder.update({
//             where: { id: targetLabOrder.id },
//             data: { resultStatus: 'COMPLETED', resultDate: new Date() },
//           });
//         } else if (targetLabOrder.test.code === paramCode) {
//           await this.prisma.labOrder.update({
//             where: { id: targetLabOrder.id },
//             data: {
//               resultValue: value,
//               resultUnit: unit,
//               referenceRange: range,
//               resultStatus: 'COMPLETED',
//               resultDate: new Date(),
//             },
//           });
//         }
//       }
//     }
//   }

//   async sendOrderToDevice(orderId: number, hospitalId: number) {
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         labOrders: { include: { test: true } },
//       },
//     });
//     if (!order || order.labOrders.length === 0) return;
//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'LAB' },
//     });
//     if (!device) return;

//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|LIS|${device.name}|LAB|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`;
//     let hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}`;

//     for (let i = 0; i < order.labOrders.length; i++) {
//       const labOrder = order.labOrders[i];
//       const mapping = await this.prisma.testMapping.findFirst({
//         where: { deviceId: device.id, labTestId: labOrder.testId },
//       });
//       const testCode = mapping?.deviceTestCode ?? labOrder.test.code;
//       const obr = `OBR|${i + 1}|${order.id}|${labOrder.id}|${testCode}^${labOrder.test.name}|||${getHL7Date()}`;
//       hl7Message += `${obr}${CR}`;
//     }
//     const mllpMessage = wrapInMLLP(hl7Message);
//     const logId = await this.logOutbound(device.id, 'ORM^O01', hl7Message);
//     this.sendToSocket(device, mllpMessage, logId);
//   }

//   async sendRadiologyOrder(orderId: number, hospitalId: number) {
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         radiologyOrder: { include: { study: true } },
//       },
//     });
//     if (!order || !order.radiologyOrder) return;
//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'RADIOLOGY' },
//     });
//     if (!device) {
//       this.logger.warn(
//         `No active RADIOLOGY device found for hospital #${hospitalId}.`,
//       );
//       return;
//     }
//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|RIS|${device.name}|MODALITY|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`;
//     const study = order.radiologyOrder.study;
//     const obr = `OBR|1|${order.id}|${order.radiologyOrder.id}|${study.code}^${study.name}|||${getHL7Date()}|||||||||${study.modality}`;
//     const hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}${obr}${CR}`;
//     const mllpMessage = wrapInMLLP(hl7Message);
//     const logId = await this.logOutbound(device.id, 'ORM^O01', hl7Message);
//     this.sendToSocket(device, mllpMessage, logId);
//   }

//   private async logOutbound(deviceId: number, type: string, msg: string) {
//     const log = await this.prisma.integrationLog.create({
//       data: {
//         deviceId,
//         direction: IntegrationDirection.OUTBOUND,
//         messageType: type,
//         rawMessage: msg,
//         status: 'PENDING',
//       },
//     });
//     return log.id;
//   }

//   private sendToSocket(device: any, message: string, logId: number) {
//     const client = new net.Socket();
//     client.setTimeout(5000);
//     client.on('timeout', async () => {
//       client.destroy();
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'TIMEOUT' },
//       });
//     });
//     client.on('error', async (err) => {
//       this.logger.error(`❌ Send Error: ${err.message}`);
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'ERROR', errorMessage: err.message },
//       });
//       client.destroy();
//     });
//     try {
//       client.connect(device.port, device.ipAddress, async () => {
//         this.logger.log(`📤 Sending to ${device.name}...`);
//         client.write(message);
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'SENT' },
//         });
//       });
//       client.on('data', () => {
//         this.logger.log('✅ ACK Received');
//         client.destroy();
//       });
//     } catch (e) {
//       this.logger.error('Connection logic error');
//     }
//   }
// }

// // src/integration/integration.service.ts

// import {
//   Injectable,
//   Logger,
//   OnModuleInit,
//   OnModuleDestroy,
// } from '@nestjs/common';
// import * as net from 'net';
// import { PrismaService } from '../prisma/prisma.service';
// import { LabService } from '../labs/labs.service';
// import { RadiologyService } from '../radiology/radiology.service';
// import { VT, FS, CR, unwrapMLLP, wrapInMLLP, getHL7Date } from './hl7.utils';
// import { IntegrationDirection } from '@prisma/client';

// @Injectable()
// export class IntegrationService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(IntegrationService.name);
//   private server: net.Server;
//   private readonly LISTENER_PORT = 6661;

//   constructor(
//     private prisma: PrismaService,
//     private labService: LabService,
//     private radiologyService: RadiologyService,
//   ) {}

//   async onModuleInit() {
//     this.startHL7Listener(this.LISTENER_PORT);
//   }

//   async onModuleDestroy() {
//     if (this.server) {
//       this.server.close();
//       this.logger.log('🛑 LIS Integration Server stopped.');
//     }
//   }

//   // =================================================================
//   // 1. Inbound: استقبال النتائج (Server)
//   // =================================================================
//   private startHL7Listener(port: number) {
//     this.server = net.createServer((socket) => {
//       this.logger.log(`🔌 Device connected: ${socket.remoteAddress}`);

//       let buffer = '';

//       socket.on('data', async (data) => {
//         buffer += data.toString();

//         // التحقق من اكتمال الرسالة
//         if (buffer.includes(FS + CR)) {
//           const rawMessages = buffer.split(FS + CR);

//           for (const rawMsg of rawMessages) {
//             if (!rawMsg.includes(VT)) continue;

//             // تعريف cleanMsg داخل النطاق الصحيح
//             const cleanMsg = unwrapMLLP(rawMsg + FS + CR);
//             this.logger.debug(
//               `📥 Received HL7: ${cleanMsg.substring(0, 50)}...`,
//             );

//             try {
//               await this.processIncomingHL7(cleanMsg, socket.remoteAddress);

//               const ackMessage = this.createACK(cleanMsg);
//               socket.write(wrapInMLLP(ackMessage));
//             } catch (e) {
//               this.logger.error('❌ Error processing HL7 message', e);
//             }
//           }
//           buffer = '';
//         }
//       });

//       socket.on('error', (err) =>
//         this.logger.error(`Socket error: ${err.message}`),
//       );
//       socket.on('close', () => this.logger.debug('Device disconnected'));
//     });

//     this.server.listen(port, () => {
//       this.logger.log(`🏥 Integration Server is listening on port ${port}`);
//     });
//   }

//   private async processIncomingHL7(rawMsg: string, ip?: string) {
//     const segments = rawMsg.split(CR);
//     const msh = segments[0].split('|');
//     const msgType = msh[8];

//     // تحديد الجهاز (مبسط)
//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { isActive: true },
//     });

//     await this.prisma.integrationLog.create({
//       data: {
//         deviceId: device?.id ?? 1,
//         direction: IntegrationDirection.INBOUND,
//         messageType: msgType,
//         rawMessage: rawMsg,
//         status: 'RECEIVED',
//       },
//     });

//     if (msgType && msgType.includes('ORU')) {
//       await this.handleORU(segments);
//     }
//   }

//   private createACK(originalMsg: string): string {
//     const segments = originalMsg.split(CR);
//     const msh = segments[0].split('|');
//     const msgControlId = msh[9];
//     return `MSH|^~\\&|SARAYA|HIS|ANALYZER|LAB|${getHL7Date()}||ACK^R01|ACK${Date.now()}|P|2.4${CR}MSA|AA|${msgControlId}${CR}`;
//   }

//   // =================================================================
//   // 2. معالجة النتائج (Unified: Lab + Radiology)
//   // =================================================================
//   // private async handleORU(segments: string[]) {
//   //   let orderId: number | null = null;
//   //   let resultTextBuilder: string[] = [];

//   //   // استخراج رقم الطلب من OBR
//   //   for (const seg of segments) {
//   //     const fields = seg.split('|');
//   //     if (fields[0] === 'OBR') {
//   //       // الحقل 2: Order ID العام في النظام
//   //       orderId = parseInt(fields[2]);
//   //     }
//   //   }

//   //   if (!orderId) {
//   //     this.logger.warn('⚠️ ORU received without valid Order ID');
//   //     return;
//   //   }

//   //   const order = await this.prisma.order.findUnique({
//   //     where: { id: orderId },
//   //     include: {
//   //       labOrders: { include: { test: { include: { parameters: true } } } },
//   //       radiologyOrder: true,
//   //     },
//   //   });

//   //   if (!order) {
//   //     this.logger.error(`❌ Order #${orderId} not found`);
//   //     return;
//   //   }

//   //   // --- مسار المختبر ---
//   //   if (order.type === 'LAB' && order.labOrders.length > 0) {
//   //     this.logger.log(`🧪 Processing LAB results for Order #${orderId}`);
//   //     await this.processLabResults(segments, order.labOrders);
//   //   }

//   //   // --- مسار الأشعة ---
//   //   else if (order.type === 'RADIOLOGY' && order.radiologyOrder) {
//   //     this.logger.log(`☢️ Processing RADIOLOGY report for Order #${orderId}`);

//   //     let pacsLink: string | null = null;

//   //     // تجميع التقرير والبحث عن الرابط
//   //     for (const seg of segments) {
//   //       const fields = seg.split('|');
//   //       if (fields[0] === 'OBX') {
//   //         const value = fields[5];

//   //         // ✅ [NEW] منطق ذكي: إذا كانت القيمة رابط، نعتبرها رابط الصورة
//   //         if (value && (value.startsWith('http') || value.startsWith('www'))) {
//   //           pacsLink = value;
//   //         } else {
//   //           // وإلا فهي جزء من النص
//   //           if (value) resultTextBuilder.push(value);
//   //         }
//   //       }
//   //     }

//   //     const fullReport = resultTextBuilder.join('\n');

//   //     if (fullReport || pacsLink) {
//   //       // تحديث الطلب بالتقرير والرابط
//   //       // ⚠️ ملاحظة: سنحتاج لتحديث دالة completeOrderWithReport في RadiologyService لتقبل الرابط
//   //       // لكن للسرعة سأقوم بالتحديث المباشر هنا أو تحديث الـ Service

//   //       await this.prisma.radiologyOrder.update({
//   //         where: { id: order.radiologyOrder.id },
//   //         data: {
//   //           status: 'COMPLETED',
//   //           reportedAt: new Date(),
//   //           reportText: fullReport,
//   //           pacsUrl: pacsLink, // ✅ حفظ الرابط
//   //         },
//   //       });

//   //       // تحديث حالة الطلب الرئيسي
//   //       await this.prisma.order.update({
//   //         where: { id: orderId },
//   //         data: { status: 'COMPLETED', completedAt: new Date() },
//   //       });

//   //       this.logger.log(
//   //         `✅ Radiology Report & Image Link Saved for Order #${orderId}`,
//   //       );
//   //     }
//   //   }

//   //   // else if (order.type === 'RADIOLOGY' && order.radiologyOrder) {
//   //   //   this.logger.log(`☢️ Processing RADIOLOGY report for Order #${orderId}`);

//   //   //   for (const seg of segments) {
//   //   //     const fields = seg.split('|');
//   //   //     if (fields[0] === 'OBX') {
//   //   //       const textLine = fields[5];
//   //   //       if (textLine) resultTextBuilder.push(textLine);
//   //   //     }
//   //   //   }

//   //   //   const fullReport = resultTextBuilder.join('\n');
//   //   //   if (fullReport) {
//   //   //     await this.radiologyService.completeOrderWithReport({
//   //   //       hospitalId: order.hospitalId,
//   //   //       radiologyOrderId: order.radiologyOrder.id,
//   //   //       reportedById: 1, // System User
//   //   //       reportText: fullReport,
//   //   //     });
//   //   //     this.logger.log(`✅ Radiology Report Saved for Order #${orderId}`);
//   //   //   }
//   //   // }
//   // }

//   // =================================================================
//   // 2. معالجة النتائج (Unified: Lab + Radiology) - النسخة المعدلة للصورة
//   // =================================================================
//   private async handleORU(segments: string[]) {
//     let orderId: number | null = null;
//     let resultTextBuilder: string[] = [];
//     let pacsLink: string | null = null; // متغير لتخزين الرابط

//     // 1. استخراج رقم الطلب من OBR
//     for (const seg of segments) {
//       const fields = seg.split('|');
//       if (fields[0] === 'OBR') {
//         orderId = parseInt(fields[2]); // Order ID العام
//       }
//     }

//     if (!orderId) {
//       this.logger.warn('⚠️ ORU received without valid Order ID');
//       return;
//     }

//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         labOrders: { include: { test: { include: { parameters: true } } } },
//         radiologyOrder: true,
//       },
//     });

//     if (!order) {
//       this.logger.error(`❌ Order #${orderId} not found`);
//       return;
//     }

//     // --- مسار المختبر (LAB) ---
//     if (order.type === 'LAB' && order.labOrders.length > 0) {
//       this.logger.log(`🧪 Processing LAB results for Order #${orderId}`);
//       await this.processLabResults(segments, order.labOrders);
//     }

//     // --- مسار الأشعة (RADIOLOGY) ---
//     else if (order.type === 'RADIOLOGY' && order.radiologyOrder) {
//       this.logger.log(`☢️ Processing RADIOLOGY report for Order #${orderId}`);

//       for (const seg of segments) {
//         const fields = seg.split('|');
//         if (fields[0] === 'OBX') {
//           const value = fields[5];
//           const valueType = fields[2]; // نوع البيانات (TX, NM, RP...)

//           // ✅ منطق ذكي لاستخراج الرابط
//           // 1. إذا كان النوع RP (Reference Pointer)
//           // 2. أو إذا كانت القيمة تبدأ بـ http/https/www
//           if (
//             valueType === 'RP' ||
//             (value && (value.startsWith('http') || value.startsWith('www')))
//           ) {
//             pacsLink = value;
//             this.logger.debug(`🔗 Found Image Link: ${pacsLink}`);
//           }
//           // تجميع النصوص (تجاهل الرابط إذا كان قد تم التقاطه كصورة)
//           else if (value && value !== pacsLink) {
//             resultTextBuilder.push(value);
//           }
//         }
//       }

//       const fullReport = resultTextBuilder.join('\n');

//       // ✅ التحديث المباشر في قاعدة البيانات (يشمل الرابط)
//       await this.prisma.radiologyOrder.update({
//         where: { id: order.radiologyOrder.id },
//         data: {
//           status: 'COMPLETED',
//           reportedAt: new Date(),
//           reportText: fullReport || undefined,
//           pacsUrl: pacsLink || undefined, // 🟢 هنا يتم حفظ الرابط
//         },
//       });

//       // تحديث الطلب الرئيسي
//       await this.prisma.order.update({
//         where: { id: orderId },
//         data: { status: 'COMPLETED', completedAt: new Date() },
//       });

//       this.logger.log(
//         `✅ Radiology Report Saved for Order #${orderId} (Image: ${pacsLink ? 'Yes' : 'No'})`,
//       );
//     }
//   }

//   private async processLabResults(segments: string[], labOrders: any[]) {
//     let currentFillerOrder: number | null = null;

//     for (const seg of segments) {
//       const fields = seg.split('|');

//       if (fields[0] === 'OBR') {
//         // الحقل 3: LabOrder ID (Filler)
//         currentFillerOrder = parseInt(fields[3]);
//       }

//       if (fields[0] === 'OBX') {
//         // محاولة تحديد الـ LabOrder المناسب
//         // 1. عبر الـ Filler ID إذا توفر
//         // 2. أو عبر مطابقة كود التحليل

//         const rawCode = fields[3];
//         const paramCode = rawCode.split('^')[0];
//         const value = fields[5];
//         const unit = fields[6];
//         const range = fields[7];
//         const flag = fields[8];

//         let targetLabOrder = currentFillerOrder
//           ? labOrders.find((lo) => lo.id === currentFillerOrder)
//           : null;

//         // إذا لم نجد بالـ ID، نبحث في كل الطلبات المفتوحة عن باراميتر مطابق
//         if (!targetLabOrder) {
//           for (const lo of labOrders) {
//             if (
//               lo.test.parameters.some((p: any) => p.code === paramCode) ||
//               lo.test.code === paramCode
//             ) {
//               targetLabOrder = lo;
//               break;
//             }
//           }
//         }

//         if (!targetLabOrder) continue;

//         // حفظ النتيجة
//         const paramDef = targetLabOrder.test.parameters.find(
//           (p: any) => p.code === paramCode,
//         );

//         if (paramDef) {
//           // نتيجة تفصيلية (CBC Parameter)
//           await this.prisma.labOrderResult.create({
//             data: {
//               labOrderId: targetLabOrder.id,
//               parameterId: paramDef.id,
//               parameterName: paramDef.name,
//               value: value,
//               unit: unit || paramDef.unit,
//               range: range || paramDef.refRange,
//               flag: flag,
//             },
//           });

//           // تحديث الحالة
//           await this.prisma.labOrder.update({
//             where: { id: targetLabOrder.id },
//             data: { resultStatus: 'COMPLETED', resultDate: new Date() },
//           });
//         } else if (targetLabOrder.test.code === paramCode) {
//           // نتيجة رئيسية (Single Test)
//           await this.prisma.labOrder.update({
//             where: { id: targetLabOrder.id },
//             data: {
//               resultValue: value,
//               resultUnit: unit,
//               referenceRange: range,
//               resultStatus: 'COMPLETED',
//               resultDate: new Date(),
//             },
//           });
//         }
//       }
//     }
//   }

//   // =================================================================
//   // 3. Outbound: إرسال أوامر المختبر (LAB)
//   // =================================================================
//   async sendOrderToDevice(orderId: number, hospitalId: number) {
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         labOrders: { include: { test: true } },
//       },
//     });

//     if (!order || order.labOrders.length === 0) return;

//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'LAB' },
//     });

//     if (!device) return;

//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|LIS|${device.name}|LAB|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`;

//     let hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}`;

//     for (let i = 0; i < order.labOrders.length; i++) {
//       const labOrder = order.labOrders[i];
//       const mapping = await this.prisma.testMapping.findFirst({
//         where: { deviceId: device.id, labTestId: labOrder.testId },
//       });
//       const testCode = mapping?.deviceTestCode ?? labOrder.test.code;

//       // OBR|Seq|OrderID|LabOrderID|Code^Name
//       const obr = `OBR|${i + 1}|${order.id}|${labOrder.id}|${testCode}^${labOrder.test.name}|||${getHL7Date()}`;
//       hl7Message += `${obr}${CR}`;
//     }

//     const mllpMessage = wrapInMLLP(hl7Message);
//     const logId = await this.logOutbound(device.id, 'ORM^O01', hl7Message);

//     this.sendToSocket(device, mllpMessage, logId);
//   }

//   // =================================================================
//   // 4. Outbound: إرسال أوامر الأشعة (RADIOLOGY)
//   // =================================================================
//   async sendRadiologyOrder(orderId: number, hospitalId: number) {
//     const order = await this.prisma.order.findUnique({
//       where: { id: orderId },
//       include: {
//         encounter: { include: { patient: true } },
//         radiologyOrder: { include: { study: true } },
//       },
//     });

//     if (!order || !order.radiologyOrder) return;

//     const device = await this.prisma.medicalDevice.findFirst({
//       where: { hospitalId, isActive: true, type: 'RADIOLOGY' },
//     });

//     if (!device) {
//       this.logger.warn(
//         `⚠️ No active RADIOLOGY device found for hospital #${hospitalId}. Please add one in Integration Settings.`,
//       ); // ✅ لوج تحذير مهم
//       return;
//     }

//     const msgId = `MSG${Date.now()}`;
//     const msh = `MSH|^~\\&|SARAYA|RIS|${device.name}|MODALITY|${getHL7Date()}||ORM^O01|${msgId}|P|2.4`;
//     const p = order.encounter.patient;
//     const dob = p.dateOfBirth ? getHL7Date(p.dateOfBirth).slice(0, 8) : '';
//     const pid = `PID|1||${p.mrn}||${p.fullName}||${dob}|${p.gender === 'MALE' ? 'M' : 'F'}`;
//     const pv1 = `PV1|1|O`;

//     const study = order.radiologyOrder.study;
//     const obr = `OBR|1|${order.id}|${order.radiologyOrder.id}|${study.code}^${study.name}|||${getHL7Date()}|||||||||${study.modality}`;

//     const hl7Message = `${msh}${CR}${pid}${CR}${pv1}${CR}${obr}${CR}`;
//     const mllpMessage = wrapInMLLP(hl7Message);

//     const logId = await this.logOutbound(device.id, 'ORM^O01', hl7Message);

//     this.sendToSocket(device, mllpMessage, logId);
//   }

//   // Helpers
//   private async logOutbound(deviceId: number, type: string, msg: string) {
//     const log = await this.prisma.integrationLog.create({
//       data: {
//         deviceId,
//         direction: IntegrationDirection.OUTBOUND,
//         messageType: type,
//         rawMessage: msg,
//         status: 'PENDING',
//       },
//     });
//     return log.id;
//   }

//   private sendToSocket(device: any, message: string, logId: number) {
//     const client = new net.Socket();
//     client.setTimeout(5000);

//     client.on('timeout', async () => {
//       client.destroy();
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'TIMEOUT' },
//       });
//     });

//     client.on('error', async (err) => {
//       this.logger.error(`❌ Send Error: ${err.message}`);
//       await this.prisma.integrationLog.update({
//         where: { id: logId },
//         data: { status: 'ERROR', errorMessage: err.message },
//       });
//       client.destroy();
//     });

//     try {
//       client.connect(device.port, device.ipAddress, async () => {
//         this.logger.log(`📤 Sending to ${device.name}...`);
//         client.write(message);
//         await this.prisma.integrationLog.update({
//           where: { id: logId },
//           data: { status: 'SENT' },
//         });
//       });

//       client.on('data', () => {
//         this.logger.log('✅ ACK Received');
//         client.destroy();
//       });
//     } catch (e) {
//       this.logger.error('Connection logic error');
//     }
//   }
// }
