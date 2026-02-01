// src/pages/RosterPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type UserLite = { id: number; fullName: string };
type WorkShift = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
};
type RosterEntry = {
  id: number;
  date: string;
  user: { fullName: string };
  shift: WorkShift;
  isOffDay: boolean;
};

export default function RosterPage() {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);

  // Filters
  const today = new Date();
  const [viewFrom, setViewFrom] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10)
  );
  const [viewTo, setViewTo] = useState(
    new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10)
  );

  // Assign Form
  const [targetUser, setTargetUser] = useState("");
  const [targetShift, setTargetShift] = useState("");
  const [assignFrom, setAssignFrom] = useState(viewFrom);
  const [assignTo, setAssignTo] = useState(viewTo);
  const [isOff, setIsOff] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    apiClient
      .get<UserLite[]>("/cashier/users")
      .then((res) => setUsers(res.data));
    apiClient.get<WorkShift[]>("/hr/shifts").then((res) => setShifts(res.data));
  }, []);

  const loadRoster = async () => {
    try {
      const res = await apiClient.get<RosterEntry[]>("/hr/roster", {
        params: { from: viewFrom, to: viewTo },
      });
      setRoster(res.data);
    } catch (err) {
      toast.error("فشل تحميل الجدول");
    }
  };

  useEffect(() => {
    if (viewFrom && viewTo) loadRoster();
  }, [viewFrom, viewTo]);

  const handleAssign = async () => {
    if (!targetUser || !targetShift) {
      toast.warning("اختر الموظف والوردية.");
      return;
    }
    setAssigning(true);
    try {
      await apiClient.post("/hr/roster/assign", {
        userId: targetUser,
        workShiftId: targetShift,
        fromDate: assignFrom,
        toDate: assignTo,
        isOffDay: isOff,
      });
      toast.success("تم توزيع الجدول بنجاح.");
      loadRoster();
    } catch (err) {
      toast.error("فشل التوزيع.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold mb-1">جدول المناوبات (Roster)</h1>
          <p className="text-sm text-slate-400">
            توزيع الموظفين على الورديات خلال الشهر.
          </p>
        </div>
      </div>

      {/* Assign Box */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 w-48">
          <label className="text-xs text-slate-400">الموظف</label>
          <select
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm"
          >
            <option value="">-- اختر --</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs text-slate-400">الوردية</label>
          <select
            value={targetShift}
            onChange={(e) => setTargetShift(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm"
          >
            <option value="">-- اختر --</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">من تاريخ</label>
          <DatePicker
            date={assignFrom ? new Date(assignFrom) : undefined}
            onChange={(d) => setAssignFrom(d ? d.toISOString().slice(0, 10) : "")}
            className="bg-slate-950 border-slate-700 h-9 text-sm w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">إلى تاريخ</label>
          <DatePicker
            date={assignTo ? new Date(assignTo) : undefined}
            onChange={(d) => setAssignTo(d ? d.toISOString().slice(0, 10) : "")}
            className="bg-slate-950 border-slate-700 h-9 text-sm w-36"
          />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            checked={isOff}
            onChange={(e) => setIsOff(e.target.checked)}
            className="w-4 h-4 bg-slate-800"
          />
          <label className="text-sm text-slate-300">يوم راحة (Off)</label>
        </div>
        <button
          onClick={handleAssign}
          disabled={assigning}
          className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {assigning ? "جارِ الحفظ..." : "تطبيق الجدول"}
        </button>
      </div>

      {/* View Filters */}
      <div className="flex gap-4 items-center bg-slate-900/30 p-2 rounded-xl w-fit border border-slate-800/50">
        <span className="text-xs text-slate-400">عرض الجدول من:</span>
        <span className="text-xs text-slate-400">عرض الجدول من:</span>
        <DatePicker
          date={viewFrom ? new Date(viewFrom) : undefined}
          onChange={(d) => setViewFrom(d ? d.toISOString().slice(0, 10) : "")}
          className="bg-transparent border-0 border-b border-slate-700 rounded-none h-auto p-0 text-sm focus:ring-0 w-32"
        />
        <span className="text-xs text-slate-400">إلى:</span>
        <DatePicker
          date={viewTo ? new Date(viewTo) : undefined}
          onChange={(d) => setViewTo(d ? d.toISOString().slice(0, 10) : "")}
          className="bg-transparent border-0 border-b border-slate-700 rounded-none h-auto p-0 text-sm focus:ring-0 w-32"
        />
      </div>

      {/* Roster Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2">التاريخ</th>
              <th className="px-4 py-2">الموظف</th>
              <th className="px-4 py-2">الوردية</th>
              <th className="px-4 py-2">التوقيت</th>
              <th className="px-4 py-2">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {roster.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-2 text-slate-300">
                  {formatDate(r.date)}
                </td>
                <td className="px-4 py-2 font-semibold">{r.user.fullName}</td>
                <td className="px-4 py-2 text-sky-300">{r.shift.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-400">
                  {r.shift.startTime} - {r.shift.endTime}
                </td>
                <td className="px-4 py-2">
                  {r.isOffDay ? (
                    <span className="text-amber-400 text-xs font-bold">
                      راحة أسبوعية
                    </span>
                  ) : (
                    <span className="text-emerald-400 text-xs">دوام</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
