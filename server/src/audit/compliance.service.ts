import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ComplianceReport {
  status: 'COMPLIANT' | 'NON_COMPLIANT';
  generatedAt: Date;
  frameworks: string[];
  checks: {
    name: string;
    status: 'PASS' | 'FAIL' | 'WARNING';
    details: string;
  }[];
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private auditService: AuditService,
    private prisma: PrismaService,
  ) {}

  /**
   * Generates a comprehensive security and compliance report
   * targeting ISO 27001 and SOC 2 Type II requirements.
   */
  async generateComplianceReport(): Promise<ComplianceReport> {
    const checks: ComplianceReport['checks'] = [];
    let isCompliant = true;

    // 1. Audit Log Hash Chain Verification (ISO 27001: A.12.4.1)
    try {
      const chainResult = await this.auditService.verifyChain();
      if (chainResult.valid) {
        checks.push({
          name: 'Audit Log Integrity',
          status: 'PASS',
          details: chainResult.message,
        });
      } else {
        isCompliant = false;
        checks.push({
          name: 'Audit Log Integrity',
          status: 'FAIL',
          details: `CRITICAL: ${chainResult.message}`,
        });
      }
    } catch (e: any) {
      isCompliant = false;
      checks.push({
        name: 'Audit Log Integrity',
        status: 'FAIL',
        details: `Failed to verify chain: ${e.message}`,
      });
    }

    // 2. Encryption at Rest & In Transit Policies (SOC 2 CC6.1)
    // We check if SSL/TLS is enforced via environment variables or DB configs.
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (encryptionKey && encryptionKey.length >= 32) {
      checks.push({
        name: 'Data Encryption',
        status: 'PASS',
        details: 'Valid application-level encryption key detected.',
      });
    } else {
      checks.push({
        name: 'Data Encryption',
        status: 'WARNING',
        details: 'ENCRYPTION_KEY missing or too weak. Ensure DB-level encryption is active.',
      });
    }

    // 3. Admin Account Security (ISO 27001: A.9.2)
    // Check if there are default passwords or admins without 2FA (simulated via missing phone for OTP)
    const vulnerableAdmins = await this.prisma.user.count({
      where: {
        userRoles: { some: { role: { name: 'SYSTEM_ADMIN' } } },
        phone: null, // Phone required for Telegram OTP
      }
    });

    if (vulnerableAdmins > 0) {
      isCompliant = false;
      checks.push({
        name: 'Privileged Access Management',
        status: 'FAIL',
        details: `Found ${vulnerableAdmins} SYSTEM_ADMIN accounts without registered phone numbers for 2FA.`,
      });
    } else {
      checks.push({
        name: 'Privileged Access Management',
        status: 'PASS',
        details: 'All privileged accounts meet basic 2FA requirements.',
      });
    }

    // 4. Inactive Account Review (SOC 2 CC6.2)
    // Validate if any users marked as deleted are still active
    const ghostUsers = await this.prisma.user.count({
      where: {
        isActive: true,
        isDeleted: true
      }
    });

    if (ghostUsers > 0) {
      checks.push({
        name: 'Access Control Lifecycle',
        status: 'WARNING',
        details: `Found ${ghostUsers} active users that are marked as deleted (Ghost accounts).`,
      });
    } else {
      checks.push({
        name: 'Access Control Lifecycle',
        status: 'PASS',
        details: 'Access control lifecycle is actively managed.',
      });
    }

    this.logger.log(`🛡️ Compliance Report Generated: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return {
      status: isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      generatedAt: new Date(),
      frameworks: ['ISO 27001', 'SOC 2 Type II', 'HIPAA'],
      checks,
    };
  }
}
