// src/accounting/dto/journal-entry.dto.ts

import { AccountingSourceModule } from '@prisma/client';

export class JournalEntrySummaryDto {
  id: number;
  entryNo: string;
  date: string; // ISO string
  description: string | null;
  sourceModule: AccountingSourceModule;
  reference: string | null;
  totalDebit: number;
  totalCredit: number;
  createdByName: string;
}

export class JournalEntryLineDto {
  lineNo: number | null;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string | null;
}

export class JournalEntryDetailDto extends JournalEntrySummaryDto {
  lines: JournalEntryLineDto[];
}
