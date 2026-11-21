import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Body,
  Param,
  Put,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import {
  CreateInventoryCountDto,
  UpdateCountLineDto,
  UpdateCountStatusDto,
  CountScopeDto,
} from './dto/count.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';

@Controller('inventory/counts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryCountController {
  constructor(private readonly service: InventoryCountService) {}

  private resolveHospitalId(user: JwtPayload, requestedHospitalId?: number) {
    if (requestedHospitalId == null) {
      return user.hospitalId;
    }

    if (user.isSuperAdmin) {
      return requestedHospitalId;
    }

    if (requestedHospitalId !== user.hospitalId) {
      throw new ForbiddenException('Hospital scope mismatch');
    }

    return user.hospitalId;
  }

  @Permissions('inventory:manage')
  @AuditInTransaction()
  @Post()
  create(
    @Body() dto: CreateInventoryCountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createDraftCount({
      hospitalId: this.resolveHospitalId(user, dto.hospitalId),
      warehouseId: dto.warehouseId,
      type: dto.type,
      notes: dto.notes,
      userId: user.sub,
    });
  }

  @Permissions('inventory:view')
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: CountScopeDto) {
    return this.service.findAll(this.resolveHospitalId(user, query.hospitalId));
  }

  @Permissions('inventory:view')
  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CountScopeDto,
  ) {
    return this.service.getCount(
      id,
      this.resolveHospitalId(user, query.hospitalId),
    );
  }

  @Permissions('inventory:manage')
  @AuditInTransaction()
  @Put(':id/lines/:lineId')
  updateLine(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() body: UpdateCountLineDto,
  ) {
    return this.service.updateLine(
      id,
      lineId,
      body.physicalQty,
      body.revision,
      user.sub,
      user.hospitalId,
    );
  }

  @Permissions('inventory:manage')
  @AuditInTransaction()
  @Put(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCountStatusDto,
  ) {
    return this.service.updateStatus(
      id,
      body.status,
      user.hospitalId,
      user.sub,
    );
  }

  @Permissions('inventory:counts:post')
  @AuditInTransaction()
  @Post(':id/post')
  postCount(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.postCount(id, user.sub, user.hospitalId);
  }

  @Permissions('inventory:view')
  @Get('dashboard/stats')
  getDashboardStats(
    @CurrentUser() user: JwtPayload,
    @Query() query: CountScopeDto,
  ) {
    return this.service.getDashboardStats(
      this.resolveHospitalId(user, query.hospitalId),
      query.warehouseId,
    );
  }
}
