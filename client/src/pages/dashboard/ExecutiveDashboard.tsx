// src/pages/dashboard/ExecutiveDashboard.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import {
  BanknotesIcon,
  UserGroupIcon,
  ArchiveBoxIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/outline";
import {
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

interface ExecutiveStats {
  dailyRevenue: number;
  dailyVisits: number;
  inventoryValue: number;
  activeInpatients: number;
  lastUpdated: string;
}

export function ExecutiveDashboard() {
  const [stats, setStats] = useState<ExecutiveStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await apiClient.get("/analytics/executive");
        setStats(res.data);
      } catch (err) {
        console.error("Failed to load analytics", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20 text-slate-500 animate-pulse">
        جاري تحميل البيانات التحليلية...
      </div>
    );
  }

  if (!stats) return null;

  const cardClass = "bg-slate-900 border border-slate-800 p-6 rounded-2xl";

  return (
    <div className="space-y-6 p-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">لوحة المعلومات التنفيذية</h1>
          <p className="text-slate-400 text-sm">نظرة شاملة على الأداء اليومي والمالي</p>
        </div>
        <div className="text-xs text-slate-500 font-mono">
          Last Updated: {new Date(stats.lastUpdated).toLocaleTimeString("en-GB")}
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">الإيرادات اليومية (تقديري)</span>
            <BanknotesIcon className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {stats.dailyRevenue.toLocaleString()} د.ل.
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">عدد الزوار اليوم</span>
            <UserGroupIcon className="w-5 h-5 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.dailyVisits}
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">المنومين حالياً</span>
            <BuildingOfficeIcon className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.activeInpatients}
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">قيمة المخزون</span>
            <ArchiveBoxIcon className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {stats.inventoryValue.toLocaleString()} د.ل.
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-2 ${cardClass} h-80`}>
          <h3 className="text-slate-300 font-bold mb-4">الأداء الأسبوعي (تجريبي)</h3>
          {/* Mock for Chart */}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { name: "Sat", visits: 120, revenue: 5000 },
                { name: "Sun", visits: 150, revenue: 6200 },
                { name: "Mon", visits: 180, revenue: 7000 },
                { name: "Tue", visits: 140, revenue: 5800 },
                { name: "Wed", visits: 160, revenue: 6500 },
                { name: "Thu", visits: 190, revenue: 8000 },
                { name: "Fri", visits: 90, revenue: 4000 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
              />
              <Legend />
              <Bar dataKey="visits" name="الزيارات" fill="#38bdf8" />
              <Bar dataKey="revenue" name="الإيرادات" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={cardClass}>
          <h3 className="text-slate-300 font-bold mb-4">توزيع الإيرادات</h3>
          {/* Mock Pie Chart */}
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={[
                  { name: "الصيدلية", value: 400, color: "#10b981" },
                  { name: "المختبر", value: 300, color: "#38bdf8" },
                  { name: "العيادات", value: 300, color: "#818cf8" },
                  { name: "التنويم", value: 200, color: "#f59e0b" },
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
              >
                {[
                  { name: "الصيدلية", value: 400, color: "#10b981" },
                  { name: "المختبر", value: 300, color: "#38bdf8" },
                  { name: "العيادات", value: 300, color: "#818cf8" },
                  { name: "التنويم", value: 200, color: "#f59e0b" },
                ].map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
