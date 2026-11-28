// src/pages/PatientsPage.tsx

import { useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Patient, PatientLite, GlobalPatientSearchResult } from "@/types";
import { toast } from "sonner";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { DatePicker } from "@/components/ui/date-picker";
import { MpiSearchModal } from "@/components/patients/MpiSearchModal";
import { PatientGovernanceDialog } from "@/components/patients/PatientGovernanceDialog";
import {
  ClipboardList,
  FileSignature,
  FileText,
  Globe,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import {
  SarayaKpiCard,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "@/components/ui/SarayaPrimitives";

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
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- Filter/Search State ---
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 15;

  // --- Modal & Form State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [mpiModalOpen, setMpiModalOpen] = useState(false);
  const [governancePatient, setGovernancePatient] = useState<Patient | null>(
    null,
  );
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

  // MPI: Global Patient Search State
  const [globalMatch, setGlobalMatch] = useState<GlobalPatientSearchResult | null>(null);
  const [searchingGlobal, setSearchingGlobal] = useState(false);

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
          ? t("patients.successUpdate")
          : t("patients.successAdd"),
      );
      setModalOpen(false);
    },
     
    onError: (err: any) => {
      toast.error(err.response?.data?.message || t("patients.failedSave"));
    },
  });

  // 4. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/patients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success(t("patients.successArchive"));
    },
    onError: () => {
      toast.error(t("patients.failedArchive"));
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
    setGlobalMatch(null);
  };

  // MPI: Search National Network when nationalId loses focus
  const handleNationalIdBlur = async () => {
    const nid = formData.nationalId.trim();
    if (!nid || nid.length < 5 || editingPatient) return;
    setSearchingGlobal(true);
    try {
      const res = await apiClient.get<GlobalPatientSearchResult>("/patients/search-global", { params: { query: nid } });
      setGlobalMatch(res.data);
      if (res.data.found && res.data.patient) {
        // Auto-fill from national record
        const gp = res.data.patient;
        setFormData(prev => ({
          ...prev,
          fullName: prev.fullName || gp.fullName,
          dateOfBirth: prev.dateOfBirth || (gp.dateOfBirth ? gp.dateOfBirth.split("T")[0] : ""),
          gender: prev.gender || gp.gender,
          identityType: prev.identityType || gp.identityType || "PERSONAL_ID",
        }));
        toast.info(t("patients.mpi.foundInNational", "✨ تم العثور على المريض في الشبكة الوطنية: {{name}}", { name: gp.fullName }));
      }
    } catch {
      // Silent fail - network search is optional
    } finally {
      setSearchingGlobal(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName) return toast.error(t("patients.nameRequired"));

    const payload = {
      ...formData,
      insurancePolicyId: formData.insurancePolicyId
        ? Number(formData.insurancePolicyId)
        : null,
    };

    saveMutation.mutate(payload);
  };

  const handleSoftDelete = async (p: Patient) => {
    if (!confirm(`${t("patients.confirmArchive")} "${p.fullName}"${isRtl ? "؟" : "?"}`)) return;
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
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <SarayaPageHeader
        title={t("patients.title")}
        subtitle={t("patients.subTitle")}
        icon={<Users className="w-6 h-6" />}
        actions={
          <>
            <button
              type="button"
              onClick={() => setMpiModalOpen(true)}
              className="px-4 py-2 bg-violet-600/15 border border-violet-500/40 hover:bg-violet-600/30 text-violet-400 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              {t("patients.mpiSearch")}
            </button>
            <button
              type="button"
              onClick={() => openModal()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t("patients.addNew")}
            </button>
          </>
        }
      />

      {/* Search & Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 items-stretch">
        <div className="xl:col-span-2 relative flex items-center">
          <Search
            className={`w-4 h-4 text-slate-400 absolute ${isRtl ? "right-3.5" : "left-3.5"}`}
          />
          <input
            className={`w-full bg-slate-900/80 border border-slate-800 rounded-xl ${isRtl ? "pr-10 pl-4" : "pl-10 pr-4"} py-2.5 text-sm focus:border-sky-500 outline-none transition-all placeholder:text-slate-500 shadow-sm`}
            placeholder={t("patients.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <SarayaKpiCard
          label={t("patients.statsTotal")}
          value={meta?.totalCount ?? 0}
          accent="sky"
          ltrValue
          icon={<Users className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("patients.statsResults")}
          value={patients.length}
          accent="emerald"
          ltrValue
          icon={<UserCheck className="w-5 h-5" />}
        />
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm">
        <div className="overflow-x-auto custom-scrollbar flex-1">
          <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
            <thead className="bg-slate-950/70 text-slate-400 sticky top-0 backdrop-blur z-10">
              <tr className="text-xs border-b border-slate-800">
                <th className="px-4 py-3 font-bold">{t("patients.tableNo")}</th>
                <th className="px-4 py-3 font-bold">{t("patients.tableName")}</th>
                <th className="px-4 py-3 font-bold text-center">
                  {t("patients.tableAgeGender")}
                </th>
                <th className="px-4 py-3 font-bold">{t("patients.tableInsurance")}</th>
                <th className="px-4 py-3 font-bold">{t("patients.tableStatus")}</th>
                <th className="px-4 py-3 font-bold text-center">{t("patients.tableActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (
                patients.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <SarayaLtrBadge className="px-2 py-0.5 rounded-md bg-slate-800 text-sky-400 border border-slate-700 text-xs font-bold">
                        {p.mrn}
                      </SarayaLtrBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100 text-sm">
                        {p.fullName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <span>{t("patients.phoneLabel")}</span>
                          <span dir="ltr" className="font-mono tabular-nums">
                            {p.phone || "—"}
                          </span>
                        </span>
                        {p.globalPatient && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-bold border border-violet-500/30">
                            <Globe className="w-2.5 h-2.5" /> MPI
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-slate-200 text-xs font-semibold tabular-nums">
                          {calculateAge(p.dateOfBirth)} {t("patients.years")}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            p.gender === "MALE"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          }`}
                        >
                          {p.gender === "MALE" ? t("patients.genderMale") : t("patients.genderFemale")}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.insurancePolicy ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-emerald-400 font-bold">
                            {p.insurancePolicy.provider.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {p.insurancePolicy.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">{t("patients.cash")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          p.isActive
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${p.isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`}
                        />
                        {p.isActive ? t("patients.statusActive") : t("patients.statusArchived")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/encounters?patientId=${p.id}`)
                          }
                          className="p-2 bg-slate-800 hover:bg-sky-600/20 text-sky-400 rounded-lg transition-colors border border-slate-700 cursor-pointer"
                          title={t("patients.tooltips.medicalRecord")}
                        >
                          <FileText className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openModal(p)}
                          className="p-2 bg-slate-800 hover:bg-amber-600/20 text-amber-400 rounded-lg transition-colors border border-slate-700 cursor-pointer"
                          title={t("patients.tooltips.edit")}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/patients/${p.id}/statement`)
                          }
                          className="p-2 bg-slate-800 hover:bg-emerald-600/20 text-emerald-400 rounded-lg transition-colors border border-slate-700 cursor-pointer"
                          title={t("patients.tooltips.statement")}
                        >
                          <Receipt className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/patients/${p.id}/chart`)
                          }
                          className="p-2 bg-slate-800 hover:bg-sky-600/20 text-sky-400 rounded-lg transition-colors border border-slate-700 cursor-pointer"
                          title={t("patients.tooltips.emr")}
                        >
                          <ClipboardList className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/patients/${p.id}/consents`)
                          }
                          className="p-2 bg-slate-800 hover:bg-rose-600/20 text-rose-400 rounded-lg transition-colors border border-slate-700 cursor-pointer"
                          title={t("patients.tooltips.consents")}
                        >
                          <FileSignature className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setGovernancePatient(p)}
                          className="p-2 bg-slate-800 hover:bg-amber-600/20 text-amber-400 rounded-lg transition-colors border border-slate-700 cursor-pointer"
                          title={t(
                            "patients.tooltips.governance",
                            "حوكمة الملف (دمج / وفاة)",
                          )}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSoftDelete(p)}
                          className="p-2 bg-slate-800 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors border border-slate-700 cursor-pointer"
                          title={t("patients.tooltips.archive")}
                        >
                          <Trash2 className="w-4 h-4" />
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
        <div className="bg-slate-950/80 border-t border-slate-800 px-5 py-3 flex justify-between items-center text-xs">
          <div className="text-slate-500">
            {t("patients.paginationPage")} {page} {t("patients.paginationOf")} {meta?.totalPages || 1}
          </div>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg disabled:opacity-20"
            >
              {t("patients.prev")}
            </button>
            <button
              disabled={page >= (meta?.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg disabled:opacity-20"
            >
              {t("patients.next")}
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
                {editingPatient ? t("patients.editPatientTitle") : t("patients.newPatientTitle")}
              </h2>
              <button onClick={() => setModalOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-lg">✕</button>
            </div>

            {/* Modal Body - Scrollable */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">

              {/* === القسم 1: البيانات الأساسية === */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-sky-400 flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <span>👤</span> {t("patients.basicInfo")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.fullName")} *</label>
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
                    <label className="text-slate-400 text-xs font-medium">{t("patients.nationalId")}</label>
                    <input
                      name="nationalId"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.nationalId}
                      onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                      onBlur={handleNationalIdBlur}
                      placeholder={t("patients.nationalIdPlaceholder")}
                    />
                    {searchingGlobal && (
                      <p className="text-[10px] text-sky-400 mt-1 animate-pulse">{t("patients.searchingNational")}</p>
                    )}
                    {globalMatch?.found && (
                      <p className="text-[10px] text-violet-400 mt-1 font-bold">{t("patients.foundNational")} {globalMatch.patient?.fullName}</p>
                    )}
                    {globalMatch && !globalMatch.found && (
                      <p className="text-[10px] text-slate-500 mt-1">{t("patients.noNationalRecord")}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.dob")}</label>
                    <DatePicker
                      date={formData.dateOfBirth ? new Date(formData.dateOfBirth) : undefined}
                      onChange={(d) => setFormData({ ...formData, dateOfBirth: d ? d.toISOString().slice(0, 10) : "" })}
                      className="bg-slate-900 border-slate-700 h-[46px] px-3 w-full rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.gender")}</label>
                    <select
                      name="gender"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.gender || ""}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                    >
                      <option value="MALE">{t("patients.genderMale")}</option>
                      <option value="FEMALE">{t("patients.genderFemale")}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.maritalStatus")}</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.maritalStatus}
                      onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })}
                    >
                      <option value="SINGLE">{t("patients.single")}</option>
                      <option value="MARRIED">{t("patients.married")}</option>
                      <option value="DIVORCED">{t("patients.divorced")}</option>
                      <option value="WIDOWED">{t("patients.widowed")}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* === القسم 2: بيانات التواصل === */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <span>📞</span> {t("patients.contactInfo")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.phone")}</label>
                    <input
                      name="phone"
                      type="tel"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.address")}</label>
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
                  <span>🪪</span> {t("patients.documentsIdentity")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.motherName")}</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.motherName}
                      onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.registryNumber")}</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.registryNumber}
                      onChange={(e) => setFormData({ ...formData, registryNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.familyBooklet")}</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.familyBooklet}
                      onChange={(e) => setFormData({ ...formData, familyBooklet: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.familySheet")}</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      value={formData.familySheet}
                      onChange={(e) => setFormData({ ...formData, familySheet: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.identityType")}</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.identityType}
                      onChange={(e) => setFormData({ ...formData, identityType: e.target.value })}
                    >
                      <option value="PERSONAL_ID">{t("patients.personalId")}</option>
                      <option value="PASSPORT">{t("patients.passport")}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.identityNumber")}</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors"
                      placeholder={t("patients.identityNumberPlaceholder")}
                      value={formData.identityNumber}
                      onChange={(e) => setFormData({ ...formData, identityNumber: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* === القسم 4: التأمين الصحي === */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-violet-400 flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <span>🏥</span> {t("patients.insurance")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.insuranceProvider")}</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none"
                      value={formData.insuranceProviderId}
                      onChange={(e) => setFormData({ ...formData, insuranceProviderId: e.target.value, insurancePolicyId: "" })}
                    >
                      <option value="">{t("patients.cashPayment")}</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.insurancePolicy")}</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-colors appearance-none disabled:opacity-50"
                      disabled={!formData.insuranceProviderId}
                      value={formData.insurancePolicyId}
                      onChange={(e) => setFormData({ ...formData, insurancePolicyId: e.target.value })}
                    >
                      <option value="">{t("patients.selectPolicy")}</option>
                      {activePolicies.map((pol) => (
                        <option key={pol.id} value={pol.id}>{pol.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-medium">{t("patients.insuranceMemberId")}</label>
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
                {t("patients.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                onClick={handleSave}
                className="w-full sm:w-auto px-10 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 text-sm transition-colors"
              >
                {saving ? t("patients.saving") : `💾 ${t("patients.saveBtn")}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MPI Search Modal --- */}
      {mpiModalOpen && <MpiSearchModal onClose={() => setMpiModalOpen(false)} />}

      {/* --- Patient Governance Modal (Merge / Unmerge & Death Management) --- */}
      {governancePatient && (
        <PatientGovernanceDialog
          patientId={governancePatient.id}
          patientName={governancePatient.fullName}
          patientMrn={governancePatient.mrn}
          onClose={() => setGovernancePatient(null)}
          onUpdated={() =>
            queryClient.invalidateQueries({ queryKey: ["patients"] })
          }
        />
      )}
    </div>
  );
}
