import {
  Body,
  Controller,
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
}
