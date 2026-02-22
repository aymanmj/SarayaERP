import { Controller, Get, Post, Body, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ObstetricHistoryService } from '../services/obstetric-history.service';
import { CreateObstetricHistoryDto } from '../dto/create-obstetric-history.dto';
import { UpdateObstetricHistoryDto } from '../dto/update-obstetric-history.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('obgyn/history')
export class ObstetricHistoryController {
  constructor(private readonly historyService: ObstetricHistoryService) {}

  @Post()
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  create(@Body() dto: CreateObstetricHistoryDto) {
    return this.historyService.create(dto);
  }

  @Get(':patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION')
  findOne(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.historyService.findOneByPatientId(patientId);
  }

  @Put('patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  update(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: UpdateObstetricHistoryDto,
  ) {
    return this.historyService.updateByPatientId(patientId, dto);
  }
}
