# Quality gates

The build workflow runs for pull requests, main pushes and manual dispatches.
Pull requests run checks without publishing Docker images. The gates include
translation key balance, controller security declarations, migration-entrypoint
regressions, Prisma generation/validation, server compilation, unit tests, the
client production build and client tests.

## ESLint technical debt

The initial server audit on 2026-10-27 found **5,473 errors and 628 warnings**.
These are existing defects, mostly unsafe TypeScript operations. They have not
been fixed or reclassified as warnings by this change.

- `npm run lint`: full non-mutating lint check; currently fails on existing debt.
- `npm run lint:fix`: explicitly applies available automatic fixes.
- `npm run lint:ci`: blocks any increase in errors for each file/rule pair and
  all fatal parser/configuration errors. New files have a zero-error allowance.
  Unchanged debt is reported, rather than discarded with `|| true`.
- `node scripts/check-lint-baseline.cjs --update-baseline`: after fixing debt,
  lowers the committed baseline. The command refuses to record increases.
- `node --test scripts/check-lint-baseline.test.cjs`: verifies the gate itself.

Run these commands from `server/`. Review any changes to `eslint-baseline.json`;
do not increase allowances to make new errors pass. Count-based baselines cannot
distinguish a replaced error from an old error under the same file/rule, so code
review remains necessary. The eventual goal is a zero baseline and plain ESLint.

The controller declaration scan is static. It does not prove runtime tenant
isolation or replace database-backed integration/security tests. Prisma schema
validation does not prove that a deployed database has no drift or that a
migration can be applied safely to existing patient records.
