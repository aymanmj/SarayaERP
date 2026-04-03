// src/pages/PatientChartPage.tsx
// =====================================================================
// صفحة السجل الطبي الشامل للمريض — Patient Chart (EMR Core)
// المصدر الوحيد للحقيقة حول الملف السريري للمريض
// =====================================================================

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/apiClient";
import { ProblemListPanel } from "../components/clinical/ProblemListPanel";
import { MedicalHistoryForm } from "../components/clinical/MedicalHistoryForm";
import { HomeMedicationsPanel } from "../components/clinical/HomeMedicationsPanel";

// ---------- Types ----------

type ClinicalSummary = {
  patient: {
    id: number;
    mrn: string;
    fullName: string;
    dateOfBirth: string | null;
    gender: "MALE" | "FEMALE" | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    maritalStatus: string | null;
    notes: string | null;
    createdAt: string;
  };
  problems: any[];
  medicalHistory: {
    socialHistory: any;
    pastMedical: any[];
    pastSurgical: any[];
    familyHistory: any[];
  };
  homeMedications: any[];
  allergies: { id: number; allergen: string; severity: string; reaction: string | null }[];
  activeEncounters: {
    id: number;
    type: string;
    status: string;
    chiefComplaint: string | null;
    createdAt: string;
    doctor: { id: number; fullName: string } | null;
    department: { id: number; name: string } | null;
  }[];
  recentDiagnoses: any[];
  stats: {
    totalEncounters: number;
    totalAdmissions: number;
    activeProblems: number;
    allergiesCount: number;
    unverifiedMedications: number;
  };
};

type ChartTab =
  | "OVERVIEW"
  | "PROBLEMS"
  | "HISTORY"
  | "HOME_MEDS"
  | "ALLERGIES"
  | "ENCOUNTERS";

const tabs: { key: ChartTab; label: string; icon: string }[] = [
  { key: "OVERVIEW", label: "الملخص", icon: "📊" },
  { key: "PROBLEMS", label: "المشاكل الصحية", icon: "📋" },
  { key: "HISTORY", label: "التاريخ المرضي", icon: "📖" },
  { key: "HOME_MEDS", label: "الأدوية المنزلية", icon: "💊" },
  { key: "ALLERGIES", label: "الحساسية", icon: "⚠️" },
  { key: "ENCOUNTERS", label: "الزيارات", icon: "🩺" },
];

// ---------- Helpers ----------

function calculateAge(dob: string | null) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ---------- Component ----------

export default function PatientChartPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const patientId = Number(id);
  const [activeTab, setActiveTab] = useState<ChartTab>("OVERVIEW");

  const {
    data: summary,
    isLoading,
    error,
    refetch,
  } = useQuery<ClinicalSummary>({
    queryKey: ["patient-chart", patientId],
    queryFn: async () => {
      const res = await apiClient.get(`/patients/${patientId}/clinical-summary`);
      return res.data;
    },
    enabled: !!patientId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">جارِ تحميل السجل الطبي...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 bg-rose-950/20 border border-rose-500/30 rounded-2xl p-8">
          <p className="text-rose-400 text-lg font-bold">خطأ في تحميل السجل الطبي</p>
          <p className="text-slate-500 text-sm">تأكد من صحة رقم المريض</p>
          <button
            onClick={() => navigate(-1)}
            className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-sm"
          >
            ← رجوع
          </button>
        </div>
      </div>
    );
  }

  const { patient, stats, allergies, activeEncounters } = summary;
  const age = calculateAge(patient.dateOfBirth);

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 gap-5 overflow-hidden" dir="rtl">
      {/* ═══════════════════ Header ═══════════════════ */}
      <div className="bg-gradient-to-l from-slate-900 via-slate-900 to-sky-950/30 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            {/* Patient Avatar */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-inner ${
              patient.gender === "MALE"
                ? "bg-sky-900/50 text-sky-300 border border-sky-700/50"
                : "bg-pink-900/50 text-pink-300 border border-pink-700/50"
            }`}>
              {patient.gender === "MALE" ? "♂" : "♀"}
            </div>

            <div>
              <div className="flex items-center gap-3 mb-1">
                <button
                  onClick={() => navigate(-1)}
                  className="text-slate-500 hover:text-white text-xs bg-slate-800/80 hover:bg-slate-700 px-2 py-1 rounded-lg transition-colors"
                >
                  ← رجوع
                </button>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {patient.fullName}
                </h1>
                <span className="bg-sky-900/40 text-sky-300 border border-sky-600/30 px-2.5 py-0.5 rounded-lg text-xs font-mono">
                  {patient.mrn}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                {age !== null && <span>{age} سنة</span>}
                {patient.gender && (
                  <>
                    <span className="text-slate-700">|</span>
                    <span>{patient.gender === "MALE" ? "ذكر" : "أنثى"}</span>
                  </>
                )}
                {patient.phone && (
                  <>
                    <span className="text-slate-700">|</span>
                    <span>📞 {patient.phone}</span>
                  </>
                )}
                {patient.maritalStatus && (
                  <>
                    <span className="text-slate-700">|</span>
                    <span>
                      {patient.maritalStatus === "MARRIED"
                        ? "متزوج/ة"
                        : patient.maritalStatus === "SINGLE"
                          ? "أعزب/عزباء"
                          : patient.maritalStatus === "DIVORCED"
                            ? "مطلّق/ة"
                            : "أرمل/ة"}
                    </span>
                  </>
                )}
                <span className="text-slate-700">|</span>
                <span className="text-slate-500">مسجّل {formatDate(patient.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3 flex-wrap">
            {allergies.length > 0 && (
              <div className="bg-red-950/40 border border-red-500/40 text-red-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-pulse">
                ⚠️ {allergies.length} حساسية
              </div>
            )}
            {stats.activeProblems > 0 && (
              <div className="bg-amber-950/40 border border-amber-500/30 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold">
                📋 {stats.activeProblems} مشكلة نشطة
              </div>
            )}
            {stats.unverifiedMedications > 0 && (
              <div className="bg-violet-950/40 border border-violet-500/30 text-violet-300 px-3 py-1.5 rounded-xl text-xs font-bold">
                💊 {stats.unverifiedMedications} دواء غير محقق
              </div>
            )}
            {activeEncounters.length > 0 && (
              <Link
                to={`/encounters/${activeEncounters[0].id}`}
                className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-900/40 transition-colors flex items-center gap-1.5"
              >
                🟢 حالة نشطة — انتقل
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════ Tabs ═══════════════════ */}
      <div className="flex gap-1.5 border-b border-slate-800 pb-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-slate-800 text-sky-400 border-t-2 border-x border-sky-500/50 border-x-slate-700 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {/* Notification badges */}
            {tab.key === "ALLERGIES" && allergies.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {allergies.length}
              </span>
            )}
            {tab.key === "PROBLEMS" && stats.activeProblems > 0 && (
              <span className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {stats.activeProblems}
              </span>
            )}
            {tab.key === "HOME_MEDS" && stats.unverifiedMedications > 0 && (
              <span className="bg-violet-500/20 text-violet-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {stats.unverifiedMedications}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════ Content ═══════════════════ */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* OVERVIEW Tab */}
        {activeTab === "OVERVIEW" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {/* Stat Cards */}
            <div className="xl:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon="📋"
                label="المشاكل النشطة"
                value={stats.activeProblems}
                color="amber"
              />
              <StatCard
                icon="⚠️"
                label="الحساسيات"
                value={stats.allergiesCount}
                color="red"
              />
              <StatCard
                icon="🩺"
                label="إجمالي الزيارات"
                value={stats.totalEncounters}
                color="sky"
              />
              <StatCard
                icon="🛏️"
                label="مرات الإيواء"
                value={stats.totalAdmissions}
                color="purple"
              />
            </div>

            {/* Active Problems Summary */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  📋 المشاكل الصحية النشطة
                </h3>
                <button
                  onClick={() => setActiveTab("PROBLEMS")}
                  className="text-[10px] text-sky-400 hover:text-sky-300"
                >
                  عرض الكل ←
                </button>
              </div>
              {summary.problems.filter((p) => p.type === "ACTIVE" || p.type === "CHRONIC").length ===
                0 ? (
                <p className="text-slate-500 text-xs text-center py-4">
                  لا توجد مشاكل صحية نشطة مسجّلة
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.problems
                    .filter((p) => p.type === "ACTIVE" || p.type === "CHRONIC")
                    .slice(0, 5)
                    .map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 text-xs bg-slate-950/50 border border-slate-800 px-3 py-2 rounded-xl"
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            p.type === "CHRONIC" ? "bg-amber-500" : "bg-red-500"
                          }`}
                        />
                        <span className="text-slate-200 flex-1">{p.description}</span>
                        {p.diagnosisCode && (
                          <span className="text-slate-500 font-mono text-[10px]">
                            {p.diagnosisCode.code}
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            p.type === "CHRONIC"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {p.type === "CHRONIC" ? "مزمن" : "نشط"}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Allergies Summary */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                  ⚠️ الحساسيات
                </h3>
                <button
                  onClick={() => setActiveTab("ALLERGIES")}
                  className="text-[10px] text-sky-400 hover:text-sky-300"
                >
                  عرض الكل ←
                </button>
              </div>
              {allergies.length === 0 ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                    ✅ لا توجد حساسيات مسجّلة — NKDA
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {allergies.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 text-xs bg-red-950/20 border border-red-800/30 px-3 py-2 rounded-xl"
                    >
                      <span className="text-red-400 font-bold">{a.allergen}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          a.severity === "SEVERE"
                            ? "bg-red-500/20 text-red-300"
                            : a.severity === "MODERATE"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-yellow-500/20 text-yellow-300"
                        }`}
                      >
                        {a.severity === "SEVERE"
                          ? "شديدة"
                          : a.severity === "MODERATE"
                            ? "متوسطة"
                            : "خفيفة"}
                      </span>
                      {a.reaction && (
                        <span className="text-slate-500 text-[10px]">({a.reaction})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Encounters & Navigation */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-4">
                🩺 الحالات النشطة
              </h3>
              {activeEncounters.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-4">
                  لا توجد حالات نشطة حالياً
                </p>
              ) : (
                <div className="space-y-2">
                  {activeEncounters.map((enc) => (
                    <Link
                      key={enc.id}
                      to={`/encounters/${enc.id}`}
                      className="flex items-center justify-between text-xs bg-slate-950/50 border border-slate-800 px-3 py-2.5 rounded-xl hover:border-sky-600/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            enc.type === "ER"
                              ? "bg-rose-900/20 text-rose-300 border-rose-500/30"
                              : enc.type === "IPD"
                                ? "bg-purple-900/20 text-purple-300 border-purple-500/30"
                                : "bg-sky-900/20 text-sky-300 border-sky-500/30"
                          }`}
                        >
                          {enc.type === "ER"
                            ? "طوارئ"
                            : enc.type === "IPD"
                              ? "إيواء"
                              : "عيادة"}
                        </span>
                        <span className="text-slate-300">
                          {enc.chiefComplaint || "بدون شكوى محددة"}
                        </span>
                      </div>
                      <span className="text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        افتح ←
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Quick Navigation Links */}
              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                <h4 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                  وصول سريع
                </h4>
                <Link
                  to={`/patients/${patientId}/consents`}
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-sky-300 transition-colors py-1"
                >
                  📝 نماذج الموافقة
                </Link>
                <Link
                  to={`/encounters?patientId=${patientId}`}
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-sky-300 transition-colors py-1"
                >
                  🗂️ سجل الزيارات الكامل
                </Link>
              </div>
            </div>

            {/* Recent Diagnoses */}
            <div className="lg:col-span-2 xl:col-span-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-sky-400 flex items-center gap-2 mb-4">
                🏥 آخر التشخيصات
              </h3>
              {summary.recentDiagnoses.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-4">
                  لا توجد تشخيصات مسجّلة
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {summary.recentDiagnoses.map((dx: any, i: number) => (
                    <Link
                      key={i}
                      to={`/encounters/${dx.encounter?.id}`}
                      className="flex items-center gap-2 text-xs bg-slate-950/50 border border-slate-800 px-3 py-2 rounded-xl hover:border-sky-600/40 transition-colors"
                    >
                      <span className="text-sky-400 font-mono text-[10px] shrink-0">
                        {dx.diagnosisCode?.code}
                      </span>
                      <span className="text-slate-300 truncate">
                        {dx.diagnosisCode?.nameAr || dx.diagnosisCode?.nameEn}
                      </span>
                      <span className="text-slate-600 text-[10px] shrink-0 mr-auto">
                        {formatDate(dx.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROBLEMS Tab */}
        {activeTab === "PROBLEMS" && (
          <ProblemListPanel patientId={patientId} onUpdate={refetch} />
        )}

        {/* HISTORY Tab */}
        {activeTab === "HISTORY" && (
          <MedicalHistoryForm patientId={patientId} />
        )}

        {/* HOME_MEDS Tab */}
        {activeTab === "HOME_MEDS" && (
          <HomeMedicationsPanel patientId={patientId} onUpdate={refetch} />
        )}

        {/* ALLERGIES Tab - Uses existing AllergiesPane */}
        {activeTab === "ALLERGIES" && (
          <div className="max-w-3xl">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                ⚠️ الحساسية والمخاطر الدوائية
              </h3>
              {allergies.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl inline-block">
                    ✅ لا توجد حساسيات مسجّلة (NKDA)
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allergies.map((a) => (
                    <div
                      key={a.id}
                      className="bg-red-950/15 border border-red-800/30 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-300">{a.allergen}</span>
                        <span
                          className={`px-2 py-1 rounded-lg text-xs font-bold ${
                            a.severity === "SEVERE"
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : a.severity === "MODERATE"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                          }`}
                        >
                          {a.severity === "SEVERE"
                            ? "شديدة الخطورة"
                            : a.severity === "MODERATE"
                              ? "متوسطة"
                              : "خفيفة"}
                        </span>
                      </div>
                      {a.reaction && (
                        <p className="text-slate-400 text-xs mt-2">
                          التفاعل: {a.reaction}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-600 mt-4 text-center">
                لإضافة حساسية جديدة، افتح أي ملف حالة (Encounter) ← تبويب "الحساسية والمخاطر"
              </p>
            </div>
          </div>
        )}

        {/* ENCOUNTERS Tab */}
        {activeTab === "ENCOUNTERS" && (
          <div className="max-w-4xl">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-lg font-bold text-sky-400 mb-4 flex items-center gap-2">
                🩺 سجل الزيارات والحالات
              </h3>
              <div className="flex items-center gap-2 mb-4 text-xs text-slate-400">
                <span className="bg-slate-800 px-2 py-1 rounded">
                  إجمالي الزيارات: {stats.totalEncounters}
                </span>
                <span className="bg-slate-800 px-2 py-1 rounded">
                  مرات الإيواء: {stats.totalAdmissions}
                </span>
              </div>
              {activeEncounters.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs text-emerald-400 font-bold mb-2">
                    الحالات النشطة
                  </h4>
                  <div className="space-y-2">
                    {activeEncounters.map((enc) => (
                      <Link
                        key={enc.id}
                        to={`/encounters/${enc.id}`}
                        className="flex items-center justify-between bg-emerald-950/20 border border-emerald-800/30 rounded-xl px-4 py-3 hover:border-emerald-500/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-400">🟢</span>
                          <div>
                            <div className="text-sm text-white">
                              {enc.type === "ER"
                                ? "طوارئ"
                                : enc.type === "IPD"
                                  ? "إيواء"
                                  : "عيادة خارجية"}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {enc.chiefComplaint || "—"} |{" "}
                              {enc.doctor?.fullName || "بدون طبيب"} |{" "}
                              {formatDate(enc.createdAt)}
                            </div>
                          </div>
                        </div>
                        <span className="text-sky-400 text-xs">افتح ←</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-center pt-4 border-t border-slate-800">
                <Link
                  to={`/encounters?patientId=${patientId}`}
                  className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors"
                >
                  🗂️ عرض السجل الكامل
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: "amber" | "red" | "sky" | "purple";
}) {
  const colors = {
    amber: "from-amber-950/40 to-amber-950/10 border-amber-800/30 text-amber-400",
    red: "from-red-950/40 to-red-950/10 border-red-800/30 text-red-400",
    sky: "from-sky-950/40 to-sky-950/10 border-sky-800/30 text-sky-400",
    purple: "from-purple-950/40 to-purple-950/10 border-purple-800/30 text-purple-400",
  };

  return (
    <div
      className={`bg-gradient-to-b ${colors[color]} border rounded-2xl p-4 flex items-center gap-3`}
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-[10px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}
