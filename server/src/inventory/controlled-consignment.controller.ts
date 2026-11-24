import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { ControlledConsignmentService } from './controlled-consignment.service';
import {
  ConsumeConsignmentDto,
  ReceiveConsignmentDto,
  RecordControlledTransactionDto,
  RequestWardReturnDto,
  ReturnConsignmentToSupplierDto,
  ReviewWardReturnDto,
} from './dto/controlled-consignment.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory/governance')
export class ControlledConsignmentController {
  constructor(
    private readonly governanceService: ControlledConsignmentService,
  ) {}

  @Get('controlled-logs')
  @Permissions('inventory:view', 'pharmacy:view')
  listControlledLogs(
    @CurrentUser() user: JwtPayload,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('batchNumber') batchNumber?: string,
  ) {
    return this.governanceService.listControlledLogs(user.hospitalId, {
      ...(warehouseId ? { warehouseId: Number(warehouseId) } : {}),
      ...(productId ? { productId: Number(productId) } : {}),
      ...(batchNumber ? { batchNumber } : {}),
    });
  }

  @Post('controlled-logs')
  @AuditInTransaction()
  @Permissions('inventory:manage', 'pharmacy:manage')
  recordControlledTransaction(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordControlledTransactionDto,
  ) {
    return this.governanceService.recordControlledTransaction(
      user.hospitalId,
      user.sub,
      dto,
    );
  }

  @Get('controlled-logs/verify')
  @Permissions('inventory:view', 'pharmacy:view')
  verifyControlledChain(
    @CurrentUser() user: JwtPayload,
    @Query('warehouseId', ParseIntPipe) warehouseId: number,
    @Query('productId', ParseIntPipe) productId: number,
    @Query('batchNumber') batchNumber: string,
  ) {
    return this.governanceService.verifyControlledChain(
      user.hospitalId,
      warehouseId,
      productId,
      batchNumber ?? '',
    );
  }

  @Get('consignments')
  @Permissions('inventory:view', 'pharmacy:view')
  listConsignments(@CurrentUser() user: JwtPayload) {
    return this.governanceService.listConsignments(user.hospitalId);
  }

  @Post('consignments')
  @AuditInTransaction()
  @Permissions('inventory:manage', 'pharmacy:manage')
  receiveConsignment(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReceiveConsignmentDto,
  ) {
    return this.governanceService.receiveConsignment(
      user.hospitalId,
      user.sub,
      dto,
    );
  }

  @Post('consignments/:id/consume')
  @AuditInTransaction()
  @Permissions('inventory:manage', 'pharmacy:manage')
  consumeConsignment(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConsumeConsignmentDto,
  ) {
    return this.governanceService.consumeConsignment(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }

  @Post('consignments/:id/return-supplier')
  @AuditInTransaction()
  @Permissions('inventory:manage', 'pharmacy:manage')
  returnConsignmentToSupplier(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnConsignmentToSupplierDto,
  ) {
    return this.governanceService.returnConsignmentToSupplier(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }

  @Get('ward-returns')
  @Permissions('inventory:view', 'pharmacy:view')
  listWardReturns(@CurrentUser() user: JwtPayload) {
    return this.governanceService.listWardReturns(user.hospitalId);
  }

  @Post('ward-returns')
  @AuditInTransaction()
  @Permissions('inventory:manage', 'pharmacy:manage')
  requestWardReturn(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestWardReturnDto,
  ) {
    return this.governanceService.requestWardReturn(
      user.hospitalId,
      user.sub,
      dto,
    );
  }

  @Post('ward-returns/:id/review')
  @AuditInTransaction()
  @Permissions('inventory:manage', 'pharmacy:manage')
  reviewWardReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewWardReturnDto,
  ) {
    return this.governanceService.reviewWardReturn(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }
}
