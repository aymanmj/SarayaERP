// src/pages/DashboardPage.tsx

import { useAuthStore } from "../stores/authStore";
import { apiClient } from "../api/apiClient";
import { useQuery } from "@tanstack/react-query";

// Types
type DashboardStats = {
  activeInpatients: number;
  occupiedBeds: number;
  totalBeds: number;
  occupancyRate: number;
  appointmentsToday: number;
  todayRevenue: number;
  lowStockCount: number;
  isPersonalRevenue?: boolean;
};

type LicenseDetails = {
  hospitalName: string;
  expiryDate: string;
  plan: string;
  maxUsers: number; // -1 means unlimited
};

type LicenseInfoResponse = {
  machineId: string;
  isValid: boolean;
  details: LicenseDetails;
};

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  // 1. Fetch Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboardStats", user?.hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<DashboardStats>("/dashboard/stats");
      return res.data;
    },
  });

  // 2. Fetch License Info
  const { data: licenseInfo, isLoading: licenseLoading } = useQuery({
    queryKey: ["licenseInfo"],
    queryFn: async () => {
      const res = await apiClient.get<LicenseInfoResponse>("/license/info");
      return res.data;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (license rarely changes)
  });

  const license = licenseInfo?.details;
  const loading = statsLoading || licenseLoading;

  // Days Remaining Calc
  const getDaysRemaining = () => {
    if (!license) return 0;
    const end = new Date(license.expiryDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const daysLeft = getDaysRemaining();

  const getPlanLabel = (plan: string) => {
    if (plan === "ENTERPRISE") return "مؤسسات (شامل)";
    if (plan === "PRO") return "احترافي";
    return "أساسي";
  };

  const StatCard = ({
    title,
    value,
    subtext,
    colorClass,
  }: {
    title: string;
    value: string | number;
    subtext: string;
    colorClass: string;
  }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between h-32 hover:bg-slate-900/90 transition-colors shadow-sm">
      <div className="text-xs text-slate-400 font-medium">{title}</div>
      <div className={`text-3xl font-bold ${colorClass}`}>
        {loading ? "..." : value}
      </div>
      <div className="text-[11px] text-slate-500">{subtext}</div>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-8 pb-10">
      {/* Header & Subscription Info */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-50 mb-2">
            أهلاً {user?.fullName?.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-slate-400">
            ملخص الأداء التشغيلي والمالي للمستشفى لهذا اليوم.
          </p>
        </div>

        {/* License Info Card */}
        {license && (
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl p-4 flex items-center gap-6 shadow-lg">
            <div className="text-center px-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                الباقة الحالية
              </div>
              <div className="font-bold text-sky-400 bg-sky-900/20 px-3 py-1 rounded-lg border border-sky-500/20">
                {getPlanLabel(license.plan)}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700"></div>

            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                المستخدمين
              </div>
              <div className="font-mono font-bold text-white">
                {license.maxUsers === -1 ? "∞" : license.maxUsers}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700"></div>

            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                الصلاحية
              </div>
              <div
                className={`font-bold ${daysLeft < 30 ? "text-rose-400" : "text-emerald-400"}`}
              >
                {daysLeft} يوم
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="المرضى المنومين حالياً"
          value={stats?.activeInpatients ?? 0}
          subtext={`نسبة إشغال الأسرة: ${stats?.occupancyRate ?? 0}%`}
          colorClass="text-sky-400"
        />

        <StatCard
          title="مواعيد اليوم"
          value={stats?.appointmentsToday ?? 0}
          subtext="إجمالي الحجوزات (العيادات)"
          colorClass="text-amber-400"
        />

        <StatCard
          title={
            stats?.isPersonalRevenue
              ? "إيرادك اليوم (وردية)"
              : "إيرادات اليوم (المحصلة)"
          }
          value={`${(stats?.todayRevenue ?? 0).toLocaleString()} د.ل`}
          subtext={
            stats?.isPersonalRevenue
              ? "المدفوعات التي قمت بتحصيلها"
              : "المدفوعات النقدية والبنكية للمستشفى"
          }
          colorClass="text-emerald-400"
        />

        <StatCard
          title="نواقص المخزون"
          value={stats?.lowStockCount ?? 0}
          subtext="أصناف وصلت للحد الأدنى"
          colorClass={
            (stats?.lowStockCount ?? 0) > 0 ? "text-rose-400" : "text-slate-200"
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">
            وصول سريع
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="/admissions"
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-900 text-xs text-center transition group"
            >
              <div className="text-lg mb-1 group-hover:scale-110 transition-transform">
                🛏️
              </div>
              مكتب الدخول
            </a>
            <a
              href="/appointments"
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900 text-xs text-center transition group"
            >
              <div className="text-lg mb-1 group-hover:scale-110 transition-transform">
                📅
              </div>
              حجز موعد
            </a>
            <a
              href="/cashier"
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 text-xs text-center transition group"
            >
              <div className="text-lg mb-1 group-hover:scale-110 transition-transform">
                💰
              </div>
              الخزينة
            </a>
            <a
              href="/pharmacy"
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900 text-xs text-center transition group"
            >
              <div className="text-lg mb-1 group-hover:scale-110 transition-transform">
                💊
              </div>
              الصيدلية
            </a>
          </div>
        </div>

        {/* Placeholder for Charts */}
        <div className="md:col-span-2 rounded-3xl border border-slate-800 bg-slate-900/40 p-5 flex flex-col justify-center items-center text-center">
          <div className="text-4xl mb-4 opacity-20">📊</div>
          <div className="text-slate-500 text-sm font-medium">
            سيتم إضافة رسوم بيانية للإيرادات الأسبوعية هنا قريباً
          </div>
          <div className="text-slate-600 text-xs mt-2">
            (متاحة في قسم التقارير حالياً)
          </div>
        </div>
      </div>
    </div>
  );
}

// // src/pages/DashboardPage.tsx

// import { useEffect, useState } from "react";
// import { useAuthStore } from "../stores/authStore";
// import { apiClient } from "../api/apiClient";

// type DashboardStats = {
//   activeInpatients: number;
//   occupiedBeds: number;
//   totalBeds: number;
//   occupancyRate: number;
//   appointmentsToday: number;
//   todayRevenue: number;
//   lowStockCount: number;
//   isPersonalRevenue?: boolean;
// };

// export function DashboardPage() {
//   const user = useAuthStore((s) => s.user);
//   const [stats, setStats] = useState<DashboardStats | null>(null);
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     async function loadStats() {
//       setLoading(true);
//       try {
//         const res = await apiClient.get<DashboardStats>("/dashboard/stats");
//         setStats(res.data);
//       } catch (err) {
//         console.error(err);
//       } finally {
//         setLoading(false);
//       }
//     }
//     loadStats();
//   }, []);

//   const StatCard = ({
//     title,
//     value,
//     subtext,
//     colorClass,
//   }: {
//     title: string;
//     value: string | number;
//     subtext: string;
//     colorClass: string;
//   }) => (
//     <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between h-32 hover:bg-slate-900/90 transition-colors">
//       <div className="text-xs text-slate-400 font-medium">{title}</div>
//       <div className={`text-3xl font-bold ${colorClass}`}>
//         {loading ? "..." : value}
//       </div>
//       <div className="text-[11px] text-slate-500">{subtext}</div>
//     </div>
//   );

//   return (
//     <div className="h-full flex flex-col gap-8">
//       {/* Header */}
//       <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
//         <div>
//           <h1 className="text-2xl font-bold text-slate-50">
//             أهلاً {user?.fullName} 👋
//           </h1>
//           <p className="text-sm text-slate-400 mt-1">
//             ملخص الأداء التشغيلي والمالي للمستشفى لهذا اليوم.
//           </p>
//         </div>
//         <div className="flex gap-2 text-xs">
//           <span className="px-3 py-1 rounded-full bg-sky-900/30 text-sky-300 border border-sky-700/50">
//             {new Date().toLocaleDateString("ar-LY")}
//           </span>
//         </div>
//       </div>

//       {/* Cards Grid */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//         {/* 1. الإيواء والإشغال */}
//         <StatCard
//           title="المرضى المنومين حالياً"
//           value={stats?.activeInpatients ?? 0}
//           subtext={`نسبة إشغال الأسرة: ${stats?.occupancyRate ?? 0}%`}
//           colorClass="text-sky-400"
//         />

//         {/* 2. المواعيد */}
//         <StatCard
//           title="مواعيد اليوم"
//           value={stats?.appointmentsToday ?? 0}
//           subtext="إجمالي الحجوزات (العيادات)"
//           colorClass="text-amber-400"
//         />

//         {/* 3. الإيرادات */}
//         <StatCard
//           title={
//             stats?.isPersonalRevenue
//               ? "إيرادك اليوم (وردية)"
//               : "إيرادات اليوم (المحصلة)"
//           }
//           value={`${(stats?.todayRevenue ?? 0).toLocaleString()} د.ل`}
//           subtext={
//             stats?.isPersonalRevenue
//               ? "المدفوعات التي قمت بتحصيلها"
//               : "المدفوعات النقدية والبنكية للمستشفى"
//           }
//           colorClass="text-emerald-400"
//         />

//         {/* 4. تنبيهات المخزون */}
//         <StatCard
//           title="نواقص المخزون"
//           value={stats?.lowStockCount ?? 0}
//           subtext="أصناف وصلت للحد الأدنى"
//           colorClass={
//             (stats?.lowStockCount ?? 0) > 0 ? "text-rose-400" : "text-slate-200"
//           }
//         />
//       </div>

//       {/* قسم الإجراءات السريعة (Quick Actions) */}
//       <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
//         <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
//           <h3 className="text-sm font-semibold text-slate-200 mb-3">
//             وصول سريع
//           </h3>
//           <div className="grid grid-cols-2 gap-2">
//             <a
//               href="/admissions"
//               className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-center border border-slate-800 transition"
//             >
//               🛏️ مكتب الدخول
//             </a>
//             <a
//               href="/appointments"
//               className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-center border border-slate-800 transition"
//             >
//               📅 حجز موعد
//             </a>
//             <a
//               href="/cashier"
//               className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-center border border-slate-800 transition"
//             >
//               💰 الخزينة
//             </a>
//             <a
//               href="/pharmacy"
//               className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-center border border-slate-800 transition"
//             >
//               💊 الصيدلية
//             </a>
//           </div>
//         </div>

//         {/* مساحة فارغة لمخططات بيانية مستقبلية */}
//         <div className="md:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/40 p-5 flex items-center justify-center text-slate-500 text-sm">
//           (سيتم إضافة رسوم بيانية للإيرادات الأسبوعية هنا قريباً)
//         </div>
//       </div>
//     </div>
//   );
// }
