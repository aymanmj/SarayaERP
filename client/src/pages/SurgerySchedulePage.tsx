// src/pages/SurgerySchedulePage.tsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { useAuthStore } from "../stores/authStore";

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
  team: { role: string; user: { fullName: string } }[];
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
  const { user } = useAuthStore();
  const [cases, setCases] = useState<SurgeryCaseLite[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [showOTModal, setShowOTModal] = useState(false);
  const [newOTName, setNewOTName] = useState("");
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [inpatients, setInpatients] = useState<ActiveInpatient[]>([]);

  // Booking Form
  const [form, setForm] = useState({
    encounterId: "",
    theatreId: "",
    surgeryName: "",
    startTime: "08:00",
    durationMinutes: 60,
    surgeonId: "",
    assistantId: "",
    anesthetistId: "",
    anesthesiaTechId: "",
    scrubNurseId: "",
    circulatingNurseId: "",
  });

  const [users, setUsers] = useState<{ id: number; fullName: string }[]>([]);

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
      const thRes = await apiClient.get<Theatre[]>("/surgery/theatres");
      setTheatres(thRes.data);
    } catch (e) {
      console.error("Failed to load theatres", e);
    }

    try {
      const patRes = await apiClient.get<ActiveInpatient[]>("/encounters/list/active-inpatients");
      setInpatients(patRes.data);
    } catch (e) {
      console.error("Failed to load active inpatients", e);
    }

    try {
      // ✅ Changed to /users/staff-list to include nurses and technicians for surgery team
      const userRes = await apiClient.get<{ id: number; fullName: string }[]>("/users/staff-list");
      setUsers(userRes.data);
    } catch (e) {
      console.error("Failed to load users", e);
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

    const teamMembers = [];
    if (form.surgeonId)
      teamMembers.push({ userId: Number(form.surgeonId), role: "SURGEON" });
    if (form.assistantId)
      teamMembers.push({
        userId: Number(form.assistantId),
        role: "ASSISTANT_SURGEON",
      });
    if (form.anesthetistId)
      teamMembers.push({
        userId: Number(form.anesthetistId),
        role: "ANESTHETIST",
      });
    if (form.anesthesiaTechId)
      teamMembers.push({
        userId: Number(form.anesthesiaTechId),
        role: "TECHNICIAN",
      });
    if (form.scrubNurseId)
      teamMembers.push({
        userId: Number(form.scrubNurseId),
        role: "SCRUB_NURSE",
      });
    if (form.circulatingNurseId)
      teamMembers.push({
        userId: Number(form.circulatingNurseId),
        role: "CIRCULATING_NURSE",
      });

    try {
      await apiClient.post("/surgery/schedule", {
        hospitalId: 1, // يأخذه الباكند من التوكن، لكن للتوضيح
        encounterId: Number(form.encounterId),
        theatreId: Number(form.theatreId),
        surgeryName: form.surgeryName,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        teamMembers,
      });
      toast.success("تم حجز العملية بنجاح");
      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل الحجز");
    }
  };

  const handleAddOT = async () => {
    if (!newOTName.trim()) return;
    try {
      await apiClient.post("/surgery/theatres", { name: newOTName });
      toast.success("تم إضافة غرفة العمليات بنجاح");
      setShowOTModal(false);
      setNewOTName("");
      loadResources();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل إضافة الغرفة");
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
        <div className="flex gap-2">
          {user?.roles?.includes("ADMIN") && (
            <button
              onClick={() => setShowOTModal(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-sm shadow-lg"
            >
              ⚙️ إدارة غرف العمليات
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg"
          >
            + حجز عملية جديدة
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 w-fit">
        <span className="text-sm text-slate-400">تاريخ العرض:</span>
        <DatePicker
            date={date ? new Date(date) : undefined}
            onChange={(d: Date | undefined) => setDate(d ? d.toISOString().slice(0, 10) : "")}
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

        {cases.map((c) => {
          // Group roles for display
          const surgeons = c.team.filter((t) =>
            ["SURGEON", "ASSISTANT_SURGEON"].includes(t.role)
          );
          const anesthesia = c.team.filter((t) =>
            ["ANESTHETIST", "TECHNICIAN"].includes(t.role)
          );
          const nursing = c.team.filter((t) =>
            ["SCRUB_NURSE", "CIRCULATING_NURSE"].includes(t.role)
          );

          return (
            <div
              key={c.id}
              onClick={() => navigate(`/surgery/${c.id}`)}
              className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl hover:bg-slate-800 cursor-pointer transition group relative overflow-hidden"
            >
              {/* Status Badge */}
              <div className="absolute top-4 left-4">
                <div
                  className={`px-3 py-1 rounded-full text-xs border font-medium ${getStatusColor(
                    c.status
                  )}`}
                >
                  {
                    {
                      SCHEDULED: "مجدولة",
                      IN_PROGRESS: "جارية الآن",
                      RECOVERY: "إفاقة",
                      COMPLETED: "مكتملة",
                      CANCELLED: "ملغاة",
                    }[c.status]
                  }
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                {/* Time & Room */}
                <div className="flex flex-col items-center justify-center bg-slate-950 p-4 rounded-xl border border-slate-800 min-w-[100px] text-center h-fit">
                  <span className="text-xl font-bold text-slate-200">
                    {formatTime(c.scheduledStart)}
                  </span>
                  <span className="text-xs text-slate-500 mb-2">
                    إلى {formatTime(c.scheduledEnd)}
                  </span>
                  <span className="text-[10px] text-sky-400 bg-sky-950/30 px-2 py-0.5 rounded border border-sky-900/50">
                    {c.theatre.name}
                  </span>
                </div>

                {/* Case Info */}
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition">
                      {c.surgeryName}
                    </h3>
                    <div className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                      <span>👤 المريض: {c.encounter.patient.fullName}</span>
                      <span className="text-slate-600">|</span>
                      <span>🔢 الملف: {c.encounter.patient.mrn}</span>
                    </div>
                  </div>

                  {/* Team Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 bg-slate-950/30 p-3 rounded-xl border border-slate-800/50">
                    {/* Surgeons */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        فريق الجراحة
                      </p>
                      {surgeons.length > 0 ? (
                        surgeons.map((t, idx) => (
                          <div key={idx} className="text-xs text-slate-300">
                            • {t.user.fullName}
                            <span className="text-[10px] text-slate-500 mr-1">
                              (
                              {t.role === "SURGEON"
                                ? "جراح رئيسي"
                                : "مساعد جراح"}
                              )
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-600 italic">
                          -- غير محدد --
                        </span>
                      )}
                    </div>

                    {/* Anesthesia */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        فريق التخدير
                      </p>
                      {anesthesia.length > 0 ? (
                        anesthesia.map((t, idx) => (
                          <div key={idx} className="text-xs text-slate-300">
                            • {t.user.fullName}
                            <span className="text-[10px] text-slate-500 mr-1">
                              (
                              {t.role === "ANESTHETIST"
                                ? "طبيب تخدير"
                                : "فني تخدير"}
                              )
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-600 italic">
                          -- غير محدد --
                        </span>
                      )}
                    </div>

                    {/* Nursing */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        فريق التمريض
                      </p>
                      {nursing.length > 0 ? (
                        nursing.map((t, idx) => (
                          <div key={idx} className="text-xs text-slate-300">
                            • {t.user.fullName}
                            <span className="text-[10px] text-slate-500 mr-1">
                              (
                              {t.role === "SCRUB_NURSE"
                                ? "Scrub"
                                : "Circulating"}
                              )
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-600 italic">
                          -- غير محدد --
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
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

              {/* Team Selection */}
              <div className="border-t border-slate-800 pt-3 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">
                  الطاقم الطبي (اختياري)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-sky-400 block mb-1">
                      الجراح الرئيسي
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                      value={form.surgeonId}
                      onChange={(e) =>
                        setForm({ ...form, surgeonId: e.target.value })
                      }
                    >
                      <option value="">-- اختر --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-sky-400 block mb-1">
                      مساعد جراح
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                      value={form.assistantId}
                      onChange={(e) =>
                        setForm({ ...form, assistantId: e.target.value })
                      }
                    >
                      <option value="">-- اختر --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-amber-400 block mb-1">
                      طبيب التخدير
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                      value={form.anesthetistId}
                      onChange={(e) =>
                        setForm({ ...form, anesthetistId: e.target.value })
                      }
                    >
                      <option value="">-- اختر --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-amber-400 block mb-1">
                      فني تخدير
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                      value={form.anesthesiaTechId}
                      onChange={(e) =>
                        setForm({ ...form, anesthesiaTechId: e.target.value })
                      }
                    >
                      <option value="">-- اختر --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-400 block mb-1">
                      ممرضة تعقيم (Scrub)
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                      value={form.scrubNurseId}
                      onChange={(e) =>
                        setForm({ ...form, scrubNurseId: e.target.value })
                      }
                    >
                      <option value="">-- اختر --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-400 block mb-1">
                      ممرضة متجولة (Circulating)
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                      value={form.circulatingNurseId}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          circulatingNurseId: e.target.value,
                        })
                      }
                    >
                      <option value="">-- اختر --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
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
      {/* OT Management Modal */}
      {showOTModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-white mb-4">إضافة غرفة عمليات (OT)</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">اسم الغرفة</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm"
                  placeholder="مثال: الغرفة الرئيسية، Theatre A"
                  value={newOTName}
                  onChange={(e) => setNewOTName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowOTModal(false)}
                className="px-6 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddOT}
                className="px-6 py-2 bg-sky-600 text-white font-bold rounded-xl text-sm"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
