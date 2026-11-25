// server/src/labs/lab-qc.controller.ts
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
import { LabQcService } from './lab-qc.service';
import {
  CreateLabQcLotDto,
  RecordLabQcRunDto,
  ReviewLabQcRunDto,
} from './dto/lab-qc.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lab/qc')
export class LabQcController {
  constructor(private readonly labQc: LabQcService) {}

  @Get('lots')
  @Permissions('lab:view')
  listLots(@CurrentUser() user: JwtPayload, @Query('testId') testId?: string) {
    return this.labQc.listLots(
      user.hospitalId,
      testId ? Number(testId) : undefined,
    );
  }

  @Post('lots')
  @AuditInTransaction()
  @Permissions('lab:manage')
  createLot(@CurrentUser() user: JwtPayload, @Body() dto: CreateLabQcLotDto) {
    return this.labQc.createLot(user.hospitalId, user.sub, dto);
  }

  @Post('runs')
  @AuditInTransaction()
  @Permissions('lab:manage')
  recordRun(@CurrentUser() user: JwtPayload, @Body() dto: RecordLabQcRunDto) {
    return this.labQc.recordRun(user.hospitalId, user.sub, dto);
  }

  @Post('runs/:id/review')
  @AuditInTransaction()
  @Permissions('lab:manage')
  reviewRun(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewLabQcRunDto,
  ) {
    return this.labQc.reviewRun(user.hospitalId, id, user.sub, dto);
  }

  @Get('lots/:id/levey-jennings')
  @Permissions('lab:view')
  getLeveyJennings(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.labQc.getLeveyJennings(
      user.hospitalId,
      id,
      limit ? Number(limit) : 60,
    );
  }
}
