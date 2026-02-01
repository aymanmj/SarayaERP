import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Processor('hl7-queue')
export class Hl7Consumer extends WorkerHost {
  private readonly logger = new Logger(Hl7Consumer.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  // هذه الدالة ستعمل تلقائياً لكل رسالة في الطابور
  async process(job: Job<{ logId: number; rawMessage: string }>): Promise<any> {
    const { logId, rawMessage } = job.data;
    this.logger.log(`⚙️ Processing HL7 Message for Log ID: ${logId}`);

    try {
      // 1. تحديث الحالة إلى "جاري المعالجة"
      await this.prisma.integrationLog.update({
        where: { id: logId },
        data: { status: 'PROCESSING' },
      });

      // 2. تحليل الرسالة (نقلنا منطق handleORU إلى هنا)
      const segments = rawMessage.split(/[\r\n]+/);
      const msh = segments[0].split('|');
      const msgType = msh[8]; // e.g. ORU^R01

      if (msgType && msgType.includes('ORU')) {
        await this.handleORU(segments);
      }

      // 3. التحديث عند النجاح
      await this.prisma.integrationLog.update({
        where: { id: logId },
        data: { status: 'SUCCESS', errorMessage: null },
      });

      this.logger.log(`✅ Successfully processed Log ID: ${logId}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to process Log ID: ${logId}`, error.stack);

      // 4. التحديث عند الفشل
      await this.prisma.integrationLog.update({
        where: { id: logId },
        data: { status: 'ERROR', errorMessage: error.message },
      });

      // رمي الخطأ ليقوم BullMQ بإعادة المحاولة (Retry) إذا تم إعداده
      throw error;
    }
  }

  // --- منطق معالجة النتائج (منقول من الخدمة القديمة) ---
  private async handleORU(segments: string[]) {
    let orderId: number | null = null;
    let pacsLink: string | null = null;
    const labResults: {
      code: string;
      value: string;
      unit: string;
      range: string;
      flag: string;
    }[] = [];
    const radiologyReportLines: string[] = [];

    // Parsing Logic
    for (const seg of segments) {
      const fields = seg.split('|');
      const segmentType = fields[0];

      if (segmentType === 'OBR') {
        // غالباً Order ID يكون في الحقل 2 (Placer) أو 3 (Filler) حسب الجهاز
        // سنفترض أنه في 2 كما في الكود السابق
        const placerOrder = fields[2];
        if (placerOrder) orderId = parseInt(placerOrder);
      }

      if (segmentType === 'OBX') {
        const valueType = fields[2];
        const observationId = fields[3]; // Code^Name
        const observationVal = fields[5];
        const units = fields[6];
        const references = fields[7];
        const flag = fields[8]; // Abnormal Flag

        const testCode = observationId ? observationId.split('^')[0] : '';

        if (
          valueType === 'RP' ||
          (observationVal && observationVal.startsWith('http'))
        ) {
          pacsLink = observationVal;
        } else {
          labResults.push({
            code: testCode,
            value: observationVal,
            unit: units,
            range: references,
            flag: flag,
          });
          if (observationVal) radiologyReportLines.push(observationVal);
        }
      }
    }

    if (!orderId) throw new Error('No valid Order ID found in HL7 message.');

    // Database Update
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        labOrders: { include: { test: { include: { parameters: true } } } },
        radiologyOrder: true,
      },
    });

    if (!order) throw new Error(`Order #${orderId} not found in database.`);

    // --- معالجة المختبر ---
    if (order.type === 'LAB') {
      for (const res of labResults) {
        for (const labOrder of order.labOrders) {
          // 1. Check Parameters (Sub-tests like in CBC)
          const param = labOrder.test.parameters.find(
            (p) => p.code === res.code,
          );
          if (param) {
            await this.prisma.labOrderResult.create({
              data: {
                labOrderId: labOrder.id,
                parameterId: param.id,
                parameterName: param.name,
                value: res.value,
                unit: res.unit || param.unit,
                range: res.range || param.refRange,
                flag: res.flag,
              },
            });
            // نعتبر الطلب مكتملاً مبدئياً
            await this.prisma.labOrder.update({
              where: { id: labOrder.id },
              data: { resultStatus: 'COMPLETED', resultDate: new Date() },
            });
            continue;
          }

          // 2. Check Main Test Code
          if (labOrder.test.code === res.code) {
            await this.prisma.labOrder.update({
              where: { id: labOrder.id },
              data: {
                resultValue: res.value,
                resultUnit: res.unit,
                referenceRange: res.range,
                resultStatus: 'COMPLETED',
                resultDate: new Date(),
              },
            });
          }
        }
      }
      // إكمال الطلب الرئيسي
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
    // --- معالجة الأشعة ---
    else if (order.type === 'RADIOLOGY' && order.radiologyOrder) {
      const reportText = radiologyReportLines.join('\n');
      await this.prisma.radiologyOrder.update({
        where: { id: order.radiologyOrder.id },
        data: {
          status: 'COMPLETED',
          reportedAt: new Date(),
          reportText: reportText || 'Attached Image',
          pacsUrl: pacsLink,
        },
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
  }
}
