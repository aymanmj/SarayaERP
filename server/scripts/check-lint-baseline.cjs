const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'eslint-baseline.json');

function errorCounts(results, base = root) {
  const files = {};
  for (const result of results) {
    const file = path.relative(base, result.filePath).split(path.sep).join('/');
    const counts = {};
    for (const message of result.messages) {
      if (message.severity !== 2) continue;
      const rule = message.ruleId || '<fatal>';
      counts[rule] = (counts[rule] || 0) + 1;
    }
    if (Object.keys(counts).length) {
      files[file] = Object.fromEntries(Object.entries(counts).sort());
    }
  }
  return Object.fromEntries(Object.entries(files).sort());
}

function regressions(current, baseline) {
  const failures = [];
  for (const [file, rules] of Object.entries(current)) {
    for (const [rule, count] of Object.entries(rules)) {
      const previous = baseline[file]?.[rule] || 0;
      // Parser/configuration errors must never be accepted as technical debt.
      if (rule === '<fatal>' || count > previous) {
        failures.push(`${file}: ${rule}: ${count} errors (baseline: ${previous})`);
      }
    }
  }
  return failures;
}

async function main() {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: root, fix: false });
  const results = await eslint.lintFiles(['{src,apps,libs,test}/**/*.ts']);
  if (!results.length) throw new Error('ESLint did not inspect any files');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (baseline.version !== 1 || !baseline.files) {
    throw new Error('Unsupported ESLint baseline');
  }
  const current = errorCounts(results);
  const failures = regressions(current, baseline.files);
  const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
  const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
  console.log(`ESLint: ${results.length} files, ${errors} existing errors, ${warnings} warnings`);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--update-baseline')) {
    fs.writeFileSync(baselinePath, JSON.stringify({ version: 1, files: current }, null, 2) + '\n');
    console.log('Baseline reduced. Increases cannot be recorded by this command.');
  }
  console.log('No new ESLint errors per file and rule. Existing debt remains to be fixed.');
}

module.exports = { errorCounts, regressions };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
