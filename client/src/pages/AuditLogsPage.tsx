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
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [userId, setUserId] = useState("");
  const [entity, setEntity] = useState("");
  const [actionType, setActionType] = useState(""); // READ, CREATE, UPDATE...

  const loadLogs = async () => {
    setLoading(true);
    try {
      // نفترض وجود endpoint للبحث
      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      if (entity) params.append("entity", entity);
      if (actionType) params.append("actionType", actionType);

      // ملاحظة: ستحتاج لإضافة هذا الـ Endpoint في AuditController
      const res = await apiClient.get<AuditLog[]>("/audit/logs");
      setLogs(res.data);
    } catch {
      toast.error("فشل تحميل السجلات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const getActionColor = (action: string) => {
    if (action.includes("VIEW")) return "text-blue-400";
    if (action.includes("DELETE")) return "text-rose-400";
    if (action.includes("POST") || action.includes("CREATE"))
      return "text-emerald-400";
    return "text-slate-300";
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
          onClick={loadLogs}
          className="px-4 py-2 bg-slate-800 rounded-xl text-sm"
        >
          تحديث
        </button>
      </div>

      {/* Filters (Simplified) */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex gap-4">
        <select
          className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"
          onChange={(e) => setActionType(e.target.value)}
        >
          <option value="">كل العمليات</option>
          <option value="VIEW">اطلاع (View)</option>
          <option value="WRITE">تعديل (Write)</option>
        </select>
        <input
          placeholder="Entity (e.g. patients)"
          className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"
          onChange={(e) => setEntity(e.target.value)}
        />
        <button
          onClick={loadLogs}
          className="px-4 py-2 bg-sky-600 rounded text-sm font-bold"
        >
          بحث
        </button>
      </div>

      <div className="flex-1 bg-black border border-slate-800 rounded-2xl overflow-auto p-4 font-mono text-xs">
        <table className="w-full text-left">
          <thead className="text-slate-500 border-b border-slate-800">
            <tr>
              <th className="p-3">Time</th>
              <th className="p-3">User</th>
              <th className="p-3">Action</th>
              <th className="p-3">Entity</th>
              <th className="p-3">Target ID</th>
              <th className="p-3">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-900/50">
                <td className="p-3 text-slate-400">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="p-3 text-white">
                  {log.user
                    ? `${log.user.fullName} (${log.user.username})`
                    : "System/Guest"}
                </td>
                <td className={`p-3 font-bold ${getActionColor(log.action)}`}>
                  {log.action}
                </td>
                <td className="p-3 text-amber-200">{log.entity}</td>
                <td className="p-3 text-slate-300">{log.entityId}</td>
                <td className="p-3 text-slate-500">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
