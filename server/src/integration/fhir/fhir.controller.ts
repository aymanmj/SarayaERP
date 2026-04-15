
import { Controller, Get, Post, Param, ParseIntPipe, Query, Req, Res, Body, UseGuards } from '@nestjs/common';
import { FhirService } from './fhir.service';
import type { Request, Response } from 'express';
import { FhirAuthService } from './fhir.auth.service';
import { FhirAuthGuard, FhirScope } from './fhir.auth.guard';

@Controller('fhir')
export class FhirController {
  constructor(
    private fhirService: FhirService,
    private fhirAuthService: FhirAuthService
  ) {}

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
  // SMART on FHIR OAuth2
  // ==========================================
  @Get('oauth/authorize')
  async authorize(
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('scope') scope: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('state') state: string,
    @Query('aud') aud: string,
    @Res() res: Response
  ) {
    const auth = await this.fhirAuthService.authorize(clientId, scope, redirectUri);
    // In SMART app launch, we redirect back with the code and state
    return res.redirect(`${redirectUri}?code=${auth.code}&state=${state}`);
  }

  @Post('oauth/token')
  async token(
    @Body('grant_type') grantType: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('scope') scope: string
  ) {
    return this.fhirAuthService.generateToken(grantType, clientId, clientSecret, scope);
  }

  // ==========================================
  // PATIENT
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Patient.read')
  @Get('Patient')
  searchPatients(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchPatients(query, this.getBaseUrl(req));
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Patient.read')
  @Get('Patient/:id')
  getPatient(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getPatient(id);
  }

  // ==========================================
  // PRACTITIONER
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Practitioner.read')
  @Get('Practitioner')
  searchPractitioners(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchPractitioners(query, this.getBaseUrl(req));
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Practitioner.read')
  @Get('Practitioner/:id')
  getPractitioner(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getPractitioner(id);
  }

  // ==========================================
  // ORGANIZATION
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Organization.read')
  @Get('Organization/:id')
  getOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getOrganization(id);
  }

  // ==========================================
  // ENCOUNTER
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Encounter.read')
  @Get('Encounter')
  searchEncounters(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchEncounters(query, this.getBaseUrl(req));
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Encounter.read')
  @Get('Encounter/:id')
  getEncounter(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getEncounter(id);
  }

  // ==========================================
  // OBSERVATION
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Observation.read')
  @Get('Observation')
  searchObservations(@Query() query: any, @Req() req: Request) {
    return this.fhirService.searchObservations(query, this.getBaseUrl(req));
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Observation.read')
  @Get('Observation/:id')
  getObservation(@Param('id', ParseIntPipe) id: number) {
    return this.fhirService.getObservation(id);
  }
}
