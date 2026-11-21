import { BadRequestException } from '@nestjs/common';
export type ConsumptionFailureCode =
  | 'COST_INVALID'
  | 'SOURCE_NOT_CONFIGURED'
  | 'WAREHOUSE_UNAVAILABLE'
  | 'STOCK_INSUFFICIENT'
  | 'SUMMARY_INSUFFICIENT'
  | 'ACCOUNT_MAPPING_INVALID'
  | 'ACCOUNTING_POSTING_FAILED';
export class ConsumptionFailure extends BadRequestException {
  constructor(readonly code: ConsumptionFailureCode) {
    super(code);
  }
}
