// src/components/inventory/InventoryAlertsWidget.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import {
  ExclamationTriangleIcon,
  ClockIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

export function InventoryAlertsWidget() {
  const [alerts, setAlerts] = useState<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lowStock: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expiringSoon: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expired: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadAlerts() {
      try {
        setLoading(true);
        const res = await apiClient.get("/inventory/alerts");
        setAlerts(res.data);
      } catch (err) {
        console.error("Failed to load alerts", err);
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, []);

  if (loading) return <div className="text-slate-400 text-xs p-4">جاري تحميل التنبيهات...</div>;
  if (!alerts) return null;

  const totalAlerts =
    alerts.lowStock.length +
    alerts.expiringSoon.length +
    alerts.expired.length;

  if (totalAlerts === 0) {
    return (
      <div className="bg-emerald-900/10 border border-emerald-800/30 p-4 rounded-2xl text-center">
        <p className="text-emerald-400 text-sm font-bold">✅ حالة المخزون ممتازة</p>
        <p className="text-slate-500 text-xs mt-1">لا توجد نواقص أو مواد منتهية الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 🔴 المواد المنتهية (الأخطر) */}
      {alerts.expired.length > 0 && (
        <div className="bg-rose-950/20 border border-rose-900/50 rounded-2xl p-4">
          <h3 className="text-rose-400 text-sm font-bold flex items-center gap-2 mb-3">
            <XCircleIcon className="w-5 h-5" />
            مواد منتهية الصلاحية ({alerts.expired.length})
          </h3>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {alerts.expired.map((item: any, idx) => (
              <div key={idx} className="bg-rose-950/40 p-2 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-200 block font-bold">{item.productName}</span>
                  <span className="text-rose-300/70">Batch: {item.batchNumber}</span>
                </div>
                <div className="text-left">
                  <span className="text-rose-500 block font-bold">منتهي</span>
                  <span className="text-slate-500">{new Date(item.expiryDate).toLocaleDateString("en-GB")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🟠 النواقص (حد الطلب) */}
      {alerts.lowStock.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-4">
          <h3 className="text-amber-400 text-sm font-bold flex items-center gap-2 mb-3">
            <ExclamationTriangleIcon className="w-5 h-5" />
             النواقص وحد الطلب ({alerts.lowStock.length})
          </h3>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {alerts.lowStock.map((item: any, idx) => (
              <div key={idx} className="bg-amber-950/40 p-2 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-200 block font-bold">{item.productName}</span>
                  <span className="text-amber-500/70">الرصيد: {item.currentStock}</span>
                </div>
                <div className="text-left bg-amber-900/30 px-2 py-1 rounded text-amber-200 font-mono font-bold">
                  Min: {item.minStock}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🟡 قريبة الانتهاء */}
      {alerts.expiringSoon.length > 0 && (
        <div className="bg-yellow-950/20 border border-yellow-900/50 rounded-2xl p-4">
          <h3 className="text-yellow-400 text-sm font-bold flex items-center gap-2 mb-3">
            <ClockIcon className="w-5 h-5" />
             قريبة الانتهاء ({alerts.expiringSoon.length})
          </h3>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {alerts.expiringSoon.map((item: any, idx) => (
              <div key={idx} className="bg-yellow-950/40 p-2 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-200 block font-bold">{item.productName}</span>
                  <span className="text-slate-500">مخزن: {item.warehouseName}</span>
                </div>
                <div className="text-left">
                  <span className="text-yellow-500 block font-bold">باقي {item.daysRemaining} يوم</span>
                  <span className="text-slate-600 font-mono">{new Date(item.expiryDate).toLocaleDateString("en-GB")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
