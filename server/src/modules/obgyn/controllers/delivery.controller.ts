import { Controller, Post, Body, UseGuards, Req, Get, Param, ParseIntPipe } from '@nestjs/common';
import { DeliveryService } from '../services/delivery.service';
import { CreateDeliveryDto } from '../dto/create-delivery.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { JwtPayload } from '../../../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('obgyn/deliveries')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post()
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: JwtPayload) {
    return this.deliveryService.create(dto, user.sub);
  }

  @Get('patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION')
  async getByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.deliveryService.findAllByPatient(patientId);
  }
}
