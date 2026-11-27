import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { BackupService } from './backup.service';

describe('BackupService security hardening', () => {
  let service: BackupService;

  beforeEach(() => {
    service = new BackupService();
  });

  it('should reject sibling prefix paths like /backups_evil via validatePath', async () => {
    await expect(
      service.setConfig({ autoBackupPath: '/backups_evil' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.setConfig({ autoBackupPath: '/etc/passwd' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.setConfig({ autoBackupPath: '/backups/../../etc/shadow' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should accept subdirectories cleanly inside /backups', () => {
    const validatePath = Reflect.get(service, 'validatePath') as (
      targetPath: string,
    ) => string;

    expect(validatePath.call(service, '/backups')).toBe(
      path.resolve('/backups'),
    );
    expect(validatePath.call(service, '/backups/daily')).toBe(
      path.resolve('/backups/daily'),
    );
  });
});
