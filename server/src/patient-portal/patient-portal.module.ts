/**
 * Patient Portal Module — Enterprise Configuration
 * 
 * Dependencies:
 * - PrismaModule (database access)
 * - JwtModule (token generation)
 * - ConfigModule (environment variables)
 * - IntegrationModule (FhirService for FHIR export)
 * - AppointmentsModule (business rules for booking)
 */

import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationModule } from '../integration/integration.module';
import { AppointmentsModule } from '../appointments/appointments.module';

// Service Layer
import { PatientPortalService } from './patient-portal.service';
import { PatientOtpService } from './auth/patient-otp.service';

// Controllers
import { PortalAuthController } from './controllers/portal-auth.controller';
import { PortalMedicalController } from './controllers/portal-medical.controller';
import { PortalAppointmentsController } from './controllers/portal-appointments.controller';
import { PortalFinancialController } from './controllers/portal-financial.controller';
import { PortalFhirExportController } from './controllers/portal-fhir-export.controller';

// Auth infrastructure
import { PatientAuthGuard } from './auth/patient-auth.guard';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => IntegrationModule),
    AppointmentsModule,
  ],
  controllers: [
    PortalAuthController,
    PortalMedicalController,
    PortalAppointmentsController,
    PortalFinancialController,
    PortalFhirExportController,
  ],
  providers: [
    PatientPortalService,
    PatientOtpService,
    PatientAuthGuard,
  ],
  exports: [PatientPortalService],
})
export class PatientPortalModule {}
