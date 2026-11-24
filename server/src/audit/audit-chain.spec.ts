import {
  appendChainedAudit,
  auditRecordHash,
  drainPendingAuditWrites,
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

  it('serializes background appendChainedAudit writes onto a single lane and recovers after failure', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];

    const mockPrisma = {
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          await new Promise((r) => setTimeout(r, 15));
          return await cb({
            $executeRaw: jest.fn().mockResolvedValue(1),
            auditLog: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn((args: { data: { action: string } }) => {
                order.push(args.data.action);
                if (args.data.action === 'FAIL_SECOND') {
                  return Promise.reject(new Error('simulated transient error'));
                }
                return Promise.resolve({ id: order.length });
              }),
            },
          });
        } finally {
          inFlight -= 1;
        }
      }),
    };

    const p1 = appendChainedAudit(mockPrisma as never, {
      action: 'FIRST',
      hospitalId: 1,
    });
    const p2 = appendChainedAudit(mockPrisma as never, {
      action: 'FAIL_SECOND',
      hospitalId: 1,
    });
    const p3 = appendChainedAudit(mockPrisma as never, {
      action: 'THIRD',
      hospitalId: 1,
    });

    await expect(p1).resolves.toEqual({ id: 1 });
    await expect(p2).rejects.toThrow('simulated transient error');
    await expect(p3).resolves.toEqual({ id: 3 });
    await drainPendingAuditWrites();

    expect(maxInFlight).toBe(1);
    expect(order).toEqual(['FIRST', 'FAIL_SECOND', 'THIRD']);
  });
});
