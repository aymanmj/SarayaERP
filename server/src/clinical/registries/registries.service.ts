import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RegistriesService {
  private readonly logger = new Logger(RegistriesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Evaluates all patients against Registry Criteria and automatically enrolls them.
   * Runs daily at 1 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async evaluateRegistryMemberships() {
    this.logger.log('Starting daily Registry Membership evaluation...');
    const registries = await this.prisma.patientRegistry.findMany({
      include: { criteria: true },
    });

    for (const registry of registries) {
      // Find patients matching the criteria
      // Note: In a real advanced system, this would be a dynamic query builder.
      // For this implementation, we evaluate simple rules.
      const enrolledPatients = await this.evaluateCriteria(registry.criteria);

      for (const patientId of enrolledPatients) {
        await this.prisma.patientRegistryMembership.upsert({
          where: {
            registryId_patientId: { registryId: registry.id, patientId },
          },
          update: { status: 'ACTIVE' },
          create: {
            registryId: registry.id,
            patientId,
            status: 'ACTIVE',
          },
        });
      }
    }
    this.logger.log('Registry Membership evaluation completed.');
  }

  /**
   * Evaluates Care Gap Rules for all active members in all registries.
   * Runs daily at 2 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async evaluateCareGaps() {
    this.logger.log('Starting daily Care Gaps evaluation...');
    const activeRules = await this.prisma.careGapRule.findMany({
      where: { isActive: true },
      include: { registry: true },
    });

    for (const rule of activeRules) {
      const memberships = await this.prisma.patientRegistryMembership.findMany({
        where: { registryId: rule.registryId, status: 'ACTIVE' },
      });

      for (const member of memberships) {
        const hasGap = await this.checkPatientGap(member.patientId, rule);

        if (hasGap) {
          // Check if an OPEN gap already exists for this rule and patient
          const existingGap = await this.prisma.careGap.findFirst({
            where: {
              ruleId: rule.id,
              patientId: member.patientId,
              status: 'OPEN',
            },
          });

          if (!existingGap) {
            await this.prisma.careGap.create({
              data: {
                ruleId: rule.id,
                patientId: member.patientId,
                status: 'OPEN',
                dueDate: new Date(), // Immediate due date
              },
            });
            this.logger.log(`Created Care Gap for Patient ${member.patientId} - Rule: ${rule.name}`);
          }
        } else {
          // If the patient fulfilled the requirement, close any OPEN gaps
          await this.prisma.careGap.updateMany({
            where: {
              ruleId: rule.id,
              patientId: member.patientId,
              status: 'OPEN',
            },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              closureReason: 'System auto-closure: Requirement met',
            },
          });
        }
      }
    }
    this.logger.log('Care Gaps evaluation completed.');
  }

  // --- Helper Methods ---

  private async evaluateCriteria(criteriaList: any[]): Promise<number[]> {
    if (!criteriaList || criteriaList.length === 0) return [];
    
    let matchingPatientIds = new Set<number>();
    
    // Simplistic evaluation: Get all patients that have the diagnosis if criteria is DIAGNOSIS
    for (const criteria of criteriaList) {
      if (criteria.type === 'DIAGNOSIS') {
        const encounterDiagnoses = await this.prisma.encounterDiagnosis.findMany({
          where: { diagnosisCode: { code: criteria.value } },
          select: { encounter: { select: { patientId: true } } },
        });
        encounterDiagnoses.forEach(ed => matchingPatientIds.add(ed.encounter.patientId));
      }
    }

    return Array.from(matchingPatientIds);
  }

  private async checkPatientGap(patientId: number, rule: any): Promise<boolean> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rule.frequencyDays);

    if (rule.targetType === 'LAB_TEST') {
      const recentTest = await this.prisma.labOrder.findFirst({
        where: {
          order: {
            encounter: { patientId },
            createdAt: { gte: cutoffDate },
          },
          test: { code: rule.targetValue },
          resultStatus: 'COMPLETED',
        },
      });
      return !recentTest; // If no recent test, there IS a gap
    }

    // Default to true (gap exists) if rule type is unknown
    return true;
  }

  // --- Public APIs ---

  async getPatientGaps(patientId: number) {
    return this.prisma.careGap.findMany({
      where: { patientId, status: 'OPEN' },
      include: { rule: true },
    });
  }

  async closeGap(gapId: number, reason: string) {
    return this.prisma.careGap.update({
      where: { id: gapId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closureReason: reason,
      },
    });
  }

  async getRegistryAnalytics(registryId: number) {
    const totalMembers = await this.prisma.patientRegistryMembership.count({
      where: { registryId, status: 'ACTIVE' },
    });

    const openGaps = await this.prisma.careGap.count({
      where: {
        rule: { registryId },
        status: 'OPEN',
      },
    });

    return { totalMembers, openGaps };
  }
}
