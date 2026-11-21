import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../common/encryption/encryption.service';
import { decryptPatientRelations } from './prisma.extension';

describe('patient relation decryption', () => {
  it('decrypts nested patient fields while preserving dates and unrelated records', () => {
    const encryption = new EncryptionService(
      new ConfigService({
        ENCRYPTION_KEY: 'synthetic-encryption-key-for-test-only',
        ENCRYPTION_SALT: 'synthetic-salt',
      }),
    );
    const date = new Date();
    const phone = encryption.encrypt('0912345678');
    const result = decryptPatientRelations(
      { encounter: { patient: { phone } }, createdAt: date, other: { phone } },
      encryption,
    );
    expect(result.encounter.patient.phone).toBe('0912345678');
    expect(result.other.phone).toBe(phone);
    expect(result.createdAt).toBe(date);
  });
});
