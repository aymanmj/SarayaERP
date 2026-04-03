// src/components/clinical/ProblemListPanel.tsx
// =====================================================================
// قائمة المشاكل الصحية — Problem List (EMR Core)
// =====================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type Problem = {
  id: number;
  description: string;
  type: "ACTIVE" | "RESOLVED" | "CHRONIC" | "INACTIVE";
  severity: "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING" | null;
  onsetDate: string | null;
  resolvedDate: string | null;
  isChronic: boolean;
  notes: string | null;
  diagnosisCode: { id: number; code: string; nameEn: string; nameAr: string | null; icd10Code: string | null } | null;
  createdBy: { id: number; fullName: string };
  createdAt: string;
};

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: "نشط", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  CHRONIC: { label: "مزمن", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  RESOLVED: { label: "تم حله", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  INACTIVE: { label: "غير نشط", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/30" },
};

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  MILD: { label: "خفيفة", color: "text-green-400" },
  MODERATE: { label: "متوسطة", color: "text-amber-400" },
  SEVERE: { label: "شديدة", color: "text-orange-400" },
  LIFE_THREATENING: { label: "مهددة للحياة", color: "text-red-400" },
};

export function ProblemListPanel({ patientId, onUpdate }: { patientId: number; onUpdate?: () => void }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "CHRONIC" | "RESOLVED">("ALL");

  // Form state
  const [description, setDescription] = useState("");
  const [type, setType] = useState("ACTIVE");
  const [severity, setSeverity] = useState("");
  const [onsetDate, setOnsetDate] = useState("");
  const [isChronic, setIsChronic] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: problems = [], isLoading } = useQuery<Problem[]>({
    queryKey: ["patient-problems", patientId],
    queryFn: async () => {
      const res = await apiClient.get(`/patients/${patientId}/problems`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post(`/patients/${patientId}/problems`, {
        description,
        type,
        severity: severity || undefined,
        onsetDate: onsetDate || undefined,
        isChronic,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-problems", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chart", patientId] });
      toast.success("تمت إضافة المشكلة الصحية");
      resetForm();
      onUpdate?.();
    },
    onError: () => toast.error("فشل في إضافة المشكلة"),
  });

  const resolveMutation = useMutation({
    mutationFn: async (problemId: number) => {
      return apiClient.patch(`/patients/${patientId}/problems/${problemId}`, {
        type: "RESOLVED",
        resolvedDate: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-problems", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chart", patientId] });
      toast.success("تم تحديث حالة المشكلة");
      onUpdate?.();
    },
    onError: () => toast.error("فشل في التحديث"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (problemId: number) => {
      return apiClient.delete(`/patients/${patientId}/problems/${problemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-problems", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chart", patientId] });
      toast.success("تم حذف المشكلة");
      onUpdate?.();
    },
    onError: () => toast.error("فشل في الحذف"),
  });

  const resetForm = () => {
    setDescription("");
    setType("ACTIVE");
    setSeverity("");
    setOnsetDate("");
    setIsChronic(false);
    setNotes("");
    setShowForm(false);
  };

  const filteredProblems = problems.filter((p) =>
    filter === "ALL" ? true : p.type === filter
  );

  const activeCount = problems.filter((p) => p.type === "ACTIVE").length;
  const chronicCount = problems.filter((p) => p.type === "CHRONIC").length;
  const resolvedCount = problems.filter((p) => p.type === "RESOLVED").length;

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          📋 قائمة المشاكل الصحية (Problem List)
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
        >
          {showForm ? "✕ إلغاء" : "+ إضافة مشكلة"}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-slate-900 border border-sky-800/30 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-2">
          <h3 className="text-sm font-bold text-sky-400">مشكلة صحية جديدة</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">وصف المشكلة *</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="مثال: Diabetes Mellitus Type 2 — سكري النوع الثاني"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">الحالة</label>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="ACTIVE">نشط</option>
                <option value="CHRONIC">مزمن</option>
                <option value="RESOLVED">تم حله</option>
                <option value="INACTIVE">غير نشط</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">الشدة</label>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="">— غير محدد —</option>
                <option value="MILD">خفيفة</option>
                <option value="MODERATE">متوسطة</option>
                <option value="SEVERE">شديدة</option>
                <option value="LIFE_THREATENING">مهددة للحياة</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">تاريخ البداية</label>
              <input
                type="date"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                value={onsetDate}
                onChange={(e) => setOnsetDate(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="isChronic"
                checked={isChronic}
                onChange={(e) => {
                  setIsChronic(e.target.checked);
                  if (e.target.checked) setType("CHRONIC");
                }}
                className="rounded"
              />
              <label htmlFor="isChronic" className="text-xs text-slate-300">
                مشكلة مزمنة (Chronic)
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">ملاحظات</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500 min-h-[60px]"
                placeholder="ملاحظات إضافية..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
            >
              إلغاء
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!description.trim() || createMutation.isPending}
              className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? "جارِ الحفظ..." : "حفظ"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {(["ALL", "ACTIVE", "CHRONIC", "RESOLVED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              filter === f
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {f === "ALL"
              ? `الكل (${problems.length})`
              : f === "ACTIVE"
                ? `نشط (${activeCount})`
                : f === "CHRONIC"
                  ? `مزمن (${chronicCount})`
                  : `تم حله (${resolvedCount})`}
          </button>
        ))}
      </div>

      {/* Problem List */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500 text-sm">جارِ التحميل...</div>
      ) : filteredProblems.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <p className="text-slate-500 text-sm">لا توجد مشاكل صحية مسجّلة</p>
          <p className="text-slate-600 text-xs mt-1">
            اضغط "+ إضافة مشكلة" لبدء توثيق المشاكل الصحية
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProblems.map((problem) => {
            const typeInfo = TYPE_LABELS[problem.type] || TYPE_LABELS.ACTIVE;
            const severityInfo = problem.severity
              ? SEVERITY_LABELS[problem.severity]
              : null;

            return (
              <div
                key={problem.id}
                className={`bg-slate-900/60 border rounded-2xl p-4 transition-all hover:shadow-md ${
                  problem.type === "RESOLVED"
                    ? "border-slate-800/50 opacity-70"
                    : "border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                        problem.type === "ACTIVE"
                          ? "bg-red-500"
                          : problem.type === "CHRONIC"
                            ? "bg-amber-500"
                            : problem.type === "RESOLVED"
                              ? "bg-emerald-500"
                              : "bg-slate-500"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-medium ${
                            problem.type === "RESOLVED"
                              ? "line-through text-slate-500"
                              : "text-slate-100"
                          }`}
                        >
                          {problem.description}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border font-bold ${typeInfo.bg} ${typeInfo.color}`}
                        >
                          {typeInfo.label}
                        </span>
                        {severityInfo && (
                          <span className={`text-[10px] ${severityInfo.color}`}>
                            ({severityInfo.label})
                          </span>
                        )}
                      </div>

                      {problem.diagnosisCode && (
                        <div className="text-[10px] text-sky-400/70 mt-1 font-mono">
                          ICD: {problem.diagnosisCode.code}{" "}
                          {problem.diagnosisCode.icd10Code &&
                            `(${problem.diagnosisCode.icd10Code})`}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1.5">
                        {problem.onsetDate && (
                          <span>
                            البداية:{" "}
                            {new Date(problem.onsetDate).toLocaleDateString("ar-LY")}
                          </span>
                        )}
                        {problem.resolvedDate && (
                          <span>
                            الحل:{" "}
                            {new Date(problem.resolvedDate).toLocaleDateString("ar-LY")}
                          </span>
                        )}
                        <span>بواسطة: {problem.createdBy.fullName}</span>
                      </div>

                      {problem.notes && (
                        <p className="text-xs text-slate-400 mt-2 bg-slate-950/50 px-3 py-1.5 rounded-lg">
                          {problem.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {problem.type === "ACTIVE" && (
                      <button
                        onClick={() => resolveMutation.mutate(problem.id)}
                        disabled={resolveMutation.isPending}
                        className="text-emerald-400 hover:text-emerald-300 text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg transition-colors"
                        title="تم الحل"
                      >
                        ✓ حل
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm("هل أنت متأكد من حذف هذه المشكلة؟")) {
                          deleteMutation.mutate(problem.id);
                        }
                      }}
                      className="text-slate-500 hover:text-red-400 text-[10px] bg-slate-800/50 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors"
                      title="حذف"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
