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
