// src/pages/AdmissionsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// Types
type BedStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "CLEANING"
  | "MAINTENANCE"
  | "BLOCKED";

type Bed = {
  id: number;
  bedNumber: string;
  status: BedStatus;
};

type Room = {
  id: number;
  roomNumber: string;
  beds: Bed[];
};

type Ward = {
  id: number;
  name: string;
  type: string | null;
  gender: string | null;
  rooms: Room[];
};

type PatientLite = {
  id: number;
  fullName: string;
  mrn: string;
};

type DoctorLite = {
  id: number;
  fullName: string;
};

// واجهة الاستجابة الجديدة للمرضى
type PatientsListResponse = {
  items: PatientLite[];
  meta: any;
};

export default function AdmissionsPage() {
  const navigate = useNavigate();

  // Data State
  const [wards, setWards] = useState<Ward[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [doctors, setDoctors] = useState<DoctorLite[]>([]);
  const [loading, setLoading] = useState(false);

  // Selection State
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [selectedBed, setSelectedBed] = useState<{
    id: number;
    number: string;
    wardName: string;
  } | null>(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);

  // 1. تحميل البيانات
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [wardsRes, patientsRes, doctorsRes] = await Promise.all([
          apiClient.get<Ward[]>("/beds/tree"),
          apiClient.get<PatientsListResponse>("/patients?limit=1000"), // ✅ نجلب المرضى ونحدد النوع الصحيح
          apiClient.get<DoctorLite[]>("/users/doctors-list"), // ✅ استخدام المسار الصحيح للأطباء
        ]);

        setWards(wardsRes.data);
        // ✅ التصحيح الجوهري: الوصول إلى items داخل البيانات المرجعة
        // الـ interceptor يفك التغليف الأول (success/data)، لكن patients يرجع (items/meta)
        // لذا patientsRes.data هي { items: [...], meta: ... }
        setPatients(patientsRes.data.items || []);

        setDoctors(doctorsRes.data);
      } catch (err) {
        console.error(err);
        toast.error("حدث خطأ أثناء تحميل بيانات التنويم.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 2. دالة التنويم (Admission Logic)
  const handleAdmission = async () => {
    if (!selectedPatientId) {
      toast.warning("يجب اختيار المريض.");
      return;
    }
    if (!selectedBed) {
      toast.warning("يجب اختيار سرير متاح.");
      return;
    }

    if (
      !confirm(
        `هل أنت متأكد من تنويم المريض في السرير ${selectedBed.number} (${selectedBed.wardName})؟`,
      )
    )
      return;

    setSubmitting(true);
    try {
      // أ) إنشاء Encounter
      const encRes = await apiClient.post("/encounters", {
        patientId: Number(selectedPatientId),
        type: "IPD",
        doctorId: selectedDoctorId ? Number(selectedDoctorId) : undefined,
        chiefComplaint: "دخول تنويم (Admission)",
      });

      // في حال كانت الاستجابة موحدة، الـ interceptor يعيد data مباشرة
      // ولكن للتأكد، نتحقق إذا كان id موجوداً مباشرة أو داخل data
      const encounterId = encRes.data.id || (encRes.data as any).data?.id;

      if (!encounterId) throw new Error("فشل الحصول على رقم الحالة");

      // ب) ربط المريض بالسرير
      await apiClient.post("/beds/assign", {
        encounterId: encounterId,
        bedId: selectedBed.id,
      });

      toast.success("تم إجراء الدخول وحجز السرير بنجاح.");

      // إعادة تعيين
      setSelectedBed(null);
      setSelectedPatientId("");

      // تحديث الخريطة
      const wardsRes = await apiClient.get<Ward[]>("/beds/tree");
      setWards(wardsRes.data);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || "فشل عملية التنويم.");
    } finally {
      setSubmitting(false);
    }
  };

  const getBedColor = (status: BedStatus) => {
    switch (status) {
      case "AVAILABLE":
        return "bg-emerald-600 hover:bg-emerald-500 cursor-pointer border-emerald-500";
      case "OCCUPIED":
        return "bg-rose-900/60 border-rose-700/60 cursor-not-allowed opacity-80";
      case "CLEANING":
        return "bg-amber-600/60 border-amber-500/60 cursor-not-allowed";
      case "MAINTENANCE":
        return "bg-slate-600 border-slate-500 cursor-not-allowed";
      default:
        return "bg-gray-700 border-gray-600";
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      {/* العنوان */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">مكتب الدخول وإدارة الأسرة</h1>
          <p className="text-sm text-slate-400">
            تسجيل دخول مرضى الإيواء (IPD) وتوزيعهم على العنابر والأسرة.
          </p>
        </div>
      </div>

      {/* منطقة التحكم */}
      <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
        <h2 className="text-sm font-semibold mb-4 text-slate-200">
          1. بيانات المريض والطبيب
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">
              المريض <span className="text-rose-400">*</span>
            </label>
            <select
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
            >
              <option value="">-- اختر مريضاً --</option>
              {/* ✅ هنا كان الخطأ، الآن patients مصفوفة صحيحة */}
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">الطبيب المسؤول</label>
            <select
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
            >
              <option value="">-- اختر الطبيب --</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-slate-400 pb-2">
            {selectedBed ? (
              <span className="text-emerald-400 font-semibold">
                تم اختيار السرير: {selectedBed.number} ({selectedBed.wardName})
              </span>
            ) : (
              <span className="text-amber-400 animate-pulse">
                ⬅ يرجى اختيار سرير متاح من الخريطة بالأسفل
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            disabled={!selectedPatientId || !selectedBed || submitting}
            onClick={handleAdmission}
            className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? "جارِ التنويم..." : "تأكيد الدخول وحجز السرير"}
          </button>
        </div>
      </div>

      {/* خريطة الأسرة */}
      <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar">
        <h2 className="text-sm font-semibold text-slate-200">
          2. خريطة الأسرة (اضغط لاختيار سرير)
        </h2>

        {loading && (
          <div className="text-center py-10 text-slate-500">
            جارِ تحميل العنابر...
          </div>
        )}

        {wards.map((ward) => (
          <div
            key={ward.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
          >
            <div className="flex items-center gap-3 mb-3 border-b border-slate-800 pb-2">
              <h3 className="font-bold text-lg text-slate-100">{ward.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {ward.type || "عام"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ward.rooms.map((room) => (
                <div
                  key={room.id}
                  className="border border-slate-700/50 bg-slate-950/50 rounded-xl p-3"
                >
                  <div className="text-xs text-slate-500 mb-2">
                    غرفة رقم {room.roomNumber}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {room.beds.map((bed) => (
                      <button
                        key={bed.id}
                        disabled={bed.status !== "AVAILABLE"}
                        onClick={() =>
                          setSelectedBed({
                            id: bed.id,
                            number: bed.bedNumber,
                            wardName: ward.name,
                          })
                        }
                        className={`
                          relative w-16 h-16 rounded-lg border-2 flex flex-col items-center justify-center transition-all
                          ${getBedColor(bed.status)}
                          ${
                            selectedBed?.id === bed.id
                              ? "ring-2 ring-white scale-110 shadow-xl z-10"
                              : ""
                          }
                        `}
                      >
                        <span className="text-xs font-bold text-white">
                          {bed.bedNumber}
                        </span>
                        {bed.status !== "AVAILABLE" && (
                          <span className="text-[9px] text-white/70">
                            {bed.status === "OCCUPIED"
                              ? "مشغول"
                              : bed.status === "CLEANING"
                                ? "تنظيف"
                                : "صيانة"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// // src/pages/AdmissionsPage.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../api/apiClient";
// import { toast } from "sonner";
// import { useNavigate } from "react-router-dom";

// // Types
// type BedStatus =
//   | "AVAILABLE"
//   | "OCCUPIED"
//   | "CLEANING"
//   | "MAINTENANCE"
//   | "BLOCKED";

// type Bed = {
//   id: number;
//   bedNumber: string;
//   status: BedStatus;
// };

// type Room = {
//   id: number;
//   roomNumber: string;
//   beds: Bed[];
// };

// type Ward = {
//   id: number;
//   name: string;
//   type: string | null; // General, ICU...
//   gender: string | null;
//   rooms: Room[];
// };

// type PatientLite = {
//   id: number;
//   fullName: string;
//   mrn: string;
// };

// type DoctorLite = {
//   id: number;
//   fullName: string;
// };

// type ActiveAdmission = {
//   id: number;
//   patient: { fullName: string; mrn: string };
//   bedAssignments: { bed: { bedNumber: string; ward: { name: string } } }[];
//   createdAt: string;
// };

// export default function AdmissionsPage() {
//   const navigate = useNavigate();

//   // Data State
//   const [wards, setWards] = useState<Ward[]>([]);
//   const [patients, setPatients] = useState<PatientLite[]>([]);
//   const [doctors, setDoctors] = useState<DoctorLite[]>([]);
//   const [loading, setLoading] = useState(false);

//   // Selection State
//   const [selectedPatientId, setSelectedPatientId] = useState<string>("");
//   const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
//   const [selectedBed, setSelectedBed] = useState<{
//     id: number;
//     number: string;
//     wardName: string;
//   } | null>(null);

//   // Submission State
//   const [submitting, setSubmitting] = useState(false);

//   const [activeAdmissions, setActiveAdmissions] = useState<ActiveAdmission[]>(
//     []
//   );

//   // 1. تحميل البيانات (شجرة الأسرة + المرضى + الأطباء)
//   useEffect(() => {
//     async function loadData() {
//       setLoading(true);
//       try {
//         const [wardsRes, patientsRes, doctorsRes] = await Promise.all([
//           apiClient.get<Ward[]>("/beds/tree"),
//           apiClient.get<PatientLite[]>("/patients"),
//           // نفترض وجود endpoint للأطباء، أو نستخدم المستخدمين بفلتر (سأستخدم users مؤقتاً أو تفترض وجود API)
//           // للعرض السريع سأجلب كل المستخدمين وافلتر في الفرونت لو الـ API لا يدعم
//           apiClient.get<DoctorLite[]>("/cashier/users"),
//         ]);

//         setWards(wardsRes.data);
//         setPatients(patientsRes.data);
//         setDoctors(doctorsRes.data); // يفضل فلترتهم ليظهر الأطباء فقط
//       } catch (err) {
//         console.error(err);
//         toast.error("حدث خطأ أثناء تحميل بيانات التنويم.");
//       } finally {
//         setLoading(false);
//       }
//     }
//     loadData();
//   }, []);

//   // 2. دالة التنويم (Admission Logic)
//   const handleAdmission = async () => {
//     if (!selectedPatientId) {
//       toast.warning("يجب اختيار المريض.");
//       return;
//     }
//     if (!selectedBed) {
//       toast.warning("يجب اختيار سرير متاح.");
//       return;
//     }

//     // تأكيد
//     if (
//       !confirm(
//         `هل أنت متأكد من تنويم المريض في السرير ${selectedBed.number} (${selectedBed.wardName})؟`
//       )
//     )
//       return;

//     setSubmitting(true);
//     try {
//       // أ) إنشاء Encounter من نوع IPD
//       const encRes = await apiClient.post("/encounters", {
//         patientId: Number(selectedPatientId),
//         type: "IPD",
//         doctorId: selectedDoctorId ? Number(selectedDoctorId) : undefined,
//         // يمكن إضافة departmentId بناءً على العنبر لاحقاً
//         chiefComplaint: "دخول تنويم (Admission)",
//       });

//       const encounterId = encRes.data.id;

//       // ب) ربط المريض بالسرير
//       await apiClient.post("/beds/assign", {
//         encounterId: encounterId,
//         bedId: selectedBed.id,
//       });

//       toast.success("تم إجراء الدخول وحجز السرير بنجاح.");

//       // إعادة تحميل البيانات لتحديث حالة السرير
//       setSelectedBed(null);
//       setSelectedPatientId("");
//       // تحديث الصفحة
//       const wardsRes = await apiClient.get<Ward[]>("/beds/tree");
//       setWards(wardsRes.data);
//     } catch (err: any) {
//       console.error(err);
//       toast.error(err?.response?.data?.message || "فشل عملية التنويم.");
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   // Helper to render bed color
//   const getBedColor = (status: BedStatus) => {
//     switch (status) {
//       case "AVAILABLE":
//         return "bg-emerald-600 hover:bg-emerald-500 cursor-pointer border-emerald-500";
//       case "OCCUPIED":
//         return "bg-rose-900/60 border-rose-700/60 cursor-not-allowed opacity-80";
//       case "CLEANING":
//         return "bg-amber-600/60 border-amber-500/60 cursor-not-allowed";
//       case "MAINTENANCE":
//         return "bg-slate-600 border-slate-500 cursor-not-allowed";
//       default:
//         return "bg-gray-700 border-gray-600";
//     }
//   };

//   return (
//     <div
//       className="flex flex-col h-full text-slate-100 p-6 space-y-6"
//       dir="rtl"
//     >
//       {/* العنوان */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-2xl font-bold mb-1">مكتب الدخول وإدارة الأسرة</h1>
//           <p className="text-sm text-slate-400">
//             تسجيل دخول مرضى الإيواء (IPD) وتوزيعهم على العنابر والأسرة.
//           </p>
//         </div>
//       </div>

//       {/* منطقة التحكم (اختيار المريض والطبيب) */}
//       <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
//         <h2 className="text-sm font-semibold mb-4 text-slate-200">
//           1. بيانات المريض والطبيب
//         </h2>
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
//           <div className="flex flex-col gap-1">
//             <label className="text-xs text-slate-400">
//               المريض <span className="text-rose-400">*</span>
//             </label>
//             <select
//               className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
//               value={selectedPatientId}
//               onChange={(e) => setSelectedPatientId(e.target.value)}
//             >
//               <option value="">-- اختر مريضاً --</option>
//               {patients.map((p) => (
//                 <option key={p.id} value={p.id}>
//                   {p.fullName} ({p.mrn})
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div className="flex flex-col gap-1">
//             <label className="text-xs text-slate-400">الطبيب المسؤول</label>
//             <select
//               className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
//               value={selectedDoctorId}
//               onChange={(e) => setSelectedDoctorId(e.target.value)}
//             >
//               <option value="">-- اختر الطبيب --</option>
//               {doctors.map((d) => (
//                 <option key={d.id} value={d.id}>
//                   {d.fullName}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div className="text-sm text-slate-400 pb-2">
//             {selectedBed ? (
//               <span className="text-emerald-400 font-semibold">
//                 تم اختيار السرير: {selectedBed.number} ({selectedBed.wardName})
//               </span>
//             ) : (
//               <span className="text-amber-400 animate-pulse">
//                 ⬅ يرجى اختيار سرير متاح من الخريطة بالأسفل
//               </span>
//             )}
//           </div>
//         </div>

//         <div className="mt-4 flex justify-end">
//           <button
//             disabled={!selectedPatientId || !selectedBed || submitting}
//             onClick={handleAdmission}
//             className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//           >
//             {submitting ? "جارِ التنويم..." : "تأكيد الدخول وحجز السرير"}
//           </button>
//         </div>
//       </div>

//       {/* خريطة الأسرة (Bed Map) */}
//       <div className="flex-1 overflow-y-auto space-y-6">
//         <h2 className="text-sm font-semibold text-slate-200">
//           2. خريطة الأسرة (اضغط لاختيار سرير)
//         </h2>

//         {loading && (
//           <div className="text-center py-10 text-slate-500">
//             جارِ تحميل العنابر...
//           </div>
//         )}

//         {wards.map((ward) => (
//           <div
//             key={ward.id}
//             className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
//           >
//             <div className="flex items-center gap-3 mb-3 border-b border-slate-800 pb-2">
//               <h3 className="font-bold text-lg text-slate-100">{ward.name}</h3>
//               <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
//                 {ward.type || "عام"}
//               </span>
//               <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
//                 {ward.gender || "مختلط"}
//               </span>
//             </div>

//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//               {ward.rooms.map((room) => (
//                 <div
//                   key={room.id}
//                   className="border border-slate-700/50 bg-slate-950/50 rounded-xl p-3"
//                 >
//                   <div className="text-xs text-slate-500 mb-2">
//                     غرفة رقم {room.roomNumber}
//                   </div>
//                   <div className="flex flex-wrap gap-2">
//                     {room.beds.map((bed) => (
//                       <button
//                         key={bed.id}
//                         disabled={bed.status !== "AVAILABLE"}
//                         onClick={() =>
//                           setSelectedBed({
//                             id: bed.id,
//                             number: bed.bedNumber,
//                             wardName: ward.name,
//                           })
//                         }
//                         className={`
//                           relative w-16 h-16 rounded-lg border-2 flex flex-col items-center justify-center transition-all
//                           ${getBedColor(bed.status)}
//                           ${
//                             selectedBed?.id === bed.id
//                               ? "ring-2 ring-white scale-110 shadow-xl z-10"
//                               : ""
//                           }
//                         `}
//                       >
//                         <span className="text-xs font-bold text-white">
//                           {bed.bedNumber}
//                         </span>
//                         {bed.status === "OCCUPIED" && (
//                           <span className="text-[9px] text-white/70">
//                             مشغول
//                           </span>
//                         )}
//                         {bed.status === "CLEANING" && (
//                           <span className="text-[9px] text-white/70">
//                             تنظيف
//                           </span>
//                         )}
//                         {bed.status === "MAINTENANCE" && (
//                           <span className="text-[9px] text-white/70">
//                             صيانة
//                           </span>
//                         )}
//                       </button>
//                     ))}
//                   </div>
//                 </div>
//               ))}
//             </div>
//             {ward.rooms.length === 0 && (
//               <div className="text-xs text-slate-500">
//                 لا توجد غرف معرفة في هذا العنبر.
//               </div>
//             )}
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }
