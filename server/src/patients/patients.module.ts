import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SoftDeleteService } from '../common/soft-delete.service';

@Module({
  imports: [PrismaModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    SoftDeleteService,  
  ],
  exports: [PatientsService],
})
export class PatientsModule {}