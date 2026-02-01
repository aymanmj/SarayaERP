// src/cashier/cashier.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  HttpCode,
  Query,
  Req,
  ParseIntPipe,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CashierService } from './cashier.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import type { PaymentReceiptDto } from './cashier.service';

class RecordPaymentDto {
  @IsNumber()
  amount!: number;

  @IsString()
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;
}

class CloseShiftDto {
  @IsString()
  date!: string; // بصيغة YYYY-MM-DD

  @IsString()
  from!: string; // بصيغة HH:mm

  @IsString()
  to!: string; // بصيغة HH:mm

  @IsNumber()
  actualCash!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cashier')
export class CashierController {
  constructor(private readonly cashierService: CashierService) {}

  // 1) Worklist للكاشير
  @Get('worklist')
  @Roles('ADMIN', 'CASHIER', 'RECEPTION')
  async getWorklist(@CurrentUser() user: JwtPayload) {
    return this.cashierService.getWorklist(user.hospitalId);
  }

  // 2) تسجيل دفعة على فاتورة
  @Post('invoices/:id/payments')
  @Roles('ADMIN', 'CASHIER')
  async recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cashierService.recordPayment({
      hospitalId: user.hospitalId,
      invoiceId: id,
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      userId: user.sub,
    });
  }

  // 3) كشف حساب مريض
  @Get('patients/:patientId/statement')
  @Roles('ADMIN', 'CASHIER', 'RECEPTION')
  async getPatientStatement(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cashierService.getPatientStatement(user.hospitalId, patientId);
  }

  // ✅ تفاصيل فاتورة معيّنة
  @Get('invoices/:invoiceId/details')
  @Roles('ADMIN', 'CASHIER')
  async getInvoiceDetails(
    @Req() req: any,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    const hospitalId = req.user.hospitalId;
    return this.cashierService.getInvoiceDetails(hospitalId, invoiceId);
  }

  @Get('payments/:id/receipt')
  @HttpCode(200)
  async getPaymentReceipt(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentReceiptDto> {
    const user = req.user;
    return this.cashierService.getPaymentReceipt(user.hospitalId, id);
  }

  // تقرير يومي للكاشير (بدون تحديد مستخدم)
  @Get('reports/daily')
  async getDailyReport(@Req() req: any, @Query('date') date?: string) {
    const hospitalId = req.user.hospitalId as number;

    let target: Date;
    if (date) {
      target = new Date(date + 'T00:00:00');
    } else {
      target = new Date();
    }

    const start = new Date(target);
    start.setHours(0, 0, 0, 0);

    const end = new Date(target);
    end.setHours(23, 59, 59, 999);

    return this.cashierService.getDailyReport(hospitalId, { start, end });
  }

  // 🔹 قائمة المستخدمين (للاختيار في تقرير الكاشير) - للـ ADMIN فقط
  @Get('users')
  @Roles('ADMIN', 'CASHIER', 'RECEPTION')
  async listCashierUsers(@Req() req: any) {
    const hospitalId = req.user.hospitalId as number;
    return this.cashierService.listCashierUsers(hospitalId);
  }

  // 🔹 تقرير الكاشير حسب المستخدم والفترة (يدعم اختيار كاشير + شفت من/إلى)
  @Get('reports/by-cashier')
  @Roles('ADMIN', 'CASHIER')
  async getCashierUserReport(
    @Req() req: any,
    @Query('date') dateStr?: string,
    @Query('from') fromTime?: string,
    @Query('to') toTime?: string,
    @Query('cashierId') cashierIdStr?: string,
  ) {
    const user = req.user as JwtPayload;
    const hospitalId = user.hospitalId;

    // تحديد الكاشير الهدف
    let cashierId = user.sub;

    if (cashierIdStr) {
      const parsed = Number(cashierIdStr);
      if (!parsed || Number.isNaN(parsed)) {
        throw new BadRequestException('معرّف الكاشير غير صالح.');
      }

      // غير الـ ADMIN لا يُسمح له باختيار مستخدم آخر
      if (!user.roles?.includes('ADMIN') && parsed !== user.sub) {
        throw new BadRequestException(
          'لا يمكنك عرض تقرير مستخدم آخر غير حسابك.',
        );
      }

      cashierId = parsed;
    }

    // حساب الفترة الزمنية بناءً على (تاريخ + من/إلى) مع دعم الشفت الليلي
    const baseDate = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();

    const [fromH, fromM] = (fromTime || '00:00').split(':').map(Number);
    const [toH, toM] = (toTime || '23:59').split(':').map(Number);

    const start = new Date(baseDate);
    start.setHours(fromH || 0, fromM || 0, 0, 0);

    const end = new Date(baseDate);
    end.setHours(toH || 0, toM || 0, 59, 999);

    // لو وقت النهاية <= البداية نمد الفترة لليوم التالي (شفت ليلي)
    if (end <= start) {
      end.setDate(end.getDate() + 1);
    }

    return this.cashierService.getCashierUserReport(hospitalId, cashierId, {
      start,
      end,
    });
  }

  // 🔹 إغلاق الشفت للكاشير
  @Post('shifts/close')
  async closeShift(@Req() req: any, @Body() body: CloseShiftDto) {
    const hospitalId = req.user.hospitalId as number;

    const rawId = (req.user as any)?.id ?? (req.user as any)?.sub;
    const cashierId = Number(rawId);

    if (!cashierId || Number.isNaN(cashierId)) {
      throw new BadRequestException('معرّف المستخدم غير صالح.');
    }

    const { date, from, to, actualCash, note } = body;

    // ✅ التحقق من وجود القيم الأساسية
    if (!date || !from || !to) {
      throw new BadRequestException('صيغة التاريخ/الوقت غير صحيحة.');
    }

    // ✅ تحويل تاريخ اليوم
    const baseDate = new Date(date + 'T00:00:00');
    if (Number.isNaN(baseDate.getTime())) {
      throw new BadRequestException('صيغة التاريخ/الوقت غير صحيحة.');
    }

    // ✅ دالة مساعدة لتحويل HH:mm إلى (ساعة/دقيقة)
    const parseTime = (timeStr: string, label: string) => {
      const [hStr, mStr] = timeStr.split(':');
      const h = Number(hStr);
      const m = Number(mStr);

      if (
        Number.isNaN(h) ||
        Number.isNaN(m) ||
        h < 0 ||
        h > 23 ||
        m < 0 ||
        m > 59
      ) {
        throw new BadRequestException(`صيغة الوقت غير صحيحة للحقل: ${label}.`);
      }

      return { h, m };
    };

    const { h: fromH, m: fromM } = parseTime(from, 'from');
    const { h: toH, m: toM } = parseTime(to, 'to');

    // ✅ بناء وقت البداية والنهاية على نفس اليوم
    const start = new Date(baseDate);
    start.setHours(fromH, fromM, 0, 0);

    const end = new Date(baseDate);
    end.setHours(toH, toM, 0, 0);

    // ✅ دعم الشفتات العابر لمنتصف الليل
    if (end <= start) {
      end.setDate(end.getDate() + 1);
    }

    return this.cashierService.closeCashierShift(hospitalId, cashierId, {
      start,
      end,
      actualCash,
      note,
    });
  }

  // 🔹 قائمة الشفتات المقفولة (مع فلترة بالتاريخ والكاشير)
  @Get('shifts')
  @Roles('ADMIN', 'CASHIER')
  async listShifts(
    @Req() req: any,
    @Query('fromDate') fromDateStr?: string,
    @Query('toDate') toDateStr?: string,
    @Query('cashierId') cashierIdStr?: string,
  ) {
    const user = req.user as JwtPayload;
    const hospitalId = user.hospitalId;

    // 🗓️ إعداد نطاق التاريخ الافتراضي (آخر 7 أيام) لو ما فيه قيم من الكلاينت
    const today = new Date();
    let fromDate: Date;
    let toDate: Date;

    if (fromDateStr) {
      fromDate = new Date(fromDateStr + 'T00:00:00');
    } else {
      fromDate = new Date();
      fromDate.setDate(today.getDate() - 7);
    }
    if (toDateStr) {
      toDate = new Date(toDateStr + 'T00:00:00');
    } else {
      toDate = new Date(today);
    }

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('صيغة التاريخ غير صحيحة.');
    }

    // ضبط اليوم من/إلى
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    // 👤 فلترة حسب الكاشير
    const currentUserId = (user as any).id ?? user.sub;
    let cashierId: number | undefined;

    if (cashierIdStr) {
      const parsed = Number(cashierIdStr);
      if (!parsed || Number.isNaN(parsed)) {
        throw new BadRequestException('معرّف الكاشير غير صالح.');
      }

      // غير الـ ADMIN لا يمكنه مشاهدة شفتات كاشير آخر
      if (!user.roles?.includes('ADMIN') && parsed !== currentUserId) {
        throw new BadRequestException('لا يمكنك استعراض شفتات مستخدم آخر.');
      }

      cashierId = parsed;
    } else {
      // لو المستخدم ليس ADMIN وما اخترش كاشير -> نفلتر على نفسه
      if (!user.roles?.includes('ADMIN')) {
        cashierId = Number(currentUserId);
      }
    }

    return this.cashierService.listCashierShifts(hospitalId, {
      start,
      end,
      cashierId,
    });
  }
}
