import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SoftDeleteService } from '../common/soft-delete.service';

import { MpiController } from './mpi.controller';
import { MpiService } from './mpi.service';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [PrismaModule, IntegrationModule],
  controllers: [PatientsController, MpiController],
  providers: [PatientsService, SoftDeleteService, MpiService],
  exports: [PatientsService, MpiService],
})
export class PatientsModule {}
