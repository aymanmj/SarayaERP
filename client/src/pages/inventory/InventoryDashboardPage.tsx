// src/pages/inventory/InventoryDashboardPage.tsx

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, Loader2, Package, RefreshCcw, TrendingUp } from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { InventoryAlertsWidget } from "../../components/inventory/InventoryAlertsWidget";
import { formatMoney } from "../../utils/money";
import {
  SarayaFilterSelect,
  SarayaKpiCard,
  SarayaPageHeader,
} from "../../components/ui/SarayaPrimitives";

const COLORS = ["#10b981", "#0ea5e9", "#f59e0b", "#ef4444"];

export function InventoryDashboardPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const { user } = useAuth();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");

  // 1. Fetch Warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", user?.hospitalId],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/warehouses");
      return res.data;
    },
    enabled: !!user?.hospitalId,
  });

  // 2. Fetch Stats
  const {
    data: stats,
    isLoading: statsLoading,
    isError,
  } = useQuery({
    queryKey: ["inventoryStats", user?.hospitalId, selectedWarehouseId],
    queryFn: async () => {
      let url = `/inventory/counts/dashboard/stats?hospitalId=${user?.hospitalId}`;
      if (selectedWarehouseId !== "all") {
        url += `&warehouseId=${selectedWarehouseId}`;
      }
      const res = await apiClient.get(url);
      return res.data;
    },
    enabled: !!user?.hospitalId,
    staleTime: 60 * 1000,
  });

  if (statsLoading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-rose-500">
        {t("inventory.failedToLoadData", "فشل تحميل البيانات")}
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-5 overflow-y-auto custom-scrollbar"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <SarayaPageHeader
        icon={<Package className="w-5 h-5" />}
        title={t("inventory.dashboard.title", "لوحة تحكم المخزون")}
        subtitle={t(
          "inventory.dashboard.subtitle",
          "مراقبة التنبيهات، حركة الأصناف، وحالة المستودعات.",
        )}
        actions={
          <div className="min-w-[220px]">
            <SarayaFilterSelect
              value={selectedWarehouseId === "all" ? "" : selectedWarehouseId}
              onChange={(val) => setSelectedWarehouseId(val || "all")}
              placeholder={t("inventory.dashboard.allWarehouses", "كل المستودعات")}
              allLabel={t("inventory.dashboard.allWarehouses", "كل المستودعات")}
              options={warehouses.map((w: any) => ({
                value: String(w.id),
                label: w.name,
              }))}
            />
          </div>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SarayaKpiCard
          label={t("inventory.dashboard.totalValue", "إجمالي قيمة المخزون")}
          value={formatMoney(stats.totalValue)}
          accent="emerald"
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("inventory.dashboard.lowStockItems", "أصناف منخفضة الرصيد")}
          value={`${stats.lowStockCount} ${t("inventory.dashboard.items", "صنف")}`}
          accent="rose"
          icon={<AlertCircle className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("inventory.dashboard.pendingOrders", "أوامر شراء معلقة")}
          value={`${stats.pendingOrders} ${t("inventory.dashboard.requests", "طلبات")}`}
          accent="amber"
          icon={<Package className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("inventory.dashboard.activeCounts", "عمليات جرد نشطة")}
          value={`${stats.activeCounts} ${t("inventory.dashboard.operations", "عمليات")}`}
          accent="sky"
          icon={<RefreshCcw className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Charts Area */}
        <div className="lg:col-span-2 space-y-5">
          {/* Stock Value Trend */}
          <div className="saraya-card bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-100 mb-5 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              {t("inventory.dashboard.stockValueTrend", "تطور قيمة المخزون (آخر 6 أشهر)")}
            </h3>
            <div className="h-[300px] w-full" dir="ltr">
              {stats.stockTrend && stats.stockTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.stockTrend}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis orientation="right" />
                    <Tooltip
                      formatter={(val: number) => [
                        formatMoney(val),
                        t("inventory.dashboard.chartValue", "القيمة"),
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  {t("inventory.dashboard.noTrendData", "لا توجد بيانات كافية لعرض التطور التاريخي")}
                </div>
              )}
            </div>
          </div>

          {/* Low Stock Bar Chart */}
          <div className="saraya-card bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-100 mb-5 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500" />
              {t("inventory.dashboard.topLowStock", "أصناف قاربت على النفاذ (Top 5)")}
            </h3>
            <div className="h-[250px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.lowStockItems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" orientation="top" />
                  <YAxis dataKey="name" type="category" width={110} orientation="right" />
                  <Tooltip />
                  <Bar
                    dataKey="qty"
                    fill="#f43f5e"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    name={t("inventory.dashboard.currentQty", "الكمية الحالية")}
                  />
                  <Bar
                    dataKey="limit"
                    fill="#64748b"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    name={t("inventory.dashboard.reorderLimit", "حد الطلب")}
                  />
                  <Legend wrapperStyle={{ paddingTop: "16px" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Sidebar: Alerts & Pie Chart */}
        <div className="lg:col-span-1 space-y-5">
          <InventoryAlertsWidget />

          <div className="saraya-card bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-100 mb-5">
              {t("inventory.dashboard.countsStatus", "حالة عمليات الجرد")}
            </h3>
            <div className="h-[220px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={78}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.statusDistribution.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
