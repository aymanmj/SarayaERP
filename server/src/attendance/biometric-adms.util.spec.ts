// server/src/attendance/biometric-adms.util.spec.ts
import {
  buildAdmsHandshakeResponse,
  hashDeviceSecret,
  isTrustedPrivateIp,
  parseAdmsAttlogLines,
  verifyDeviceSecretHash,
} from './biometric-adms.util';

describe('Biometric ADMS Utilities (Batch 24 — ZKTeco Cloud Push)', () => {
  it('allows private LAN, loopback, and Tailscale CGNAT IPs while rejecting public IPs', () => {
    expect(isTrustedPrivateIp('127.0.0.1')).toBe(true);
    expect(isTrustedPrivateIp('::ffff:192.168.1.50')).toBe(true);
    expect(isTrustedPrivateIp('10.20.30.40')).toBe(true);
    expect(isTrustedPrivateIp('172.16.5.10')).toBe(true);
    expect(isTrustedPrivateIp('100.80.12.4')).toBe(true);

    expect(isTrustedPrivateIp('8.8.8.8')).toBe(false);
    expect(isTrustedPrivateIp('172.32.0.1')).toBe(false);
    expect(isTrustedPrivateIp('')).toBe(false);
  });

  it('hashes and verifies per-device secrets in constant time', () => {
    const hash = hashDeviceSecret('zk-super-secret-2026');
    expect(hash).toHaveLength(64);
    expect(verifyDeviceSecretHash('zk-super-secret-2026', hash)).toBe(true);
    expect(verifyDeviceSecretHash('wrong-secret', hash)).toBe(false);
  });

  it('parses ZKTeco ATTLOG tab-separated lines with Africa/Tripoli (+2) timezone conversion', () => {
    const raw = [
      '1001\t2026-11-24 08:05:00\t0\t1\t0\t0',
      '1001\t2026-11-24 16:10:00\t1\t15\t0\t0',
      'invalid-line',
    ].join('\n');

    const punches = parseAdmsAttlogLines(raw, 2);
    expect(punches).toHaveLength(2);
    expect(punches[0]).toMatchObject({
      biometricId: '1001',
      punchType: 'CHECK_IN',
      verifyMode: 'FINGERPRINT',
    });
    expect(punches[0].punchTime.toISOString()).toBe('2026-11-24T06:05:00.000Z');
    expect(punches[1]).toMatchObject({
      biometricId: '1001',
      punchType: 'CHECK_OUT',
      verifyMode: 'FACE',
    });
    expect(punches[1].punchTime.toISOString()).toBe('2026-11-24T14:10:00.000Z');
  });

  it('builds standard ZKTeco ADMS handshake configuration response', () => {
    const resp = buildAdmsHandshakeResponse('ZK-HOSP-001', '999', '10');
    expect(resp).toContain('GET OPTION FROM: ZK-HOSP-001');
    expect(resp).toContain('Stamp=999');
    expect(resp).toContain('Realtime=1');
  });
});
