// src/lab-orders/lab-orders.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LabOrdersService } from './lab-orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('encounters/:encounterId/lab-orders')
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Permissions('lab-orders:view')
  @Get()
  async listForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    return this.labOrdersService.listForEncounter(encounterId);
  }

  @Permissions('lab-orders:manage')
  @Post()
  async createForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @CurrentUser() user: any,
    @Body()
    body: {
      testIds: number[];
      notes?: string;
    },
  ) {
    const created = await this.labOrdersService.createForEncounter({
      encounterId,
      hospitalId: user.hospitalId,
      doctorId: user.sub,
      testIds: body.testIds,
      notes: body.notes,
    });

    return created;
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lab-orders')
export class LabOrdersGeneralController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Permissions('lab-orders:view')
  @Get('worklist')
  async worklist(@CurrentUser() user: any) {
    return this.labOrdersService.getWorklist(user.hospitalId);
  }
}
