import { Module } from '@nestjs/common';
import { DischargeSummaryController } from './discharge-summary.controller';
import { DischargeSummaryService } from './discharge-summary.service';

@Module({
  controllers: [DischargeSummaryController],
  providers: [DischargeSummaryService]
})
export class DischargeSummaryModule {}
