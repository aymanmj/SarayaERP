export type LedgerLineDto = {
  date: string;
  entryId: number;
  description?: string;
  debit: number;
  credit: number;
  balance: number;
};

export type LedgerResponse = {
  account: {
    id: number;
    code: string;
    name: string;
    type: string;
  };
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  lines: LedgerLineDto[];
};
