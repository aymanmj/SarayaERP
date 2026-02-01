// src/pages/ShiftsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type ShiftType = "MORNING" | "EVENING" | "NIGHT" | "FULL_DAY";

type WorkShift = {
  id: number;
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  graceMinutes: number;
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [type, setType] = useState<ShiftType>("MORNING");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [graceMinutes, setGraceMinutes] = useState(15);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<WorkShift[]>("/hr/shifts");
      setShifts(res.data);
    } catch (err) {
      toast.error("فشل تحميل الورديات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const handleCreate = async () => {
    if (!name) return;
    try {
      await apiClient.post("/hr/shifts", {
        name,
        type,
        startTime,
        endTime,
        graceMinutes: Number(graceMinutes),
      });
      toast.success("تم إضافة الوردية");
      setName("");
      loadShifts();
    } catch (err) {
      toast.error("فشل الحفظ");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div>
        <h1 className="text-2xl font-bold mb-1">تعريف الورديات (Shifts)</h1>
        <p className="text-sm text-slate-400">
          تحديد أوقات الدوام الرسمية ليتم استخدامها في الجداول.
        </p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">اسم الوردية</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm w-48"
            placeholder="مثال: صباحي أ"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">النوع</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm w-32"
          >
            <option value="MORNING">صباحي</option>
            <option value="EVENING">مسائي</option>
            <option value="NIGHT">ليلي</option>
            <option value="FULL_DAY">يوم كامل</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">من</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">إلى</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">سماحية التأخير (د)</label>
          <input
            type="number"
            value={graceMinutes}
            onChange={(e) => setGraceMinutes(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm w-20 text-center"
          />
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
        >
          + إضافة
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2">الاسم</th>
              <th className="px-4 py-2">النوع</th>
              <th className="px-4 py-2">التوقيت</th>
              <th className="px-4 py-2">سماحية التأخير</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr
                key={s.id}
                className="border-b border-slate-800/50 hover:bg-slate-800/40"
              >
                <td className="px-4 py-3 font-semibold">{s.name}</td>
                <td className="px-4 py-3 text-slate-300">{s.type}</td>
                <td className="px-4 py-3 dir-ltr text-right font-mono text-sky-300">
                  {s.startTime} - {s.endTime}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {s.graceMinutes} دقيقة
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
