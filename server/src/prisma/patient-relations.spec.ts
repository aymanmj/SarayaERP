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

  it('decrypts all Patient relation aliases in the schema while preserving non-patient children nodes', () => {
    const encryption = new EncryptionService(
      new ConfigService({
        ENCRYPTION_KEY: 'synthetic-encryption-key-for-test-only',
        ENCRYPTION_SALT: 'synthetic-salt',
      }),
    );
    const encPhone = encryption.encrypt('0921112233');
    const encNationalId = encryption.encrypt('119900112233');
    const encOther = encryption.encrypt('do-not-decrypt');

    const payload = {
      guarantor: { nationalId: encNationalId },
      guaranteedPatients: [{ phone: encPhone }],
      mother: { phone: encPhone },
      children: [
        { mrn: 'MRN-100', phone: encPhone },
        { code: 'ACC-100', phone: encOther },
      ],
      localPatients: [{ phone: encPhone }],
      generatedPatient: { phone: encPhone },
      femalePatient: { nationalId: encNationalId },
      malePatient: { phone: encPhone },
      depositPatient: { phone: encPhone },
    };

    const result = decryptPatientRelations(payload, encryption);

    expect(result.guarantor.nationalId).toBe('119900112233');
    expect(result.guaranteedPatients[0].phone).toBe('0921112233');
    expect(result.mother.phone).toBe('0921112233');
    expect(result.children[0].phone).toBe('0921112233');
    expect(result.children[1].phone).toBe(encOther);
    expect(result.localPatients[0].phone).toBe('0921112233');
    expect(result.generatedPatient.phone).toBe('0921112233');
    expect(result.femalePatient.nationalId).toBe('119900112233');
    expect(result.malePatient.phone).toBe('0921112233');
    expect(result.depositPatient.phone).toBe('0921112233');
  });
});
