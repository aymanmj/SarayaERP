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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurance')
@Roles('ADMIN', 'ACCOUNTANT', 'RECEPTION')
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  // Providers
  @Get('providers')
  async listProviders(@Req() req: any) {
    return this.insuranceService.findAllProviders(req.user.hospitalId);
  }

  @Post('providers')
  @Roles('ADMIN')
  async createProvider(@Req() req: any, @Body() body: any) {
    return this.insuranceService.createProvider(req.user.hospitalId, body);
  }

  // Policies (Updated to support planId)
  @Post('providers/:id/policies')
  @Roles('ADMIN')
  async createPolicy(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    // body: { name, policyNumber, startDate, endDate, planId, ... }
    return this.insuranceService.createPolicy(id, body);
  }

  // Plans (New)
  @Post('providers/:id/plans')
  @Roles('ADMIN')
  async createPlan(
    @Param('id', ParseIntPipe) providerId: number,
    @Body() body: any,
  ) {
    // body: { name, defaultCopayRate, maxCopayAmount }
    return this.insuranceService.createPlan(providerId, body);
  }

  @Get('plans/:id')
  async getPlan(@Param('id', ParseIntPipe) id: number) {
    return this.insuranceService.getPlanDetails(id);
  }

  @Post('plans/:id/rules')
  @Roles('ADMIN')
  async addRule(@Param('id', ParseIntPipe) planId: number, @Body() body: any) {
    // body: { serviceCategoryId?, serviceItemId?, ruleType, copayType, copayValue, requiresApproval }
    return this.insuranceService.addCoverageRule(planId, body);
  }

  // Pre-Auths (New)
  @Post('pre-auth')
  async createPreAuth(@Req() req: any, @Body() body: any) {
    return this.insuranceService.createPreAuth(req.user.hospitalId, body);
  }

  @Get('pre-auth')
  async listPreAuths(@Req() req: any, @Query('patientId') patId?: string) {
    const pId = patId ? Number(patId) : undefined;
    return this.insuranceService.getPreAuths(req.user.hospitalId, pId);
  }

  // Claims
  @Get('claims')
  @Roles('ADMIN', 'ACCOUNTANT')
  async listClaims(
    @Req() req: any,
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

  @Post('claims/update-status')
  @Roles('ADMIN', 'ACCOUNTANT')
  async updateClaimsStatus(
    @Req() req: any,
    @Body() body: { invoiceIds: number[]; status: string },
  ) {
    return this.insuranceService.updateClaimsStatus(
      req.user.hospitalId,
      body.invoiceIds,
      body.status,
      req.user.sub,
    );
  }

  @Patch('providers/:id')
  @Roles('ADMIN')
  async updateProvider(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.insuranceService.updateProvider(id, body);
  }

  @Delete('providers/:id')
  @Roles('ADMIN')
  async deleteProvider(@Param('id', ParseIntPipe) id: number) {
    return this.insuranceService.softDeleteProvider(id);
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
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('insurance')
// @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTION')
// export class InsuranceController {
//   constructor(private readonly insuranceService: InsuranceService) {}

//   @Get('providers')
//   async listProviders(@Req() req: any) {
//     return this.insuranceService.findAllProviders(req.user.hospitalId);
//   }

//   @Post('providers')
//   @Roles('ADMIN')
//   async createProvider(@Req() req: any, @Body() body: any) {
//     return this.insuranceService.createProvider(req.user.hospitalId, body);
//   }

//   @Post('providers/:id/policies')
//   @Roles('ADMIN')
//   async createPolicy(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
//     return this.insuranceService.createPolicy(id, body);
//   }

//   @Get('claims')
//   @Roles('ADMIN', 'ACCOUNTANT')
//   async listClaims(
//     @Req() req: any,
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
//   @Roles('ADMIN', 'ACCOUNTANT')
//   async updateClaimsStatus(
//     @Req() req: any,
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
