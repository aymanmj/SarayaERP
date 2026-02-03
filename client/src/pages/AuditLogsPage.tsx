import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type AuditLog = {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  createdAt: string;
  ipAddress: string | null;
  user?: { fullName: string; username: string } | null;
  details?: any;
  oldValues?: any;
  newValues?: any;
};

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [userId, setUserId] = useState("");
  const [entity, setEntity] = useState("");
  const [actionType, setActionType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      if (entity) params.append("entity", entity);
      if (actionType) params.append("actionType", actionType);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (searchQuery) params.append("q", searchQuery);
      params.append("page", page.toString());
      params.append("limit", meta.limit.toString());

      const res = await apiClient.get<AuditLog[] | { logs: AuditLog[]; meta: PaginationMeta }>(`/audit/logs?${params.toString()}`);
      
      // Handle both array response and paginated response
      if (Array.isArray(res.data)) {
        // Direct array response
        setLogs(res.data);
        setMeta({ page: 1, limit: 25, total: res.data.length, totalPages: 1 });
      } else {
        // Paginated response
        setLogs(res.data.logs);
        setMeta(res.data.meta);
      }
    } catch {
      toast.error("فشل تحميل السجلات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1);
  }, []);

  const handleSearch = () => {
    loadLogs(1);
  };

  const handleReset = () => {
    setUserId("");
    setEntity("");
    setActionType("");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    loadLogs(1);
  };

  const handleExport = () => {
    // Helper function to escape CSV fields
    const escapeCSVField = (field: any): string => {
      if (field === null || field === undefined) return "";
      const str = String(field);
      // If field contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      // Arabic headers
      "الوقت,المستخدم,العملية,الكيان,المعرف,عنوان IP",
      ...logs?.map((log) =>
        [
          escapeCSVField(new Date(log.createdAt).toLocaleString("ar-LY")),
          escapeCSVField(log.user ? `${log.user.fullName} (${log.user.username})` : "System/Guest"),
          escapeCSVField(log.action),
          escapeCSVField(log.entity),
          escapeCSVField(log.entityId),
          escapeCSVField(log.ipAddress),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `سجل-التدقيق-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("تم تصدير السجلات بنجاح");
  };

  const getActionColor = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("view") || lower.includes("read")) return "text-blue-400 bg-blue-400/10";
    if (lower.includes("delete")) return "text-rose-400 bg-rose-400/10";
    if (lower.includes("create") || lower.includes("post")) return "text-emerald-400 bg-emerald-400/10";
    if (lower.includes("update") || lower.includes("put") || lower.includes("patch")) return "text-amber-400 bg-amber-400/10";
    return "text-slate-300 bg-slate-300/10";
  };

  const getActionIcon = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("view")) return "👁️";
    if (lower.includes("create")) return "➕";
    if (lower.includes("update")) return "✏️";
    if (lower.includes("delete")) return "🗑️";
    return "📋";
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">سجل التدقيق (Audit Trail)</h1>
          <p className="text-sm text-slate-400">
            مراقبة الوصول وتعديل البيانات الحساسة.
          </p>
        </div>
        <button
          onClick={() => loadLogs(meta.page)}
          className="px-4 py-2 bg-slate-800 rounded-xl text-sm"
        >
          تحديث
        </button>
      </div>

      {/* Filters Enhanced */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl space-y-4">
        <div className="flex flex-wrap gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200" placeholder="من تاريخ" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200" placeholder="إلى تاريخ" />
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><option value="">كل العمليات</option><option value="VIEW">اطلاع</option><option value="CREATE">إنشاء</option><option value="UPDATE">تعديل</option><option value="DELETE">حذف</option></select>
          <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="الكيان (مثال: patients)" className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث..." className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm flex-1 min-w-[200px]" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSearch} className="px-4 py-2 bg-sky-600 rounded text-sm font-bold">بحث</button>
          <button onClick={handleReset} className="px-4 py-2 bg-slate-700 rounded text-sm">إعادة تعيين</button>
          <button onClick={handleExport} className="px-4 py-2 bg-emerald-700 rounded text-sm mr-auto">تصدير CSV</button>
        </div>
      </div>

      {/* Table with Loading & Pagination */}
      <div className="flex-1 bg-black border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><div className="text-slate-400">جاري التحميل...</div></div>
        ) : (
          <>
            <div className="overflow-auto p-4 font-mono text-xs flex-1">
              <table className="w-full text-left">
                <thead className="text-slate-500 border-b border-slate-800"><tr><th className="p-3">الوقت</th><th className="p-3">المستخدم</th><th className="p-3">العملية</th><th className="p-3">الكيان</th><th className="p-3">المعرف</th><th className="p-3">IP</th></tr></thead>
                <tbody className="divide-y divide-slate-900">
                  {logs?.map((log) => (
                    <tr key={log.id} onClick={() => setSelectedLog(log)} className="hover:bg-slate-900/50 cursor-pointer">
                      <td className="p-3 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-3 text-white">{log.user ? `${log.user.fullName} (${log.user.username})` : "System/Guest"}</td>
                      <td className={`p-3 font-bold rounded ${getActionColor(log.action)}`}>{getActionIcon(log.action)} {log.action}</td>
                      <td className="p-3 text-amber-200">{log.entity}</td>
                      <td className="p-3 text-slate-300">{log.entityId}</td>
                      <td className="p-3 text-slate-500">{log.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="border-t border-slate-800 p-3 flex justify-between items-center text-sm">
              <div className="text-slate-400">{meta.total} سجل | صفحة {meta.page} من {meta.totalPages}</div>
              <div className="flex gap-2">
                <button onClick={() => loadLogs(meta.page - 1)} disabled={meta.page <= 1} className="px-3 py-1 bg-slate-800 rounded disabled:opacity-50">السابق</button>
                <button onClick={() => loadLogs(meta.page + 1)} disabled={meta.page >= meta.totalPages} className="px-3 py-1 bg-slate-800 rounded disabled:opacity-50">التالي</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">تفاصيل السجل #{selectedLog.id}</h2>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-slate-400">العملية:</span> <span className={getActionColor(selectedLog.action)}>{selectedLog.action}</span></div>
                <div><span className="text-slate-400">الكيان:</span> {selectedLog.entity}</div>
                <div><span className="text-slate-400">المعرف:</span> {selectedLog.entityId}</div>
                <div><span className="text-slate-400">IP:</span> {selectedLog.ipAddress}</div>
                <div><span className="text-slate-400">الوقت:</span> {new Date(selectedLog.createdAt).toLocaleString()}</div>
                <div><span className="text-slate-400">المستخدم:</span> {selectedLog.user?.fullName || 'System'}</div>
              </div>
              {selectedLog.oldValues && (
                <div className="bg-rose-950/30 border border-rose-900/50 rounded p-3">
                  <h3 className="text-rose-400 font-bold mb-2">القيم السابقة</h3>
                  <pre className="text-xs overflow-auto">{JSON.stringify(selectedLog.oldValues, null, 2)}</pre>
                </div>
              )}
              {selectedLog.newValues && (
                <div className="bg-emerald-950/30 border border-emerald-900/50 rounded p-3">
                  <h3 className="text-emerald-400 font-bold mb-2">القيم الجديدة</h3>
                  <pre className="text-xs overflow-auto">{JSON.stringify(selectedLog.newValues, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
