// src/pages/LeavesPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { useTranslation } from "react-i18next";

type LeaveType = "ANNUAL" | "SICK" | "UNPAID" | "EMERGENCY";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

type LeaveRequest = {
  id: number;
  type: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string | null;
  status: LeaveStatus;
  user: { fullName: string };
  createdAt: string;
};

const TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: "سنوية",
  SICK: "مرضية",
  UNPAID: "بدون راتب",
  EMERGENCY: "طارئة",
};

export default function LeavesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { user } = useAuthStore();
  const isAdmin = user?.roles.includes("ADMIN") || user?.roles.includes("HR");

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form
  const [form, setForm] = useState({
    type: "ANNUAL" as LeaveType,
    startDate: "",
    endDate: "",
    reason: "",
  });

  const getLeaveTypeLabel = (type: LeaveType) => {
    const keys: Record<LeaveType, { key: string; defaultValue: string }> = {
      ANNUAL: { key: "hr.leaves.typeAnnual", defaultValue: "سنوية" },
      SICK: { key: "hr.leaves.typeSick", defaultValue: "مرضية" },
      UNPAID: { key: "hr.leaves.typeUnpaid", defaultValue: "بدون راتب" },
      EMERGENCY: { key: "hr.leaves.typeEmergency", defaultValue: "طارئة" },
    };
    const item = keys[type];
    return item ? t(item.key, item.defaultValue) : type;
  };

  const getLeaveStatusLabel = (status: LeaveStatus) => {
    const keys: Record<LeaveStatus, { key: string; defaultValue: string }> = {
      PENDING: { key: "hr.leaves.statusPending", defaultValue: "قيد المراجعة" },
      APPROVED: { key: "hr.leaves.statusApproved", defaultValue: "مقبولة" },
      REJECTED: { key: "hr.leaves.statusRejected", defaultValue: "مرفوضة" },
    };
    const item = keys[status];
    return item ? t(item.key, item.defaultValue) : status;
  };

  const loadLeaves = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<LeaveRequest[]>("/hr/leaves");
      setLeaves(res.data);
    } catch {
      toast.error(t("hr.leaves.loadFailed", "فشل تحميل الإجازات"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!form.startDate || !form.endDate) return;
    try {
      await apiClient.post("/hr/leaves", form);
      toast.success(t("hr.leaves.requestSent", "تم إرسال طلب الإجازة"));
      setShowModal(false);
      loadLeaves();
     
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("hr.leaves.requestFailed", "فشل الطلب"));
    }
  };

  const handleUpdateStatus = async (
    id: number,
    status: "APPROVED" | "REJECTED"
  ) => {
    if (!confirm(t("common.confirmQuestion", "هل أنت متأكد؟"))) return;
    try {
      await apiClient.patch(`/hr/leaves/${id}/status`, { status });
      toast.success(t("hr.leaves.statusUpdated", "تم تحديث الحالة."));
      loadLeaves();
    } catch {
      toast.error(t("hr.leaves.updateFailed", "فشل التحديث"));
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("hr.leaves.title", "إدارة الإجازات")}</h1>
          <p className="text-sm text-slate-400">
            {t("hr.leaves.subtitle", "تقديم ومراجعة طلبات الإجازات.")}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg"
        >
          {t("hr.leaves.newRequestBtn", "+ طلب إجازة جديد")}
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">{t("hr.leaves.employeeHeader", "الموظف")}</th>
              <th className="px-4 py-3">{t("hr.leaves.typeHeader", "النوع")}</th>
              <th className="px-4 py-3">{t("hr.leaves.periodHeader", "من - إلى")}</th>
              <th className="px-4 py-3">{t("hr.leaves.durationHeader", "المدة")}</th>
              <th className="px-4 py-3">{t("hr.leaves.reasonHeader", "السبب")}</th>
              <th className="px-4 py-3">{t("hr.leaves.statusHeader", "الحالة")}</th>
              {isAdmin && (
                <th className="px-4 py-3 text-center">{t("hr.leaves.managerActionsHeader", "إجراءات المدير")}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {leaves.map((L) => (
              <tr key={L.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-semibold">{L.user.fullName}</td>
                <td className="px-4 py-3">{getLeaveTypeLabel(L.type)}</td>
                <td className="px-4 py-3 text-xs text-slate-300">
                  {formatDate(L.startDate)} -{" "}
                  {formatDate(L.endDate)}
                </td>
                <td className="px-4 py-3">{L.daysCount} {t("hr.leaves.daysLabel", "أيام")}</td>
                <td className="px-4 py-3 text-slate-400 text-xs truncate max-w-xs">
                  {L.reason}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      L.status === "APPROVED"
                        ? "bg-emerald-900/40 text-emerald-300"
                        : L.status === "REJECTED"
                        ? "bg-rose-900/40 text-rose-300"
                        : "bg-amber-900/40 text-amber-300"
                    }`}
                  >
                    {getLeaveStatusLabel(L.status)}
                  </span>
                </td>
                {isAdmin && L.status === "PENDING" && (
                  <td className="px-4 py-3 flex gap-2 justify-center">
                    <button
                      onClick={() => handleUpdateStatus(L.id, "APPROVED")}
                      className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white"
                    >
                      {t("common.approve", "قبول")}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(L.id, "REJECTED")}
                      className="px-3 py-1 bg-rose-700 hover:bg-rose-600 rounded text-xs text-white"
                    >
                      {t("common.reject", "رفض")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">{t("hr.leaves.modalTitle", "تقديم طلب إجازة")}</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">{t("hr.leaves.leaveTypeLabel", "نوع الإجازة")}</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as any })
                  }
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([k]) => (
                    <option key={k} value={k}>
                      {getLeaveTypeLabel(k as LeaveType)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-slate-400">{t("common.from", "من")}</label>
                  <DatePicker
                    date={form.startDate ? new Date(form.startDate) : undefined}
                    onChange={(d) =>
                      setForm({ ...form, startDate: d ? d.toISOString().slice(0, 10) : "" })
                    }
                    className="bg-slate-950 border-slate-700 h-9 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-slate-400">{t("common.to", "إلى")}</label>
                  <DatePicker
                    date={form.endDate ? new Date(form.endDate) : undefined}
                    onChange={(d) =>
                      setForm({ ...form, endDate: d ? d.toISOString().slice(0, 10) : "" })
                    }
                    className="bg-slate-950 border-slate-700 h-9 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">{t("hr.leaves.reasonLabel", "السبب")}</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  rows={2}
                ></textarea>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm"
              >
                {t("common.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                {t("hr.leaves.submitRequestBtn", "إرسال الطلب")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
