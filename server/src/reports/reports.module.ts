import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [PrismaModule, CommissionModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
