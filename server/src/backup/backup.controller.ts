
import { Controller, Get, Post, Delete, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // Strickland Admin Only
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  async getBackups() {
    return this.backupService.getBackups();
  }

  @Post()
  async createBackup() {
    return this.backupService.createBackup();
  }

  @Get('status')
  async getStatus() {
    return this.backupService.getStatus();
  }

  @Post(':filename/restore')
  async restoreBackup(@Param('filename') filename: string) {
    // Extra safety: Verify filename format
    if (!filename.match(/^saraya_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/)) {
        throw new HttpException('Invalid backup filename format', HttpStatus.BAD_REQUEST);
    }
    return this.backupService.restoreBackup(filename);
  }

  @Delete(':filename')
  async deleteBackup(@Param('filename') filename: string) {
    if (!filename.match(/^saraya_backup_.*\.sql\.gz$/)) {
        throw new HttpException('Invalid backup filename format', HttpStatus.BAD_REQUEST);
    }
    await this.backupService.deleteBackup(filename);
    return { message: 'Backup deleted' };
  }
}
