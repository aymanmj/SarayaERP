// src/components/encounter/VitalsPane.tsx

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart,
} from "recharts";

// ── Vital Sign Helper ──
interface VitalConfig {
  key: string;
  label: string;
  icon: string;
  unit: string;
  color: string;
  bgColor: string;
  borderColor: string;
  placeholder: string;
  step?: string;
  normalRange?: string;
}

const vitalConfigs: VitalConfig[] = [
  { key: 'bpSystolic', label: 'الضغط العالي', icon: '💓', unit: 'mmHg', color: 'text-sky-400', bgColor: 'bg-sky-950/30', borderColor: 'border-sky-800/40', placeholder: 'Sys', normalRange: '90-140' },
  { key: 'bpDiastolic', label: 'الضغط المنخفض', icon: '💓', unit: 'mmHg', color: 'text-sky-300', bgColor: 'bg-sky-950/20', borderColor: 'border-sky-800/30', placeholder: 'Dia', normalRange: '60-90' },
  { key: 'pulse', label: 'النبض', icon: '❤️', unit: 'bpm', color: 'text-rose-400', bgColor: 'bg-rose-950/30', borderColor: 'border-rose-800/40', placeholder: '72', normalRange: '60-100' },
  { key: 'temperature', label: 'الحرارة', icon: '🌡️', unit: '°C', color: 'text-amber-400', bgColor: 'bg-amber-950/30', borderColor: 'border-amber-800/40', placeholder: '37.0', step: '0.1', normalRange: '36.1-37.2' },
  { key: 'o2Sat', label: 'الأكسجين', icon: '🫁', unit: '%', color: 'text-emerald-400', bgColor: 'bg-emerald-950/30', borderColor: 'border-emerald-800/40', placeholder: '98', normalRange: '95-100' },
  { key: 'respRate', label: 'التنفس', icon: '🌬️', unit: '/min', color: 'text-cyan-400', bgColor: 'bg-cyan-950/30', borderColor: 'border-cyan-800/40', placeholder: '16', normalRange: '12-20' },
];

const bodyConfigs: VitalConfig[] = [
  { key: 'weight', label: 'الوزن', icon: '⚖️', unit: 'kg', color: 'text-violet-400', bgColor: 'bg-violet-950/30', borderColor: 'border-violet-800/40', placeholder: '70.0', step: '0.1' },
  { key: 'height', label: 'الطول', icon: '📏', unit: 'cm', color: 'text-indigo-400', bgColor: 'bg-indigo-950/30', borderColor: 'border-indigo-800/40', placeholder: '170' },
];

// Get flag for abnormal values
function getVitalFlag(key: string, value: number): { flag: string; className: string } | null {
  const ranges: Record<string, [number, number]> = {
    bpSystolic: [90, 140], bpDiastolic: [60, 90], pulse: [60, 100],
    temperature: [36.1, 37.2], o2Sat: [95, 100], respRate: [12, 20],
  };
  const r = ranges[key];
  if (!r) return null;
  if (value < r[0]) return { flag: '↓', className: 'text-sky-400' };
  if (value > r[1]) return { flag: '↑', className: 'text-rose-400' };
  return null;
}

export function VitalsPane({ encounterId }: { encounterId: number }) {
  const [vitalsList, setVitalsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    temperature: "", bpSystolic: "", bpDiastolic: "",
    pulse: "", respRate: "", o2Sat: "",
    weight: "", height: "", note: "",
  });

  const bmi = form.weight && form.height
    ? (Number(form.weight) / Math.pow(Number(form.height) / 100, 2)).toFixed(1)
    : "—";

  const bmiCategory = useMemo(() => {
    if (bmi === "—") return { label: "—", color: "text-slate-500" };
    const v = Number(bmi);
    if (v < 18.5) return { label: "نقص وزن", color: "text-sky-400" };
    if (v < 25) return { label: "طبيعي", color: "text-emerald-400" };
    if (v < 30) return { label: "زيادة وزن", color: "text-amber-400" };
    return { label: "سمنة", color: "text-rose-400" };
  }, [bmi]);

  const loadVitals = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/vitals/encounter/${encounterId}`);
      setVitalsList(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (encounterId) loadVitals(); }, [encounterId]);

  const handleSubmit = async () => {
    if (!form.bpSystolic && !form.temperature && !form.pulse && !form.o2Sat) {
      toast.warning("يرجى إدخال قيمة واحدة على الأقل.");
      return;
    }
    try {
      await apiClient.post(`/vitals/encounter/${encounterId}`, {
        temperature: form.temperature ? Number(form.temperature) : undefined,
        bpSystolic: form.bpSystolic ? Number(form.bpSystolic) : undefined,
        bpDiastolic: form.bpDiastolic ? Number(form.bpDiastolic) : undefined,
        pulse: form.pulse ? Number(form.pulse) : undefined,
        respRate: form.respRate ? Number(form.respRate) : undefined,
        o2Sat: form.o2Sat ? Number(form.o2Sat) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        height: form.height ? Number(form.height) : undefined,
        bmi: bmi !== "—" ? Number(bmi) : undefined,
        note: form.note || undefined,
      });
      toast.success("تم تسجيل العلامات الحيوية");
      setForm({ temperature: "", bpSystolic: "", bpDiastolic: "", pulse: "", respRate: "", o2Sat: "", weight: "", height: "", note: "" });
      setShowForm(false);
      loadVitals();
    } catch { toast.error("فشل الحفظ"); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // --- Charts Logic ---
  const [activeTab, setActiveTab] = useState<"LIST" | "CHARTS">("LIST");
  const [chartType, setChartType] = useState<"TRENDS" | "GROWTH">("TRENDS");

  const trendsData = [...vitalsList]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((v) => ({
      date: new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      time: new Date(v.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      temp: v.temperature, systolic: v.bpSystolic, diastolic: v.bpDiastolic,
      pulse: v.pulse, weight: v.weight, o2Sat: v.o2Sat,
    }));

  const growthData = [...vitalsList]
    .filter(v => v.weight)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((v, i) => ({
      label: `قراءة ${i + 1}`,
      date: new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      weight: v.weight, bmi: v.bmi,
    }));

  // Latest vitals summary
  const latest = vitalsList.length > 0 ? vitalsList[0] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-slate-500 animate-pulse">
        جاري تحميل البيانات...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Tabs Header */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5">
          <button
            onClick={() => setActiveTab("LIST")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "LIST"
                ? "bg-sky-600 text-white shadow-lg shadow-sky-900/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            📝 القراءات
          </button>
          <button
            onClick={() => setActiveTab("CHARTS")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "CHARTS"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-900/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            📈 الرسوم البيانية
          </button>
        </div>

        {activeTab === "LIST" && (
          <button
            onClick={() => setShowForm(!showForm)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              showForm
                ? "bg-slate-800 text-slate-400 border border-slate-700"
                : "bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/30"
            }`}
          >
            {showForm ? "✕ إغلاق" : "+ قراءة جديدة"}
          </button>
        )}
      </div>

      {activeTab === "LIST" ? (
        <>
          {/* ── Latest Vitals Summary Cards (only show available values) ── */}
          {latest && (() => {
            const cards = [
              { label: 'ضغط الدم', value: latest.bpSystolic ? `${latest.bpSystolic}/${latest.bpDiastolic}` : null, icon: '💓', color: 'text-sky-400', bg: 'bg-sky-950/20 border-sky-800/30', suffix: 'mmHg' },
              { label: 'النبض', value: latest.pulse, icon: '❤️', color: 'text-rose-400', bg: 'bg-rose-950/20 border-rose-800/30', suffix: 'bpm' },
              { label: 'الحرارة', value: latest.temperature, icon: '🌡️', color: 'text-amber-400', bg: 'bg-amber-950/20 border-amber-800/30', suffix: '°C' },
              { label: 'الأكسجين', value: latest.o2Sat, icon: '🫁', color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-800/30', suffix: '%' },
              { label: 'التنفس', value: latest.respRate, icon: '🌬️', color: 'text-cyan-400', bg: 'bg-cyan-950/20 border-cyan-800/30', suffix: '/min' },
              { label: 'الوزن', value: latest.weight, icon: '⚖️', color: 'text-violet-400', bg: 'bg-violet-950/20 border-violet-800/30', suffix: 'kg' },
            ].filter(c => c.value != null);
            return cards.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cards.map((card, i) => (
                  <div key={i} className={`rounded-xl border px-4 py-2.5 text-center flex-1 min-w-[100px] max-w-[160px] ${card.bg}`}>
                    <div className="text-[10px] text-slate-500 mb-0.5 flex items-center justify-center gap-1">
                      <span>{card.icon}</span> {card.label}
                    </div>
                    <div className={`text-xl font-bold font-mono ${card.color}`}>
                      {card.value}
                    </div>
                    {card.suffix && (
                      <div className="text-[8px] text-slate-600 mt-0.5">{card.suffix}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null;
          })()}

          {/* ── Input Form ── */}
          {showForm && (
            <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg">
              <h3 className="text-sm font-bold text-sky-400 flex items-center gap-2">
                📝 تسجيل قراءة جديدة
              </h3>

              {/* Vital Signs Grid — 3 columns, spacious */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {vitalConfigs.map(vc => (
                  <div key={vc.key} className={`rounded-xl border p-3 ${vc.bgColor} ${vc.borderColor}`}>
                    <label className="text-[10px] text-slate-400 block mb-1 font-bold flex items-center gap-1">
                      <span>{vc.icon}</span> {vc.label}
                      <span className="mr-auto text-[8px] text-slate-600 font-normal">{vc.unit}</span>
                    </label>
                    <input
                      name={vc.key}
                      type="number"
                      step={vc.step || "1"}
                      value={(form as any)[vc.key]}
                      onChange={handleChange}
                      placeholder={vc.placeholder}
                      className={`w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2.5 text-base font-mono font-bold text-center outline-none focus:border-sky-500 transition-all ${vc.color} placeholder:text-slate-700`}
                    />
                    {vc.normalRange && (
                      <div className="text-[8px] text-slate-600 text-center mt-1">
                        الطبيعي: {vc.normalRange}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Body Measurements */}
              <div className="grid grid-cols-3 gap-3">
                {bodyConfigs.map(bc => (
                  <div key={bc.key} className={`rounded-xl border p-3 ${bc.bgColor} ${bc.borderColor}`}>
                    <label className="text-[10px] text-slate-400 block mb-1 font-bold flex items-center gap-1">
                      <span>{bc.icon}</span> {bc.label}
                      <span className="mr-auto text-[8px] text-slate-600 font-normal">{bc.unit}</span>
                    </label>
                    <input
                      name={bc.key}
                      type="number"
                      step={bc.step || "1"}
                      value={(form as any)[bc.key]}
                      onChange={handleChange}
                      placeholder={bc.placeholder}
                      className={`w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2.5 text-base font-mono font-bold text-center outline-none focus:border-sky-500 transition-all ${bc.color} placeholder:text-slate-700`}
                    />
                  </div>
                ))}
                {/* BMI Auto-Calculated */}
                <div className="rounded-xl border p-3 bg-slate-800/30 border-slate-700/40">
                  <label className="text-[10px] text-slate-400 block mb-1 font-bold flex items-center gap-1">
                    <span>📊</span> BMI
                    <span className="mr-auto text-[8px] text-slate-600 font-normal">تلقائي</span>
                  </label>
                  <div className={`w-full bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2.5 text-base font-mono font-bold text-center ${bmiCategory.color}`}>
                    {bmi}
                  </div>
                  {bmi !== "—" && (
                    <div className={`text-[9px] text-center mt-1 font-bold ${bmiCategory.color}`}>
                      {bmiCategory.label}
                    </div>
                  )}
                </div>
              </div>

              {/* Note */}
              <input
                name="note"
                value={form.note}
                onChange={handleChange}
                placeholder="ملاحظات (اختياري)..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-sky-500 text-slate-300 placeholder:text-slate-600 transition-all"
              />

              {/* Submit */}
              <button
                onClick={handleSubmit}
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-xl font-bold shadow-lg shadow-sky-900/30 transition-all active:scale-[0.98]"
              >
                💾 حفظ العلامات الحيوية
              </button>
            </div>
          )}

          {/* ── Vitals History ── */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-2">
              📋 سجل القراءات
              {vitalsList.length > 0 && (
                <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded normal-case">
                  {vitalsList.length} قراءة
                </span>
              )}
            </h3>

            {vitalsList.length === 0 && (
              <div className="text-center py-8 text-slate-600 text-xs border border-dashed border-slate-800 rounded-2xl">
                لا توجد قراءات مسجلة — اضغط "+ قراءة جديدة" لتسجيل أول قراءة
              </div>
            )}

            {vitalsList.map((v) => {
              const time = new Date(v.createdAt).toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" });
              const date = new Date(v.createdAt).toLocaleDateString("ar-LY", { day: "numeric", month: "short" });

              return (
                <div key={v.id} className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 hover:bg-slate-900/50 transition-all">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Timestamp */}
                    <div className="text-[10px] text-slate-500 font-mono min-w-[80px] text-center bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                      <div className="text-slate-400 font-bold">{time}</div>
                      <div className="text-[8px]">{date}</div>
                    </div>

                    {/* Values */}
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      {v.bpSystolic && (
                        <div className="flex items-center gap-1 bg-sky-950/30 border border-sky-800/30 px-2.5 py-1 rounded-lg">
                          <span className="text-[10px]">💓</span>
                          <span className="text-sm font-bold font-mono text-sky-400">{v.bpSystolic}/{v.bpDiastolic}</span>
                          <span className="text-[8px] text-slate-600">mmHg</span>
                        </div>
                      )}
                      {v.pulse && (() => {
                        const flag = getVitalFlag('pulse', v.pulse);
                        return (
                          <div className="flex items-center gap-1 bg-rose-950/30 border border-rose-800/30 px-2.5 py-1 rounded-lg">
                            <span className="text-[10px]">❤️</span>
                            <span className="text-sm font-bold font-mono text-rose-400">{v.pulse}</span>
                            {flag && <span className={`text-xs font-bold ${flag.className}`}>{flag.flag}</span>}
                            <span className="text-[8px] text-slate-600">bpm</span>
                          </div>
                        );
                      })()}
                      {v.temperature && (() => {
                        const flag = getVitalFlag('temperature', v.temperature);
                        return (
                          <div className="flex items-center gap-1 bg-amber-950/30 border border-amber-800/30 px-2.5 py-1 rounded-lg">
                            <span className="text-[10px]">🌡️</span>
                            <span className="text-sm font-bold font-mono text-amber-400">{v.temperature}°</span>
                            {flag && <span className={`text-xs font-bold ${flag.className}`}>{flag.flag}</span>}
                          </div>
                        );
                      })()}
                      {v.o2Sat && (() => {
                        const flag = getVitalFlag('o2Sat', v.o2Sat);
                        return (
                          <div className="flex items-center gap-1 bg-emerald-950/30 border border-emerald-800/30 px-2.5 py-1 rounded-lg">
                            <span className="text-[10px]">🫁</span>
                            <span className="text-sm font-bold font-mono text-emerald-400">{v.o2Sat}%</span>
                            {flag && <span className={`text-xs font-bold ${flag.className}`}>{flag.flag}</span>}
                          </div>
                        );
                      })()}
                      {v.respRate && (
                        <div className="flex items-center gap-1 bg-cyan-950/30 border border-cyan-800/30 px-2.5 py-1 rounded-lg">
                          <span className="text-[10px]">🌬️</span>
                          <span className="text-sm font-bold font-mono text-cyan-400">{v.respRate}</span>
                          <span className="text-[8px] text-slate-600">/min</span>
                        </div>
                      )}
                      {v.weight && (
                        <div className="flex items-center gap-1 bg-violet-950/30 border border-violet-800/30 px-2.5 py-1 rounded-lg">
                          <span className="text-[10px]">⚖️</span>
                          <span className="text-sm font-bold font-mono text-violet-400">{v.weight}</span>
                          <span className="text-[8px] text-slate-600">kg</span>
                        </div>
                      )}
                    </div>

                    {/* Recorder */}
                    {v.createdBy && (
                      <span className="text-[9px] text-slate-600 italic">
                        {v.createdBy.fullName}
                      </span>
                    )}
                  </div>
                  {v.note && (
                    <div className="mt-2 text-[10px] text-slate-500 bg-slate-900/50 px-2 py-1 rounded border border-slate-800">
                      📝 {v.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* ── Charts Section ── */
        <div className="space-y-5">
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setChartType("TRENDS")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${chartType === "TRENDS" ? "bg-sky-600 text-white shadow-lg" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
            >
              📊 مؤشرات الحيوية
            </button>
            <button
              onClick={() => setChartType("GROWTH")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${chartType === "GROWTH" ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
            >
              📏 الوزن والنمو
            </button>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl h-[400px]">
            {chartType === "TRENDS" ? (
              trendsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", fontSize: "12px", borderRadius: "12px" }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="systolic" name="الضغط العالي" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="diastolic" name="الضغط المنخفض" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="pulse" name="النبض" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="temp" name="الحرارة" stroke="#f59e0b" strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="o2Sat" name="O₂ %" stroke="#10b981" strokeWidth={2} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <span className="text-4xl">📊</span>
                  <p className="text-sm">لا توجد بيانات لعرض الرسوم البيانية.</p>
                  <p className="text-xs text-slate-600">سجّل علامات حيوية أولاً.</p>
                </div>
              )
            ) : (
              growthData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} label={{ value: "الوزن (kg)", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", fontSize: "12px", borderRadius: "12px" }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={3} name="وزن المريض"
                      dot={{ r: 5, strokeWidth: 2, fill: "#0f172a" }} activeDot={{ r: 7 }} />
                    {growthData.some(d => d.bmi) && (
                      <Line type="monotone" dataKey="bmi" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5"
                        name="BMI" dot={{ r: 3 }} connectNulls />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <span className="text-4xl">📏</span>
                  <p className="text-sm">لا توجد قياسات وزن.</p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
