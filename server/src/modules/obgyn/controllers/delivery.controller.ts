import { Controller, Post, Body, UseGuards, Req, Get, Param } from '@nestjs/common';
import { DeliveryService } from '../services/delivery.service';
import { CreateDeliveryDto } from '../dto/create-delivery.dto';
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'; // Assuming Auth Guard exists
// import { RolesGuard } from '../../auth/guards/roles.guard';

@Controller('obgyn/deliveries')
// @UseGuards(JwtAuthGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post()
  async create(@Body() dto: CreateDeliveryDto, @Req() req: any) {
    // Assuming user is attached to req by Guard
    const userId = req.user?.id || 1; // Fallback to 1 for dev
    return this.deliveryService.create(dto, userId);
  }

  @Get('patient/:patientId')
  async getByPatient(@Param('patientId') patientId: string) {
    return this.deliveryService.findAllByPatient(Number(patientId));
  }
}
