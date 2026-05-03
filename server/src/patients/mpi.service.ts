import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MpiService {
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
  async triggerConsentOtp(patientId: number, doctorName: string, requestingHospital: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins validity

    await this.prisma.patientOtp.create({
      data: {
        patientId,
        code: otpCode,
        expiresAt,
        channel: 'telegram',
      }
    });

    // Simulated Telegram Dispatch
    console.log(`[TELEGRAM MOCK] Message sent to Patient ${patient.fullName} (Phone: ${patient.phone}):\nDr. ${doctorName} at ${requestingHospital} is requesting access to your medical records. Provide this code to the doctor: ${otpCode}`);

    return { message: 'OTP sent to patient via Telegram', expiresAt };
  }

  /**
   * Verifies the OTP provided by the doctor from the patient.
   * Returns a temporary consent token to access FHIR APIs.
   */
  async verifyConsentOtp(patientId: number, otpCode: string) {
    const otpRecord = await this.prisma.patientOtp.findFirst({
      where: {
        patientId,
        code: otpCode,
        verified: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!otpRecord) {
      throw new ForbiddenException('Invalid or expired OTP code.');
    }

    // Mark as used
    await this.prisma.patientOtp.update({
      where: { id: otpRecord.id },
      data: { verified: true }
    });

    // In a real production scenario, generate a signed JWT.
    // For now, we return a mock consent token.
    const consentToken = `consent_tok_${patientId}_${Date.now()}`;

    return {
      message: 'OTP Verified Successfully',
      status: 'ACCESSIBLE',
      fhirReference: `https://saraya-erp.com/api/fhir/Patient/${patientId}`,
      consentToken,
    };
  }
}
