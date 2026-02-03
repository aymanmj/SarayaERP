import { Module } from '@nestjs/common';
import { AdmissionController } from './admission.controller';
import { AdmissionService } from './admission.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdmissionController],
  providers: [AdmissionService],
  exports: [AdmissionService],
})
export class AdmissionModule {}
