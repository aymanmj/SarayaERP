// server/src/common/utils/tafqeet.util.spec.ts
import { tafqeetArabic, tafqeetVoucher } from './tafqeet.util';

describe('tafqeet.util (Arabic Financial Wording & Voucher Formatter)', () => {
  it('formats zero amounts accurately in LYD and USD', () => {
    expect(tafqeetArabic(0, { currency: 'LYD' })).toBe('صفر دينار ليبي');
    expect(tafqeetVoucher(0, 'LYD')).toBe('فقط صفر دينار ليبي لا غير');
    expect(tafqeetVoucher('0.00', 'USD')).toBe('فقط صفر دولار أمريكي لا غير');
  });

  it('formats singular, dual, and plural whole amounts in LYD', () => {
    expect(tafqeetArabic(1)).toBe('دينار ليبي');
    expect(tafqeetArabic(2)).toBe('ديناران ليبيان');
    expect(tafqeetArabic(5)).toBe('خمسة دنانير ليبية');
    expect(tafqeetArabic(15)).toBe('خمسة عشر دينار ليبي');
  });

  it('formats exact decimal dirhams (3 decimals) using Money rounding without float drift', () => {
    expect(tafqeetArabic('1250.500', { currency: 'LYD' })).toBe(
      'ألف ومائتان وخمسون دينار ليبي وخمسمائة درهم',
    );
    expect(tafqeetVoucher('1250.500', 'LYD')).toBe(
      'فقط ألف ومائتان وخمسون دينار ليبي وخمسمائة درهم لا غير',
    );
    expect(tafqeetArabic('0.001')).toBe('درهم');
    expect(tafqeetArabic('0.002')).toBe('درهمان');
    expect(tafqeetArabic('0.005')).toBe('خمسة دراهم');
  });

  it('supports negative values and multi-currency vouchers (USD, EUR, SAR)', () => {
    expect(tafqeetArabic('-45.250')).toBe(
      'سالب خمسة وأربعون دينار ليبي ومائتان وخمسون درهم',
    );
    expect(tafqeetVoucher('100.25', 'USD')).toBe(
      'فقط مائة دولار أمريكي وخمسة وعشرون سنت لا غير',
    );
    expect(tafqeetVoucher('2500.50', { currency: 'SAR' })).toBe(
      'فقط ألفان وخمسمائة ريال سعودي وخمسون هللة لا غير',
    );
  });

  it('rejects out-of-range amounts', () => {
    expect(() => tafqeetArabic('1000000000000000')).toThrow(RangeError);
  });
});
