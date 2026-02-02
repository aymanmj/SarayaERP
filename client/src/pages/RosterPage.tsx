import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ar } from "date-fns/locale";
import { DatePicker } from "@/components/ui/date-picker";

// --- Types ---
type UserLite = { id: number; fullName: string };
type WorkShift = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  type: string;
};
type RosterEntry = {
  id: number;
  date: string;
  userId: number;
  workShiftId: number;
  isOffDay: boolean;
  shift: WorkShift;
  user: { fullName: string };
};

export default function RosterPage() {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [rosterData, setRosterData] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // --- View Control ---
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // --- Assignment Form State ---
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    workShiftId: "",
    fromDate: new Date(),
    toDate: new Date(),
    isOffDay: false,
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 1. Load Initial Data
  useEffect(() => {
    const loadResources = async () => {
      try {
        const [uRes, sRes] = await Promise.all([
          apiClient.get<UserLite[]>("/cashier/users"),
          apiClient.get<WorkShift[]>("/hr/shifts"),
        ]);
        setUsers(uRes.data);
        setShifts(sRes.data);
      } catch (e) {
        toast.error("فشل تحميل الموارد الأساسية");
      }
    };
    loadResources();
  }, []);

  // 2. Load Roster for current month
  const loadRoster = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<RosterEntry[]>("/hr/roster", {
        params: {
          from: monthStart.toISOString(),
          to: monthEnd.toISOString(),
        },
      });
      setRosterData(res.data);
    } catch (err) {
      toast.error("فشل تحميل الجدول");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
  }, [currentMonth]);

  // 3. Handlers
  const handleAssign = async () => {
    if (!form.userId || (!form.isOffDay && !form.workShiftId)) {
      toast.warning("يرجى إكمال بيانات التوزيع.");
      return;
    }

    try {
      await apiClient.post("/hr/roster/assign", {
        userId: Number(form.userId),
        workShiftId: Number(form.workShiftId),
        fromDate: form.fromDate,
        toDate: form.toDate,
        isOffDay: form.isOffDay,
      });
      toast.success("تم تحديث الجدول بنجاح");
      setShowAssignModal(false);
      loadRoster();
    } catch (err) {
      toast.error("فشل عملية التوزيع");
    }
  };

  // المساعدة في تنظيم البيانات للجدول: تجميع حسب المستخدم
  const rosterGrid = useMemo(() => {
    const grid: Record<number, Record<string, RosterEntry>> = {};
    rosterData.forEach((entry) => {
      if (!grid[entry.userId]) grid[entry.userId] = {};
      const dayKey = format(new Date(entry.date), "yyyy-MM-dd");
      grid[entry.userId][dayKey] = entry;
    });
    return grid;
  }, [rosterData]);

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-3xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold">جدول المناوبات الشهري</h1>
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1 hover:text-sky-400"
            >
              ◀
            </button>
            <span className="text-sky-400 font-bold min-w-[120px] text-center uppercase">
              {format(currentMonth, "MMMM yyyy", { locale: ar })}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1 hover:text-sky-400"
            >
              ▶
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowAssignModal(true)}
          className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-bold shadow-lg shadow-sky-900/20 transition-all"
        >
          + توزيع ورديات (Bulk Assign)
        </button>
      </div>

      {/* Roster Grid View */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-slate-900 sticky top-0 z-20">
              <tr>
                <th className="p-3 text-right border-b border-slate-800 sticky right-0 bg-slate-900 z-30 min-w-[150px]">
                  الموظف
                </th>
                {daysInMonth.map((day) => (
                  <th
                    key={day.toString()}
                    className={`p-2 border-b border-slate-800 text-center min-w-[45px] ${[0, 6].includes(day.getDay()) ? "bg-slate-800/50" : ""}`}
                  >
                    <div className="text-slate-500">
                      {format(day, "E", { locale: ar })}
                    </div>
                    <div className="text-sm font-bold">{format(day, "d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-900/30 border-b border-slate-900"
                >
                  <td className="p-3 font-bold border-l border-slate-800 sticky right-0 bg-slate-950 z-10">
                    {user.fullName}
                  </td>
                  {daysInMonth.map((day) => {
                    const dayKey = format(day, "yyyy-MM-dd");
                    const entry = rosterGrid[user.id]?.[dayKey];

                    return (
                      <td
                        key={dayKey}
                        className="p-1 text-center border-r border-slate-900/50"
                      >
                        {entry ? (
                          <div
                            className={`py-1.5 rounded-lg border ${
                              entry.isOffDay
                                ? "bg-rose-950/20 border-rose-900/50 text-rose-500"
                                : "bg-emerald-950/20 border-emerald-900/50 text-emerald-400"
                            }`}
                          >
                            {entry.isOffDay
                              ? "OFF"
                              : entry.shift?.name.substring(0, 3)}
                          </div>
                        ) : (
                          <div className="text-slate-800">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg space-y-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white border-b border-slate-800 pb-3">
              توزيع ورديات العمل
            </h3>

            <div className="space-y-4">
              {/* اختيار الموظف */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الموظف المستهدف
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:border-sky-500 outline-none"
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                >
                  <option value="">-- اختر الموظف --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* اختيار التاريخ */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    من تاريخ
                  </label>
                  <DatePicker
                    date={form.fromDate}
                    onChange={(d) => d && setForm({ ...form, fromDate: d })}
                    className="bg-slate-950 border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    إلى تاريخ
                  </label>
                  <DatePicker
                    date={form.toDate}
                    onChange={(d) => d && setForm({ ...form, toDate: d })}
                    className="bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              {/* نوع التوزيع */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input
                    type="checkbox"
                    checked={form.isOffDay}
                    onChange={(e) =>
                      setForm({ ...form, isOffDay: e.target.checked })
                    }
                    className="w-5 h-5 rounded accent-rose-500"
                  />
                  <span className="text-sm font-bold text-rose-400">
                    تحديد كأيام راحة (Off Days)
                  </span>
                </label>

                {!form.isOffDay && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs text-slate-400 block mb-1">
                      الوردية المخصصة
                    </label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      value={form.workShiftId}
                      onChange={(e) =>
                        setForm({ ...form, workShiftId: e.target.value })
                      }
                    >
                      <option value="">-- اختر الوردية --</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime}-{s.endTime})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-6 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleAssign}
                className="px-8 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-900/20 transition"
              >
                تطبيق الجدول
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// // src/pages/RosterPage.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../api/apiClient";
// import { toast } from "sonner";
// import { formatDate } from "@/lib/utils";
// import { DatePicker } from "@/components/ui/date-picker";

// type UserLite = { id: number; fullName: string };
// type WorkShift = {
//   id: number;
//   name: string;
//   startTime: string;
//   endTime: string;
// };
// type RosterEntry = {
//   id: number;
//   date: string;
//   user: { fullName: string };
//   shift: WorkShift;
//   isOffDay: boolean;
// };

// export default function RosterPage() {
//   const [users, setUsers] = useState<UserLite[]>([]);
//   const [shifts, setShifts] = useState<WorkShift[]>([]);
//   const [roster, setRoster] = useState<RosterEntry[]>([]);

//   // Filters
//   const today = new Date();
//   const [viewFrom, setViewFrom] = useState(
//     new Date(today.getFullYear(), today.getMonth(), 1)
//       .toISOString()
//       .slice(0, 10)
//   );
//   const [viewTo, setViewTo] = useState(
//     new Date(today.getFullYear(), today.getMonth() + 1, 0)
//       .toISOString()
//       .slice(0, 10)
//   );

//   // Assign Form
//   const [targetUser, setTargetUser] = useState("");
//   const [targetShift, setTargetShift] = useState("");
//   const [assignFrom, setAssignFrom] = useState(viewFrom);
//   const [assignTo, setAssignTo] = useState(viewTo);
//   const [isOff, setIsOff] = useState(false);
//   const [assigning, setAssigning] = useState(false);

//   useEffect(() => {
//     apiClient
//       .get<UserLite[]>("/cashier/users")
//       .then((res) => setUsers(res.data));
//     apiClient.get<WorkShift[]>("/hr/shifts").then((res) => setShifts(res.data));
//   }, []);

//   const loadRoster = async () => {
//     try {
//       const res = await apiClient.get<RosterEntry[]>("/hr/roster", {
//         params: { from: viewFrom, to: viewTo },
//       });
//       setRoster(res.data);
//     } catch (err) {
//       toast.error("فشل تحميل الجدول");
//     }
//   };

//   useEffect(() => {
//     if (viewFrom && viewTo) loadRoster();
//   }, [viewFrom, viewTo]);

//   const handleAssign = async () => {
//     if (!targetUser || !targetShift) {
//       toast.warning("اختر الموظف والوردية.");
//       return;
//     }
//     setAssigning(true);
//     try {
//       await apiClient.post("/hr/roster/assign", {
//         userId: targetUser,
//         workShiftId: targetShift,
//         fromDate: assignFrom,
//         toDate: assignTo,
//         isOffDay: isOff,
//       });
//       toast.success("تم توزيع الجدول بنجاح.");
//       loadRoster();
//     } catch (err) {
//       toast.error("فشل التوزيع.");
//     } finally {
//       setAssigning(false);
//     }
//   };

//   return (
//     <div
//       className="p-6 text-slate-100 h-full flex flex-col space-y-6"
//       dir="rtl"
//     >
//       <div className="flex justify-between items-end">
//         <div>
//           <h1 className="text-2xl font-bold mb-1">جدول المناوبات (Roster)</h1>
//           <p className="text-sm text-slate-400">
//             توزيع الموظفين على الورديات خلال الشهر.
//           </p>
//         </div>
//       </div>

//       {/* Assign Box */}
//       <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-end gap-4">
//         <div className="flex flex-col gap-1 w-48">
//           <label className="text-xs text-slate-400">الموظف</label>
//           <select
//             value={targetUser}
//             onChange={(e) => setTargetUser(e.target.value)}
//             className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm"
//           >
//             <option value="">-- اختر --</option>
//             {users.map((u) => (
//               <option key={u.id} value={u.id}>
//                 {u.fullName}
//               </option>
//             ))}
//           </select>
//         </div>
//         <div className="flex flex-col gap-1 w-40">
//           <label className="text-xs text-slate-400">الوردية</label>
//           <select
//             value={targetShift}
//             onChange={(e) => setTargetShift(e.target.value)}
//             className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm"
//           >
//             <option value="">-- اختر --</option>
//             {shifts.map((s) => (
//               <option key={s.id} value={s.id}>
//                 {s.name} ({s.startTime})
//               </option>
//             ))}
//           </select>
//         </div>
//         <div className="flex flex-col gap-1">
//           <label className="text-xs text-slate-400">من تاريخ</label>
//           <DatePicker
//             date={assignFrom ? new Date(assignFrom) : undefined}
//             onChange={(d) => setAssignFrom(d ? d.toISOString().slice(0, 10) : "")}
//             className="bg-slate-950 border-slate-700 h-9 text-sm w-36"
//           />
//         </div>
//         <div className="flex flex-col gap-1">
//           <label className="text-xs text-slate-400">إلى تاريخ</label>
//           <DatePicker
//             date={assignTo ? new Date(assignTo) : undefined}
//             onChange={(d) => setAssignTo(d ? d.toISOString().slice(0, 10) : "")}
//             className="bg-slate-950 border-slate-700 h-9 text-sm w-36"
//           />
//         </div>
//         <div className="flex items-center gap-2 mb-2">
//           <input
//             type="checkbox"
//             checked={isOff}
//             onChange={(e) => setIsOff(e.target.checked)}
//             className="w-4 h-4 bg-slate-800"
//           />
//           <label className="text-sm text-slate-300">يوم راحة (Off)</label>
//         </div>
//         <button
//           onClick={handleAssign}
//           disabled={assigning}
//           className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
//         >
//           {assigning ? "جارِ الحفظ..." : "تطبيق الجدول"}
//         </button>
//       </div>

//       {/* View Filters */}
//       <div className="flex gap-4 items-center bg-slate-900/30 p-2 rounded-xl w-fit border border-slate-800/50">
//         <span className="text-xs text-slate-400">عرض الجدول من:</span>
//         <span className="text-xs text-slate-400">عرض الجدول من:</span>
//         <DatePicker
//           date={viewFrom ? new Date(viewFrom) : undefined}
//           onChange={(d) => setViewFrom(d ? d.toISOString().slice(0, 10) : "")}
//           className="bg-transparent border-0 border-b border-slate-700 rounded-none h-auto p-0 text-sm focus:ring-0 w-32"
//         />
//         <span className="text-xs text-slate-400">إلى:</span>
//         <DatePicker
//           date={viewTo ? new Date(viewTo) : undefined}
//           onChange={(d) => setViewTo(d ? d.toISOString().slice(0, 10) : "")}
//           className="bg-transparent border-0 border-b border-slate-700 rounded-none h-auto p-0 text-sm focus:ring-0 w-32"
//         />
//       </div>

//       {/* Roster Table */}
//       <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
//         <table className="w-full text-sm text-right">
//           <thead className="text-slate-400 border-b border-slate-800">
//             <tr>
//               <th className="px-4 py-2">التاريخ</th>
//               <th className="px-4 py-2">الموظف</th>
//               <th className="px-4 py-2">الوردية</th>
//               <th className="px-4 py-2">التوقيت</th>
//               <th className="px-4 py-2">الحالة</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-800">
//             {roster.map((r) => (
//               <tr key={r.id} className="hover:bg-slate-800/40">
//                 <td className="px-4 py-2 text-slate-300">
//                   {formatDate(r.date)}
//                 </td>
//                 <td className="px-4 py-2 font-semibold">{r.user.fullName}</td>
//                 <td className="px-4 py-2 text-sky-300">{r.shift.name}</td>
//                 <td className="px-4 py-2 font-mono text-xs text-slate-400">
//                   {r.shift.startTime} - {r.shift.endTime}
//                 </td>
//                 <td className="px-4 py-2">
//                   {r.isOffDay ? (
//                     <span className="text-amber-400 text-xs font-bold">
//                       راحة أسبوعية
//                     </span>
//                   ) : (
//                     <span className="text-emerald-400 text-xs">دوام</span>
//                   )}
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }
