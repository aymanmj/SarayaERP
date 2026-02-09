// src/pages/ActivationPage.tsx
// Professional Licensing System 2.0

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function ActivationPage() {
  const [machineId, setMachineId] = useState("جارِ التحميل...");
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [licensePath, setLicensePath] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch machine ID and check current status
    const fetchStatus = async () => {
      try {
        const res = await apiClient.get("/license/status");
        setMachineId(res.data.machineId || "غير متوفر");
        setLicensePath(res.data.licensePath || "");

        // If already valid, redirect to home
        if (res.data.isValid) {
          navigate("/", { replace: true });
        }
      } catch (err: any) {
        console.error("[ActivationPage] Error fetching status:", err);
        setMachineId("خطأ في الاتصال بالخادم");
      } finally {
        setPageLoading(false);
      }
    };

    fetchStatus();
  }, [navigate]);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error("يرجى إدخال مفتاح الترخيص");
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post("/license/activate", {
        key: licenseKey.trim(),
      });

      toast.success(res.data?.message || "تم التفعيل بنجاح!");

      // Full page reload to reset all stores
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message || "فشل التفعيل. تحقق من المفتاح.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const copyMachineId = () => {
    if (machineId && !machineId.includes("خطأ") && !machineId.includes("جارِ")) {
      navigator.clipboard.writeText(machineId);
      toast.success("تم نسخ معرف الجهاز");
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4"
      dir="rtl"
    >
      {/* Main Card */}
      <div className="relative max-w-lg w-full">
        {/* Glow Effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-sky-500 via-purple-500 to-emerald-500 rounded-[2rem] blur-xl opacity-20 animate-pulse"></div>

        {/* Card */}
        <div className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] p-8 shadow-2xl">
          {/* Top Gradient Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-purple-500 to-emerald-500 rounded-t-[2rem]"></div>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-sky-500/20 to-purple-500/20 rounded-2xl mb-4 border border-sky-500/30">
              <span className="text-4xl">🛡️</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              تفعيل نظام السرايا
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              للاستمرار في استخدام النظام، يرجى إدخال مفتاح الترخيص الخاص بك
            </p>
          </div>

          {/* Machine ID Section */}
          <div className="mb-6">
            <label className="block text-xs text-slate-500 mb-2 font-medium">
              معرف الجهاز (Machine ID)
            </label>
            <div className="relative group">
              <div className="bg-slate-950/80 border border-slate-700 rounded-xl p-4 font-mono text-center">
                <code className="text-lg text-sky-400 font-bold tracking-wide select-all break-all">
                  {machineId}
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

          {/* License Path (Debug Info) */}
          {licensePath && (
            <div className="mb-6 text-center">
               <p className="text-[10px] text-slate-500 mb-1">مسار ملف الترخيص (Primary)</p>
               <code className="block text-[10px] bg-slate-950 px-3 py-2 rounded-lg text-emerald-500/80 font-mono border border-slate-800 break-all">
                 {licensePath}
               </code>
            </div>
          )}

          {/* License Key Input */}
          <div className="mb-6">
            <label className="block text-xs text-slate-500 mb-2 font-medium">
              مفتاح الترخيص (License Key)
            </label>
            <textarea
              rows={4}
              className="w-full bg-slate-950/80 border border-slate-700 hover:border-slate-600 focus:border-emerald-500 rounded-xl p-4 text-xs font-mono text-emerald-300 placeholder-slate-600 outline-none resize-none transition-colors"
              placeholder="الصق مفتاح الترخيص هنا..."
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Activate Button */}
          <button
            onClick={handleActivate}
            disabled={loading || !licenseKey.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                جارِ التحقق...
              </span>
            ) : (
              "تفعيل النظام"
            )}
          </button>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <p className="text-[10px] text-slate-600">
              Saraya ERP • Protected by RSA-2048 Encryption
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
