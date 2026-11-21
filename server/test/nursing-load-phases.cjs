const { performance } = require('node:perf_hooks');

const phases = [
  ['facilityLockWait', 'lockRequested', 'lockAcquired'],
  ['authorization', 'lockAcquired', 'replay'],
  ['idempotency', 'replay', 'clinical'],
  ['clinicalValidation', 'clinical', 'duplicateCheck'],
  ['duplicateCheck', 'duplicateCheck', 'save'],
  ['saveDose', 'save', 'audit'],
  ['audit', 'audit', 'journal'],
  ['notificationJournal', 'journal', 'bodyComplete'],
  ['commit', 'bodyComplete', 'committed'],
  ['facilityLockHold', 'lockAcquired', 'committed'],
];

function traceTransaction(tx, marks) {
  const stamp = (name) => {
    marks[name] ??= performance.now();
  };
  const models = {
    encounter: { findFirst: 'clinical' },
    medicationAdministration: {
      findUnique: 'replay',
      findFirst: 'duplicateCheck',
      create: 'save',
    },
  };
  return new Proxy(tx, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === '$executeRaw') {
        return async (...args) => {
          const sql = Array.isArray(args[0]) ? (args[0][0] ?? '') : '';
          const takesFacilityLock = sql.includes(
            'pg_advisory_xact_lock(27009,',
          );
          if (takesFacilityLock) stamp('lockRequested');
          if (sql.includes('pg_advisory_xact_lock(27001)')) stamp('audit');
          if (sql.includes('pg_advisory_xact_lock(27018,')) stamp('journal');
          const result = await value.apply(target, args);
          if (takesFacilityLock) stamp('lockAcquired');
          return result;
        };
      }
      if (Object.hasOwn(models, key)) {
        return new Proxy(value, {
          get(model, method) {
            const call = Reflect.get(model, method, model);
            if (!Object.hasOwn(models[key], method))
              return typeof call === 'function' ? call.bind(model) : call;
            return (...args) => {
              stamp(models[key][method]);
              return call.apply(model, args);
            };
          },
        });
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function observeNursingPhases(service) {
  const samples = Object.fromEntries(phases.map(([name]) => [name, []]));
  let incomplete = 0;
  service.prisma = new Proxy(service.prisma, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key !== '$transaction')
        return typeof value === 'function' ? value.bind(target) : value;
      return async (work, ...options) => {
        if (typeof work !== 'function')
          return value.call(target, work, ...options);
        const marks = Object.create(null);
        const result = await value.call(
          target,
          async (tx) => {
            const body = await work(traceTransaction(tx, marks));
            marks.bodyComplete = performance.now();
            return body;
          },
          ...options,
        );
        if (marks.lockRequested === undefined) return result;
        marks.committed = performance.now();
        if (
          phases.some(
            ([, start, end]) =>
              marks[start] === undefined ||
              marks[end] === undefined ||
              marks[end] < marks[start],
          )
        ) {
          incomplete++;
          return result;
        }
        for (const [name, start, end] of phases)
          samples[name].push(marks[end] - marks[start]);
        return result;
      };
    },
  });
  return () => ({ samples, incomplete });
}

module.exports = { observeNursingPhases };
