const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { errorCounts, regressions } = require('./check-lint-baseline.cjs');

test('normalizes file paths and counts errors by file and rule', () => {
  const base = path.resolve('fixture');
  const counts = errorCounts([{
    filePath: path.join(base, 'src', 'example.ts'),
    messages: [
      { severity: 2, ruleId: 'unsafe' },
      { severity: 2, ruleId: 'unsafe' },
      { severity: 1, ruleId: 'warning' },
    ],
  }], base);
  assert.deepEqual(counts, { 'src/example.ts': { unsafe: 2 } });
});

test('accepts unchanged debt and improvements', () => {
  assert.deepEqual(regressions({ a: { unsafe: 1 } }, { a: { unsafe: 2 } }), []);
  assert.deepEqual(regressions({}, { a: { unsafe: 2 } }), []);
});

test('rejects increased counts, new rules and new files', () => {
  const failures = regressions({ a: { unsafe: 3, unused: 1 }, b: { unsafe: 1 } }, { a: { unsafe: 2 } });
  assert.equal(failures.length, 3);
});

test('always rejects fatal parser errors even when listed in a baseline', () => {
  assert.equal(regressions({ a: { '<fatal>': 1 } }, { a: { '<fatal>': 1 } }).length, 1);
});
