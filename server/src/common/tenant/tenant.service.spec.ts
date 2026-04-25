import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { OrgType } from '@prisma/client';

describe('TenantService', () => {
  let service: TenantService;

  const mockOrganization = {
    id: 1,
    code: 'SARAYA-NET',
    name: 'شبكة السرايا الطبية',
    type: OrgType.NETWORK,
    parentId: null,
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
    country: 'SA',
    locale: 'ar',
    taxConfig: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockHospital1 = { id: 10, name: 'مستشفى السرايا - الرياض', code: 'SRY-RYD', organizationId: 1 };
  const mockHospital2 = { id: 20, name: 'مستشفى السرايا - جدة', code: 'SRY-JED', organizationId: 1 };

  const mockChildOrg = {
    id: 2,
    code: 'SRY-EAST',
    name: 'فرع المنطقة الشرقية',
    type: OrgType.HOSPITAL,
    parentId: 1,
    hospitals: [{ id: 30, name: 'عيادة الخبر', code: 'SRY-KHB' }],
    children: [],
  };

  const mockPrisma = {
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    hospital: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    orgSetting: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createOrganization
  // ============================================
  describe('createOrganization', () => {
    it('should create a root organization (NETWORK)', async () => {
      mockPrisma.organization.create.mockResolvedValue(mockOrganization);

      const result = await service.createOrganization({
        code: 'SARAYA-NET',
        name: 'شبكة السرايا الطبية',
        type: OrgType.NETWORK,
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        country: 'SA',
      });

      expect(result).toEqual(mockOrganization);
      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'SARAYA-NET',
          type: OrgType.NETWORK,
          currency: 'SAR',
        }),
      });
    });

    it('should create a child organization when valid parentId is provided', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockPrisma.organization.create.mockResolvedValue({ ...mockOrganization, id: 2, parentId: 1 });

      const result = await service.createOrganization({
        code: 'SRY-EAST',
        name: 'فرع المنطقة الشرقية',
        parentId: 1,
      });

      expect(result.parentId).toBe(1);
    });

    it('should throw NotFoundException when parentId does not exist', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrganization({
          code: 'ORPHAN',
          name: 'مؤسسة يتيمة',
          parentId: 999,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use default values (LYD, Africa/Tripoli) when not specified', async () => {
      mockPrisma.organization.create.mockResolvedValue({
        ...mockOrganization,
        currency: 'LYD',
        timezone: 'Africa/Tripoli',
        country: 'LY',
      });

      await service.createOrganization({ code: 'DEFAULT', name: 'اختبار الافتراضيات' });

      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currency: 'LYD',
          timezone: 'Africa/Tripoli',
          country: 'LY',
          locale: 'ar',
        }),
      });
    });
  });

  // ============================================
  // getOrganizationTree
  // ============================================
  describe('getOrganizationTree', () => {
    it('should return full organization hierarchy', async () => {
      const treeResult = {
        ...mockOrganization,
        hospitals: [mockHospital1, mockHospital2],
        children: [mockChildOrg],
        parent: null,
      };
      mockPrisma.organization.findUnique.mockResolvedValue(treeResult);

      const result = await service.getOrganizationTree(1);

      expect(result.hospitals).toHaveLength(2);
      expect(result.children).toHaveLength(1);
      expect(result.children[0].hospitals).toHaveLength(1);
    });

    it('should throw NotFoundException for non-existent organization', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getOrganizationTree(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // getOrganizationHospitalIds
  // ============================================
  describe('getOrganizationHospitalIds', () => {
    it('should collect all hospital IDs including nested children', async () => {
      const treeResult = {
        ...mockOrganization,
        hospitals: [mockHospital1, mockHospital2],
        children: [mockChildOrg],
        parent: null,
      };
      mockPrisma.organization.findUnique.mockResolvedValue(treeResult);

      const ids = await service.getOrganizationHospitalIds(1);

      // 2 hospitals at root + 1 in child
      expect(ids).toEqual(expect.arrayContaining([10, 20, 30]));
      expect(ids).toHaveLength(3);
    });

    it('should return empty array for organization with no hospitals', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        ...mockOrganization,
        hospitals: [],
        children: [],
        parent: null,
      });

      const ids = await service.getOrganizationHospitalIds(1);
      expect(ids).toEqual([]);
    });
  });

  // ============================================
  // linkHospitalToOrganization
  // ============================================
  describe('linkHospitalToOrganization', () => {
    it('should link hospital to organization', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockPrisma.hospital.update.mockResolvedValue({ ...mockHospital1, organizationId: 1 });

      const result = await service.linkHospitalToOrganization(10, 1);

      expect(mockPrisma.hospital.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { organizationId: 1 },
      });
      expect(result.organizationId).toBe(1);
    });

    it('should throw NotFoundException for invalid organization', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.linkHospitalToOrganization(10, 999),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // OrgSettings (Key-Value)
  // ============================================
  describe('OrgSettings', () => {
    it('should upsert a setting', async () => {
      mockPrisma.orgSetting.upsert.mockResolvedValue({
        id: 1,
        organizationId: 1,
        key: 'nphies.enabled',
        value: 'true',
        description: 'تفعيل تكامل NPHIES',
      });

      const result = await service.setOrgSetting(1, 'nphies.enabled', 'true', 'تفعيل تكامل NPHIES');

      expect(result.key).toBe('nphies.enabled');
      expect(result.value).toBe('true');
    });

    it('should return setting value when exists', async () => {
      mockPrisma.orgSetting.findUnique.mockResolvedValue({
        value: 'SAR',
      });

      const result = await service.getOrgSetting(1, 'currency');
      expect(result).toBe('SAR');
    });

    it('should return default value when setting does not exist', async () => {
      mockPrisma.orgSetting.findUnique.mockResolvedValue(null);

      const result = await service.getOrgSetting(1, 'missing.key', 'default');
      expect(result).toBe('default');
    });

    it('should return null when no default provided and setting missing', async () => {
      mockPrisma.orgSetting.findUnique.mockResolvedValue(null);

      const result = await service.getOrgSetting(1, 'missing.key');
      expect(result).toBeNull();
    });
  });

  // ============================================
  // findAllOrganizations
  // ============================================
  describe('findAllOrganizations', () => {
    it('should return only active organizations with counts', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
        { ...mockOrganization, _count: { hospitals: 2, children: 1 }, parent: null },
      ]);

      const result = await service.findAllOrganizations();

      expect(result).toHaveLength(1);
      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });
  });

  // ============================================
  // updateOrganization
  // ============================================
  describe('updateOrganization', () => {
    it('should update organization fields', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        ...mockOrganization,
        name: 'الاسم الجديد',
        currency: 'USD',
      });

      const result = await service.updateOrganization(1, {
        name: 'الاسم الجديد',
        currency: 'USD',
      });

      expect(result.name).toBe('الاسم الجديد');
      expect(result.currency).toBe('USD');
    });

    it('should allow deactivating organization', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        ...mockOrganization,
        isActive: false,
      });

      const result = await service.updateOrganization(1, { isActive: false });
      expect(result.isActive).toBe(false);
    });
  });
});
