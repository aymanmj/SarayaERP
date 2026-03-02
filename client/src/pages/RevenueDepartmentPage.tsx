// src/pages/RevenueDepartmentPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ServiceTypeData {
  type: string;
  label: string;
  revenue: number;
  count: number;
}

interface SpecialtyData {
  specialty: string;
  revenue: number;
  count: number;
}

interface RevenueReport {
  byServiceType: ServiceTypeData[];
  bySpecialty: SpecialtyData[];
  total: { revenue: number; count: number };
}

const COLORS = [
  "#10b981",
  "#38bdf8",
  "#818cf8",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

const PRESETS = [
  { label: "اليوم", value: "today" },
  { label: "هذا الأسبوع", value: "week" },
  { label: "هذا الشهر", value: "month" },
  { label: "هذا العام", value: "year" },
];

export default function RevenueDepartmentPage() {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState("month");

  const getDateRange = (p: string) => {
    const now = new Date();
    let from = new Date();
    if (p === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (p === "week") {
      const day = now.getDay();
      from.setDate(now.getDate() - day);
      from.setHours(0, 0, 0, 0);
    } else if (p === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (p === "year") {
      from = new Date(now.getFullYear(), 0, 1);
    }
    return {
      from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    };
  };

  const loadData = async (p: string) => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(p);
      const res = await apiClient.get<RevenueReport>(
        "/reports/revenue-by-department",
        { params: { from, to } }
      );
      setData(res.data);
    } catch {
      toast.error("فشل تحميل تقرير الإيرادات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(preset);
  }, [preset]);

  return (
    <div className="p-6 text-slate-100 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">تقرير الإيرادات حسب القسم</h1>
          <p className="text-slate-400 text-sm mt-1">
            تفصيل الإيرادات بحسب نوع الخدمة والتخصص الطبي
          </p>
        </div>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                preset === p.value
                  ? "bg-sky-600 text-white shadow-lg shadow-sky-900/30"
                  : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500 animate-pulse">
          جاري تحميل البيانات...
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <div className="text-slate-400 text-sm mb-2">إجمالي الإيرادات</div>
              <div className="text-3xl font-bold text-emerald-400">
                {data.total.revenue.toLocaleString()}{" "}
                <span className="text-sm text-slate-500">د.ل</span>
              </div>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <div className="text-slate-400 text-sm mb-2">عدد الخدمات</div>
              <div className="text-3xl font-bold text-sky-400">
                {data.total.count.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
              <div className="text-slate-400 text-sm mb-2">عدد التخصصات</div>
              <div className="text-3xl font-bold text-purple-400">
                {data.bySpecialty.length}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart — Revenue by ServiceType */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 text-slate-200 border-b border-slate-800 pb-2">
                توزيع الإيرادات حسب نوع الخدمة
              </h3>
              {data.byServiceType.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={data.byServiceType}
                      dataKey="revenue"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={3}
                      label={(props: any) =>
                        `${props.name} ${((props.percent || 0) * 100).toFixed(0)}%`
                      }
                    >
                      {data.byServiceType.map((_, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={COLORS[i % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) =>
                        `${value.toLocaleString()} د.ل`
                      }
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-slate-500 py-16">
                  لا توجد بيانات للفترة المحددة
                </div>
              )}
            </div>

            {/* Bar Chart — Revenue by Specialty */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 text-slate-200 border-b border-slate-800 pb-2">
                الإيرادات حسب التخصص الطبي
              </h3>
              {data.bySpecialty.length > 0 ? (
                <ResponsiveContainer width="100%" height={320} >
                  <BarChart
                    data={data.bySpecialty.slice(0, 10)}
                    layout="vertical"
                    margin={{ right: 80 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      horizontal={false}
                    />
                    <XAxis type="number" stroke="#94a3b8" />
                    <YAxis
                      type="category"
                      dataKey="specialty"
                      width={120}
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value: number) =>
                        `${value.toLocaleString()} د.ل`
                      }
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "12px",
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      name="الإيرادات"
                      fill="#818cf8"
                      radius={[0, 6, 6, 0]}
                      barSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-slate-500 py-16">
                  لا توجد بيانات للفترة المحددة
                </div>
              )}
            </div>
          </div>

          {/* Details Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Service Type Table */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800">
                <h3 className="font-bold text-slate-200">
                  تفصيل حسب نوع الخدمة
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-right text-slate-400">
                      نوع الخدمة
                    </th>
                    <th className="px-6 py-3 text-center text-slate-400">
                      العدد
                    </th>
                    <th className="px-6 py-3 text-center text-slate-400">
                      الإيرادات
                    </th>
                    <th className="px-6 py-3 text-center text-slate-400">
                      النسبة
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.byServiceType.map((item, i) => (
                    <tr
                      key={item.type}
                      className="hover:bg-slate-800/30 transition"
                    >
                      <td className="px-6 py-3 font-bold flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                        {item.label}
                      </td>
                      <td className="px-6 py-3 text-center text-slate-300">
                        {item.count.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-center font-mono text-emerald-400">
                        {item.revenue.toLocaleString()} د.ل
                      </td>
                      <td className="px-6 py-3 text-center text-slate-400">
                        {data.total.revenue > 0
                          ? (
                              (item.revenue / data.total.revenue) *
                              100
                            ).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Specialty Table */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800">
                <h3 className="font-bold text-slate-200">
                  تفصيل حسب التخصص
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-right text-slate-400">
                      التخصص
                    </th>
                    <th className="px-6 py-3 text-center text-slate-400">
                      العدد
                    </th>
                    <th className="px-6 py-3 text-center text-slate-400">
                      الإيرادات
                    </th>
                    <th className="px-6 py-3 text-center text-slate-400">
                      النسبة
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.bySpecialty.map((item, i) => (
                    <tr
                      key={item.specialty}
                      className="hover:bg-slate-800/30 transition"
                    >
                      <td className="px-6 py-3 font-bold flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                        {item.specialty}
                      </td>
                      <td className="px-6 py-3 text-center text-slate-300">
                        {item.count.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-center font-mono text-emerald-400">
                        {item.revenue.toLocaleString()} د.ل
                      </td>
                      <td className="px-6 py-3 text-center text-slate-400">
                        {data.total.revenue > 0
                          ? (
                              (item.revenue / data.total.revenue) *
                              100
                            ).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
