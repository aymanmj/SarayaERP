// src/pages/LeavesPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

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
  const { user } = useAuthStore();
  const isAdmin = user?.roles.includes("ADMIN") || user?.roles.includes("HR");

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form
  const [form, setForm] = useState({
    type: "ANNUAL" as LeaveType,
    startDate: "",
    endDate: "",
    reason: "",
  });

  const loadLeaves = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<LeaveRequest[]>("/hr/leaves");
      setLeaves(res.data);
    } catch {
      toast.error("فشل تحميل الإجازات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const handleSubmit = async () => {
    if (!form.startDate || !form.endDate) return;
    try {
      await apiClient.post("/hr/leaves", form);
      toast.success("تم إرسال طلب الإجازة");
      setShowModal(false);
      loadLeaves();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل الطلب");
    }
  };

  const handleUpdateStatus = async (
    id: number,
    status: "APPROVED" | "REJECTED"
  ) => {
    if (!confirm("هل أنت متأكد؟")) return;
    try {
      await apiClient.patch(`/hr/leaves/${id}/status`, { status });
      toast.success("تم تحديث الحالة.");
      loadLeaves();
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
          <h1 className="text-2xl font-bold mb-1">إدارة الإجازات</h1>
          <p className="text-sm text-slate-400">
            تقديم ومراجعة طلبات الإجازات.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg"
        >
          + طلب إجازة جديد
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">الموظف</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">من - إلى</th>
              <th className="px-4 py-3">المدة</th>
              <th className="px-4 py-3">السبب</th>
              <th className="px-4 py-3">الحالة</th>
              {isAdmin && (
                <th className="px-4 py-3 text-center">إجراءات المدير</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {leaves.map((L) => (
              <tr key={L.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-semibold">{L.user.fullName}</td>
                <td className="px-4 py-3">{TYPE_LABELS[L.type]}</td>
                <td className="px-4 py-3 text-xs text-slate-300">
                  {formatDate(L.startDate)} -{" "}
                  {formatDate(L.endDate)}
                </td>
                <td className="px-4 py-3">{L.daysCount} أيام</td>
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
                    {L.status === "PENDING"
                      ? "قيد المراجعة"
                      : L.status === "APPROVED"
                      ? "مقبولة"
                      : "مرفوضة"}
                  </span>
                </td>
                {isAdmin && L.status === "PENDING" && (
                  <td className="px-4 py-3 flex gap-2 justify-center">
                    <button
                      onClick={() => handleUpdateStatus(L.id, "APPROVED")}
                      className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white"
                    >
                      قبول
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(L.id, "REJECTED")}
                      className="px-3 py-1 bg-rose-700 hover:bg-rose-600 rounded text-xs text-white"
                    >
                      رفض
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
            <h3 className="text-lg font-bold">تقديم طلب إجازة</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">نوع الإجازة</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as any })
                  }
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-slate-400">من</label>
                  <DatePicker
                    date={form.startDate ? new Date(form.startDate) : undefined}
                    onChange={(d) =>
                      setForm({ ...form, startDate: d ? d.toISOString().slice(0, 10) : "" })
                    }
                    className="bg-slate-950 border-slate-700 h-9 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-slate-400">إلى</label>
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
                <label className="text-xs text-slate-400">السبب</label>
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
                إلغاء
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                إرسال الطلب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
