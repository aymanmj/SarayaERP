// server/src/accounting/bank-statement-parser.util.spec.ts
import {
  parseBankStatementCsv,
  parseBankStatementMt940,
} from './bank-statement-parser.util';

describe('BankStatementParserUtil (CAP09 — CSV & SWIFT MT940 Parser)', () => {
  it('parses dual-column (Debit/Credit) and signed single-column CSV statements accurately', () => {
    const dualCsv = [
      'Date,Reference,Description,Debit,Credit',
      '2026-11-10,DEP-1001,"Insurance remittance, batch 1",0,2500.500',
      '15/11/2026,FEE-2002,Monthly bank fee,15.250,0',
    ].join('\n');

    const parsedDual = parseBankStatementCsv(dualCsv);
    expect(parsedDual).toEqual([
      {
        transactionDate: '2026-11-10',
        reference: 'DEP-1001',
        description: 'Insurance remittance, batch 1',
        direction: 'CREDIT',
        amount: 2500.5,
      },
      {
        transactionDate: '2026-11-15',
        reference: 'FEE-2002',
        description: 'Monthly bank fee',
        direction: 'DEBIT',
        amount: 15.25,
      },
    ]);

    const signedCsv = [
      'Date,Ref,Description,Amount',
      '2026-11-20,POS-99,Card Settlement,1200.125',
      '2026-11-21,CHG-11,Wire Charge,-45.000',
    ].join('\n');
    const parsedSigned = parseBankStatementCsv(signedCsv);
    expect(parsedSigned[0].direction).toBe('CREDIT');
    expect(parsedSigned[0].amount).toBe(1200.125);
    expect(parsedSigned[1].direction).toBe('DEBIT');
    expect(parsedSigned[1].amount).toBe(45);
  });

  it('parses SWIFT MT940 :61: and :86: narrative blocks accurately', () => {
    const mt940 = [
      ':20:STMT20261125',
      ':25:LY990011223344',
      ':61:2611181118C4850,750NTRFNONREF//ERA-9001',
      ':86:National Insurance Clearinghouse Settlement',
      ':61:2611191119D25,000NCHGNONREF//BANK-FEE-19',
      ':86:SWIFT Wire Processing Fee',
    ].join('\n');

    const parsed = parseBankStatementMt940(mt940);
    expect(parsed).toEqual([
      {
        transactionDate: '2026-11-18',
        valueDate: '2026-11-18',
        reference: 'ERA-9001',
        description: 'National Insurance Clearinghouse Settlement',
        direction: 'CREDIT',
        amount: 4850.75,
      },
      {
        transactionDate: '2026-11-19',
        valueDate: '2026-11-19',
        reference: 'BANK-FEE-19',
        description: 'SWIFT Wire Processing Fee',
        direction: 'DEBIT',
        amount: 25,
      },
    ]);
  });
});
