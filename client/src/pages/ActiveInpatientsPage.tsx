// src/pages/ActiveInpatientsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";

type ActiveInpatient = {
  id: number; // encounterId
  admissionDate: string;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
  };
  doctor?: {
    fullName: string;
  };
  bedAssignments: {
    bed: {
      bedNumber: string;
      ward: {
        name: string;
      };
    };
  }[];
};

// Local formatDate removed

export default function ActiveInpatientsPage() {
  const [patients, setPatients] = useState<ActiveInpatient[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);
    try {
      // سنحتاج لإضافة endpoint مخصص لهذا الغرض في Backend أو نستخدم الفلتر الموجود
      // للتبسيط، سنفترض وجود هذا المسار أو نقوم بفلترة Encounters
      // الأفضل: إضافة دالة listActiveInpatients في الـ Backend
      // حالياً، سنستخدم خدعة بسيطة:
      // (يفترض أنك ستضيف هذا الـ endpoint في الـ controller، أو نستخدم البحث العام)
      // سأستخدم هنا endpoint افتراضي، إذا لم يعمل معك، أخبرني لنضيفه في الـ Backend

      // ⚠️ ملاحظة: سأعطيك كود الـ Backend الإضافي لهذا الـ Endpoint أدناه
      const res = await apiClient.get<ActiveInpatient[]>(
        "/encounters/list/active-inpatients",
      );
      setPatients(res.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل قائمة المنومين.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDischarge = async (encounterId: number, patientName: string) => {
    if (
      !confirm(
        `هل أنت متأكد من إجراء خروج للمريض: ${patientName}؟\nسيتم التحقق من الفواتير وتحرير السرير.`,
      )
    )
      return;

    try {
      await apiClient.patch(`/encounters/${encounterId}/discharge`);
      toast.success("تم إجراء الخروج بنجاح. السرير الآن في حالة 'تنظيف'.");
      loadData();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message || "فشل إجراء الخروج.";
      toast.error(msg);
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            حالات الإيواء (Inpatients)
          </h1>
          <p className="text-sm text-slate-400">
            قائمة المرضى المتواجدين حالياً في غرف الإيواء.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/doctor-rounds")}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-bold shadow-lg shadow-sky-900/20"
          >
            👨‍⚕️ المرور الطبي (My Rounds)
          </button>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm"
          >
            تحديث
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-950/80 overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">رقم الدخول</th>
              <th className="px-4 py-3">تاريخ الدخول</th>
              <th className="px-4 py-3">المريض</th>
              <th className="px-4 py-3">الطبيب</th>
              <th className="px-4 py-3">الموقع (السرير)</th>
              <th className="px-4 py-3">إجراءات</th>
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
            {!loading && patients.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">
                  لا يوجد مرضى منومين حالياً.
                </td>
              </tr>
            )}

            {patients.map((p) => {
              const bedInfo = p.bedAssignments[0]?.bed;
              const wardName = p.bedAssignments[0]?.bed.ward.name;
              return (
                <tr key={p.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-mono text-sky-400">#{p.id}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {formatDate(p.admissionDate || "")}{" "}
                    <span className="text-[10px] text-slate-500">
                      {new Date(p.admissionDate).toLocaleTimeString("ar-LY", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {p.patient.fullName}
                    <div className="text-[10px] text-slate-500">
                      {p.patient.mrn}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {p.doctor?.fullName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {bedInfo ? (
                      <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs">
                        {wardName} - {bedInfo.bedNumber}
                      </span>
                    ) : (
                      <span className="text-rose-400">بدون سرير!</span>
                    )}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => navigate(`/encounters/${p.id}`)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white"
                    >
                      الملف الطبي
                    </button>
                    <button
                      onClick={() => handleDischarge(p.id, p.patient.fullName)}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-500 rounded text-xs text-white font-bold shadow-lg shadow-rose-900/20"
                    >
                      إجراء خروج
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
