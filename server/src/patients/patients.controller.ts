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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @Roles('ADMIN', 'RECEPTION')
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    let dob: Date | undefined;
    if (body.dateOfBirth) {
      const d = new Date(body.dateOfBirth);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('تاريخ الميلاد غير صالح');
      }
      dob = d;
    }

    return this.patientsService.create(user.hospitalId, {
      fullName: body.fullName,
      nationalId: body.nationalId || undefined,
      dateOfBirth: dob,
      gender: body.gender || undefined,
      phone: body.phone || undefined,
      address: body.address || undefined,
      email: body.email || undefined,
      notes: body.notes || undefined,
      // ✅ [NEW] حقول التأمين
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

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'RECEPTION', 'NURSE')
  @Sensitive('VIEW_PATIENT_PROFILE')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.findOne(user.hospitalId, id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECEPTION')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    let dob: Date | undefined;
    if (body.dateOfBirth) {
      dob = new Date(body.dateOfBirth);
    }

    return this.patientsService.update(user.hospitalId, id, {
      fullName: body.fullName,
      nationalId: body.nationalId,
      dateOfBirth: dob,
      gender: body.gender,
      phone: body.phone,
      address: body.address,
      email: body.email,
      notes: body.notes,
      // ✅ [NEW] تحديث التأمين
      insurancePolicyId: body.insurancePolicyId
        ? Number(body.insurancePolicyId)
        : null, // null لفك الارتباط
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
}

// import {
//   Body,
//   Controller,
//   Delete,
//   Get,
//   Param,
//   Patch,
//   Post,
//   UseGuards,
//   BadRequestException,
// } from '@nestjs/common';
// import { PatientsService } from './patients.service';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { Roles } from '../auth/roles.decorator';
// import { RolesGuard } from '../auth/roles.guard';
// import { CurrentUser } from '../auth/current-user.decorator';
// import type { JwtPayload } from '../auth/jwt-payload.type';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('patients')
// export class PatientsController {
//   constructor(private readonly patientsService: PatientsService) {}

//   @Post()
//   @Roles('ADMIN', 'RECEPTION')
//   create(@Body() body: any, @CurrentUser() user: JwtPayload) {
//     // تحويل تاريخ الميلاد لو أرسلناه كسلسلة
//     let dob: Date | undefined;
//     if (body.dateOfBirth) {
//       const d = new Date(body.dateOfBirth);
//       if (Number.isNaN(d.getTime())) {
//         throw new BadRequestException('تاريخ الميلاد غير صالح');
//       }
//       dob = d;
//     }

//     return this.patientsService.create(user.hospitalId, {
//       fullName: body.fullName,
//       nationalId: body.nationalId || undefined,
//       dateOfBirth: dob,
//       gender: body.gender || undefined,
//       phone: body.phone || undefined,
//       address: body.address || undefined,
//       email: body.email || undefined,
//       notes: body.notes || undefined,
//       // لا نرسل mrn ولا hospital هنا، الخدمة تضيفهما
//     });
//   }

//   @Get()
//   @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE')
//   findAll(@CurrentUser() user: JwtPayload) {
//     return this.patientsService.findAll(user.hospitalId);
//   }

//   // @Get(':id')
//   // @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE')
//   // findOne(@Param('id') id: string) {
//   //   return this.patientsService.findOne(Number(id));
//   // }

//   @Get(':id')
//   @Roles('ADMIN', 'DOCTOR', 'RECEPTION', 'NURSE') // أو أي صلاحيات تحبها
//   findOne(
//     @Param('id') id: string,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     const pid = Number(id);
//     if (!pid || Number.isNaN(pid)) {
//       throw new BadRequestException('رقم المريض غير صحيح');
//     }

//     return this.patientsService.findOne(user.hospitalId, pid);
//   }

//   // @Patch(':id')
//   // @Roles('ADMIN', 'RECEPTION')
//   // update(@Param('id') id: string, @Body() body: any) {
//   //   return this.patientsService.update(Number(id), body);
//   // }

//   @Patch(':id')
//   @Roles('ADMIN', 'RECEPTION')
//   update(
//     @Param('id') id: string,
//     @Body() body: any,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     const pid = Number(id);
//     if (!pid || Number.isNaN(pid)) {
//       throw new BadRequestException('رقم المريض غير صحيح');
//     }

//     return this.patientsService.update(user.hospitalId, pid, body);
//   }

//   // @Delete(':id')
//   // @Roles('ADMIN')
//   // delete(@Param('id') id: string) {
//   //   return this.patientsService.softDelete(Number(id));
//   // }

//   @Delete(':id')
//   @Roles('ADMIN')
//   async softDelete(
//     @Param('id') id: string,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     const pid = Number(id);
//     if (!pid || Number.isNaN(pid)) {
//       throw new BadRequestException('رقم المريض غير صحيح');
//     }

//     return this.patientsService.softDelete(
//       user.hospitalId,
//       pid,
//       user.sub,
//     );
//   }
// }
