import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CDSSService } from './cdss.service';
import { LabResultVerifiedEvent } from '../labs/events/lab-result-verified.event';
import { VitalsRecordedEvent } from '../vitals/events/vitals-recorded.event';
import { CheckLabResultDto, CheckVitalsDto } from './cdss.dto';

@Injectable()
export class CDSSListener {
  private readonly logger = new Logger(CDSSListener.name);

  constructor(private readonly cdssService: CDSSService) {}

  @OnEvent('lab.result_verified', { async: true })
  async handleLabResultVerified(payload: LabResultVerifiedEvent) {
    this.logger.log(
      `🔔 CDSS triggered for Lab Result: ${payload.testCode} = ${payload.value}`,
    );

    try {
      // إعداد البيانات للفحص
      const input: CheckLabResultDto & { hospitalId: number } = {
        hospitalId: 1, // سنفترض 1 مؤقتاً أو يمكن تمريره في الحدث
        patientId: payload.patientId,
        testCode: payload.testCode,
        value: payload.value,
        unit: payload.unit,
      };

      // يمكننا تمرير hospitalId في الحدث أفضل. لنفترض أننا سنحدث الحدث لاحقاً،
      // لكن الآن سنحاول جلب hospitalId من سياق الخدمة إذا أمكن، أو نعتمد على أن الحدث قد يحمله.
      // ملاحظة: LabResultVerifiedEvent لا يحمل hospitalId حالياً.
      // الحل العملي: تجاهل hospitalId في CDSS service إذا كان غير مستخدم بكثرة للبحث عن الإعدادات،
      // أو استخدام قيمة افتراضية.
      // سنعدل DTO ليقبل hospitalId كـ optional أو نمرره كرقم 0 إذا لم يكن حرجا.
      // لكن لحظة، معرفة المستشفى مهمة لقيم المراجع إذا كانت مخصصة.
      // سأقوم بتمرير hospitalId في payload الحدث أيضاً.

      await this.cdssService.checkLabResultAndAlert(input);
    } catch (error) {
      this.logger.error(`Error processing lab result event: ${error.message}`);
    }
  }

  @OnEvent('vitals.recorded', { async: true })
  async handleVitalsRecorded(payload: VitalsRecordedEvent) {
    this.logger.log(
      `🔔 CDSS triggered for Vitals: Patient ${payload.patientId}`,
    );

    try {
      const input: CheckVitalsDto & { hospitalId: number } = {
        hospitalId: 1, // TODO: Add hospitalId to event
        encounterId: payload.encounterId,
        patientId: payload.patientId,
        ...payload.vitals,
      };

      await this.cdssService.checkVitalsAndAlert(input);
    } catch (error) {
      this.logger.error(`Error processing vitals event: ${error.message}`);
    }
  }
}
