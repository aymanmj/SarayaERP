import type { JwtPayload } from '../auth/jwt-payload.type';
// src/insurance/insurance.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  Query,
  Req,
  Patch,
  Delete,
} from '@nestjs/common';
import { InsuranceService } from './insurance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  Equals,
  IsBoolean,
  IsIn,
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

class InsuranceSettlementLineDto {
  @IsInt() @Min(1) invoiceId!: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount!: string;
}

class InsuranceSettlementDto {
  @IsInt() @Min(1) providerId!: number;
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  invoiceIds!: number[];
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount!: string;
  @IsString() @MinLength(5) @MaxLength(200) bankReference!: string;
  @Equals(true) confirmed!: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InsuranceSettlementLineDto)
  allocations?: InsuranceSettlementLineDto[];
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/)
  unallocatedAmount?: string;
}

class ApplySettlementCreditDto {
  @IsUUID('4') requestId!: string;
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  invoiceIds!: number[];
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount!: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InsuranceSettlementLineDto)
  allocations?: InsuranceSettlementLineDto[];
}

class ClaimWithdrawalDto {
  @IsString() @MinLength(5) @MaxLength(200) payerReference!: string;
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
  @Equals(true) confirmed!: boolean;
}

class ClaimReceiptRefundDto {
  @IsInt() @Min(1) receiptId!: number;
  @IsUUID('4') requestId!: string;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount!: string;
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}

class ClaimReceiptRefundReviewDto {
  @IsIn(['POST', 'REJECT']) decision!: 'POST' | 'REJECT';
  @IsString() @MinLength(5) @MaxLength(1000) note!: string;
  @IsOptional() @IsString() @MaxLength(200) bankReference?: string;
  @IsOptional() @IsBoolean() confirmed?: boolean;
}

class SettlementRefundLineDto {
  @IsInt() @Min(1) allocationId!: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount!: string;
}

class SettlementRefundDto {
  @IsUUID('4') requestId!: string;
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SettlementRefundLineDto)
  lines?: SettlementRefundLineDto[];
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/)
  unallocatedAmount?: string;
}
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  // Providers
  @Permissions('insurance:view', 'insurance:manage')
  @Get('providers')
  async listProviders(@Req() req: { user: JwtPayload }) {
    return this.insuranceService.findAllProviders(req.user.hospitalId);
  }

  @Post('providers')
  @Permissions('insurance:manage')
  async createProvider(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.insuranceService.createProvider(req.user.hospitalId, body);
  }

  @Permissions('insurance:view', 'insurance:manage')
  @Get('providers/:id')
  async getProvider(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.insuranceService.getProviderDetails(req.user.hospitalId, id);
  }

  // Policies (Updated to support planId)
  @Post('providers/:id/policies')
  @Permissions('insurance:manage')
  async createPolicy(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    // body: { name, policyNumber, startDate, endDate, planId, ... }
    return this.insuranceService.createPolicy(req.user.hospitalId, id, body);
  }

  // Plans (New)
  @Post('providers/:id/plans')
  @Permissions('insurance:manage')
  async createPlan(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) providerId: number,
    @Body() body: any,
  ) {
    // body: { name, defaultCopayRate, maxCopayAmount }
    return this.insuranceService.createPlan(
      req.user.hospitalId,
      providerId,
      body,
    );
  }

  @Permissions('insurance:view', 'insurance:manage')
  @Get('plans/:id')
  async getPlan(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.insuranceService.getPlanDetails(req.user.hospitalId, id);
  }

  @Post('plans/:id/rules')
  @Permissions('insurance:manage')
  async addRule(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) planId: number,
    @Body() body: any,
  ) {
    // body: { serviceCategoryId?, serviceItemId?, ruleType, copayType, copayValue, requiresApproval }
    return this.insuranceService.addCoverageRule(
      req.user.hospitalId,
      planId,
      body,
    );
  }

  // Pre-Auths (New)
  @Permissions('insurance:view', 'insurance:manage')
  @Get('coverage-balance/:patientId')
  getCoverageBalance(
    @Req() req: { user: JwtPayload },
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.insuranceService.getPatientCoverageBalance(
      req.user.hospitalId,
      patientId,
    );
  }

  @Permissions('insurance:manage')
  @Post('pre-auth')
  async createPreAuth(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.insuranceService.createPreAuth(req.user.hospitalId, body);
  }

  @Permissions('insurance:view', 'insurance:manage')
  @Get('pre-auth')
  async listPreAuths(
    @Req() req: { user: JwtPayload },
    @Query('patientId') patId?: string,
  ) {
    const pId = patId ? Number(patId) : undefined;
    return this.insuranceService.getPreAuths(req.user.hospitalId, pId);
  }

  @Permissions('insurance:manage')
  @Get('pre-auth/services')
  listPreAuthServices(@Req() req: { user: JwtPayload }) {
    return this.insuranceService.getPreAuthServices(req.user.hospitalId);
  }

  @Permissions('insurance:manage')
  @Patch('pre-auth/:id')
  async updatePreAuth(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.insuranceService.updatePreAuth(
      req.user.hospitalId,
      id,
      req.user.sub,
      body,
    );
  }

  // Claims
  @Get('claims/:invoiceId/receipt-refunds')
  @Permissions('insurance:manage')
  listReceiptRefunds(
    @Req() req: { user: JwtPayload },
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    return this.insuranceService.listClaimReceiptRefunds(
      req.user.hospitalId,
      invoiceId,
    );
  }

  @Post('claims/:invoiceId/receipt-refunds')
  @Permissions('insurance:manage')
  requestReceiptRefund(
    @Req() req: { user: JwtPayload },
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Body() body: ClaimReceiptRefundDto,
  ) {
    return this.insuranceService.requestClaimReceiptRefund(
      req.user.hospitalId,
      invoiceId,
      req.user.sub,
      body,
    );
  }

  @Post('claims/:invoiceId/receipt-refunds/:refundId/review')
  @Permissions('insurance:manage')
  reviewReceiptRefund(
    @Req() req: { user: JwtPayload },
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Param('refundId', ParseIntPipe) refundId: number,
    @Body() body: ClaimReceiptRefundReviewDto,
  ) {
    return this.insuranceService.reviewClaimReceiptRefund(
      req.user.hospitalId,
      invoiceId,
      req.user.sub,
      refundId,
      body,
    );
  }

  @Post('claims/:invoiceId/withdrawal')
  @Permissions('insurance:manage')
  withdrawClaim(
    @Req() req: { user: JwtPayload },
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Body() body: ClaimWithdrawalDto,
  ) {
    return this.insuranceService.recordClaimWithdrawal(
      req.user.hospitalId,
      invoiceId,
      req.user.sub,
      body,
    );
  }

  @Get('claims')
  @Permissions('insurance:manage')
  async listClaims(
    @Req() req: { user: JwtPayload },
    @Query('providerId') providerId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.insuranceService.getClaims(req.user.hospitalId, {
      providerId: providerId ? Number(providerId) : undefined,
      status: status || undefined,
      fromDate: from ? new Date(from) : undefined,
      toDate: to ? new Date(to) : undefined,
    });
  }

  @Get('claims/settlements')
  @Permissions('insurance:manage')
  listInsuranceSettlements(
    @Req() req: { user: JwtPayload },
    @Query('providerId') providerId?: string,
    @Query('onlyUnallocated') onlyUnallocated?: string,
  ) {
    const parsedProviderId =
      providerId &&
      Number.isInteger(Number(providerId)) &&
      Number(providerId) > 0
        ? Number(providerId)
        : undefined;
    return this.insuranceService.listInsuranceSettlements(req.user.hospitalId, {
      providerId: parsedProviderId,
      onlyUnallocated: onlyUnallocated === 'true',
    });
  }

  @Post('claims/settlements')
  @Permissions('insurance:manage')
  postInsuranceSettlement(
    @Req() req: { user: JwtPayload },
    @Body() body: InsuranceSettlementDto,
  ) {
    return this.insuranceService.postInsuranceSettlement(
      req.user.hospitalId,
      req.user.sub,
      body,
    );
  }

  @Post('claims/settlements/:settlementId/apply')
  @Permissions('insurance:manage')
  applyInsuranceSettlementCredit(
    @Req() req: { user: JwtPayload },
    @Param('settlementId', ParseIntPipe) settlementId: number,
    @Body() body: ApplySettlementCreditDto,
  ) {
    return this.insuranceService.applyInsuranceSettlementCredit(
      req.user.hospitalId,
      settlementId,
      req.user.sub,
      body,
    );
  }

  @Get('claims/settlements/:settlementId/refunds')
  @Permissions('insurance:manage')
  listSettlementRefunds(
    @Req() req: { user: JwtPayload },
    @Param('settlementId', ParseIntPipe) settlementId: number,
  ) {
    return this.insuranceService.listSettlementRefunds(
      req.user.hospitalId,
      settlementId,
    );
  }

  @Post('claims/settlements/:settlementId/refunds')
  @Permissions('insurance:manage')
  requestSettlementRefund(
    @Req() req: { user: JwtPayload },
    @Param('settlementId', ParseIntPipe) settlementId: number,
    @Body() body: SettlementRefundDto,
  ) {
    return this.insuranceService.requestSettlementRefund(
      req.user.hospitalId,
      settlementId,
      req.user.sub,
      body,
    );
  }

  @Post('claims/settlements/:settlementId/refunds/:refundId/review')
  @Permissions('insurance:manage')
  reviewSettlementRefund(
    @Req() req: { user: JwtPayload },
    @Param('settlementId', ParseIntPipe) settlementId: number,
    @Param('refundId', ParseIntPipe) refundId: number,
    @Body() body: ClaimReceiptRefundReviewDto,
  ) {
    return this.insuranceService.reviewSettlementRefund(
      req.user.hospitalId,
      settlementId,
      req.user.sub,
      refundId,
      body,
    );
  }

  @Post('claims/update-status')
  @Permissions('insurance:manage')
  async updateClaimsStatus(
    @Req() req: { user: JwtPayload },
    @Body()
    body: { invoiceIds: number[]; status: string; rejectionReason?: string },
  ) {
    return this.insuranceService.updateClaimsStatus(
      req.user.hospitalId,
      body.invoiceIds,
      body.status,
      body.rejectionReason,
      req.user.sub,
    );
  }

  @Patch('providers/:id')
  @Permissions('insurance:manage')
  async updateProvider(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.insuranceService.updateProvider(req.user.hospitalId, id, body);
  }

  @Delete('providers/:id')
  @Permissions('insurance:manage')
  async deleteProvider(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.insuranceService.softDeleteProvider(req.user.hospitalId, id);
  }
}

// import {
//   Body,
//   Controller,
//   Get,
//   Param,
//   ParseIntPipe,
//   Post,
//   UseGuards,
//   Query,
//   Req,
// } from '@nestjs/common';
// import { InsuranceService } from './insurance.service';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { PermissionsGuard } from '../auth/permissions.guard';
// import { Permissions } from '../auth/permissions.decorator';
// @UseGuards(JwtAuthGuard, PermissionsGuard)
// @Controller('insurance')
// @Permissions('insurance:view')
// export class InsuranceController {
//   constructor(private readonly insuranceService: InsuranceService) {}

//   @Get('providers')
//   async listProviders(@Req() req: {user:JwtPayload}) {
//     return this.insuranceService.findAllProviders(req.user.hospitalId);
//   }

//   @Post('providers')
//   @Permissions('insurance:manage')
//   async createProvider(@Req() req: {user:JwtPayload}, @Body() body: any) {
//     return this.insuranceService.createProvider(req.user.hospitalId, body);
//   }

//   @Post('providers/:id/policies')
//   @Permissions('insurance:manage')
//   async createPolicy(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
//     return this.insuranceService.createPolicy(id, body);
//   }

//   @Get('claims')
//   @Permissions('insurance:manage')
//   async listClaims(
//     @Req() req: {user:JwtPayload},
//     @Query('providerId') providerId?: string,
//     @Query('status') status?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//   ) {
//     return this.insuranceService.getClaims(req.user.hospitalId, {
//       providerId: providerId ? Number(providerId) : undefined,
//       status: status || undefined,
//       fromDate: from ? new Date(from) : undefined,
//       toDate: to ? new Date(to) : undefined,
//     });
//   }

//   @Post('claims/update-status')
//   @Permissions('insurance:manage')
//   async updateClaimsStatus(
//     @Req() req: {user:JwtPayload},
//     @Body() body: { invoiceIds: number[]; status: string },
//   ) {
//     return this.insuranceService.updateClaimsStatus(
//       req.user.hospitalId,
//       body.invoiceIds,
//       body.status,
//       req.user.sub,
//     );
//   }
// }
