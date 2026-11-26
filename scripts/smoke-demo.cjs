// Live HTTP smoke test against http://localhost:5173 (Vite proxy -> Backend port 3000)
const http = require('node:http');

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const bodyStr = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: {
          ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          'X-Client-Name': 'saraya-demo-smoke',
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            // HTML or plain text
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            json,
          });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout: ${urlStr}`));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function mergeCookies(prevCookie, setCookieHeaders) {
  const jar = new Map();
  if (prevCookie) {
    for (const pair of prevCookie.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  if (Array.isArray(setCookieHeaders)) {
    for (const sc of setCookieHeaders) {
      const first = sc.split(';')[0];
      const idx = first.indexOf('=');
      if (idx > 0) jar.set(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
    }
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function unwrap(body) {
  if (body && typeof body === 'object' && 'data' in body && 'success' in body) {
    return body.data;
  }
  return body;
}

async function login(username, password) {
  const res = await request('http://localhost:5173/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed for ${username}: HTTP ${res.status} ${res.text}`);
  }
  const cookie = mergeCookies('', res.headers['set-cookie']);
  return { cookie, data: unwrap(res.json) };
}

async function main() {
  const results = [];
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail });
      console.log(`PASS | ${name}${detail ? ` -> ${detail}` : ''}`);
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
      console.error(`FAIL | ${name} -> ${err.message}`);
    }
  };

  await check('Frontend HTML (http://localhost:5173/)', async () => {
    const res = await request('http://localhost:5173/');
    if (res.status !== 200 || !res.text.includes('<!doctype html')) {
      throw new Error(`Expected 200 HTML, got ${res.status}`);
    }
    return 'HTTP 200';
  });

  await check('Backend Health (/api/health)', async () => {
    const res = await request('http://localhost:5173/api/health');
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  });

  const adminSession = await login('admin', 'admin123');
  const adminCookie = adminSession.cookie;

  await check('License Status (ENTERPRISE bypass)', async () => {
    const res = await request('http://localhost:5173/api/license/status', { cookie: adminCookie });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = unwrap(res.json);
    if (!data?.isValid) throw new Error(`License not valid: ${JSON.stringify(data)}`);
    return `${data.plan} / valid=${data.isValid}`;
  });

  const endpoints = [
    ['Dashboard Stats', '/api/dashboard/stats?period=month'],
    ['Patients List', '/api/patients'],
    ['Appointments List', '/api/appointments'],
    ['Encounters List', '/api/encounters'],
    ['Lab Worklist', '/api/lab/worklist'],
    ['Lab QC Lots', '/api/lab/qc/lots'],
    ['Blood Bank Inventory', '/api/blood-bank/inventory'],
    ['Radiology Worklist', '/api/radiology/worklist'],
    ['Pharmacy Worklist', '/api/pharmacy/worklist'],
    ['Surgery Cases', '/api/surgery/cases'],
    ['Surgical Packages', '/api/surgery/packages'],
    ['Billing Invoices', '/api/billing/invoices'],
    ['Accounting Trial Balance', '/api/accounting/trial-balance'],
    ['Accounting Income Statement', '/api/accounting/income-statement'],
    ['Insurance Pre-Auths', '/api/insurance/pre-auth'],
    ['HR Staff Credentials', '/api/hr/credentials'],
    ['Biometric ADMS Devices', '/api/attendance/biometric/devices'],
  ];

  for (const [label, path] of endpoints) {
    await check(label, async () => {
      const res = await request(`http://localhost:5173${path}`, { cookie: adminCookie });
      if (res.status !== 200) {
        throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 200)}`);
      }
      const data = unwrap(res.json);
      const summary = Array.isArray(data)
        ? `count=${data.length}`
        : data && typeof data === 'object'
          ? `keys=${Object.keys(data).slice(0, 4).join(',')}`
          : String(data);
      return summary;
    });
  }

  await check('Audit Integrity Chain (/api/audit/integrity-check)', async () => {
    const res = await request('http://localhost:5173/api/audit/integrity-check', { cookie: adminCookie });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = unwrap(res.json);
    if (!data?.valid) throw new Error(`Audit chain invalid: ${JSON.stringify(data)}`);
    return data.message || 'valid=true';
  });

  // Multi-branch switch test (MAIN -> BEN-01 -> MAIN)
  await check('Multi-Branch Switch (MAIN <-> BEN-01)', async () => {
    const branches = adminSession.data?.accessibleBranches || [];
    const ben = branches.find((b) => b.code === 'BEN-01');
    const main = branches.find((b) => b.code === 'MAIN');
    if (!ben || !main) throw new Error(`Branches missing: ${JSON.stringify(branches)}`);

    const sw1 = await request('http://localhost:5173/api/auth/switch-branch', {
      method: 'POST',
      cookie: adminCookie,
      body: { targetHospitalId: ben.id },
    });
    if (sw1.status !== 200 && sw1.status !== 201) {
      throw new Error(`Switch to BEN-01 failed: HTTP ${sw1.status} ${sw1.text}`);
    }
    const c2 = mergeCookies(adminCookie, sw1.headers['set-cookie']);

    const sw2 = await request('http://localhost:5173/api/auth/switch-branch', {
      method: 'POST',
      cookie: c2,
      body: { targetHospitalId: main.id },
    });
    if (sw2.status !== 200 && sw2.status !== 201) {
      throw new Error(`Switch back to MAIN failed: HTTP ${sw2.status} ${sw2.text}`);
    }
    return `Switched MAIN(${main.id}) -> BEN-01(${ben.id}) -> MAIN(${main.id})`;
  });

  // Role accounts login verification
  const roleUsers = ['dr_ahmed', 'nurse_laila', 'cashier_mo', 'acc_samir', 'pharm_ali', 'lab_user', 'rad_user'];
  for (const u of roleUsers) {
    await check(`Role Login (${u})`, async () => {
      const s = await login(u, '123456');
      return `roles=[${(s.data?.user?.roles || []).join(',')}]`;
    });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== DEMO SMOKE SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal smoke error:', err);
  process.exit(1);
});
