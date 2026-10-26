# Safe migration recovery

Production startup applies committed migrations with `prisma migrate deploy`.
Connection failures are retried up to five times. Errors P3005, P3009, P3018,
P3014 and P3004 stop startup immediately; the entrypoint does not baseline,
delete migration history, or run `db push --accept-data-loss`.

## Operator procedure

1. Keep the failed application instance out of service. Record the error code,
   migration name and current application image tag; redact connection strings.
2. Take a database backup and verify it can be restored into an isolated database.
   Preserve the current `_prisma_migrations` records for investigation.
3. Run `npx prisma migrate status` against the intended database. Compare its
   actual schema with the committed migrations in an isolated copy first.
4. For P3005, baseline only after verifying that the existing schema corresponds
   to the migration being marked as applied. Do not baseline based on user count.
5. For a failed migration, inspect partial changes and prepare a reviewed repair.
   Use `prisma migrate resolve` only after verifying whether the migration was
   completed or rolled back. Never assume a failed PostgreSQL migration made
   no changes.
6. Rehearse the repair and `prisma migrate deploy` on the restored copy, including
   application smoke tests. Apply the approved repair during a maintenance window.
7. Record the backup, repair commands, validation results and deployed image tag.

Do not use `prisma migrate reset`, `db push --accept-data-loss`, or delete
`_prisma_migrations` as an automatic production recovery mechanism.

## Regression check

Run `bash tests/entrypoint-migrations.test.sh` from the repository root. The test
executes the real entrypoint with fake Prisma, Node and sleep commands in a
temporary directory. It does not contact PostgreSQL or Vault.
