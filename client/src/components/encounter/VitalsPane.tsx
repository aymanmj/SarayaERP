// src/components/encounter/VitalsPane.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
} from "recharts";

export function VitalsPane({ encounterId }: { encounterId: number }) {
  const [vitalsList, setVitalsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    temperature: "",
    bpSystolic: "",
    bpDiastolic: "",
    pulse: "",
    respRate: "",
    o2Sat: "",
    weight: "",
    height: "",
    note: "",
  });

  const bmi =
    form.weight && form.height
      ? (Number(form.weight) / Math.pow(Number(form.height) / 100, 2)).toFixed(1)
      : "—";

  const loadVitals = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/vitals/encounter/${encounterId}`);
      setVitalsList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (encounterId) loadVitals();
  }, [encounterId]);

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
      setForm({
        temperature: "", bpSystolic: "", bpDiastolic: "",
        pulse: "", respRate: "", o2Sat: "",
        weight: "", height: "", note: "",
      });
      loadVitals();
    } catch (err) {
      toast.error("فشل الحفظ");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // --- Charts Logic ---
  const [activeTab, setActiveTab] = useState<"LIST" | "CHARTS">("LIST");
  const [chartType, setChartType] = useState<"TRENDS" | "GROWTH">("TRENDS");

  // Prepare Data for Trends
  const trendsData = [...vitalsList]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((v) => ({
      date: new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      time: new Date(v.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      temp: v.temperature,
      systolic: v.bpSystolic,
      diastolic: v.bpDiastolic,
      pulse: v.pulse,
      weight: v.weight,
      o2Sat: v.o2Sat,
    }));

  // Growth chart: Weight over time with simple reference bands
  const growthData = [...vitalsList]
    .filter(v => v.weight)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((v, i) => ({
      label: `قراءة ${i + 1}`,
      date: new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      weight: v.weight,
      bmi: v.bmi,
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-slate-500 animate-pulse">
        جاري تحميل البيانات...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs Header */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("LIST")}
          className={`px-4 py-2 text-sm font-bold transition-colors ${
            activeTab === "LIST"
              ? "text-sky-400 border-b-2 border-sky-400"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          📝 تسجيل وقائمة
        </button>
        <button
          onClick={() => setActiveTab("CHARTS")}
          className={`px-4 py-2 text-sm font-bold transition-colors ${
            activeTab === "CHARTS"
              ? "text-rose-400 border-b-2 border-rose-400"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          📈 الرسوم البيانية
        </button>
      </div>

      {activeTab === "LIST" ? (
        <>
          {/* 🟢 فورم الإدخال 🟢 */}
          <div className="bg-slate-900/60 border border-slate-700 p-5 rounded-3xl shadow-inner">
            <h3 className="text-sm font-bold text-sky-400 mb-5 flex items-center gap-2">
              <span>📝</span> تسجيل قراءة جديدة
            </h3>

            <div className="space-y-5">
              <div className="grid grid-cols-12 gap-3">
                {/* BP */}
                <div className="col-span-5">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">الضغط (BP)</label>
                  <div className="flex gap-1.5 items-center bg-slate-950 border border-slate-700 rounded-xl px-2 py-1 focus-within:border-sky-500 transition-all">
                    <input name="bpDiastolic" placeholder="Dia" type="number" value={form.bpDiastolic} onChange={handleChange}
                      className="w-full bg-transparent text-slate-100 text-sm text-center outline-none" />
                    <span className="text-slate-600 font-bold">/</span>
                    <input name="bpSystolic" placeholder="Sys" type="number" value={form.bpSystolic} onChange={handleChange}
                      className="w-full bg-transparent text-slate-100 text-sm text-center outline-none" />
                  </div>
                </div>
                {/* Pulse */}
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">النبض</label>
                  <input name="pulse" type="number" value={form.pulse} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm text-center text-slate-100 outline-none focus:border-sky-500" placeholder="HR" />
                </div>
                {/* Temp */}
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">الحرارة</label>
                  <input name="temperature" type="number" step="0.1" value={form.temperature} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm text-center text-slate-100 outline-none focus:border-sky-500" placeholder="°C" />
                </div>
                {/* SpO2 */}
                <div className="col-span-3">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">الأكسجين</label>
                  <input name="o2Sat" type="number" value={form.o2Sat} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm text-center text-slate-100 outline-none focus:border-sky-500" placeholder="SpO2" />
                </div>
              </div>

              {/* Body measurements */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">الوزن (kg)</label>
                  <input name="weight" type="number" step="0.1" value={form.weight} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">الطول (cm)</label>
                  <input name="height" type="number" value={form.height} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">مؤشر الكتلة BMI</label>
                  <div className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-sky-400 font-bold text-center">
                    {bmi}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-sky-900/20 transition-all active:scale-95"
              >
                حفظ العلامات الحيوية
              </button>
            </div>
          </div>

          {/* سجل القراءات */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
              سجل القراءات السابقة
            </h3>
            {vitalsList.length === 0 && (
              <div className="text-center py-8 text-slate-600 font-mono text-xs border border-dashed border-slate-800 rounded-2xl">
                -- لا توجد بيانات --
              </div>
            )}
            {vitalsList.map((v) => (
              <div
                key={v.id}
                className="bg-slate-950/40 border border-slate-800 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-slate-500">
                    {new Date(v.createdAt).toLocaleTimeString("ar-LY", {
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  {v.bpSystolic && (
                    <span className="text-slate-200">
                      <b className="text-sky-500/70 ml-1">BP:</b>
                      {v.bpSystolic}/{v.bpDiastolic}
                    </span>
                  )}
                  {v.pulse && (
                    <span className="text-slate-200">
                      <b className="text-rose-500/70 ml-1">HR:</b>
                      {v.pulse}
                    </span>
                  )}
                  {v.temperature && (
                    <span className="text-slate-200">
                      <b className="text-amber-500/70 ml-1">T:</b>
                      {v.temperature}°
                    </span>
                  )}
                  {v.o2Sat && (
                    <span className="text-slate-200">
                      <b className="text-emerald-500/70 ml-1">O2:</b>
                      {v.o2Sat}%
                    </span>
                  )}
                  {v.weight && (
                    <span className="text-slate-200">
                      <b className="text-violet-500/70 ml-1">Wt:</b>
                      {v.weight}kg
                    </span>
                  )}
                </div>
                {v.createdBy && (
                  <span className="text-[10px] text-slate-600 italic">
                    {v.createdBy.fullName}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* 🔵 قسم الرسوم البيانية 🔵 */
        <div className="space-y-6">
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setChartType("TRENDS")}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${chartType === "TRENDS" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
            >
              مؤشرات الحيوية (Trends)
            </button>
            <button
              onClick={() => setChartType("GROWTH")}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${chartType === "GROWTH" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`}
            >
              مخطط الوزن والنمو (Growth)
            </button>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-3xl h-[400px]">
            {chartType === "TRENDS" ? (
              trendsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", fontSize: "12px" }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="systolic" name="الضغط العالي" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="diastolic" name="الضغط المنخفض" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="pulse" name="النبض" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="temp" name="الحرارة" stroke="#f59e0b" strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="o2Sat" name="الأكسجين %" stroke="#10b981" strokeWidth={2} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <span className="text-4xl">📊</span>
                  <p className="text-sm">لا توجد بيانات لعرض الرسوم البيانية.</p>
                  <p className="text-xs text-slate-600">سجّل علامات حيوية من تبويب "تسجيل وقائمة" أولاً.</p>
                </div>
              )
            ) : (
              /* Growth Chart — Weight over time */
              growthData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tick={{ fontSize: 10 }}
                      label={{ value: "التاريخ", position: "insideBottomRight", fill: "#94a3b8" }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 10 }}
                      label={{ value: "الوزن (kg)", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", fontSize: "12px" }}
                      labelStyle={{ color: "#e2e8f0" }}
                      formatter={(value: any, name: string) => {
                        if (name === "وزن المريض") return [`${value} kg`, name];
                        if (name === "مؤشر الكتلة (BMI)") return [value, name];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#10b981"
                      strokeWidth={3}
                      name="وزن المريض"
                      dot={{ r: 5, strokeWidth: 2, fill: "#0f172a" }}
                      activeDot={{ r: 7 }}
                    />
                    {growthData.some(d => d.bmi) && (
                      <Line
                        type="monotone"
                        dataKey="bmi"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="مؤشر الكتلة (BMI)"
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <span className="text-4xl">📏</span>
                  <p className="text-sm">لا توجد قياسات وزن مسجلة لعرض مخطط النمو.</p>
                  <p className="text-xs text-slate-600">أضف قراءات تحتوي على الوزن من نموذج التسجيل.</p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
