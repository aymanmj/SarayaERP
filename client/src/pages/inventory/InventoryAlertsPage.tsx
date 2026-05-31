import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../api/inventoryApi';

export function InventoryAlertsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [activeTab, setActiveTab] = useState<'lowStock' | 'expiringSoon' | 'expired'>('lowStock');

  const { data: alerts, isLoading, error } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: inventoryApi.getStockAlerts,
    refetchInterval: 30000, // refresh every 30s
  });

  const lowStock = alerts?.lowStock || [];
  const expiringSoon = alerts?.expiringSoon || [];
  const expired = alerts?.expired || [];

  const tabClass = (tab: typeof activeTab) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
      activeTab === tab
        ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
    }`;

  return (
    <div className="space-y-6 p-4" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <span className="p-2 bg-gradient-to-br from-amber-500/20 to-rose-500/20 rounded-xl text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          {t("inventory.alerts.title", "تنبيهات المخزون التشغيلية")}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t("inventory.alerts.subtitle", "مراقبة النواقص، المواد منتهية الصلاحية وتواريخ انتهاء الصلاحية القريبة مباشرة من قاعدة البيانات.")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-3">
        <button onClick={() => setActiveTab('lowStock')} className={tabClass('lowStock')}>
          {t("inventory.alerts.lowStockTab", "نواقص المخزون ({{count}})", { count: lowStock.length })}
        </button>
        <button onClick={() => setActiveTab('expiringSoon')} className={tabClass('expiringSoon')}>
          {t("inventory.alerts.expiringSoonTab", "صلاحيات تقترب على الانتهاء ({{count}})", { count: expiringSoon.length })}
        </button>
        <button onClick={() => setActiveTab('expired')} className={tabClass('expired')}>
          {t("inventory.alerts.expiredTab", "مواد منتهية الصلاحية ({{count}})", { count: expired.length })}
        </button>
      </div>

      {/* Content Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">{t("inventory.alerts.loading", "جاري تحميل التنبيهات من قاعدة البيانات...")}</div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500">{t("inventory.alerts.error", "حدث خطأ أثناء جلب التنبيهات.")}</div>
        ) : (
          <div className="overflow-x-auto">
            {activeTab === 'lowStock' && (
              <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/30">
                    <th className="py-4 px-4 font-semibold">{t("inventory.alerts.itemName", "اسم الصنف")}</th>
                    <th className="py-4 px-4 font-semibold text-center">{t("inventory.alerts.currentStock", "الرصيد الحالي")}</th>
                    <th className="py-4 px-4 font-semibold text-center">{t("inventory.alerts.minStockLimit", "حد الطلب (Min)")}</th>
                    <th className={`py-4 px-4 font-semibold ${isRtl ? "text-left" : "text-right"}`}>{t("inventory.alerts.alertNotes", "ملاحظات التنبيه")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {lowStock.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-500">
                        {t("inventory.alerts.noLowStock", "لا توجد أصناف تحت حد الطلب حالياً. المخزون سليم!")}
                      </td>
                    </tr>
                  ) : (
                    lowStock.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-4 px-4 font-medium text-slate-200">{item.productName}</td>
                        <td className="py-4 px-4 text-center font-mono text-rose-400 font-semibold">{item.currentStock}</td>
                        <td className="py-4 px-4 text-center font-mono text-slate-400">{item.minStock}</td>
                        <td className={`py-4 px-4 text-xs text-amber-500 bg-amber-500/5 font-medium ${isRtl ? "text-left" : "text-right"}`}>{item.message}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'expiringSoon' && (
              <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/30">
                    <th className="py-4 px-4 font-semibold">{t("inventory.alerts.itemName", "اسم الصنف")}</th>
                    <th className="py-4 px-4 font-semibold">{t("inventory.alerts.batchNumber", "رقم التشغيلة (Batch)")}</th>
                    <th className="py-4 px-4 font-semibold">{t("inventory.alerts.warehouse", "المستودع")}</th>
                    <th className="py-4 px-4 font-semibold text-center">{t("inventory.alerts.expiryDate", "تاريخ الانتهاء")}</th>
                    <th className={`py-4 px-4 font-semibold ${isRtl ? "text-left" : "text-right"}`}>{t("inventory.alerts.daysRemaining", "الأيام المتبقية")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {expiringSoon.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        {t("inventory.alerts.noExpiringSoon", "لا توجد تشغيلات تقترب صلاحيتها على الانتهاء خلال 3 أشهر.")}
                      </td>
                    </tr>
                  ) : (
                    expiringSoon.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-4 px-4 font-medium text-slate-200">{item.productName}</td>
                        <td className="py-4 px-4 font-mono text-slate-300">{item.batchNumber || 'N/A'}</td>
                        <td className="py-4 px-4 text-slate-400">{item.warehouseName}</td>
                        <td className="py-4 px-4 text-center font-mono text-slate-300">
                          {new Date(item.expiryDate).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US')}
                        </td>
                        <td className={`py-4 px-4 font-mono text-amber-400 font-semibold bg-amber-500/5 ${isRtl ? "text-left" : "text-right"}`}>
                          {t("inventory.alerts.daysRemainingCount", "{{count}} يوم", { count: item.daysRemaining })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'expired' && (
              <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/30">
                    <th className="py-4 px-4 font-semibold">{t("inventory.alerts.itemName", "اسم الصنف")}</th>
                    <th className="py-4 px-4 font-semibold">{t("inventory.alerts.batchNumber", "رقم التشغيلة (Batch)")}</th>
                    <th className="py-4 px-4 font-semibold">{t("inventory.alerts.warehouse", "المستودع")}</th>
                    <th className="py-4 px-4 font-semibold text-center">{t("inventory.alerts.expiryDate", "تاريخ الانتهاء")}</th>
                    <th className={`py-4 px-4 font-semibold ${isRtl ? "text-left" : "text-right"}`}>{t("inventory.alerts.status", "الحالة")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {expired.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        {t("inventory.alerts.noExpiredItems", "ممتاز! لا توجد تشغيلات منتهية الصلاحية في المستودعات.")}
                      </td>
                    </tr>
                  ) : (
                    expired.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-4 px-4 font-medium text-slate-200">{item.productName}</td>
                        <td className="py-4 px-4 font-mono text-slate-300">{item.batchNumber || 'N/A'}</td>
                        <td className="py-4 px-4 text-slate-400">{item.warehouseName}</td>
                        <td className="py-4 px-4 text-center font-mono text-rose-400">
                          {new Date(item.expiryDate).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US')}
                        </td>
                        <td className={`py-4 px-4 font-semibold text-rose-500 bg-rose-500/5 ${isRtl ? "text-left" : "text-right"}`}>
                          {item.message}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
