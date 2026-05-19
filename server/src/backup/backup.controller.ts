import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  // ==========================================
  // قائمة النسخ الاحتياطية
  // ==========================================

  /** عرض جميع النسخ المتوفرة */
  @Permissions('backup:view')
  @Get()
  async getBackups() {
    return this.backupService.getBackups();
  }

  /** البحث في جميع الأقراص المتاحة عن نسخ احتياطية */
  @Permissions('backup:manage')
  @Post('scan')
  async scanAllPaths() {
    return this.backupService.scanAllPaths();
  }

  // ==========================================
  // إنشاء نسخة احتياطية
  // ==========================================

  /** إنشاء نسخة احتياطية (مع إمكانية تحديد المسار + نسخ مزدوج) */
  @Permissions('backup:manage')
  @Post()
  async createBackup(
    @Body() body?: { targetPath?: string; secondaryPath?: string },
  ) {
    return this.backupService.createBackup(
      body?.targetPath,
      body?.secondaryPath,
    );
  }

  // ==========================================
  // الاستعادة
  // ==========================================

  /** استعادة نسخة احتياطية */
  @Permissions('backup:manage')
  @Post(':filename/restore')
  async restoreBackup(
    @Param('filename') filename: string,
    @Body() body?: { storagePath?: string },
  ) {
    // التحقق من صيغة اسم الملف
    if (
      !filename.match(
        /^saraya_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/,
      )
    ) {
      throw new HttpException(
        'صيغة اسم الملف غير صالحة',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.backupService.restoreBackup(filename, body?.storagePath);
  }

  // ==========================================
  // الحذف
  // ==========================================

  /** حذف نسخة احتياطية */
  @Permissions('backup:manage')
  @Delete(':filename')
  async deleteBackup(
    @Param('filename') filename: string,
    @Body() body?: { storagePath?: string },
  ) {
    if (!filename.match(/^saraya_backup_.*\.sql\.gz$/)) {
      throw new HttpException(
        'صيغة اسم الملف غير صالحة',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.backupService.deleteBackup(filename, body?.storagePath);
    return { message: 'تم حذف النسخة بنجاح' };
  }

  // ==========================================
  // حالة الـ Worker
  // ==========================================

  /** عرض حالة عامل النسخ الاحتياطي */
  @Permissions('backup:view')
  @Get('status')
  async getStatus() {
    return this.backupService.getStatus();
  }

  // ==========================================
  // أماكن التخزين
  // ==========================================

  /** عرض جميع أماكن التخزين المتاحة (أقراص، USB، شبكة) */
  @Permissions('backup:view')
  @Get('storage-paths')
  async getStoragePaths() {
    return this.backupService.listStoragePaths();
  }

  // ==========================================
  // إعدادات النسخ التلقائي
  // ==========================================

  /** عرض إعدادات النسخ الاحتياطي */
  @Permissions('backup:view')
  @Get('auto-path')
  async getAutoPath() {
    return this.backupService.getConfig();
  }

  /** تحديث مسار النسخ التلقائي (بسيط) */
  @Permissions('backup:manage')
  @Post('auto-path')
  async setAutoPath(@Body() body: { path: string }) {
    if (!body?.path) {
      throw new HttpException('المسار مطلوب', HttpStatus.BAD_REQUEST);
    }
    return this.backupService.setAutoBackupPath(body.path);
  }

  /** تحديث إعدادات النسخ الاحتياطي الكاملة (مسار أساسي + ثانوي + تفعيل المزدوج) */
  @Permissions('backup:manage')
  @Post('config')
  async setConfig(
    @Body()
    body: {
      autoBackupPath?: string;
      secondaryPath?: string | null;
      dualBackupEnabled?: boolean;
    },
  ) {
    return this.backupService.setConfig(body);
  }
}
