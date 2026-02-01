// src/pages/insurance/PreAuthPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import type { PreAuthorization } from "../types/insurance";

export default function PreAuthPage() {
  const [auths, setAuths] = useState<PreAuthorization[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PreAuthorization[]>(
        "/insurance/pre-auth",
      );
      setAuths(res.data);
    } catch {
      toast.error("فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            الموافقات المسبقة (Pre-Auth)
          </h1>
          <p className="text-sm text-slate-400">
            متابعة طلبات الموافقة الواردة والصادرة لشركات التأمين.
          </p>
        </div>
        <button
          onClick={loadData} // يمكن فتح مودال إضافة جديد هنا لاحقاً
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm"
        >
          تحديث
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">رقم الموافقة</th>
              <th className="px-4 py-3">المريض</th>
              <th className="px-4 py-3">الشركة</th>
              <th className="px-4 py-3">الخدمة</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">تاريخ الانتهاء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {auths.map((auth) => (
              <tr key={auth.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-emerald-400">
                  {auth.authCode || "Pending"}
                </td>
                <td className="px-4 py-3 font-medium">
                  {auth.patient.fullName}
                  <div className="text-xs text-slate-500">
                    {auth.patient.mrn}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {auth.policy.provider.name}
                </td>
                <td className="px-4 py-3">{auth.serviceItem?.name || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      auth.status === "APPROVED"
                        ? "bg-emerald-900/40 text-emerald-300"
                        : auth.status === "REJECTED"
                          ? "bg-rose-900/40 text-rose-300"
                          : "bg-amber-900/40 text-amber-300"
                    }`}
                  >
                    {auth.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {auth.expiresAt
                    ? formatDate(auth.expiresAt)
                    : "—"}
                </td>
              </tr>
            ))}
            {auths.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-500">
                  لا توجد موافقات مسجلة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
