
import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type DoctorSchedule = {
  id: number;
  doctorId: number;
  maxPerDay: number | null;
  maxEmergency: number | null;
  reservedNumbers: string | null;
  allowOverbook: boolean;
  startTime: string | null;
  endTime: string | null;
  workDays: string | null;
};

type Doctor = {
  id: number;
  fullName: string;
  department?: { name: string };
  schedule?: DoctorSchedule;
};

export default function DoctorSchedulesPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Edit State
  const [editingDoc, setEditingDoc] = useState<Doctor | null>(null);
  const [form, setForm] = useState({
    maxPerDay: 20,
    maxEmergency: 5,
    reservedNumbers: "1,3,5,7,9",
    allowOverbook: false,
    startTime: "08:00",
    endTime: "14:00",
    workDays: "0,1,2,3,4",
  });
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      // 1. Get Doctors
      const docsRes = await apiClient.get("/users/doctors-list");
      const docs = docsRes.data;

      // 2. Get Schedules
      const schedsRes = await apiClient.get("/appointments/schedules/list");
      const schedules = schedsRes.data as DoctorSchedule[];

      // Merge
      const merged = docs.map((d: any) => ({
        ...d,
        schedule: schedules.find((s) => s.doctorId === d.id) || null,
      }));
      setDoctors(merged);
    } catch (err) {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleEdit(doc: Doctor) {
    setEditingDoc(doc);
    if (doc.schedule) {
      setForm({
        maxPerDay: doc.schedule.maxPerDay || 20,
        maxEmergency: doc.schedule.maxEmergency || 5,
        reservedNumbers: doc.schedule.reservedNumbers || "1,3,5,7,9",
        allowOverbook: doc.schedule.allowOverbook,
        startTime: doc.schedule.startTime || "08:00",
        endTime: doc.schedule.endTime || "14:00",
        workDays: doc.schedule.workDays || "0,1,2,3,4",
      });
    } else {
      setForm({
        maxPerDay: 20,
        maxEmergency: 5,
        reservedNumbers: "1,3,5,7,9",
        allowOverbook: false,
        startTime: "08:00",
        endTime: "14:00",
        workDays: "0,1,2,3,4",
      });
    }
  }

  async function handleSave() {
    if (!editingDoc) return;
    setSaving(true);
    try {
      await apiClient.put(`/appointments/schedules/${editingDoc.id}`, {
        ...form,
        maxPerDay: Number(form.maxPerDay),
        maxEmergency: Number(form.maxEmergency),
      });
      toast.success("تم تحديث الجدول بنجاح");
      setEditingDoc(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل التحديث");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-bold mb-6">إعدادات جداول الأطباء</h1>

      {loading ? (
        <div className="text-center py-10">جارِ التحميل...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {doctors.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 hover:border-sky-500/50 transition-colors cursor-pointer group"
              onClick={() => handleEdit(doc)}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg text-slate-100 group-hover:text-sky-300 transition-colors">
                    {doc.fullName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {doc.department?.name || "بدون قسم"}
                  </p>
                </div>
                <div className={`w-3 h-3 rounded-full ${doc.schedule ? 'bg-emerald-500' : 'bg-slate-600'}`} title={doc.schedule ? "مفعل" : "غير مفعل"} />
              </div>

              {doc.schedule ? (
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">الحد اليومي:</span>
                    <span className="font-mono">{doc.schedule.maxPerDay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">الطوارئ:</span>
                    <span className="font-mono">{doc.schedule.maxEmergency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">المحجوز:</span>
                    <span className="font-mono text-xs">{doc.schedule.reservedNumbers}</span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-slate-500 text-sm italic bg-slate-950/30 rounded-lg">
                  لم يتم إعداد الجدول
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">
              إعداد جدول: <span className="text-sky-400">{editingDoc.fullName}</span>
            </h2>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">الحد الأقصى (يومياً)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                    value={form.maxPerDay}
                    onChange={(e) => setForm({ ...form, maxPerDay: +e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">حد الطوارئ</label>
                  <input
                    type="number"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                    value={form.maxEmergency}
                    onChange={(e) => setForm({ ...form, maxEmergency: +e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">الأرقام المحجوزة (مفصولة بفاصلة)</label>
                <input
                  type="text"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm"
                  placeholder="1,3,5,7,9"
                  value={form.reservedNumbers}
                  onChange={(e) => setForm({ ...form, reservedNumbers: e.target.value })}
                />
                <p className="text-[10px] text-slate-500">
                  هذه الأرقام سيتم تخصيصها لحالات الطوارئ والحالات الخاصة فقط.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">وقت البدء</label>
                  <input
                    type="time"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">وقت الانتهاء</label>
                  <input
                    type="time"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs text-slate-400 font-bold block">أيام العمل</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 0, label: "الأحد" },
                    { id: 1, label: "الاثنين" },
                    { id: 2, label: "الثلاثاء" },
                    { id: 3, label: "الاربعاء" },
                    { id: 4, label: "الخميس" },
                    { id: 5, label: "الجمعة" },
                    { id: 6, label: "السبت" },
                  ].map((day) => {
                    const currentDays = form.workDays.split(',').filter(d => d !== "").map(Number);
                    const isSelected = currentDays.includes(day.id);
                    return (
                      <div 
                        key={day.id}
                        onClick={() => {
                          let newDays;
                          if (isSelected) {
                            newDays = currentDays.filter(d => d !== day.id);
                          } else {
                            newDays = [...currentDays, day.id].sort((a, b) => a - b);
                          }
                          setForm({ ...form, workDays: newDays.join(',') });
                        }}
                        className={`
                          px-3 py-1.5 rounded-lg text-xs cursor-pointer border transition-all select-none
                          ${isSelected 
                            ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/20" 
                            : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500"}
                        `}
                      >
                        {day.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="allowOverbook"
                  className="w-4 h-4 accent-sky-500"
                  checked={form.allowOverbook}
                  onChange={(e) => setForm({ ...form, allowOverbook: e.target.checked })}
                />
                <label htmlFor="allowOverbook" className="text-sm cursor-pointer select-none">
                  سماح بتجاوز الحد الأقصى (Overbook)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-6 border-t border-slate-800 mt-4">
              <button
                onClick={() => setEditingDoc(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-white text-sm font-bold shadow-lg"
              >
                {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
