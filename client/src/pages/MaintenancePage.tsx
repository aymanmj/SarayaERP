import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [assets, setAssets] = useState<AssetLite[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      toast.error(t("maintenance.toast.loadError", "فشل تحميل التذاكر"));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.success(t("maintenance.toast.createSuccess", "تم فتح تذكرة الصيانة"));
      setShowCreateModal(false);
      loadTickets();
    } catch {
      toast.error(t("maintenance.toast.createError", "فشل الإنشاء"));
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
      toast.success(t("maintenance.toast.updateSuccess", "تم تحديث حالة التذكرة"));
      setShowResolveModal(false);
      loadTickets();
    } catch {
      toast.error(t("maintenance.toast.updateError", "فشل التحديث"));
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("maintenance.title", "إدارة الصيانة (CMMS)")}</h1>
          <p className="text-sm text-slate-400">
            {t("maintenance.subtitle", "متابعة أعطال الأجهزة والصيانة الدورية.")}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-sm font-bold text-white shadow-lg"
        >
          {t("maintenance.reportIssue", "+ إبلاغ عن عطل")}
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">{t("maintenance.table.ticketNumber", "رقم التذكرة")}</th>
              <th className="px-4 py-3">{t("maintenance.table.device", "الجهاز")}</th>
              <th className="px-4 py-3">{t("maintenance.table.type", "النوع")}</th>
              <th className="px-4 py-3">{t("maintenance.table.priority", "الأولوية")}</th>
              <th className="px-4 py-3">{t("maintenance.table.desc", "الوصف")}</th>
              <th className="px-4 py-3">{t("maintenance.table.requester", "طالب الصيانة")}</th>
              <th className="px-4 py-3">{t("maintenance.table.status", "الحالة")}</th>
              <th className="px-4 py-3">{t("maintenance.table.action", "إجراء")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tickets.map((tItem) => (
              <tr key={tItem.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-slate-500">#{tItem.id}</td>
                <td className="px-4 py-3 font-semibold">
                  {tItem.asset.name}{" "}
                  <span className="text-xs text-sky-400">
                    ({tItem.asset.tagNumber})
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {tItem.type === "CORRECTIVE" 
                    ? t("maintenance.types.corrective", "إصلاح عطل") 
                    : t("maintenance.types.preventive", "صيانة دورية")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      tItem.priority === "HIGH"
                        ? "bg-rose-900 text-rose-300"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {tItem.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300 truncate max-w-xs">
                  {tItem.issueDescription}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {tItem.requester.fullName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-[10px] font-bold border ${
                      tItem.status === "OPEN"
                        ? "bg-rose-900/20 border-rose-500/30 text-rose-300"
                        : tItem.status === "RESOLVED"
                        ? "bg-emerald-900/20 border-emerald-500/30 text-emerald-300"
                        : "bg-slate-800 border-slate-600 text-slate-400"
                    }`}
                  >
                    {tItem.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {tItem.status !== "CLOSED" && (
                    <button
                      onClick={() => {
                        setSelectedTicketId(tItem.id);
                        setShowResolveModal(true);
                      }}
                      className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded"
                    >
                      {t("maintenance.action.updateClose", "تحديث / إغلاق")}
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
            <h3 className="text-lg font-bold">{t("maintenance.modal.createTitle", "تسجيل طلب صيانة")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("maintenance.modal.deviceLabel", "الجهاز")}
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={createForm.assetId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, assetId: e.target.value })
                  }
                >
                  <option value="">{t("maintenance.modal.selectDevicePlaceholder", "-- اختر الجهاز --")}</option>
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
                    {t("maintenance.modal.typeLabel", "النوع")}
                  </label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    value={createForm.type}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, type: e.target.value })
                    }
                  >
                    <option value="CORRECTIVE">{t("maintenance.types.corrective", "إصلاح عطل")}</option>
                    <option value="PREVENTIVE">{t("maintenance.types.preventive", "صيانة دورية")}</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">
                    {t("maintenance.modal.priorityLabel", "الأهمية")}
                  </label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, priority: e.target.value })
                    }
                  >
                    <option value="NORMAL">{t("maintenance.priority.normal", "عادية")}</option>
                    <option value="HIGH">{t("maintenance.priority.high", "عالية")}</option>
                    <option value="CRITICAL">{t("maintenance.priority.critical", "حرجة جداً")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("maintenance.modal.descLabel", "وصف المشكلة")}
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
                {t("common.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold"
              >
                {t("maintenance.modal.submitCreate", "تسجيل الطلب")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">{t("maintenance.modal.updateTitle", "تحديث حالة الصيانة")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("maintenance.modal.statusLabel", "الحالة الجديدة")}
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={resolveForm.status}
                  onChange={(e) =>
                    setResolveForm({ ...resolveForm, status: e.target.value })
                  }
                >
                  <option value="IN_PROGRESS">{t("maintenance.status.inProgress", "جاري العمل")}</option>
                  <option value="RESOLVED">{t("maintenance.status.resolved", "تم الإصلاح (بانتظار الإغلاق)")}</option>
                  <option value="CLOSED">{t("maintenance.status.closed", "مغلقة (عودة للخدمة)")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("maintenance.modal.techReportLabel", "تقرير الفني")}
                </label>
                <textarea
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  rows={3}
                  value={resolveForm.notes}
                  onChange={(e) =>
                    setResolveForm({ ...resolveForm, notes: e.target.value })
                  }
                  placeholder={t("maintenance.modal.techNotesPlaceholder", "ماذا تم عمله؟ هل تم استبدال قطع؟")}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("maintenance.modal.costLabel", "تكلفة الإصلاح (إن وجدت)")}
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
                {t("common.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleResolve}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                {t("common.update", "تحديث")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
