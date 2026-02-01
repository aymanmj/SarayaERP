// src/pages/ReportsDashboardPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { toast } from "sonner";

const COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#6366f1",
];

export default function ReportsDashboardPage() {
  const [financialData, setFinancialData] = useState<any[]>([]);
  const [operationalData, setOperationalData] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [finRes, opRes, kpiRes] = await Promise.all([
          apiClient.get("/reports/financial-summary"),
          apiClient.get("/reports/operational-stats"),
          apiClient.get("/reports/operational-kpis"), // تأكد من إضافة هذا الـ Endpoint في الـ Controller
        ]);
        setFinancialData(finRes.data);
        setOperationalData(opRes.data.revenueByService);
        setKpis(kpiRes.data);
      } catch (err) {
        toast.error("فشل تحميل البيانات التحليلية");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const KPICard = ({ title, value, unit, color }: any) => (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-sm">
      <div className="text-xs text-slate-500 font-bold mb-2 uppercase tracking-wider">
        {title}
      </div>
      <div className={`text-3xl font-black ${color}`}>
        {value} <small className="text-sm font-normal opacity-60">{unit}</small>
      </div>
    </div>
  );

  if (loading)
    return (
      <div className="p-10 text-center text-slate-500 animate-pulse">
        جاري إعداد التقارير الاستراتيجية...
      </div>
    );

  return (
    <div className="p-6 text-slate-100 space-y-6" dir="rtl">
      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            التحليلات الاستراتيجية
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            نظام دعم القرار - Decision Support System
          </p>
        </div>
      </div>

      {/* 1. KPIs Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPICard
          title="إشغال الأسرة"
          value={kpis?.occupancyRate}
          unit="%"
          color="text-sky-400"
        />
        <KPICard
          title="إجمالي المرضى"
          value={kpis?.totalPatients}
          unit="مسجل"
          color="text-emerald-400"
        />
        <KPICard
          title="الحالات النشطة"
          value={kpis?.activeCases}
          unit="حالة"
          color="text-amber-400"
        />
        <KPICard
          title="صافي الربح"
          value={financialData
            .reduce((s, m) => s + m.profit, 0)
            .toLocaleString()}
          unit="LYD"
          color="text-white"
        />
      </div>

      {/* 2. Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* الربحية والنمو */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
          <h2 className="text-sm font-bold text-slate-300 mb-6">
            تحليل نمو الدخل والمصروفات
          </h2>
          <div className="h-80" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financialData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="إيرادات (محصلة)"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorRev)"
                  strokeWidth={3}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="مصروفات"
                  stroke="#f43f5e"
                  fillOpacity={0}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* توزيع الدخل حسب القسم */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
          <h2 className="text-sm font-bold text-slate-300 mb-6">
            كفاءة الأقسام
          </h2>
          <div className="h-80" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={operationalData}
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {operationalData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: "10px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="text-center text-slate-600 text-[10px] uppercase tracking-widest mt-8">
        Saraya ERP • Business Intelligence Module • Version 2.0
      </div>
    </div>
  );
}

// // src/pages/ReportsDashboardPage.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../api/apiClient";
// import {
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   Legend,
//   ResponsiveContainer,
//   PieChart,
//   Pie,
//   Cell,
// } from "recharts";

// type FinancialData = {
//   name: string;
//   revenue: number;
//   expense: number;
//   profit: number;
// };

// type PieData = { name: string; value: number };
// type DoctorData = { name: string; patientsCount: number };

// // ألوان متدرجة واحترافية للرسم الدائري
// const COLORS = [
//   "#0ea5e9", // Sky 500
//   "#10b981", // Emerald 500
//   "#f59e0b", // Amber 500
//   "#ef4444", // Red 500
//   "#8b5cf6", // Violet 500
//   "#ec4899", // Pink 500
//   "#6366f1", // Indigo 500
// ];

// export default function ReportsDashboardPage() {
//   const [financialData, setFinancialData] = useState<FinancialData[]>([]);
//   const [operationalData, setOperationalData] = useState<PieData[]>([]);
//   const [doctorsData, setDoctorsData] = useState<DoctorData[]>([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     async function load() {
//       try {
//         const [finRes, opRes, topRes] = await Promise.all([
//           apiClient.get<FinancialData[]>("/reports/financial-summary"),
//           apiClient.get<{ revenueByService: PieData[] }>(
//             "/reports/operational-stats",
//           ),
//           apiClient.get<{ topDoctors: DoctorData[] }>(
//             "/reports/top-performing",
//           ),
//         ]);

//         setFinancialData(finRes.data);
//         setOperationalData(opRes.data.revenueByService);
//         setDoctorsData(topRes.data.topDoctors);
//       } catch (err) {
//         console.error(err);
//       } finally {
//         setLoading(false);
//       }
//     }
//     load();
//   }, []);

//   if (loading)
//     return (
//       <div className="p-10 text-center text-slate-400">
//         جارِ تحليل البيانات...
//       </div>
//     );

//   return (
//     <div
//       className="p-6 text-slate-100 h-full overflow-auto space-y-6"
//       dir="rtl"
//     >
//       <div className="flex justify-between items-end">
//         <div>
//           <h1 className="text-2xl font-bold mb-1">لوحة التحليلات والتقارير</h1>
//           <p className="text-slate-400 text-sm">
//             نظرة شاملة على الأداء المالي والتشغيلي للمستشفى.
//           </p>
//         </div>
//       </div>

//       {/* الصف الأول: الرسم البياني المالي */}
//       <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-sm">
//         <h2 className="text-lg font-bold mb-6 text-slate-200 border-b border-slate-800 pb-2">
//           الأداء المالي الشهري (LYD)
//         </h2>
//         <div className="h-80 w-full" dir="ltr">
//           {" "}
//           {/* dir=ltr مهم لظهور المحاور بشكل صحيح في recharts */}
//           <ResponsiveContainer width="100%" height="100%">
//             <BarChart
//               data={financialData}
//               margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
//             >
//               <CartesianGrid
//                 strokeDasharray="3 3"
//                 stroke="#334155"
//                 vertical={false}
//               />
//               <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
//               <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
//               <Tooltip
//                 cursor={{ fill: "#334155", opacity: 0.2 }}
//                 contentStyle={{
//                   backgroundColor: "#0f172a",
//                   borderColor: "#334155",
//                   borderRadius: "12px",
//                   color: "#f1f5f9",
//                 }}
//               />
//               <Legend wrapperStyle={{ paddingTop: "20px" }} />
//               <Bar
//                 dataKey="revenue"
//                 name="الإيرادات"
//                 fill="#10b981"
//                 radius={[4, 4, 0, 0]}
//                 barSize={30}
//               />
//               <Bar
//                 dataKey="expense"
//                 name="المصروفات"
//                 fill="#f43f5e"
//                 radius={[4, 4, 0, 0]}
//                 barSize={30}
//               />
//               <Bar
//                 dataKey="profit"
//                 name="الربح الصافي"
//                 fill="#3b82f6"
//                 radius={[4, 4, 0, 0]}
//                 barSize={30}
//               />
//             </BarChart>
//           </ResponsiveContainer>
//         </div>
//       </div>

//       {/* الصف الثاني: الدوائر والأعمدة الجانبية */}
//       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//         {/* توزيع الإيرادات حسب القسم - (محسن) */}
//         <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
//           <h2 className="text-lg font-bold mb-4 text-slate-200 border-b border-slate-800 pb-2">
//             توزيع الإيرادات حسب القسم
//           </h2>
//           <div
//             className="flex-1 min-h-[300px] flex items-center justify-center"
//             dir="ltr"
//           >
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie
//                   data={operationalData}
//                   cx="50%"
//                   cy="50%"
//                   innerRadius={60} // لجعلها Donut Chart أجمل
//                   outerRadius={100}
//                   paddingAngle={5}
//                   dataKey="value"
//                 >
//                   {operationalData.map((entry, index) => (
//                     <Cell
//                       key={`cell-${index}`}
//                       fill={COLORS[index % COLORS.length]}
//                       stroke="rgba(0,0,0,0)"
//                     />
//                   ))}
//                 </Pie>
//                 <Tooltip
//                   formatter={(value: number) => `${value.toLocaleString()} LYD`}
//                   contentStyle={{
//                     backgroundColor: "#1e293b", // Slate-800
//                     borderColor: "#475569",
//                     borderRadius: "8px",
//                     color: "#f8fafc", // ✅ لون النص أبيض
//                   }}
//                   itemStyle={{ color: "#f8fafc" }} // ✅ مهم جداً: يجبر النص داخل التلميح أن يكون أبيض
//                 />
//                 <Legend
//                   layout="vertical"
//                   verticalAlign="middle"
//                   align="right"
//                   iconType="circle"
//                   wrapperStyle={{ fontSize: "12px", color: "#cbd5e1" }}
//                 />
//               </PieChart>
//             </ResponsiveContainer>
//           </div>
//         </div>

//         {/* الأطباء الأكثر نشاطاً */}
//         <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
//           <h2 className="text-lg font-bold mb-4 text-slate-200 border-b border-slate-800 pb-2">
//             الأطباء الأكثر نشاطاً (عدد المرضى)
//           </h2>
//           <div className="flex-1 min-h-[300px]" dir="ltr">
//             <ResponsiveContainer width="100%" height="100%">
//               <BarChart
//                 data={doctorsData}
//                 layout="vertical"
//                 margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
//               >
//                 <CartesianGrid
//                   strokeDasharray="3 3"
//                   stroke="#334155"
//                   horizontal={true}
//                   vertical={false}
//                 />
//                 <XAxis type="number" stroke="#94a3b8" hide />
//                 <YAxis
//                   dataKey="name"
//                   type="category"
//                   width={120}
//                   stroke="#94a3b8"
//                   tick={{ fontSize: 11, fill: "#cbd5e1" }}
//                 />
//                 <Tooltip
//                   cursor={{ fill: "#334155", opacity: 0.1 }}
//                   contentStyle={{
//                     backgroundColor: "#0f172a",
//                     borderColor: "#334155",
//                     borderRadius: "8px",
//                   }}
//                 />
//                 <Bar
//                   dataKey="patientsCount"
//                   name="عدد المرضى"
//                   fill="#8b5cf6"
//                   radius={[0, 4, 4, 0]}
//                   barSize={24}
//                 >
//                   {/* عرض القيمة بجانب العمود */}
//                 </Bar>
//               </BarChart>
//             </ResponsiveContainer>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
