// src/pages/ReferralsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

interface Referral {
  id: number;
  reason: string;
  clinicalSummary?: string;
  priority: string;
  status: string;
  notes?: string;
  createdAt: string;
  completedAt?: string;
  patient: { id: number; fullName: string; mrn: string };
  referringDoctor?: { id: number; fullName: string };
  receivingDoctor?: { id: number; fullName: string };
}

interface Doctor {
  id: number;
  fullName: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "في الانتظار", color: "bg-amber-900/30 text-amber-400 border-amber-700" },
  ACCEPTED: { label: "مقبولة", color: "bg-sky-900/30 text-sky-400 border-sky-700" },
  COMPLETED: { label: "مكتملة", color: "bg-emerald-900/30 text-emerald-400 border-emerald-700" },
  REJECTED: { label: "مرفوضة", color: "bg-red-900/30 text-red-400 border-red-700" },
  CANCELLED: { label: "ملغاة", color: "bg-slate-800/50 text-slate-400 border-slate-700" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  URGENT: { label: "عاجلة", color: "text-red-400" },
  ROUTINE: { label: "عادية", color: "text-slate-400" },
};

export default function ReferralsPage() {
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [actionNotes, setActionNotes] = useState("");
  const [actionModal, setActionModal] = useState<{
    type: "complete" | "reject";
    id: number;
  } | null>(null);

  // Create form
  const [form, setForm] = useState({
    patientSearch: "",
    patientId: 0,
    receivingDoctorId: 0,
    reason: "",
    clinicalSummary: "",
    priority: "ROUTINE",
  });
  const [patients, setPatients] = useState<any[]>([]);

  const loadReferrals = async () => {
    setLoading(true);
    try {
      const endpoint = tab === "sent" ? "/referrals/sent" : "/referrals/received";
      const res = await apiClient.get<Referral[]>(endpoint);
      setReferrals(res.data);
    } catch {
      toast.error("فشل تحميل الإحالات");
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const res = await apiClient.get<Doctor[]>("/cashier/users");
      setDoctors(res.data);
    } catch {}
  };

  const searchPatients = async (q: string) => {
    if (q.length < 2) return;
    try {
      const res = await apiClient.get("/patients", { params: { search: q, limit: 10 } });
      setPatients(res.data?.data || res.data || []);
    } catch {}
  };

  useEffect(() => {
    loadReferrals();
  }, [tab]);

  useEffect(() => {
    loadDoctors();
  }, []);

  const handleCreate = async () => {
    if (!form.patientId || !form.receivingDoctorId || !form.reason) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    try {
      await apiClient.post("/referrals", {
        patientId: form.patientId,
        receivingDoctorId: form.receivingDoctorId,
        reason: form.reason,
        clinicalSummary: form.clinicalSummary || undefined,
        priority: form.priority,
      });
      toast.success("تم إنشاء الإحالة بنجاح");
      setShowModal(false);
      setForm({ patientSearch: "", patientId: 0, receivingDoctorId: 0, reason: "", clinicalSummary: "", priority: "ROUTINE" });
      loadReferrals();
    } catch {
      toast.error("فشل إنشاء الإحالة");
    }
  };

  const handleAction = async (action: string, id: number, notes?: string) => {
    try {
      if (action === "accept") {
        await apiClient.patch(`/referrals/${id}/accept`);
        toast.success("تم قبول الإحالة");
      } else if (action === "complete") {
        await apiClient.patch(`/referrals/${id}/complete`, { notes });
        toast.success("تم إكمال الإحالة");
      } else if (action === "reject") {
        await apiClient.patch(`/referrals/${id}/reject`, { notes });
        toast.success("تم رفض الإحالة");
      } else if (action === "cancel") {
        await apiClient.patch(`/referrals/${id}/cancel`);
        toast.success("تم إلغاء الإحالة");
      }
      setActionModal(null);
      setActionNotes("");
      loadReferrals();
    } catch {
      toast.error("فشل تنفيذ الإجراء");
    }
  };

  return (
    <div className="p-6 text-slate-100 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">نظام الإحالات</h1>
          <p className="text-slate-400 text-sm mt-1">إحالة المرضى بين الأطباء مع تتبع الحالة</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/30"
        >
          + إحالة جديدة
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-800/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("received")}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition ${
            tab === "received"
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          إحالات واردة
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition ${
            tab === "sent"
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          إحالات صادرة
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">جاري التحميل...</div>
      ) : referrals.length === 0 ? (
        <div className="text-center py-16 text-slate-500">لا توجد إحالات</div>
      ) : (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-5 py-3 text-right text-slate-400">#</th>
                <th className="px-5 py-3 text-right text-slate-400">المريض</th>
                <th className="px-5 py-3 text-right text-slate-400">
                  {tab === "received" ? "من الطبيب" : "إلى الطبيب"}
                </th>
                <th className="px-5 py-3 text-right text-slate-400">السبب</th>
                <th className="px-5 py-3 text-center text-slate-400">الأولوية</th>
                <th className="px-5 py-3 text-center text-slate-400">الحالة</th>
                <th className="px-5 py-3 text-right text-slate-400">التاريخ</th>
                <th className="px-5 py-3 text-center text-slate-400">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {referrals.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-5 py-3 font-mono text-slate-500">{r.id}</td>
                  <td className="px-5 py-3">
                    <div className="font-bold">{r.patient.fullName}</div>
                    <div className="text-xs text-slate-500">{r.patient.mrn}</div>
                  </td>
                  <td className="px-5 py-3">
                    {tab === "received"
                      ? r.referringDoctor?.fullName
                      : r.receivingDoctor?.fullName}
                  </td>
                  <td className="px-5 py-3 max-w-[200px] truncate">{r.reason}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={PRIORITY_MAP[r.priority]?.color || ""}>
                      {PRIORITY_MAP[r.priority]?.label || r.priority}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs border ${STATUS_MAP[r.status]?.color || ""}`}>
                      {STATUS_MAP[r.status]?.label || r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">
                    {new Date(r.createdAt).toLocaleDateString("ar-LY")}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {tab === "received" && r.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => handleAction("accept", r.id)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-500 transition"
                          >
                            قبول
                          </button>
                          <button
                            onClick={() => setActionModal({ type: "reject", id: r.id })}
                            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-500 transition"
                          >
                            رفض
                          </button>
                        </>
                      )}
                      {tab === "received" && r.status === "ACCEPTED" && (
                        <button
                          onClick={() => setActionModal({ type: "complete", id: r.id })}
                          className="px-3 py-1 bg-sky-600 text-white rounded-lg text-xs hover:bg-sky-500 transition"
                        >
                          إكمال
                        </button>
                      )}
                      {tab === "sent" && r.status === "PENDING" && (
                        <button
                          onClick={() => handleAction("cancel", r.id)}
                          className="px-3 py-1 bg-slate-600 text-white rounded-lg text-xs hover:bg-slate-500 transition"
                        >
                          إلغاء
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Referral Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-xl font-bold mb-5">إحالة جديدة</h2>

            {/* Patient Search */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">المريض *</label>
              <input
                type="text"
                value={form.patientSearch}
                onChange={(e) => {
                  setForm({ ...form, patientSearch: e.target.value, patientId: 0 });
                  searchPatients(e.target.value);
                }}
                placeholder="ابحث بالاسم أو رقم الملف..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 focus:border-transparent outline-none"
              />
              {patients.length > 0 && !form.patientId && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl mt-1 max-h-40 overflow-y-auto">
                  {patients.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setForm({ ...form, patientId: p.id, patientSearch: p.fullName });
                        setPatients([]);
                      }}
                      className="w-full px-4 py-2 text-right text-sm hover:bg-slate-700 transition"
                    >
                      {p.fullName} - {p.mrn}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Receiving Doctor */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">الطبيب المُحال إليه *</label>
              <select
                value={form.receivingDoctorId}
                onChange={(e) => setForm({ ...form, receivingDoctorId: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
              >
                <option value={0}>اختر الطبيب...</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.fullName}</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">سبب الإحالة *</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
                placeholder="سبب الإحالة..."
              />
            </div>

            {/* Clinical Summary */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">الملخص السريري</label>
              <textarea
                value={form.clinicalSummary}
                onChange={(e) => setForm({ ...form, clinicalSummary: e.target.value })}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none resize-none"
                placeholder="ملخص الحالة السريرية..."
              />
            </div>

            {/* Priority */}
            <div className="mb-5">
              <label className="text-sm text-slate-400 mb-1 block">الأولوية</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
              >
                <option value="ROUTINE">عادية</option>
                <option value="URGENT">عاجلة</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 bg-slate-700 text-slate-300 rounded-xl hover:bg-slate-600 transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                className="px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-500 transition"
              >
                إرسال الإحالة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Notes Modal (Complete/Reject) */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4">
              {actionModal.type === "complete" ? "إكمال الإحالة" : "رفض الإحالة"}
            </h2>
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">ملاحظات</label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none resize-none"
                placeholder={
                  actionModal.type === "complete"
                    ? "نتيجة الكشف أو الملاحظات..."
                    : "سبب الرفض..."
                }
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setActionModal(null); setActionNotes(""); }}
                className="px-5 py-2.5 bg-slate-700 text-slate-300 rounded-xl hover:bg-slate-600 transition"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleAction(actionModal.type, actionModal.id, actionNotes)}
                className={`px-5 py-2.5 text-white rounded-xl font-bold transition ${
                  actionModal.type === "complete" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"
                }`}
              >
                {actionModal.type === "complete" ? "تأكيد الإكمال" : "تأكيد الرفض"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
