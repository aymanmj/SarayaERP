// server/src/accounting/dto/income-statement.dto.ts

export type IncomeStatementRowDto = {
  accountId: number;
  code: string;
  name: string;
  type: string; // REVENUE | EXPENSE | CONTRA_REVENUE
  debit: number;
  credit: number;
  net: number; // صافي الحركة لهذا الحساب (موجب)
};

export type IncomeStatementDto = {
  financialYearId?: number | null;
  fromDate: string;
  toDate: string;
  revenues: IncomeStatementRowDto[];
  expenses: IncomeStatementRowDto[];
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
};
