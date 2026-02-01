import { useState } from "react";
import { apiClient } from "@/api/apiClient";
import { InventoryAlertsWidget } from "../../components/inventory/InventoryAlertsWidget";
import { formatMoney } from "@/lib/utils"; // Assuming utils has formatMoney
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { Package, AlertCircle, RefreshCcw, TrendingUp, Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

const COLORS = ['#10b981', '#0ea5e9', '#f59e0b', '#ef4444'];

const StatCard = ({ title, value, icon: Icon, colorClass }: any) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-center gap-4 shadow-lg hover:bg-slate-800/50 transition-colors">
        <div className={`p-4 rounded-xl ${colorClass} bg-opacity-20`}>
            <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
        <div>
            <div className="text-slate-400 text-sm font-medium">{title}</div>
            <div className="text-2xl font-black text-white mt-1">{value}</div>
        </div>
    </div>
);

export function InventoryDashboardPage() {
  const { user } = useAuth();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");

  // 1. Fetch Warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses', user?.hospitalId],
    queryFn: async () => {
       const res = await apiClient.get('/inventory/warehouses');
       return res.data;
    },
    enabled: !!user?.hospitalId
  });

  // 2. Fetch Stats
  const { data: stats, isLoading: statsLoading, isError } = useQuery({
    queryKey: ['inventoryStats', user?.hospitalId, selectedWarehouseId],
    queryFn: async () => {
        let url = `/inventory/counts/dashboard/stats?hospitalId=${user?.hospitalId}`;
        if (selectedWarehouseId !== "all") {
            url += `&warehouseId=${selectedWarehouseId}`;
        }
        const res = await apiClient.get(url);
        return res.data;
    },
    enabled: !!user?.hospitalId,
    staleTime: 60 * 1000, // Client side cache for 1 min
  });

  if (statsLoading) {
      return <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="animate-spin w-8 h-8" /></div>;
  }
  
  if (isError) return <div className="p-8 text-center text-rose-500">فشل تحميل البيانات</div>;
  if (!stats) return null; // Or skeleton

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-y-auto custom-scrollbar" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-3xl font-black text-white tracking-tight">لوحة تحكم المخزون</h1>
           <p className="text-sm text-slate-400">مراقبة التنبيهات، حركة الأصناف، وحالة المستودعات.</p>
        </div>

        {/* Warehouse Filter */}
        <div className="min-w-[200px]">
            <select 
                className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
            >
                <option value="all">كل المستودعات</option>
                {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                ))}
            </select>
        </div>
      </div>

       {/* Stats Grid */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="إجمالي قيمة المخزون" value={`${formatMoney(stats.totalValue)} د.ل`} icon={TrendingUp} colorClass="bg-emerald-500" />
            <StatCard title="أصناف منخفضة الرصيد" value={`${stats.lowStockCount} صنف`} icon={AlertCircle} colorClass="bg-rose-500" />
            <StatCard title="أوامر شراء معلقة" value={`${stats.pendingOrders} طلبات`} icon={Package} colorClass="bg-amber-500" />
            <StatCard title="عمليات جرد نشطة" value={`${stats.activeCounts} عمليات`} icon={RefreshCcw} colorClass="bg-sky-500" />
       </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Charts Area */}
        <div className="lg:col-span-2 space-y-6">
            {/* Stock Value Trend */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl">
                 <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    تطور قيمة المخزون (تقريبي)
                 </h3>
                 <div className="h-[300px] w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.stockTrend}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" stroke="#64748b" tick={{fill: '#94a3b8'}} reversed />
                            <YAxis stroke="#64748b" tick={{fill: '#94a3b8'}} orientation="right" />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                                itemStyle={{ color: '#f8fafc' }}
                                labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem' }}
                                formatter={(val: number) => [formatMoney(val), "القيمة"]}
                            />
                            <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                    </ResponsiveContainer>
                 </div>
            </div>

            {/* Low Stock Bar Chart */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl">
                 <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                    أصناف قاربت على النفاذ (Top 5)
                 </h3>
                 <div className="h-[250px] w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.lowStockItems} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" stroke="#64748b" orientation="top" />
                            <YAxis dataKey="name" type="category" width={100} stroke="#64748b" tick={{fill: '#e2e8f0', fontSize: 12}} orientation="right" />
                            <Tooltip 
                                cursor={{fill: '#1e293b'}} 
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                                itemStyle={{ color: '#f8fafc' }}
                                labelStyle={{ color: '#94a3b8' }}
                            />
                            <Bar dataKey="qty" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} name="الكمية الحالية" />
                            <Bar dataKey="limit" fill="#334155" radius={[0, 4, 4, 0]} barSize={20} name="حد الطلب" />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
            </div>
        </div>

        {/* Sidebar: Alerts & Pie Chart */}
        <div className="lg:col-span-1 space-y-6">
          <InventoryAlertsWidget />

          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-6">حالة عمليات الجرد</h3>
              <div className="h-[200px] w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={stats.statusDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {stats.statusDistribution.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                            itemStyle={{ color: '#f8fafc' }}
                        />
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
