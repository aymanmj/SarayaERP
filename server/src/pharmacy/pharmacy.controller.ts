import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StockTransactionType, PaymentMethod } from '@prisma/client';
import { Sensitive } from '../audit/audit.decorator';
import { RequireFeature } from '../licensing/license.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pharmacy')
@RequireFeature('PHARMACY')
export class PharmacyController {
  constructor(private readonly pharmacy: PharmacyService) {}

  // ✅ كتالوج الأدوية
  @Get('catalog')
  async getDrugCatalog(@Req() req: any, @Query('q') q?: string) {
    const hospitalId = req.user.hospitalId;
    return this.pharmacy.getDrugCatalog(hospitalId, q);
  }

  // ✅ الوصفات المرتبطة بـ Encounter
  @Get('encounters/:encounterId/prescriptions')
  @Sensitive('VIEW_PHARMACY_PRESCRIPTIONS')
  async getEncounterPrescriptions(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    const hospitalId = req.user.hospitalId;
    return this.pharmacy.getEncounterPrescriptions(hospitalId, encounterId);
  }

  // ✅ إنشاء وصفة جديدة
  @Post('encounters/:encounterId/prescriptions')
  @Roles('ADMIN', 'DOCTOR')
  async createForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Body() body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    const rawItems: any[] =
      (Array.isArray(body.items) && body.items) ||
      (Array.isArray(body.lines) && body.lines) ||
      [];

    if (!rawItems.length) {
      throw new BadRequestException('يجب إضافة دواء واحد على الأقل في الوصفة.');
    }

    const doctorId = body.doctorId ?? user.sub;
    if (!doctorId) {
      throw new BadRequestException('معرّف الطبيب غير موجود.');
    }

    const items = rawItems.map((i) => ({
      drugItemId: Number(i.drugItemId ?? i.id),
      dose: i.dose ?? '',
      route: (i.route as string) ?? 'OTHER',
      frequency: (i.frequency as string) ?? 'OTHER',
      durationDays: Number(i.durationDays ?? 1),
      quantity: Number(i.quantity ?? 1),
      notes: i.notes ?? undefined,
    }));

    return this.pharmacy.createPrescriptionForEncounter({
      hospitalId: user.hospitalId,
      encounterId,
      doctorId,
      notes: body.notes ?? undefined,
      overrideSafety: body.overrideSafety, // 👈 تمرير خيار التجاوز
      items,
    });
  }

  // ✅ Worklist الصيدلية
  @Get('worklist')
  @Roles('ADMIN', 'PHARMACIST')
  async getWorklist(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const hospitalId = req.user.hospitalId;
    const p = page ? parseInt(page) : 1;
    const l = limit ? parseInt(limit) : 20;
    return this.pharmacy.getWorklist(hospitalId, p, l);
  }

  // ✅ صرف وصفة (Dispense) - يدعم الآن الصرف التلقائي حسب FEFO
  @Post('prescriptions/:id/dispense')
  @Roles('ADMIN', 'PHARMACIST')
  async dispensePrescription(
    @Req() req: any,
    @Param('id', ParseIntPipe) prescriptionId: number,
    @Body()
    body: {
      notes?: string;
      items?: {
        prescriptionItemId: number;
        quantity: number;
        dispensedDrugItemId?: number;
      }[];
    },
  ) {
    const hospitalId = req.user.hospitalId;
    const pharmacistId = req.user.sub;

    try {
      return await this.pharmacy.dispensePrescription({
        hospitalId,
        prescriptionId,
        pharmacistId,
        notes: body.notes,
        items: body.items,
      });
    } catch (err) {
      console.error('❌ dispensePrescription error:', err);
      throw err;
    }
  }

  // ✅ قائمة المخزون
  @Get('stock')
  @Roles('ADMIN', 'PHARMACIST')
  async getDrugStock(@Req() req: any, @Query('q') q?: string) {
    const hospitalId = req.user.hospitalId;
    return this.pharmacy.getDrugStockList(hospitalId, q);
  }

  // ✅ إنشاء حركة مخزون يدويّة (توريد / تسوية)
  // تم التحديث لدعم batchNumber و expiryDate
  @Post('stock/transactions')
  @Roles('ADMIN', 'PHARMACIST')
  async createStockTransaction(
    @Req() req: any,
    @Body()
    body: {
      drugItemId: number;
      type: 'IN' | 'ADJUST';
      quantity: number;
      unitCost?: number;
      batchNumber?: string; // جديد
      expiryDate?: string; // جديد (ISO Date)
    },
  ) {
    const hospitalId = req.user.hospitalId;
    const userId = req.user.sub;

    // تحويل التاريخ إن وجد
    let expiryDateObj: Date | undefined;
    if (body.expiryDate) {
      expiryDateObj = new Date(body.expiryDate);
      if (isNaN(expiryDateObj.getTime())) {
        throw new BadRequestException('تاريخ الصلاحية غير صحيح.');
      }
    }

    return this.pharmacy.createManualStockTransaction({
      hospitalId,
      userId,
      drugItemId: Number(body.drugItemId),
      type: body.type,
      quantity: Number(body.quantity),
      unitCost:
        body.unitCost !== undefined && body.unitCost !== null
          ? Number(body.unitCost)
          : undefined,
      batchNumber: body.batchNumber,
      expiryDate: expiryDateObj,
    });
  }

  // ✅ تقرير حركات مخزون الصيدلية
  @Get('stock/transactions')
  @Roles('ADMIN', 'PHARMACIST')
  async getStockTransactionsReport(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('drugItemId') drugItemId?: string,
    @Query('type') type?: string,
  ) {
    const hospitalId = req.user.hospitalId;

    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    let drugIdNum: number | undefined;
    let typeEnum: StockTransactionType | undefined;

    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) {
        fromDate = d;
      }
    }

    if (to) {
      const d = new Date(to);
      if (!isNaN(d.getTime())) {
        toDate = d;
      }
    }

    if (drugItemId) {
      const n = Number(drugItemId);
      if (!isNaN(n) && n > 0) {
        drugIdNum = n;
      }
    }

    if (type && type !== 'ALL') {
      if (type === 'IN' || type === 'OUT' || type === 'ADJUST') {
        typeEnum = type as StockTransactionType;
      } else {
        throw new BadRequestException('نوع الحركة غير صحيح.');
      }
    }

    return this.pharmacy.getStockTransactionsReport({
      hospitalId,
      from: fromDate,
      to: toDate,
      drugItemId: drugIdNum,
      type: typeEnum,
    });
  }

  @Get('encounters/:encounterId/dispenses-summary')
  @Roles('ADMIN', 'DOCTOR', 'PHARMACIST', 'CASHIER')
  async getEncounterDispensesSummary(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    const hospitalId = req.user.hospitalId;
    return this.pharmacy.getEncounterDispensesSummary(hospitalId, encounterId);
  }

  //  صرف ودفع فوري (POS) - يدعم FEFO الآن
  @Post('prescriptions/:id/dispense-pay')
  @Roles('ADMIN', 'PHARMACIST')
  async dispenseAndPay(
    @Req() req: any,
    @Param('id', ParseIntPipe) prescriptionId: number,
    @Body()
    body: {
      notes?: string;
      paymentMethod: PaymentMethod;
      amountPaid: number;
      items?: {
        prescriptionItemId: number;
        quantity: number;
        dispensedDrugItemId?: number; // productId
      }[];
    },
  ) {
    // تحقق بسيط
    if (!body.amountPaid || body.amountPaid <= 0) {
      throw new BadRequestException('يجب تحديد المبلغ المدفوع.');
    }

    return this.pharmacy.dispenseAndPay({
      hospitalId: req.user.hospitalId,
      prescriptionId,
      pharmacistId: req.user.sub,
      notes: body.notes,
      paymentMethod: body.paymentMethod || 'CASH',
      amountPaid: Number(body.amountPaid),
      items: body.items,
    });
  }
}

// // src/pharmacy/pharmacy.controller.ts

// import {
//   Body,
//   Controller,
//   Get,
//   Param,
//   ParseIntPipe,
//   Post,
//   Req,
//   UseGuards,
//   Query,
//   BadRequestException,
// } from '@nestjs/common';
// import { PharmacyService } from './pharmacy.service';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import type { JwtPayload } from '../auth/jwt-payload.type';
// import { CurrentUser } from '../auth/current-user.decorator';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';
// // ✅ [FIX] استيراد الاسم الجديد من Prisma
// import { StockTransactionType } from '@prisma/client';
// import { PaymentMethod } from '@prisma/client';

// class PrescriptionItemDto {
//   drugItemId!: number;
//   dose!: string;
//   route!: string;
//   frequency!: string;
//   durationDays!: number;
//   quantity!: number;
//   notes?: string;
// }

// class CreatePrescriptionDto {
//   notes?: string;
//   items!: PrescriptionItemDto[];
//   doctorId?: number;
// }

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('pharmacy')
// export class PharmacyController {
//   constructor(private readonly pharmacy: PharmacyService) {}

//   // ✅ كتالوج الأدوية
//   @Get('catalog')
//   async getDrugCatalog(@Req() req: any, @Query('q') q?: string) {
//     const hospitalId = req.user.hospitalId;
//     return this.pharmacy.getDrugCatalog(hospitalId, q);
//   }

//   // ✅ الوصفات المرتبطة بـ Encounter
//   @Get('encounters/:encounterId/prescriptions')
//   async getEncounterPrescriptions(
//     @Req() req: any,
//     @Param('encounterId', ParseIntPipe) encounterId: number,
//   ) {
//     const hospitalId = req.user.hospitalId;
//     return this.pharmacy.getEncounterPrescriptions(hospitalId, encounterId);
//   }

//   // ✅ إنشاء وصفة جديدة
//   @Post('encounters/:encounterId/prescriptions')
//   @Roles('ADMIN', 'DOCTOR')
//   async createForEncounter(
//     @Param('encounterId', ParseIntPipe) encounterId: number,
//     @Body() body: any,
//     @CurrentUser() user: JwtPayload,
//   ) {
//     const rawItems: any[] =
//       (Array.isArray(body.items) && body.items) ||
//       (Array.isArray(body.lines) && body.lines) ||
//       [];

//     if (!rawItems.length) {
//       throw new BadRequestException('يجب إضافة دواء واحد على الأقل في الوصفة.');
//     }

//     const doctorId = body.doctorId ?? user.sub;
//     if (!doctorId) {
//       throw new BadRequestException('معرّف الطبيب غير موجود.');
//     }

//     const items = rawItems.map((i) => ({
//       drugItemId: Number(i.drugItemId ?? i.id),
//       dose: i.dose ?? '',
//       route: (i.route as string) ?? 'OTHER',
//       frequency: (i.frequency as string) ?? 'OTHER',
//       durationDays: Number(i.durationDays ?? 1),
//       quantity: Number(i.quantity ?? 1),
//       notes: i.notes ?? undefined,
//     }));

//     return this.pharmacy.createPrescriptionForEncounter({
//       hospitalId: user.hospitalId,
//       encounterId,
//       doctorId,
//       notes: body.notes ?? undefined,
//       items,
//     });
//   }

//   // ✅ Worklist الصيدلية
//   @Get('worklist')
//   @Roles('ADMIN', 'PHARMACIST')
//   async getWorklist(@Req() req: any) {
//     const hospitalId = req.user.hospitalId;
//     return this.pharmacy.getWorklist(hospitalId);
//   }

//   // ✅ صرف وصفة
//   @Post('prescriptions/:id/dispense')
//   @Roles('ADMIN', 'PHARMACIST')
//   async dispensePrescription(
//     @Req() req: any,
//     @Param('id', ParseIntPipe) prescriptionId: number,
//     @Body()
//     body: {
//       notes?: string;
//       items?: {
//         prescriptionItemId: number;
//         quantity: number;
//         dispensedDrugItemId?: number;
//       }[];
//     },
//   ) {
//     const hospitalId = req.user.hospitalId;
//     const pharmacistId = req.user.sub;

//     try {
//       return await this.pharmacy.dispensePrescription({
//         hospitalId,
//         prescriptionId,
//         pharmacistId,
//         notes: body.notes,
//         items: body.items,
//       });
//     } catch (err) {
//       console.error('❌ dispensePrescription error:', err);
//       throw err;
//     }
//   }

//   // ✅ قائمة المخزون
//   @Get('stock')
//   @Roles('ADMIN', 'PHARMACIST')
//   async getDrugStock(@Req() req: any, @Query('q') q?: string) {
//     const hospitalId = req.user.hospitalId;
//     return this.pharmacy.getDrugStockList(hospitalId, q);
//   }

//   // ✅ إنشاء حركة مخزون يدويّة (توريد / تسوية)
//   @Post('stock/transactions')
//   @Roles('ADMIN', 'PHARMACIST')
//   async createStockTransaction(
//     @Req() req: any,
//     @Body()
//     body: {
//       drugItemId: number;
//       // ✅ [FIX] نستخدم 'IN' | 'ADJUST' لتطابق الـ Service
//       type: 'IN' | 'ADJUST';
//       quantity: number;
//       unitCost?: number;
//     },
//   ) {
//     const hospitalId = req.user.hospitalId;
//     const userId = req.user.sub;

//     return this.pharmacy.createManualStockTransaction({
//       hospitalId,
//       userId,
//       drugItemId: Number(body.drugItemId),
//       type: body.type,
//       quantity: Number(body.quantity),
//       unitCost:
//         body.unitCost !== undefined && body.unitCost !== null
//           ? Number(body.unitCost)
//           : undefined,
//     });
//   }

//   // ✅ تقرير حركات مخزون الصيدلية
//   @Get('stock/transactions')
//   @Roles('ADMIN', 'PHARMACIST')
//   async getStockTransactionsReport(
//     @Req() req: any,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//     @Query('drugItemId') drugItemId?: string,
//     @Query('type') type?: string,
//   ) {
//     const hospitalId = req.user.hospitalId;

//     let fromDate: Date | undefined;
//     let toDate: Date | undefined;
//     let drugIdNum: number | undefined;
//     // ✅ [FIX] استخدام الاسم الجديد
//     let typeEnum: StockTransactionType | undefined;

//     if (from) {
//       const d = new Date(from);
//       if (!isNaN(d.getTime())) {
//         fromDate = d;
//       }
//     }

//     if (to) {
//       const d = new Date(to);
//       if (!isNaN(d.getTime())) {
//         toDate = d;
//       }
//     }

//     if (drugItemId) {
//       const n = Number(drugItemId);
//       if (!isNaN(n) && n > 0) {
//         drugIdNum = n;
//       }
//     }

//     if (type && type !== 'ALL') {
//       if (type === 'IN' || type === 'OUT' || type === 'ADJUST') {
//         // ✅ [FIX] Casting للنوع الصحيح
//         typeEnum = type as StockTransactionType;
//       } else {
//         throw new BadRequestException('نوع الحركة غير صحيح.');
//       }
//     }

//     return this.pharmacy.getStockTransactionsReport({
//       hospitalId,
//       from: fromDate,
//       to: toDate,
//       drugItemId: drugIdNum,
//       type: typeEnum,
//     });
//   }

//   @Get('encounters/:encounterId/dispenses-summary')
//   @Roles('ADMIN', 'DOCTOR', 'PHARMACIST', 'CASHIER')
//   async getEncounterDispensesSummary(
//     @Req() req: any,
//     @Param('encounterId', ParseIntPipe) encounterId: number,
//   ) {
//     const hospitalId = req.user.hospitalId;
//     return this.pharmacy.getEncounterDispensesSummary(hospitalId, encounterId);
//   }

//   //  صرف ودفع فوري (POS)
//   @Post('prescriptions/:id/dispense-pay')
//   @Roles('ADMIN', 'PHARMACIST')
//   async dispenseAndPay(
//     @Req() req: any,
//     @Param('id', ParseIntPipe) prescriptionId: number,
//     @Body()
//     body: {
//       notes?: string;
//       paymentMethod: PaymentMethod;
//       amountPaid: number;
//       items?: {
//         prescriptionItemId: number;
//         quantity: number;
//         dispensedDrugItemId?: number; // productId
//       }[];
//     },
//   ) {
//     // تحقق بسيط
//     if (!body.amountPaid || body.amountPaid <= 0) {
//       throw new BadRequestException('يجب تحديد المبلغ المدفوع.');
//     }

//     return this.pharmacy.dispenseAndPay({
//       hospitalId: req.user.hospitalId,
//       prescriptionId,
//       pharmacistId: req.user.sub,
//       notes: body.notes,
//       paymentMethod: body.paymentMethod || 'CASH',
//       amountPaid: Number(body.amountPaid),
//       items: body.items,
//     });
//   }
// }
