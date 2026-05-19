import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ConsentFormsService } from './consent-forms.service';
import { ConsentFormType } from '@prisma/client';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { Permissions } from '../../../auth/permissions.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';

@Controller('consent-forms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConsentFormsController {
  constructor(private readonly consentFormsService: ConsentFormsService) {}

  @Permissions('consent-forms:manage')
  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createDto: {
      patientId: number;
      encounterId?: number;
      doctorId?: number;
      formType: ConsentFormType;
      title: string;
      content: string;
    },
  ) {
    return this.consentFormsService.create({
      ...createDto,
      hospitalId: user.hospitalId,
    });
  }

  @Permissions('consent-forms:view')
  @Get('patient/:patientId')
  findByPatient(
    @Param('patientId') patientId: string,
    @CurrentUser() user: any,
  ) {
    return this.consentFormsService.findByPatient(+patientId, user.hospitalId);
  }

  @Permissions('consent-forms:view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.consentFormsService.findOne(+id);
  }

  @Permissions('consent-forms:manage')
  @Put(':id/sign')
  sign(
    @Param('id') id: string,
    @Body() signDto: { signature: string; signedByRef: string },
  ) {
    return this.consentFormsService.sign(+id, signDto);
  }

  @Permissions('consent-forms:manage')
  @Put(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.consentFormsService.revoke(+id);
  }
}

