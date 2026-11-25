import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../../api/apiClient";

const RADIATION_MODALITIES = [
  "CT",
  "DX",
  "CR",
  "MG",
  "RF",
  "XA",
  "NM",
  "PT",
] as const;

type RadiationModality = (typeof RADIATION_MODALITIES)[number];

interface DoseRecordItem {
  id: number;
  radiologyOrderId: number;
  modality: string;
  bodyRegion?: string | null;
  ctdiVolMgy?: string | null;
  dlpMgyCm?: string | null;
  dapGyCm2?: string | null;
  effectiveDoseMsv: string;
  cumulative12mMsv: string;
  exceedsDrl: boolean;
  cumulativeWarning: boolean;
  recordedAt: string;
  notes?: string | null;
}

interface PatientDoseSummary {
  patient: { id: number; fullName: string; mrn: string };
  examCount: number;
  cumulative12mMsv: string;
  lifetimeMsv: string;
  drlExceedances: number;
  tier: "NORMAL" | "ELEVATED_50MSV" | "CRITICAL_100MSV";
  records: DoseRecordItem[];
}

export interface RadiologyDoseModalProps {
  open: boolean;
  radiologyOrderId: number;
  patientId: number;
  patientName: string;
  patientMrn?: string;
  studyName: string;
  defaultModality?: string | null;
  defaultBodyRegion?: string | null;
  onClose: () => void;
  onRecorded?: () => void;
}

function extractErr(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(raw)) return raw.join(" • ");
  return raw || fallback;
}

const TIER_UI = {
  NORMAL: {
    label: "ضمن الحدود الآمنة (< 50 mSv)",
    cls: "bg-emerald-950/70 text-emerald-300 border-emerald-500/40",
    bar: "bg-emerald-500",
  },
  ELEVATED_50MSV: {
    label: "تحذير تراكمي (≥ 50 mSv خلال 12 شهراً)",
    cls: "bg-amber-950/70 text-amber-300 border-amber-500/40",
    bar: "bg-amber-500",
  },
  CRITICAL_100MSV: {
    label: "حرج (≥ 100 mSv — تم تصعيد حادثة سلامة سريرية)",
    cls: "bg-rose-950/80 text-rose-300 border-rose-500/60 animate-pulse",
    bar: "bg-rose-500",
  },
};

export function RadiologyDoseModal({
  open,
  radiologyOrderId,
  patientId,
  patientName,
  patientMrn,
  studyName,
  defaultModality,
  defaultBodyRegion,
  onClose,
  onRecorded,
}: RadiologyDoseModalProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<PatientDoseSummary | null>(null);
  const [lastIncidentId, setLastIncidentId] = useState<number | null>(null);

  const initialModality: RadiationModality = RADIATION_MODALITIES.includes(
    (defaultModality || "").toUpperCase() as RadiationModality,
  )
    ? ((defaultModality || "").toUpperCase() as RadiationModality)
    : "CT";

  const [modality, setModality] = useState<RadiationModality>(initialModality);
  const [bodyRegion, setBodyRegion] = useState(defaultBodyRegion || "CHEST");
  const [dlpMgyCm, setDlpMgyCm] = useState("");
  const [ctdiVolMgy, setCtdiVolMgy] = useState("");
  const [dapGyCm2, setDapGyCm2] = useState("");
  const [effectiveDoseMsv, setEffectiveDoseMsv] = useState("");
  const [kvp, setKvp] = useState("");
  const [mas, setMas] = useState("");
  const [exposureCount, setExposureCount] = useState("1");
  const [notes, setNotes] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PatientDoseSummary>(
        `/radiology/dose/patients/${patientId}/summary`,
      );
      setSummary(res.data);
    } catch (err) {
      toast.error(extractErr(err, "تعذر تحميل سجل الجرعة الإشعاعية للمريض"));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (open) {
      setLastIncidentId(null);
      void loadSummary();
    }
  }, [open, loadSummary]);

  if (!open) return null;

  const alreadyRecordedForOrder = Boolean(
    summary?.records.some((r) => r.radiologyOrderId === radiologyOrderId),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        modality,
        bodyRegion: bodyRegion.trim() || undefined,
        exposureCount: exposureCount ? Number(exposureCount) : 1,
        notes: notes.trim() || undefined,
      };
      if (dlpMgyCm.trim()) payload.dlpMgyCm = Number(dlpMgyCm);
      if (ctdiVolMgy.trim()) payload.ctdiVolMgy = Number(ctdiVolMgy);
      if (dapGyCm2.trim()) payload.dapGyCm2 = Number(dapGyCm2);
      if (effectiveDoseMsv.trim()) {
        payload.effectiveDoseMsv = Number(effectiveDoseMsv);
      }
      if (kvp.trim()) payload.kvp = Number(kvp);
      if (mas.trim()) payload.mas = Number(mas);

      const res = await apiClient.post<{
        record: DoseRecordItem;
        incidentId: number | null;
        evaluation: {
          effectiveDoseMsv: string;
          cumulative12mMsv: string;
          exceedsDrl: boolean;
          tier: string;
        };
      }>(`/radiology/dose/orders/${radiologyOrderId}`, payload);

      if (res.data.incidentId) {
        setLastIncidentId(res.data.incidentId);
        toast.error(
          `🚨 تجاوزت الجرعة التراكمية 100 mSv (${res.data.evaluation.cumulative12mMsv} mSv) — تم فتح حادثة سلامة سريرية #${res.data.incidentId}`,
        );
      } else if (res.data.evaluation.exceedsDrl) {
        toast.warning(
          `⚠️ الجرعة المسجلة (${res.data.evaluation.effectiveDoseMsv} mSv) تتجاوز المستوى المرجعي التشخيصي (DRL)`,
        );
      } else {
        toast.success(
          `تم تسجيل الجرعة الإشعاعية (${res.data.evaluation.effectiveDoseMsv} mSv) بنجاح`,
        );
      }

      await loadSummary();
      onRecorded?.();
    } catch (err) {
      toast.error(extractErr(err, "تعذر تسجيل الجرعة الإشعاعية (RDSR)"));
    } finally {
      setSubmitting(false);
    }
  };

  const tierInfo = summary ? TIER_UI[summary.tier] : TIER_UI.NORMAL;
  const pct100 = summary
    ? Math.min(100, Math.round((Number(summary.cumulative12mMsv) / 100) * 100))
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      dir={isRtl ? "rtl" : "ltr"}
      role="dialog"
      aria-label={t("radiology.dose.title", "سجل الجرعة الإشعاعية (RDSR)")}
    >
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-white">
              ☢️ {t("radiology.dose.title", "سجل الجرعة الإشعاعية وسلامة المريض (RDSR)")}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              المريض: <strong className="text-slate-200">{patientName}</strong>
              {patientMrn ? ` (${patientMrn})` : ""} • الفحص:{" "}
              <strong className="text-sky-300">{studyName}</strong> (#
              {radiologyOrderId})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
          >
            {t("common.close", "إغلاق")}
          </button>
        </div>

        {loading && (
          <div className="text-center py-6 text-sm text-slate-400">
            جاري تحميل ملخص الجرعة التراكمية...
          </div>
        )}

        {!loading && summary && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-white">
                ملخص التعرض الإشعاعي التراكمي للمريض (ICRP-103)
              </div>
              <span
                className={`px-3 py-1 rounded-xl border text-xs font-bold ${tierInfo.cls}`}
              >
                {tierInfo.label}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-slate-400">تراكمي 12 شهراً</div>
                <div className="text-lg font-mono font-black text-white mt-1">
                  {summary.cumulative12mMsv} mSv
                </div>
              </div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-slate-400">الإجمالي التراكمي (Lifetime)</div>
                <div className="text-lg font-mono font-black text-sky-300 mt-1">
                  {summary.lifetimeMsv} mSv
                </div>
              </div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-slate-400">عدد الفحوصات المسجلة</div>
                <div className="text-lg font-mono font-black text-slate-200 mt-1">
                  {summary.examCount}
                </div>
              </div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-slate-400">تجاوزات DRL</div>
                <div
                  className={`text-lg font-mono font-black mt-1 ${
                    summary.drlExceedances > 0
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}
                >
                  {summary.drlExceedances}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>0 mSv</span>
                <span className="text-amber-300">50 mSv (تحذير)</span>
                <span className="text-rose-400">100 mSv (تصعيد حادثة)</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all ${tierInfo.bar}`}
                  style={{ width: `${pct100}%` }}
                />
              </div>
            </div>

            {lastIncidentId && (
              <div className="rounded-xl border border-rose-500/60 bg-rose-950/60 p-3 text-xs text-rose-200 font-bold">
                🚨 تم إنشاء حادثة سلامة سريرية تلقائياً برقم #{lastIncidentId}{" "}
                لتجاوز الجرعة التراكمية عتبة 100 mSv خلال 12 شهراً.
              </div>
            )}
          </div>
        )}

        {/* Record Dose Form */}
        {alreadyRecordedForOrder ? (
          <div className="rounded-2xl border border-emerald-700/50 bg-emerald-950/30 p-4 text-xs text-emerald-200 font-bold">
            ✓ تم تسجيل وتثبيت سجل الجرعة الإشعاعية (RDSR) لهذا الطلب بشكل غير قابل للتعديل.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-amber-300">
              تسجيل بيانات الجرعة الإشعاعية للفحص الحالي (DICOM RDSR)
            </h3>
            <p className="text-[11px] text-slate-400">
              لفحوصات CT يكفي إدخال DLP (mGy·cm) وسيُحتسب تلقائياً Effective Dose (mSv) وفق معاملات ICRP-103.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <select
                aria-label="نوع الجهاز"
                value={modality}
                onChange={(e) =>
                  setModality(e.target.value as RadiationModality)
                }
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              >
                {RADIATION_MODALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                value={bodyRegion}
                onChange={(e) => setBodyRegion(e.target.value)}
                placeholder="المنطقة (CHEST / HEAD / ABDOMEN)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={dlpMgyCm}
                onChange={(e) => setDlpMgyCm(e.target.value)}
                placeholder="DLP (mGy·cm)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={ctdiVolMgy}
                onChange={(e) => setCtdiVolMgy(e.target.value)}
                placeholder="CTDIvol (mGy)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="number"
                step="0.0001"
                min="0"
                value={effectiveDoseMsv}
                onChange={(e) => setEffectiveDoseMsv(e.target.value)}
                placeholder="الجرعة الفعالة mSv (اختياري لـ CT)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={dapGyCm2}
                onChange={(e) => setDapGyCm2(e.target.value)}
                placeholder="DAP (Gy·cm²)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                value={kvp}
                onChange={(e) => setKvp(e.target.value)}
                placeholder="kVp (مثل 120)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                value={mas}
                onChange={(e) => setMas(e.target.value)}
                placeholder="mAs (مثل 200)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="number"
                min="1"
                value={exposureCount}
                onChange={(e) => setExposureCount(e.target.value)}
                placeholder="عدد التعرضات"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات البروتوكول الإشعاعي..."
                className="col-span-2 md:col-span-3 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
            >
              تثبيت سجل الجرعة الإشعاعية (RDSR)
            </button>
          </form>
        )}

        {/* Dose History */}
        {!loading && summary && (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-2.5">التاريخ</th>
                  <th className="p-2.5">الجهاز</th>
                  <th className="p-2.5">المنطقة</th>
                  <th className="p-2.5">DLP / CTDIvol</th>
                  <th className="p-2.5">Effective Dose</th>
                  <th className="p-2.5">تراكمي 12م</th>
                  <th className="p-2.5">DRL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {summary.records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-900/50">
                    <td className="p-2.5 font-mono text-slate-400">
                      {rec.recordedAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="p-2.5 font-mono font-bold text-sky-300">
                      {rec.modality}
                    </td>
                    <td className="p-2.5">{rec.bodyRegion || "—"}</td>
                    <td className="p-2.5 font-mono">
                      {rec.dlpMgyCm ? `DLP ${rec.dlpMgyCm}` : "—"}
                      {rec.ctdiVolMgy ? ` / CTDI ${rec.ctdiVolMgy}` : ""}
                    </td>
                    <td className="p-2.5 font-mono font-bold text-white">
                      {rec.effectiveDoseMsv} mSv
                    </td>
                    <td className="p-2.5 font-mono">
                      {rec.cumulative12mMsv} mSv
                    </td>
                    <td className="p-2.5">
                      {rec.exceedsDrl ? (
                        <span className="px-2 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-500/40 font-bold">
                          تجاوز DRL
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                          طبيعي
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {summary.records.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      لا توجد سجلات جرعة إشعاعية سابقة لهذا المريض.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
