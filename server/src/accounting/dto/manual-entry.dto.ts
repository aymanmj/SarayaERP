// src/accounting/dto/manual-entry.dto.ts

export type ManualEntryLineDto = {
  accountId: number;
  costCenterId?: number;
  debit: number;
  credit: number;
  description?: string;
};

export type CreateManualEntryDto = {
  entryDate: string; // "2025-01-10"
  description?: string;
  lines: ManualEntryLineDto[];
};
