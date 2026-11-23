import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PatientGovernanceController } from './patient-governance.controller';
import { PatientGovernanceService } from './patient-governance.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SoftDeleteService } from '../common/soft-delete.service';

import { MpiController } from './mpi.controller';
import { MpiService } from './mpi.service';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [PrismaModule, IntegrationModule],
  controllers: [PatientGovernanceController, PatientsController, MpiController],
  providers: [
    PatientsService,
    PatientGovernanceService,
    SoftDeleteService,
    MpiService,
  ],
  exports: [PatientsService, PatientGovernanceService, MpiService],
})
export class PatientsModule {}
