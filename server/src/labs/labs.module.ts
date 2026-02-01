import { Module } from '@nestjs/common';
import { LabService } from './labs.service';
import { LabController } from './labs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module'; // ✅ [NEW]

@Module({
  imports: [PrismaModule, AccountingModule], // ✅ [NEW]
  providers: [LabService],
  controllers: [LabController],
  exports: [LabService],
})
export class LabModule {}
