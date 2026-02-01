// src/lab-orders/lab-orders.controller.ts


import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,

  UseGuards,
  Req,
} from '@nestjs/common';
import { LabOrdersService } from './lab-orders.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('encounters/:encounterId/lab-orders')
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  // GET /encounters/:encounterId/lab-orders
  // يرجع مصفوفة LabOrderDto (بدون success wrapper)
  @Get()
  async listForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    return this.labOrdersService.listForEncounter(encounterId);
  }

  // POST /encounters/:encounterId/lab-orders
  // body: { hospitalId, doctorId, testIds, notes? }
  @Post()
  async createForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Body()
    body: {
      hospitalId: number;
      doctorId: number;
      testIds: number[];
      notes?: string;
    },
  ) {
    const { hospitalId, doctorId, testIds, notes } = body;

    // نمرر encounterId من الـ params مع باقي البيانات
    const created = await this.labOrdersService.createForEncounter({
      encounterId,
      hospitalId,
      doctorId,
      testIds,
      notes,
    });

    // الفرونت حالياً لا يعتمد على الـ response body، لكن نرجّعها كمرجع
    return created;
  }
  // ✅ [PAYWALL] Worklist Endpoint moved to global controller
}

@UseGuards(JwtAuthGuard)
@Controller('lab-orders')
export class LabOrdersGeneralController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Get('worklist')
  async worklist(@Req() req: any) {
    return this.labOrdersService.getWorklist(req.user.hospitalId);
  }
}
