/**
 * Patient Portal — FHIR R4 Export Controller
 *
 * Patient-scoped FHIR R4 read/write for mobile and integrations (e.g. Apple Health patterns).
 * Authentication: custom portal OTP + Bearer JWT — not SMART App Launch / not OAuth2.
 *
 * Discovery:
 * - GET metadata — FHIR CapabilityStatement (resource capabilities).
 * - GET .well-known/smart-configuration — small non-OAuth descriptor (issuer + pointers only);
 *   do not treat as HL7 SMART authorization metadata.
 *
 * Flow for clients:
 * 1. Read metadata and/or .well-known document.
 * 2. Obtain Bearer token via POST /patient-portal/v1/auth/verify-otp (MRN + OTP).
 * 3. Call FHIR routes with Authorization: Bearer <access_token>.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FhirService } from '../../integration/fhir/fhir.service';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';

function buildPortalCapabilityStatement(req: {
  protocol: string;
  get(name: string): string | undefined;
}) {
  const host = req.get('host');
  const baseUrl = `${req.protocol}://${host}`;
  const fhirBase = `${baseUrl}/api/patient-portal/v1/fhir`;

  return {
    resourceType: 'CapabilityStatement',
    fhirVersion: '4.0.1',
    status: 'active',
    kind: 'instance',
    implementation: {
      description: 'Saraya Medical ERP — Patient-scoped FHIR R4 API',
      url: fhirBase,
    },
    rest: [
      {
        mode: 'server',
        security: {
          description:
            'Bearer token required. Obtain via POST /api/patient-portal/v1/auth/verify-otp (custom OTP; not OAuth2).',
        },
        resource: [
          {
            type: 'Patient',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
          },
          {
            type: 'Observation',
            interaction: [
              { code: 'read' },
              { code: 'search-type' },
              { code: 'create' },
            ],
          },
          {
            type: 'Condition',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
          },
          {
            type: 'AllergyIntolerance',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
          },
          {
            type: 'MedicationRequest',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
          },
          {
            type: 'Encounter',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
          },
        ],
      },
    ],
  };
}

@ApiTags('Patient Portal — FHIR R4 (Apple Health / Health Connect)')
@Controller('patient-portal/v1/fhir')
export class PortalFhirExportController {
  constructor(private readonly fhirService: FhirService) {}

  /**
   * FHIR R4 metadata — canonical CapabilityStatement for this server base.
   */
  @Get('metadata')
  @ApiOperation({
    summary: 'FHIR CapabilityStatement (metadata)',
    description: 'بيان قدرات الخادم بتنسيق FHIR R4 — بدون OAuth',
  })
  getMetadata(@Req() req: any) {
    return buildPortalCapabilityStatement(req);
  }

  /**
   * Non-SMART discovery: explicitly not OAuth2 / not SMART App Launch.
   * Points to metadata and documents how to obtain a Bearer token.
   */
  @Get('.well-known/smart-configuration')
  @ApiOperation({
    summary: 'Portal auth & FHIR discovery (non-OAuth)',
    description:
      'وثيقة اكتشاف خاصة بالبوابة — لا تحتوي token_endpoint ولا grant_types (ليس SMART OAuth)',
  })
  getWellKnownPortalFhir(@Req() req: any) {
    const host = req.get('host');
    const baseUrl = `${req.protocol}://${host}`;
    const apiBase = `${baseUrl}/api`;

    return {
      issuer: `${apiBase}/patient-portal/v1`,
      note: 'Saraya patient portal FHIR: not SMART App Launch; no OAuth2 authorization server.',
      smart_supported: false,
      fhir_version: '4.0.1',
      capability_statement_url: `${apiBase}/patient-portal/v1/fhir/metadata`,
      token_obtain_documentation: {
        method: 'POST',
        url: `${apiBase}/patient-portal/v1/auth/verify-otp`,
        scheme: 'custom_mrn_otp_bearer',
        description:
          'Returns a portal JWT (Bearer). This is not an OAuth2 token endpoint and does not support password or authorization_code grants.',
      },
    };
  }

  // ===========================================
  //  FHIR RESOURCES (Patient-scoped)
  // ===========================================

  @Get('Patient')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'FHIR Patient Resource',
    description: 'بيانات المريض بتنسيق FHIR R4 — متوافق مع Apple Health',
  })
  async getPatient(@CurrentPatient() patient: any) {
    return this.fhirService.getPatient(patient.sub);
  }

  @Get('Observation')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'FHIR Observations (Vitals)',
    description: 'العلامات الحيوية بتنسيق FHIR R4 — متوافق مع Apple Health',
  })
  async getObservations(
    @CurrentPatient() patient: any,
    @Query() query: any,
    @Req() req: any,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/patient-portal/v1/fhir`;
    return this.fhirService.searchObservations(query, baseUrl, patient.sub);
  }

  @Post('Observation')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Write FHIR Observation',
    description:
      'كتابة قراءة من جهاز (Apple Watch, Fitbit, etc.) — يدعم Blood Pressure, Heart Rate, SpO2',
  })
  async createObservation(
    @CurrentPatient() patient: any,
    @Body() payload: any,
  ) {
    return this.fhirService.createObservation(payload, patient.sub);
  }

  @Get('Condition')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FHIR Conditions (Diagnoses)' })
  async getConditions(
    @CurrentPatient() patient: any,
    @Query() query: any,
    @Req() req: any,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/patient-portal/v1/fhir`;
    return this.fhirService.searchConditions(query, baseUrl, patient.sub);
  }

  @Get('AllergyIntolerance')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FHIR Allergy Intolerance' })
  async getAllergies(
    @CurrentPatient() patient: any,
    @Query() query: any,
    @Req() req: any,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/patient-portal/v1/fhir`;
    return this.fhirService.searchAllergies(query, baseUrl, patient.sub);
  }

  @Get('MedicationRequest')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FHIR Medication Requests (Prescriptions)' })
  async getMedicationRequests(
    @CurrentPatient() patient: any,
    @Query() query: any,
    @Req() req: any,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/patient-portal/v1/fhir`;
    return this.fhirService.searchMedicationRequests(query, baseUrl, patient.sub);
  }

  @Get('Encounter')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FHIR Encounters' })
  async getEncounters(
    @CurrentPatient() patient: any,
    @Query() query: any,
    @Req() req: any,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/patient-portal/v1/fhir`;
    return this.fhirService.searchEncounters(query, baseUrl, patient.sub);
  }

  /**
   * Bulk FHIR Export ($export)
   *
   * Returns ALL patient records as a FHIR Bundle.
   * Used by Apple Health / Health Connect for initial data sync.
   */
  @Get('$export')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bulk FHIR Export',
    description:
      'تصدير جميع سجلات المريض كـ FHIR Bundle — يُستخدم للمزامنة الأولية مع Apple Health',
  })
  async bulkExport(@CurrentPatient() patient: any, @Req() req: any) {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/patient-portal/v1/fhir`;

    const [
      patientResource,
      observations,
      conditions,
      allergies,
      medications,
      encounters,
    ] = await Promise.all([
      this.fhirService.getPatient(patient.sub),
      this.fhirService.searchObservations({}, baseUrl, patient.sub),
      this.fhirService.searchConditions({}, baseUrl, patient.sub),
      this.fhirService.searchAllergies({}, baseUrl, patient.sub),
      this.fhirService.searchMedicationRequests({}, baseUrl, patient.sub),
      this.fhirService.searchEncounters({}, baseUrl, patient.sub),
    ]);

    const allEntries: any[] = [
      {
        resource: patientResource,
        fullUrl: `${baseUrl}/Patient/${patient.sub}`,
      },
    ];

    const extractEntries = (bundle: any) => {
      if (bundle?.entry && Array.isArray(bundle.entry)) {
        return bundle.entry.map((e: any) => ({
          resource: e.resource,
          fullUrl: e.fullUrl,
        }));
      }
      return [];
    };

    allEntries.push(
      ...extractEntries(observations),
      ...extractEntries(conditions),
      ...extractEntries(allergies),
      ...extractEntries(medications),
      ...extractEntries(encounters),
    );

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: allEntries.length,
      timestamp: new Date().toISOString(),
      entry: allEntries,
    };
  }
}
