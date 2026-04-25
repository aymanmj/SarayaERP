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
}
