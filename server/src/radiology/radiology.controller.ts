// src/radiology/radiology.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RadiologyService } from './radiology.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequireFeature } from '../licensing/license.decorator';
import {
  IsOptional,
  IsString,
  IsArray,
  ArrayNotEmpty,
  IsInt,
} from 'class-validator';

class CreateRadiologyOrdersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  studyIds!: number[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  doctorId?: number;
}

class CompleteRadiologyOrderDto {
  @IsOptional()
  @IsString()
  reportText?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('radiology')
@RequireFeature('RADIOLOGY')
export class RadiologyController {
  constructor(private readonly radiologyService: RadiologyService) {}

  @Get('catalog')
  async getCatalog(@Req() req: any) {
    return this.radiologyService.getCatalog(req.user.hospitalId);
  }

  @Get('encounters/:encounterId/orders')
  async listOrdersForEncounter(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    return this.radiologyService.listOrdersForEncounter(
      encounterId,
      req.user.hospitalId,
    );
  }

  @Post('encounters/:encounterId/orders')
  @Roles('ADMIN', 'DOCTOR')
  async createOrdersForEncounter(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Body() dto: CreateRadiologyOrdersDto,
  ) {
    if (!dto.studyIds || dto.studyIds.length === 0) {
      throw new BadRequestException('يجب اختيار فحص واحد على الأقل.');
    }
    const doctorId = dto.doctorId ?? req.user.sub;

    return this.radiologyService.createOrdersForEncounter({
      encounterId,
      hospitalId: req.user.hospitalId,
      doctorId,
      studyIds: dto.studyIds.map(Number),
      notes: dto.notes,
    });
  }

  @Get('worklist')
  @Roles('ADMIN', 'RAD_TECH', 'DOCTOR')
  async worklist(@Req() req: any) {
    return this.radiologyService.getWorklist(req.user.hospitalId);
  }

  // ✅ [NEW] زر بدء فحص الأشعة (يرسل HL7)
  @Post('orders/:id/start')
  @Roles('ADMIN', 'RAD_TECH', 'DOCTOR')
  async startOrder(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.radiologyService.startProcessing(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }

  // ✅ جلب تفاصيل طلب للطباعة
  @Get('orders/:id')
  @Roles('ADMIN', 'DOCTOR', 'RAD_TECH', 'RECEPTION')
  async getOrder(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.radiologyService.getOrderById(req.user.hospitalId, id);
  }

  // ✅ حفظ التقرير وإكمال الطلب
  @Patch('orders/:id/report')
  @Roles('ADMIN', 'RAD_TECH', 'DOCTOR')
  async reportOrder(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteRadiologyOrderDto,
  ) {
    return this.radiologyService.completeOrderWithReport({
      hospitalId: req.user.hospitalId,
      radiologyOrderId: id,
      reportedById: req.user.sub,
      reportText: dto.reportText,
    });
  }
}

// // src/radiology/radiology.controller.ts

// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   Param,
//   ParseIntPipe,
//   Patch,
//   Post,
//   UseGuards,
// } from '@nestjs/common';
// import { RadiologyService } from './radiology.service';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';
// import { CurrentUser } from '../auth/current-user.decorator';
// import type { JwtPayload } from '../auth/jwt-payload.type';
// import {
//   IsOptional,
//   IsString,
//   IsArray,
//   ArrayNotEmpty,
//   IsInt,
// } from 'class-validator';

// class CreateRadiologyOrdersDto {
//   @IsArray()
//   @ArrayNotEmpty()
//   @IsInt({ each: true })
//   studyIds!: number[];

//   @IsOptional()
//   @IsString()
//   notes?: string;

//   @IsOptional()
//   @IsInt()
//   doctorId?: number;
// }

// class CompleteRadiologyOrderDto {
//   @IsOptional()
//   @IsString()
//   reportText?: string;
// }

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('radiology')
// export class RadiologyController {
//   constructor(private readonly radiologyService: RadiologyService) {}

//   // ===== كاتالوج دراسات الأشعة =====
//   @Get('catalog')
//   async getCatalog(@CurrentUser() user: JwtPayload) {
//     return this.radiologyService.getCatalog(user.hospitalId);
//   }

//   // ===== أوامر الأشعة لحالة معيّنة (Encounter) =====
//   @Get('encounters/:encounterId/orders')
//   async listOrdersForEncounter(
//     @Param('encounterId', ParseIntPipe) encounterId: number,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     return this.radiologyService.listOrdersForEncounter(
//       encounterId,
//       user.hospitalId,
//     );
//   }

//   @Post('encounters/:encounterId/orders')
//   @Roles('ADMIN', 'DOCTOR')
//   async createOrdersForEncounter(
//     @Param('encounterId', ParseIntPipe) encounterId: number,
//     @Body() dto: CreateRadiologyOrdersDto,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     if (!dto.studyIds || dto.studyIds.length === 0) {
//       throw new BadRequestException('يجب اختيار فحص واحد على الأقل.');
//     }

//     const studyIds = dto.studyIds
//       .map((id: any) => Number(id))
//       .filter((n) => !Number.isNaN(n));

//     if (studyIds.length === 0) {
//       throw new BadRequestException('قائمة studyIds غير صالحة.');
//     }

//     const doctorId = dto.doctorId ?? user.sub;
//     if (!doctorId) {
//       throw new BadRequestException('معرّف الطبيب غير موجود.');
//     }

//     return this.radiologyService.createOrdersForEncounter({
//       encounterId,
//       hospitalId: user.hospitalId,
//       doctorId,
//       studyIds,
//       notes: dto.notes,
//     });
//   }

//   // ===== Radiology Worklist =====
//   // عرض كل طلبات الأشعة PENDING / SCHEDULED في المنشأة
//   @Get('worklist')
//   @Roles('ADMIN', 'RAD_TECH')
//   async worklist(@CurrentUser() user: JwtPayload) {
//     return this.radiologyService.getWorklist(user.hospitalId);
//   }

//   // ===== إكمال الطلب + تقرير (المسار القديم للتوافق) =====
//   @Patch('orders/:id/complete')
//   @Roles('ADMIN', 'DOCTOR', 'RAD_TECH') // تقدر تعدّل الأدوار كما تحب
//   async completeOrder(
//     @Param('id', ParseIntPipe) id: number,
//     @Body() dto: CompleteRadiologyOrderDto,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     return this.radiologyService.completeOrderWithReport({
//       hospitalId: user.hospitalId,
//       radiologyOrderId: id,
//       reportedById: user.sub,
//       reportText: dto.reportText,
//     });
//   }

//   // ===== إكمال الطلب + تقرير (المسار الجديد المستخدم في RadiologyWorklistPage) =====
//   @Patch('orders/:id/report')
//   @Roles('ADMIN', 'RAD_TECH', 'DOCTOR')
//   async reportOrder(
//     @Param('id', ParseIntPipe) id: number,
//     @Body() dto: CompleteRadiologyOrderDto,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     return this.radiologyService.completeOrderWithReport({
//       hospitalId: user.hospitalId,
//       radiologyOrderId: id,
//       reportedById: user.sub,
//       reportText: dto.reportText,
//     });
//   }
// }
