import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgType } from '@prisma/client';

/**
 * خدمة إدارة المؤسسات (Multi-Tenancy)
 * تدير التسلسل الهرمي للمؤسسات: شبكة > مستشفى > عيادة
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * إنشاء مؤسسة جديدة (مستشفى، عيادة، أو شبكة)
   */
  async createOrganization(data: {
    code: string;
    name: string;
    type?: OrgType;
    parentId?: number;
    currency?: string;
    timezone?: string;
    country?: string;
    locale?: string;
    taxConfig?: any;
  }) {
    // التحقق من وجود المؤسسة الأم إذا تم تحديدها
    if (data.parentId) {
      const parent = await this.prisma.organization.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new NotFoundException('المؤسسة الأم غير موجودة');
      }
    }

    const org = await this.prisma.organization.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type || OrgType.HOSPITAL,
        parentId: data.parentId,
        currency: data.currency || 'LYD',
        timezone: data.timezone || 'Africa/Tripoli',
        country: data.country || 'LY',
        locale: data.locale || 'ar',
        taxConfig: data.taxConfig,
      },
    });

    this.logger.log(`تم إنشاء مؤسسة جديدة: ${org.name} (${org.code})`);
    return org;
  }

  /**
   * جلب مؤسسة مع كل فروعها ومستشفياتها
   */
  async getOrganizationTree(orgId: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        children: {
          include: {
            hospitals: true,
            children: {
              include: { hospitals: true },
            },
          },
        },
        hospitals: true,
        parent: true,
      },
    });

    if (!org) throw new NotFoundException('المؤسسة غير موجودة');
    return org;
  }

  /**
   * جلب كل المستشفيات التابعة لمؤسسة (بما في ذلك الفروع المتداخلة)
   */
  async getOrganizationHospitalIds(orgId: number): Promise<number[]> {
    const org = await this.getOrganizationTree(orgId);
    const hospitalIds: number[] = [];

    const collectIds = (node: any) => {
      if (node.hospitals) {
        hospitalIds.push(...node.hospitals.map((h: any) => h.id));
      }
      if (node.children) {
        node.children.forEach(collectIds);
      }
    };

    collectIds(org);
    return hospitalIds;
  }

  /**
   * ربط مستشفى بمؤسسة
   */
  async linkHospitalToOrganization(hospitalId: number, organizationId: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) throw new NotFoundException('المؤسسة غير موجودة');

    return this.prisma.hospital.update({
      where: { id: hospitalId },
      data: { organizationId },
    });
  }

  /**
   * جلب كل المؤسسات (SuperAdmin فقط)
   */
  async findAllOrganizations() {
    return this.prisma.organization.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { hospitals: true, children: true } },
        parent: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * جلب كل المستشفيات/الفروع في النظام (للبحث الإداري)
   */
  async getAllHospitals(search?: string) {
    const where: any = {};
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.hospital.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        displayName: true,
        city: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  /**
   * تحديث إعدادات المؤسسة
   */
  async updateOrganization(
    orgId: number,
    data: Partial<{
      name: string;
      currency: string;
      timezone: string;
      country: string;
      locale: string;
      taxConfig: any;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.organization.update({
      where: { id: orgId },
      data,
    });
  }

  /**
   * إدارة إعدادات المؤسسة (key-value)
   */
  async setOrgSetting(orgId: number, key: string, value: string, description?: string) {
    return this.prisma.orgSetting.upsert({
      where: { organizationId_key: { organizationId: orgId, key } },
      update: { value, description },
      create: { organizationId: orgId, key, value, description },
    });
  }

  async getOrgSetting(orgId: number, key: string, defaultValue?: string): Promise<string | null> {
    const setting = await this.prisma.orgSetting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key } },
    });
    return setting?.value ?? defaultValue ?? null;
  }

  async getOrgSettings(orgId: number) {
    return this.prisma.orgSetting.findMany({
      where: { organizationId: orgId },
      orderBy: { key: 'asc' },
    });
  }

  // ============================================
  // ✅ Multi-Branch: إدارة وصول المستخدمين للفروع
  // ============================================

  /**
   * تعيين مستخدم في فرع (منحه صلاحية الوصول)
   */
  async assignUserToBranch(userId: number, hospitalId: number, isDefault = false) {
    // التحقق من وجود المستخدم والفرع
    const [user, hospital] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.hospital.findUnique({ where: { id: hospitalId } }),
    ]);

    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (!hospital) throw new NotFoundException('الفرع غير موجود');

    // إذا كان isDefault = true، أزل الافتراضي من باقي الفروع
    if (isDefault) {
      await this.prisma.userHospitalAccess.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.userHospitalAccess.upsert({
      where: {
        userId_hospitalId: { userId, hospitalId },
      },
      update: { isDefault },
      create: { userId, hospitalId, isDefault },
      include: {
        hospital: { select: { id: true, code: true, name: true, displayName: true } },
      },
    });
  }

  /**
   * إلغاء وصول مستخدم من فرع
   */
  async removeUserFromBranch(userId: number, hospitalId: number) {
    // لا تسمح بإزالة الفرع الافتراضي (hospitalId في User)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && user.hospitalId === hospitalId) {
      this.logger.warn(
        `Cannot remove default branch (hospitalId=${hospitalId}) for user ${userId}`,
      );
      // نحذف السجل لكن الفرع يبقى كفرع أساسي عبر user.hospitalId
    }

    return this.prisma.userHospitalAccess.deleteMany({
      where: { userId, hospitalId },
    });
  }

  /**
   * جلب كل الفروع المتاحة لمستخدم معين
   */
  async getUserBranches(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { hospitalId: true },
    });

    const accessRecords = await this.prisma.userHospitalAccess.findMany({
      where: { userId },
      include: {
        hospital: {
          select: { id: true, code: true, name: true, displayName: true, isActive: true },
        },
      },
      orderBy: { isDefault: 'desc' },
    });

    const branches = accessRecords
      .filter((a) => a.hospital.isActive)
      .map((a) => ({
        id: a.hospital.id,
        code: a.hospital.code,
        name: a.hospital.displayName || a.hospital.name,
        isDefault: a.isDefault,
      }));

    // Fallback: إذا لم يكن هناك سجلات، أضف الفرع الافتراضي
    if (branches.length === 0 && user) {
      const defaultHospital = await this.prisma.hospital.findUnique({
        where: { id: user.hospitalId },
        select: { id: true, code: true, name: true, displayName: true },
      });
      if (defaultHospital) {
        branches.push({
          id: defaultHospital.id,
          code: defaultHospital.code,
          name: defaultHospital.displayName || defaultHospital.name,
          isDefault: true,
        });
      }
    }

    return branches;
  }

  /**
   * جلب كل المستخدمين الذين لديهم وصول لفرع معين
   */
  async getBranchUsers(hospitalId: number) {
    return this.prisma.userHospitalAccess.findMany({
      where: { hospitalId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            isActive: true,
            isDoctor: true,
            hospitalId: true,
          },
        },
      },
    });
  }

  /**
   * تعيين مجموعة فروع لمستخدم (Bulk) - تستبدل كل السجلات القديمة
   */
  async setUserBranches(
    userId: number,
    branches: { hospitalId: number; isDefault?: boolean }[],
  ) {
    // حذف كل السجلات القديمة
    await this.prisma.userHospitalAccess.deleteMany({ where: { userId } });

    // إنشاء سجلات جديدة
    if (branches.length > 0) {
      await this.prisma.userHospitalAccess.createMany({
        data: branches.map((b) => ({
          userId,
          hospitalId: b.hospitalId,
          isDefault: b.isDefault || false,
        })),
      });
    }

    return this.getUserBranches(userId);
  }
}
