// server/src/accounting/bank-statement-parser.util.ts
import { BadRequestException } from '@nestjs/common';
import { Money } from '../common/utils/money.util';

export interface ParsedBankStatementItem {
  transactionDate: string;
  valueDate?: string;
  reference: string;
  description: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseIsoDate(raw: string): string {
  const cleaned = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }
  const dmy = cleaned.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }
  throw new BadRequestException(`صيغة تاريخ غير صالحة في كشف البنك: ${raw}`);
}

function parseNumericAmount(raw: string): ReturnType<typeof Money.decimal> {
  const normalized = raw.trim().replace(/,/g, '').replace(/\s+/g, '');
  if (!normalized) return Money.decimal(0);
  return Money.decimal(normalized);
}

/**
 * Parses standard bank statement CSV files supporting both:
 * 1) Signed single-column: date,reference,description,amount
 * 2) Dual-column: date,reference,description,debit,credit
 */
export function parseBankStatementCsv(
  csvText: string,
): ParsedBankStatementItem[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new BadRequestException(
      'ملف كشف البنك CSV فارغ أو لا يحتوي على صفوف معاملات.',
    );
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = headers.findIndex((h) => h.includes('date'));
  const refIdx = headers.findIndex((h) => h.includes('ref'));
  const descIdx = headers.findIndex(
    (h) => h.includes('desc') || h.includes('narr') || h.includes('memo'),
  );
  const debitIdx = headers.findIndex((h) => h.includes('debit'));
  const creditIdx = headers.findIndex((h) => h.includes('credit'));
  const amountIdx = headers.findIndex((h) => h.includes('amount'));

  if (
    dateIdx === -1 ||
    (amountIdx === -1 && (debitIdx === -1 || creditIdx === -1))
  ) {
    throw new BadRequestException(
      'ترويسة CSV غير متوافقة: يجب توفر عمود Date مع Amount أو (Debit و Credit).',
    );
  }

  const items: ParsedBankStatementItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const txDate = parseIsoDate(cols[dateIdx] ?? '');
    const reference = (
      refIdx >= 0 && cols[refIdx] ? cols[refIdx] : `CSV-ROW-${i}`
    ).slice(0, 120);
    const description = (
      descIdx >= 0 && cols[descIdx] ? cols[descIdx] : reference
    ).slice(0, 250);

    let direction: 'CREDIT' | 'DEBIT';
    let absAmount: ReturnType<typeof Money.decimal>;

    if (debitIdx >= 0 && creditIdx >= 0) {
      const deb = parseNumericAmount(cols[debitIdx] ?? '0');
      const cred = parseNumericAmount(cols[creditIdx] ?? '0');
      if (cred.gt(0)) {
        direction = 'CREDIT';
        absAmount = cred;
      } else if (deb.gt(0)) {
        direction = 'DEBIT';
        absAmount = deb;
      } else {
        continue;
      }
    } else {
      const amt = parseNumericAmount(cols[amountIdx] ?? '0');
      if (amt.isZero()) continue;
      direction = amt.gt(0) ? 'CREDIT' : 'DEBIT';
      absAmount = amt.abs();
    }

    items.push({
      transactionDate: txDate,
      reference,
      description,
      direction,
      amount: Money.toDb(Money.roundDecimal(absAmount, 3)),
    });
  }

  if (!items.length) {
    throw new BadRequestException('لم يتم استخراج أي حركات مالية من ملف CSV.');
  }
  return items;
}

/**
 * Parses standard SWIFT MT940 bank statements (:61: transaction lines + optional :86: narrative lines).
 * Example :61:2611151115C1250,500NTRFNONREF//TXN-001
 */
export function parseBankStatementMt940(
  mt940Text: string,
): ParsedBankStatementItem[] {
  const lines = mt940Text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: ParsedBankStatementItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith(':61:')) continue;

    const body = line.slice(4);
    // YYMMDD[MMDD](RC|RD|C|D)[FundCode?]<AmountWithCommaOrDot><4CharTxType><Reference>
    const match = body.match(
      /^(\d{2})(\d{2})(\d{2})(?:\d{4})?(RC|RD|C|D)[A-Z]?(\d+(?:[.,]\d+)?)([A-Z0-9]{4})(.*)$/,
    );
    if (!match) {
      throw new BadRequestException(`سطر MT940 :61: غير صالح: ${line}`);
    }

    const [, yy, mm, dd, dcMark, rawAmt, txCode, rawRef] = match;
    const isoDate = `20${yy}-${mm}-${dd}`;
    const amountDec = Money.roundDecimal(rawAmt.replace(',', '.'), 3);
    if (amountDec.lte(0)) continue;

    const direction: 'CREDIT' | 'DEBIT' =
      dcMark === 'C' || dcMark === 'RD' ? 'CREDIT' : 'DEBIT';
    const reference = (rawRef.split('//').pop() || rawRef || `MT940-${i}`)
      .trim()
      .slice(0, 120);

    let description = `${txCode} ${reference}`.trim();
    if (i + 1 < lines.length && lines[i + 1].startsWith(':86:')) {
      description = lines[i + 1].slice(4).trim().slice(0, 250) || description;
    }

    items.push({
      transactionDate: isoDate,
      valueDate: isoDate,
      reference,
      description,
      direction,
      amount: Money.toDb(amountDec),
    });
  }

  if (!items.length) {
    throw new BadRequestException(
      'لم يتم العثور على سطور حركات :61: صالحة داخل ملف MT940.',
    );
  }
  return items;
}
