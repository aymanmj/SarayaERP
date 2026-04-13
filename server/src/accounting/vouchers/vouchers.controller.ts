import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto, UpdateVoucherDto } from './dto/voucher.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('accounting/vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  create(@Request() req, @Body() createVoucherDto: CreateVoucherDto) {
    return this.vouchersService.create(req.user.hospitalId, req.user.sub, createVoucherDto);
  }

  @Get()
  findAll(@Request() req, @Query() query: any) {
    return this.vouchersService.findAll(req.user.hospitalId, query);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.vouchersService.findOne(req.user.hospitalId, +id);
  }

  @Put(':id')
  update(@Request() req, @Param('id') id: string, @Body() updateVoucherDto: UpdateVoucherDto) {
    return this.vouchersService.update(req.user.hospitalId, +id, updateVoucherDto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.vouchersService.remove(req.user.hospitalId, +id);
  }

  @Post(':id/post')
  postVoucher(@Request() req, @Param('id') id: string) {
    return this.vouchersService.post(req.user.hospitalId, +id, req.user.sub);
  }

  @Post(':id/cancel')
  cancelVoucher(@Request() req, @Param('id') id: string) {
    return this.vouchersService.cancel(req.user.hospitalId, +id, req.user.sub);
  }
}
