// Live HTTP/HTTPS smoke test against local dev (http://localhost:5173) or Ubuntu VM production demo
// Usage:
//   node scripts/smoke-demo.cjs
//   node scripts/smoke-demo.cjs https://demo.example.com
//   node scripts/smoke-demo.cjs --base-url=http://192.168.1.50 [--skip-license]
const http = require('node:http');
const https = require('node:https');

const args = process.argv.slice(2);
const baseUrlFlag = args.find((a) => a.startsWith('--base-url='))?.slice('--base-url='.length);
const positionalUrl = args.find((a) => !a.startsWith('-'));
const SKIP_LICENSE = args.includes('--skip-license');

const BASE_URL = (baseUrlFlag || positionalUrl || process.env.DEMO_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const BASE_ORIGIN = new URL(BASE_URL).origin;

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const transport = u.protocol === 'https:' ? https : http;
    const method = options.method || 'GET';
    const bodyStr = options.body ? JSON.stringify(options.body) : null;
    const headers = {
      ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(!options.omitOrigin && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
        ? { Origin: BASE_ORIGIN }
        : {}),
      'X-Client-Name': 'saraya-demo-smoke',
      ...(options.headers || {}),
    };

    const req = transport.request(
      {
        hostname: u.hostname,
        port: u.port ? Number(u.port) : undefined,
        path: u.pathname + u.search,
        method,
        headers,
        timeout: 15000,
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

function assertSetCookieSize(res, context) {
  const headers = res.headers['set-cookie'];
  if (!Array.isArray(headers) || headers.length === 0) {
    throw new Error(`${context}: missing Set-Cookie headers`);
  }
  for (const sc of headers) {
    const first = sc.split(';')[0];
    const bytes = Buffer.byteLength(first, 'utf8');
    if (bytes >= 3800) {
      throw new Error(`${context}: cookie exceeds RFC 6265 safety margin (${bytes} bytes >= 3800): ${first.slice(0, 60)}...`);
    }
  }
}

async function login(username, password) {
  let res = await request(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    body: { username, password },
  });
  if (res.status === 429) {
    const waitSec = Math.min(Math.max(Number(res.headers['retry-after']) || 62, 5), 70);
    console.log(`INFO | Production login throttle active (${username}); waiting ${waitSec}s before retrying...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    res = await request(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: { username, password },
    });
  }
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed for ${username}: HTTP ${res.status} ${res.text}`);
  }
  assertSetCookieSize(res, `login(${username})`);
  const cookie = mergeCookies('', res.headers['set-cookie']);
  return { cookie, data: unwrap(res.json), setCookieHeaders: res.headers['set-cookie'] };
}

async function main() {
  console.log(`Target Demo URL: ${BASE_URL}\n`);
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

  await check(`Frontend HTML (${BASE_URL}/)`, async () => {
    const res = await request(`${BASE_URL}/`);
    if (res.status !== 200 || !res.text.includes('<!doctype html')) {
      throw new Error(`Expected 200 HTML, got ${res.status}`);
    }
    return 'HTTP 200';
  });

  await check('Backend Health (/api/health)', async () => {
    const res = await request(`${BASE_URL}/api/health`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  });

  await check('Backend Readiness (/api/health/ready — DB + Redis)', async () => {
    const res = await request(`${BASE_URL}/api/health/ready`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 200)}`);
    return `HTTP ${res.status}`;
  });

  const adminSession = await login('admin', 'admin123');
  const adminCookie = adminSession.cookie;

  if (!SKIP_LICENSE) {
    await check('License Status (ENTERPRISE & full modules)', async () => {
      const res = await request(`${BASE_URL}/api/license/status`, { cookie: adminCookie });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const data = unwrap(res.json);
      if (!data?.isValid) throw new Error(`License not valid: ${JSON.stringify(data)}`);
      const requiredModules = ['ACCOUNTS', 'HR', 'ASSETS', 'LAB', 'RADIOLOGY', 'PHARMACY', 'OBGYN', 'INSURANCE_INTEGRATION'];
      const mods = Array.isArray(data.modules) ? data.modules : [];
      const missingMods = requiredModules.filter((m) => !mods.includes(m));
      if (missingMods.length > 0) {
        throw new Error(`Missing modules in license status: ${missingMods.join(', ')}`);
      }
      return `${data.plan} / modules=${mods.length}`;
    });
  }

  await check('Admin Cookie Size (< 3800 bytes) & Refresh', async () => {
    assertSetCookieSize({ headers: { 'set-cookie': adminSession.setCookieHeaders } }, 'admin login');
    const rf = await request(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      cookie: adminCookie,
    });
    if (rf.status !== 200 && rf.status !== 201) {
      throw new Error(`Refresh failed: HTTP ${rf.status} ${rf.text}`);
    }
    assertSetCookieSize(rf, 'admin refresh');
    adminSession.cookie = mergeCookies(adminCookie, rf.headers['set-cookie']);
    return 'All Set-Cookie headers < 3800 bytes';
  });

  await check('Staff MFA Status & Sessions Endpoint (/api/auth/mfa/status & /sessions)', async () => {
    const mfaRes = await request(`${BASE_URL}/api/auth/mfa/status`, { cookie: adminSession.cookie });
    if (mfaRes.status !== 200) throw new Error(`/auth/mfa/status HTTP ${mfaRes.status}`);
    const mfaData = unwrap(mfaRes.json);
    if (typeof mfaData?.mfaEnabled !== 'boolean') {
      throw new Error(`Expected boolean mfaEnabled, got ${JSON.stringify(mfaData)}`);
    }

    const sessRes = await request(`${BASE_URL}/api/auth/sessions`, { cookie: adminSession.cookie });
    if (sessRes.status !== 200) throw new Error(`/auth/sessions HTTP ${sessRes.status}`);
    const sessData = unwrap(sessRes.json);
    if (typeof sessData?.mfaEnabled !== 'boolean' || !Array.isArray(sessData?.sessions)) {
      throw new Error(`Invalid sessions contract: ${JSON.stringify(sessData)}`);
    }
    return `mfaEnabled=${mfaData.mfaEnabled}, sessions=${sessData.sessions.length}`;
  });

  await check('CSRF Origin Guard (rejects Sec-Fetch-Site: cross-site cookie mutation)', async () => {
    const csrfRes = await request(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      cookie: adminSession.cookie,
      omitOrigin: true,
      headers: {
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    if (csrfRes.status !== 403) {
      throw new Error(`Expected HTTP 403 from CsrfOriginGuard, got ${csrfRes.status}: ${csrfRes.text}`);
    }
    return 'Cross-site cookie mutation blocked with 403';
  });

  const activeAdminCookie = adminSession.cookie;

  await check('Organization Settings (/api/settings/organization)', async () => {
    const res = await request(`${BASE_URL}/api/settings/organization`, { cookie: activeAdminCookie });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 200)}`);
    const data = unwrap(res.json);
    if (!data?.displayName) throw new Error(`Missing displayName: ${JSON.stringify(data)}`);
    return data.displayName;
  });

  await check('Admin Notifications (/api/notifications)', async () => {
    const res = await request(`${BASE_URL}/api/notifications`, { cookie: activeAdminCookie });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 200)}`);
    const data = unwrap(res.json);
    if (!Array.isArray(data) || data.length < 1) {
      throw new Error(`Expected >= 1 notification for admin, got ${JSON.stringify(data)}`);
    }
    return `count=${data.length}`;
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
    ['OB-GYN Antenatal Care List', '/api/obgyn/anc'],
    ['Fertility Cases List', '/api/obgyn/fertility/cases'],
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
      const res = await request(`${BASE_URL}${path}`, { cookie: activeAdminCookie });
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
    const res = await request(`${BASE_URL}/api/audit/integrity-check`, { cookie: activeAdminCookie });
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

    const sw1 = await request(`${BASE_URL}/api/auth/switch-branch`, {
      method: 'POST',
      cookie: activeAdminCookie,
      body: { targetHospitalId: ben.id },
    });
    if (sw1.status !== 200 && sw1.status !== 201) {
      throw new Error(`Switch to BEN-01 failed: HTTP ${sw1.status} ${sw1.text}`);
    }
    assertSetCookieSize(sw1, 'switch-branch -> BEN-01');
    const c2 = mergeCookies(activeAdminCookie, sw1.headers['set-cookie']);

    const sw2 = await request(`${BASE_URL}/api/auth/switch-branch`, {
      method: 'POST',
      cookie: c2,
      body: { targetHospitalId: main.id },
    });
    if (sw2.status !== 200 && sw2.status !== 201) {
      throw new Error(`Switch back to MAIN failed: HTTP ${sw2.status} ${sw2.text}`);
    }
    assertSetCookieSize(sw2, 'switch-branch -> MAIN');
    return `Switched MAIN(${main.id}) -> BEN-01(${ben.id}) -> MAIN(${main.id})`;
  });

  // Non-admin (dr_ahmed) functional checks
  await check('Doctor Functional Flow (dr_ahmed dashboard, notifications, patients)', async () => {
    const doc = await login('dr_ahmed', '123456');
    for (const p of ['/api/dashboard/stats?period=month', '/api/notifications', '/api/patients']) {
      const r = await request(`${BASE_URL}${p}`, { cookie: doc.cookie });
      if (r.status !== 200) {
        throw new Error(`dr_ahmed GET ${p} failed: HTTP ${r.status} ${r.text.slice(0, 200)}`);
      }
      if (p === '/api/notifications') {
        const list = unwrap(r.json);
        if (!Array.isArray(list) || list.length < 1) {
          throw new Error(`Expected >= 1 notification for dr_ahmed`);
        }
      }
    }
    return 'dashboard + notifications + patients HTTP 200';
  });

  // Role accounts login verification (dr_ahmed already verified above)
  const roleUsers = ['nurse_laila', 'cashier_mo', 'acc_samir', 'pharm_ali', 'lab_user', 'rad_user'];
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
