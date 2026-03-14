// src/pages/ActiveInpatientsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { RequestTransferModal } from "./clinical/transfers/RequestTransferModal";
import { NicuSeparationModal } from "./clinical/icu/NicuSeparationModal";

type ActiveInpatient = {
  id: number; // encounterId
  admissionDate: string;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
    gender?: string;
  };
  doctor?: {
    fullName: string;
  };
  bedAssignments: {
    bed: {
      id: number;
      bedNumber: string;
      ward: {
        name: string;
      };
    };
  }[];
  admission?: {
    id: number;
    primaryDiagnosis?: string;
  };
};

type WardTree = {
  id: number;
  name: string;
  rooms: {
    id: number;
    roomNumber: string;
    beds: {
      id: number;
      bedNumber: string;
      status: string;
    }[];
  }[];
};

export default function ActiveInpatientsPage() {
  const [patients, setPatients] = useState<ActiveInpatient[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Bed Assignment Modal
  const [showBedModal, setShowBedModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<ActiveInpatient | null>(null);
  const [wardTree, setWardTree] = useState<WardTree[]>([]);
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedBed, setSelectedBed] = useState("");
  const [assigningBed, setAssigningBed] = useState(false);

  // Transfer Request Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferPatient, setTransferPatient] = useState<{ id: number; name: string; fromBedId: number | null }>({ id: 0, name: '', fromBedId: null });

  // NICU Separation Modal
  const [showNicuModal, setShowNicuModal] = useState(false);
  const [nicuMother, setNicuMother] = useState<{ id: number; name: string }>({ id: 0, name: '' });


  const loadData = async () => {
    setLoading(true);
    try {
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

  const loadWardTree = async () => {
    try {
      const res = await apiClient.get<WardTree[]>("/beds/tree");
      setWardTree(res.data);
    } catch (err) {
      console.error("Failed to load ward tree", err);
    }
  };

  useEffect(() => {
    loadData();
    loadWardTree();
  }, []);

  const handleDischarge = async (encounterId: number, patientName: string, admissionId?: number) => {
    if (!admissionId) {
      toast.error("بيانات الدخول (الإيواء) غير متوفرة لهذا المريض.");
      return;
    }

    if (
      !confirm(
        `هل أنت متأكد من إجراء خروج للمريض: ${patientName}؟\nسيتم مراجعة خطة الخروج الطبية والموقف المالي.`,
      )
    )
      return;

    try {
      await apiClient.post(`/admissions/${admissionId}/discharge`, {});
      toast.success("تم إجراء الخروج بنجاح. السرير الآن في حالة 'تنظيف'.");
      loadData();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message || "فشل إجراء الخروج.";
      if (msg.includes("خطة الخروج الطبية غير مكتملة")) {
        toast.error("خطة الخروج الطبية غير مكتملة. سيتم تحويلك لصفحة تخطيط الخروج.");
        navigate("/discharge-planning");
      } else {
        toast.error(msg);
      }
    }
  };

  const openBedModal = (patient: ActiveInpatient) => {
    setSelectedPatient(patient);
    setSelectedWard("");
    setSelectedBed("");
    setShowBedModal(true);
  };

  const handleAssignBed = async () => {
    if (!selectedPatient || !selectedBed) return;
    setAssigningBed(true);
    try {
      await apiClient.post("/beds/assign", {
        encounterId: selectedPatient.id,
        bedId: Number(selectedBed),
      });
      toast.success("تم تعيين السرير بنجاح!");
      setShowBedModal(false);
      loadData();
      loadWardTree(); // Refresh availability
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تعيين السرير");
    } finally {
      setAssigningBed(false);
    }
  };

  const openTransferModal = (patient: ActiveInpatient) => {
    setTransferPatient({
      id: patient.id,
      name: patient.patient.fullName,
      fromBedId: patient.bedAssignments[0]?.bed.id || null
    });
    setShowTransferModal(true);
  };

  const openNicuModal = (patient: ActiveInpatient) => {
    setNicuMother({
      id: patient.patient.id, // we need mother's patient ID, not encounter ID
      name: patient.patient.fullName,
    });
    setShowNicuModal(true);
  };


  // Get available beds for selected ward
  const availableBeds = selectedWard
    ? wardTree
        .find((w) => w.id === Number(selectedWard))
        ?.rooms.flatMap((room) =>
          room.beds
            .filter((b) => b.status === "AVAILABLE")
            .map((b) => ({
              ...b,
              roomNumber: room.roomNumber,
            }))
        ) || []
    : [];

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
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs">
                          {wardName} - {bedInfo.bedNumber}
                        </span>
                        <button
                          onClick={() => openBedModal(p)}
                          className="text-[10px] text-amber-400 hover:text-amber-300 underline"
                          title="نقل إلى سرير آخر"
                        >
                          نقل
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openBedModal(p)}
                        className="px-3 py-1 bg-rose-600/20 border border-rose-500/40 text-rose-400 rounded-lg text-xs hover:bg-rose-600/40 transition-all animate-pulse"
                      >
                        ⚠️ تعيين سرير
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/encounters/${p.id}`)}
                          className="flex-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all"
                        >
                          📄 الملف الطبي
                        </button>
                        <button
                          onClick={() => openTransferModal(p)}
                          className="flex-1 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/50 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-medium transition-all"
                          title="طلب نقل إلى العناية أو قسم آخر"
                        >
                          🚑 نقل
                        </button>
                      </div>
                      <div className="flex gap-2">
                         <button
                           onClick={() => navigate(`/surgery?encounterId=${p.id}`)}
                           className="flex-1 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/50 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-medium transition-all"
                         >
                           🔪 حجز عملية
                         </button>
                         <button
                           onClick={() => handleDischarge(p.id, p.patient.fullName, p.admission?.id)}
                           className="flex-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-lg text-xs text-white font-bold shadow-lg shadow-rose-900/20"
                         >
                           استخراج
                         </button>
                      </div>
                      
                      {/* Show NICU Separation for female patients only (Simplified check, reality might be maternity ward check) */}
                      {p.patient.gender === 'FEMALE' && (
                        <div className="flex gap-2 w-full mt-2">
                          <button
                            onClick={() => openNicuModal(p)}
                            className="flex-1 px-3 py-1.5 bg-pink-600/20 hover:bg-pink-600/50 text-pink-400 border border-pink-500/30 rounded-lg text-xs font-medium transition-all"
                            title="فصل وإنشاء ملف إيواء لمولود جديد وتعيينه كضامن"
                          >
                            🍼 تسجيل مولود (NICU)
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bed Assignment / Transfer Modal */}
      {showBedModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">
              🛏️ تعيين / نقل سرير
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              المريض: <span className="text-sky-400 font-semibold">{selectedPatient.patient.fullName}</span>
              {selectedPatient.bedAssignments[0]?.bed && (
                <span className="text-amber-400 mr-2">
                  (حالياً: {selectedPatient.bedAssignments[0].bed.ward.name} - {selectedPatient.bedAssignments[0].bed.bedNumber})
                </span>
              )}
            </p>

            <div className="space-y-4 mb-6">
              {/* Ward Selection */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">العنبر / القسم</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  value={selectedWard}
                  onChange={(e) => {
                    setSelectedWard(e.target.value);
                    setSelectedBed("");
                  }}
                >
                  <option value="">-- اختر العنبر --</option>
                  {wardTree.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.rooms.flatMap((r) => r.beds.filter((b) => b.status === "AVAILABLE")).length} سرير متاح)
                    </option>
                  ))}
                </select>
              </div>

              {/* Bed Selection */}
              {selectedWard && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">السرير المتاح</label>
                  {availableBeds.length === 0 ? (
                    <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/30 rounded-xl p-3">
                      ⚠️ لا توجد أسرّة متاحة في هذا العنبر. جرّب عنبراً آخر.
                    </p>
                  ) : (
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                      value={selectedBed}
                      onChange={(e) => setSelectedBed(e.target.value)}
                    >
                      <option value="">-- اختر السرير --</option>
                      {availableBeds.map((b) => (
                        <option key={b.id} value={b.id}>
                          غرفة {b.roomNumber} — سرير {b.bedNumber}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBedModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleAssignBed}
                disabled={!selectedBed || assigningBed}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs text-white font-bold disabled:opacity-50"
              >
                {assigningBed ? "جارِ التعيين..." : "✅ تعيين السرير"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Transfer Modal */}
      <RequestTransferModal 
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        encounterId={transferPatient.id}
        patientName={transferPatient.name}
        fromBedId={transferPatient.fromBedId}
        onSuccess={() => {
           // Provide visual feedback, don't necessarily need to reload everything
        }}
      />

      {/* NICU Separation Modal */}
      <NicuSeparationModal
        isOpen={showNicuModal}
        onClose={() => setShowNicuModal(false)}
        motherPatientId={nicuMother.id}
        motherName={nicuMother.name}
        onSuccess={() => loadData()} // reload to see new baby possibly? (Depends if baby auto-admits. Current logic just creates patient record).
      />
    </div>
  );
}
