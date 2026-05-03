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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

/**
 * واجهة تحكم دورة الإيرادات (Revenue Cycle Management)
 * 
 * تشمل:
 * - إنشاء وإدارة المطالبات التأمينية
 * - فحص المطالبات قبل الإرسال
 * - تتبع المدفوعات والمرفوضات
 * - لوحة تحكم وتحليلات
 */
@ApiTags('rcm-claims')
@ApiBearerAuth()
@Controller('rcm/claims')
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
  @ApiOperation({ summary: 'Create an insurance claim from an invoice' })
  @ApiResponse({ status: 201, description: 'Claim created successfully.' })
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
  @ApiOperation({ summary: 'Create multiple claims from multiple invoices' })
  @ApiResponse({ status: 201, description: 'Batch claims created successfully.' })
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
  @ApiOperation({ summary: 'Get a paginated list of claims with optional filters' })
  @ApiResponse({ status: 200, description: 'List of claims retrieved successfully.' })
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
  @ApiOperation({ summary: 'Get claim details by ID' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({ status: 200, description: 'Claim details retrieved successfully.' })
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
  @ApiOperation({ summary: 'Scrub a claim for coding and clinical errors' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({ status: 200, description: 'Claim scrubbed successfully and results returned.' })
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
  @ApiOperation({ summary: 'Update claim status' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({ status: 200, description: 'Claim status updated successfully.' })
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
  @ApiOperation({ summary: 'Post a payment to a claim' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({ status: 201, description: 'Payment posted successfully.' })
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
  @ApiOperation({ summary: 'Deny a claim with denial code and reason' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({ status: 201, description: 'Claim denied successfully.' })
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
  @ApiOperation({ summary: 'Submit an appeal for a denied claim' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({ status: 201, description: 'Appeal submitted successfully.' })
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
  @ApiOperation({ summary: 'Get RCM dashboard statistics' })
  @ApiResponse({ status: 200, description: 'RCM dashboard statistics retrieved successfully.' })
  @Get('dashboard')
  @Permissions('claims:read')
  async getDashboard(@CurrentUser() user: any) {
    return this.claimService.getClaimsDashboard(user.hospitalId);
  }

  /**
   * تحليلات المرفوضات
   */
  @ApiOperation({ summary: 'Get analytics for claim denials' })
  @ApiResponse({ status: 200, description: 'Denials analytics retrieved successfully.' })
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
  @ApiOperation({ summary: 'Get upcoming appeal deadlines' })
  @ApiQuery({ name: 'days', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Upcoming appeal deadlines retrieved successfully.' })
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
  @ApiOperation({ summary: 'Get First Pass Rate KPI' })
  @ApiResponse({ status: 200, description: 'First Pass Rate retrieved successfully.' })
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
