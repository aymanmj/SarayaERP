
import { useEffect, useState } from "react";
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
} from "lucide-react";

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

interface WorkerStatus {
  status: "idle" | "busy" | "error";
  operation?: string;
  message?: string;
  lastResult?: "success" | "error";
  lastOperation?: string;
  timestamp?: string;
}

export default function BackupSettingsPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<WorkerStatus>({ status: "idle" });
  const [polling, setPolling] = useState(true);

  // Fetch Backups
  const fetchBackups = async () => {
    try {
      const res = await apiClient.get<BackupFile[]>("/backup");
      setBackups(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch Status
  const fetchStatus = async () => {
    try {
      const res = await apiClient.get<WorkerStatus>("/backup/status");
      setStatus(res.data);
      
      // Stop polling if error or idle (unless we just started an operation)
      // Actually, we want to poll if busy.
      if (res.data.status === 'busy') {
          setPolling(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBackups();
    fetchStatus();

    // Poll status every 5 seconds
    const interval = setInterval(() => {
        if (polling) fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [polling]);

  // Create Backup
  const handleCreateBackup = async () => {
    if (status.status === 'busy') {
        toast.error("هناك عملية جارية بالفعل");
        return;
    }

    try {
      setLoading(true);
      await apiClient.post("/backup");
      toast.success("تم بدء عملية النسخ الاحتياطي");
      setPolling(true);
      // Wait a bit then refresh list
      setTimeout(fetchBackups, 2000);
    } catch (err) {
      toast.error("فشل بدء النسخ الاحتياطي");
    } finally {
      setLoading(false);
    }
  };

  // Restore Backup
  const handleRestore = async (filename: string) => {
    if (!confirm(`⚠️ تحذير خطير!\n\nهل أنت متأكد من استعادة النسخة: ${filename}؟\n\nسيتم مسح جميع البيانات الحالية واستبدالها بالنسخة الاحتياطية. لا يمكن التراجع عن هذا الإجراء!`)) {
        return;
    }

    // Double confirmation
    const input = prompt(`للتأكيد، اكتب "RESTORE" في المربع أدناه:`);
    if (input !== "RESTORE") return;

    try {
      await apiClient.post(`/backup/${filename}/restore`);
      toast.success("تم بدء عملية الاستعادة. النظام قد يتوقف قليلاً.");
      setPolling(true);
    } catch (err) {
      toast.error("فشل بدء الاستعادة");
    }
  };

  // Delete Backup
  const handleDelete = async (filename: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه النسخة؟")) return;

    try {
      await apiClient.delete(`/backup/${filename}`);
      toast.success("تم الحذف بنجاح");
      setBackups(prev => prev.filter(b => b.filename !== filename));
    } catch (err) {
      toast.error("فشل الحذف");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };


  // Timer State
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (status.status === 'busy') {
        const startTime = Date.now();
        // If we have a timestamp in status, use it?
        // Actually, for simplicity, just count up while busy from 0 or last known
        timer = setInterval(() => {
            setElapsed(prev => prev + 1);
        }, 1000);
    } else {
        setElapsed(0);
    }
    return () => clearInterval(timer);
  }, [status.status]);

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Archive className="text-sky-500 w-8 h-8" />
            النسخ الاحتياطي والاستعادة
          </h1>
          <p className="text-slate-400 mt-1">
            إدارة النسخ الاحتياطية لقاعدة البيانات وجدولتها.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
             {status.status === 'busy' && (
                 <div className="flex items-center gap-3 px-6 py-3 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20 shadow-lg animate-pulse transition-all">
                     <RefreshCw className="w-5 h-5 animate-spin" />
                     <div className="flex flex-col">
                         <span className="text-sm font-bold">{status.message || "جارِ المعالجة..."}</span>
                         <span className="text-xs opacity-80 font-mono" dir="ltr">{formatTime(elapsed)} elapsed</span>
                     </div>
                 </div>
             )}
        
            <button
                onClick={handleCreateBackup}
                disabled={loading || status.status === 'busy'}
                className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:opacity-50 text-white rounded-xl shadow-lg transition-all font-medium"
            >
                <HardDriveDownload className="w-5 h-5" />
                {status.status === 'busy' ? 'العملية جارية...' : 'نسخ احتياطي فوراً'}
            </button>
        </div>
      </div>

      {/* Progress Bar (Visible only when busy) */}
      {status.status === 'busy' && (
          <div className="bg-slate-800/80 p-6 rounded-2xl border border-amber-500/30 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/20">
                  <div className="h-full bg-amber-500 animate-progress-indeterminate"></div>
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-amber-500/10 rounded-full text-amber-500">
                      <HardDriveDownload className="w-6 h-6 animate-bounce" />
                  </div>
                  <div>
                      <h3 className="text-lg font-bold text-slate-100">
                          {status.operation === 'backup' ? 'جاري إنشاء نسخة احتياطية...' : 'جاري استعادة النظام...'}
                      </h3>
                      <p className="text-slate-400 text-sm">يرجى الانتظار، هذه العملية قد تستغرق عدة دقائق حسب حجم البيانات.</p>
                  </div>
              </div>
              
              <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                      <span>التقدم</span>
                      <span>{formatTime(elapsed)}</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden">
                       {/* Indeterminate simulated progress */}
                      <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full animate-pulse w-full origin-left bg-[length:200%_100%] animate-shimmer"></div>
                  </div>
              </div>
          </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                    <Clock className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-slate-400 text-xs">آخر عملية نسخ</h3>
                    <p className="text-slate-200 font-semibold">
                        {status.lastOperation === 'backup' && status.lastResult === 'success' 
                         ? new Date(parseInt(status.timestamp || '0') * 1000).toLocaleString('ar-LY') 
                         : 'غير متوفر'}
                    </p>
                </div>
            </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                    <Archive className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-slate-400 text-xs">عدد النسخ</h3>
                    <p className="text-slate-200 font-semibold">{backups.length} نسخة</p>
                </div>
            </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                    <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-slate-400 text-xs">الجدولة التلقائية</h3>
                    <p className="text-slate-200 font-semibold">يومياً 03:00 ص</p>
                </div>
            </div>
        </div>
      </div>

      {/* Backups List */}
      <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-800/60 text-slate-300 text-sm">
              <tr>
                <th className="p-4 font-medium">اسم الملف</th>
                <th className="p-4 font-medium">الحجم</th>
                <th className="p-4 font-medium">تاريخ الإنشاء</th>
                <th className="p-4 font-medium text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {backups.length === 0 ? (
                <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                        لا توجد نسخ احتياطية حتى الآن
                    </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.filename} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="p-4 text-slate-200 font-mono text-sm" dir="ltr">
                      {backup.filename}
                    </td>
                    <td className="p-4 text-slate-300 text-sm">
                      {formatBytes(backup.size)}
                    </td>
                    <td className="p-4 text-slate-300 text-sm">
                      {new Date(backup.createdAt).toLocaleString("ar-LY")}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleRestore(backup.filename)}
                          title="استعادة (Restore)"
                          className="p-2 hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        
                        <a 
                            href={`/api/backup/${backup.filename}/download`} // Optional: if we implement download endpoint
                            className="p-2 hover:bg-sky-500/10 text-slate-400 hover:text-sky-500 rounded-lg transition-colors hidden"
                        >
                            <HardDriveDownload className="w-4 h-4" />
                        </a>

                        <button
                          onClick={() => handleDelete(backup.filename)}
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
      
      <div className="bg-amber-900/10 border border-amber-900/20 p-4 rounded-xl flex gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
        <div className="space-y-1">
            <h4 className="text-amber-500 font-semibold text-sm">تنبيه هام حول الاستعادة</h4>
            <p className="text-amber-400/80 text-xs leading-relaxed">
                عملية الاستعادة (Restore) ستقوم بمسح قاعدة البيانات الحالية بالكامل واستبدالها بالنسخة المختارة. 
                يرجى التأكد من أنك تملك نسخة احتياطية حديثة قبل القيام بأي عملية استعادة.
                قد يتوقف النظام عن الاستجابة لعدة دقائق أثناء العملية.
            </p>
        </div>
      </div>
    </div>
  );
}
