import type { JwtPayload } from '../auth/jwt-payload.type';
import type { Request } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VitalsService } from './vitals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditInTransaction } from '../audit/audit.decorator';

function readNumber(value: unknown, field: string, integer = false) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && !value.trim())
  )
    return undefined;
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new BadRequestException(`قيمة القياس غير صالحة: ${field}`);
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number)))
    throw new BadRequestException(`قيمة القياس غير صالحة: ${field}`);
  return number;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vitals')
export class VitalsController {
  constructor(private readonly vitalsService: VitalsService) {}

  @Permissions('vitals:view')
  @Get('encounter/:id')
  async list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.vitalsService.getForEncounter(id, user.hospitalId);
  }

  @Permissions('vitals:manage')
  @AuditInTransaction()
  @Post('encounter/:id')
  async create(
    @Param('id', ParseIntPipe) encounterId: number,
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    const weight = readNumber(body.weight, 'weight');
    const height = readNumber(body.height, 'height');
    const bmi =
      readNumber(body.bmi, 'bmi') ??
      (weight && height
        ? this.vitalsService.calculateBMI(weight, height)
        : undefined);
    if (body.note != null && typeof body.note !== 'string')
      throw new BadRequestException('ملاحظة القياس غير صالحة');

    return this.vitalsService.create({
      encounterId,
      userId: user.sub,
      hospitalId: user.hospitalId,
      requestId: body.requestId,
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
      temperature: readNumber(body.temperature, 'temperature'),
      bpSystolic: readNumber(body.bpSystolic, 'bpSystolic', true),
      bpDiastolic: readNumber(body.bpDiastolic, 'bpDiastolic', true),
      pulse: readNumber(body.pulse, 'pulse', true),
      respRate: readNumber(body.respRate, 'respRate', true),
      o2Sat: readNumber(body.o2Sat, 'o2Sat', true),
      weight,
      height,
      bmi: bmi ?? undefined,
      note: body.note ?? undefined,
    });
  }
}
