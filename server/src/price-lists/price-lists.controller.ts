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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('price-lists')
export class PriceListsController {
  constructor(private readonly service: PriceListsService) {}

  @Get()
  async findAll(@Req() req: any) {
    return this.service.findAll(req.user.hospitalId);
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
  async create(@Req() req: any, @Body() body: any) {
    return this.service.create(req.user.hospitalId, body);
  }

  // إضافة/تحديث سعر خدمة داخل قائمة
  @Post(':id/items')
  @Roles('ADMIN', 'ACCOUNTANT')
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
