import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AntenatalCareService } from '../services/antenatal-care.service';
import {
  CreateAntenatalCareDto,
  CreateAntenatalVisitDto,
} from '../dto/antenatal-care.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { Permissions } from '../../../auth/permissions.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { JwtPayload } from '../../../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('obgyn/anc')
export class AntenatalCareController {
  constructor(private readonly ancService: AntenatalCareService) {}

  /** تسجيل حمل جديد */
  @Permissions('obgyn:manage')
  @Post()
  async create(
    @Body() dto: CreateAntenatalCareDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ancService.createCare(user.hospitalId, dto);
  }

  /** إضافة زيارة متابعة */
  @Permissions('obgyn:manage')
  @Post('visits')
  async addVisit(
    @Body() dto: CreateAntenatalVisitDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ancService.addVisit(user.hospitalId, dto);
  }

  /** تحديث Rh الزوج */
  @Permissions('obgyn:manage')
  @Patch(':id/partner-rh')
  async updatePartnerRh(
    @Param('id', ParseIntPipe) id: number,
    @Body('partnerRhFactor') partnerRhFactor: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ancService.updatePartnerRh(
      user.hospitalId,
      id,
      partnerRhFactor,
      user.sub,
    );
  }

  /** تسجيل حقنة Anti-D */
  @Permissions('obgyn:manage')
  @Patch(':id/anti-d')
  async recordAntiD(
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: 'week28' | 'postpartum',
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ancService.recordAntiD(user.hospitalId, id, type);
  }

  /** جلب سجلات حمل لمريضة */
  @Permissions('obgyn:view')
  @Get('patient/:patientId')
  async getByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.ancService.findByPatient(patientId);
  }

  /** جلب سجل حمل معين مع الزيارات */
  @Permissions('obgyn:view')
  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ancService.findOne(user.hospitalId, id);
  }

  /** جلب جميع الحوامل النشطات */
  @Permissions('obgyn:view')
  @Get()
  async getActive(@CurrentUser() user: JwtPayload) {
    return this.ancService.findActivePregnancies(user.hospitalId);
  }

  /** تحديث حالة الحمل (ولادة / إجهاض / إلخ) */
  @Permissions('obgyn:manage')
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status')
    status: 'DELIVERED' | 'MISCARRIAGE' | 'ECTOPIC' | 'CANCELLED',
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ancService.updateStatus(user.hospitalId, id, status);
  }
}
