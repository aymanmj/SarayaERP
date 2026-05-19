// src/payroll/payroll.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Delete, // 👈 أضف هذا الاستيراد
  UseGuards,
  Req,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payroll')export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('generate')
  async generate(
    @Req() req: any,
    @Body() body: { month: number; year: number },
  ) {
    return this.payrollService.generatePayroll(
      req.user.hospitalId,
      req.user.sub,
      body.month,
      body.year,
    );
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.payrollService.findAll(req.user.hospitalId);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.payrollService.findOne(req.user.hospitalId, id);
  }

  @Post(':id/approve')
  async approve(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.payrollService.approvePayroll(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }

  // ✅ أضف هذا المسار الجديد هنا
  @Delete(':id')
  @Permissions('payroll:manage') // للحماية، نجعل الحذف للأدمن فقط
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.payrollService.deletePayroll(req.user.hospitalId, id);
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
//   Req,
// } from '@nestjs/common';
// import { PayrollService } from './payroll.service';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { PermissionsGuard } from '../auth/permissions.guard';
// import { Permissions } from '../auth/permissions.decorator';
// @UseGuards(JwtAuthGuard, PermissionsGuard)
// @Controller('payroll')
// @Permissions('payroll:manage')
// export class PayrollController {
//   constructor(private readonly payrollService: PayrollService) {}

//   @Post('generate')
//   async generate(
//     @Req() req: any,
//     @Body() body: { month: number; year: number },
//   ) {
//     return this.payrollService.generatePayroll(
//       req.user.hospitalId,
//       req.user.sub,
//       body.month,
//       body.year,
//     );
//   }

//   @Get()
//   async findAll(@Req() req: any) {
//     return this.payrollService.findAll(req.user.hospitalId);
//   }

//   @Get(':id')
//   async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
//     return this.payrollService.findOne(req.user.hospitalId, id);
//   }

//   @Post(':id/approve')
//   async approve(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
//     return this.payrollService.approvePayroll(
//       req.user.hospitalId,
//       id,
//       req.user.sub,
//     );
//   }
// }
