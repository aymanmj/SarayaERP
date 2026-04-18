/**
 * Patient Portal — Financial Controller
 * 
 * Read-only access to patient's financial data:
 * invoices, payments, outstanding balance, insurance info.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientPortalService } from '../patient-portal.service';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';

@ApiTags('Patient Portal — Financial')
@ApiBearerAuth()
@UseGuards(PatientAuthGuard)
@Controller('patient-portal/v1/financial')
export class PortalFinancialController {
  constructor(private readonly portalService: PatientPortalService) {}

  @Get('invoices')
  @ApiOperation({ summary: 'قائمة الفواتير' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getInvoices(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.portalService.getInvoices(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'تفصيل فاتورة' })
  async getInvoiceById(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getInvoiceById(patient.sub, id);
  }

  @Get('payments')
  @ApiOperation({ summary: 'سجل الدفعات' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPayments(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.portalService.getPayments(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get('balance')
  @ApiOperation({ summary: 'الرصيد المستحق' })
  async getBalance(@CurrentPatient() patient: any) {
    return this.portalService.getOutstandingBalance(patient.sub);
  }

  @Get('insurance')
  @ApiOperation({ summary: 'بيانات التأمين' })
  async getInsurance(@CurrentPatient() patient: any) {
    return this.portalService.getInsuranceInfo(patient.sub);
  }
}
