import {
  auditRecordHash,
  sanitizeAuditData,
  type ChainedAuditRecord,
} from './audit-chain';

describe('audit chain content protection', () => {
  it('redacts credentials and personal identifiers recursively', () => {
    expect(
      sanitizeAuditData({
        passwordHash: 'private',
        nested: [
          { refreshToken: 'private', phone: 'private', amount: '12.000' },
        ],
      }),
    ).toEqual({
      passwordHash: '[REDACTED]',
      nested: [
        { refreshToken: '[REDACTED]', phone: '[REDACTED]', amount: '12.000' },
      ],
    });
  });

  it('detects payload tampering, including changing only a monetary amount', () => {
    const record: ChainedAuditRecord = {
      previousHash: 'GENESIS',
      hospitalId: 1,
      action: 'UPDATE',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      details: { _chainVersion: 2, payload: {} },
      newValues: { amount: '10.000' },
    };
    expect(auditRecordHash(record)).not.toBe(
      auditRecordHash({ ...record, newValues: { amount: '100.000' } }),
    );
    expect(auditRecordHash(record)).not.toBe(
      auditRecordHash({ ...record, hospitalId: 2 }),
    );
  });

  it('uses deterministic object key ordering', () => {
    const base = {
      previousHash: 'GENESIS',
      action: 'CREATE',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(
      auditRecordHash({
        ...base,
        details: { _chainVersion: 2, payload: { a: 1, b: 2 } },
      }),
    ).toBe(
      auditRecordHash({
        ...base,
        details: { payload: { b: 2, a: 1 }, _chainVersion: 2 },
      }),
    );
  });
});
