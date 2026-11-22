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
  ForbiddenException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';

const BACKUP_FILENAME_PATTERN =
  /^saraya_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/;

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard, PlatformAdminGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  // Backups contain the entire shared database, not a single hospital.
  private requirePlatformAdmin(user: JwtPayload) {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException(
        'النسخ والاستعادة المشتركة متاحة لإدارة المنصة فقط',
      );
    }
  }

  // ==========================================
  // قائمة النسخ الاحتياطية
  // ==========================================

  /** عرض جميع النسخ المتوفرة */
  @Permissions('backup:view')
  @Get()
  async getBackups(@CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.backupService.getBackups();
  }

  /** البحث في جميع الأقراص المتاحة عن نسخ احتياطية */
  @Permissions('backup:manage')
  @Post('scan')
  async scanAllPaths(@CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.backupService.scanAllPaths();
  }

  // ==========================================
  // إنشاء نسخة احتياطية
  // ==========================================

  /** إنشاء نسخة احتياطية (مع إمكانية تحديد المسار + نسخ مزدوج) */
  @Permissions('backup:manage')
  @Post()
  async createBackup(
    @CurrentUser() user: JwtPayload,
    @Body() body?: { targetPath?: string; secondaryPath?: string },
  ) {
    this.requirePlatformAdmin(user);
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
    @CurrentUser() user: JwtPayload,
    @Body() body?: { storagePath?: string },
  ) {
    this.requirePlatformAdmin(user);
    // التحقق من صيغة اسم الملف
    if (!BACKUP_FILENAME_PATTERN.test(filename)) {
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
    @CurrentUser() user: JwtPayload,
    @Body() body?: { storagePath?: string },
  ) {
    this.requirePlatformAdmin(user);
    if (!BACKUP_FILENAME_PATTERN.test(filename)) {
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
  async getStatus(@CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.backupService.getStatus();
  }

  // ==========================================
  // أماكن التخزين
  // ==========================================

  /** عرض جميع أماكن التخزين المتاحة (أقراص، USB، شبكة) */
  @Permissions('backup:view')
  @Get('storage-paths')
  async getStoragePaths(@CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.backupService.listStoragePaths();
  }

  // ==========================================
  // إعدادات النسخ التلقائي
  // ==========================================

  /** عرض إعدادات النسخ الاحتياطي */
  @Permissions('backup:view')
  @Get('auto-path')
  async getAutoPath(@CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.backupService.getConfig();
  }

  /** تحديث مسار النسخ التلقائي (بسيط) */
  @Permissions('backup:manage')
  @Post('auto-path')
  async setAutoPath(
    @CurrentUser() user: JwtPayload,
    @Body() body: { path: string },
  ) {
    this.requirePlatformAdmin(user);
    if (!body?.path) {
      throw new HttpException('المسار مطلوب', HttpStatus.BAD_REQUEST);
    }
    return this.backupService.setAutoBackupPath(body.path);
  }

  /** تحديث إعدادات النسخ الاحتياطي الكاملة (مسار أساسي + ثانوي + تفعيل المزدوج) */
  @Permissions('backup:manage')
  @Post('config')
  async setConfig(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      autoBackupPath?: string;
      secondaryPath?: string | null;
      dualBackupEnabled?: boolean;
    },
  ) {
    this.requirePlatformAdmin(user);
    return this.backupService.setConfig(body);
  }
}
