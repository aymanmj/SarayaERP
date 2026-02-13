import { Controller, Get, Post, Body, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ObstetricHistoryService } from '../services/obstetric-history.service';
import { CreateObstetricHistoryDto } from '../dto/create-obstetric-history.dto';
import { UpdateObstetricHistoryDto } from '../dto/update-obstetric-history.dto';

@Controller('obgyn/history')
export class ObstetricHistoryController {
  constructor(private readonly historyService: ObstetricHistoryService) {}

  @Post()
  create(@Body() dto: CreateObstetricHistoryDto) {
    return this.historyService.create(dto);
  }

  @Get(':patientId')
  findOne(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.historyService.findOneByPatientId(patientId);
  }

  @Put('patient/:patientId')
  update(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: UpdateObstetricHistoryDto,
  ) {
    return this.historyService.updateByPatientId(patientId, dto);
  }
}
