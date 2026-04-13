// src/pages/insurance/PreAuthPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

type PreAuthorization = {
  id: number;
  hospitalId: number;
  patientId: number;
  policyId: number;
  serviceItemId: number | null;
  authCode: string | null;
  status: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
    insuranceMemberId: string | null;
  };
  policy: {
    id: number;
    name: string;
    policyNumber: string | null;
    provider: {
      id: number;
      name: string;
    };
  };
  serviceItem?: {
    id: number;
    name: string;
  };
};

export default function PreAuthPage() {
  const [auths, setAuths] = useState<PreAuthorization[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedAuth, setSelectedAuth] = useState<PreAuthorization | null>(null);

  // Add Request State
  const [searchMrn, setSearchMrn] = useState("");
  const [foundPatient, setFoundPatient] = useState<any>(null);
  const [requestedAmount, setRequestedAmount] = useState("");
  const [requestNotes, setRequestNotes] = useState("");

  // Action State (Approve/Reject)
  const [actionType, setActionType] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [authCode, setAuthCode] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PreAuthorization[]>("/insurance/pre-auth");
      setAuths(res.data);
    } catch {
      toast.error("فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const searchPatient = async () => {
    if (!searchMrn) return;
    try {
      const res = await apiClient.get(`/patients/search?query=${searchMrn}`);
      if (res.data.length > 0) {
        // Need to check if patient has active policy
        const patientId = res.data[0].id;
        const patRes = await apiClient.get(`/patients/${patientId}`);
        if (!patRes.data.insurancePolicy) {
          toast.warning("هذا المريض ليس لديه بوليصة تأمين فعالة.");
          setFoundPatient(null);
        } else {
          setFoundPatient(patRes.data);
          toast.success("تم العثور على المريض");
        }
      } else {
        toast.error("لم يتم العثور على المريض");
      }
    } catch {
      toast.error("خطأ في البحث");
    }
  };

  const handleAddSubmit = async () => {
    if (!foundPatient) return;
    try {
      await apiClient.post("/insurance/pre-auth", {
        patientId: foundPatient.id,
        policyId: foundPatient.insurancePolicy.id,
        requestedAmount: requestedAmount ? Number(requestedAmount) : undefined,
        notes: requestNotes,
      });
      toast.success("تم تسجيل طلب الموافقة بنجاح");
      setShowAddModal(false);
      setFoundPatient(null);
      setSearchMrn("");
      setRequestedAmount("");
      setRequestNotes("");
      loadData();
    } catch {
      toast.error("فشل الإضافة");
    }
  };

  const openActionModal = (auth: PreAuthorization, type: "APPROVED" | "REJECTED") => {
    setSelectedAuth(auth);
    setActionType(type);
    setAuthCode(auth.authCode || "");
    setApprovedAmount(auth.approvedAmount ? String(auth.approvedAmount) : "");
    // Default expiry 30 days from now if not set
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    setExpiresAt(auth.expiresAt ? auth.expiresAt.substring(0, 10) : defaultExpiry.toISOString().substring(0, 10));
    setShowActionModal(true);
  };

  const handleActionSubmit = async () => {
    if (!selectedAuth) return;
    if (actionType === "APPROVED" && !authCode) {
      toast.warning("رقم الموافقة (Auth Code) إجباري عند القبول");
      return;
    }

    try {
      await apiClient.patch(`/insurance/pre-auth/${selectedAuth.id}`, {
        status: actionType,
        authCode: actionType === "APPROVED" ? authCode : null,
        approvedAmount: actionType === "APPROVED" && approvedAmount ? Number(approvedAmount) : null,
        expiresAt: actionType === "APPROVED" && expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      toast.success("تم تحديث حالة الموافقة بنجاح");
      setShowActionModal(false);
      loadData();
    } catch {
      toast.error("فشل التحديث");
    }
  };

  return (
    <div className="p-6 text-slate-100 h-full flex flex-col space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">الموافقات المسبقة (Pre-Auth)</h1>
          <p className="text-sm text-slate-400">متابعة طلبات الموافقة الواردة والصادرة لشركات التأمين.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm transition"
          >
            تحديث 🔄
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-bold shadow-lg transition"
          >
            + طلب موافقة جديد
          </button>
        </div>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">المريض</th>
              <th className="px-4 py-3">الشركة و الوثيقة</th>
              <th className="px-4 py-3">المبلغ المطلوب</th>
              <th className="px-4 py-3">حالة الطلب</th>
              <th className="px-4 py-3">رقم الموافقة</th>
              <th className="px-4 py-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  جارِ التحميل...
                </td>
              </tr>
            )}
            {!loading && auths.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  لا توجد طلبات جارية.
                </td>
              </tr>
            )}
            {!loading &&
              auths.map((auth) => (
                <tr key={auth.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-300">
                    {formatDate(auth.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {auth.patient.fullName}
                    <div className="text-xs text-slate-500">
                      {auth.patient.mrn} | {auth.patient.insuranceMemberId || "بدون رقم أجنبي"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    <div className="font-bold text-sky-400">{auth.policy.provider.name}</div>
                    <div className="text-xs">{auth.policy.name}</div>
                  </td>
                  <td className="px-4 py-3 text-orange-300 font-bold">
                    {auth.requestedAmount ? `${auth.requestedAmount} دينار` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        auth.status === "APPROVED"
                          ? "bg-emerald-900/40 text-emerald-400"
                          : auth.status === "REJECTED"
                          ? "bg-rose-900/40 text-rose-400"
                          : "bg-amber-900/40 text-amber-400"
                      }`}
                    >
                      {auth.status === "PENDING" ? "قيد الانتظار" : auth.status === "APPROVED" ? "موافق عليه" : "مرفوض"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {auth.authCode ? (
                      <span className="font-mono text-emerald-400 font-bold bg-emerald-950/50 px-2 py-1 rounded">
                        {auth.authCode}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {auth.status === "PENDING" && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openActionModal(auth, "APPROVED")}
                          className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded text-xs transition"
                        >
                          تأكيد
                        </button>
                        <button
                          onClick={() => openActionModal(auth, "REJECTED")}
                          className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 rounded text-xs transition"
                        >
                          رفض
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Add Request Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-sky-400 mb-4">إنشاء طلب موافقة مسبقة</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">ابحث برقم الملف (MRN) <span className="text-rose-500">*</span></label>
                <div className="flex gap-2">
                  <input
                    value={searchMrn}
                    onChange={(e) => setSearchMrn(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchPatient()}
                    placeholder="مثال: MRN-0001"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
                  />
                  <button onClick={searchPatient} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm">بحث</button>
                </div>
              </div>

              {foundPatient && (
                <div className="bg-sky-900/10 border border-sky-500/30 rounded-xl p-3 text-sm flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white">{foundPatient.fullName}</div>
                    <div className="text-xs text-sky-300 mt-1">البوليصة: {foundPatient.insurancePolicy?.name}</div>
                  </div>
                  <div className="text-xs bg-slate-800 px-2 py-1 rounded">رقم التأمين: {foundPatient.insuranceMemberId || "غير متوفر"}</div>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">المبلغ المطلوب (اختياري)</label>
                <input
                  type="number"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  placeholder="مثال: 500"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">ملاحظات / وصف الخدمة المطلوبة</label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="تفاصيل التقرير الطبي واسم الطبيب المعالج..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none h-24"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl">إلغاء</button>
              <button disabled={!foundPatient} onClick={handleAddSubmit} className="disabled:opacity-50 px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold rounded-xl shadow-lg">حفظ الطلب</button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal (Approve/Reject) */}
      {showActionModal && selectedAuth && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <h3 className={`text-xl font-bold mb-4 ${actionType === "APPROVED" ? "text-emerald-400" : "text-rose-400"}`}>
              {actionType === "APPROVED" ? "تسجيل الموافقة" : "تسجيل الرفض"}
            </h3>
            
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg mb-4 text-xs space-y-1">
              <div><span className="text-slate-400">المريض:</span> {selectedAuth.patient.fullName}</div>
              <div><span className="text-slate-400">الشركة:</span> {selectedAuth.policy.provider.name}</div>
              {selectedAuth.requestedAmount && <div><span className="text-slate-400">المبلغ المطلوب:</span> {selectedAuth.requestedAmount}</div>}
            </div>

            {actionType === "APPROVED" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">رقم الموافقة الممنوح (Auth Code) <span className="text-rose-500">*</span></label>
                  <input
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="مثال: AUTH-987654321"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 outline-none font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">المبلغ الموافق عليه (اختياري)</label>
                    <input
                      type="number"
                      value={approvedAmount}
                      onChange={(e) => setApprovedAmount(e.target.value)}
                      placeholder="اختياري"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">تاريخ الانتهاء</label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 outline-none [&::-webkit-calendar-picker-indicator]:invert"
                    />
                  </div>
                </div>
              </div>
            )}

            {actionType === "REJECTED" && (
              <p className="text-sm text-slate-300">
                سيتم تحديث حالة الطلب إلى "مرفوض". يمكنك إضافة ملاحظة إضافية للسبب من واجهة الملاحظات لاحقاً إذا احتجت لذلك. هل أنت متأكد من الرفض؟
              </p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowActionModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl">إلغاء</button>
              <button 
                onClick={handleActionSubmit} 
                className={`px-6 py-2 text-white text-sm font-bold rounded-xl shadow-lg transition ${
                  actionType === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
                }`}
              >
                {actionType === "APPROVED" ? "تأكيد الموافقة" : "تأكيد الرفض"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
