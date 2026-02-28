import { Controller, Get, Post, Body, Param, Put, UseGuards, Request } from '@nestjs/common';
import { ConsentFormsService } from './consent-forms.service';
import { ConsentFormType, ConsentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';

@Controller('consent-forms')
@UseGuards(JwtAuthGuard)
export class ConsentFormsController {
  constructor(private readonly consentFormsService: ConsentFormsService) {}

  @Post()
  create(@Body() createDto: {
    hospitalId: number;
    patientId: number;
    encounterId?: number;
    doctorId?: number;
    formType: ConsentFormType;
    title: string;
    content: string;
  }) {
    return this.consentFormsService.create(createDto);
  }

  @Get('patient/:patientId/:hospitalId')
  findByPatient(
    @Param('patientId') patientId: string,
    @Param('hospitalId') hospitalId: string
  ) {
    return this.consentFormsService.findByPatient(+patientId, +hospitalId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.consentFormsService.findOne(+id);
  }

  @Put(':id/sign')
  sign(
    @Param('id') id: string,
    @Body() signDto: { signature: string; signedByRef: string }
  ) {
    return this.consentFormsService.sign(+id, signDto);
  }

  @Put(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.consentFormsService.revoke(+id);
  }
}
