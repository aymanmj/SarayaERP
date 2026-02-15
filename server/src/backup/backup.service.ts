
import { Injectable, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: Date;
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir = '/backups';
  private readonly triggerBackupFile = path.join(this.backupDir, 'trigger_backup');
  private readonly triggerRestoreFile = path.join(this.backupDir, 'trigger_restore');
  private readonly statusFile = path.join(this.backupDir, 'worker_status.json');

  onModuleInit() {
    this.ensureBackupDir();
  }

  private ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      try {
        fs.mkdirSync(this.backupDir, { recursive: true });
      } catch (e) {
        this.logger.error('Failed to create backup directory', e);
      }
    }
  }

  /**
   * List all backup files (.sql.gz)
   */
  async getBackups(): Promise<BackupFile[]> {
    try {
      const files = await readdir(this.backupDir);
      const backupFiles = files.filter(f => f.endsWith('.sql.gz'));

      const backups: BackupFile[] = [];
      for (const file of backupFiles) {
        try {
          const stats = await stat(path.join(this.backupDir, file));
          backups.push({
            filename: file,
            size: stats.size,
            createdAt: stats.mtime,
          });
        } catch (e) {
            // Ignore file if stat fails
        }
      }

      // Sort by date desc
      return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (e) {
      this.logger.error('Error listing backups', e);
      throw new InternalServerErrorException('Failed to list backups');
    }
  }

  /**
   * Trigger a manual backup immediately
   */
  async createBackup(): Promise<{ message: string }> {
    try {
      if (fs.existsSync(this.triggerBackupFile)) {
         return { message: 'Backup already queued' };
      }
      // Write empty trigger file
      await writeFile(this.triggerBackupFile, '');
      this.logger.log('Backup triggered manually');
      return { message: 'Backup started' };
    } catch (e) {
      this.logger.error('Failed to trigger backup', e);
      throw new InternalServerErrorException('Failed to trigger backup');
    }
  }

  /**
   * Trigger a restore operation
   */
  async restoreBackup(filename: string): Promise<{ message: string }> {
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new InternalServerErrorException('Backup file not found');
    }

    try {
       // Write filename to trigger restore
       await writeFile(this.triggerRestoreFile, filename);
       this.logger.warn(`Restore triggered for ${filename}`);
       return { message: 'Restore process started' };
    } catch (e) {
      this.logger.error('Failed to trigger restore', e);
      throw new InternalServerErrorException('Failed to trigger restore');
    }
  }

  /**
   * Delete a backup file
   */
  async deleteBackup(filename: string): Promise<void> {
    // Basic sanity check to prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(this.backupDir, safeFilename);

    try {
      if (fs.existsSync(filePath)) {
        await unlink(filePath);
        this.logger.log(`Backup deleted: ${safeFilename}`);
      }
    } catch (e) {
      this.logger.error('Failed to delete backup', e);
      throw new InternalServerErrorException('Failed to delete backup');
    }
  }

  /**
   * Get worker status
   */
  async getStatus(): Promise<any> {
    try {
        if (fs.existsSync(this.statusFile)) {
            const content = await readFile(this.statusFile, 'utf8');
            return JSON.parse(content);
        }
        return { status: 'unknown' };
    } catch (e) {
        return { status: 'error', error: e.message };
    }
  }

  /**
   * Automated Daily Backup at 03:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyBackup() {
    this.logger.log('Starting automated daily backup...');
    await this.createBackup();
  }
}
