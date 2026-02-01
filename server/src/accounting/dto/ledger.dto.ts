// src/accounting/dto/ledger.dto.ts

import { AccountingSourceModule } from '@prisma/client';

export type LedgerLineDto = {
  id: number;
  entryDate: Date;
  description: string | null;
  reference: string | null;
  sourceModule: AccountingSourceModule | null;
  sourceId: number | null;

  debit: number;
  credit: number;
  balance: number; // الرصيد بعد هذا القيد (running balance)
  isOpening?: boolean;
};

export type LedgerResponseDto = {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;

  from: Date;
  to: Date;

  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;

  lines: LedgerLineDto[];
};
