import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService, ComplianceReport } from './compliance.service';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ComplianceService', () => {
  let service: ComplianceService;

  const mockAuditService = {
    verifyChain: jest.fn(),
  };

  const mockPrisma = {
    user: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: AuditService, useValue: mockAuditService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // Report Structure
  // ============================================
  describe('Report Structure', () => {
    it('should return READY status when all controls pass', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'Chain intact' });
      mockPrisma.user.count.mockResolvedValue(0); // No vulnerable admins, no ghost users
      process.env.ENCRYPTION_KEY = 'a'.repeat(32); // Valid 32-char key

      const report = await service.generateComplianceReport();

      expect(report.status).toBe('READY');
      expect(report.frameworks).toContain('ISO 27001');
      expect(report.frameworks).toContain('SOC 2 Type II');
      expect(report.frameworks).toContain('HIPAA');
      expect(report.generatedAt).toBeInstanceOf(Date);

      delete process.env.ENCRYPTION_KEY;
    });

    it('should return NEEDS_WORK status when audit chain is invalid', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: false, message: 'Tampered entry found' });
      mockPrisma.user.count.mockResolvedValue(0);

      const report = await service.generateComplianceReport();

      expect(report.status).toBe('NEEDS_WORK');
    });

    it('should return NEEDS_WORK status when vulnerable admins exist', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'OK' });
      mockPrisma.user.count
        .mockResolvedValueOnce(3)  // 3 vulnerable admins
        .mockResolvedValueOnce(0); // 0 ghost users

      const report = await service.generateComplianceReport();

      expect(report.status).toBe('NEEDS_WORK');
    });
  });

  // ============================================
  // Control Mappings
  // ============================================
  describe('Control Mappings', () => {
    it('should include ISO-27001-A.12.4.1 control for audit log integrity', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'OK' });
      mockPrisma.user.count.mockResolvedValue(0);

      const report = await service.generateComplianceReport();
      const auditControl = report.controls.find(c => c.controlId === 'ISO-27001-A.12.4.1');

      expect(auditControl).toBeDefined();
      expect(auditControl!.name).toBe('Audit Log Integrity');
      expect(auditControl!.owner).toBe('CISO / SecOps');
    });

    it('should include SOC2-CC6.1 control for data encryption', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'OK' });
      mockPrisma.user.count.mockResolvedValue(0);

      const report = await service.generateComplianceReport();
      const encControl = report.controls.find(c => c.controlId === 'SOC2-CC6.1');

      expect(encControl).toBeDefined();
      expect(encControl!.name).toBe('Data Encryption');
      expect(encControl!.owner).toBe('Infrastructure Team');
    });

    it('should include ISO-27001-A.9.2 control for privileged access', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'OK' });
      mockPrisma.user.count
        .mockResolvedValueOnce(2)  // 2 vulnerable admins
        .mockResolvedValueOnce(0);

      const report = await service.generateComplianceReport();
      const pamControl = report.controls.find(c => c.controlId === 'ISO-27001-A.9.2');

      expect(pamControl).toBeDefined();
      expect(pamControl!.status).toBe('FAIL');
      expect(pamControl!.details).toContain('2 SYSTEM_ADMIN');
      expect(pamControl!.dueDate).toBeDefined();
    });

    it('should include SOC2-CC6.2 control for access control lifecycle', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'OK' });
      mockPrisma.user.count
        .mockResolvedValueOnce(0)  // No vulnerable admins
        .mockResolvedValueOnce(5); // 5 ghost users

      const report = await service.generateComplianceReport();
      const aclControl = report.controls.find(c => c.controlId === 'SOC2-CC6.2');

      expect(aclControl).toBeDefined();
      expect(aclControl!.status).toBe('WARNING');
      expect(aclControl!.details).toContain('5 active users');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle audit chain verification failure gracefully', async () => {
      mockAuditService.verifyChain.mockRejectedValue(new Error('Database connection lost'));
      mockPrisma.user.count.mockResolvedValue(0);

      const report = await service.generateComplianceReport();

      expect(report.status).toBe('NEEDS_WORK');
      const auditControl = report.controls.find(c => c.controlId === 'ISO-27001-A.12.4.1');
      expect(auditControl!.status).toBe('FAIL');
      expect(auditControl!.details).toContain('Database connection lost');
    });

    it('should warn about weak encryption key', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'OK' });
      mockPrisma.user.count.mockResolvedValue(0);
      process.env.ENCRYPTION_KEY = 'short'; // Too short

      const report = await service.generateComplianceReport();
      const encControl = report.controls.find(c => c.controlId === 'SOC2-CC6.1');

      expect(encControl!.status).toBe('WARNING');
      expect(encControl!.dueDate).toBeDefined();

      delete process.env.ENCRYPTION_KEY;
    });

    it('should always include exactly 4 controls', async () => {
      mockAuditService.verifyChain.mockResolvedValue({ valid: true, message: 'OK' });
      mockPrisma.user.count.mockResolvedValue(0);

      const report = await service.generateComplianceReport();

      expect(report.controls).toHaveLength(4);
    });
  });
});
