import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CDSSService } from './cdss.service';
import { LabResultVerifiedEvent } from '../labs/events/lab-result-verified.event';
import { VitalsRecordedEvent } from '../vitals/events/vitals-recorded.event';
import { CheckLabResultDto, CheckVitalsDto } from './cdss.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CDSSListener {
  private readonly logger = new Logger(CDSSListener.name);

  constructor(
    private readonly cdssService: CDSSService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('patient.problem_added', { async: true })
  async handlePatientProblemAdded(payload: any) {
    this.logger.log(`🔔 CDSS triggered for Patient Problem: ${payload.description} (ICD-10: ${payload.icd10Code})`);

    try {
      if (!payload.icd10Code && !payload.description) return;

      // Find any published Clinical Pathway matching the diagnosis
      const matchingPathways = await this.prisma.clinicalPathway.findMany({
        where: {
          hospitalId: payload.hospitalId,
          isActive: true,
          status: 'PUBLISHED',
          targetDiagnosis: {
            contains: payload.icd10Code || payload.description,
            mode: 'insensitive'
          }
        },
        select: { id: true, name: true }
      });

      if (matchingPathways.length > 0) {
        for (const pathway of matchingPathways) {
          // Generate a CDSS Alert suggesting to enroll the patient in the pathway
          await this.prisma.cDSSAlert.create({
            data: {
              hospitalId: payload.hospitalId,
              patientId: payload.patientId,
              alertType: 'PROTOCOL_RECOMMENDATION',
              severity: 'INFO',
              message: `اقتراح مسار رعاية سريرية: ${pathway.name} (بناءً على التشخيص المضاف)`,
              context: {
                pathwayId: pathway.id,
                triggerDescription: payload.description
              }
            }
          });
          this.logger.log(`✅ Pathway Suggestion Generated: ${pathway.name} for patient ${payload.patientId}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing problem added event for pathway suggestion: ${error.message}`);
    }
  }

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
