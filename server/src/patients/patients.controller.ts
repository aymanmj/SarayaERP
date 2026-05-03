import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  BadRequestException,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { Sensitive } from '../audit/audit.decorator';
import { ClinicalABACGuard } from '../auth/guards/clinical-abac.guard';
import { RequireClinicalRelation } from '../auth/decorators/abac.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, ClinicalABACGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  // @Post()
  // @Roles('ADMIN', 'RECEPTION')
  // create(@Body() body: any, @CurrentUser() user: JwtPayload) {
  //   let dob: Date | undefined;
  //   if (body.dateOfBirth) {
  //     const d = new Date(body.dateOfBirth);
  //     if (Number.isNaN(d.getTime())) {
  //       throw new BadRequestException('تاريخ الميلاد غير صالح');
  //     }
  //     dob = d;
  //   }

  //   return this.patientsService.create(user.hospitalId, {
  //     fullName: body.fullName,
  //     nationalId: body.nationalId || undefined,
  //     dateOfBirth: dob,
  //     gender: body.gender || undefined,
  //     phone: body.phone || undefined,
  //     address: body.address || undefined,
  //     email: body.email || undefined,
  //     notes: body.notes || undefined,
  //     // ✅ [NEW] حقول التأمين
  //     insurancePolicy: body.insurancePolicyId
  //       ? { connect: { id: Number(body.insurancePolicyId) } }
  //       : undefined,
  //     insuranceMemberId: body.insuranceMemberId || undefined,
  //   });
  // }

  @Post()
  @Roles('ADMIN', 'RECEPTION')
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    let dob: Date | undefined;
    if (body.dateOfBirth) {
      const d = new Date(body.dateOfBirth);
      if (!isNaN(d.getTime())) dob = d;
    }

    return this.patientsService.create(user.hospitalId, {
      fullName: body.fullName,
      nationalId: body.nationalId,
      dateOfBirth: dob,
      gender: body.gender,
      phone: body.phone,
      address: body.address,
      email: body.email,
      notes: body.notes,
      // ✅ إضافة الحقول الجديدة هنا لكي تصل للـ Service
      motherName: body.motherName,
      familyBooklet: body.familyBooklet,
      familySheet: body.familySheet,
      registryNumber: body.registryNumber,
      identityType: body.identityType,
      identityNumber: body.identityNumber,
      maritalStatus: body.maritalStatus,
      // بيانات التأمين
      insurancePolicy: body.insurancePolicyId
        ? { connect: { id: Number(body.insurancePolicyId) } }
        : undefined,
      insuranceMemberId: body.insuranceMemberId || undefined,
    });
  }

  @Get()
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE', 'CASHIER')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.patientsService.findAll({
      hospitalId: user.hospitalId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search: search || undefined,
    });
  }

  // MPI: Search the National Patient Network
  @Get('search-global')
  @Roles('ADMIN', 'RECEPTION')
  async searchGlobalPatient(
    @Query('query') query: string,
  ) {
    if (!query || query.trim() === '') return { found: false, patient: null };
    const globalPatient = await this.patientsService.searchGlobal(query.trim());
    return {
      found: !!globalPatient,
      patient: globalPatient
        ? {
            id: globalPatient.id,
            fullName: globalPatient.fullName,
            dateOfBirth: globalPatient.dateOfBirth,
            gender: globalPatient.gender,
            identityType: globalPatient.identityType,
          }
        : null,
    };
  }

  @Get('search')
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE', 'CASHIER')
  async searchPatients(
    @CurrentUser() user: JwtPayload,
    @Query('query') query: string,
  ) {
    if (!query || query.trim() === '') return [];
    
    const result = await this.patientsService.findAll({
      hospitalId: user.hospitalId,
      page: 1,
      limit: 10,
      search: query,
    });
    
    return result.items;
  }

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'RECEPTION', 'NURSE')
  @RequireClinicalRelation({ paramName: 'id', allowBreakGlass: true })
  @Sensitive('VIEW_PATIENT_PROFILE')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.findOne(user.hospitalId, id);
  }

  // @Patch(':id')
  // @Roles('ADMIN', 'RECEPTION')
  // update(
  //   @Param('id', ParseIntPipe) id: number,
  //   @Body() body: any,
  //   @CurrentUser() user: JwtPayload,
  // ) {
  //   let dob: Date | undefined;
  //   if (body.dateOfBirth) {
  //     dob = new Date(body.dateOfBirth);
  //   }

  //   return this.patientsService.update(user.hospitalId, id, {
  //     fullName: body.fullName,
  //     nationalId: body.nationalId,
  //     dateOfBirth: dob,
  //     gender: body.gender,
  //     phone: body.phone,
  //     address: body.address,
  //     email: body.email,
  //     notes: body.notes,
  //     // ✅ [NEW] تحديث التأمين
  //     insurancePolicyId: body.insurancePolicyId
  //       ? Number(body.insurancePolicyId)
  //       : null, // null لفك الارتباط
  //     insuranceMemberId: body.insuranceMemberId,
  //   });
  // }

  @Patch(':id')
  @Roles('ADMIN', 'RECEPTION')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    let dob: Date | undefined;
    if (body.dateOfBirth) dob = new Date(body.dateOfBirth);

    return this.patientsService.update(user.hospitalId, id, {
      fullName: body.fullName,
      nationalId: body.nationalId,
      dateOfBirth: dob,
      gender: body.gender,
      phone: body.phone,
      address: body.address,
      email: body.email,
      notes: body.notes,
      // ✅ إضافة الحقول الجديدة هنا أيضاً للتحديث
      motherName: body.motherName,
      familyBooklet: body.familyBooklet,
      familySheet: body.familySheet,
      registryNumber: body.registryNumber,
      identityType: body.identityType,
      identityNumber: body.identityNumber,
      maritalStatus: body.maritalStatus,
      insurancePolicyId: body.insurancePolicyId
        ? Number(body.insurancePolicyId)
        : null,
      insuranceMemberId: body.insuranceMemberId,
    });
  }

  @Delete(':id')
  @Roles('ADMIN')
  async softDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.softDelete(user.hospitalId, id, user.sub);
  }

  @Get(':id/allergies')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'PHARMACIST')
  async getAllergies(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.getAllergies(user.hospitalId, id);
  }

  @Post(':id/allergies')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async addAllergy(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { allergen: string; severity: string; reaction?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.addAllergy(user.hospitalId, user.sub, {
      patientId: id,
      allergen: body.allergen,
      severity: body.severity,
      reaction: body.reaction,
    });
  }

  @Delete('allergies/:id')
  @Roles('ADMIN', 'DOCTOR')
  async removeAllergy(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.removeAllergy(user.hospitalId, id);
  }

  @Get(':id/fhir/export')
  @Roles('ADMIN', 'DOCTOR', 'HIM')
  @RequireClinicalRelation({ paramName: 'id', allowBreakGlass: true })
  @Sensitive('EXPORT_FHIR_RECORD')
  async exportFhirRecord(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.generateFhirExport(user.hospitalId, id);
  }
}
