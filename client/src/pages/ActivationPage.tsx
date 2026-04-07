// src/pages/ActivationPage.tsx
// Professional Licensing System 4.0 - Activation & Renewal

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useLicenseStore } from "../stores/licenseStore";

// Types
interface LicenseInfo {
  machineId: string;
  licensePath: string;
  isValid: boolean;
  isGracePeriod?: boolean;
  isExpired?: boolean;
  hospitalName?: string;
  plan?: string;
  expiryDate?: string;
  daysRemaining?: number;
  graceDaysRemaining?: number;
  error?: string;
}

type PageMode = "activation" | "renewal";

export default function ActivationPage() {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [mode, setMode] = useState<PageMode>("activation");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await apiClient.get("/license/status");
        const data = res.data;
        setLicenseInfo(data);

        // Determine mode based on status
        if (data.isValid && !data.isGracePeriod && !data.isExpired) {
          // License is fully valid and not in grace period
          // User came here intentionally for early renewal
          setMode("renewal");
        } else if (data.isValid && data.isGracePeriod) {
          // License expired but in grace period - renewal is urgent
          setMode("renewal");
        } else {
          // License is invalid/expired beyond grace - needs activation
          setMode("activation");
        }
      } catch (err: any) {
        console.error("[ActivationPage] Error fetching status:", err);
        setLicenseInfo({
          machineId: "خطأ في الاتصال بالخادم",
          licensePath: "",
          isValid: false,
          error: err.message,
        });
      } finally {
        setPageLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const handleSubmit = async () => {
    if (!licenseKey.trim()) {
      toast.error("يرجى إدخال مفتاح الترخيص");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "renewal" ? "/license/renew" : "/license/activate";
      const res = await apiClient.post(endpoint, { key: licenseKey.trim() });

      const result = res.data;
      toast.success(result?.message || "تمت العملية بنجاح!");

      if (result?.bonusDays > 0) {
        toast.info(`تمت إضافة ${result.bonusDays} يوم من اشتراكك السابق!`, {
          duration: 5000,
        });
      }

      // Reset license store to force re-check
      useLicenseStore.getState().reset();

      // Navigate to home after a short delay
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || "فشلت العملية. تحقق من المفتاح.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const copyMachineId = () => {
    const id = licenseInfo?.machineId;
    if (id && !id.includes("خطأ") && !id.includes("جارِ")) {
      navigator.clipboard.writeText(id);
      toast.success("تم نسخ معرف الجهاز");
    }
  };

  const goHome = () => {
    navigate("/", { replace: true });
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  // Status badge info
  const statusBadge = getStatusBadge(licenseInfo);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="relative max-w-lg w-full">
        {/* Glow Effect */}
        <div
          className={`absolute -inset-1 rounded-[2rem] blur-xl opacity-20 animate-pulse ${
            mode === "renewal"
              ? "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500"
              : "bg-gradient-to-r from-sky-500 via-purple-500 to-emerald-500"
          }`}
        ></div>

        {/* Card */}
        <div className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] p-8 shadow-2xl">
          {/* Top Gradient Bar */}
          <div
            className={`absolute top-0 left-0 right-0 h-1 rounded-t-[2rem] ${
              mode === "renewal"
                ? "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500"
                : "bg-gradient-to-r from-sky-500 via-purple-500 to-emerald-500"
            }`}
          ></div>

          {/* Header */}
          <div className="text-center mb-6">
            <div
              className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 border ${
                mode === "renewal"
                  ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30"
                  : "bg-gradient-to-br from-sky-500/20 to-purple-500/20 border-sky-500/30"
              }`}
            >
              <span className="text-4xl">{mode === "renewal" ? "🔄" : "🛡️"}</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {mode === "renewal" ? "تجديد الاشتراك" : "تفعيل نظام السرايا"}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {mode === "renewal"
                ? "أدخل مفتاح التجديد الجديد لتمديد فترة اشتراكك"
                : "للاستمرار في استخدام النظام، يرجى إدخال مفتاح الترخيص الخاص بك"}
            </p>
          </div>

          {/* Current License Status */}
          {licenseInfo?.isValid && (
            <div className="mb-6 bg-slate-950/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">حالة الاشتراك</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
              </div>

              {licenseInfo.hospitalName && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">المنشأة</span>
                  <span className="text-xs text-white font-medium">{licenseInfo.hospitalName}</span>
                </div>
              )}

              {licenseInfo.plan && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">الباقة</span>
                  <span className="text-xs text-sky-400 font-medium">{licenseInfo.plan}</span>
                </div>
              )}

              {licenseInfo.expiryDate && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">تاريخ الانتهاء</span>
                  <span className={`text-xs font-medium ${
                    licenseInfo.isGracePeriod ? "text-red-400" : "text-slate-300"
                  }`}>
                    {licenseInfo.expiryDate}
                  </span>
                </div>
              )}

              {/* Days info */}
              {!licenseInfo.isGracePeriod && licenseInfo.daysRemaining !== undefined && licenseInfo.daysRemaining > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">أيام متبقية</span>
                  <span className={`text-xs font-bold ${
                    licenseInfo.daysRemaining <= 7 ? "text-amber-400 animate-pulse" : "text-emerald-400"
                  }`}>
                    {licenseInfo.daysRemaining} يوم
                  </span>
                </div>
              )}

              {licenseInfo.isGracePeriod && licenseInfo.graceDaysRemaining !== undefined && (
                <div className="mt-2 bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-center">
                  <div className="text-xs text-red-400 mb-1">⚠️ فترة السماح</div>
                  <div className="text-lg font-bold text-red-300">
                    {licenseInfo.graceDaysRemaining} يوم متبقي
                  </div>
                  <div className="text-[10px] text-red-500 mt-1">
                    سيتوقف النظام بعد انتهاء فترة السماح
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode Toggle (only show if license is still valid) */}
          {licenseInfo?.isValid && !licenseInfo.isGracePeriod && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <button
                type="button"
                onClick={goHome}
                className="text-xs text-slate-500 hover:text-slate-300 underline transition"
              >
                العودة للنظام ←
              </button>
            </div>
          )}

          {/* Machine ID Section */}
          <div className="mb-5">
            <label className="block text-xs text-slate-500 mb-2 font-medium">
              معرف الجهاز (Machine ID)
            </label>
            <div className="relative group">
              <div className="bg-slate-950/80 border border-slate-700 rounded-xl p-3 font-mono text-center">
                <code className="text-sm text-sky-400 font-bold tracking-wide select-all break-all">
                  {licenseInfo?.machineId || "غير متوفر"}
                </code>
              </div>
              <button
                onClick={copyMachineId}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                نسخ
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-2 text-center">
              أرسل هذا المعرف للدعم الفني للحصول على مفتاح الترخيص
            </p>
          </div>

          {/* License Key Input */}
          <div className="mb-6">
            <label className="block text-xs text-slate-500 mb-2 font-medium">
              {mode === "renewal" ? "مفتاح التجديد" : "مفتاح الترخيص (License Key)"}
            </label>
            <textarea
              rows={4}
              className={`w-full bg-slate-950/80 border rounded-xl p-4 text-xs font-mono placeholder-slate-600 outline-none resize-none transition-colors ${
                mode === "renewal"
                  ? "border-slate-700 hover:border-amber-600 focus:border-amber-500 text-amber-300"
                  : "border-slate-700 hover:border-slate-600 focus:border-emerald-500 text-emerald-300"
              }`}
              placeholder={
                mode === "renewal"
                  ? "الصق مفتاح التجديد هنا..."
                  : "الصق مفتاح الترخيص هنا..."
              }
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Early Renewal Info */}
          {mode === "renewal" && licenseInfo?.isValid && !licenseInfo.isGracePeriod && (licenseInfo.daysRemaining ?? 0) > 0 && (
            <div className="mb-4 bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-emerald-400">
                💡 لديك <strong>{licenseInfo.daysRemaining}</strong> يوم متبقي. 
                سيتم إضافتها تلقائياً على الاشتراك الجديد!
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !licenseKey.trim()}
            className={`w-full py-3.5 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] ${
              mode === "renewal"
                ? "bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 shadow-amber-500/20"
                : "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-emerald-500/20"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                جارِ التحقق...
              </span>
            ) : mode === "renewal" ? (
              "🔄 تجديد الاشتراك"
            ) : (
              "🛡️ تفعيل النظام"
            )}
          </button>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <p className="text-[10px] text-slate-600">
              Saraya ERP v4.0 • Protected by RSA-2048 Encryption
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================

function getStatusBadge(info: LicenseInfo | null): { label: string; className: string } {
  if (!info) return { label: "غير معروف", className: "bg-slate-700 text-slate-300" };

  if (!info.isValid) {
    return { label: "❌ منتهي", className: "bg-red-900/50 text-red-300 border border-red-500/30" };
  }

  if (info.isGracePeriod) {
    return {
      label: "⚠️ فترة سماح",
      className: "bg-red-900/50 text-red-300 border border-red-500/30 animate-pulse",
    };
  }

  if ((info.daysRemaining ?? 0) <= 7) {
    return {
      label: "⏳ ينتهي قريباً",
      className: "bg-amber-900/50 text-amber-300 border border-amber-500/30",
    };
  }

  return { label: "✅ نشط", className: "bg-emerald-900/50 text-emerald-300 border border-emerald-500/30" };
}
