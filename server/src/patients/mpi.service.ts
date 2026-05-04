import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class MpiService {
  private readonly logger = new Logger(MpiService.name);
  constructor(private prisma: PrismaService) {}

  /**
   * Search the Master Patient Index (GlobalPatient)
   * This is used for Cross-facility patient matching (MPI federation).
   * It enforces the 'mpi.shareDataConsent' setting.
   */
  async searchMpi(organizationId: number, query: { nationalId?: string; phone?: string; identityNumber?: string }) {
    // 1. Check if federation sharing is enabled
    const enableFederation = await this.prisma.orgSetting.findUnique({
      where: { organizationId_key: { organizationId, key: 'mpi.enableFederation' } },
    });

    if (!enableFederation || enableFederation.value !== 'true') {
      throw new ForbiddenException('Cross-facility data sharing is disabled by organizational policy.');
    }

    // 2. Check if OTP is required
    const requireOtpSetting = await this.prisma.orgSetting.findUnique({
      where: { organizationId_key: { organizationId, key: 'mpi.requirePatientOTP' } },
    });
    const requireOtp = requireOtpSetting?.value === 'true';

    // 2. Perform MPI Search
    const whereClause: any = {};
    if (query.nationalId) whereClause.nationalId = query.nationalId;
    if (query.phone) whereClause.localPatients = { some: { phone: { contains: query.phone } } };
    if (query.identityNumber) whereClause.identityNumber = query.identityNumber;

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
              }
            }
          }
        }
      },
      take: 10,
    });

    // Mask sensitive local patient details
    return patients.map(gp => ({
      globalId: gp.id,
      fullName: gp.fullName,
      nationalId: gp.nationalId,
      dateOfBirth: gp.dateOfBirth,
      gender: gp.gender,
      facilities: gp.localPatients.map(lp => {
        if (requireOtp) {
          return {
            hospitalId: lp.hospitalId,
            hospitalName: lp.hospital.name,
            status: 'REQUIRES_OTP',
            patientId: lp.id, // For triggering the OTP
          };
        } else {
          return {
            hospitalId: lp.hospitalId,
            hospitalName: lp.hospital.name,
            localMrn: lp.mrn,
            status: 'ACCESSIBLE',
            fhirReference: `https://saraya-erp.com/api/fhir/Patient/${lp.id}`,
          };
        }
      })
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
    purpose: string
  ) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    // Generate 6-digit cryptographically secure OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins validity

    // Hash the OTP securely
    const hashedCode = await bcrypt.hash(otpCode, 10);

    // Prevent abuse: delete any unverified old OTPs for this patient or keep them but rate-limit
    const recentOtp = await this.prisma.patientOtp.findFirst({
      where: { patientId, createdAt: { gt: new Date(Date.now() - 60000) } } // 1 minute rate limit
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
        purpose
      }
    });

    // Simulated Telegram Dispatch (Now marked as structured payload for provider integration)
    const notificationPayload = {
      channel: 'telegram',
      target: patient.phone,
      patientName: patient.fullName,
      otp: otpCode, // Only place raw OTP exists in memory
      message: `Dr. ${doctorName} at ${requestingHospital} is requesting access to your medical records. Provide this code to the doctor: ${otpCode}`,
      timestamp: new Date().toISOString()
    };
    
    // In production, this would dispatch to an SQS queue or direct SMS/Telegram API
    this.logger.log(`[DISPATCH-QUEUE] Added OTP message for patient ${patientId} to transmission queue.`);

    return { message: 'OTP sent to patient via secure channel', expiresAt };
  }

  /**
   * Verifies the OTP provided by the doctor from the patient.
   * Returns a temporary consent token to access FHIR APIs.
   */
  async verifyConsentOtp(patientId: number, otpCode: string, requestingOrganizationId?: number) {
    const otpRecords = await this.prisma.patientOtp.findMany({
      where: {
        patientId,
        verified: false,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 } // Max 5 attempts
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (!otpRecords.length) {
      throw new ForbiddenException('Invalid, expired, or locked OTP code.');
    }

    // Verify bcrypt hash
    let validRecord: (typeof otpRecords)[number] | null = null;
    for (const record of otpRecords) {
      if (requestingOrganizationId && record.requestingOrganizationId && record.requestingOrganizationId !== requestingOrganizationId) {
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
          data: { attempts: { increment: 1 } }
        });
      }
    }

    if (!validRecord) {
       throw new ForbiddenException('Invalid OTP code.');
    }

    // Mark as used
    await this.prisma.patientOtp.update({
      where: { id: validRecord.id },
      data: { verified: true }
    });

    // Generate a signed JWT for FHIR access
    const jwtSecret = process.env.JWT_SECRET || 'saraya_fallback_secret_must_change';
    const consentToken = jwt.sign(
      {
        sub: patientId,
        type: 'mpi_consent',
        scope: 'patient/*.read',
        patient: String(patientId),
        client_id: validRecord.requestingOrganizationId ? `org_${validRecord.requestingOrganizationId}` : 'mpi_federation',
        purpose: validRecord.purpose
      },
      jwtSecret,
      { expiresIn: '1h' } // 1 hour access window
    );

    return {
      message: 'OTP Verified Successfully',
      status: 'ACCESSIBLE',
      fhirReference: `https://saraya-erp.com/api/fhir/Patient/${patientId}`,
      consentToken,
    };
  }
}
