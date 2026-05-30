import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @Permissions('inventory:manage')
  async createWarehouse(@Req() req: any, @Body() data: any) {
    return this.warehouseService.createWarehouse(req.user.hospitalId, data);
  }

  @Get()
  @Permissions('inventory:view')
  async listWarehouses(@Req() req: any) {
    return this.warehouseService.listWarehouses(req.user.hospitalId);
  }

  @Get(':id')
  @Permissions('inventory:view')
  async getWarehouse(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.warehouseService.getWarehouse(req.user.hospitalId, id);
  }

  @Put(':id')
  @Permissions('inventory:manage')
  async updateWarehouse(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: any,
  ) {
    return this.warehouseService.updateWarehouse(req.user.hospitalId, id, data);
  }

  // --- ZONES ---
  @Post(':id/zones')
  @Permissions('inventory:manage')
  async createZone(
    @Req() req: any,
    @Param('id', ParseIntPipe) warehouseId: number,
    @Body() data: any,
  ) {
    return this.warehouseService.createZone(
      req.user.hospitalId,
      warehouseId,
      data,
    );
  }

  @Put('zones/:zoneId')
  @Permissions('inventory:manage')
  async updateZone(
    @Req() req: any,
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @Body() data: any,
  ) {
    return this.warehouseService.updateZone(req.user.hospitalId, zoneId, data);
  }

  @Delete('zones/:zoneId')
  @Permissions('inventory:manage')
  async deleteZone(
    @Req() req: any,
    @Param('zoneId', ParseIntPipe) zoneId: number,
  ) {
    return this.warehouseService.deleteZone(req.user.hospitalId, zoneId);
  }

  // --- BINS ---
  @Post('zones/:zoneId/bins')
  @Permissions('inventory:manage')
  async createBin(
    @Req() req: any,
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @Body() data: any,
  ) {
    return this.warehouseService.createBin(req.user.hospitalId, zoneId, data);
  }

  @Put('bins/:binId')
  @Permissions('inventory:manage')
  async updateBin(
    @Req() req: any,
    @Param('binId', ParseIntPipe) binId: number,
    @Body() data: any,
  ) {
    return this.warehouseService.updateBin(req.user.hospitalId, binId, data);
  }

  @Delete('bins/:binId')
  @Permissions('inventory:manage')
  async deleteBin(
    @Req() req: any,
    @Param('binId', ParseIntPipe) binId: number,
  ) {
    return this.warehouseService.deleteBin(req.user.hospitalId, binId);
  }
}
