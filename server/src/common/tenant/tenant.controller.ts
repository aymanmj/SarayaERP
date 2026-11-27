import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { PlatformAdminGuard } from '../../auth/platform-admin.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt-payload.type';
import { OrgType } from '@prisma/client';

/**
 * وحدة تحكم إدارة المؤسسات (SuperAdmin)
 * تتيح إدارة الهرم التنظيمي: شبكات > مستشفيات > عيادات
 * وإدارة وصول المستخدمين للفروع المختلفة
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(private tenantService: TenantService) {}

  /**
   * جلب كل المؤسسات
   */
  @Get()
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:read')
  async findAll() {
    return this.tenantService.findAllOrganizations();
  }

  /**
   * جلب كل المستشفيات/الفروع (بحث اختياري للـ Admin Dropdowns)
   */
  @Get('hospitals')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:read')
  async getAllHospitals(@Query('search') search?: string) {
    return this.tenantService.getAllHospitals(search);
  }

  /**
   * جلب شجرة المؤسسة مع الفروع والمستشفيات
   */
  @Get(':id/tree')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:read')
  async getTree(@Param('id', ParseIntPipe) id: number) {
    return this.tenantService.getOrganizationTree(id);
  }

  /**
   * إنشاء مؤسسة جديدة
   */
  @Post()
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:create')
  async create(
    @Body()
    data: {
      code: string;
      name: string;
      type?: OrgType;
      parentId?: number;
      currency?: string;
      timezone?: string;
      country?: string;
      locale?: string;
      taxConfig?: any;
    },
  ) {
    return this.tenantService.createOrganization(data);
  }

  /**
   * تحديث مؤسسة
   */
  @Put(':id')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    data: {
      name?: string;
      currency?: string;
      timezone?: string;
      country?: string;
      locale?: string;
      taxConfig?: any;
      isActive?: boolean;
    },
  ) {
    return this.tenantService.updateOrganization(id, data);
  }

  /**
   * ربط مستشفى بمؤسسة
   */
  @Post(':id/hospitals/:hospitalId')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:update')
  async linkHospital(
    @Param('id', ParseIntPipe) orgId: number,
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
  ) {
    return this.tenantService.linkHospitalToOrganization(hospitalId, orgId);
  }

  /**
   * جلب كل معرفات المستشفيات التابعة لمؤسسة
   */
  @Get(':id/hospital-ids')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:read')
  async getHospitalIds(@Param('id', ParseIntPipe) id: number) {
    const ids = await this.tenantService.getOrganizationHospitalIds(id);
    return { organizationId: id, hospitalIds: ids };
  }

  /**
   * إعدادات المؤسسة
   */
  @Get(':id/settings')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:read')
  async getSettings(@Param('id', ParseIntPipe) id: number) {
    return this.tenantService.getOrgSettings(id);
  }

  @Post(':id/settings')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:update')
  async setSetting(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: { key: string; value: string; description?: string },
  ) {
    return this.tenantService.setOrgSetting(
      id,
      data.key,
      data.value,
      data.description,
    );
  }

  // ============================================
  // ✅ Multi-Branch: إدارة وصول المستخدمين للفروع
  // ============================================

  /**
   * تعيين مستخدم في فرع
   */
  @Post('branches/users')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:update')
  async assignUserToBranch(
    @Body() data: { userId: number; hospitalId: number; isDefault?: boolean },
  ) {
    return this.tenantService.assignUserToBranch(
      data.userId,
      data.hospitalId,
      data.isDefault,
    );
  }

  /**
   * إلغاء وصول مستخدم من فرع
   */
  @Delete('branches/users/:userId/:hospitalId')
  @Permissions('organizations:update')
  async removeUserFromBranch(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.isSuperAdmin !== true && user.hospitalId !== hospitalId) {
      throw new ForbiddenException('لا تملك صلاحية إدارة وصول فرع آخر.');
    }
    return this.tenantService.removeUserFromBranch(userId, hospitalId);
  }

  /**
   * جلب كل الفروع المتاحة لمستخدم
   */
  @Get('branches/users/:userId')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:read')
  async getUserBranches(@Param('userId', ParseIntPipe) userId: number) {
    return this.tenantService.getUserBranches(userId);
  }

  /**
   * جلب كل المستخدمين المعينين في فرع
   */
  @Get('branches/:hospitalId/users')
  @Permissions('organizations:read')
  async getBranchUsers(
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.isSuperAdmin !== true && user.hospitalId !== hospitalId) {
      throw new ForbiddenException('لا تملك صلاحية عرض مستخدمي فرع آخر.');
    }
    return this.tenantService.getBranchUsers(hospitalId);
  }

  /**
   * تعيين مجموعة فروع لمستخدم (Bulk)
   */
  @Put('branches/users/:userId')
  @UseGuards(PlatformAdminGuard)
  @Permissions('organizations:update')
  async setUserBranches(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() data: { branches: { hospitalId: number; isDefault?: boolean }[] },
  ) {
    return this.tenantService.setUserBranches(userId, data.branches);
  }
}
