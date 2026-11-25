import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../../api/apiClient";

type QcLevel = "LEVEL_1_LOW" | "LEVEL_2_NORMAL" | "LEVEL_3_HIGH";
type QcStatus = "PASS" | "WARNING" | "REJECT";

interface LabCatalogTest {
  id: number;
  code: string;
  name: string;
  unit?: string | null;
}

interface LabQcLot {
  id: number;
  testId: number;
  analyzerName: string;
  lotNumber: string;
  level: QcLevel;
  targetMean: string;
  targetSd: string;
  unit?: string | null;
  expiryDate?: string | null;
  test?: { id: number; code: string; name: string };
}

interface LabQcRun {
  id: number;
  qcLotId: number;
  measuredValue: string;
  zScore: string;
  status: QcStatus;
  violatedRules: string[];
  correctiveAction?: string | null;
  measuredAt: string;
  performedBy?: { id: number; fullName: string } | null;
  reviewedBy?: { id: number; fullName: string } | null;
  reviewedAt?: string | null;
}

interface LeveyJenningsResponse {
  lot: LabQcLot;
  bands: {
    mean: string;
    sd: string;
    plus1Sd: string;
    minus1Sd: string;
    plus2Sd: string;
    minus2Sd: string;
    plus3Sd: string;
    minus3Sd: string;
  };
  summary: {
    totalRuns: number;
    passCount: number;
    warningCount: number;
    rejectCount: number;
  };
  runs: LabQcRun[];
}

interface LabQcModalProps {
  open: boolean;
  onClose: () => void;
}

const LEVEL_LABELS: Record<QcLevel, string> = {
  LEVEL_1_LOW: "مستوى 1 (منخفض)",
  LEVEL_2_NORMAL: "مستوى 2 (طبيعي)",
  LEVEL_3_HIGH: "مستوى 3 (مرتفع)",
};

const STATUS_BADGES: Record<QcStatus, { label: string; cls: string }> = {
  PASS: {
    label: "مقبول (PASS)",
    cls: "bg-emerald-950/70 text-emerald-300 border-emerald-500/40",
  },
  WARNING: {
    label: "تحذير (WARNING)",
    cls: "bg-amber-950/70 text-amber-300 border-amber-500/40",
  },
  REJECT: {
    label: "مرفوض (REJECT)",
    cls: "bg-rose-950/80 text-rose-300 border-rose-500/50",
  },
};

function extractErr(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(raw)) return raw.join(" • ");
  return raw || fallback;
}

export function LabQcModal({ open, onClose }: LabQcModalProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lots, setLots] = useState<LabQcLot[]>([]);
  const [catalog, setCatalog] = useState<LabCatalogTest[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [chartData, setChartData] = useState<LeveyJenningsResponse | null>(null);
  const [showNewLotForm, setShowNewLotForm] = useState(false);

  // Create Lot form
  const [testId, setTestId] = useState("");
  const [analyzerName, setAnalyzerName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [level, setLevel] = useState<QcLevel>("LEVEL_2_NORMAL");
  const [targetMean, setTargetMean] = useState("");
  const [targetSd, setTargetSd] = useState("");
  const [unit, setUnit] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  // Record Run form
  const [measuredValue, setMeasuredValue] = useState("");
  const [runActionNote, setRunActionNote] = useState("");

  // 4-Eyes Review state
  const [reviewingRunId, setReviewingRunId] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");

  const loadChart = useCallback(async (lotId: number) => {
    try {
      const res = await apiClient.get<LeveyJenningsResponse>(
        `/lab/qc/lots/${lotId}/levey-jennings`,
      );
      setChartData(res.data);
    } catch (err) {
      toast.error(extractErr(err, "تعذر تحميل مخطط Levey-Jennings"));
    }
  }, []);

  const loadInitial = useCallback(
    async (preferredLotId?: number) => {
      setLoading(true);
      try {
        const [lotsRes, catRes] = await Promise.all([
          apiClient.get<LabQcLot[]>("/lab/qc/lots"),
          apiClient.get<LabCatalogTest[]>("/lab/catalog"),
        ]);
        const fetchedLots = lotsRes.data || [];
        setLots(fetchedLots);
        setCatalog(catRes.data || []);

        if (fetchedLots.length > 0) {
          const nextId =
            preferredLotId && fetchedLots.some((l) => l.id === preferredLotId)
              ? preferredLotId
              : fetchedLots[0].id;
          setSelectedLotId(nextId);
          await loadChart(nextId);
        } else {
          setSelectedLotId(null);
          setChartData(null);
        }
      } catch (err) {
        toast.error(extractErr(err, "تعذر تحميل بيانات ضبط الجودة"));
      } finally {
        setLoading(false);
      }
    },
    [loadChart],
  );

  useEffect(() => {
    if (open) {
      void loadInitial();
    }
  }, [open, loadInitial]);

  if (!open) return null;

  const handleSelectLot = async (id: number) => {
    setSelectedLotId(id);
    setReviewingRunId(null);
    await loadChart(id);
  };

  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testId || !analyzerName.trim() || !lotNumber.trim()) return;
    setBusy("create-lot");
    try {
      const res = await apiClient.post<LabQcLot>("/lab/qc/lots", {
        testId: Number(testId),
        analyzerName: analyzerName.trim(),
        lotNumber: lotNumber.trim(),
        level,
        targetMean: Number(targetMean),
        targetSd: Number(targetSd),
        unit: unit.trim() || undefined,
        expiryDate: expiryDate ? `${expiryDate}T00:00:00.000Z` : undefined,
      });
      toast.success("تم تسجيل تشغيلة ضبط الجودة بنجاح");
      setShowNewLotForm(false);
      setAnalyzerName("");
      setLotNumber("");
      setTargetMean("");
      setTargetSd("");
      setUnit("");
      setExpiryDate("");
      setSelectedLotId(res.data.id);
      await loadInitial(res.data.id);
    } catch (err) {
      toast.error(extractErr(err, "تعذر تسجيل تشغيلة ضبط الجودة"));
    } finally {
      setBusy(null);
    }
  };

  const handleRecordRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotId || !measuredValue.trim()) return;
    setBusy("record-run");
    try {
      const res = await apiClient.post<LabQcRun>("/lab/qc/runs", {
        qcLotId: selectedLotId,
        measuredValue: Number(measuredValue),
        correctiveAction: runActionNote.trim() || undefined,
      });
      const rules = res.data.violatedRules?.join(", ");
      if (res.data.status === "REJECT") {
        toast.error(
          `⚠️ رُفضت القراءة وفق قواعد Westgard (${rules || "REJECT"}) — يلزم إجراء تصحيحي ومراجعة 4 عيون`,
        );
      } else if (res.data.status === "WARNING") {
        toast.warning(
          `تنبيه Westgard (${rules || "1-2s"}) — يرجى المتابعة`,
        );
      } else {
        toast.success("تم تسجيل قراءة الجودة ضمن الحدود المقبولة (PASS)");
      }
      setMeasuredValue("");
      setRunActionNote("");
      await loadChart(selectedLotId);
    } catch (err) {
      toast.error(extractErr(err, "تعذر تسجيل قراءة الجودة"));
    } finally {
      setBusy(null);
    }
  };

  const handleReviewRun = async (runId: number) => {
    if (reviewText.trim().length < 5) {
      toast.error("يرجى كتابة الإجراء التصحيحي (5 أحرف على الأقل)");
      return;
    }
    setBusy(`review-${runId}`);
    try {
      await apiClient.post(`/lab/qc/runs/${runId}/review`, {
        correctiveAction: reviewText.trim(),
      });
      toast.success("تم اعتماد الإجراء التصحيحي برقابة 4 عيون");
      setReviewingRunId(null);
      setReviewText("");
      if (selectedLotId) await loadChart(selectedLotId);
    } catch (err) {
      toast.error(extractErr(err, "تعذر اعتماد المراجعة"));
    } finally {
      setBusy(null);
    }
  };

  // SVG Levey-Jennings geometry
  const chartWidth = 640;
  const chartHeight = 220;
  const padX = 48;
  const padY = 18;
  const plotW = chartWidth - padX * 2;
  const plotH = chartHeight - padY * 2;
  const zToY = (z: number) => {
    const clamped = Math.max(-3.5, Math.min(3.5, z));
    return padY + ((3.5 - clamped) / 7) * plotH;
  };
  const runs = chartData?.runs || [];
  const points = runs.map((run, idx) => {
    const x =
      runs.length === 1
        ? padX + plotW / 2
        : padX + (idx / (runs.length - 1)) * plotW;
    const z = Number(run.zScore);
    const y = zToY(Number.isFinite(z) ? z : 0);
    return { run, x, y, z };
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      dir={isRtl ? "rtl" : "ltr"}
      role="dialog"
      aria-label={t("lab.qc.title", "ضبط الجودة الداخلي (Westgard QC)")}
    >
      <div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-white">
              {t("lab.qc.title", "ضبط الجودة الداخلي للمختبر (Westgard QC)")}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t(
                "lab.qc.subtitle",
                "مخططات Levey-Jennings، قواعد Westgard التلقائية (1-2s / 1-3s / 2-2s / R-4s / 4-1s / 10x)، ومراجعة الإجراء التصحيحي بـ 4 عيون",
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewLotForm((v) => !v)}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white transition"
            >
              {showNewLotForm ? "إخفاء نموذج التشغيلة" : "+ تشغيلة QC جديدة"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
            >
              {t("common.close", "إغلاق")}
            </button>
          </div>
        </div>

        {showNewLotForm && (
          <form
            onSubmit={handleCreateLot}
            className="rounded-2xl border border-sky-800/60 bg-slate-900/70 p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-sky-300">
              تسجيل تشغيلة ضبط جودة جديدة (QC Lot)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <select
                aria-label="الفحص المخبري"
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                required
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              >
                <option value="">اختر الفحص المخبري...</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
              <input
                value={analyzerName}
                onChange={(e) => setAnalyzerName(e.target.value)}
                placeholder="اسم الجهاز (مثل Cobas c311)"
                required
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
              <input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="رقم التشغيلة (Lot #)"
                required
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <select
                aria-label="المستوى"
                value={level}
                onChange={(e) => setLevel(e.target.value as QcLevel)}
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              >
                {(Object.keys(LEVEL_LABELS) as QcLevel[]).map((lv) => (
                  <option key={lv} value={lv}>
                    {LEVEL_LABELS[lv]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.0001"
                value={targetMean}
                onChange={(e) => setTargetMean(e.target.value)}
                placeholder="المتوسط المستهدف (Mean)"
                required
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={targetSd}
                onChange={(e) => setTargetSd(e.target.value)}
                placeholder="الانحراف المعياري (SD)"
                required
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="الوحدة (mg/dL)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={busy === "create-lot"}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
            >
              حفظ التشغيلة
            </button>
          </form>
        )}

        {loading && (
          <div className="text-center py-8 text-sm text-slate-400">
            جاري تحميل بيانات ضبط الجودة...
          </div>
        )}

        {!loading && lots.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
            لا توجد تشغيلات ضبط جودة نشطة بعد. انقر على «+ تشغيلة QC جديدة» للبدء.
          </div>
        )}

        {!loading && lots.length > 0 && (
          <div className="space-y-5">
            {/* Lot Selector + Record Run */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  التشغيلة النشطة (QC Lot)
                </label>
                <select
                  aria-label="اختيار تشغيلة ضبط الجودة"
                  value={selectedLotId ?? ""}
                  onChange={(e) => void handleSelectLot(Number(e.target.value))}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs"
                >
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.test?.code || `#${l.testId}`} — {l.analyzerName} | Lot{" "}
                      {l.lotNumber} ({LEVEL_LABELS[l.level]})
                    </option>
                  ))}
                </select>
                {chartData && (
                  <div className="grid grid-cols-4 gap-2 pt-2 text-[11px] font-mono">
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-center">
                      <div className="text-slate-400">Mean</div>
                      <div className="font-bold text-emerald-300">
                        {chartData.bands.mean}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-center">
                      <div className="text-slate-400">SD</div>
                      <div className="font-bold text-sky-300">
                        {chartData.bands.sd}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-center">
                      <div className="text-slate-400">±2SD</div>
                      <div className="font-bold text-amber-300">
                        {chartData.bands.minus2Sd}–{chartData.bands.plus2Sd}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-center">
                      <div className="text-slate-400">±3SD</div>
                      <div className="font-bold text-rose-300">
                        {chartData.bands.minus3Sd}–{chartData.bands.plus3Sd}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={handleRecordRun}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"
              >
                <div className="text-xs font-bold text-emerald-300">
                  تسجيل قراءة جودة جديدة (Westgard Auto-Evaluation)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <input
                    type="number"
                    step="0.0001"
                    value={measuredValue}
                    onChange={(e) => setMeasuredValue(e.target.value)}
                    placeholder="القيمة المقاسة (Measured Value)"
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
                  />
                  <input
                    value={runActionNote}
                    onChange={(e) => setRunActionNote(e.target.value)}
                    placeholder="ملاحظة / إجراء فوري (اختياري)"
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy === "record-run"}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white"
                >
                  تسجيل وتقييم Westgard
                </button>
              </form>
            </div>

            {/* Summary KPI + SVG Levey-Jennings Chart */}
            {chartData && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">
                    مخطط Levey-Jennings ({chartData.lot.test?.name || "QC"})
                  </h3>
                  <div className="flex gap-2 text-xs font-mono">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200">
                      إجمالي: {chartData.summary.totalRuns}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                      PASS: {chartData.summary.passCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-950/70 text-amber-300 border border-amber-500/30">
                      WARNING: {chartData.summary.warningCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-rose-950/70 text-rose-300 border border-rose-500/30">
                      REJECT: {chartData.summary.rejectCount}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    className="w-full max-w-4xl mx-auto rounded-xl bg-slate-950 border border-slate-800"
                    role="img"
                    aria-label="Levey-Jennings QC Chart"
                  >
                    {[
                      { z: 3, label: "+3SD", stroke: "#f43f5e", dash: "4 4" },
                      { z: 2, label: "+2SD", stroke: "#f59e0b", dash: "4 4" },
                      { z: 1, label: "+1SD", stroke: "#38bdf8", dash: "2 4" },
                      { z: 0, label: "Mean", stroke: "#10b981", dash: "" },
                      { z: -1, label: "-1SD", stroke: "#38bdf8", dash: "2 4" },
                      { z: -2, label: "-2SD", stroke: "#f59e0b", dash: "4 4" },
                      { z: -3, label: "-3SD", stroke: "#f43f5e", dash: "4 4" },
                    ].map((band) => {
                      const y = zToY(band.z);
                      return (
                        <g key={band.label}>
                          <line
                            x1={padX}
                            x2={chartWidth - padX}
                            y1={y}
                            y2={y}
                            stroke={band.stroke}
                            strokeWidth={band.z === 0 ? 1.5 : 1}
                            strokeDasharray={band.dash}
                            opacity={0.7}
                          />
                          <text
                            x={8}
                            y={y + 4}
                            fill={band.stroke}
                            fontSize={10}
                            fontFamily="monospace"
                          >
                            {band.label}
                          </text>
                        </g>
                      );
                    })}

                    {points.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                      />
                    )}

                    {points.map((p) => {
                      const fill =
                        p.run.status === "REJECT"
                          ? "#f43f5e"
                          : p.run.status === "WARNING"
                            ? "#f59e0b"
                            : "#10b981";
                      return (
                        <circle
                          key={p.run.id}
                          cx={p.x}
                          cy={p.y}
                          r={4.5}
                          fill={fill}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                        >
                          <title>
                            {`Val: ${p.run.measuredValue} | Z: ${p.run.zScore} | ${p.run.status}`}
                          </title>
                        </circle>
                      );
                    })}
                  </svg>
                </div>

                {/* Runs Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="p-2.5">الوقت</th>
                        <th className="p-2.5">القيمة</th>
                        <th className="p-2.5">Z-Score</th>
                        <th className="p-2.5">الحالة</th>
                        <th className="p-2.5">قواعد Westgard</th>
                        <th className="p-2.5">الإجراء التصحيحي / 4 عيون</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {[...runs].reverse().map((r) => {
                        const badge = STATUS_BADGES[r.status];
                        return (
                          <tr key={r.id} className="hover:bg-slate-900/50">
                            <td className="p-2.5 font-mono text-slate-400">
                              {r.measuredAt.slice(0, 16).replace("T", " ")}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-white">
                              {r.measuredValue}
                            </td>
                            <td className="p-2.5 font-mono">{r.zScore} SD</td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono">
                              {r.violatedRules && r.violatedRules.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {r.violatedRules.map((rule) => (
                                    <span
                                      key={rule}
                                      className="px-1.5 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-500/40"
                                    >
                                      {rule}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-2.5">
                              {r.reviewedBy ? (
                                <div className="text-emerald-300">
                                  ✓ معتمد ({r.reviewedBy.fullName}):{" "}
                                  {r.correctiveAction}
                                </div>
                              ) : reviewingRunId === r.id ? (
                                <div className="flex gap-1.5 items-center">
                                  <input
                                    value={reviewText}
                                    onChange={(e) =>
                                      setReviewText(e.target.value)
                                    }
                                    placeholder="وصف الإجراء التصحيحي..."
                                    className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleReviewRun(r.id)}
                                    disabled={busy === `review-${r.id}`}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                  >
                                    اعتماد
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">
                                    {r.correctiveAction || "—"}
                                  </span>
                                  {r.status !== "PASS" && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReviewingRunId(r.id);
                                        setReviewText(
                                          r.correctiveAction || "",
                                        );
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                                    >
                                      مراجعة 4 عيون
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {runs.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-6 text-center text-slate-500"
                          >
                            لا توجد قراءات مسجلة لهذه التشغيلة بعد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
