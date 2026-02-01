// src/pages/AttendancePage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type AttendanceRecord = {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  lateMinutes: number;
  user: {
    id: number;
    fullName: string;
    username: string;
  };
};

type UserLite = {
  id: number;
  fullName: string;
};

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ar-LY", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Local formatDate removed

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [userId, setUserId] = useState<string>("");

  // Manual Punch Modal
  const [showModal, setShowModal] = useState(false);
  const [manualUserId, setManualUserId] = useState("");
  const [manualTime, setManualTime] = useState(""); // HH:mm
  const [manualDate, setManualDate] = useState(today);

  // 1. تحميل المستخدمين (للفلتر والإضافة)
  useEffect(() => {
    apiClient.get<UserLite[]>("/cashier/users").then((res) => {
      setUsers(res.data);
    });
  }, []);

  // 2. تحميل السجلات
  const loadRecords = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (userId) params.userId = userId;

      const res = await apiClient.get<AttendanceRecord[]>("/attendance", {
        params,
      });
      setRecords(res.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل سجلات الحضور.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, userId]);

  // 3. إضافة بصمة يدوية
  const handleManualPunch = async () => {
    if (!manualUserId || !manualDate || !manualTime) {
      toast.warning("جميع الحقول مطلوبة.");
      return;
    }

    // دمج التاريخ والوقت لإنشاء ISO String
    // ملاحظة: هذا سيعتمد على توقيت المتصفح المحلي
    const dateTimeStr = `${manualDate}T${manualTime}:00`;
    const dateObj = new Date(dateTimeStr);

    try {
      await apiClient.post("/attendance/punch", {
        userId: Number(manualUserId),
        timestamp: dateObj.toISOString(),
      });

      toast.success("تم تسجيل البصمة بنجاح.");
      setShowModal(false);
      loadRecords();
    } catch (err: any) {
      console.error(err);
      toast.error("فشل تسجيل البصمة.");
    }
  };

  // 4. محاكاة استيراد من جهاز (Bulk Import Simulation)
  const handleSimulateDevice = async () => {
    if (
      !confirm(
        "سيتم توليد بصمات عشوائية لجميع الموظفين لهذا اليوم للتجربة. هل أنت متأكد؟"
      )
    )
      return;

    try {
      // نولد بصمات عشوائية للموظفين الموجودين
      const punches = users.flatMap((u) => {
        // وقت دخول عشوائي بين 7:50 و 8:30
        const randomIn = 7 * 60 + 50 + Math.floor(Math.random() * 40);
        const inHour = Math.floor(randomIn / 60)
          .toString()
          .padStart(2, "0");
        const inMin = (randomIn % 60).toString().padStart(2, "0");

        // وقت خروج عشوائي بين 15:00 و 17:00
        const randomOut = 15 * 60 + Math.floor(Math.random() * 120);
        const outHour = Math.floor(randomOut / 60)
          .toString()
          .padStart(2, "0");
        const outMin = (randomOut % 60).toString().padStart(2, "0");

        const dateStr = new Date().toISOString().slice(0, 10);

        return [
          {
            userId: u.id,
            timestamp: new Date(
              `${dateStr}T${inHour}:${inMin}:00`
            ).toISOString(),
          }, // Check In
          {
            userId: u.id,
            timestamp: new Date(
              `${dateStr}T${outHour}:${outMin}:00`
            ).toISOString(),
          }, // Check Out
        ];
      });

      await apiClient.post("/attendance/bulk-import", { punches });

      toast.success(`تم استيراد ${punches.length} بصمة من الجهاز الافتراضي.`);
      loadRecords();
    } catch (err) {
      console.error(err);
      toast.error("فشل المحاكاة.");
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">سجل الحضور والانصراف</h1>
          <p className="text-sm text-slate-400">
            متابعة دوام الموظفين، التأخير، وساعات العمل.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSimulateDevice}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 rounded-xl text-xs"
          >
            🔄 محاكاة جهاز البصمة (Demo)
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
          >
            + تسجيل يدوي
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">من تاريخ</label>
          <DatePicker
            date={dateFrom ? new Date(dateFrom) : undefined}
            onChange={(d) => setDateFrom(d ? d.toISOString().slice(0, 10) : "")}
            className="bg-slate-950 border-slate-700 h-8 text-sm px-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">إلى تاريخ</label>
          <DatePicker
            date={dateTo ? new Date(dateTo) : undefined}
            onChange={(d) => setDateTo(d ? d.toISOString().slice(0, 10) : "")}
            className="bg-slate-950 border-slate-700 h-8 text-sm px-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">الموظف</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm w-48"
          >
            <option value="">الكل</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={loadRecords}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs"
        >
          تحديث
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="pb-3 px-2">التاريخ</th>
              <th className="pb-3 px-2">الموظف</th>
              <th className="pb-3 px-2">وقت الدخول</th>
              <th className="pb-3 px-2">وقت الخروج</th>
              <th className="pb-3 px-2">الحالة</th>
              <th className="pb-3 px-2">التأخير (دقائق)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">
                  جارِ التحميل...
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">
                  لا توجد سجلات.
                </td>
              </tr>
            )}

            {records.map((rec) => (
              <tr key={rec.id} className="hover:bg-slate-800/40">
                <td className="py-3 px-2 text-slate-300">
                  {formatDate(rec.date)}
                </td>
                <td className="py-3 px-2 font-medium text-slate-200">
                  {rec.user.fullName}
                </td>
                <td className="py-3 px-2 text-emerald-300 dir-ltr text-right">
                  {formatTime(rec.checkIn)}
                </td>
                <td className="py-3 px-2 text-amber-300 dir-ltr text-right">
                  {formatTime(rec.checkOut)}
                </td>
                <td className="py-3 px-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      rec.status === "LATE"
                        ? "bg-rose-900/40 text-rose-300"
                        : "bg-emerald-900/40 text-emerald-300"
                    }`}
                  >
                    {rec.status === "LATE" ? "متأخر" : "حاضر"}
                  </span>
                </td>
                <td className="py-3 px-2 font-bold text-rose-400">
                  {rec.lateMinutes > 0 ? `${rec.lateMinutes} د` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manual Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-slate-100">
              تسجيل بصمة يدوية
            </h3>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">الموظف</label>
                <select
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">اختر الموظف...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">التاريخ</label>
                <DatePicker
                  date={manualDate ? new Date(manualDate) : undefined}
                  onChange={(d) => setManualDate(d ? d.toISOString().slice(0, 10) : "")}
                  className="bg-slate-950 border-slate-700 h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">الوقت</label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={handleManualPunch}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
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
