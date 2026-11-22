import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

describe('BackupController (OPS05)', () => {
  let controller: BackupController;
  const backupService = {
    getBackups: jest.fn(),
    scanAllPaths: jest.fn(),
    createBackup: jest.fn(),
    restoreBackup: jest.fn(),
    deleteBackup: jest.fn(),
    getStatus: jest.fn(),
    listStoragePaths: jest.fn(),
    getConfig: jest.fn(),
    setAutoBackupPath: jest.fn(),
    setConfig: jest.fn(),
  };

  const hospitalAdmin: JwtPayload = {
    sub: 10,
    username: 'hosp-admin',
    hospitalId: 1,
    roles: ['ADMIN'],
    permissions: ['backup:view', 'backup:manage'],
    isSuperAdmin: false,
  };

  const platformAdmin: JwtPayload = {
    sub: 1,
    username: 'super-admin',
    hospitalId: 1,
    roles: ['SUPER_ADMIN'],
    permissions: ['backup:view', 'backup:manage'],
    isSuperAdmin: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [{ provide: BackupService, useValue: backupService }],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BackupController>(BackupController);
  });

  it('rejects non-platform admins across all shared backup and restore routes', async () => {
    await expect(controller.getBackups(hospitalAdmin)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(controller.scanAllPaths(hospitalAdmin)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(controller.createBackup(hospitalAdmin)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      controller.restoreBackup(
        'saraya_backup_2026-11-22_12-00-00.sql.gz',
        hospitalAdmin,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.deleteBackup(
        'saraya_backup_2026-11-22_12-00-00.sql.gz',
        hospitalAdmin,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(controller.getStatus(hospitalAdmin)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(controller.getStoragePaths(hospitalAdmin)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(controller.getAutoPath(hospitalAdmin)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      controller.setAutoPath(hospitalAdmin, { path: '/var/backups' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.setConfig(hospitalAdmin, { dualBackupEnabled: false }),
    ).rejects.toThrow(ForbiddenException);

    expect(backupService.restoreBackup).not.toHaveBeenCalled();
    expect(backupService.deleteBackup).not.toHaveBeenCalled();
  });

  it('rejects path-traversal and malformed backup filenames on restoreBackup and deleteBackup', async () => {
    const traversal = 'saraya_backup_../../etc/passwd.sql.gz';
    const invalid = 'arbitrary_backup.sql.gz';

    for (const badName of [traversal, invalid]) {
      await expect(
        controller.restoreBackup(badName, platformAdmin),
      ).rejects.toThrow(HttpException);
      try {
        await controller.deleteBackup(badName, platformAdmin);
        throw new Error('Expected HttpException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    }

    expect(backupService.restoreBackup).not.toHaveBeenCalled();
    expect(backupService.deleteBackup).not.toHaveBeenCalled();
  });

  it('allows valid timestamped filename for platform admin on restoreBackup and deleteBackup', async () => {
    const validName = 'saraya_backup_2026-11-22_12-00-00.sql.gz';
    backupService.restoreBackup.mockResolvedValue({ success: true });
    backupService.deleteBackup.mockResolvedValue(undefined);

    await expect(
      controller.restoreBackup(validName, platformAdmin, {
        storagePath: '/backups',
      }),
    ).resolves.toEqual({ success: true });
    await expect(
      controller.deleteBackup(validName, platformAdmin, {
        storagePath: '/backups',
      }),
    ).resolves.toEqual({ message: 'تم حذف النسخة بنجاح' });

    expect(backupService.restoreBackup).toHaveBeenCalledWith(
      validName,
      '/backups',
    );
    expect(backupService.deleteBackup).toHaveBeenCalledWith(
      validName,
      '/backups',
    );
  });
});
