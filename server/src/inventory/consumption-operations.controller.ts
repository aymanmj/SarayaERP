import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  Injectable,
  NotFoundException,
  ConflictException,
  Header,
  Put,
  BadRequestException,
} from '@nestjs/common';
import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';

class ListConsumptionsDto {
  @IsOptional() @IsIn(['PENDING', 'FAILED', 'COMPLETED']) status?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  before?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
class RetryConsumptionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
class WarehousePolicyDto extends RetryConsumptionDto {
  @IsInt() @Min(1) @Max(2147483647) warehouseId!: number;
}
@Injectable()
export class ConsumptionOperationsService {
  constructor(private readonly prisma: PrismaService) {}
  async policy(hospitalId: number) {
    return (
      (await this.prisma.consumptionWarehousePolicy.findUnique({
        where: { hospitalId },
      })) ?? { hospitalId, warehouseId: null }
    );
  }
  async configure(hospitalId: number, userId: number, dto: WarehousePolicyDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      if (
        !(await tx.warehouse.findFirst({
          where: { id: dto.warehouseId, hospitalId, isActive: true },
        }))
      )
        throw new BadRequestException('المخزن غير نشط أو خارج المنشأة');
      const old = await tx.consumptionWarehousePolicy.findUnique({
        where: { hospitalId },
      });
      const result = await tx.consumptionWarehousePolicy.upsert({
        where: { hospitalId },
        create: {
          hospitalId,
          warehouseId: dto.warehouseId,
          updatedById: userId,
        },
        update: { warehouseId: dto.warehouseId, updatedById: userId },
      });
      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'CONFIGURE_CONSUMPTION_WAREHOUSE',
        entity: 'ConsumptionWarehousePolicy',
        entityId: result.id,
        details: {
          reason: dto.reason,
          previousWarehouseId: old?.warehouseId ?? null,
          warehouseId: dto.warehouseId,
        },
      });
      return result;
    });
  }
  async list(hospitalId: number, query: ListConsumptionsDto) {
    const rows = await this.prisma.serviceMaterialConsumption.findMany({
      where: {
        hospitalId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: {
        id: true,
        serviceItemId: true,
        referenceType: true,
        referenceId: true,
        warehouseId: true,
        userId: true,
        status: true,
        attempts: true,
        nextRetryAt: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });
    const items = rows.slice(0, query.limit);
    return {
      items,
      nextCursor: rows.length > query.limit ? items[items.length - 1].id : null,
    };
  }
  async retry(hospitalId: number, id: number, userId: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      const operation = await tx.serviceMaterialConsumption.findFirst({
        where: { id, hospitalId },
      });
      if (!operation) throw new NotFoundException('عملية الاستهلاك غير موجودة');
      if (operation.status !== 'FAILED')
        throw new ConflictException('يمكن إعادة جدولة العمليات الفاشلة فقط');
      await tx.serviceMaterialConsumption.update({
        where: { id },
        data: {
          status: 'PENDING',
          attempts: 0,
          error: null,
          nextRetryAt: new Date(),
        },
      });
      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'REQUEUE_SERVICE_CONSUMPTION',
        entity: 'ServiceMaterialConsumption',
        entityId: id,
        details: {
          reason,
          previousAttempts: operation.attempts,
          previousError: operation.error,
          originalUserId: operation.userId,
        },
      });
      return { id, status: 'PENDING' };
    });
  }
}
@Controller('inventory/consumption-operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConsumptionOperationsController {
  constructor(private readonly operations: ConsumptionOperationsService) {}
  @Get('source-policy')
  @Header('Cache-Control', 'no-store')
  @Permissions('inventory:view')
  policy(@CurrentUser() user: JwtPayload) {
    return this.operations.policy(user.hospitalId);
  }
  @Put('source-policy')
  @Permissions('inventory:manage')
  configure(@CurrentUser() user: JwtPayload, @Body() dto: WarehousePolicyDto) {
    return this.operations.configure(user.hospitalId, user.sub, dto);
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  @Permissions('inventory:view')
  list(@CurrentUser() user: JwtPayload, @Query() query: ListConsumptionsDto) {
    return this.operations.list(user.hospitalId, query);
  }
  @Post(':id/retry')
  @Permissions('inventory:manage')
  retry(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RetryConsumptionDto,
  ) {
    return this.operations.retry(
      user.hospitalId,
      id,
      user.sub,
      dto.reason.trim(),
    );
  }
}
