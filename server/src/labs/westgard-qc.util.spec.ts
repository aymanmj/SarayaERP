// server/src/labs/westgard-qc.util.spec.ts
import { evaluateWestgardRules } from './westgard-qc.util';

describe('WestgardQcUtil (CAP02 — Laboratory Westgard Multi-Rule Engine)', () => {
  it('returns PASS within ±2SD and WARNING on isolated 1-2s', () => {
    const pass = evaluateWestgardRules(101.5, 100, 2, [0.2, -0.3]);
    expect(pass).toEqual({
      zScore: '0.7500',
      status: 'PASS',
      violatedRules: [],
    });

    const warn = evaluateWestgardRules(104.5, 100, 2, [0.1]);
    expect(warn).toEqual({
      zScore: '2.2500',
      status: 'WARNING',
      violatedRules: ['1-2s'],
    });
  });

  it('triggers REJECT on 1-3s, 2-2s, R-4s, 4-1s, and 10x rules', () => {
    // 1-3s
    const r13s = evaluateWestgardRules(106.4, 100, 2, []);
    expect(r13s.status).toBe('REJECT');
    expect(r13s.violatedRules).toContain('1-3s');

    // 2-2s (same side > +2SD)
    const r22s = evaluateWestgardRules(104.4, 100, 2, [2.3]);
    expect(r22s.status).toBe('REJECT');
    expect(r22s.violatedRules).toContain('2-2s');

    // R-4s (opposite sides > 4SD span)
    const rr4s = evaluateWestgardRules(95.6, 100, 2, [2.2]);
    expect(rr4s.status).toBe('REJECT');
    expect(rr4s.violatedRules).toContain('R-4s');

    // 4-1s (4 consecutive > +1SD)
    const r41s = evaluateWestgardRules(102.5, 100, 2, [1.2, 1.4, 1.1]);
    expect(r41s.status).toBe('REJECT');
    expect(r41s.violatedRules).toContain('4-1s');

    // 10x (10 consecutive positive)
    const r10x = evaluateWestgardRules(
      100.4,
      100,
      2,
      [0.1, 0.2, 0.3, 0.2, 0.4, 0.1, 0.2, 0.5, 0.3],
    );
    expect(r10x.status).toBe('REJECT');
    expect(r10x.violatedRules).toContain('10x');
  });
});
