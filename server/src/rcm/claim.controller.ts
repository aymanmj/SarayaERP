import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { ClaimService } from './claim.service';
import { DenialManagementService } from './denials/denial-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClaimStatus } from '@prisma/client';

/**
 * واجهة تحكم دورة الإيرادات (Revenue Cycle Management)
 * 
 * تشمل:
 * - إنشاء وإدارة المطالبات التأمينية
 * - فحص المطالبات قبل الإرسال
 * - تتبع المدفوعات والمرفوضات
 * - لوحة تحكم وتحليلات
 */
@Controller('api/rcm')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClaimController {
  private readonly logger = new Logger(ClaimController.name);

  constructor(
    private claimService: ClaimService,
    private denialService: DenialManagementService,
  ) {}

  // ============================================
  // Claims CRUD
  // ============================================

  /**
   * إنشاء مطالبة من فاتورة
   */
  @Post('claims')
  @Permissions('claims:create')
  async createClaim(
    @CurrentUser() user: any,
    @Body() data: { invoiceId: number },
  ) {
    return this.claimService.createClaim(user.hospitalId, data.invoiceId);
  }

  /**
   * إنشاء مطالبات جماعية
   */
  @Post('claims/batch')
  @Permissions('claims:create')
  async createBatchClaims(
    @CurrentUser() user: any,
    @Body() data: { invoiceIds: number[] },
  ) {
    return this.claimService.createBatchClaims(user.hospitalId, data.invoiceIds);
  }

  /**
   * قائمة المطالبات مع الفلترة
   */
  @Get('claims')
  @Permissions('claims:read')
  async findClaims(
    @CurrentUser() user: any,
    @Query('status') status?: ClaimStatus,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.claimService.findClaims(user.hospitalId, {
      status,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  /**
   * تفاصيل مطالبة
   */
  @Get('claims/:id')
  @Permissions('claims:read')
  async getClaimById(@Param('id', ParseIntPipe) id: number) {
    return this.claimService.getClaimById(id);
  }

  // ============================================
  // Scrubbing
  // ============================================

  /**
   * فحص مطالبة (Scrub)
   */
  @Post('claims/:id/scrub')
  @Permissions('claims:update')
  async scrubClaim(@Param('id', ParseIntPipe) id: number) {
    return this.claimService.scrubClaim(id);
  }

  // ============================================
  // Status Management
  // ============================================

  /**
   * تحديث حالة المطالبة (إرسال، قبول، إلخ)
   */
  @Put('claims/:id/status')
  @Permissions('claims:update')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() data: { status: ClaimStatus; notes?: string },
  ) {
    return this.claimService.updateClaimStatus(
      id,
      data.status,
      data.notes,
      user.sub,
    );
  }

  /**
   * ترحيل دفعة على مطالبة
   */
  @Post('claims/:id/payment')
  @Permissions('claims:update')
  async postPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    data: {
      paidAmount: number;
      adjustmentAmount?: number;
      adjustmentReason?: string;
    },
  ) {
    return this.claimService.postPayment(id, data);
  }

  /**
   * رفض مطالبة
   */
  @Post('claims/:id/deny')
  @Permissions('claims:update')
  async denyClaim(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    data: {
      denialCode: string;
      denialReason: string;
      appealDeadline?: string;
    },
  ) {
    return this.claimService.denyClaim(id, {
      ...data,
      appealDeadline: data.appealDeadline
        ? new Date(data.appealDeadline)
        : undefined,
    });
  }

  /**
   * تقديم استئناف
   */
  @Post('claims/:id/appeal')
  @Permissions('claims:update')
  async appealClaim(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() data: { notes: string },
  ) {
    return this.claimService.appealClaim(id, data.notes, user.sub);
  }

  // ============================================
  // Dashboard & Analytics
  // ============================================

  /**
   * لوحة تحكم المطالبات
   */
  @Get('dashboard')
  @Permissions('claims:read')
  async getDashboard(@CurrentUser() user: any) {
    return this.claimService.getClaimsDashboard(user.hospitalId);
  }

  /**
   * تحليلات المرفوضات
   */
  @Get('denials/analytics')
  @Permissions('claims:read')
  async getDenialAnalytics(
    @CurrentUser() user: any,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.denialService.getDenialAnalytics(
      user.hospitalId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  /**
   * مواعيد الاستئناف القادمة
   */
  @Get('denials/deadlines')
  @Permissions('claims:read')
  async getUpcomingDeadlines(
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    return this.denialService.getUpcomingAppealDeadlines(
      user.hospitalId,
      days ? parseInt(days) : 7,
    );
  }

  /**
   * معدل القبول من أول مرة
   */
  @Get('kpi/first-pass-rate')
  @Permissions('claims:read')
  async getFirstPassRate(
    @CurrentUser() user: any,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.denialService.getFirstPassRate(
      user.hospitalId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }
}
