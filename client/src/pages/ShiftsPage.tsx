// src/pages/ShiftsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [type, setType] = useState<ShiftType>("MORNING");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [graceMinutes, setGraceMinutes] = useState(15);

  const getShiftTypeLabel = (st: ShiftType) => {
    switch (st) {
      case "MORNING":
        return t("hr.shifts.type.morning", "صباحي");
      case "EVENING":
        return t("hr.shifts.type.evening", "مسائي");
      case "NIGHT":
        return t("hr.shifts.type.night", "ليلي");
      case "FULL_DAY":
        return t("hr.shifts.type.fullDay", "يوم كامل");
      default:
        return st;
    }
  };

  const loadShifts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<WorkShift[]>("/hr/shifts");
      setShifts(res.data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("hr.shifts.toast.loadFailed", "فشل تحميل الورديات"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.warning(t("hr.shifts.toast.nameRequired", "يرجى إدخال اسم الوردية أولاً"));
      return;
    }
    try {
      await apiClient.post("/hr/shifts", {
        name,
        type,
        startTime,
        endTime,
        graceMinutes: Number(graceMinutes),
      });
      toast.success(t("hr.shifts.toast.createSuccess", "تم إضافة الوردية"));
      setName("");
      loadShifts();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("hr.shifts.toast.saveFailed", "فشل الحفظ"));
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div>
        <h1 className="text-2xl font-bold mb-1">{t("hr.shifts.title", "تعريف الورديات (Shifts)")}</h1>
        <p className="text-sm text-slate-400">
          {t("hr.shifts.subtitle", "تحديد أوقات الدوام الرسمية ليتم استخدامها في الجداول.")}
        </p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">{t("hr.shifts.nameLabel", "اسم الوردية")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm w-48"
            placeholder={t("hr.shifts.namePlaceholder", "مثال: صباحي أ")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">{t("hr.shifts.typeLabel", "النوع")}</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm w-32"
          >
            <option value="MORNING">{t("hr.shifts.type.morning", "صباحي")}</option>
            <option value="EVENING">{t("hr.shifts.type.evening", "مسائي")}</option>
            <option value="NIGHT">{t("hr.shifts.type.night", "ليلي")}</option>
            <option value="FULL_DAY">{t("hr.shifts.type.fullDay", "يوم كامل")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">{t("common.from", "من")}</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">{t("common.to", "إلى")}</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">{t("hr.shifts.graceLabel", "سماحية التأخير (د)")}</label>
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
          {t("hr.shifts.addBtn", "+ إضافة")}
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2">{t("hr.shifts.table.name", "الاسم")}</th>
              <th className="px-4 py-2">{t("hr.shifts.table.type", "النوع")}</th>
              <th className="px-4 py-2">{t("hr.shifts.table.time", "التوقيت")}</th>
              <th className="px-4 py-2">{t("hr.shifts.table.grace", "سماحية التأخير")}</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr
                key={s.id}
                className="border-b border-slate-800/50 hover:bg-slate-800/40"
              >
                <td className="px-4 py-3 font-semibold">{s.name}</td>
                <td className="px-4 py-3 text-slate-300">{getShiftTypeLabel(s.type)}</td>
                <td className="px-4 py-3 dir-ltr text-right font-mono text-sky-300">
                  {s.startTime} - {s.endTime}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {s.graceMinutes} {t("hr.shifts.minutesLabel", "دقيقة")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
