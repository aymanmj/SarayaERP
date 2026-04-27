import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Database,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import { clinicalServices } from "../../../api/clinicalServices";
import { apiClient } from "../../../api/apiClient";

type RegistryFormState = {
  name: string;
  description: string;
  isActive: boolean;
  criteria: Array<{
    type: string;
    operator: string;
    value: string;
  }>;
  careGapRules: Array<{
    id?: number;
    name: string;
    description: string;
    targetType: string;
    targetValue: string;
    frequencyDays: number;
    isActive: boolean;
  }>;
};

const createEmptyRegistryForm = (): RegistryFormState => ({
  name: "",
  description: "",
  isActive: true,
  criteria: [{ type: "DIAGNOSIS", operator: "EQUALS", value: "" }],
  careGapRules: [
    {
      name: "",
      description: "",
      targetType: "LAB_TEST",
      targetValue: "",
      frequencyDays: 180,
      isActive: true,
    },
  ],
});

export default function RegistriesDashboard() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [activePatientId, setActivePatientId] = useState<number | null>(null);
  const [foundPatient, setFoundPatient] = useState<any>(null);
  const [selectedGap, setSelectedGap] = useState<any>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRegistryId, setSelectedRegistryId] = useState<number | null>(null);
  const [showRegistryModal, setShowRegistryModal] = useState(false);
  const [editingRegistryId, setEditingRegistryId] = useState<number | null>(null);
  const [registryForm, setRegistryForm] = useState<RegistryFormState>(
    createEmptyRegistryForm(),
  );

  const { data: registries = [] } = useQuery({
    queryKey: ["clinical-registries"],
    queryFn: () => clinicalServices.getRegistries(),
  });

  useEffect(() => {
    if (!selectedRegistryId && registries.length > 0) {
      setSelectedRegistryId(registries[0].id);
    }
  }, [registries, selectedRegistryId]);

  const { data: selectedRegistry } = useQuery({
    queryKey: ["clinical-registry", selectedRegistryId],
    queryFn: () => clinicalServices.getRegistry(selectedRegistryId!),
    enabled: !!selectedRegistryId,
  });

  const { data: selectedRegistryAnalytics } = useQuery({
    queryKey: ["clinical-registry-analytics", selectedRegistryId],
    queryFn: () => clinicalServices.getRegistryAnalytics(selectedRegistryId!),
    enabled: !!selectedRegistryId,
  });

  const triggerMembershipMutation = useMutation({
    mutationFn: clinicalServices.triggerMembershipEval,
    onSuccess: (data) =>
      toast.success(`تم تقييم ${data.evaluated} مريض وإضافة ${data.added} مريض للسجلات`),
    onError: () => toast.error("فشل تشغيل تقييم السجلات"),
  });

  const triggerGapsMutation = useMutation({
    mutationFn: clinicalServices.triggerGapsEval,
    onSuccess: (data) =>
      toast.success(`تم تقييم ${data.evaluated} فجوة واكتشاف ${data.opened} فجوة رعاية جديدة`),
    onError: () => toast.error("فشل تشغيل تقييم الفجوات"),
  });

  const createRegistryMutation = useMutation({
    mutationFn: (payload: RegistryFormState) => clinicalServices.createRegistry(payload),
    onSuccess: () => {
      toast.success("تم إنشاء السجل وقواعده بنجاح.");
      setShowRegistryModal(false);
      setEditingRegistryId(null);
      setRegistryForm(createEmptyRegistryForm());
      queryClient.invalidateQueries({ queryKey: ["clinical-registries"] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || "فشل إنشاء السجل."),
  });

  const updateRegistryMutation = useMutation({
    mutationFn: (payload: RegistryFormState) =>
      clinicalServices.updateRegistry(editingRegistryId!, payload),
    onSuccess: () => {
      toast.success("تم تحديث السجل وقواعده.");
      setShowRegistryModal(false);
      queryClient.invalidateQueries({ queryKey: ["clinical-registries"] });
      queryClient.invalidateQueries({
        queryKey: ["clinical-registry", editingRegistryId],
      });
      queryClient.invalidateQueries({
        queryKey: ["clinical-registry-analytics", editingRegistryId],
      });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || "فشل تحديث السجل."),
  });

  const openCreateRegistryModal = () => {
    setEditingRegistryId(null);
    setRegistryForm(createEmptyRegistryForm());
    setShowRegistryModal(true);
  };

  const openEditRegistryModal = () => {
    if (!selectedRegistry) return;
    setEditingRegistryId(selectedRegistry.id);
    setRegistryForm({
      name: selectedRegistry.name || "",
      description: selectedRegistry.description || "",
      isActive: selectedRegistry.isActive ?? true,
      criteria:
        selectedRegistry.criteria?.length > 0
          ? selectedRegistry.criteria.map((criteria: any) => ({
              type: criteria.type || "DIAGNOSIS",
              operator: criteria.operator || "EQUALS",
              value: criteria.value || "",
            }))
          : createEmptyRegistryForm().criteria,
      careGapRules:
        selectedRegistry.careGapRules?.length > 0
          ? selectedRegistry.careGapRules.map((rule: any) => ({
              id: rule.id,
              name: rule.name || "",
              description: rule.description || "",
              targetType: rule.targetType || "LAB_TEST",
              targetValue: rule.targetValue || "",
              frequencyDays: Number(rule.frequencyDays) || 180,
              isActive: rule.isActive ?? true,
            }))
          : createEmptyRegistryForm().careGapRules,
    });
    setShowRegistryModal(true);
  };

  const handleRegistryFormSubmit = () => {
    const normalizedPayload: RegistryFormState = {
      ...registryForm,
      name: registryForm.name.trim(),
      description: registryForm.description.trim(),
      criteria: registryForm.criteria
        .map((criteria) => ({
          ...criteria,
          type: criteria.type.trim(),
          operator: criteria.operator.trim(),
          value: criteria.value.trim(),
        }))
        .filter((criteria) => criteria.type && criteria.operator && criteria.value),
      careGapRules: registryForm.careGapRules
        .map((rule) => ({
          ...rule,
          name: rule.name.trim(),
          description: rule.description.trim(),
          targetType: rule.targetType.trim(),
          targetValue: rule.targetValue.trim(),
          frequencyDays: Number(rule.frequencyDays) || 0,
        }))
        .filter(
          (rule) =>
            rule.name &&
            rule.targetType &&
            rule.targetValue &&
            Number(rule.frequencyDays) > 0,
        ),
    };

    if (!normalizedPayload.name) {
      toast.warning("يرجى إدخال اسم السجل.");
      return;
    }

    if (normalizedPayload.criteria.length === 0) {
      toast.warning("يجب تعريف معيار واحد على الأقل.");
      return;
    }

    if (normalizedPayload.careGapRules.length === 0) {
      toast.warning("يجب تعريف قاعدة فجوة رعاية واحدة على الأقل.");
      return;
    }

    if (editingRegistryId) {
      updateRegistryMutation.mutate(normalizedPayload);
      return;
    }

    createRegistryMutation.mutate(normalizedPayload);
  };

  const updateCriteriaField = (
    index: number,
    field: "type" | "operator" | "value",
    value: string,
  ) => {
    setRegistryForm((prev) => ({
      ...prev,
      criteria: prev.criteria.map((criteria, criteriaIndex) =>
        criteriaIndex === index ? { ...criteria, [field]: value } : criteria,
      ),
    }));
  };

  const updateRuleField = (
    index: number,
    field:
      | "name"
      | "description"
      | "targetType"
      | "targetValue"
      | "frequencyDays"
      | "isActive",
    value: string | number | boolean,
  ) => {
    setRegistryForm((prev) => ({
      ...prev,
      careGapRules: prev.careGapRules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, [field]: value } : rule,
      ),
    }));
  };

  const searchPatient = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiClient.get(
        `/patients/search?query=${encodeURIComponent(searchQuery)}`,
      );
      if (res.data.length > 0) {
        const patient = res.data[0];
        setFoundPatient(patient);
        setActivePatientId(patient.id);
        toast.success("تم العثور على المريض");
      } else {
        toast.error("لم يتم العثور على المريض");
        setFoundPatient(null);
        setActivePatientId(null);
      }
    } catch {
      toast.error("خطأ في البحث");
      setFoundPatient(null);
      setActivePatientId(null);
    } finally {
      setIsSearching(false);
    }
  };

  const { data: careGaps = [], isLoading: loadingGaps, refetch: refetchGaps } = useQuery({
    queryKey: ["patient-care-gaps", activePatientId],
    queryFn: () => clinicalServices.getPatientCareGaps(activePatientId!),
    enabled: !!activePatientId,
  });

  const closeGapMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGap) return;
      await clinicalServices.closeCareGap(selectedGap.id, closeNotes);
    },
    onSuccess: () => {
      toast.success("تم إغلاق فجوة الرعاية بنجاح.");
      setSelectedGap(null);
      setCloseNotes("");
      refetchGaps();
    },
    onError: () => toast.error("فشل إغلاق فجوة الرعاية."),
  });

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <ShieldAlert className="w-6 h-6" />
            </div>
            لوحة السجلات وفجوات الرعاية
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إدارة السجلات المرضية، معايير الانضمام، وقواعد فجوات الرعاية من مكان واحد.
          </p>
        </div>
        <div className="relative z-10 flex gap-2 flex-wrap">
          <button
            onClick={openCreateRegistryModal}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> سجل جديد
          </button>
          <button
            onClick={() => triggerMembershipMutation.mutate()}
            disabled={triggerMembershipMutation.isPending}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-bold transition-colors border border-slate-700 disabled:opacity-50"
          >
            <Users className="w-4 h-4 text-sky-400" />
            تحديث السجلات
          </button>
          <button
            onClick={() => triggerGapsMutation.mutate()}
            disabled={triggerGapsMutation.isPending}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-bold transition-colors border border-slate-700 disabled:opacity-50"
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            تقييم الفجوات
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
        <div className="w-full lg:w-[34%] flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-1">
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" /> السجلات المعرفة
              </h3>
              {selectedRegistry && (
                <button
                  onClick={openEditRegistryModal}
                  className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" /> تعديل
                </button>
              )}
            </div>
            <div className="space-y-3">
              {registries.length === 0 ? (
                <div className="text-sm text-slate-500 border border-dashed border-slate-700 rounded-xl p-4">
                  لا توجد سجلات معرفة بعد. ابدأ بإنشاء سجل جديد.
                </div>
              ) : (
                registries.map((registry: any) => (
                  <button
                    key={registry.id}
                    onClick={() => setSelectedRegistryId(registry.id)}
                    className={`w-full text-right p-4 rounded-xl border transition-all ${
                      selectedRegistryId === registry.id
                        ? "bg-emerald-600/15 border-emerald-500/40"
                        : "bg-slate-950 border-slate-800 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-200">{registry.name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {registry.description || "بدون وصف"}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                          registry.isActive
                            ? "bg-emerald-900/30 text-emerald-400"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {registry.isActive ? "نشط" : "متوقف"}
                      </span>
                    </div>
                    <div className="mt-3 text-[11px] text-slate-500 flex gap-3">
                      <span>{registry.criteria?.length || 0} معيار</span>
                      <span>{registry.careGapRules?.length || 0} قاعدة</span>
                      <span>{registry._count?.members || 0} عضو</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-slate-400" /> بحث عن مريض
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="الاسم، رقم الملف، أو الهاتف..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchPatient()}
              />
              <button
                onClick={searchPatient}
                disabled={isSearching}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold transition-colors disabled:opacity-50"
              >
                {isSearching ? "جاري البحث..." : "بحث"}
              </button>
            </div>
            {foundPatient && (
              <div className="bg-sky-900/10 border border-sky-500/30 rounded-xl p-3 text-sm flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">{foundPatient.fullName}</div>
                  <div className="text-xs text-sky-300 mt-1">MRN: {foundPatient.mrn}</div>
                </div>
                <div className="text-xs bg-slate-800 px-2 py-1 rounded">المريض محدد</div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-[66%] bg-slate-900/40 border border-slate-800 rounded-2xl p-5 overflow-y-auto custom-scrollbar relative space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-emerald-400" />
                {selectedRegistry ? selectedRegistry.name : "تفاصيل السجل"}
              </h2>
              {selectedRegistryAnalytics && (
                <div className="flex gap-3 text-xs">
                  <span className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                    الأعضاء:{" "}
                    <span className="text-sky-400 font-bold">
                      {selectedRegistryAnalytics.totalMembers}
                    </span>
                  </span>
                  <span className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                    الفجوات المفتوحة:{" "}
                    <span className="text-rose-400 font-bold">
                      {selectedRegistryAnalytics.openGaps}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {!selectedRegistry ? (
              <div className="text-sm text-slate-500 border border-dashed border-slate-700 rounded-xl p-5">
                اختر سجلًا من القائمة لعرض معاييره وقواعد فجوات الرعاية الخاصة به.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="text-sm text-slate-400 mb-2">الوصف</div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200">
                    {selectedRegistry.description || "لا يوجد وصف لهذا السجل."}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <h3 className="font-bold text-slate-200 mb-3">معايير الانضمام</h3>
                    <div className="space-y-3">
                      {selectedRegistry.criteria?.length > 0 ? (
                        selectedRegistry.criteria.map((criteria: any) => (
                          <div
                            key={criteria.id}
                            className="border border-slate-800 rounded-lg p-3 text-sm"
                          >
                            <div className="text-emerald-400 font-bold">{criteria.type}</div>
                            <div className="text-slate-400 mt-1">
                              {criteria.operator} - {criteria.value}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500">
                          لا توجد معايير معرفة.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <h3 className="font-bold text-slate-200 mb-3">قواعد فجوات الرعاية</h3>
                    <div className="space-y-3">
                      {selectedRegistry.careGapRules?.length > 0 ? (
                        selectedRegistry.careGapRules.map((rule: any) => (
                          <div
                            key={rule.id}
                            className="border border-slate-800 rounded-lg p-3 text-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-bold text-slate-200">{rule.name}</div>
                              <span
                                className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                                  rule.isActive
                                    ? "bg-emerald-900/30 text-emerald-400"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {rule.isActive ? "نشطة" : "متوقفة"}
                              </span>
                            </div>
                            <div className="text-slate-400 mt-1">
                              {rule.description || "بدون وصف"}
                            </div>
                            <div className="text-xs text-slate-500 mt-2">
                              {rule.targetType} / {rule.targetValue} / كل {rule.frequencyDays} يوم
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500">
                          لا توجد قواعد فجوات معرفة.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
              فجوات الرعاية للمريض {activePatientId ? `#${activePatientId}` : ""}
            </h2>

            {!activePatientId ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                <Search className="w-16 h-16 text-slate-600 mb-4 opacity-50" />
                <p>يرجى البحث عن مريض لعرض فجوات الرعاية الخاصة به.</p>
              </div>
            ) : loadingGaps ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin mb-4"></div>
                <p className="animate-pulse">جاري التحميل...</p>
              </div>
            ) : careGaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-emerald-900/10 rounded-xl border border-dashed border-emerald-900/30">
                <CheckCircle2 className="w-16 h-16 text-emerald-600 mb-4 opacity-50" />
                <p className="text-emerald-400 font-bold">
                  لا توجد فجوات رعاية مفتوحة لهذا المريض.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {careGaps.map((gap: any) => (
                  <div
                    key={gap.id}
                    className={`bg-slate-900 border ${
                      gap.status === "OPEN"
                        ? "border-rose-500/50"
                        : "border-emerald-500/50"
                    } rounded-2xl p-5 shadow-sm`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            gap.status === "OPEN"
                              ? "bg-rose-500/20 text-rose-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}
                        >
                          {gap.status === "OPEN" ? (
                            <XCircle className="w-5 h-5" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-200">
                            {gap.rule?.name || "فجوة رعاية"}
                          </h3>
                          <div className="text-xs text-slate-400 mt-1 max-w-md">
                            {gap.rule?.description ||
                              "لم يتم استيفاء المتطلبات السريرية لهذه القاعدة."}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                          gap.status === "OPEN"
                            ? "bg-rose-900/30 text-rose-400"
                            : "bg-emerald-900/30 text-emerald-400"
                        }`}
                      >
                        {gap.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mb-4">
                      تاريخ الاكتشاف:{" "}
                      {new Date(gap.createdAt || gap.identifiedAt).toLocaleDateString(
                        "ar-LY",
                      )}
                    </div>

                    {gap.status === "OPEN" && (
                      <div className="flex justify-end pt-3 border-t border-slate-800">
                        <button
                          onClick={() => setSelectedGap(gap)}
                          className="bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors border border-slate-700 hover:border-emerald-500"
                        >
                          معالجة الفجوة وإغلاقها
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showRegistryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl w-full max-w-4xl overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-emerald-400">
                {editingRegistryId ? "تعديل السجل" : "إنشاء سجل جديد"}
              </h3>
              <button
                onClick={() => setShowRegistryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    اسم السجل
                  </label>
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                    value={registryForm.name}
                    onChange={(e) =>
                      setRegistryForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={registryForm.isActive}
                      onChange={(e) =>
                        setRegistryForm((prev) => ({
                          ...prev,
                          isActive: e.target.checked,
                        }))
                      }
                    />
                    السجل نشط
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  الوصف
                </label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none min-h-[90px]"
                  value={registryForm.description}
                  onChange={(e) =>
                    setRegistryForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200">معايير الانضمام</h4>
                  <button
                    onClick={() =>
                      setRegistryForm((prev) => ({
                        ...prev,
                        criteria: [
                          ...prev.criteria,
                          { type: "DIAGNOSIS", operator: "EQUALS", value: "" },
                        ],
                      }))
                    }
                    className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> معيار
                  </button>
                </div>
                {registryForm.criteria.map((criteria, index) => (
                  <div
                    key={`criteria-${index}`}
                    className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.5fr_auto] gap-3 items-start bg-slate-950 border border-slate-800 rounded-xl p-4"
                  >
                    <input
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                      placeholder="النوع"
                      value={criteria.type}
                      onChange={(e) =>
                        updateCriteriaField(index, "type", e.target.value)
                      }
                    />
                    <input
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                      placeholder="المعامل"
                      value={criteria.operator}
                      onChange={(e) =>
                        updateCriteriaField(index, "operator", e.target.value)
                      }
                    />
                    <input
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                      placeholder="القيمة"
                      value={criteria.value}
                      onChange={(e) =>
                        updateCriteriaField(index, "value", e.target.value)
                      }
                    />
                    <button
                      onClick={() =>
                        setRegistryForm((prev) => ({
                          ...prev,
                          criteria:
                            prev.criteria.length === 1
                              ? prev.criteria
                              : prev.criteria.filter((_, i) => i !== index),
                        }))
                      }
                      className="text-rose-400 hover:text-rose-300 text-xs py-2"
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200">قواعد فجوات الرعاية</h4>
                  <button
                    onClick={() =>
                      setRegistryForm((prev) => ({
                        ...prev,
                        careGapRules: [
                          ...prev.careGapRules,
                          {
                            name: "",
                            description: "",
                            targetType: "LAB_TEST",
                            targetValue: "",
                            frequencyDays: 180,
                            isActive: true,
                          },
                        ],
                      }))
                    }
                    className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> قاعدة
                  </button>
                </div>
                {registryForm.careGapRules.map((rule, index) => (
                  <div
                    key={`rule-${rule.id ?? index}`}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                        placeholder="اسم القاعدة"
                        value={rule.name}
                        onChange={(e) =>
                          updateRuleField(index, "name", e.target.value)
                        }
                      />
                      <input
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                        placeholder="نوع الهدف"
                        value={rule.targetType}
                        onChange={(e) =>
                          updateRuleField(index, "targetType", e.target.value)
                        }
                      />
                      <input
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                        placeholder="القيمة المستهدفة"
                        value={rule.targetValue}
                        onChange={(e) =>
                          updateRuleField(index, "targetValue", e.target.value)
                        }
                      />
                      <input
                        type="number"
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                        placeholder="عدد الأيام"
                        value={rule.frequencyDays}
                        onChange={(e) =>
                          updateRuleField(index, "frequencyDays", Number(e.target.value))
                        }
                      />
                    </div>
                    <textarea
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm min-h-[70px]"
                      placeholder="وصف القاعدة"
                      value={rule.description}
                      onChange={(e) =>
                        updateRuleField(index, "description", e.target.value)
                      }
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={rule.isActive}
                          onChange={(e) =>
                            updateRuleField(index, "isActive", e.target.checked)
                          }
                        />
                        القاعدة نشطة
                      </label>
                      <button
                        onClick={() =>
                          setRegistryForm((prev) => ({
                            ...prev,
                            careGapRules:
                              prev.careGapRules.length === 1
                                ? prev.careGapRules
                                : prev.careGapRules.filter((_, i) => i !== index),
                          }))
                        }
                        className="text-rose-400 hover:text-rose-300 text-xs"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setShowRegistryModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleRegistryFormSubmit}
                disabled={
                  createRegistryMutation.isPending || updateRegistryMutation.isPending
                }
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm shadow-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedGap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-emerald-400">إغلاق فجوة الرعاية</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-4">
                القاعدة:{" "}
                <span className="font-bold text-slate-200">{selectedGap.rule?.name}</span>
              </p>
              <textarea
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none min-h-[100px]"
                placeholder="أدخل سبب إغلاق الفجوة..."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              ></textarea>
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setSelectedGap(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={() => closeGapMutation.mutate()}
                disabled={!closeNotes.trim() || closeGapMutation.isPending}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm shadow-lg transition-colors disabled:opacity-50"
              >
                تأكيد الإغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
