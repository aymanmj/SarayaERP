
import { Controller, Get, Post, Param, ParseIntPipe, Query, Req, Res, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { FhirService } from './fhir.service';
import type { Request, Response } from 'express';
import { FhirAuthService } from './fhir.auth.service';
import { FhirAuthGuard, FhirScope } from './fhir.auth.guard';
import type { SmartContext } from './fhir.auth.guard';

/**
 * Enterprise FHIR R4 Controller
 * 
 * All clinical endpoints enforce SMART patient context isolation:
 * - If the token has a `patient` claim, all queries are restricted to that patient.
 * - Direct reads (GET /Patient/:id) verify the ID matches the token's patient context.
 * - System-level tokens (no patient claim) can access all resources.
 * 
 * Scope enforcement is handled by @FhirScope() + FhirAuthGuard.
 * Patient isolation is handled by extracting smartContext and passing to service layer.
 */
@Controller('fhir')
export class FhirController {
  constructor(
    private fhirService: FhirService,
    private fhirAuthService: FhirAuthService
  ) {}

  private getBaseUrl(req: Request) {
    return `${req.protocol}://${req.get('host')}/api/fhir`;
  }

  /**
   * Extract the patient context from the SMART token.
   * Returns the patient ID as a number, or undefined for system-level access.
   */
  private getPatientContext(req: Request): number | undefined {
    const ctx = (req as any).smartContext as SmartContext | undefined;
    if (!ctx || !ctx.patient) return undefined;
    const id = parseInt(ctx.patient);
    return isNaN(id) ? undefined : id;
  }

  /**
   * Enforce that a direct resource read matches the patient context.
   * Throws ForbiddenException if the token's patient context doesn't match.
   */
  private enforcePatientAccess(req: Request, resourcePatientId: number) {
    const patientContext = this.getPatientContext(req);
    if (patientContext !== undefined && patientContext !== resourcePatientId) {
      throw new ForbiddenException(
        `Access denied. Your token is scoped to Patient/${patientContext} ` +
        `but you attempted to access data for Patient/${resourcePatientId}. ` +
        `SMART on FHIR patient isolation prohibits cross-patient access.`
      );
    }
  }

  // ==========================================
  // Capability Statement (Public)
  // ==========================================
  @Get('metadata')
  getCapabilityStatement() {
    return this.fhirService.getCapabilityStatement();
  }

  // ==========================================
  // SMART Well-Known Configuration (Public)
  // ==========================================
  @Get('.well-known/smart-configuration')
  getSmartConfiguration(@Req() req: Request) {
    const base = this.getBaseUrl(req);
    return {
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      grant_types_supported: ['authorization_code', 'client_credentials'],
      scopes_supported: [
        'patient/*.read', 'patient/*.write', 'patient/*.*',
        'user/*.read', 'user/*.write', 'user/*.*',
        'system/*.read', 'system/*.write', 'system/*.*',
        'launch/patient', 'openid', 'fhirUser',
      ],
      capabilities: [
        'launch-standalone', 'client-confidential-symmetric',
        'context-standalone-patient', 'permission-patient',
        'permission-user', 'sso-openid-connect',
      ],
    };
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
    @Query('launch') launchPatient: string,
    @Res() res: Response
  ) {
    const auth = await this.fhirAuthService.authorize(clientId, scope, redirectUri, launchPatient);
    return res.redirect(`${redirectUri}?code=${auth.code}&state=${state}`);
  }

  @Post('oauth/token')
  async token(
    @Body('grant_type') grantType: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('scope') scope: string,
    @Body('code') code: string,
    @Body('patient') patient: string,
  ) {
    return this.fhirAuthService.generateToken(grantType, clientId, clientSecret, scope, code, patient);
  }

  // ==========================================
  // PATIENT
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Patient.read')
  @Get('Patient')
  searchPatients(@Query() query: any, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.searchPatients(query, this.getBaseUrl(req), patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Patient.read')
  @Get('Patient/:id')
  async getPatient(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    this.enforcePatientAccess(req, id);
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
    const patientContext = this.getPatientContext(req);
    return this.fhirService.searchEncounters(query, this.getBaseUrl(req), patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Encounter.read')
  @Get('Encounter/:id')
  async getEncounter(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.getEncounter(id, patientContext);
  }

  // ==========================================
  // OBSERVATION
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Observation.read')
  @Get('Observation')
  searchObservations(@Query() query: any, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.searchObservations(query, this.getBaseUrl(req), patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Observation.read')
  @Get('Observation/:id')
  async getObservation(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.getObservation(id, patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Observation.write')
  @Post('Observation')
  async createObservation(@Body() body: any, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.createObservation(body, patientContext);
  }

  // ==========================================
  // CONDITION
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Condition.read')
  @Get('Condition')
  searchConditions(@Query() query: any, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.searchConditions(query, this.getBaseUrl(req), patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Condition.read')
  @Get('Condition/:id')
  async getCondition(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.getCondition(id, patientContext);
  }

  // ==========================================
  // ALLERGY INTOLERANCE
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/AllergyIntolerance.read')
  @Get('AllergyIntolerance')
  searchAllergies(@Query() query: any, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.searchAllergies(query, this.getBaseUrl(req), patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/AllergyIntolerance.read')
  @Get('AllergyIntolerance/:id')
  async getAllergy(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.getAllergy(id, patientContext);
  }

  // ==========================================
  // MEDICATION REQUEST
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/MedicationRequest.read')
  @Get('MedicationRequest')
  searchMedicationRequests(@Query() query: any, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.searchMedicationRequests(query, this.getBaseUrl(req), patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/MedicationRequest.read')
  @Get('MedicationRequest/:id')
  async getMedicationRequest(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.getMedicationRequest(id, patientContext);
  }

  // ==========================================
  // PROCEDURE
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Procedure.read')
  @Get('Procedure')
  searchProcedures(@Query() query: any, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.searchProcedures(query, this.getBaseUrl(req), patientContext);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('patient/Procedure.read')
  @Get('Procedure/:id')
  async getProcedure(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const patientContext = this.getPatientContext(req);
    return this.fhirService.getProcedure(id, patientContext);
  }

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================
  @UseGuards(FhirAuthGuard)
  @FhirScope('system/Subscription.read')
  @Get('Subscription')
  listSubscriptions(@Req() req: Request) {
    return this.fhirService.listSubscriptions(this.getBaseUrl(req));
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('system/Subscription.read')
  @Get('Subscription/:id')
  getSubscription(@Param('id') id: string) {
    return this.fhirService.getSubscription(id);
  }

  @UseGuards(FhirAuthGuard)
  @FhirScope('system/Subscription.write')
  @Post('Subscription')
  createSubscription(@Body() body: any) {
    return this.fhirService.createSubscription(body);
  }

  // ==========================================
  // CDS HOOKS
  // ==========================================
  @Get('cds-services')
  getCdsServices() {
    return this.fhirService.getCdsServices();
  }

  @Post('cds-services/:id')
  handleCdsHook(@Param('id') id: string, @Body() body: any) {
    return this.fhirService.handleCdsHook(id, body);
  }
}
