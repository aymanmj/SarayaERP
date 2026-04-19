// src/cdss/cds-hooks.controller.ts
import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CDSSService } from './cdss.service';
import { Public } from '../licensing/license.decorator';
import { RequireFeature } from '../licensing/license.decorator';

@ApiTags('CDS-Hooks')
@Controller('cds-services')
// Note: CDS Hooks typically handles its own auth via JWT passed in headers,
// but for standard discovery it can be public or require a specific tier.
@RequireFeature('CDSS_ENGINE')
export class CdsHooksController {
  constructor(private readonly cdssService: CDSSService) {}

  @Public() // Discovery endpoint is usually public or loosely authenticated
  @Get()
  @ApiOperation({ summary: 'Discovery endpoint for CDS Hooks services' })
  getDiscovery() {
    return {
      services: [
        {
          hook: 'order-select',
          name: 'Saraya Medication Safety',
          description: 'Checks for drug interactions, allergies, and duplicate therapies.',
          id: 'medication-safety',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
            medications: 'MedicationStatement?patient={{context.patientId}}',
          },
        },
      ],
    };
  }

  @Post(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invoke a CDS service' })
  async invokeService(@Param('id') id: string, @Body() body: any) {
    if (id !== 'medication-safety') {
      return { cards: [] };
    }

    const cards: any[] = [];
    const context = body.context;
    
    // In a real CDS-Hook integration, we parse FHIR resources from prefetch/context.
    // For this boilerplate, we adapt our existing CDSS check to the cards format.
    // Assuming context provides patientId and selected drugs.

    if (context && context.patientId && context.draftOrders) {
      // Very basic pseudo-mapping
      const genericNames = context.draftOrders.map((d: any) => d.genericName);
      
      const interactions = await this.cdssService.checkDrugInteractions(genericNames);
      
      for (const alert of interactions) {
        cards.push({
          summary: alert.message,
          indicator: alert.severity === 'CRITICAL' ? 'critical' : 'warning',
          detail: alert.messageAr,
          source: {
            label: 'Saraya CDSS Engine',
            url: 'https://saraya-erp.com',
          },
        });
      }
    }

    return { cards };
  }
}
