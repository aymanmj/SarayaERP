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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ServiceType } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  async list(@Req() req: any, @Query('type') type?: ServiceType) {
    return this.servicesService.findAll(req.user.hospitalId, type);
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
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

  @Patch(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.servicesService.update(req.user.hospitalId, id, {
      name: body.name,
      defaultPrice:
        body.defaultPrice !== undefined ? Number(body.defaultPrice) : undefined,
      isActive: body.isActive,
    });
  }
}
