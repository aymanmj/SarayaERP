import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import {
  ClockIcon,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ArrowLeftOnRectangleIcon,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ArrowRightOnRectangleIcon,
  DocumentArrowDownIcon, // تأكد من وجودها في @heroicons/react/24/outline
  UserPlusIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

type AttendanceRecord = {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: "PRESENT" | "LATE" | "ABSENT";
  lateMinutes: number;
  user: { id: number; fullName: string; username: string };
};

type UserLite = { id: number; fullName: string };

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);

  const [dateFrom, setDateFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const [showManualModal, setShowManualModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [uploading, setUploading] = useState(false);

  const [manualData, setManualData] = useState({
    userId: "",
    time: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/attendance", {
        params: { from: dateFrom, to: dateTo },
      });
      setRecords(res.data);
    } catch {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await apiClient.get("/cashier/users");
      setUsers(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRecords();
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const handleManualPunch = async () => {
    if (!manualData.userId || !manualData.time)
      return toast.warning("يرجى إكمال البيانات");
    try {
      const timestamp = new Date(
        `${manualData.date}T${manualData.time}:00`,
      ).toISOString();
      await apiClient.post("/attendance/punch", {
        userId: Number(manualData.userId),
        timestamp,
      });
      toast.success("تم تسجيل البصمة يدوياً");
      setShowManualModal(false);
      loadRecords();
    } catch {
      toast.error("فشل التسجيل");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").slice(1);
        const punches = lines
          .map((l) => {
            const [id, date, time] = l.trim().split(",");
            if (!id || !date || !time) return null;
            return {
              userId: Number(id),
              timestamp: new Date(`${date}T${time}`).toISOString(),
            };
          })
          .filter((p) => p !== null);

        await apiClient.post("/attendance/bulk-import", { punches });
        toast.success("تم استيراد الملف بنجاح");
        setShowUploadModal(false);
        loadRecords();
      } catch {
        toast.error("خطأ في تنسيق الملف");
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "--:--";
    return new Date(iso).toLocaleTimeString("ar-LY", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-500/20 rounded-2xl border border-sky-500/40">
            <ClockIcon className="w-8 h-8 text-sky-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black">سجل الحضور الذكي</h1>
            <p className="text-slate-400 text-xs mt-1">
              تتبع دقيق لمواعيد العمل
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2"
          >
            <DocumentArrowDownIcon className="w-4 h-4" /> استيراد من ملف
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black shadow-lg"
          >
            + تسجيل يدوي
          </button>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <DatePicker
            date={new Date(dateFrom)}
            onChange={(d) => d && setDateFrom(d.toISOString().slice(0, 10))}
          />
          <DatePicker
            date={new Date(dateTo)}
            onChange={(d) => d && setDateTo(d.toISOString().slice(0, 10))}
          />
          <button onClick={loadRecords} className="p-2 bg-slate-900 rounded-lg">
            <ArrowPathIcon
              className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
        <div className="text-xs text-slate-400">
          سجل: <span className="text-sky-400 font-bold">{records.length}</span>
        </div>
      </div>

      <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-y-auto custom-scrollbar h-full">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold">الموظف</th>
                <th className="px-6 py-4 font-bold">التاريخ</th>
                <th className="px-6 py-4 text-center font-bold">دخول</th>
                <th className="px-6 py-4 text-center font-bold">خروج</th>
                <th className="px-6 py-4 text-center font-bold">التأخير</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {records.map((rec) => (
                <tr key={rec.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <div className="font-bold">{rec.user.fullName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      @{rec.user.username}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-xs">
                    {formatDate(rec.date)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg text-xs border border-emerald-500/20">
                      {formatTime(rec.checkIn)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-rose-500/10 text-rose-400 px-3 py-1 rounded-lg text-xs border border-rose-500/20">
                      {formatTime(rec.checkOut)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-rose-400">
                    {rec.lateMinutes > 0 ? `${rec.lateMinutes} د` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals for Manual and Upload */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <UserPlusIcon className="w-6 h-6 text-emerald-500" /> تسجيل بصمة
            </h3>
            <div className="space-y-3">
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                value={manualData.userId}
                onChange={(e) =>
                  setManualData({ ...manualData, userId: e.target.value })
                }
              >
                <option value="">اختر الموظف...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-xl px-3 py-2 text-sm [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:sepia-0 [&::-webkit-calendar-picker-indicator]:saturate-0 [&::-webkit-calendar-picker-indicator]:hue-rotate-180 [&::-webkit-calendar-picker-indicator]:brightness-200 [&::-webkit-calendar-picker-indicator]:contrast-100"
                value={manualData.date}
                onChange={(e) =>
                  setManualData({ ...manualData, date: e.target.value })
                }
              />
              <input
                type="time"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                value={manualData.time}
                onChange={(e) =>
                  setManualData({ ...manualData, time: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowManualModal(false)}
                className="flex-1 py-2 bg-slate-800 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleManualPunch}
                className="flex-1 py-2 bg-emerald-600 rounded-xl font-bold"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-md text-center space-y-6">
            <DocumentArrowDownIcon className="w-12 h-12 text-sky-500 mx-auto" />
            <h3 className="text-xl font-bold">استيراد بيانات الجهاز</h3>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-sky-600 file:text-white cursor-pointer"
            />
            <button
              onClick={() => setShowUploadModal(false)}
              className="text-slate-500 text-sm"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// // src/pages/hr/AttendancePage.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../api/apiClient";
// import { toast } from "sonner";
// import { formatDate, formatMoney } from "@/lib/utils";
// import { DatePicker } from "@/components/ui/date-picker";
// import {
//   ClockIcon,
//   ArrowLeftOnRectangleIcon,
//   ArrowRightOnRectangleIcon,
//   UserGroupIcon,
//   DocumentArrowDownIcon,
// } from "@heroicons/react/24/outline";

// type AttendanceRecord = {
//   id: number;
//   date: string;
//   checkIn: string | null;
//   checkOut: string | null;
//   status: "PRESENT" | "LATE" | "ABSENT";
//   lateMinutes: number;
//   user: { id: number; fullName: string; username: string };
// };

// export default function AttendancePage() {
//   const [records, setRecords] = useState<AttendanceRecord[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [dateFrom, setDateFrom] = useState(
//     new Date().toISOString().slice(0, 10),
//   );
//   const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
//   const [showManualModal, setShowManualModal] = useState(false);

//   const loadRecords = async () => {
//     setLoading(true);
//     try {
//       const res = await apiClient.get("/attendance", {
//         params: { from: dateFrom, to: dateTo },
//       });
//       setRecords(res.data);
//     } catch {
//       toast.error("فشل تحميل سجلات الحضور");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     loadRecords();
//   }, [dateFrom, dateTo]);

//   const formatTime = (iso: string | null) => {
//     if (!iso) return "--:--";
//     return new Date(iso).toLocaleTimeString("ar-LY", {
//       hour: "2-digit",
//       minute: "2-digit",
//     });
//   };

//   return (
//     <div
//       className="p-6 text-slate-100 h-full flex flex-col space-y-6"
//       dir="rtl"
//     >
//       {/* Header */}
//       <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-xl">
//         <div className="flex items-center gap-4">
//           <div className="p-3 bg-sky-500/20 rounded-2xl border border-sky-500/40">
//             <ClockIcon className="w-8 h-8 text-sky-500" />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black">سجل الحضور الذكي</h1>
//             <p className="text-slate-400 text-xs mt-1">
//               تتبع دقيق لمواعيد العمل، التأخير، والإضافي
//             </p>
//           </div>
//         </div>

//         <div className="flex gap-3">
//           <button
//             onClick={() => {
//               /* Logic for bulk import */
//             }}
//             className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2"
//           >
//             <DocumentArrowDownIcon className="w-4 h-4" /> استيراد من الجهاز
//           </button>
//           <button
//             onClick={() => setShowManualModal(true)}
//             className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-900/30"
//           >
//             + تسجيل يدوي
//           </button>
//         </div>
//       </div>

//       {/* Filter Bar */}
//       <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center gap-6 shadow-sm">
//         <div className="flex items-center gap-3">
//           <span className="text-xs text-slate-500">الفترة من:</span>
//           <DatePicker
//             date={new Date(dateFrom)}
//             onChange={(d) => d && setDateFrom(d.toISOString().slice(0, 10))}
//             className="h-9"
//           />
//           <span className="text-xs text-slate-500">إلى:</span>
//           <DatePicker
//             date={new Date(dateTo)}
//             onChange={(d) => d && setDateTo(d.toISOString().slice(0, 10))}
//             className="h-9"
//           />
//         </div>
//         <div className="h-6 w-px bg-slate-800"></div>
//         <div className="text-xs text-slate-400">
//           إجمالي السجلات:{" "}
//           <span className="text-sky-400 font-bold">{records.length}</span>
//         </div>
//       </div>

//       {/* Table Container */}
//       <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
//         <div className="overflow-y-auto custom-scrollbar flex-1">
//           <table className="w-full text-sm text-right">
//             <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
//               <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
//                 <th className="px-6 py-4 font-bold">الموظف</th>
//                 <th className="px-6 py-4 font-bold">التاريخ</th>
//                 <th className="px-6 py-4 font-bold text-center">دخول</th>
//                 <th className="px-6 py-4 font-bold text-center">خروج</th>
//                 <th className="px-6 py-4 font-bold text-center">الحالة</th>
//                 <th className="px-6 py-4 font-bold text-center">التأخير</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-800/50">
//               {records.map((rec) => (
//                 <tr
//                   key={rec.id}
//                   className="hover:bg-white/[0.02] transition-colors"
//                 >
//                   <td className="px-6 py-4">
//                     <div className="font-bold text-slate-200">
//                       {rec.user.fullName}
//                     </div>
//                     <div className="text-[10px] text-slate-500 font-mono">
//                       @{rec.user.username}
//                     </div>
//                   </td>
//                   <td className="px-6 py-4 text-slate-400 font-mono text-xs">
//                     {formatDate(rec.date)}
//                   </td>
//                   <td className="px-6 py-4 text-center">
//                     <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg font-mono font-bold text-xs border border-emerald-500/20">
//                       <ArrowLeftOnRectangleIcon className="w-3.5 h-3.5" />
//                       {formatTime(rec.checkIn)}
//                     </div>
//                   </td>
//                   <td className="px-6 py-4 text-center">
//                     <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-400 rounded-lg font-mono font-bold text-xs border border-rose-500/20">
//                       <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" />
//                       {formatTime(rec.checkOut)}
//                     </div>
//                   </td>
//                   <td className="px-6 py-4 text-center">
//                     <span
//                       className={`px-2.5 py-1 rounded-full text-[9px] font-black border tracking-tighter uppercase
//                       ${rec.status === "LATE" ? "bg-amber-900/30 text-amber-400 border-amber-500/30" : "bg-emerald-900/30 text-emerald-400 border-emerald-500/30"}
//                     `}
//                     >
//                       {rec.status === "LATE" ? "متأخر" : "حاضر"}
//                     </span>
//                   </td>
//                   <td className="px-6 py-4 text-center font-bold text-rose-400 font-mono">
//                     {rec.lateMinutes > 0 ? `+${rec.lateMinutes} د` : "--"}
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }

// // src/pages/AttendancePage.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../api/apiClient";
// import { toast } from "sonner";
// import { formatDate } from "@/lib/utils";
// import { DatePicker } from "@/components/ui/date-picker";

// type AttendanceRecord = {
//   id: number;
//   date: string;
//   checkIn: string | null;
//   checkOut: string | null;
//   status: string;
//   lateMinutes: number;
//   user: {
//     id: number;
//     fullName: string;
//     username: string;
//   };
// };

// type UserLite = {
//   id: number;
//   fullName: string;
// };

// function formatTime(iso: string | null) {
//   if (!iso) return "—";
//   return new Date(iso).toLocaleTimeString("ar-LY", {
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// }

// // Local formatDate removed

// export default function AttendancePage() {
//   const [records, setRecords] = useState<AttendanceRecord[]>([]);
//   const [users, setUsers] = useState<UserLite[]>([]);
//   const [loading, setLoading] = useState(false);

//   // Filters
//   const today = new Date().toISOString().slice(0, 10);
//   const [dateFrom, setDateFrom] = useState(today);
//   const [dateTo, setDateTo] = useState(today);
//   const [userId, setUserId] = useState<string>("");

//   // Manual Punch Modal
//   const [showModal, setShowModal] = useState(false);
//   const [manualUserId, setManualUserId] = useState("");
//   const [manualTime, setManualTime] = useState(""); // HH:mm
//   const [manualDate, setManualDate] = useState(today);

//   // 1. تحميل المستخدمين (للفلتر والإضافة)
//   useEffect(() => {
//     apiClient.get<UserLite[]>("/cashier/users").then((res) => {
//       setUsers(res.data);
//     });
//   }, []);

//   // 2. تحميل السجلات
//   const loadRecords = async () => {
//     setLoading(true);
//     try {
//       const params: any = {};
//       if (dateFrom) params.from = dateFrom;
//       if (dateTo) params.to = dateTo;
//       if (userId) params.userId = userId;

//       const res = await apiClient.get<AttendanceRecord[]>("/attendance", {
//         params,
//       });
//       setRecords(res.data);
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل تحميل سجلات الحضور.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     loadRecords();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [dateFrom, dateTo, userId]);

//   // 3. إضافة بصمة يدوية
//   const handleManualPunch = async () => {
//     if (!manualUserId || !manualDate || !manualTime) {
//       toast.warning("جميع الحقول مطلوبة.");
//       return;
//     }

//     // دمج التاريخ والوقت لإنشاء ISO String
//     // ملاحظة: هذا سيعتمد على توقيت المتصفح المحلي
//     const dateTimeStr = `${manualDate}T${manualTime}:00`;
//     const dateObj = new Date(dateTimeStr);

//     try {
//       await apiClient.post("/attendance/punch", {
//         userId: Number(manualUserId),
//         timestamp: dateObj.toISOString(),
//       });

//       toast.success("تم تسجيل البصمة بنجاح.");
//       setShowModal(false);
//       loadRecords();
//     } catch (err: any) {
//       console.error(err);
//       toast.error("فشل تسجيل البصمة.");
//     }
//   };

//   // 4. محاكاة استيراد من جهاز (Bulk Import Simulation)
//   const handleSimulateDevice = async () => {
//     if (
//       !confirm(
//         "سيتم توليد بصمات عشوائية لجميع الموظفين لهذا اليوم للتجربة. هل أنت متأكد؟"
//       )
//     )
//       return;

//     try {
//       // نولد بصمات عشوائية للموظفين الموجودين
//       const punches = users.flatMap((u) => {
//         // وقت دخول عشوائي بين 7:50 و 8:30
//         const randomIn = 7 * 60 + 50 + Math.floor(Math.random() * 40);
//         const inHour = Math.floor(randomIn / 60)
//           .toString()
//           .padStart(2, "0");
//         const inMin = (randomIn % 60).toString().padStart(2, "0");

//         // وقت خروج عشوائي بين 15:00 و 17:00
//         const randomOut = 15 * 60 + Math.floor(Math.random() * 120);
//         const outHour = Math.floor(randomOut / 60)
//           .toString()
//           .padStart(2, "0");
//         const outMin = (randomOut % 60).toString().padStart(2, "0");

//         const dateStr = new Date().toISOString().slice(0, 10);

//         return [
//           {
//             userId: u.id,
//             timestamp: new Date(
//               `${dateStr}T${inHour}:${inMin}:00`
//             ).toISOString(),
//           }, // Check In
//           {
//             userId: u.id,
//             timestamp: new Date(
//               `${dateStr}T${outHour}:${outMin}:00`
//             ).toISOString(),
//           }, // Check Out
//         ];
//       });

//       await apiClient.post("/attendance/bulk-import", { punches });

//       toast.success(`تم استيراد ${punches.length} بصمة من الجهاز الافتراضي.`);
//       loadRecords();
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل المحاكاة.");
//     }
//   };

//   return (
//     <div
//       className="flex flex-col h-full text-slate-100 p-6 space-y-6"
//       dir="rtl"
//     >
//       {/* Header */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-2xl font-bold mb-1">سجل الحضور والانصراف</h1>
//           <p className="text-sm text-slate-400">
//             متابعة دوام الموظفين، التأخير، وساعات العمل.
//           </p>
//         </div>
//         <div className="flex gap-2">
//           <button
//             onClick={handleSimulateDevice}
//             className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 rounded-xl text-xs"
//           >
//             🔄 محاكاة جهاز البصمة (Demo)
//           </button>
//           <button
//             onClick={() => setShowModal(true)}
//             className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
//           >
//             + تسجيل يدوي
//           </button>
//         </div>
//       </div>

//       {/* Filters */}
//       <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end">
//         <div className="flex flex-col gap-1">
//           <label className="text-xs text-slate-400">من تاريخ</label>
//           <DatePicker
//             date={dateFrom ? new Date(dateFrom) : undefined}
//             onChange={(d) => setDateFrom(d ? d.toISOString().slice(0, 10) : "")}
//             className="bg-slate-950 border-slate-700 h-8 text-sm px-2"
//           />
//         </div>
//         <div className="flex flex-col gap-1">
//           <label className="text-xs text-slate-400">إلى تاريخ</label>
//           <DatePicker
//             date={dateTo ? new Date(dateTo) : undefined}
//             onChange={(d) => setDateTo(d ? d.toISOString().slice(0, 10) : "")}
//             className="bg-slate-950 border-slate-700 h-8 text-sm px-2"
//           />
//         </div>
//         <div className="flex flex-col gap-1">
//           <label className="text-xs text-slate-400">الموظف</label>
//           <select
//             value={userId}
//             onChange={(e) => setUserId(e.target.value)}
//             className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm w-48"
//           >
//             <option value="">الكل</option>
//             {users.map((u) => (
//               <option key={u.id} value={u.id}>
//                 {u.fullName}
//               </option>
//             ))}
//           </select>
//         </div>
//         <button
//           onClick={loadRecords}
//           className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs"
//         >
//           تحديث
//         </button>
//       </div>

//       {/* Table */}
//       <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
//         <table className="w-full text-sm text-right">
//           <thead className="text-slate-400 border-b border-slate-800">
//             <tr>
//               <th className="pb-3 px-2">التاريخ</th>
//               <th className="pb-3 px-2">الموظف</th>
//               <th className="pb-3 px-2">وقت الدخول</th>
//               <th className="pb-3 px-2">وقت الخروج</th>
//               <th className="pb-3 px-2">الحالة</th>
//               <th className="pb-3 px-2">التأخير (دقائق)</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-800">
//             {loading && (
//               <tr>
//                 <td colSpan={6} className="text-center py-8 text-slate-500">
//                   جارِ التحميل...
//                 </td>
//               </tr>
//             )}
//             {!loading && records.length === 0 && (
//               <tr>
//                 <td colSpan={6} className="text-center py-8 text-slate-500">
//                   لا توجد سجلات.
//                 </td>
//               </tr>
//             )}

//             {records.map((rec) => (
//               <tr key={rec.id} className="hover:bg-slate-800/40">
//                 <td className="py-3 px-2 text-slate-300">
//                   {formatDate(rec.date)}
//                 </td>
//                 <td className="py-3 px-2 font-medium text-slate-200">
//                   {rec.user.fullName}
//                 </td>
//                 <td className="py-3 px-2 text-emerald-300 dir-ltr text-right">
//                   {formatTime(rec.checkIn)}
//                 </td>
//                 <td className="py-3 px-2 text-amber-300 dir-ltr text-right">
//                   {formatTime(rec.checkOut)}
//                 </td>
//                 <td className="py-3 px-2">
//                   <span
//                     className={`px-2 py-0.5 rounded text-[10px] ${
//                       rec.status === "LATE"
//                         ? "bg-rose-900/40 text-rose-300"
//                         : "bg-emerald-900/40 text-emerald-300"
//                     }`}
//                   >
//                     {rec.status === "LATE" ? "متأخر" : "حاضر"}
//                   </span>
//                 </td>
//                 <td className="py-3 px-2 font-bold text-rose-400">
//                   {rec.lateMinutes > 0 ? `${rec.lateMinutes} د` : "-"}
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>

//       {/* Manual Entry Modal */}
//       {showModal && (
//         <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
//           <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
//             <h3 className="text-lg font-bold text-slate-100">
//               تسجيل بصمة يدوية
//             </h3>

//             <div className="space-y-3">
//               <div className="flex flex-col gap-1">
//                 <label className="text-xs text-slate-400">الموظف</label>
//                 <select
//                   value={manualUserId}
//                   onChange={(e) => setManualUserId(e.target.value)}
//                   className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
//                 >
//                   <option value="">اختر الموظف...</option>
//                   {users.map((u) => (
//                     <option key={u.id} value={u.id}>
//                       {u.fullName}
//                     </option>
//                   ))}
//                 </select>
//               </div>
//               <div className="flex flex-col gap-1">
//                 <label className="text-xs text-slate-400">التاريخ</label>
//                 <DatePicker
//                   date={manualDate ? new Date(manualDate) : undefined}
//                   onChange={(d) => setManualDate(d ? d.toISOString().slice(0, 10) : "")}
//                   className="bg-slate-950 border-slate-700 h-9 text-sm"
//                 />
//               </div>
//               <div className="flex flex-col gap-1">
//                 <label className="text-xs text-slate-400">الوقت</label>
//                 <input
//                   type="time"
//                   value={manualTime}
//                   onChange={(e) => setManualTime(e.target.value)}
//                   className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
//                 />
//               </div>
//             </div>

//             <div className="flex justify-end gap-2 pt-2">
//               <button
//                 onClick={() => setShowModal(false)}
//                 className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
//               >
//                 إلغاء
//               </button>
//               <button
//                 onClick={handleManualPunch}
//                 className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
//               >
//                 حفظ
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
