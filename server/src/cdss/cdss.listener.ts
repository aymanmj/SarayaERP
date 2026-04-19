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
      const input: CheckLabResultDto & { hospitalId: number } = {
        hospitalId: payload.hospitalId,
        patientId: payload.patientId,
        testCode: payload.testCode,
        value: payload.value,
        unit: payload.unit,
      };

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
        hospitalId: payload.hospitalId,
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
