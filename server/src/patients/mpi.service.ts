import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

import { OutboundQueueService } from '../integration/outbound-queue.service';

@Injectable()
export class MpiService {
  private readonly logger = new Logger(MpiService.name);
  constructor(
    private prisma: PrismaService,
    private outboundQueueService: OutboundQueueService,
  ) {}

  /**
   * Search the Master Patient Index (GlobalPatient)
   * This is used for Cross-facility patient matching (MPI federation).
   * It enforces the 'mpi.shareDataConsent' setting.
   */
  async searchMpi(
    organizationId: number,
    query: { nationalId?: string; phone?: string; identityNumber?: string },
  ) {
    // 1. Check if federation sharing is enabled
    const enableFederation = await this.prisma.orgSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: 'mpi.enableFederation' },
      },
    });

    if (!enableFederation || enableFederation.value !== 'true') {
      throw new ForbiddenException(
        'Cross-facility data sharing is disabled by organizational policy.',
      );
    }

    // 2. Check if OTP is required
    const requireOtpSetting = await this.prisma.orgSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: 'mpi.requirePatientOTP' },
      },
    });
    const requireOtp = requireOtpSetting?.value === 'true';

    // 2. Perform MPI Search
    const whereClause: any = {};
    if (query.nationalId) {
      whereClause.nationalIdHash = crypto
        .createHash('sha256')
        .update(query.nationalId.trim().toLowerCase())
        .digest('hex');
    }
    if (query.phone) {
      whereClause.phoneHash = crypto
        .createHash('sha256')
        .update(query.phone.trim().toLowerCase())
        .digest('hex');
    }
    if (query.identityNumber) {
      whereClause.identityNumberHash = crypto
        .createHash('sha256')
        .update(query.identityNumber.trim().toLowerCase())
        .digest('hex');
    }

    if (Object.keys(whereClause).length === 0) {
      return []; // Return empty if no search criteria provided
    }

    const patients = await this.prisma.globalPatient.findMany({
      where: whereClause,
      include: {
        localPatients: {
          select: {
            id: true,
            hospitalId: true,
            mrn: true,
            hospital: {
              select: {
                name: true,
                displayName: true,
              },
            },
          },
        },
      },
      take: 10,
    });

    // Mask sensitive local patient details
    return patients.map((gp) => ({
      globalId: gp.id,
      fullName: gp.fullName,
      nationalId: gp.nationalId,
      dateOfBirth: gp.dateOfBirth,
      gender: gp.gender,
      facilities: gp.localPatients.map((lp) => {
        if (requireOtp) {
          return {
            hospitalId: lp.hospitalId,
            hospitalName: lp.hospital.displayName || lp.hospital.name,
            status: 'REQUIRES_OTP',
            patientId: lp.id, // For triggering the OTP
          };
        } else {
          return {
            hospitalId: lp.hospitalId,
            hospitalName: lp.hospital.displayName || lp.hospital.name,
            localMrn: lp.mrn,
            status: 'ACCESSIBLE',
            patientId: lp.id,
            fhirReference: `https://${process.env.SARAYA_DOMAIN || 'saraya-erp.com'}/api/fhir/Patient/${lp.id}`,
          };
        }
      }),
    }));
  }

  /**
   * Triggers an OTP to the patient for data sharing consent.
   */
  async triggerConsentOtp(
    patientId: number,
    doctorName: string,
    requestingHospital: string,
    requestingOrganizationId: number,
    requestingHospitalId: number | null,
    requestingUserId: number,
    purpose: string,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    // Generate 6-digit cryptographically secure OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins validity

    // Hash the OTP securely
    const hashedCode = await bcrypt.hash(otpCode, 10);

    // Prevent abuse: delete any unverified old OTPs for this patient or keep them but rate-limit
    const recentOtp = await this.prisma.patientOtp.findFirst({
      where: { patientId, createdAt: { gt: new Date(Date.now() - 60000) } }, // 1 minute rate limit
    });

    if (recentOtp) {
      throw new BadRequestException('Please wait before requesting a new OTP.');
    }

    await this.prisma.patientOtp.create({
      data: {
        patientId,
        code: hashedCode,
        expiresAt,
        channel: 'telegram',
        requestingOrganizationId,
        requestingHospitalId,
        requestingUserId,
        purpose,
      },
    });

    // Simulated Telegram Dispatch (Now marked as structured payload for provider integration)
    const notificationPayload = {
      channel: 'telegram',
      target: patient.phone,
      patientName: patient.fullName,
      otp: otpCode, // Only place raw OTP exists in memory
      message: `Dr. ${doctorName} at ${requestingHospital} is requesting access to your medical records. Provide this code to the doctor: ${otpCode}`,
      timestamp: new Date().toISOString(),
    };

    // Send the OTP via the Offline-First Outbound Queue
    // This ensures delivery even if the external SMS/Telegram gateway is temporarily unreachable
    await this.outboundQueueService.enqueue({
      type: 'sms',
      payload: {
        patientId,
        message: `Your Saraya Medical security code is ${otpCode}. It expires in 10 minutes.`,
      },
      createdAt: new Date().toISOString(),
      maxRetries: 3,
    });

    this.logger.log(
      `[DISPATCH-QUEUE] Added OTP message for patient ${patientId} to transmission queue.`,
    );

    return { message: 'OTP sent to patient via secure channel', expiresAt };
  }

  /**
   * Verifies the OTP provided by the doctor from the patient.
   * Returns a temporary consent token to access FHIR APIs.
   */
  async verifyConsentOtp(
    patientId: number,
    otpCode: string,
    requestingOrganizationId?: number,
  ) {
    const otpRecords = await this.prisma.patientOtp.findMany({
      where: {
        patientId,
        verified: false,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 }, // Max 5 attempts
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (!otpRecords.length) {
      throw new ForbiddenException('Invalid, expired, or locked OTP code.');
    }

    // Verify bcrypt hash
    let validRecord: (typeof otpRecords)[number] | null = null;
    for (const record of otpRecords) {
      if (
        requestingOrganizationId &&
        record.requestingOrganizationId &&
        record.requestingOrganizationId !== requestingOrganizationId
      ) {
        continue; // Prevent verifying OTP generated by another organization
      }

      const isMatch = await bcrypt.compare(otpCode, record.code);
      if (isMatch) {
        validRecord = record;
        break;
      } else {
        // Increment attempts to prevent brute force
        await this.prisma.patientOtp.update({
          where: { id: record.id },
          data: { attempts: { increment: 1 } },
        });
      }
    }

    if (!validRecord) {
      throw new ForbiddenException('Invalid OTP code.');
    }

    // Mark as used
    await this.prisma.patientOtp.update({
      where: { id: validRecord.id },
      data: { verified: true },
    });

    // Generate a signed JWT for FHIR access
    const jwtSecret =
      process.env.JWT_SECRET || 'saraya_fallback_secret_must_change';
    const consentToken = jwt.sign(
      {
        sub: patientId,
        type: 'mpi_consent',
        scope: 'patient/*.read',
        patient: String(patientId),
        client_id: validRecord.requestingOrganizationId
          ? `org_${validRecord.requestingOrganizationId}`
          : 'mpi_federation',
        purpose: validRecord.purpose,
      },
      jwtSecret,
      { expiresIn: '1h' }, // 1 hour access window
    );

    return {
      message: 'OTP Verified Successfully',
      status: 'ACCESSIBLE',
      patientId,
      fhirReference: `https://${process.env.SARAYA_DOMAIN || 'saraya-erp.com'}/api/fhir/Patient/${patientId}`,
      consentToken,
    };
  }

  // ==========================================
  // CONSENT REVOCATION
  // ==========================================

  /**
   * Revokes data sharing consent for a patient.
   * - Invalidates all active consent OTPs
   * - Creates an audit trail entry
   * - Optionally revokes consent for a specific organization
   */
  async revokeConsent(params: {
    patientId: number;
    revokedByUserId: number;
    revokedByRole: string;
    organizationId?: number; // If null, revokes ALL cross-facility access
    reason: string;
  }) {
    const { patientId, revokedByUserId, organizationId, reason } = params;

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    return this.prisma.$transaction(async (tx) => {
      // 1. Invalidate all active (unverified) OTPs for this patient
      const invalidatedOtps = await tx.patientOtp.updateMany({
        where: {
          patientId,
          verified: false,
          expiresAt: { gt: new Date() },
          ...(organizationId
            ? { requestingOrganizationId: organizationId }
            : {}),
        },
        data: {
          expiresAt: new Date(), // Expire immediately
        },
      });

      // 2. Mark all verified OTPs as revoked (for audit)
      const revokedConsents = await tx.patientOtp.updateMany({
        where: {
          patientId,
          verified: true,
          ...(organizationId
            ? { requestingOrganizationId: organizationId }
            : {}),
        },
        data: {
          verified: false, // Invalidate the consent
        },
      });

      // 3. Create audit log entry
      await tx.auditLog.create({
        data: {
          hospitalId: patient.hospitalId,
          userId: revokedByUserId,
          action: 'MPI_CONSENT_REVOKED',
          entity: 'Patient',
          entityId: patientId,
          details: {
            reason,
            revokedBy: params.revokedByRole,
            organizationId: organizationId || 'ALL',
            invalidatedOtps: invalidatedOtps.count,
            revokedConsents: revokedConsents.count,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.warn(
        `🔒 Consent REVOKED for patient ${patientId}. ` +
          `Invalidated ${invalidatedOtps.count} OTPs, ` +
          `Revoked ${revokedConsents.count} consents. ` +
          `Reason: ${reason}`,
      );

      return {
        message: 'Consent revoked successfully',
        patientId,
        invalidatedOtps: invalidatedOtps.count,
        revokedConsents: revokedConsents.count,
        scope: organizationId
          ? `Organization #${organizationId}`
          : 'All organizations',
        timestamp: new Date().toISOString(),
      };
    });
  }

  /**
   * Get consent/access audit trail for a patient.
   * Shows who requested access, when, what purpose, and whether it was verified/revoked.
   */
  async getConsentAuditTrail(patientId: number, hospitalId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    // All OTP records (consent requests) for this patient
    const consentRequests = await this.prisma.patientOtp.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Revocation audit logs
    const revocations = await this.prisma.auditLog.findMany({
      where: {
        entity: 'Patient',
        entityId: patientId,
        action: 'MPI_CONSENT_REVOKED',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      patientId,
      totalRequests: consentRequests.length,
      consentRequests: consentRequests.map((cr) => ({
        id: cr.id,
        requestedAt: cr.createdAt,
        expiresAt: cr.expiresAt,
        channel: cr.channel,
        verified: cr.verified,
        attempts: cr.attempts,
        requestingOrganizationId: cr.requestingOrganizationId,
        requestingHospitalId: cr.requestingHospitalId,
        requestingUserId: cr.requestingUserId,
        purpose: cr.purpose,
        status: cr.verified
          ? 'GRANTED'
          : cr.expiresAt < new Date()
            ? 'EXPIRED'
            : cr.attempts >= 5
              ? 'LOCKED'
              : 'PENDING',
      })),
      revocations: revocations.map((r) => ({
        revokedAt: r.createdAt,
        revokedByUserId: r.userId,
        details: r.details,
      })),
    };
  }
}
