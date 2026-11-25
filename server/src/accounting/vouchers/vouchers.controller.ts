import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto, UpdateVoucherDto } from './dto/voucher.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt-payload.type';
import { AuditInTransaction } from '../../audit/audit.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('accounting/vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Permissions('accounting:manage')
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() createVoucherDto: CreateVoucherDto,
  ) {
    return this.vouchersService.create(
      user.hospitalId,
      user.sub,
      createVoucherDto,
    );
  }

  @Permissions('accounting:view')
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query()
    query: { type?: string; status?: string; from?: string; to?: string },
  ) {
    return this.vouchersService.findAll(user.hospitalId, query);
  }

  @Permissions('accounting:view')
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vouchersService.findOne(user.hospitalId, +id);
  }

  @Permissions('accounting:manage')
  @Put(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() updateVoucherDto: UpdateVoucherDto,
  ) {
    return this.vouchersService.update(user.hospitalId, +id, updateVoucherDto);
  }

  @Permissions('accounting:manage')
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vouchersService.remove(user.hospitalId, +id);
  }

  @Permissions('accounting:manage')
  @AuditInTransaction()
  @Post(':id/post')
  postVoucher(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vouchersService.post(user.hospitalId, +id, user.sub);
  }

  @Permissions('accounting:manage')
  @AuditInTransaction()
  @Post(':id/cancel')
  cancelVoucher(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vouchersService.cancel(user.hospitalId, +id, user.sub);
  }
}
