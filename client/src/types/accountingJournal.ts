export type JournalEntrySummary = {
  id: number;
  entryNo: string;
  date: string;
  description: string | null;
  sourceModule: string;
  reference: string | null;
  totalDebit: number;
  totalCredit: number;
  createdByName: string;
};

export type JournalEntryLine = {
  lineNo: number | null;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  note?: string | null;
};

export type JournalEntryDetail = JournalEntrySummary & {
  lines: JournalEntryLine[];
};

export type JournalListResponse = {
  items: JournalEntrySummary[];
  total: number;
};
