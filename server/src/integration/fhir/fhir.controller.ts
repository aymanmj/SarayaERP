
import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { FhirService } from './fhir.service';

@Controller('fhir')
export class FhirController {
  constructor(private fhirService: FhirService) {}

  @Get('Patient/:id')
  async getPatient(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getPatient(id);
  }
}
