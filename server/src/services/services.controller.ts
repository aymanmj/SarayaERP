import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { ServiceType } from '@prisma/client';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  async list(@Req() req: any, @Query('type') type?: ServiceType) {
    return this.servicesService.findAll(req.user.hospitalId, type);
  }

  @Get('categories')
  async listCategories(@Req() req: any) {
    return this.servicesService.findAllCategories(req.user.hospitalId);
  }

  @Post('categories')
  @Permissions('services:manage')
  async createCategory(@Req() req: any, @Body() body: any) {
    return this.servicesService.createCategory(req.user.hospitalId, {
      name: body.name,
      description: body.description,
    });
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.servicesService.findOne(req.user.hospitalId, id);
  }

  @Post()
  @Permissions('services:manage')
  async create(@Req() req: any, @Body() body: any) {
    return this.servicesService.create(req.user.hospitalId, {
      code: body.code,
      name: body.name,
      type: body.type,
      defaultPrice: Number(body.defaultPrice),
      categoryId: body.categoryId ? Number(body.categoryId) : undefined,
    });
  }

  @Patch(':id')
  @Permissions('services:manage')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.servicesService.update(req.user.hospitalId, id, {
      name: body.name,
      defaultPrice:
        body.defaultPrice !== undefined ? Number(body.defaultPrice) : undefined,
      categoryId:
        body.categoryId !== undefined
          ? body.categoryId
            ? Number(body.categoryId)
            : null
          : undefined,
      isActive: body.isActive,
    });
  }

  // =====================================================================
  // Material Mappings (Service-to-Item)
  // =====================================================================

  @Get(':id/materials')
  async getMaterials(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.getMaterialMappings(id);
  }

  @Post(':id/materials')
  @Permissions('services:manage')
  async addMaterial(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.servicesService.addMaterialMapping(id, {
      productId: Number(body.productId),
      quantity: Number(body.quantity),
      isMandatory: body.isMandatory,
    });
  }

  @Patch('materials/:mappingId')
  @Permissions('services:manage')
  async updateMaterial(
    @Param('mappingId', ParseIntPipe) mappingId: number,
    @Body() body: any,
  ) {
    return this.servicesService.updateMaterialMapping(mappingId, {
      quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
      isMandatory: body.isMandatory,
    });
  }

  @Delete('materials/:mappingId')
  @Permissions('services:manage')
  async removeMaterial(@Param('mappingId', ParseIntPipe) mappingId: number) {
    return this.servicesService.removeMaterialMapping(mappingId);
  }

  // =====================================================================
  // Bundle Items (Charge Explosion)
  // =====================================================================

  @Get(':id/bundle')
  async getBundleItems(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.getBundleItems(id);
  }

  @Post(':id/bundle')
  @Permissions('services:manage')
  async addBundleItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.servicesService.addBundleItem(id, {
      childServiceId: Number(body.childServiceId),
      quantity: body.quantity ? Number(body.quantity) : undefined,
    });
  }

  @Delete('bundle/:bundleItemId')
  @Permissions('services:manage')
  async removeBundleItem(
    @Param('bundleItemId', ParseIntPipe) bundleItemId: number,
  ) {
    return this.servicesService.removeBundleItem(bundleItemId);
  }
}
