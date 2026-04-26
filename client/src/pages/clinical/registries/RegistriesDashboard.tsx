import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { clinicalServices } from "../../../api/clinicalServices";
import { apiClient } from "../../../api/apiClient";
import { toast } from "sonner";
import { ShieldAlert, CheckCircle2, Activity, Users, Search, RefreshCw, XCircle } from "lucide-react";

export default function RegistriesDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activePatientId, setActivePatientId] = useState<number | null>(null);
  const [foundPatient, setFoundPatient] = useState<any>(null);
  const [selectedGap, setSelectedGap] = useState<any>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const triggerMembershipMutation = useMutation({
    mutationFn: clinicalServices.triggerMembershipEval,
    onSuccess: (data) => toast.success(`تم تقييم ${data.evaluated} مريض وإضافة ${data.added} مريض للسجلات`),
    onError: () => toast.error("فشل تشغيل تقييم السجلات"),
  });

  const triggerGapsMutation = useMutation({
    mutationFn: clinicalServices.triggerGapsEval,
    onSuccess: (data) => toast.success(`تم تقييم ${data.evaluated} فجوة واكتشاف ${data.opened} فجوة رعاية جديدة`),
    onError: () => toast.error("فشل تشغيل تقييم الفجوات"),
  });

  const searchPatient = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const res = await apiClient.get(`/patients/search?query=${encodeURIComponent(searchQuery)}`);
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
    onError: () => toast.error("فشل إغلاق ফجوة الرعاية."),
  });

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <ShieldAlert className="w-6 h-6" />
            </div>
            لوحة السجلات وفجوات الرعاية (Care Gaps)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إدارة السجلات المرضية ومتابعة الامتثال لبروتوكولات الجودة السريرية
          </p>
        </div>
        <div className="relative z-10 flex gap-2">
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
        {/* Left Side: Search & Analytics */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6">
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-slate-400" /> بحث عن مريض
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="ابحث بالاسم، رقم الملف، أو الهاتف..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPatient()}
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

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex-1">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" /> إحصائيات عامة
            </h3>
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-sm text-slate-400 mb-1">مرضى السكري</div>
                <div className="text-2xl font-black text-sky-400">124</div>
                <div className="text-xs text-rose-400 mt-1">45% فجوات مفتوحة (HbA1c)</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-sm text-slate-400 mb-1">مرضى الضغط</div>
                <div className="text-2xl font-black text-emerald-400">89</div>
                <div className="text-xs text-emerald-500 mt-1">12% فجوات مفتوحة (BP Check)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Care Gaps List */}
        <div className="w-full lg:w-2/3 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 overflow-y-auto custom-scrollbar relative">
          <h2 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
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
              <p className="text-emerald-400 font-bold">لا توجد فجوات رعاية مفتوحة! (Compliant)</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {careGaps.map((gap: any) => (
                <div
                  key={gap.id}
                  className={`bg-slate-900 border ${
                    gap.status === "OPEN" ? "border-rose-500/50" : "border-emerald-500/50"
                  } rounded-2xl p-5 shadow-sm group`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${gap.status === "OPEN" ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                        {gap.status === "OPEN" ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-200">
                          {gap.rule?.name || "فجوة رعاية"}
                        </h3>
                        <div className="text-xs text-slate-400 mt-1 max-w-md">
                          {gap.rule?.description || "لم يتم استيفاء المتطلبات السريرية لهذه القاعدة."}
                        </div>
                      </div>
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                        gap.status === "OPEN" ? "bg-rose-900/30 text-rose-400" : "bg-emerald-900/30 text-emerald-400"
                      }`}>
                        {gap.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mb-4">
                    تاريخ الاكتشاف: {new Date(gap.identifiedAt).toLocaleDateString("ar-LY")}
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

      {/* Close Gap Modal */}
      {selectedGap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-emerald-400">إغلاق فجوة الرعاية</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-4">
                قاعدة: <span className="font-bold text-slate-200">{selectedGap.rule?.name}</span>
              </p>
              <textarea
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none min-h-[100px]"
                placeholder="أدخل سبب إغلاق الفجوة (مثال: تم إجراء الفحص في عيادة خارجية أو رفض المريض)..."
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
