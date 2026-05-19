import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { DeliveryService } from '../services/delivery.service';
import { CreateDeliveryDto } from '../dto/create-delivery.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { Permissions } from '../../../auth/permissions.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('obgyn/deliveries')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Permissions('obgyn:manage')
  @Post()
  async create(
    @Body() dto: CreateDeliveryDto,
    @CurrentUser() user: any,
  ) {
    return this.deliveryService.create(dto, user.sub);
  }

  @Permissions('obgyn:view')
  @Get('patient/:patientId')
  async getByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: any,
  ) {
    return this.deliveryService.findAllByPatient(patientId);
  }
}

