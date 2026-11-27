import { createHash, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as jwt from 'jsonwebtoken';
import { LicenseService, type LicensePayload } from './license.service';

describe('Signed license expiry integrity', () => {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  let folder: string;
  let licensePath: string;
  let previousPath: string | undefined;
  let previousBypass: string | undefined;
  let service: LicenseService;
  const hwId = 'synthetic-license-test-machine';
  const hospitalName = 'Synthetic License Hospital';
  const sign = (expiryDate: string, patch: Partial<LicensePayload> = {}) =>
    jwt.sign(
      {
        hwId,
        hospitalName,
        hwFingerprint: createHash('sha256')
          .update(`${hwId}::${hospitalName}`)
          .digest('hex'),
        expiryDate,
        plan: 'PRO',
        maxUsers: 10,
        modules: [],
        ...patch,
      },
      keys.privateKey,
      { algorithm: 'RS256' },
    );

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'saraya-license-security-'));
    licensePath = path.join(folder, 'saraya.lic');
    previousPath = process.env.LICENSE_PATH;
    previousBypass = process.env.LICENSE_BYPASS;
    process.env.LICENSE_PATH = licensePath;
    process.env.LICENSE_BYPASS = 'false';
    service = new LicenseService();
    Object.assign(service, { _publicKey: keys.publicKey, _machineId: hwId });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (previousPath === undefined) delete process.env.LICENSE_PATH;
    else process.env.LICENSE_PATH = previousPath;
    if (previousBypass === undefined) delete process.env.LICENSE_BYPASS;
    else process.env.LICENSE_BYPASS = previousBypass;
    if (
      path.dirname(path.resolve(folder)) !== path.resolve(os.tmpdir()) ||
      !path.basename(folder).startsWith('saraya-license-security-')
    )
      throw new Error('Unexpected test directory');
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('ignores forged metadata extending an expired signed key', () => {
    fs.writeFileSync(licensePath, sign('2000-01-01'));
    fs.writeFileSync(
      path.join(folder, 'renewal.meta.json'),
      JSON.stringify({ bonusDays: 99999, adjustedExpiryDate: '2099-12-31' }),
    );
    expect(service.getStatus(true)).toMatchObject({
      isValid: false,
      isExpired: true,
    });
  });

  it('uses the signed date and cannot stack days by replaying renewal', () => {
    expect(service.activateLicense(sign('2040-01-01')).success).toBe(true);
    const renewal = sign('2041-01-01');
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(service.renewLicense(renewal)).toMatchObject({
        success: true,
        newExpiryDate: '2041-01-01',
        bonusDays: 0,
      });
      expect(service.getStatus(true).expiryDate).toBe('2041-01-01');
    }
    expect(fs.existsSync(path.join(folder, 'renewal.meta.json'))).toBe(false);
  });

  it.each(['not-a-date', '2040-02-30', '2041-02-29', '2040-13-01'])(
    'rejects invalid signed date %s without replacing the current key',
    (invalidDate) => {
      const original = sign('2040-01-01');
      fs.writeFileSync(licensePath, original);
      expect(service.renewLicense(sign(invalidDate)).success).toBe(false);
      expect(service.activateLicense(sign(invalidDate)).success).toBe(false);
      expect(fs.readFileSync(licensePath, 'utf8')).toBe(original);
    },
  );

  it('rejects wrong-machine and altered signatures', () => {
    expect(
      service.renewLicense(sign('2040-01-01', { hwId: 'other-machine' }))
        .success,
    ).toBe(false);
    const token = sign('2040-01-01');
    const parts = token.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ expiryDate: '2099-01-01' }),
    ).toString('base64url');
    expect(service.activateLicense(parts.join('.')).success).toBe(false);
  });

  it('preserves the current signed key if persisting its replacement fails', () => {
    const original = sign('2040-01-01');
    fs.writeFileSync(licensePath, original);
    jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('synthetic storage failure');
    });
    expect(service.renewLicense(sign('2041-01-01')).success).toBe(false);
    expect(fs.readFileSync(licensePath, 'utf8')).toBe(original);
    expect(fs.readdirSync(folder)).toEqual(['saraya.lic']);
  });

  it('rejects downgrading or backdating an active valid license', () => {
    const active = sign('2041-06-01');
    expect(service.activateLicense(active).success).toBe(true);
    expect(service.activateLicense(sign('2040-01-01')).success).toBe(false);
    expect(service.renewLicense(sign('2000-01-01')).success).toBe(false);
    expect(service.getStatus(true).expiryDate).toBe('2041-06-01');
  });
});
