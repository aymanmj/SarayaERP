import type { Request } from 'express';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { PatientGovernanceService } from './patient-governance.service';
import {
  RecordPatientDeathDto,
  RequestDeathReversalDto,
  RequestPatientMergeDto,
  ReviewDeathReversalDto,
  ReviewPatientMergeDto,
  UnmergePatientDto,
} from './dto/patient-governance.dto';

@ApiTags('patients-governance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('patients/governance')
export class PatientGovernanceController {
  constructor(private readonly governanceService: PatientGovernanceService) {}

  @Get('merges')
  @Permissions('patients:view')
  listMerges(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.governanceService.listMerges(user.hospitalId, status);
  }

  @Post('merges')
  @Permissions('patients:merge:request')
  @AuditInTransaction()
  requestMerge(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestPatientMergeDto,
    @Req() req: Request,
  ) {
    return this.governanceService.requestMerge(user.hospitalId, user.sub, dto, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Post('merges/:id/review')
  @Permissions('patients:merge:approve')
  @AuditInTransaction()
  reviewMerge(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewPatientMergeDto,
    @Req() req: Request,
  ) {
    return this.governanceService.reviewMerge(
      user.hospitalId,
      id,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Post('merges/:id/unmerge')
  @Permissions('patients:merge:approve')
  @AuditInTransaction()
  unmerge(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UnmergePatientDto,
    @Req() req: Request,
  ) {
    return this.governanceService.unmerge(user.hospitalId, id, user.sub, dto, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Get(':patientId/status')
  @Permissions('patients:view')
  getStatus(
    @CurrentUser() user: JwtPayload,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.governanceService.getPatientGovernanceStatus(
      user.hospitalId,
      patientId,
    );
  }

  @Post(':patientId/death')
  @Permissions('patients:death:record')
  @AuditInTransaction()
  recordDeath(
    @CurrentUser() user: JwtPayload,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: RecordPatientDeathDto,
    @Req() req: Request,
  ) {
    return this.governanceService.recordDeath(
      user.hospitalId,
      patientId,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Post(':patientId/death/reversal-request')
  @Permissions('patients:death:reverse')
  @AuditInTransaction()
  requestDeathReversal(
    @CurrentUser() user: JwtPayload,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: RequestDeathReversalDto,
    @Req() req: Request,
  ) {
    return this.governanceService.requestDeathReversal(
      user.hospitalId,
      patientId,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Post(':patientId/death/reversal-review/:eventId')
  @Permissions('patients:death:reverse')
  @AuditInTransaction()
  reviewDeathReversal(
    @CurrentUser() user: JwtPayload,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: ReviewDeathReversalDto,
    @Req() req: Request,
  ) {
    return this.governanceService.reviewDeathReversal(
      user.hospitalId,
      patientId,
      eventId,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }
}
