// src/pages/PatientsPage.tsx

import { useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { Patient, PatientLite } from "@/types";
import { toast } from "sonner";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { DatePicker } from "@/components/ui/date-picker";

// --- Types ---
type Gender = "MALE" | "FEMALE" | "OTHER" | null;

interface InsurancePolicy {
  id: number;
  name: string;
  plan?: { name: string } | null;
}

interface InsuranceProvider {
  id: number;
  name: string;
  policies: InsurancePolicy[];
}

interface PaginationMeta {
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ListResponse {
  items: Patient[];
  meta: PaginationMeta;
}

// --- Helpers ---
const calculateAge = (dob: string | null) => {
  if (!dob) return "—";
  const birthDate = new Date(dob);
  const difference = Date.now() - birthDate.getTime();
  const ageDate = new Date(difference);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

export function PatientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- Filter/Search State ---
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 15;

  // --- Modal & Form State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    nationalId: "",
    dateOfBirth: "",
    gender: "MALE" as Gender,
    motherName: "",
    familyBooklet: "",
    familySheet: "",
    registryNumber: "",
    identityType: "PERSONAL_ID",
    identityNumber: "",
    maritalStatus: "SINGLE",
    phone: "",
    address: "",
    notes: "",
    insuranceProviderId: "",
    insurancePolicyId: "",
    insuranceMemberId: "",
  });

  // 1. Fetch Patients
  const { data: patientsData, isLoading: loadingOptions } = useQuery({
    queryKey: ["patients", page, search],
    queryFn: async () => {
      const res = await apiClient.get<ListResponse>("/patients", {
        params: { page, limit, search: search || undefined },
      });
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  const patients = patientsData?.items || [];
  const meta = patientsData?.meta;
  const loading = loadingOptions; // Alias for compatibility

  // 2. Fetch Providers
  const { data: providers = [] } = useQuery({
    queryKey: ["insuranceProviders"],
    queryFn: async () => {
      const res = await apiClient.get<InsuranceProvider[]>(
        "/insurance/providers",
      );
      return res.data;
    },
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  // 3. Save Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingPatient) {
        await apiClient.patch(`/patients/${editingPatient.id}`, payload);
      } else {
        await apiClient.post("/patients", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success(
        editingPatient
          ? "تم تحديث بيانات المريض بنجاح"
          : "تم تسجيل المريض بنجاح",
      );
      setModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "فشل في حفظ البيانات");
    },
  });

  // 4. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/patients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("تمت الأرشفة بنجاح");
    },
    onError: () => {
      toast.error("فشل في أرشفة السجل");
    },
  });

  // --- Event Handlers ---

  const openModal = (patient: Patient | null = null) => {
    if (patient) {
      // وضع التعديل: تعبئة البيانات الموجودة
      setEditingPatient(patient);
      setFormData({
        fullName: patient.fullName,
        nationalId: patient.nationalId || "",
        dateOfBirth: patient.dateOfBirth
          ? patient.dateOfBirth.split("T")[0]
          : "",
        gender: patient.gender,
        phone: patient.phone || "",
        address: patient.address || "",
        notes: patient.notes || "",
        motherName: patient.motherName || "",
        familyBooklet: patient.familyBooklet || "",
        familySheet: patient.familySheet || "",
        registryNumber: patient.registryNumber || "",
        identityType: patient.identityType || "PERSONAL_ID",
        identityNumber: patient.identityNumber || "", // 👈 الحقل الجديد
        maritalStatus: patient.maritalStatus || "SINGLE",
        insuranceProviderId:
          patient.insurancePolicy?.provider.id.toString() || "",
        insurancePolicyId: patient.insurancePolicyId?.toString() || "",
        insuranceMemberId: patient.insuranceMemberId || "",
      });
    } else {
      // وضع الإضافة: تصفير الحقول
      setEditingPatient(null);
      setFormData({
        fullName: "",
        nationalId: "",
        dateOfBirth: "",
        gender: "MALE",
        phone: "",
        address: "",
        notes: "",
        motherName: "",
        familyBooklet: "",
        familySheet: "",
        registryNumber: "",
        identityType: "PERSONAL_ID",
        identityNumber: "",
        maritalStatus: "SINGLE",
        insuranceProviderId: "",
        insurancePolicyId: "",
        insuranceMemberId: "",
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName) return toast.error("اسم المريض مطلوب");

    const payload = {
      ...formData,
      insurancePolicyId: formData.insurancePolicyId
        ? Number(formData.insurancePolicyId)
        : null,
    };

    saveMutation.mutate(payload);
  };

  const handleSoftDelete = async (p: Patient) => {
    if (!confirm(`هل أنت متأكد من أرشفة سجل المريض "${p.fullName}"؟`)) return;
    deleteMutation.mutate(p.id);
  };

  const saving = saveMutation.isPending;

  // تصفية البوالص بناءً على الشركة المختارة
  const activePolicies = useMemo(() => {
    const provider = providers.find(
      (p) => p.id === Number(formData.insuranceProviderId),
    );
    return provider?.policies || [];
  }, [formData.insuranceProviderId, providers]);

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            سجل المرضى الموحد
          </h1>
          <p className="text-sm text-slate-400">
            إدارة الملفات الطبية الإلكترونية وتتبع حالات التأمين.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
        >
          + تسجيل مريض جديد
        </button>
      </div>

      {/* Search & Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 relative group">
          <span className="absolute inset-y-0 right-4 flex items-center text-slate-500">
            🔍
          </span>
          <input
            className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl pr-12 pl-4 py-3 text-sm focus:border-sky-500 outline-none transition-all placeholder:text-slate-600 shadow-inner"
            placeholder="البحث بالاسم، رقم الملف، الهاتف، أو الرقم الوطني..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-3 flex items-center justify-around text-xs">
          <div className="text-center">
            <div className="text-slate-500">الإجمالي</div>
            <div className="font-bold text-white">{meta?.totalCount ?? 0}</div>
          </div>
          <div className="w-px h-8 bg-slate-800"></div>
          <div className="text-center">
            <div className="text-slate-500">النتائج</div>
            <div className="font-bold text-sky-400">{patients.length}</div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar flex-1">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold">الملف (MRN)</th>
                <th className="px-6 py-4 font-bold">المريض</th>
                <th className="px-6 py-4 font-bold text-center">
                  العمر / الجنس
                </th>
                <th className="px-6 py-4 font-bold">التأمين</th>
                <th className="px-6 py-4 font-bold">الحالة</th>
                <th className="px-6 py-4 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    جارِ التحميل...
                  </td>
                </tr>
              ) : (
                patients.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono text-sky-400 font-bold">
                      {p.mrn}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-100 text-base">
                        {p.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        هاتف: {p.phone || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-slate-200">
                          {calculateAge(p.dateOfBirth)} سنة
                        </span>
                        <span
                          className={`text-[10px] px-1.5 rounded ${p.gender === "MALE" ? "bg-blue-900/30 text-blue-400" : "bg-rose-900/30 text-rose-400"}`}
                        >
                          {p.gender === "MALE" ? "ذكر" : "أنثى"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {p.insurancePolicy ? (
                        <div className="flex flex-col">
                          <span className="text-[11px] text-emerald-400 font-bold">
                            {p.insurancePolicy.provider.name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {p.insurancePolicy.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-[10px]">نقدي</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`flex items-center gap-1.5 text-[10px] font-bold ${p.isActive ? "text-emerald-400" : "text-slate-500"}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${p.isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-700"}`}
                        ></span>
                        {p.isActive ? "نشط" : "مؤرشف"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center gap-2">
                        {/* ✅ إصلاح الرابط هنا باستخدام الـ Backticks */}
                        <button
                          onClick={() =>
                            navigate(`/encounters?patientId=${p.id}`)
                          }
                          className="p-2 bg-slate-800 hover:bg-sky-900/40 text-sky-400 rounded-xl transition-all border border-slate-700"
                          title="الملف الطبي"
                        >
                          📑
                        </button>

                        <button
                          onClick={() => openModal(p)}
                          className="p-2 bg-slate-800 hover:bg-amber-900/40 text-amber-400 rounded-xl transition-all border border-slate-700"
                          title="تعديل"
                        >
                          ✏️
                        </button>

                        <button
                          onClick={() =>
                            navigate(`/patients/${p.id}/statement`)
                          }
                          className="p-2 bg-slate-800 hover:bg-emerald-900/40 text-emerald-400 rounded-xl transition-all border border-slate-700"
                          title="كشف حساب"
                        >
                          💰
                        </button>

                        <button
                          onClick={() =>
                            navigate(`/patients/${p.id}/chart`)
                          }
                          className="p-2 bg-slate-800 hover:bg-sky-900/40 text-sky-400 rounded-xl transition-all border border-slate-700"
                          title="السجل الطبي الشامل (EMR)"
                        >
                          📋
                        </button>

                        <button
                          onClick={() =>
                            navigate(`/patients/${p.id}/consents`)
                          }
                          className="p-2 bg-slate-800 hover:bg-rose-900/40 text-rose-400 rounded-xl transition-all border border-slate-700 font-bold"
                          title="نماذج الموافقة"
                        >
                          ✍️
                        </button>

                        {/* 🗑️ زر الأرشفة  */}
                        <button
                          onClick={() => handleSoftDelete(p)}
                          className="p-2 hover:bg-rose-900/30 text-slate-600 hover:text-rose-400 rounded-xl transition-all border hover:border-rose-900/50"
                          title="أرشفة"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-4 flex justify-between items-center text-xs">
          <div className="text-slate-500">
            صفحة {page} من {meta?.totalPages || 1}
          </div>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg disabled:opacity-20"
            >
              السابق
            </button>
            <button
              disabled={page >= (meta?.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg disabled:opacity-20"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      {/* --- Patient Modal (Add/Edit) --- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div
            className="bg-slate-950 border border-slate-700 w-full md:max-w-2xl md:rounded-3xl rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200 max-h-[95vh] md:max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header - Fixed */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
              <h2 className="text-lg md:text-xl font-bold text-white">
                {editingPatient ? "✏️ تعديل بيانات المريض" : "➕ تسجيل مريض جديد"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-lg">✕</button>
            </div>

            {/* Modal Body - Scrollable */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">

              {/* === القسم 1: البيانات الأساسية === */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-sky-400 flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <span>👤</span> البيانات الأساسية
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-slate-400 text-xs font-medium">الاسم الكامل *</label>
                    <input
                      name="fullName"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">الرقم الوطني</label>
                    <input
                      name="nationalId"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.nationalId}
                      onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">تاريخ الميلاد</label>
                    <DatePicker
                      date={formData.dateOfBirth ? new Date(formData.dateOfBirth) : undefined}
                      onChange={(d) => setFormData({ ...formData, dateOfBirth: d ? d.toISOString().slice(0, 10) : "" })}
                      className="bg-slate-900 border-slate-700 h-[46px] px-3 w-full rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">الجنس</label>
                    <select
                      name="gender"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.gender || ""}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                    >
                      <option value="MALE">ذكر</option>
                      <option value="FEMALE">أنثى</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">الحالة الاجتماعية</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.maritalStatus}
                      onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })}
                    >
                      <option value="SINGLE">أعزب / عزباء</option>
                      <option value="MARRIED">متزوج / ة</option>
                      <option value="DIVORCED">مطلق / ة</option>
                      <option value="WIDOWED">أرمل / ة</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* === القسم 2: بيانات التواصل === */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <span>📞</span> بيانات التواصل
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">رقم الهاتف</label>
                    <input
                      name="phone"
                      type="tel"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">العنوان</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* === القسم 3: الوثائق والهوية === */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <span>🪪</span> الوثائق والهوية
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">إسم الأم</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.motherName}
                      onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">رقم القيد</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.registryNumber}
                      onChange={(e) => setFormData({ ...formData, registryNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">رقم كتيب العائلة</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.familyBooklet}
                      onChange={(e) => setFormData({ ...formData, familyBooklet: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">رقم ورقة العائلة</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.familySheet}
                      onChange={(e) => setFormData({ ...formData, familySheet: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">نوع الهوية</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.identityType}
                      onChange={(e) => setFormData({ ...formData, identityType: e.target.value })}
                    >
                      <option value="PERSONAL_ID">بطاقة شخصية</option>
                      <option value="PASSPORT">جواز سفر</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">رقم الهوية</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      placeholder="أدخل رقم البطاقة أو الجواز"
                      value={formData.identityNumber}
                      onChange={(e) => setFormData({ ...formData, identityNumber: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* === القسم 4: التأمين الصحي === */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-violet-400 flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <span>🏥</span> التأمين الصحي
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-slate-400 text-xs font-medium">شركة التأمين</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.insuranceProviderId}
                      onChange={(e) => setFormData({ ...formData, insuranceProviderId: e.target.value, insurancePolicyId: "" })}
                    >
                      <option value="">-- دفع نقدي --</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">العقد / البوليصة</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none disabled:opacity-50"
                      disabled={!formData.insuranceProviderId}
                      value={formData.insurancePolicyId}
                      onChange={(e) => setFormData({ ...formData, insurancePolicyId: e.target.value })}
                    >
                      <option value="">-- اختر العقد --</option>
                      {activePolicies.map((pol) => (
                        <option key={pol.id} value={pol.id}>{pol.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">رقم بطاقة التأمين</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors disabled:opacity-50"
                      disabled={!formData.insuranceProviderId}
                      value={formData.insuranceMemberId}
                      onChange={(e) => setFormData({ ...formData, insuranceMemberId: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* Modal Footer - Fixed */}
            <div className="px-5 py-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-3 flex-shrink-0 bg-slate-950">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                onClick={handleSave}
                className="w-full sm:w-auto px-10 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 text-sm transition-colors"
              >
                {saving ? "جارِ الحفظ..." : "💾 حفظ البيانات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
