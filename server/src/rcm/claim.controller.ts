import { ClaimPaymentDto } from './claim-payment.dto';
import type { JwtPayload } from '../auth/jwt-payload.type';
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
import {
  EraProcessingService,
  MONEY_INPUT_PATTERN,
} from './era-processing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClaimStatus, type Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

const coerceMoneyInput = ({ value }: { value: unknown }) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : value;

class EraLineItemInputDto {
  @IsString() @MinLength(1) @MaxLength(100) claimNumber!: string;
  @IsOptional() @IsString() @MaxLength(200) patientName?: string;
  @IsOptional() @IsDateString() serviceDate?: string;
  @Transform(coerceMoneyInput)
  @IsString()
  @Matches(MONEY_INPUT_PATTERN)
  billedAmount!: string;
  @IsOptional()
  @Transform(coerceMoneyInput)
  @IsString()
  @Matches(MONEY_INPUT_PATTERN)
  allowedAmount?: string;
  @Transform(coerceMoneyInput)
  @IsString()
  @Matches(MONEY_INPUT_PATTERN)
  paidAmount!: string;
  @IsOptional()
  @Transform(coerceMoneyInput)
  @IsString()
  @Matches(MONEY_INPUT_PATTERN)
  adjustmentAmount?: string;
  @IsOptional() @IsString() @MaxLength(100) adjustmentCode?: string;
  @IsOptional() @IsString() @MaxLength(500) adjustmentReason?: string;
  @IsOptional() @IsString() @MaxLength(100) denialCode?: string;
  @IsOptional() @IsString() @MaxLength(500) denialReason?: string;
}

class ProcessEraPayloadDto {
  @IsInt() @Min(1) insuranceProviderId!: number;
  @IsString() @MinLength(3) @MaxLength(100) eraNumber!: string;
  @IsOptional() @IsDateString() paymentDate?: string;
  @Transform(coerceMoneyInput)
  @IsString()
  @Matches(MONEY_INPUT_PATTERN)
  totalPaid!: string;
  @IsOptional() @IsString() @MaxLength(100) checkNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) bankReference?: string;
  @IsOptional() @Allow() rawPayload?: Prisma.InputJsonValue;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => EraLineItemInputDto)
  lineItems!: EraLineItemInputDto[];
}

class PostEraFinancialDto {
  @IsUUID('4') requestId!: string;
  @IsString() @MinLength(5) @MaxLength(200) bankReference!: string;
  @Equals(true) confirmed!: boolean;
}

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
    private eraService: EraProcessingService,
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
    @CurrentUser() user: JwtPayload,
    @Body() data: { invoiceId: number },
  ) {
    return this.claimService.createClaim(user.hospitalId, data.invoiceId);
  }

  /**
   * إنشاء مطالبات جماعية
   */
  @ApiOperation({ summary: 'Create multiple claims from multiple invoices' })
  @ApiResponse({
    status: 201,
    description: 'Batch claims created successfully.',
  })
  @Post('claims/batch')
  @Permissions('claims:create')
  async createBatchClaims(
    @CurrentUser() user: JwtPayload,
    @Body() data: { invoiceIds: number[] },
  ) {
    return this.claimService.createBatchClaims(
      user.hospitalId,
      data.invoiceIds,
    );
  }

  /**
   * قائمة المطالبات مع الفلترة
   */
  @ApiOperation({
    summary: 'Get a paginated list of claims with optional filters',
  })
  @ApiResponse({
    status: 200,
    description: 'List of claims retrieved successfully.',
  })
  @Get('claims')
  @Permissions('claims:read')
  async findClaims(
    @CurrentUser() user: JwtPayload,
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
  @ApiResponse({
    status: 200,
    description: 'Claim details retrieved successfully.',
  })
  @Get('claims/:id')
  @Permissions('claims:read')
  async getClaimById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.claimService.getClaimById(id, user?.hospitalId);
  }

  // ============================================
  // Scrubbing
  // ============================================

  /**
   * فحص مطالبة (Scrub)
   */
  @ApiOperation({ summary: 'Scrub a claim for coding and clinical errors' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({
    status: 200,
    description: 'Claim scrubbed successfully and results returned.',
  })
  @Post('claims/:id/scrub')
  @Permissions('claims:update')
  async scrubClaim(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.claimService.scrubClaim(id, user?.hospitalId);
  }

  // ============================================
  // Status Management
  // ============================================

  /**
   * تحديث حالة المطالبة (إرسال، قبول، إلخ)
   */
  @ApiOperation({ summary: 'Update claim status' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({
    status: 200,
    description: 'Claim status updated successfully.',
  })
  @Put('claims/:id/status')
  @Permissions('claims:update')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() data: { status: ClaimStatus; notes?: string },
  ) {
    return this.claimService.updateClaimStatus(
      id,
      data.status,
      data.notes,
      user.sub,
      user?.hospitalId,
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
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ClaimPaymentDto,
  ) {
    return this.claimService.postPayment(id, data, user.hospitalId, user.sub);
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
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    data: {
      denialCode: string;
      denialReason: string;
      appealDeadline?: string;
    },
  ) {
    return this.claimService.denyClaim(
      id,
      {
        ...data,
        appealDeadline: data.appealDeadline
          ? new Date(data.appealDeadline)
          : undefined,
      },
      user?.hospitalId,
    );
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
    @CurrentUser() user: JwtPayload,
    @Body() data: { notes: string },
  ) {
    return this.claimService.appealClaim(
      id,
      data.notes,
      user.sub,
      user?.hospitalId,
    );
  }

  // ============================================
  // Dashboard & Analytics
  // ============================================

  /**
   * لوحة تحكم المطالبات
   */
  @ApiOperation({ summary: 'Get RCM dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'RCM dashboard statistics retrieved successfully.',
  })
  @Get('dashboard')
  @Permissions('claims:read')
  async getDashboard(@CurrentUser() user: JwtPayload) {
    return this.claimService.getClaimsDashboard(user.hospitalId);
  }

  /**
   * تحليلات المرفوضات
   */
  @ApiOperation({ summary: 'Get analytics for claim denials' })
  @ApiResponse({
    status: 200,
    description: 'Denials analytics retrieved successfully.',
  })
  @Get('denials/analytics')
  @Permissions('claims:read')
  async getDenialAnalytics(
    @CurrentUser() user: JwtPayload,
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
  @ApiResponse({
    status: 200,
    description: 'Upcoming appeal deadlines retrieved successfully.',
  })
  @Get('denials/deadlines')
  @Permissions('claims:read')
  async getUpcomingDeadlines(
    @CurrentUser() user: JwtPayload,
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
  @ApiResponse({
    status: 200,
    description: 'First Pass Rate retrieved successfully.',
  })
  @Get('kpi/first-pass-rate')
  @Permissions('claims:read')
  async getFirstPassRate(
    @CurrentUser() user: JwtPayload,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.denialService.getFirstPassRate(
      user.hospitalId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  // ============================================
  // Electronic Remittance Advice (ERA)
  // ============================================

  @ApiOperation({ summary: 'List Electronic Remittance Advice files (ERA)' })
  @Get('era')
  @Permissions('claims:read')
  listEras(
    @CurrentUser() user: JwtPayload,
    @Query('providerId') providerId?: string,
    @Query('status') status?: string,
  ) {
    const parsedProviderId =
      providerId &&
      Number.isInteger(Number(providerId)) &&
      Number(providerId) > 0
        ? Number(providerId)
        : undefined;
    return this.eraService.listEras(user.hospitalId, {
      providerId: parsedProviderId,
      status: status || undefined,
    });
  }

  @ApiOperation({ summary: 'Get ERA details by ID' })
  @Get('era/:id')
  @Permissions('claims:read')
  getEraById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.eraService.getEraById(user.hospitalId, id);
  }

  @ApiOperation({ summary: 'Ingest ERA payload and match internal claims' })
  @Post('era')
  @Permissions('claims:update')
  ingestEra(
    @CurrentUser() user: JwtPayload,
    @Body() data: ProcessEraPayloadDto,
  ) {
    return this.eraService.processEraPayload(data, user.hospitalId);
  }

  @ApiOperation({
    summary:
      'Atomically post ERA receipts and rejections into claim ledger and accounting',
  })
  @Post('era/:id/post')
  @Permissions('claims:update')
  postEraFinancialSettlement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: PostEraFinancialDto,
  ) {
    return this.eraService.postEraFinancialSettlement(
      user.hospitalId,
      user.sub,
      id,
      data,
    );
  }
}
