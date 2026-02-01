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

// ... (نفس التعريفات للأنواع Types تبقى كما هي) ...

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
      ? (Number(form.weight) / Math.pow(Number(form.height) / 100, 2)).toFixed(
          1,
        )
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
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((v) => ({
      date: new Date(v.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      }),
      time: new Date(v.createdAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      fullDate: new Date(v.createdAt),
      temp: v.temperature,
      systolic: v.bpSystolic,
      diastolic: v.bpDiastolic,
      pulse: v.pulse,
      weight: v.weight,
    }));

  // Prepare Data for Growth Chart (Demo)
  // ...

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
          {/* 🟢 فورم الإدخال المحسن التنسيق 🟢 */}
          <div className="bg-slate-900/60 border border-slate-700 p-5 rounded-3xl shadow-inner">
            <h3 className="text-sm font-bold text-sky-400 mb-5 flex items-center gap-2">
              <span>📝</span> تسجيل قراءة جديدة
            </h3>

            <div className="space-y-5">
              {/* الصف الأول: الشبكة الذكية */}
              <div className="grid grid-cols-12 gap-3">
                {/* الضغط - يأخذ مساحة أكبر (5 أعمدة) */}
                <div className="col-span-5 md:col-span-5">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">
                    الضغط (BP)
                  </label>
                  <div className="flex gap-1.5 items-center bg-slate-950 border border-slate-700 rounded-xl px-2 py-1 focus-within:border-sky-500 transition-all">
                    <input
                      name="bpDiastolic"
                      placeholder="Dia"
                      type="number"
                      value={form.bpDiastolic}
                      onChange={handleChange}
                      className="w-full bg-transparent text-slate-100 text-sm text-center outline-none"
                    />
                    <span className="text-slate-600 font-bold">/</span>

                    <input
                      name="bpSystolic"
                      placeholder="Sys"
                      type="number"
                      value={form.bpSystolic}
                      onChange={handleChange}
                      className="w-full bg-transparent text-slate-100 text-sm text-center outline-none"
                    />
                  </div>
                </div>

                {/* النبض - مساحة أصغر (2 أعمدة) */}
                <div className="col-span-2 md:col-span-2">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">
                    النبض
                  </label>
                  <input
                    name="pulse"
                    type="number"
                    value={form.pulse}
                    onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm text-center text-slate-100 outline-none focus:border-sky-500"
                    placeholder="HR"
                  />
                </div>

                {/* الحرارة - مساحة أصغر (2 أعمدة) */}
                <div className="col-span-2 md:col-span-2">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">
                    الحرارة
                  </label>
                  <input
                    name="temperature"
                    type="number"
                    step="0.1"
                    value={form.temperature}
                    onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm text-center text-slate-100 outline-none focus:border-sky-500"
                    placeholder="°C"
                  />
                </div>

                {/* الأكسجين - مساحة أصغر (3 أعمدة) */}
                <div className="col-span-3 md:col-span-3">
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">
                    الأكسجين
                  </label>
                  <input
                    name="o2Sat"
                    type="number"
                    value={form.o2Sat}
                    onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm text-center text-slate-100 outline-none focus:border-sky-500"
                    placeholder="SpO2"
                  />
                </div>
              </div>

              {/* الصف الثاني: القياسات الجسمانية */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">
                    الوزن (kg)
                  </label>
                  <input
                    name="weight"
                    type="number"
                    step="0.1"
                    value={form.weight}
                    onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">
                    الطول (cm)
                  </label>
                  <input
                    name="height"
                    type="number"
                    value={form.height}
                    onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-bold uppercase tracking-wider">
                    مؤشر الكتلة BMI
                  </label>
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

          {/* سجل القراءات والرسوم البيانية المبسطة */}
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
                      hour: "2-digit",
                      minute: "2-digit",
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
              مخطط النمو (Growth)
            </button>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-3xl h-[400px]">
            {chartType === "TRENDS" ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="time"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#1e293b",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="systolic"
                    name="الضغط العالي"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="diastolic"
                    name="الضغط المنخفض"
                    stroke="#0284c7"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pulse"
                    name="النبض"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="temp"
                    name="الحرارة"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              // Growth Chart (Weight for Age - Demo)
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tick={{ fontSize: 10 }}
                      label={{
                        value: "التاريخ",
                        position: "insideBottomRight",
                        fill: "#94a3b8",
                      }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      label={{
                        value: "الوزن (kg)",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#94a3b8",
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#1e293b",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey=""
                      fill="#84d8a0"
                      stroke="#84d8a0"
                      name="Normal Range (WHO)"
                      fillOpacity={0.1}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#10b981"
                      strokeWidth={3}
                      name="وزن المريض"
                      dot={{ r: 4, strokeWidth: 2, fill: "#0f172a" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="text-[10px] text-slate-600 bg-slate-950 px-2 py-1 rounded">
                  * مخطط تجريبي: يعرض الوزن المسجل (WHO Reference قادم قريباً)
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// // src/components/encounter/VitalsPane.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import { toast } from "sonner";

// type VitalSign = {
//   id: number;
//   temperature?: number;
//   bpSystolic?: number;
//   bpDiastolic?: number;
//   pulse?: number;
//   respRate?: number;
//   o2Sat?: number;
//   weight?: number;
//   height?: number;
//   bmi?: number;
//   note?: string;
//   createdAt: string;
//   createdBy?: { fullName: string };
// };

// export function VitalsPane({ encounterId }: { encounterId: number }) {
//   const [vitalsList, setVitalsList] = useState<VitalSign[]>([]);
//   const [loading, setLoading] = useState(false);

//   // Form State
//   const [form, setForm] = useState({
//     temperature: "",
//     bpSystolic: "",
//     bpDiastolic: "",
//     pulse: "",
//     respRate: "",
//     o2Sat: "",
//     weight: "",
//     height: "",
//     note: "",
//   });

//   // حساب مؤشر كتلة الجسم تلقائياً
//   const bmi =
//     form.weight && form.height
//       ? (Number(form.weight) / Math.pow(Number(form.height) / 100, 2)).toFixed(
//           1,
//         )
//       : "—";

//   const loadVitals = async () => {
//     try {
//       setLoading(true);
//       const res = await apiClient.get<VitalSign[]>(
//         `/vitals/encounter/${encounterId}`,
//       );
//       setVitalsList(res.data);
//     } catch (err) {
//       console.error(err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     if (encounterId) loadVitals();
//   }, [encounterId]);

//   const handleSubmit = async () => {
//     // تحقق بسيط
//     if (!form.bpSystolic && !form.temperature && !form.pulse && !form.weight) {
//       toast.warning("يرجى إدخال قيمة واحدة على الأقل.");
//       return;
//     }

//     try {
//       await apiClient.post(`/vitals/encounter/${encounterId}`, {
//         temperature: form.temperature ? Number(form.temperature) : undefined,
//         bpSystolic: form.bpSystolic ? Number(form.bpSystolic) : undefined,
//         bpDiastolic: form.bpDiastolic ? Number(form.bpDiastolic) : undefined,
//         pulse: form.pulse ? Number(form.pulse) : undefined,
//         respRate: form.respRate ? Number(form.respRate) : undefined,
//         o2Sat: form.o2Sat ? Number(form.o2Sat) : undefined,
//         weight: form.weight ? Number(form.weight) : undefined,
//         height: form.height ? Number(form.height) : undefined,
//         bmi: bmi !== "—" ? Number(bmi) : undefined,
//         note: form.note || undefined,
//       });

//       toast.success("تم تسجيل العلامات الحيوية");
//       // تصفير النموذج
//       setForm({
//         temperature: "",
//         bpSystolic: "",
//         bpDiastolic: "",
//         pulse: "",
//         respRate: "",
//         o2Sat: "",
//         weight: "",
//         height: "",
//         note: "",
//       });
//       loadVitals();
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل الحفظ");
//     }
//   };

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//   };

//   return (
//     <div className="space-y-6">
//       {/* فورم الإدخال */}
//       <div className="bg-slate-900/60 border border-slate-700 p-4 rounded-2xl shadow-sm">
//         <h3 className="text-sm font-semibold text-slate-200 mb-4 border-b border-slate-700/50 pb-2">
//           تسجيل قراءة جديدة
//         </h3>
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الضغط (BP)
//             </label>
//             <div className="flex gap-2 items-center">
//               <input
//                 name="bpSystolic"
//                 placeholder="Sys"
//                 type="number"
//                 value={form.bpSystolic}
//                 onChange={handleChange}
//                 className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-center focus:border-sky-500 outline-none"
//               />
//               <span className="text-slate-500">/</span>
//               <input
//                 name="bpDiastolic"
//                 placeholder="Dia"
//                 type="number"
//                 value={form.bpDiastolic}
//                 onChange={handleChange}
//                 className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-center focus:border-sky-500 outline-none"
//               />
//             </div>
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               النبض (Pulse)
//             </label>
//             <input
//               name="pulse"
//               type="number"
//               value={form.pulse}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-sky-500 outline-none"
//               placeholder="bpm"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الحرارة (Temp)
//             </label>
//             <input
//               name="temperature"
//               type="number"
//               step="0.1"
//               value={form.temperature}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-sky-500 outline-none"
//               placeholder="°C"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الأكسجين (SpO2)
//             </label>
//             <input
//               name="o2Sat"
//               type="number"
//               value={form.o2Sat}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-sky-500 outline-none"
//               placeholder="%"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الوزن (kg)
//             </label>
//             <input
//               name="weight"
//               type="number"
//               step="0.1"
//               value={form.weight}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-sky-500 outline-none"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الطول (cm)
//             </label>
//             <input
//               name="height"
//               type="number"
//               value={form.height}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-sky-500 outline-none"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               مؤشر الكتلة (BMI)
//             </label>
//             <div className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 text-center font-mono">
//               {bmi}
//             </div>
//           </div>
//         </div>
//         <button
//           onClick={handleSubmit}
//           className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-xl font-bold shadow-lg shadow-sky-500/20 transition"
//         >
//           حفظ العلامات الحيوية
//         </button>
//       </div>

//       {/* القراءات السابقة */}
//       <div className="space-y-3">
//         <h3 className="text-xs font-semibold text-slate-400 px-1">
//           سجل القراءات السابقة
//         </h3>

//         {loading && (
//           <div className="text-center text-xs text-slate-500 py-4">
//             جار التحميل...
//           </div>
//         )}

//         {!loading && vitalsList.length === 0 && (
//           <div className="text-center text-xs text-slate-500 py-4 border border-dashed border-slate-800 rounded-xl">
//             لا توجد قراءات مسجلة.
//           </div>
//         )}

//         {vitalsList.map((v) => (
//           <div
//             key={v.id}
//             className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-y-2 hover:bg-slate-900 transition"
//           >
//             <div className="flex items-center gap-4 text-xs">
//               <div className="text-slate-500 font-mono w-20">
//                 {new Date(v.createdAt).toLocaleTimeString("ar-LY", {
//                   hour: "2-digit",
//                   minute: "2-digit",
//                   hour12: true,
//                 })}
//               </div>

//               {v.bpSystolic && (
//                 <div className="text-slate-200" title="Blood Pressure">
//                   <span className="text-slate-500 text-[10px] uppercase mr-1">
//                     BP
//                   </span>
//                   {v.bpSystolic}/{v.bpDiastolic}
//                 </div>
//               )}
//               {v.pulse && (
//                 <div className="text-slate-200" title="Heart Rate">
//                   <span className="text-slate-500 text-[10px] uppercase mr-1">
//                     HR
//                   </span>
//                   {v.pulse}
//                 </div>
//               )}
//               {v.temperature && (
//                 <div className="text-slate-200" title="Temperature">
//                   <span className="text-slate-500 text-[10px] uppercase mr-1">
//                     T
//                   </span>
//                   {v.temperature}°C
//                 </div>
//               )}
//               {v.o2Sat && (
//                 <div className="text-slate-200" title="Oxygen Saturation">
//                   <span className="text-slate-500 text-[10px] uppercase mr-1">
//                     O2
//                   </span>
//                   {v.o2Sat}%
//                 </div>
//               )}
//               {v.weight && (
//                 <div className="text-slate-200">
//                   <span className="text-slate-500 text-[10px] uppercase mr-1">
//                     Wt
//                   </span>
//                   {v.weight}
//                 </div>
//               )}
//             </div>

//             {v.createdBy && (
//               <div className="text-[10px] text-slate-600 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
//                 {v.createdBy.fullName}
//               </div>
//             )}
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// // src/components/encounter/VitalsPane.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import { toast } from "sonner";

// type VitalSign = {
//   id: number;
//   temperature?: number;
//   bpSystolic?: number;
//   bpDiastolic?: number;
//   pulse?: number;
//   respRate?: number;
//   o2Sat?: number;
//   weight?: number;
//   height?: number;
//   bmi?: number;
//   note?: string;
//   createdAt: string;
//   createdBy?: { fullName: string };
// };

// export function VitalsPane({ encounterId }: { encounterId: number }) {
//   const [vitalsList, setVitalsList] = useState<VitalSign[]>([]);
//   const [loading, setLoading] = useState(false);

//   // Form State
//   const [form, setForm] = useState({
//     temperature: "",
//     bpSystolic: "",
//     bpDiastolic: "",
//     pulse: "",
//     respRate: "",
//     o2Sat: "",
//     weight: "",
//     height: "",
//     note: "",
//   });

//   // حساب BMI تلقائي
//   const bmi =
//     form.weight && form.height
//       ? (Number(form.weight) / Math.pow(Number(form.height) / 100, 2)).toFixed(
//           1
//         )
//       : "—";

//   const loadVitals = async () => {
//     try {
//       setLoading(true);
//       const res = await apiClient.get<VitalSign[]>(
//         `/vitals/encounter/${encounterId}`
//       );
//       setVitalsList(res.data);
//     } catch (err) {
//       console.error(err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     loadVitals();
//   }, [encounterId]);

//   const handleSubmit = async () => {
//     try {
//       await apiClient.post(`/vitals/encounter/${encounterId}`, {
//         temperature: form.temperature ? Number(form.temperature) : undefined,
//         bpSystolic: form.bpSystolic ? Number(form.bpSystolic) : undefined,
//         bpDiastolic: form.bpDiastolic ? Number(form.bpDiastolic) : undefined,
//         pulse: form.pulse ? Number(form.pulse) : undefined,
//         respRate: form.respRate ? Number(form.respRate) : undefined,
//         o2Sat: form.o2Sat ? Number(form.o2Sat) : undefined,
//         weight: form.weight ? Number(form.weight) : undefined,
//         height: form.height ? Number(form.height) : undefined,
//         note: form.note || undefined,
//       });

//       toast.success("تم تسجيل العلامات الحيوية");
//       // تصفير النموذج
//       setForm({
//         temperature: "",
//         bpSystolic: "",
//         bpDiastolic: "",
//         pulse: "",
//         respRate: "",
//         o2Sat: "",
//         weight: "",
//         height: "",
//         note: "",
//       });
//       loadVitals();
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل الحفظ");
//     }
//   };

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//   };

//   return (
//     <div className="space-y-4">
//       {/* فورم الإدخال */}
//       <div className="bg-slate-900/60 border border-slate-700 p-4 rounded-2xl">
//         <h3 className="text-sm font-semibold text-slate-200 mb-3">
//           تسجيل قراءة جديدة
//         </h3>
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الضغط (BP)
//             </label>
//             <div className="flex gap-1 items-center">
//               <input
//                 name="bpSystolic"
//                 placeholder="Sys"
//                 value={form.bpSystolic}
//                 onChange={handleChange}
//                 className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center"
//               />
//               <span className="text-slate-500">/</span>
//               <input
//                 name="bpDiastolic"
//                 placeholder="Dia"
//                 value={form.bpDiastolic}
//                 onChange={handleChange}
//                 className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center"
//               />
//             </div>
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               النبض (Pulse)
//             </label>
//             <input
//               name="pulse"
//               type="number"
//               value={form.pulse}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الحرارة (Temp)
//             </label>
//             <input
//               name="temperature"
//               type="number"
//               step="0.1"
//               value={form.temperature}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الأكسجين (SpO2)
//             </label>
//             <input
//               name="o2Sat"
//               type="number"
//               value={form.o2Sat}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الوزن (kg)
//             </label>
//             <input
//               name="weight"
//               type="number"
//               step="0.1"
//               value={form.weight}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">
//               الطول (cm)
//             </label>
//             <input
//               name="height"
//               type="number"
//               value={form.height}
//               onChange={handleChange}
//               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs"
//             />
//           </div>
//           <div>
//             <label className="text-[11px] text-slate-400 block mb-1">BMI</label>
//             <div className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 text-center">
//               {bmi}
//             </div>
//           </div>
//         </div>
//         <button
//           onClick={handleSubmit}
//           className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium"
//         >
//           حفظ العلامات الحيوية
//         </button>
//       </div>

//       {/* القراءات السابقة */}
//       <div className="space-y-2">
//         {loading && (
//           <div className="text-center text-xs text-slate-500">
//             جار التحميل...
//           </div>
//         )}
//         {vitalsList.map((v) => (
//           <div
//             key={v.id}
//             className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl flex flex-wrap gap-4 text-xs items-center"
//           >
//             <div className="text-slate-500 w-24">
//               {new Date(v.createdAt).toLocaleTimeString("ar-LY", {
//                 hour: "2-digit",
//                 minute: "2-digit",
//               })}
//             </div>
//             {v.bpSystolic && (
//               <div className="text-slate-200">
//                 <span className="text-slate-500">BP:</span> {v.bpSystolic}/
//                 {v.bpDiastolic}
//               </div>
//             )}
//             {v.pulse && (
//               <div className="text-slate-200">
//                 <span className="text-slate-500">HR:</span> {v.pulse}
//               </div>
//             )}
//             {v.temperature && (
//               <div className="text-slate-200">
//                 <span className="text-slate-500">Temp:</span> {v.temperature}°C
//               </div>
//             )}
//             {v.o2Sat && (
//               <div className="text-slate-200">
//                 <span className="text-slate-500">SpO2:</span> {v.o2Sat}%
//               </div>
//             )}
//             {v.weight && (
//               <div className="text-slate-200">
//                 <span className="text-slate-500">Wt:</span> {v.weight}kg
//               </div>
//             )}
//             {v.createdBy && (
//               <div className="mr-auto text-[10px] text-slate-600">
//                 {v.createdBy.fullName}
//               </div>
//             )}
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }
