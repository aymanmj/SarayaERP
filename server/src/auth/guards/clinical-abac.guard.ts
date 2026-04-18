import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLINICAL_RELATION_KEY, ClinicalRelationOptions } from '../decorators/abac.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class ClinicalABACGuard implements CanActivate {
  private readonly logger = new Logger(ClinicalABACGuard.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const abacConfig = this.reflector.getAllAndOverride<ClinicalRelationOptions>(
      CLINICAL_RELATION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // If no ABAC constraints on this route, bypass.
    if (!abacConfig) {
      return true;
    }

    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    // Admins bypass ABAC constraints entirely
    if (user?.roles?.includes('ADMIN') || user?.permissions?.includes('ADMIN_FULL_ACCESS')) {
      return true;
    }

    if (!user || !user.sub) {
       throw new ForbiddenException('User is not authenticated');
    }

    const doctorId = Number(user.sub);
    const paramValue = request.params[abacConfig.paramName] || request.query[abacConfig.paramName] || request.body[abacConfig.paramName];
    const patientId = Number(paramValue);

    if (isNaN(patientId)) {
        this.logger.warn(`ABAC Guard: Invalid patientId provided in request`);
        return true; // We can't evaluate ABAC if the target patient is not specified
    }

    const isBreakGlass = request.headers['x-break-glass'] === 'true';
    const breakGlassReason = request.headers['x-break-glass-reason'] || 'Emergency Override';

    // 1. Evaluate "Clinical Relation"
    // Does this doctor have an active Encounter or Appointment with this patient?
    // In a real large-scale system, this would be a complex query checking Admitting Doctor, Attending Doctor, Consults, etc.
    const relationResult = await this.evaluateRelation(doctorId, patientId);

    if (relationResult) {
      return true;
    }

    // 2. No relation found! Check Break Glass
    if (abacConfig.allowBreakGlass && isBreakGlass) {
      this.logger.warn(`🚨 BREAK-GLASS used by Doctor (ID: ${doctorId}) for Patient (ID: ${patientId}). Reason: ${breakGlassReason}`);
      
      // Log the high severity break-glass event
      await this.auditService.log({
        action: 'SECURITY_BREAK_GLASS',
        entity: 'PATIENT',
        entityId: patientId,
        userId: doctorId,
        hospitalId: user.hospitalId,
        ipAddress: request.ip,
        details: { reason: breakGlassReason, endpoint: request.url },
      });

      return true;
    }

    // 3. Deny Access
    this.logger.error(`❌ ABAC Violation: User(ID: ${doctorId}) tried to access Patient(ID: ${patientId}) without relation.`);
    await this.auditService.log({
      action: 'SECURITY_ABAC_VIOLATION',
      entity: 'PATIENT',
      entityId: patientId,
      userId: doctorId,
      hospitalId: user.hospitalId,
      ipAddress: request.ip,
      details: { reason: 'No active clinical relationship found', endpoint: request.url },
    });

    throw new ForbiddenException('ليس لديك علاقة سريرية نشطة مع هذا المريض. لا يمكنك عرض السجل الطبي.');
  }

  private async evaluateRelation(doctorId: number, patientId: number): Promise<boolean> {
     // Check if doctor is assigned to an active encounter for this patient
     const encounter = await this.prisma.encounter.findFirst({
        where: {
           patientId,
           doctorId,
           status: { not: 'CANCELLED' } 
        }
     });

     if (encounter) return true;

     // Check if doctor has an appointment scheduled with this patient today/future
     const appointment = await this.prisma.appointment.findFirst({
        where: {
            patientId,
            doctorId,
            scheduledStart: { gte: new Date(new Date().setHours(0,0,0,0)) }, // Today or future
            status: { not: 'CANCELLED' }
        }
     });

     if (appointment) return true;

     return false;
  }
}
