
import { Injectable, Logger, InternalServerErrorException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { execSync } from 'child_process';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: Date;
  storagePath: string; // المسار الذي تم تخزين النسخة فيه
}

export interface StoragePath {
  path: string;
  label: string;
  type: 'default' | 'usb' | 'disk' | 'network' | 'custom';
  totalSpace: number;    // بالبايت
  freeSpace: number;     // بالبايت
  usedPercent: number;   // نسبة الاستخدام
  isWritable: boolean;
  backupCount: number;   // عدد النسخ الموجودة في هذا المسار
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly defaultBackupDir = '/backups';
  private readonly triggerBackupFile = path.join(this.defaultBackupDir, 'trigger_backup');
  private readonly triggerRestoreFile = path.join(this.defaultBackupDir, 'trigger_restore');
  private readonly statusFile = path.join(this.defaultBackupDir, 'worker_status.json');
  private readonly configFile = path.join(this.defaultBackupDir, 'backup_config.json');

  /** المسارات المسموح بها للنسخ الاحتياطي */
  private readonly ALLOWED_BASE_PATHS = ['/backups', '/mnt', '/media'];

  /** مسارات النظام المحظورة */
  private readonly BLOCKED_PATHS = ['/', '/etc', '/var', '/usr', '/bin', '/sbin', '/proc', '/sys', '/dev', '/root', '/boot', '/tmp'];

  onModuleInit() {
    this.ensureDir(this.defaultBackupDir);
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        this.logger.error(`فشل إنشاء المجلد: ${dir}`, e);
      }
    }
  }

  // ==========================================
  // التحقق من المسارات (أمان)
  // ==========================================

  /**
   * يتحقق أن المسار آمن ومسموح به
   */
  private validatePath(targetPath: string): string {
    // تنظيف المسار ومنع directory traversal
    const resolved = path.resolve(targetPath);

    // منع مسارات النظام
    if (this.BLOCKED_PATHS.includes(resolved)) {
      throw new BadRequestException(`المسار "${resolved}" محظور — لا يمكن النسخ إلى مسارات النظام`);
    }

    // التأكد أن المسار يبدأ بأحد المسارات المسموحة
    const isAllowed = this.ALLOWED_BASE_PATHS.some(base => resolved.startsWith(base));
    if (!isAllowed) {
      throw new BadRequestException(`المسار "${resolved}" غير مسموح. المسارات المسموحة: ${this.ALLOWED_BASE_PATHS.join(', ')}`);
    }

    return resolved;
  }

  // ==========================================
  // اكتشاف أماكن التخزين
  // ==========================================

  /**
   * يكتشف جميع أماكن التخزين المتاحة (الأقراص المُركبة + المسار الافتراضي)
   */
  async listStoragePaths(): Promise<StoragePath[]> {
    const paths: StoragePath[] = [];

    // 1. المسار الافتراضي دائماً
    paths.push(await this.getStorageInfo(this.defaultBackupDir, 'المسار الافتراضي', 'default'));

    // 2. اكتشاف الأقراص المركبة تحت /mnt و /media
    for (const baseDir of ['/mnt', '/media']) {
      try {
        if (!fs.existsSync(baseDir)) continue;
        
        const entries = await readdir(baseDir);
        for (const entry of entries) {
          const fullPath = path.join(baseDir, entry);
          try {
            const stats = await stat(fullPath);
            if (!stats.isDirectory()) continue;

            // تحديد نوع القرص
            const type = this.detectStorageType(fullPath);
            const label = this.generateLabel(entry, type);
            paths.push(await this.getStorageInfo(fullPath, label, type));
          } catch {
            // تجاهل المسارات التي لا يمكن الوصول إليها
          }
        }
      } catch {
        // baseDir غير موجود أو لا يمكن الوصول إليه
      }
    }

    return paths;
  }

  /**
   * يجمع معلومات التخزين لمسار معين (المساحة، قابلية الكتابة، عدد النسخ)
   */
  private async getStorageInfo(dirPath: string, label: string, type: StoragePath['type']): Promise<StoragePath> {
    let totalSpace = 0;
    let freeSpace = 0;
    let usedPercent = 0;
    let isWritable = false;
    let backupCount = 0;

    try {
      // الحصول على معلومات المساحة عبر df
      const dfOutput = execSync(`df -B1 "${dirPath}" 2>/dev/null | tail -1`, { encoding: 'utf8' }).trim();
      const parts = dfOutput.split(/\s+/);
      if (parts.length >= 5) {
        totalSpace = parseInt(parts[1]) || 0;
        freeSpace = parseInt(parts[3]) || 0;
        usedPercent = parseInt(parts[4]?.replace('%', '')) || 0;
      }
    } catch {
      // في حالة فشل df (مثلاً على Windows أثناء التطوير)
    }

    // فحص قابلية الكتابة
    try {
      const testFile = path.join(dirPath, '.saraya_write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      isWritable = true;
    } catch {
      isWritable = false;
    }

    // عدد النسخ الموجودة
    try {
      if (fs.existsSync(dirPath)) {
        const files = await readdir(dirPath);
        backupCount = files.filter(f => f.endsWith('.sql.gz')).length;
      }
    } catch {
      backupCount = 0;
    }

    return {
      path: dirPath,
      label,
      type,
      totalSpace,
      freeSpace,
      usedPercent,
      isWritable,
      backupCount,
    };
  }

  /**
   * يحدد نوع وحدة التخزين بناءً على المسار
   */
  private detectStorageType(mountPath: string): StoragePath['type'] {
    try {
      // محاولة قراءة /proc/mounts لتحديد نوع نظام الملفات
      const mounts = fs.readFileSync('/proc/mounts', 'utf8');
      const line = mounts.split('\n').find(l => l.includes(mountPath));
      if (line) {
        const fsType = line.split(/\s+/)[2] || '';
        if (['vfat', 'exfat', 'ntfs', 'fuseblk'].includes(fsType)) return 'usb';
        if (['nfs', 'cifs', 'smbfs', 'nfs4'].includes(fsType)) return 'network';
        if (['ext4', 'xfs', 'btrfs'].includes(fsType)) return 'disk';
      }
    } catch {
      // /proc/mounts غير متوفر (بيئة تطوير)
    }

    // تخمين بناءً على المسار
    if (mountPath.startsWith('/media/')) return 'usb';
    if (mountPath.startsWith('/mnt/')) return 'disk';
    return 'custom';
  }

  /**
   * يُنشئ تسمية وصفية لوحدة التخزين
   */
  private generateLabel(name: string, type: StoragePath['type']): string {
    const icons: Record<string, string> = {
      usb: '🔌 USB',
      disk: '💾 قرص',
      network: '🌐 شبكة',
      custom: '📁 مخصص',
    };
    const prefix = icons[type] || '📁';
    return `${prefix}: ${name}`;
  }

  // ==========================================
  // إعدادات المسار التلقائي
  // ==========================================

  /**
   * يقرأ إعدادات النسخ الاحتياطي المحفوظة
   */
  async getConfig(): Promise<{
    autoBackupPath: string;
    secondaryPath: string | null;
    dualBackupEnabled: boolean;
  }> {
    try {
      if (fs.existsSync(this.configFile)) {
        const content = await readFile(this.configFile, 'utf8');
        const parsed = JSON.parse(content);
        return {
          autoBackupPath: parsed.autoBackupPath || this.defaultBackupDir,
          secondaryPath: parsed.secondaryPath || null,
          dualBackupEnabled: parsed.dualBackupEnabled ?? false,
        };
      }
    } catch {
      this.logger.warn('فشل قراءة ملف الإعدادات، سيتم استخدام الافتراضي');
    }
    return {
      autoBackupPath: this.defaultBackupDir,
      secondaryPath: null,
      dualBackupEnabled: false,
    };
  }

  /**
   * يحفظ إعدادات النسخ الاحتياطي كاملة
   */
  async setConfig(update: {
    autoBackupPath?: string;
    secondaryPath?: string | null;
    dualBackupEnabled?: boolean;
  }): Promise<{
    autoBackupPath: string;
    secondaryPath: string | null;
    dualBackupEnabled: boolean;
  }> {
    const current = await this.getConfig();

    // التحقق من المسار الأساسي
    const primaryPath = update.autoBackupPath ?? current.autoBackupPath;
    const validatedPrimary = this.validatePath(primaryPath);
    this.assertWritable(validatedPrimary);

    // التحقق من المسار الثانوي (إن وُجد)
    let validatedSecondary: string | null = null;
    if (update.secondaryPath !== undefined) {
      if (update.secondaryPath) {
        validatedSecondary = this.validatePath(update.secondaryPath);
        this.assertWritable(validatedSecondary);
      } else {
        validatedSecondary = null;
      }
    } else {
      validatedSecondary = current.secondaryPath;
    }

    const config = {
      autoBackupPath: validatedPrimary,
      secondaryPath: validatedSecondary,
      dualBackupEnabled: update.dualBackupEnabled ?? current.dualBackupEnabled,
    };

    await writeFile(this.configFile, JSON.stringify(config, null, 2));
    this.logger.log(`تم تحديث إعدادات النسخ الاحتياطي: ${JSON.stringify(config)}`);
    return config;
  }

  /**
   * تحقق من المسار الأساسي — backward compatibility
   */
  async setAutoBackupPath(newPath: string) {
    return this.setConfig({ autoBackupPath: newPath });
  }

  /**
   * يتحقق أن المسار موجود وقابل للكتابة
   */
  private assertWritable(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      throw new BadRequestException(`المسار "${dirPath}" غير موجود`);
    }
    try {
      const testFile = path.join(dirPath, '.saraya_write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch {
      throw new BadRequestException(`المسار "${dirPath}" غير قابل للكتابة`);
    }
  }

  // ==========================================
  // قائمة النسخ الاحتياطية
  // ==========================================

  /**
   * يسرد جميع النسخ الاحتياطية من مسار محدد أو من جميع المسارات
   */
  async getBackups(searchPath?: string): Promise<BackupFile[]> {
    const allBackups: BackupFile[] = [];

    if (searchPath) {
      // بحث في مسار محدد
      const validated = this.validatePath(searchPath);
      const files = await this.scanDirForBackups(validated);
      allBackups.push(...files);
    } else {
      // بحث في المسار الافتراضي
      const defaultFiles = await this.scanDirForBackups(this.defaultBackupDir);
      allBackups.push(...defaultFiles);

      // بحث في المسار التلقائي (إذا مختلف عن الافتراضي)
      const config = await this.getConfig();
      if (config.autoBackupPath !== this.defaultBackupDir) {
        try {
          const autoFiles = await this.scanDirForBackups(config.autoBackupPath);
          allBackups.push(...autoFiles);
        } catch {
          // المسار قد لا يكون متاحاً
        }
      }
    }

    // ترتيب بتاريخ الإنشاء تنازلياً
    return allBackups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * يبحث عن ملفات النسخ الاحتياطية في مجلد معين
   */
  private async scanDirForBackups(dir: string): Promise<BackupFile[]> {
    const backups: BackupFile[] = [];
    try {
      if (!fs.existsSync(dir)) return [];
      
      const files = await readdir(dir);
      const backupFiles = files.filter(f => f.endsWith('.sql.gz'));

      for (const file of backupFiles) {
        try {
          const filePath = path.join(dir, file);
          const stats = await stat(filePath);
          backups.push({
            filename: file,
            size: stats.size,
            createdAt: stats.mtime,
            storagePath: dir,
          });
        } catch {
          // تجاهل الملفات التي لا يمكن قراءتها
        }
      }
    } catch (e) {
      this.logger.error(`خطأ في فحص المجلد ${dir}`, e);
    }
    return backups;
  }

  /**
   * يبحث في جميع الأقراص المتاحة عن نسخ احتياطية
   */
  async scanAllPaths(): Promise<BackupFile[]> {
    const allBackups: BackupFile[] = [];

    // المسار الافتراضي
    allBackups.push(...await this.scanDirForBackups(this.defaultBackupDir));

    // جميع المسارات تحت /mnt و /media
    for (const baseDir of ['/mnt', '/media']) {
      try {
        if (!fs.existsSync(baseDir)) continue;
        const entries = await readdir(baseDir);
        for (const entry of entries) {
          const fullPath = path.join(baseDir, entry);
          try {
            const stats = await stat(fullPath);
            if (stats.isDirectory()) {
              allBackups.push(...await this.scanDirForBackups(fullPath));
            }
          } catch { /* تجاهل */ }
        }
      } catch { /* تجاهل */ }
    }

    return allBackups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ==========================================
  // إنشاء النسخ الاحتياطية
  // ==========================================

  /**
   * يُنشئ نسخة احتياطية (يدوية أو تلقائية)
   * يدعم النسخ المزدوج: أساسي + ثانوي
   */
  async createBackup(targetPath?: string, secondaryPath?: string): Promise<{ message: string }> {
    try {
      if (fs.existsSync(this.triggerBackupFile)) {
        return { message: 'هناك عملية نسخ احتياطي في قائمة الانتظار بالفعل' };
      }

      // تحديد المسار الأساسي
      let primaryDir = this.defaultBackupDir;
      if (targetPath) {
        primaryDir = this.validatePath(targetPath);
        this.ensureDir(primaryDir);
      }

      // تحديد المسار الثانوي
      let secondaryDir: string | null = null;
      if (secondaryPath) {
        secondaryDir = this.validatePath(secondaryPath);
        this.ensureDir(secondaryDir);
      }

      // كتابة JSON في trigger file يحتوي كلا المسارين
      const triggerData = JSON.stringify({
        primaryPath: primaryDir,
        secondaryPath: secondaryDir,
      });
      await writeFile(this.triggerBackupFile, triggerData);

      const msg = secondaryDir
        ? `تم بدء النسخ المزدوج: ${primaryDir} + ${secondaryDir}`
        : `تم بدء النسخ الاحتياطي إلى: ${primaryDir}`;

      this.logger.log(msg);
      return { message: msg };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error('فشل تفعيل النسخ الاحتياطي', e);
      throw new InternalServerErrorException('فشل بدء النسخ الاحتياطي');
    }
  }

  // ==========================================
  // الاستعادة
  // ==========================================

  /**
   * يستعيد نسخة احتياطية من أي مسار
   */
  async restoreBackup(filename: string, storagePath?: string): Promise<{ message: string }> {
    // تحديد مسار الملف الكامل
    const dir = storagePath ? this.validatePath(storagePath) : this.defaultBackupDir;
    const filePath = path.join(dir, path.basename(filename)); // basename للحماية من traversal

    if (!fs.existsSync(filePath)) {
      throw new InternalServerErrorException(`ملف النسخة غير موجود: ${filePath}`);
    }

    try {
      // كتابة المسار الكامل للملف (وليس فقط الاسم) في trigger الاستعادة
      await writeFile(this.triggerRestoreFile, filePath);
      this.logger.warn(`تم تفعيل الاستعادة من: ${filePath}`);
      return { message: `جاري استعادة النسخة: ${filename}` };
    } catch (e) {
      this.logger.error('فشل تفعيل الاستعادة', e);
      throw new InternalServerErrorException('فشل بدء عملية الاستعادة');
    }
  }

  // ==========================================
  // حذف النسخ
  // ==========================================

  async deleteBackup(filename: string, storagePath?: string): Promise<void> {
    const dir = storagePath ? this.validatePath(storagePath) : this.defaultBackupDir;
    const safeFilename = path.basename(filename);
    const filePath = path.join(dir, safeFilename);

    try {
      if (fs.existsSync(filePath)) {
        await unlink(filePath);
        this.logger.log(`تم حذف النسخة: ${filePath}`);
      }
    } catch (e) {
      this.logger.error('فشل حذف النسخة', e);
      throw new InternalServerErrorException('فشل حذف النسخة الاحتياطية');
    }
  }

  // ==========================================
  // حالة الـ Worker
  // ==========================================

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

  // ==========================================
  // النسخ التلقائي المجدول
  // ==========================================

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyBackup() {
    this.logger.log('بدء النسخ الاحتياطي التلقائي اليومي...');

    const config = await this.getConfig();
    const primaryPath = config.autoBackupPath || this.defaultBackupDir;
    const secondaryPath = config.dualBackupEnabled ? config.secondaryPath : null;

    this.logger.log(`مسار النسخ التلقائي — أساسي: ${primaryPath}${secondaryPath ? ` | ثانوي: ${secondaryPath}` : ''}`);
    await this.createBackup(primaryPath, secondaryPath || undefined);
  }
}
