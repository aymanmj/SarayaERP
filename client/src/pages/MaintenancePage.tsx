// src/pages/MaintenancePage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type MaintenanceType = "PREVENTIVE" | "CORRECTIVE";

type MaintenanceTicket = {
  id: number;
  type: MaintenanceType;
  status: TicketStatus;
  priority: string;
  issueDescription: string;
  technicianNotes: string | null;
  cost: string;
  requestedAt: string;
  completedAt: string | null;
  asset: { name: string; tagNumber: string };
  requester: { fullName: string };
  technician: { fullName: string } | null;
};

type AssetLite = { id: number; name: string; tagNumber: string };

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    assetId: "",
    type: "CORRECTIVE",
    priority: "NORMAL",
    desc: "",
  });
  const [resolveForm, setResolveForm] = useState({
    notes: "",
    cost: "0",
    status: "RESOLVED",
  });

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<MaintenanceTicket[]>(
        "/assets/maintenance"
      );
      setTickets(res.data);
    } catch {
      toast.error("فشل تحميل التذاكر");
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    try {
      const res = await apiClient.get<AssetLite[]>("/assets");
      setAssets(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadTickets();
    loadAssets();
  }, []);

  const handleCreate = async () => {
    if (!createForm.assetId || !createForm.desc) return;
    try {
      await apiClient.post("/assets/maintenance", {
        assetId: Number(createForm.assetId),
        type: createForm.type,
        priority: createForm.priority,
        issueDescription: createForm.desc,
      });
      toast.success("تم فتح تذكرة الصيانة");
      setShowCreateModal(false);
      loadTickets();
    } catch {
      toast.error("فشل الإنشاء");
    }
  };

  const handleResolve = async () => {
    if (!selectedTicketId) return;
    try {
      await apiClient.patch(`/assets/maintenance/${selectedTicketId}/resolve`, {
        notes: resolveForm.notes,
        cost: Number(resolveForm.cost),
        status: resolveForm.status,
      });
      toast.success("تم تحديث حالة التذكرة");
      setShowResolveModal(false);
      loadTickets();
    } catch {
      toast.error("فشل التحديث");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">إدارة الصيانة (CMMS)</h1>
          <p className="text-sm text-slate-400">
            متابعة أعطال الأجهزة والصيانة الدورية.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-sm font-bold text-white shadow-lg"
        >
          + إبلاغ عن عطل
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">رقم التذكرة</th>
              <th className="px-4 py-3">الجهاز</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">الأولوية</th>
              <th className="px-4 py-3">الوصف</th>
              <th className="px-4 py-3">طالب الصيانة</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-slate-500">#{t.id}</td>
                <td className="px-4 py-3 font-semibold">
                  {t.asset.name}{" "}
                  <span className="text-xs text-sky-400">
                    ({t.asset.tagNumber})
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {t.type === "CORRECTIVE" ? "إصلاح عطل" : "صيانة دورية"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      t.priority === "HIGH"
                        ? "bg-rose-900 text-rose-300"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300 truncate max-w-xs">
                  {t.issueDescription}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {t.requester.fullName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-[10px] font-bold border ${
                      t.status === "OPEN"
                        ? "bg-rose-900/20 border-rose-500/30 text-rose-300"
                        : t.status === "RESOLVED"
                        ? "bg-emerald-900/20 border-emerald-500/30 text-emerald-300"
                        : "bg-slate-800 border-slate-600 text-slate-400"
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {t.status !== "CLOSED" && (
                    <button
                      onClick={() => {
                        setSelectedTicketId(t.id);
                        setShowResolveModal(true);
                      }}
                      className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded"
                    >
                      تحديث / إغلاق
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">تسجيل طلب صيانة</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الجهاز
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={createForm.assetId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, assetId: e.target.value })
                  }
                >
                  <option value="">-- اختر الجهاز --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.tagNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">
                    النوع
                  </label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    value={createForm.type}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, type: e.target.value })
                    }
                  >
                    <option value="CORRECTIVE">إصلاح عطل</option>
                    <option value="PREVENTIVE">صيانة دورية</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">
                    الأهمية
                  </label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, priority: e.target.value })
                    }
                  >
                    <option value="NORMAL">عادية</option>
                    <option value="HIGH">عالية</option>
                    <option value="CRITICAL">حرجة جداً</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  وصف المشكلة
                </label>
                <textarea
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  rows={3}
                  value={createForm.desc}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, desc: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold"
              >
                تسجيل الطلب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">تحديث حالة الصيانة</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الحالة الجديدة
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={resolveForm.status}
                  onChange={(e) =>
                    setResolveForm({ ...resolveForm, status: e.target.value })
                  }
                >
                  <option value="IN_PROGRESS">جاري العمل</option>
                  <option value="RESOLVED">تم الإصلاح (بانتظار الإغلاق)</option>
                  <option value="CLOSED">مغلقة (عودة للخدمة)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  تقرير الفني
                </label>
                <textarea
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  rows={3}
                  value={resolveForm.notes}
                  onChange={(e) =>
                    setResolveForm({ ...resolveForm, notes: e.target.value })
                  }
                  placeholder="ماذا تم عمله؟ هل تم استبدال قطع؟"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  تكلفة الإصلاح (إن وجدت)
                </label>
                <input
                  type="number"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={resolveForm.cost}
                  onChange={(e) =>
                    setResolveForm({ ...resolveForm, cost: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResolveModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleResolve}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                تحديث
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
