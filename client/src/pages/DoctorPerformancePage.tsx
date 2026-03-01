import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/apiClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type DoctorRow = {
  id: number;
  fullName: string;
  specialty: string;
  totalEncounters: number;
  totalAdmissions: number;
  totalSurgeries: number;
  totalRevenue: number;
  avgConsultationMins: number;
};

type PerformanceData = {
  doctors: DoctorRow[];
  summary: {
    totalEncounters: number;
    totalRevenue: number;
    totalSurgeries: number;
    activeDoctors: number;
  };
};

type SortKey = keyof Pick<DoctorRow, "totalEncounters" | "totalAdmissions" | "totalSurgeries" | "totalRevenue" | "avgConsultationMins">;

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c084fc", "#d8b4fe",
  "#818cf8", "#7c3aed", "#5b21b6", "#4f46e5", "#3b82f6",
];

export default function DoctorPerformancePage() {
  // Date filters
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));
  const [sortKey, setSortKey] = useState<SortKey>("totalEncounters");
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading } = useQuery<PerformanceData>({
    queryKey: ["doctor-performance", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await apiClient.get(`/reports/doctor-performance?${params}`);
      return res.data;
    },
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedDoctors = [...(data?.doctors || [])].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortAsc ? diff : -diff;
  });

  const chartData = sortedDoctors.slice(0, 10).map((d) => ({
    name: d.fullName.length > 15 ? d.fullName.slice(0, 14) + "…" : d.fullName,
    value: d[sortKey],
    fullName: d.fullName,
  }));

  const sortLabel: Record<SortKey, string> = {
    totalEncounters: "الحالات",
    totalAdmissions: "الإيواء",
    totalSurgeries: "العمليات",
    totalRevenue: "الإيرادات",
    avgConsultationMins: "متوسط الاستشارة",
  };

  // Quick date presets
  const setPreset = (preset: "today" | "week" | "month" | "year") => {
    const now = new Date();
    let from: Date;
    switch (preset) {
      case "today":
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        from = new Date(now);
        from.setDate(now.getDate() - 7);
        break;
      case "month":
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        from = new Date(now.getFullYear(), 0, 1);
        break;
    }
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(now.toISOString().slice(0, 10));
  };

  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-6 text-slate-100" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            📊 تقرير أداء الأطباء
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            تحليل شامل لإنتاجية وأداء الطاقم الطبي حسب الفترة الزمنية
          </p>
        </div>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-bold">من:</label>
          <input
            type="date"
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-bold">إلى:</label>
          <input
            type="date"
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 mr-auto">
          {([
            ["today", "اليوم"],
            ["week", "أسبوع"],
            ["month", "شهر"],
            ["year", "سنة"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-800 hover:bg-sky-900/40 text-slate-400 hover:text-sky-400 border border-slate-700 hover:border-sky-800 transition-all"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-500 animate-pulse text-lg">
          جارِ تحليل البيانات...
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "إجمالي الحالات",
                value: summary?.totalEncounters || 0,
                icon: "👥",
                color: "from-sky-500/20 to-sky-900/10 border-sky-800/40",
                textColor: "text-sky-400",
              },
              {
                label: "الإيرادات المُولّدة",
                value: `${((summary?.totalRevenue || 0) / 1000).toFixed(1)}K`,
                icon: "💰",
                color: "from-emerald-500/20 to-emerald-900/10 border-emerald-800/40",
                textColor: "text-emerald-400",
              },
              {
                label: "العمليات الجراحية",
                value: summary?.totalSurgeries || 0,
                icon: "🔪",
                color: "from-purple-500/20 to-purple-900/10 border-purple-800/40",
                textColor: "text-purple-400",
              },
              {
                label: "الأطباء النشطين",
                value: summary?.activeDoctors || 0,
                icon: "🩺",
                color: "from-amber-500/20 to-amber-900/10 border-amber-800/40",
                textColor: "text-amber-400",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`bg-gradient-to-br ${kpi.color} border rounded-2xl p-5 flex items-center gap-4`}
              >
                <span className="text-3xl">{kpi.icon}</span>
                <div>
                  <div className={`text-2xl font-black ${kpi.textColor}`}>
                    {kpi.value}
                  </div>
                  <div className="text-[11px] text-slate-400 font-bold">
                    {kpi.label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Table Row */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Bar Chart */}
            <div className="xl:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-300">
                  📊 مقارنة الأطباء — {sortLabel[sortKey]}
                </h3>
                <select
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-400 outline-none"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  {Object.entries(sortLabel).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fill: "#e2e8f0", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: 12,
                        fontSize: 12,
                        direction: "rtl",
                      }}
                      formatter={(value: number) => [
                        sortKey === "totalRevenue"
                          ? `${value.toLocaleString()} د.ل`
                          : sortKey === "avgConsultationMins"
                          ? `${value} دقيقة`
                          : value,
                        sortLabel[sortKey],
                      ]}
                      labelFormatter={(label) => {
                        const item = chartData.find((c) => c.name === label);
                        return item?.fullName || label;
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                      {chartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-16 text-slate-600">
                  لا توجد بيانات في الفترة المحددة
                </div>
              )}
            </div>

            {/* Data Table */}
            <div className="xl:col-span-3 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-950/60 text-slate-500">
                    <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                      <th className="px-4 py-3 font-bold">#</th>
                      <th className="px-4 py-3 font-bold min-w-[140px]">الطبيب</th>
                      <th className="px-4 py-3 font-bold">التخصص</th>
                      <th
                        className="px-4 py-3 font-bold cursor-pointer hover:text-sky-400 transition"
                        onClick={() => handleSort("totalEncounters")}
                      >
                        الحالات {sortKey === "totalEncounters" ? (sortAsc ? "↑" : "↓") : ""}
                      </th>
                      <th
                        className="px-4 py-3 font-bold cursor-pointer hover:text-sky-400 transition"
                        onClick={() => handleSort("totalAdmissions")}
                      >
                        الإيواء {sortKey === "totalAdmissions" ? (sortAsc ? "↑" : "↓") : ""}
                      </th>
                      <th
                        className="px-4 py-3 font-bold cursor-pointer hover:text-sky-400 transition"
                        onClick={() => handleSort("totalSurgeries")}
                      >
                        العمليات {sortKey === "totalSurgeries" ? (sortAsc ? "↑" : "↓") : ""}
                      </th>
                      <th
                        className="px-4 py-3 font-bold cursor-pointer hover:text-sky-400 transition"
                        onClick={() => handleSort("totalRevenue")}
                      >
                        الإيرادات {sortKey === "totalRevenue" ? (sortAsc ? "↑" : "↓") : ""}
                      </th>
                      <th
                        className="px-4 py-3 font-bold cursor-pointer hover:text-sky-400 transition"
                        onClick={() => handleSort("avgConsultationMins")}
                      >
                        متوسط الاستشارة {sortKey === "avgConsultationMins" ? (sortAsc ? "↑" : "↓") : ""}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {sortedDoctors.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-600">
                          لا توجد بيانات في الفترة المحددة
                        </td>
                      </tr>
                    ) : (
                      sortedDoctors.map((doc, i) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                            {i + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                                style={{
                                  background: CHART_COLORS[i % CHART_COLORS.length],
                                }}
                              >
                                {doc.fullName.charAt(0)}
                              </div>
                              <span className="font-bold text-slate-200 text-xs">
                                {doc.fullName}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {doc.specialty}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-sky-400">
                            {doc.totalEncounters}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs text-slate-300">
                            {doc.totalAdmissions}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs text-purple-400">
                            {doc.totalSurgeries}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs text-emerald-400">
                            {doc.totalRevenue.toLocaleString()} <span className="text-slate-600">د.ل</span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs text-amber-400">
                            {doc.avgConsultationMins > 0
                              ? `${doc.avgConsultationMins} د`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
