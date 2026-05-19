import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ObstetricHistoryService } from '../services/obstetric-history.service';
import { CreateObstetricHistoryDto } from '../dto/create-obstetric-history.dto';
import { UpdateObstetricHistoryDto } from '../dto/update-obstetric-history.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { Permissions } from '../../../auth/permissions.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('obgyn/history')
export class ObstetricHistoryController {
  constructor(private readonly historyService: ObstetricHistoryService) {}

  @Permissions('obgyn:manage')
  @Post()
  create(@Body() dto: CreateObstetricHistoryDto) {
    return this.historyService.create(dto);
  }

  @Permissions('obgyn:view')
  @Get(':patientId')
  findOne(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.historyService.findOneByPatientId(patientId);
  }

  @Permissions('obgyn:manage')
  @Put('patient/:patientId')
  update(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: UpdateObstetricHistoryDto,
  ) {
    return this.historyService.updateByPatientId(patientId, dto);
  }
}

