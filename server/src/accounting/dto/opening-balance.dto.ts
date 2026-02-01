// src/accounting/dto/opening-balance.dto.ts

export type OpeningBalanceLineDto = {
  accountId: number;
  debit: number;
  credit: number;
  description?: string;
};

export type SaveOpeningBalancesDto = {
  financialYearId: number;
  entryDate?: string; // مثال: "2025-01-01"
  lines: OpeningBalanceLineDto[];
};
