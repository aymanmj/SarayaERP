import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Sensitive } from '../audit/audit.decorator';

import { EncountersService } from './encounters.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { Type } from 'class-transformer';
import { EncounterType, EncounterStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

class CreateEncounterDto {
  @IsInt()
  @Min(1)
  patientId: number;

  @IsEnum(EncounterType)
  type: EncounterType; // OPD | ER | IPD

  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  doctorId?: number;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;
}

class ListEncountersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  patientId: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('encounters')
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  // الاستقبال أو الادمن يفتح Encounter
  @Post()
  @Roles('ADMIN', 'RECEPTION')
  create(@Body() dto: CreateEncounterDto, @CurrentUser() user: JwtPayload) {
    return this.encountersService.createEncounter(user.hospitalId, {
      patientId: dto.patientId,
      type: dto.type,
      departmentId: dto.departmentId,
      doctorId: dto.doctorId,
      chiefComplaint: dto.chiefComplaint,
    });
  }

  // جلب Encounter واحد بتفاصيله
  // @Get(':id')
  // @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE')
  // getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  //   const encId = Number(id);
  //   if (!encId || Number.isNaN(encId)) {
  //     throw new BadRequestException('رقم Encounter غير صحيح');
  //   }

  //   return this.encountersService.getEncounterById(user.hospitalId, encId);
  // }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE')
  @Sensitive('VIEW_ENCOUNTER_DETAILS')
  async getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const encId = Number(id);
    if (!encId) throw new BadRequestException('رقم Encounter غير صحيح');

    const encounter = await this.encountersService.getEncounterById(
      user.hospitalId,
      encId,
    );

    // ✅ التعديل الأمني: التحقق من ملكية الملف
    // جلب Encounter واحد بتفاصيله
    const isDoctor = user.roles.includes('DOCTOR');
    const isAdmin = user.roles.includes('ADMIN');

    // إذا كان طبيباً، والملف ليس له، ولم يتم تحويله إليه -> نمنع الوصول
    // ملاحظة: قد نحتاج لسماحية في حالات الطوارئ، لكن هذا تطبيق صارم حسب طلبك
    if (isDoctor && !isAdmin) {
      if (encounter.doctorId && encounter.doctorId !== user.sub) {
        // يمكن إضافة استثناء هنا لو الطبيب استشاري أو رئيس قسم
        throw new BadRequestException(
          'لا تملك صلاحية الاطلاع على ملف مريض يتابع مع طبيب آخر.',
        );
      }
    }

    return encounter;
  }

  // جلب كل Encounters لمريض معيّن
  // @Get()
  // @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE')
  // listForPatient(
  //   @Query() query: ListEncountersQueryDto,
  //   @CurrentUser() user: JwtPayload,
  // ) {
  //   return this.encountersService.listForPatient(
  //     user.hospitalId,
  //     query.patientId,
  //   );
  // }

  // إغلاق Encounter
  @Patch(':id/close')
  @Roles('ADMIN', 'RECEPTION')
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const encId = Number(id);
    if (!encId || Number.isNaN(encId)) {
      throw new BadRequestException('رقم Encounter غير صحيح');
    }

    return this.encountersService.closeEncounter(user.hospitalId, encId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async softDelete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const encId = Number(id);
    if (!encId || Number.isNaN(encId)) {
      throw new BadRequestException('رقم الزيارة غير صحيح');
    }

    return this.encountersService.softDelete(user.hospitalId, encId, user.sub);
  }

  // @Get('active-inpatients')
  // @Roles('ADMIN', 'RECEPTION', 'NURSE', 'DOCTOR')
  // async listActiveInpatients(@CurrentUser() user: JwtPayload) {
  //   return this.encountersService.listActiveInpatients(user.hospitalId);
  // }

  @Get('list/active-inpatients')
  @Roles('ADMIN', 'RECEPTION', 'NURSE', 'DOCTOR')
  async listActiveInpatients(@CurrentUser() user: JwtPayload) {
    return this.encountersService.listActiveInpatients(user.hospitalId);
  }

  @Patch(':id/discharge')
  @Roles('ADMIN', 'RECEPTION', 'NURSE')
  async discharge(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const encId = Number(id);
    if (!encId || Number.isNaN(encId)) {
      throw new BadRequestException('رقم الحالة غير صحيح');
    }

    return this.encountersService.dischargePatient(user.hospitalId, encId);
  }

  @Patch(':id/assign-doctor')
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR')
  async assignDoctor(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { doctorId: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.encountersService.assignDoctor(
      user.hospitalId,
      id,
      body.doctorId,
    );
  }

  @Patch(':id/admit')
  @Roles('ADMIN', 'DOCTOR')
  async admitFromER(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { departmentId?: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.encountersService.admitPatientFromER(
      user.hospitalId,
      id,
      body.departmentId,
    );
  }

  @Get()
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE')
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('patientId') patientId?: string,
    @Query('type') type?: EncounterType,
    @Query('status') status?: EncounterStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.encountersService.findAll({
      hospitalId: user.hospitalId,
      patientId: patientId ? Number(patientId) : undefined,
      type,
      status,
      search,
      page: page ? Number(page) : 1,
    });
  }
}
