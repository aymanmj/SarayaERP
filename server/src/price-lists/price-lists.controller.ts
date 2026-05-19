import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PriceListsService } from './price-lists.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('price-lists')
export class PriceListsController {
  constructor(private readonly service: PriceListsService) {}

  @Get()
  async findAll(@Req() req: any) {
    return this.service.findAll(req.user.hospitalId);
  }

  @Post()
  @Permissions('price-lists:manage')
  async create(@Req() req: any, @Body() body: any) {
    return this.service.create(req.user.hospitalId, body);
  }

  // إضافة/تحديث سعر خدمة داخل قائمة
  @Post(':id/items')
  @Permissions('price-lists:manage')
  async upsertItem(
    @Param('id', ParseIntPipe) listId: number,
    @Body() body: { serviceItemId: number; price: number },
  ) {
    return this.service.upsertServicePrice(
      listId,
      body.serviceItemId,
      body.price,
    );
  }

  @Get(':id/items')
  async getItems(@Param('id', ParseIntPipe) listId: number) {
    return this.service.getListItems(listId);
  }
}
