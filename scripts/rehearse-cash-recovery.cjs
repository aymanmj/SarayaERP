// Synthetic repair-test database only. Never reads DATABASE_URL or production credentials.
// Run after the cash-control e2e suite, without another test process resetting its fixtures.
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('../server/node_modules/pg');
const container = 'saraya-repair-postgres-v2-20261106';
const sourceDatabase = 'saraya_repair_test';
const suffix = randomBytes(8).toString('hex');
const restoredDatabase = `saraya_recovery_${suffix}_test`;
const dumpPath = `/tmp/saraya-recovery-${suffix}.dump`;
const repo = path.resolve(__dirname, '..');
const reportPath = path.resolve(repo, process.argv[2] || 'scratch/acceptance-20261107/recovery.json');
const relative = path.relative(path.join(repo, 'scratch'), reportPath);
if (relative.startsWith('..') || path.isAbsolute(relative) || !reportPath.endsWith('.json')) throw new Error('Recovery report must be a JSON file within scratch');
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Docker operation failed');
  return result.stdout;
}
function connection(database) {
  return new Client({ host: '127.0.0.1', port: 15432, user: 'saraya_test', password: 'local_repair_test_only_20261106', database });
}
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
async function manifest(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const data = {};
    for (const { tablename } of tables) {
      const result = await client.query(`SELECT count(*)::integer AS rows, md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) AS digest FROM public.${quote(tablename)} t`);
      data[tablename] = result.rows[0];
    }
    const constraints = (await client.query("SELECT c.relname AS table_name, x.conname, pg_get_constraintdef(x.oid) AS definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,x.conname")).rows;
    const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
    const columns = (await client.query("SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
    const sequences = (await client.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
    await client.query('COMMIT');
    return { data, constraints, indexes, columns, sequences };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
async function financialChecks(client) {
  const result = await client.query(`SELECT
    (SELECT count(*)::integer FROM "AccountingEntry" e WHERE (SELECT COALESCE(sum(debit),0)-COALESCE(sum(credit),0) FROM "AccountingEntryLine" l WHERE l."entryId"=e.id) <> 0) AS unbalanced_journals,
    (SELECT count(*)::integer FROM "Invoice" i WHERE i.type='INVOICE' AND i."paidAmount" <> (SELECT COALESCE(sum(p.amount),0) FROM "Payment" p WHERE p."invoiceId"=i.id AND p."hospitalId"=i."hospitalId")) AS receipt_balance_mismatches,
    (SELECT count(*)::integer FROM "InvoiceRefund" r LEFT JOIN "AccountingEntry" e ON e.id=r."postingEntryId" WHERE r.status='EXECUTED' AND (e.id IS NULL OR e."hospitalId"<>r."hospitalId" OR e."postingKey" <> 'refund:'||r."hospitalId"||':'||r.id OR (SELECT COALESCE(sum(l.debit),0) FROM "AccountingEntryLine" l WHERE l."entryId"=e.id)<>r.amount OR (SELECT COALESCE(sum(l.credit),0) FROM "AccountingEntryLine" l WHERE l."entryId"=e.id)<>r.amount)) AS refund_journal_mismatches,
    (SELECT count(*)::integer FROM "CashierShiftClosing" c JOIN "CashierSession" s ON s.id=c."sessionId" WHERE c."openingCashTotal"<>s."openingAmount" OR c."systemCashTotal"<>s."openingAmount"+(SELECT COALESCE(sum(p.amount),0) FROM "Payment" p WHERE p."sessionId"=s.id AND p.method='CASH')-(SELECT COALESCE(sum(r.amount),0) FROM "InvoiceRefund" r WHERE r."sessionId"=s.id AND r.method='CASH' AND r.status='EXECUTED')-(SELECT COALESCE(sum(h.amount),0) FROM "CashHandover" h WHERE h."sessionId"=s.id AND h.status='POSTED') OR c.difference<>c."actualCashTotal"-c."systemCashTotal") AS closing_balance_mismatches,
    (SELECT count(*)::integer FROM "CashierSession" WHERE status IN ('CLOSING','CLOSED') AND ("countedById" IS NULL OR (status='CLOSED' AND "closedById"="countedById"))) AS custody_separation_mismatches,
    (SELECT count(*)::integer FROM "CashierSession" WHERE status='CLOSED' AND "custodyReference" IS NOT NULL) AS exceptional_closed_sessions,
    (SELECT count(*)::integer FROM "InvoiceRefund" WHERE status='EXECUTED') AS completed_refunds,
    (SELECT count(*)::integer FROM "InvoiceRefund" WHERE status='DISBURSING') AS unresolved_payouts,
    (SELECT count(*)::integer FROM "CashierSession" WHERE status='CLOSED') AS closed_cash_sessions,
    (SELECT count(*)::integer FROM "Payment" WHERE method='CASH' AND "sessionId" IS NULL) AS legacy_unassigned_cash_receipts`);
  return result.rows[0];
}
async function main() {
  const config = JSON.parse(docker(['inspect', container]))[0];
  const binding = config.HostConfig.PortBindings?.['5432/tcp'];
  assert.equal(config.Config.Labels?.['saraya.purpose'], 'repair-test');
  assert.equal(config.State.Running, true);
  assert.equal(binding?.length, 1);
  assert.deepEqual(binding[0], { HostIp: '127.0.0.1', HostPort: '15432' });
  assert.ok(Object.hasOwn(config.HostConfig.Tmpfs || {}, '/var/lib/postgresql/data'));
  assert.ok(config.Config.Env.includes('POSTGRES_DB=saraya_repair_test'));
  const source = connection(sourceDatabase); const restored = connection(restoredDatabase);
  let created = false; let restoredConnected = false; let dumped = false;
  const started = performance.now();
  await source.connect();
  try {
    assert.equal((await source.query('SELECT current_database() AS name')).rows[0].name, sourceDatabase);
    const checks = await financialChecks(source);
    for (const [key, value] of Object.entries(checks)) if (key.endsWith('_mismatches') || key === 'unbalanced_journals') assert.equal(value, 0, key);
    for (const key of ['completed_refunds', 'unresolved_payouts', 'closed_cash_sessions', 'exceptional_closed_sessions']) assert.ok(checks[key] > 0, 'Missing cash recovery fixture: run the cash-control e2e suite last');
    const before = await manifest(source);
    const dumpStarted = performance.now();
    docker(['exec', container, 'pg_dump', '-U', 'saraya_test', '-d', sourceDatabase, '--format=custom', '--no-owner', '--no-acl', '--file', dumpPath]); dumped = true;
    const dumpMs = Math.round(performance.now() - dumpStarted);
    assert.match(restoredDatabase, /^saraya_recovery_[0-9a-f]{16}_test$/);
    docker(['exec', container, 'createdb', '-U', 'saraya_test', '--template=template0', restoredDatabase]); created = true;
    const restoreStarted = performance.now();
    docker(['exec', container, 'pg_restore', '-U', 'saraya_test', '-d', restoredDatabase, '--exit-on-error', '--no-owner', '--no-acl', dumpPath]);
    const restoreMs = Math.round(performance.now() - restoreStarted);
    await restored.connect(); restoredConnected = true;
    assert.equal((await restored.query('SELECT current_database() AS name')).rows[0].name, restoredDatabase);
    const after = await manifest(restored);
    assert.deepEqual(after, before, 'Restored rows, schema controls or sequences differ');
    // Detect concurrent test resets or writes instead of silently certifying a changing source.
    assert.deepEqual(await manifest(source), before, 'Source changed during the recovery rehearsal');
    const restoredChecks = await financialChecks(restored); assert.deepEqual(restoredChecks, checks);
    // Exercise restored FK/CHECK/index controls, not just catalog equality.
    const row = (await restored.query('SELECT id FROM "InvoiceRefund" WHERE status=\'DISBURSING\' LIMIT 1')).rows[0];
    await assert.rejects(restored.query('UPDATE "InvoiceRefund" SET status=\'EXECUTED\' WHERE id=$1', [row.id]), { code: '23514' });
    const custody = (await restored.query('SELECT id FROM "CashierSession" WHERE status=\'CLOSED\' AND "custodyReference" IS NOT NULL LIMIT 1')).rows[0];
    await assert.rejects(restored.query('UPDATE "CashierSession" SET "closedById"="countedById" WHERE id=$1', [custody.id]), { code: '23514' });

    const report = { status: 'PASS', generatedAtUtc: new Date().toISOString(), scope: 'synthetic PostgreSQL dump/restore only; no production data, real bank payment or physical power-loss claim', sourceDatabase, restoredDatabase, tableCount: Object.keys(before.data).length, totalRows: Object.values(before.data).reduce((sum, t) => sum + t.rows, 0), schemaControlsMatched: true, allTableDigestsMatched: true, sequencesMatched: true, restoredPayoutCheckEnforced: true, restoredCustodySeparationEnforced: true, checks: restoredChecks, timingsMs: { dump: dumpMs, restore: restoreMs, total: Math.round(performance.now()-started) }, tables: before.data };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)+'\n');
    console.log(`RECOVERY_REHEARSAL_PASS: ${report.tableCount} tables; ${report.totalRows} rows; all digests, schema controls, sequences and financial checks matched`);
    console.log(`Report: ${reportPath}`);
  } finally {
    if (restoredConnected) await restored.end();
    if (created) { assert.match(restoredDatabase, /^saraya_recovery_[0-9a-f]{16}_test$/); docker(['exec', container, 'dropdb', '-U', 'saraya_test', restoredDatabase]); }
    if (dumped) { assert.match(dumpPath, /^\/tmp\/saraya-recovery-[0-9a-f]{16}\.dump$/); docker(['exec', container, 'rm', '--', dumpPath]); }
    await source.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
