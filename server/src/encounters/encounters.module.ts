import { Module } from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { EncountersController } from './encounters.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SoftDeleteService } from '../common/soft-delete.service';

@Module({
  imports: [PrismaModule],
  providers: [EncountersService, SoftDeleteService,],
  controllers: [EncountersController]
})
export class EncountersModule {}

