import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import type { Gender, IdentityType, MaritalStatus } from '@prisma/client';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { Sensitive } from '../audit/audit.decorator';
import { ClinicalABACGuard } from '../auth/guards/clinical-abac.guard';
import { RequireClinicalRelation } from '../auth/decorators/abac.decorator';
import { ApiTags } from '@nestjs/swagger';

interface PatientMutationBody {
  fullName?: string;
  nationalId?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: Gender | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  notes?: string | null;
  motherName?: string | null;
  familyBooklet?: string | null;
  familySheet?: string | null;
  registryNumber?: string | null;
  identityType?: IdentityType | null;
  identityNumber?: string | null;
  maritalStatus?: MaritalStatus | null;
  insurancePolicyId?: number | string | null;
  insuranceMemberId?: string | null;
}

@ApiTags('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard, ClinicalABACGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @Permissions('patients:manage')
  create(
    @Body() body: PatientMutationBody & { fullName: string },
    @CurrentUser() user: JwtPayload,
  ) {
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
  @Permissions('patients:view')
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
  @Permissions('patients:view')
  async searchGlobalPatient(@Query('query') query: string) {
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
  @Permissions('patients:view')
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
  @Permissions('patients:view')
  @RequireClinicalRelation({ paramName: 'id', allowBreakGlass: true })
  @Sensitive('VIEW_PATIENT_PROFILE')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.findOne(user.hospitalId, id);
  }

  @Patch(':id')
  @Permissions('patients:manage')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PatientMutationBody,
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
  @Permissions('patients:manage')
  async softDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.softDelete(user.hospitalId, id, user.sub);
  }

  @Get(':id/allergies')
  @Permissions('patients:view')
  async getAllergies(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.getAllergies(user.hospitalId, id);
  }

  @Post(':id/allergies')
  @Permissions('patients:manage')
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
  @Permissions('patients:manage')
  async removeAllergy(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.removeAllergy(user.hospitalId, id);
  }

  @Get(':id/fhir/export')
  @Permissions('patients:manage')
  @RequireClinicalRelation({ paramName: 'id', allowBreakGlass: true })
  @Sensitive('EXPORT_FHIR_RECORD')
  async exportFhirRecord(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.generateFhirExport(user.hospitalId, id);
  }
}
