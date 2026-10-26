# E2E test environment

Use an isolated, disposable PostgreSQL database whose name ends in `_test` or
`_testing`, plus an isolated Redis instance. Do not point E2E tests at development
or production databases containing useful records.

Set `NODE_ENV=test`, `DATABASE_URL`, `JWT_SECRET` and the Redis connection settings
for the test process. The database reset helper checks the mode, URL database
name, and `current_database()` before issuing any TRUNCATE. It retains migration
history and propagates reset failures so a broken setup fails the tests.

Apply committed migrations to the disposable database before running:

```sh
cd server
npm run typecheck
npm run test:helpers
npm run test:e2e -- --runInBand
```

The unit-test command `npm test` only discovers `src/**/*.spec.ts`. It does not
execute database-backed E2E tests. `test:helpers` separately exercises reset
safety with mocked database commands and performs no real reset.

The updated procurement test checks persistence, actual UOM IDs and denial of
write access for a read-only user. It no longer ignores 500 responses or catches
assertion failures. The tenant-isolation test uses typed Prisma fixtures,
staff-issuer tokens and the actual paginated patients response in both directions.
AuthHelper token permissions are synthetic fixtures: these scenarios exercise
API guards but do not verify the login/role-assignment workflow or Vault rotation.

The reset helper guard is a safeguard, not an isolation boundary. AppModule
initialization can connect to infrastructure before the reset helper runs. Always
configure dedicated services **before starting** the E2E process. Full E2E runtime
verification is required separately from TypeScript compilation and mock tests.
