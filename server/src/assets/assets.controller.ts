import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { TicketStatus, MaintenanceType } from '@prisma/client';
import { RequireFeature } from '../licensing/license.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assets')
@RequireFeature('ASSETS')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  // --- Assets CRUD ---
  @Post()
  @Permissions('assets:manage')
  async createAsset(@Req() req: any, @Body() body: any) {
    return this.assetsService.registerAsset({
      hospitalId: req.user.hospitalId,
      name: body.name,
      tagNumber: body.tagNumber,
      serialNumber: body.serialNumber,
      purchaseDate: new Date(body.purchaseDate),
      purchaseCost: Number(body.purchaseCost),
      usefulLifeYears: Number(body.usefulLifeYears),
      salvageValue: body.salvageValue ? Number(body.salvageValue) : 0,
      departmentId: body.departmentId ? Number(body.departmentId) : undefined,
    });
  }

  @Get()
  @Permissions('assets:manage')
  async listAssets(@Req() req: any, @Query('q') q?: string) {
    return this.assetsService.getAssets(req.user.hospitalId, q);
  }

  // --- Depreciation ---
  @Post('depreciation/run')
  @Permissions('assets:manage')
  async runDepreciation(@Req() req: any, @Body() body: { date: string }) {
    // تشغيل الإهلاك لتاريخ معين (عادة نهاية الشهر)
    return this.assetsService.runDepreciationForPeriod(
      req.user.hospitalId,
      req.user.sub,
      new Date(body.date),
    );
  }

  // --- Maintenance ---
  @Post('maintenance')
  @Permissions('assets:view') // أي شخص يمكنه الإبلاغ عن عطل
  async createTicket(@Req() req: any, @Body() body: any) {
    return this.assetsService.createMaintenanceTicket({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      assetId: Number(body.assetId),
      type: body.type as MaintenanceType,
      priority: body.priority,
      issueDescription: body.issueDescription,
    });
  }

  @Get('maintenance')
  @Permissions('assets:manage')
  async getTickets(@Req() req: any, @Query('status') status?: string) {
    return this.assetsService.getTickets(
      req.user.hospitalId,
      status as TicketStatus,
    );
  }

  @Patch('maintenance/:id/resolve')
  @Permissions('assets:manage')
  async resolveTicket(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.assetsService.resolveTicket({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      ticketId: id,
      notes: body.notes,
      cost: Number(body.cost || 0),
      newStatus: body.status as TicketStatus,
    });
  }
}
