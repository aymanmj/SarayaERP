
import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import {
  Archive,
  RotateCcw,
  Trash2,
  HardDriveDownload,
  Clock,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Usb,
  Globe,
  FolderOpen,
  Settings2,
  Save,
  Search,
  ChevronDown,
  Check,
  Database,
} from "lucide-react";

// ==========================================
// Types
// ==========================================

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
  storagePath: string;
}

interface WorkerStatus {
  status: "idle" | "busy" | "error" | "unknown";
  operation?: string;
  message?: string;
  lastResult?: "success" | "error";
  lastOperation?: string;
  timestamp?: string;
  targetPath?: string;
}

interface StoragePath {
  path: string;
  label: string;
  type: "default" | "usb" | "disk" | "network" | "custom";
  totalSpace: number;
  freeSpace: number;
  usedPercent: number;
  isWritable: boolean;
  backupCount: number;
}

// ==========================================
// Storage Path Dropdown Component
// ==========================================

function StoragePathDropdown({
  paths,
  selected,
  onSelect,
  loading,
  label,
}: {
  paths: StoragePath[];
  selected: string;
  onSelect: (path: string) => void;
  loading: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedInfo = paths.find((p) => p.path === selected);

  const getTypeIcon = (type: StoragePath["type"]) => {
    switch (type) {
      case "usb":
        return <Usb className="w-4 h-4" />;
      case "network":
        return <Globe className="w-4 h-4" />;
      case "disk":
        return <HardDrive className="w-4 h-4" />;
      default:
        return <FolderOpen className="w-4 h-4" />;
    }
  };

  return (
    <div className="relative">
      <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/70 border border-slate-700 rounded-xl text-slate-200 hover:border-sky-600 transition-colors text-right disabled:opacity-50"
      >
        <div className="flex items-center gap-2 flex-1">
          {selectedInfo ? getTypeIcon(selectedInfo.type) : <FolderOpen className="w-4 h-4" />}
          <span className="text-sm truncate">
            {selectedInfo?.label || selected || "المسار الافتراضي"}
          </span>
          {selectedInfo && (
            <span className="text-xs text-slate-500 mr-auto" dir="ltr">
              {formatBytesStatic(selectedInfo.freeSpace)} متاح
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          {paths.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              لا توجد أماكن تخزين متاحة
            </div>
          ) : (
            paths.map((p) => (
              <button
                key={p.path}
                onClick={() => {
                  onSelect(p.path);
                  setOpen(false);
                }}
                disabled={!p.isWritable}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 transition-colors text-right ${
                  p.path === selected ? "bg-sky-900/30 border-r-2 border-sky-500" : ""
                } ${!p.isWritable ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div className="text-slate-400">{getTypeIcon(p.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">{p.label}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2" dir="ltr">
                    <span>{p.path}</span>
                    {p.backupCount > 0 && (
                      <span className="text-sky-500">• {p.backupCount} نسخة</span>
                    )}
                  </div>
                  {/* شريط المساحة */}
                  {p.totalSpace > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.usedPercent > 90
                              ? "bg-rose-500"
                              : p.usedPercent > 70
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${p.usedPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500" dir="ltr">
                        {formatBytesStatic(p.freeSpace)} / {formatBytesStatic(p.totalSpace)}
                      </span>
                    </div>
                  )}
                </div>
                {p.path === selected && <Check className="w-4 h-4 text-sky-500 shrink-0" />}
                {!p.isWritable && (
                  <span className="text-[10px] text-rose-400">للقراءة فقط</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Helpers
// ==========================================

function formatBytesStatic(bytes: number) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ==========================================
// Main Page
// ==========================================

export default function BackupSettingsPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<WorkerStatus>({ status: "idle" });
  const [polling, setPolling] = useState(true);
  const [storagePaths, setStoragePaths] = useState<StoragePath[]>([]);
  const [loadingPaths, setLoadingPaths] = useState(false);

  // إعدادات المسار التلقائي
  const [autoPath, setAutoPath] = useState("/backups");
  const [secondaryPath, setSecondaryPath] = useState<string | null>(null);
  const [dualBackupEnabled, setDualBackupEnabled] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // مسار النسخ اليدوي
  const [manualPath, setManualPath] = useState("/backups");

  // مؤقت
  const [elapsed, setElapsed] = useState(0);

  // ==========================================
  // Fetch Functions
  // ==========================================

  const fetchBackups = useCallback(async () => {
    try {
      const res = await apiClient.get<BackupFile[]>("/backup");
      setBackups(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiClient.get<WorkerStatus>("/backup/status");
      setStatus(res.data);
      if (res.data.status === "busy") setPolling(true);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchStoragePaths = useCallback(async () => {
    setLoadingPaths(true);
    try {
      const res = await apiClient.get<StoragePath[]>("/backup/storage-paths");
      setStoragePaths(res.data);
    } catch (err) {
      console.error(err);
      // في حالة الفشل، استخدم المسار الافتراضي
      setStoragePaths([{
        path: "/backups",
        label: "المسار الافتراضي",
        type: "default",
        totalSpace: 0,
        freeSpace: 0,
        usedPercent: 0,
        isWritable: true,
        backupCount: 0,
      }]);
    } finally {
      setLoadingPaths(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiClient.get<{
        autoBackupPath: string;
        secondaryPath: string | null;
        dualBackupEnabled: boolean;
      }>("/backup/auto-path");
      setAutoPath(res.data.autoBackupPath);
      setManualPath(res.data.autoBackupPath);
      setSecondaryPath(res.data.secondaryPath);
      setDualBackupEnabled(res.data.dualBackupEnabled);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
    fetchStatus();
    fetchStoragePaths();
    fetchConfig();

    const interval = setInterval(() => {
      if (polling) {
        fetchStatus();
        fetchBackups();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [polling, fetchBackups, fetchStatus, fetchStoragePaths, fetchConfig]);

  // مؤقت العملية الجارية
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (status.status === "busy") {
      timer = setInterval(() => setElapsed((p) => p + 1), 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(timer);
  }, [status.status]);

  // ==========================================
  // Actions
  // ==========================================

  const handleCreateBackup = async () => {
    if (status.status === "busy") {
      toast.error("هناك عملية جارية بالفعل");
      return;
    }

    try {
      setLoading(true);
      const body: any = { targetPath: manualPath };
      // إذا النسخ المزدوج مفعل وهناك مسار ثانوي، أرسله
      if (dualBackupEnabled && secondaryPath && secondaryPath !== manualPath) {
        body.secondaryPath = secondaryPath;
      }
      await apiClient.post("/backup", body);
      const msg = body.secondaryPath
        ? `تم بدء النسخ المزدوج: ${manualPath} + ${secondaryPath}`
        : `تم بدء النسخ الاحتياطي إلى: ${manualPath}`;
      toast.success(msg);
      setPolling(true);
      setTimeout(fetchBackups, 3000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل بدء النسخ الاحتياطي");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (backup: BackupFile) => {
    if (
      !confirm(
        `⚠️ تحذير خطير!\n\nهل أنت متأكد من استعادة النسخة: ${backup.filename}؟\n\nالمسار: ${backup.storagePath}\n\nسيتم مسح جميع البيانات الحالية واستبدالها بالنسخة الاحتياطية!\nلا يمكن التراجع عن هذا الإجراء!`
      )
    )
      return;

    const input = prompt('للتأكيد، اكتب "RESTORE" في المربع أدناه:');
    if (input !== "RESTORE") return;

    try {
      await apiClient.post(`/backup/${backup.filename}/restore`, {
        storagePath: backup.storagePath,
      });
      toast.success("تم بدء عملية الاستعادة. النظام قد يتوقف قليلاً.");
      setPolling(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل بدء الاستعادة");
    }
  };

  const handleDelete = async (backup: BackupFile) => {
    if (!confirm(`هل أنت متأكد من حذف النسخة: ${backup.filename}؟`)) return;

    try {
      await apiClient.delete(`/backup/${backup.filename}`, {
        data: { storagePath: backup.storagePath },
      });
      toast.success("تم الحذف بنجاح");
      setBackups((prev) => prev.filter((b) => !(b.filename === backup.filename && b.storagePath === backup.storagePath)));
    } catch (err) {
      toast.error("فشل الحذف");
    }
  };

  const handleScanAll = async () => {
    try {
      setLoading(true);
      const res = await apiClient.post<BackupFile[]>("/backup/scan");
      setBackups(res.data);
      toast.success(`تم العثور على ${res.data.length} نسخة احتياطية`);
    } catch (err) {
      toast.error("فشل البحث");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await apiClient.post("/backup/config", {
        autoBackupPath: autoPath,
        secondaryPath: dualBackupEnabled ? secondaryPath : null,
        dualBackupEnabled,
      });
      toast.success("تم حفظ إعدادات النسخ الاحتياطي بنجاح");
      setConfigDirty(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل حفظ الإعدادات");
    } finally {
      setSavingConfig(false);
    }
  };

  const getPathLabel = (storagePath: string) => {
    const found = storagePaths.find((p) => p.path === storagePath);
    return found?.label || storagePath;
  };

  // ==========================================
  // Render
  // ==========================================

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Archive className="text-sky-500 w-8 h-8" />
            النسخ الاحتياطي والاستعادة
          </h1>
          <p className="text-slate-400 mt-1">
            إدارة النسخ الاحتياطية لقاعدة البيانات وأماكن التخزين
          </p>
        </div>

        {status.status === "busy" && (
          <div className="flex items-center gap-3 px-6 py-3 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20 shadow-lg animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <div className="flex flex-col">
              <span className="text-sm font-bold">{status.message || "جارِ المعالجة..."}</span>
              <span className="text-xs opacity-80 font-mono" dir="ltr">
                {formatTime(elapsed)} elapsed
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {status.status === "busy" && (
        <div className="bg-slate-800/80 p-6 rounded-2xl border border-amber-500/30 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/20">
            <div className="h-full bg-amber-500 animate-progress-indeterminate" />
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-500/10 rounded-full text-amber-500">
              <HardDriveDownload className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">
                {status.operation === "backup" ? "جاري إنشاء نسخة احتياطية..." : "جاري استعادة النظام..."}
              </h3>
              <p className="text-slate-400 text-sm">
                يرجى الانتظار، هذه العملية قد تستغرق عدة دقائق حسب حجم البيانات.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>التقدم</span>
              <span>{formatTime(elapsed)}</span>
            </div>
            <div className="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full animate-pulse w-full" />
            </div>
          </div>
        </div>
      )}

      {/* بطاقات الإحصائيات + الإعدادات */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* بطاقة 1: إعدادات النسخ التلقائي */}
        <div className="lg:col-span-2 bg-slate-800/50 p-5 rounded-2xl border border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-sky-500/10 rounded-lg text-sky-500">
              <Settings2 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-slate-200 font-semibold">إعدادات النسخ التلقائي</h3>
              <p className="text-xs text-slate-500">يتم النسخ تلقائياً كل يوم الساعة 03:00 صباحاً</p>
            </div>
          </div>

          {/* المسار الأساسي */}
          <div className="mb-4">
            <StoragePathDropdown
              paths={storagePaths}
              selected={autoPath}
              onSelect={(p) => {
                setAutoPath(p);
                setConfigDirty(true);
              }}
              loading={loadingPaths}
              label="المسار الأساسي"
            />
          </div>

          {/* تفعيل النسخ المزدوج */}
          <div className="mb-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm text-slate-200 font-medium">النسخ المزدوج (Dual Backup)</h4>
                  <p className="text-[11px] text-slate-500">
                    حفظ النسخة في مكانين مختلفين لضمان الأمان
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={dualBackupEnabled}
                  onChange={(e) => {
                    setDualBackupEnabled(e.target.checked);
                    setConfigDirty(true);
                  }}
                />
                <div className="w-11 h-6 bg-slate-700/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
              </label>
            </div>

            {dualBackupEnabled && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <StoragePathDropdown
                  paths={storagePaths.filter((p) => p.path !== autoPath)}
                  selected={secondaryPath || ""}
                  onSelect={(p) => {
                    setSecondaryPath(p);
                    setConfigDirty(true);
                  }}
                  loading={loadingPaths}
                  label="المسار الثانوي (قرص خارجي / USB)"
                />
                {!secondaryPath && storagePaths.length <= 1 && (
                  <p className="mt-2 text-xs text-amber-400/80 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    لا توجد أقراص خارجية متصلة. قم بتوصيل قرص USB ثم اضغط تحديث.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* زر الحفظ */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveConfig}
              disabled={!configDirty || savingConfig}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 text-white rounded-xl shadow-lg transition-all text-sm font-medium"
            >
              <Save className="w-4 h-4" />
              {savingConfig ? "حفظ..." : "حفظ الإعدادات"}
            </button>
          </div>
        </div>

        {/* بطاقة 2: إحصائيات مختصرة */}
        <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-400 text-xs">آخر عملية نسخ</h3>
              <p className="text-slate-200 font-semibold text-sm">
                {status.lastOperation === "backup" && status.lastResult === "success"
                  ? new Date(parseInt(status.timestamp || "0") * 1000).toLocaleString("ar-LY")
                  : "غير متوفر"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-400 text-xs">إجمالي النسخ</h3>
              <p className="text-slate-200 font-semibold text-sm">{backups.length} نسخة</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-slate-400 text-xs">أماكن التخزين</h3>
              <p className="text-slate-200 font-semibold text-sm">{storagePaths.length} مكان</p>
            </div>
          </div>
        </div>
      </div>

      {/* قسم النسخ اليدوي */}
      <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-4 flex items-center gap-2">
          <HardDriveDownload className="w-5 h-5 text-sky-500" />
          نسخ احتياطي يدوي
        </h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <StoragePathDropdown
              paths={storagePaths}
              selected={manualPath}
              onSelect={setManualPath}
              loading={loadingPaths}
              label="مسار الحفظ"
            />
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={loading || status.status === "busy"}
            className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:opacity-50 text-white rounded-xl shadow-lg transition-all font-medium"
          >
            <HardDriveDownload className="w-5 h-5" />
            {status.status === "busy" ? "العملية جارية..." : "نسخ احتياطي فوراً"}
          </button>
        </div>
      </div>

      {/* قائمة النسخ الاحتياطية */}
      <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-slate-200 font-semibold flex items-center gap-2">
            <Archive className="w-5 h-5 text-sky-500" />
            النسخ المتوفرة
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleScanAll}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            >
              <Search className="w-4 h-4" />
              بحث في الأقراص
            </button>
            <button
              onClick={() => {
                fetchBackups();
                fetchStoragePaths();
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              تحديث
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-800/60 text-slate-300 text-sm">
              <tr>
                <th className="p-4 font-medium">اسم الملف</th>
                <th className="p-4 font-medium">مكان التخزين</th>
                <th className="p-4 font-medium">الحجم</th>
                <th className="p-4 font-medium">تاريخ الإنشاء</th>
                <th className="p-4 font-medium text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    لا توجد نسخ احتياطية. اضغط "بحث في الأقراص" للبحث في جميع الأماكن.
                  </td>
                </tr>
              ) : (
                backups.map((backup, idx) => (
                  <tr
                    key={`${backup.storagePath}-${backup.filename}-${idx}`}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="p-4 text-slate-200 font-mono text-sm" dir="ltr">
                      {backup.filename}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs">
                        {backup.storagePath === "/backups" ? (
                          <>
                            <FolderOpen className="w-3 h-3" />
                            افتراضي
                          </>
                        ) : (
                          <>
                            <HardDrive className="w-3 h-3" />
                            {getPathLabel(backup.storagePath)}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300 text-sm" dir="ltr">
                      {formatBytesStatic(backup.size)}
                    </td>
                    <td className="p-4 text-slate-300 text-sm">
                      {new Date(backup.createdAt).toLocaleString("ar-LY")}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleRestore(backup)}
                          title="استعادة (Restore)"
                          className="p-2 hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(backup)}
                          title="حذف"
                          className="p-2 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* تنبيه */}
      <div className="bg-amber-900/10 border border-amber-900/20 p-4 rounded-xl flex gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-amber-500 font-semibold text-sm">تنبيه هام</h4>
          <p className="text-amber-400/80 text-xs leading-relaxed">
            • عملية الاستعادة ستمسح قاعدة البيانات الحالية بالكامل واستبدالها بالنسخة المختارة.
            <br />
            • عند النسخ إلى قرص خارجي، يتم حفظ نسخة ثانية في المسار الافتراضي تلقائياً (للأمان).
            <br />
            • لاستخدام أقراص خارجية، تأكد من توصيلها وتركيبها (mount) على السيرفر أولاً.
          </p>
        </div>
      </div>
    </div>
  );
}
