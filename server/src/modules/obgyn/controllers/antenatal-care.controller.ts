import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AntenatalCareService } from '../services/antenatal-care.service';
import { CreateAntenatalCareDto, CreateAntenatalVisitDto } from '../dto/antenatal-care.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { JwtPayload } from '../../../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('obgyn/anc')
export class AntenatalCareController {
  constructor(private readonly ancService: AntenatalCareService) {}

  /** تسجيل حمل جديد */
  @Post()
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async create(@Body() dto: CreateAntenatalCareDto, @CurrentUser() user: JwtPayload) {
    return this.ancService.createCare(user.hospitalId, dto);
  }

  /** إضافة زيارة متابعة */
  @Post('visits')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async addVisit(@Body() dto: CreateAntenatalVisitDto, @CurrentUser() user: JwtPayload) {
    return this.ancService.addVisit(user.hospitalId, dto);
  }

  /** جلب سجلات حمل لمريضة */
  @Get('patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION')
  async getByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.ancService.findByPatient(patientId);
  }

  /** جلب سجل حمل معين مع الزيارات */
  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.ancService.findOne(user.hospitalId, id);
  }

  /** جلب جميع الحوامل النشطات */
  @Get()
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getActive(@CurrentUser() user: JwtPayload) {
    return this.ancService.findActivePregnancies(user.hospitalId);
  }

  /** تحديث حالة الحمل (ولادة / إجهاض / إلخ) */
  @Patch(':id/status')
  @Roles('ADMIN', 'DOCTOR')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'DELIVERED' | 'MISCARRIAGE' | 'ECTOPIC' | 'CANCELLED',
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ancService.updateStatus(user.hospitalId, id, status);
  }
}
