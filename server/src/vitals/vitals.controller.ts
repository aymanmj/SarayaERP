import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VitalsService } from './vitals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vitals')
export class VitalsController {
  constructor(private readonly vitalsService: VitalsService) {}

  @Permissions('vitals:view')
  @Get('encounter/:id')
  async list(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.vitalsService.getForEncounter(id);
  }

  @Permissions('vitals:manage')
  @Post('encounter/:id')
  async create(
    @Param('id', ParseIntPipe) encounterId: number,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    // حساب BMI تلقائي لو تم إرسال الوزن والطول
    let bmi = body.bmi;
    if (!bmi && body.weight && body.height) {
      bmi = this.vitalsService.calculateBMI(
        Number(body.weight),
        Number(body.height),
      );
    }

    return this.vitalsService.create({
      encounterId,
      userId: user.sub,
      temperature: body.temperature ? Number(body.temperature) : undefined,
      bpSystolic: body.bpSystolic ? Number(body.bpSystolic) : undefined,
      bpDiastolic: body.bpDiastolic ? Number(body.bpDiastolic) : undefined,
      pulse: body.pulse ? Number(body.pulse) : undefined,
      respRate: body.respRate ? Number(body.respRate) : undefined,
      o2Sat: body.o2Sat ? Number(body.o2Sat) : undefined,
      weight: body.weight ? Number(body.weight) : undefined,
      height: body.height ? Number(body.height) : undefined,
      bmi,
      note: body.note,
    });
  }
}
