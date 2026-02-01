// src/pages/SurgerySchedulePage.tsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";

type SurgeryStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "RECOVERY"
  | "COMPLETED"
  | "CANCELLED";

type SurgeryCaseLite = {
  id: number;
  surgeryName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: SurgeryStatus;
  theatre: { name: string };
  encounter: {
    patient: { fullName: string; mrn: string };
  };
  team: { user: { fullName: string } }[];
};

type Theatre = { id: number; name: string };
type ActiveInpatient = {
  id: number;
  patient: { fullName: string; mrn: string };
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-LY", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusColor(s: SurgeryStatus) {
  switch (s) {
    case "SCHEDULED":
      return "bg-sky-900/40 text-sky-300 border-sky-500/30";
    case "IN_PROGRESS":
      return "bg-amber-900/40 text-amber-300 border-amber-500/30 animate-pulse";
    case "COMPLETED":
      return "bg-emerald-900/40 text-emerald-300 border-emerald-500/30";
    case "CANCELLED":
      return "bg-rose-900/40 text-rose-300 border-rose-500/30";
    default:
      return "bg-slate-800 text-slate-300";
  }
}

export default function SurgerySchedulePage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<SurgeryCaseLite[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [inpatients, setInpatients] = useState<ActiveInpatient[]>([]);

  // Booking Form
  const [form, setForm] = useState({
    encounterId: "",
    theatreId: "",
    surgeryName: "",
    startTime: "08:00",
    durationMinutes: 60,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SurgeryCaseLite[]>("/surgery/cases", {
        params: { date },
      });
      setCases(res.data);
    } catch {
      toast.error("فشل تحميل جدول العمليات");
    } finally {
      setLoading(false);
    }
  };

  const loadResources = async () => {
    try {
      const [thRes, patRes] = await Promise.all([
        apiClient.get<Theatre[]>("/surgery/theatres"),
        apiClient.get<ActiveInpatient[]>("/encounters/list/active-inpatients"),
      ]);
      setTheatres(thRes.data);
      setInpatients(patRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [date]);
  useEffect(() => {
    loadResources();
  }, []);

  const handleBook = async () => {
    if (!form.encounterId || !form.theatreId || !form.surgeryName) {
      toast.warning("يرجى تعبئة كافة الحقول");
      return;
    }

    const start = new Date(`${date}T${form.startTime}`);
    const end = new Date(start.getTime() + form.durationMinutes * 60000);

    try {
      await apiClient.post("/surgery/schedule", {
        hospitalId: 1, // يأخذه الباكند من التوكن، لكن للتوضيح
        encounterId: Number(form.encounterId),
        theatreId: Number(form.theatreId),
        surgeryName: form.surgeryName,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      });
      toast.success("تم حجز العملية بنجاح");
      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل الحجز");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            جدول العمليات الجراحية (OT)
          </h1>
          <p className="text-sm text-slate-400">
            إدارة الحجوزات وغرف العمليات.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg"
        >
          + حجز عملية جديدة
        </button>
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 w-fit">
        <span className="text-sm text-slate-400">تاريخ العرض:</span>
        <DatePicker
            date={date ? new Date(date) : undefined}
            onChange={(d) => setDate(d ? d.toISOString().slice(0, 10) : "")}
            className="bg-slate-950 border-slate-700 h-9 px-2 text-sm"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto space-y-3">
        {loading && (
          <div className="text-center text-slate-500 py-10">
            جارِ التحميل...
          </div>
        )}
        {!loading && cases.length === 0 && (
          <div className="text-center text-slate-500 py-10">
            لا توجد عمليات مجدولة لهذا اليوم.
          </div>
        )}

        {cases.map((c) => (
          <div
            key={c.id}
            onClick={() => navigate(`/surgery/${c.id}`)}
            className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl hover:bg-slate-800 cursor-pointer transition group"
          >
            <div className="flex justify-between items-start">
              <div className="flex gap-4">
                <div className="flex flex-col items-center justify-center bg-slate-950 p-3 rounded-xl border border-slate-800 min-w-[80px]">
                  <span className="text-lg font-bold text-slate-200">
                    {formatTime(c.scheduledStart)}
                  </span>
                  <span className="text-xs text-slate-500">
                    إلى {formatTime(c.scheduledEnd)}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition">
                    {c.surgeryName}
                  </h3>
                  <div className="text-sm text-slate-400 flex gap-2 mt-1">
                    <span>👤 {c.encounter.patient.fullName}</span>
                    <span className="text-slate-600">|</span>
                    <span>🏥 {c.theatre.name}</span>
                  </div>
                  {c.team.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {c.team.map((t, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300"
                        >
                          {t.user.fullName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-full text-xs border font-medium ${getStatusColor(
                  c.status
                )}`}
              >
                {c.status}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Booking Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">حجز غرفة عمليات</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  المريض (من قائمة المنومين)
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.encounterId}
                  onChange={(e) =>
                    setForm({ ...form, encounterId: e.target.value })
                  }
                >
                  <option value="">-- اختر مريضاً --</option>
                  {inpatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.patient.fullName} ({p.patient.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  غرفة العمليات
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.theatreId}
                  onChange={(e) =>
                    setForm({ ...form, theatreId: e.target.value })
                  }
                >
                  <option value="">-- اختر الغرفة --</option>
                  {theatres.map((th) => (
                    <option key={th.id} value={th.id}>
                      {th.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  اسم العملية / الإجراء
                </label>
                <input
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  placeholder="مثال: استئصال الزائدة الدودية"
                  value={form.surgeryName}
                  onChange={(e) =>
                    setForm({ ...form, surgeryName: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">
                    وقت البدء
                  </label>
                  <input
                    type="time"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">
                    المدة المتوقعة (دقيقة)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    value={form.durationMinutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        durationMinutes: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleBook}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500"
              >
                تأكيد الحجز
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
