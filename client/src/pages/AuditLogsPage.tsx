import React, { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { ShieldAlert, Search, RefreshCw, Download, FileText, Eye, Plus, Edit2, Trash2, Database, Shield, X, ArrowLeft, ArrowRight } from "lucide-react";

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
      
      if (Array.isArray(res.data)) {
        setLogs(res.data);
        setMeta({ page: 1, limit: 25, total: res.data.length, totalPages: 1 });
      } else {
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

  const handleSearch = () => loadLogs(1);

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
    const escapeCSVField = (field: any): string => {
      if (field === null || field === undefined) return "";
      const str = String(field);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
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
    if (lower.includes("view") || lower.includes("read")) return "text-sky-400 bg-sky-500/10 border-sky-500/20";
    if (lower.includes("delete")) return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    if (lower.includes("create") || lower.includes("post")) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (lower.includes("update") || lower.includes("put") || lower.includes("patch")) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-slate-300 bg-slate-500/10 border-slate-500/20";
  };

  const getActionIcon = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("view")) return <Eye className="w-4 h-4" />;
    if (lower.includes("create")) return <Plus className="w-4 h-4" />;
    if (lower.includes("update")) return <Edit2 className="w-4 h-4" />;
    if (lower.includes("delete")) return <Trash2 className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const getChanges = (oldData: any, newData: any) => {
    if (!oldData && !newData) return [];
    if (!oldData && newData) return Object.keys(newData).map(key => ({ key, old: undefined, new: newData[key] }));
    if (oldData && !newData) return Object.keys(oldData).map(key => ({ key, old: oldData[key], new: undefined }));

    const allKeys = Array.from(new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]));
    return allKeys.map(key => {
      const o = oldData?.[key];
      const n = newData?.[key];
      if (JSON.stringify(o) !== JSON.stringify(n)) {
        return { key, old: o, new: n };
      }
      return null;
    }).filter(Boolean);
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl shadow-[0_0_15px_-3px_rgba(99,102,241,0.3)]">
              <Shield className="w-6 h-6" />
            </div>
            سجل التدقيق (Audit Trail)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            مراقبة شاملة لحركات النظام، وتعديلات البيانات الحساسة (ISO 27001 Compliance).
          </p>
        </div>
        <div className="relative z-10">
          <button
            onClick={() => loadLogs(meta.page)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-bold transition-colors border border-slate-700"
          >
            <RefreshCw className="w-4 h-4" /> تحديث السجل
          </button>
        </div>
      </div>

      {/* Filters Enhanced */}
      <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
             <label className="text-xs font-bold text-slate-400">البحث الشامل</label>
             <div className="relative">
               <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
               <input 
                 value={searchQuery} 
                 onChange={(e) => setSearchQuery(e.target.value)} 
                 placeholder="ابحث برقم المعرف، اسم الكيان، الخ..." 
                 className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:border-indigo-500 outline-none transition-colors" 
               />
             </div>
          </div>
          <div className="flex flex-col gap-1 w-40">
            <label className="text-xs font-bold text-slate-400">نوع العملية</label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-500 outline-none">
              <option value="">كل العمليات</option>
              <option value="VIEW">اطلاع (View)</option>
              <option value="CREATE">إنشاء (Create)</option>
              <option value="UPDATE">تعديل (Update)</option>
              <option value="DELETE">حذف (Delete)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 w-40">
            <label className="text-xs font-bold text-slate-400">الكيان (Entity)</label>
            <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="مثال: patients" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-500 outline-none" />
          </div>
          <div className="flex flex-col gap-1 w-36">
            <label className="text-xs font-bold text-slate-400">من تاريخ</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-slate-300 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-500 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" />
          </div>
          <div className="flex flex-col gap-1 w-36">
            <label className="text-xs font-bold text-slate-400">إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-slate-300 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-500 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" />
          </div>
          
          <div className="flex gap-2 mr-auto">
            <button onClick={handleSearch} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg transition-colors">
              تصفية
            </button>
            <button onClick={handleReset} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors border border-slate-700 hover:border-slate-500">
              إعادة تعيين
            </button>
            <button onClick={handleExport} className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500 rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table with Loading & Pagination */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col relative">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
             <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin mb-4"></div>
             <p className="animate-pulse text-slate-400">جاري تحميل السجلات الأمنية...</p>
          </div>
        ) : (
          <>
            <div className="overflow-auto custom-scrollbar flex-1">
              <table className="w-full text-right text-sm">
                <thead className="text-slate-400 bg-slate-900/80 sticky top-0 z-10 backdrop-blur-md border-b border-slate-800">
                  <tr>
                    <th className="p-4 font-bold">الوقت</th>
                    <th className="p-4 font-bold">المستخدم</th>
                    <th className="p-4 font-bold">العملية</th>
                    <th className="p-4 font-bold">الكيان</th>
                    <th className="p-4 font-bold">المعرف (ID)</th>
                    <th className="p-4 font-bold">عنوان IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-20 text-slate-500">
                        <div className="flex flex-col items-center justify-center">
                          <ShieldAlert className="w-12 h-12 text-slate-700 mb-4 opacity-50" />
                          <p>لا توجد سجلات تدقيق تطابق معايير البحث.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr 
                        key={log.id} 
                        onClick={() => setSelectedLog(log)} 
                        className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                      >
                        <td className="p-4 text-slate-400 font-mono text-xs">{new Date(log.createdAt).toLocaleString("ar-LY")}</td>
                        <td className="p-4">
                          {log.user ? (
                            <div>
                              <div className="font-bold text-slate-200">{log.user.fullName}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{log.user.username}</div>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">System / Guest</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getActionColor(log.action)}`}>
                            {getActionIcon(log.action)} {log.action}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-xs text-indigo-300">
                          <div className="flex items-center gap-2">
                            <Database className="w-3 h-3 text-slate-500" />
                            {log.entity}
                            {(log.oldValues || log.newValues) && (
                              <span className="text-[9px] bg-slate-800 text-sky-400 px-1.5 py-0.5 rounded shadow-sm border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                                🔍 تفاصيل
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 font-mono text-slate-300">{log.entityId || "-"}</td>
                        <td className="p-4 font-mono text-xs text-slate-500">{log.ipAddress || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            <div className="border-t border-slate-800 p-4 bg-slate-900/80 backdrop-blur-sm flex justify-between items-center text-sm">
              <div className="text-slate-400 font-bold">
                إجمالي السجلات: <span className="text-white">{meta.total}</span> <span className="mx-2 text-slate-700">|</span> صفحة <span className="text-indigo-400">{meta.page}</span> من {meta.totalPages}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => loadLogs(meta.page - 1)} 
                  disabled={meta.page <= 1} 
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl disabled:opacity-50 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => loadLogs(meta.page + 1)} 
                  disabled={meta.page >= meta.totalPages} 
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl disabled:opacity-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                تفاصيل السجل <span className="text-slate-500 font-mono">#{selectedLog.id}</span>
              </h2>
              <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-auto custom-scrollbar flex-1 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950 p-5 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1">العملية</div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold border ${getActionColor(selectedLog.action)}`}>
                    {selectedLog.action}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1">الكيان</div>
                  <div className="font-mono text-indigo-300 text-sm">{selectedLog.entity}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1">المعرف</div>
                  <div className="font-mono text-slate-300 text-sm">{selectedLog.entityId || "N/A"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1">الوقت</div>
                  <div className="font-mono text-slate-300 text-sm">{new Date(selectedLog.createdAt).toLocaleString("ar-LY")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1">المستخدم</div>
                  <div className="text-slate-300 text-sm font-bold">{selectedLog.user?.fullName || 'System'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1">عنوان IP</div>
                  <div className="font-mono text-slate-300 text-sm">{selectedLog.ipAddress || 'Unknown'}</div>
                </div>
              </div>

              {/* Detailed Diff View */}
              {(selectedLog.oldValues || selectedLog.newValues) && (
                <div className="border border-slate-700 bg-slate-950 rounded-xl overflow-hidden">
                  <div className="bg-slate-800 p-4 font-bold border-b border-slate-700 text-slate-200 flex items-center gap-2">
                    <Database className="w-4 h-4 text-sky-400" /> تغييرات البيانات (Data Diff)
                  </div>
                  <div className="p-4 space-y-4">
                    {getChanges(selectedLog.oldValues, selectedLog.newValues).length === 0 ? (
                      <div className="text-slate-500 text-center py-6">لم يتم رصد تغييرات فعلية في الحقول.</div>
                    ) : (
                      getChanges(selectedLog.oldValues, selectedLog.newValues).map((change: any, index: number) => (
                        <div key={index} className="flex flex-col border-b border-slate-800 pb-4 last:border-0 last:pb-0">
                          <div className="text-sky-400 font-mono text-xs mb-3 font-bold bg-sky-900/20 border border-sky-500/20 self-start px-3 py-1 rounded-lg">
                            {change.key}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* القديم */}
                            <div className="flex flex-col bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                              <span className="text-[10px] text-rose-400/80 mb-2 font-bold uppercase tracking-wider">البيانات السابقة</span>
                              {change.old !== undefined ? (
                                <div className="bg-rose-950/30 text-rose-300 p-3 rounded-lg text-xs font-mono break-all line-through decoration-rose-500/50">
                                  {typeof change.old === 'object' ? JSON.stringify(change.old, null, 2) : String(change.old)}
                                </div>
                              ) : (
                                <div className="bg-slate-900 text-slate-600 p-3 rounded-lg text-xs italic text-center">لا توجد قيمة سابقة</div>
                              )}
                            </div>
                            {/* الجديد */}
                            <div className="flex flex-col bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                              <span className="text-[10px] text-emerald-400/80 mb-2 font-bold uppercase tracking-wider">البيانات الجديدة</span>
                              {change.new !== undefined ? (
                                <div className="bg-emerald-950/30 text-emerald-300 p-3 rounded-lg text-xs font-mono break-all">
                                  {typeof change.new === 'object' ? JSON.stringify(change.new, null, 2) : String(change.new)}
                                </div>
                              ) : (
                                <div className="bg-slate-900 text-slate-600 p-3 rounded-lg text-xs italic text-center">تم حذف القيمة</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
