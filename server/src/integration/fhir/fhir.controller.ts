
import { Controller, Get, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { FhirService } from './fhir.service';
import type { Request } from 'express';

@Controller('fhir')
export class FhirController {
  constructor(private fhirService: FhirService) {}

  private getBaseUrl(req: Request) {
    return `${req.protocol}://${req.get('host')}/api/fhir`;
  }

  // ==========================================
  // Capability Statement
  // ==========================================
  @Get('metadata')
  getCapabilityStatement() {
    return this.fhirService.getCapabilityStatement();
  }

  // ==========================================
  // PATIENT
  // ==========================================
  @Get('Patient')
  searchPatients(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchPatients(query, this.getBaseUrl(req));
  }

  @Get('Patient/:id')
  getPatient(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getPatient(id);
  }

  // ==========================================
  // PRACTITIONER
  // ==========================================
  @Get('Practitioner')
  searchPractitioners(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchPractitioners(query, this.getBaseUrl(req));
  }

  @Get('Practitioner/:id')
  getPractitioner(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getPractitioner(id);
  }

  // ==========================================
  // ORGANIZATION
  // ==========================================
  @Get('Organization/:id')
  getOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getOrganization(id);
  }

  // ==========================================
  // ENCOUNTER
  // ==========================================
  @Get('Encounter')
  searchEncounters(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchEncounters(query, this.getBaseUrl(req));
  }

  @Get('Encounter/:id')
  getEncounter(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getEncounter(id);
  }

  // ==========================================
  // OBSERVATION
  // ==========================================
  @Get('Observation')
  searchObservations(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchObservations(query, this.getBaseUrl(req));
  }

  @Get('Observation/:id')
  getObservation(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getObservation(id);
  }
}
