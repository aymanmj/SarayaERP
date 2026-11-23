// src/accounting/dto/opening-balance.dto.ts

export type OpeningBalanceLineDto = {
  accountId: number;
  costCenterId?: number | null;
  debit: number | string;
  credit: number | string;
  description?: string;
};

export type SaveOpeningBalancesDto = {
  financialYearId: number;
  entryDate?: string; // مثال: "2025-01-01"
  lines: OpeningBalanceLineDto[];
};
