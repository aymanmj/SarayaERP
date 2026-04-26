import React, { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { Building2, Globe, Mail, Phone, MapPin, CheckCircle2, Save, RefreshCw, Printer, FileCheck } from "lucide-react";
import type { OrganizationSettings } from "../types/organization";

const emptySettings: OrganizationSettings = {
  id: 0,
  displayName: "",
  legalName: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  logoUrl: "",
  printHeaderFooter: true,
};

export default function OrganizationSettingsPage() {
  const [settings, setSettings] = useState<OrganizationSettings>(emptySettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<OrganizationSettings>("/settings/organization");
      setSettings(res.data);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل بيانات المستشفى.");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings.displayName?.trim()) {
      toast.warning("الاسم الظاهر للمستشفى مطلوب.");
      return;
    }

    setSaving(true);
    try {
      await apiClient.put("/settings/organization", {
        displayName: settings.displayName || null,
        legalName: settings.legalName || null,
        address: settings.address || null,
        phone: settings.phone || null,
        email: settings.email || null,
        website: settings.website || null,
        logoUrl: settings.logoUrl || null,
        printHeaderFooter: settings.printHeaderFooter,
      });

      toast.success("تم حفظ بيانات المستشفى بنجاح.");
      await loadSettings();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء حفظ بيانات المستشفى.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange =
    (field: keyof OrganizationSettings) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSettings((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 text-violet-400 rounded-xl shadow-[0_0_15px_-3px_rgba(139,92,246,0.3)]">
              <Building2 className="w-6 h-6" />
            </div>
            إعدادات المؤسسة (Organization Settings)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ضبط البيانات الرسمية، الشعار، وإعدادات الطباعة للفواتير والمطالبات التأمينية.
          </p>
        </div>
        <div className="relative z-10 flex gap-2">
          <button
            type="button"
            onClick={loadSettings}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold transition-colors border border-slate-700"
            disabled={loading || saving}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 
            {loading ? "جارِ التحديث..." : "إعادة تحميل"}
          </button>
          <button
            type="button"
            onClick={saveSettings}
            className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold shadow-lg transition-colors disabled:opacity-60"
            disabled={saving}
          >
            <Save className="w-4 h-4" /> 
            {saving ? "جارِ الحفظ..." : "حفظ الإعدادات"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-auto custom-scrollbar pb-10">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
            <h2 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-violet-400" />
              البيانات الرسمية للمستشفى
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">الاسم الظاهر <span className="text-rose-400">*</span></label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute right-3 top-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={settings.displayName || ""}
                    onChange={handleChange("displayName")}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all"
                    placeholder="مثال: مستشفى السرايا التخصصي"
                  />
                </div>
                <p className="text-[10px] text-slate-500">سيظهر في الفواتير والتقارير الطبية.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">الاسم القانوني (Legal Name)</label>
                <div className="relative">
                  <FileCheck className="w-4 h-4 absolute right-3 top-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={settings.legalName || ""}
                    onChange={handleChange("legalName")}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all"
                    placeholder="مثال: شركة السرايا للتقنية الطبية"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-400">العنوان الكامل (Address)</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute right-3 top-3.5 text-slate-500" />
                  <textarea
                    value={settings.address || ""}
                    onChange={handleChange("address")}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all min-h-[80px] resize-none"
                    placeholder="المدينة، الشارع، أقرب نقطة دالة..."
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">رقم الهاتف (Phone)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute right-3 top-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={settings.phone || ""}
                    onChange={handleChange("phone")}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all"
                    placeholder="021-XXXXXXX"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">البريد الإلكتروني (Email)</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute right-3 top-3.5 text-slate-500" />
                  <input
                    type="email"
                    value={settings.email || ""}
                    onChange={handleChange("email")}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-left"
                    dir="ltr"
                    placeholder="info@hospital.ly"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">الموقع الإلكتروني (Website)</label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute right-3 top-3.5 text-slate-500" />
                  <input
                    type="url"
                    value={settings.website || ""}
                    onChange={handleChange("website")}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-left"
                    dir="ltr"
                    placeholder="https://hospital.ly"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Logo & Print Preview */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
            <h2 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-2">
              <Printer className="w-5 h-5 text-sky-400" />
              الطباعة والهوية المرئية
            </h2>

            <div className="flex flex-col gap-2 mb-6">
              <label className="text-xs font-bold text-slate-400">رابط الشعار (Logo URL)</label>
              <input
                type="text"
                value={settings.logoUrl || ""}
                onChange={handleChange("logoUrl")}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all text-left"
                dir="ltr"
                placeholder="https://example.com/logo.png"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer group bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-sky-500/50 transition-all mb-6">
              <div className="relative flex items-center pt-0.5">
                <input
                  type="checkbox"
                  checked={settings.printHeaderFooter !== false}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, printHeaderFooter: e.target.checked }))
                  }
                  className="peer sr-only"
                />
                <div className="w-10 h-6 bg-slate-800 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-sky-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:border-slate-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              </div>
              <div className="flex-1">
                <span className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                  طباعة الترويسة والتذييل
                </span>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  فعّل هذا الخيار إذا كنت تستخدم ورقاً أبيض عادي.<br/>
                  عطّل الخيار إذا كنت تستخدم <strong>ورقاً مطبوعاً مسبقاً (Letterhead)</strong>.
                </p>
              </div>
            </label>

            <div className="border border-slate-800 rounded-xl bg-slate-950 p-4">
              <div className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                معاينة رأس الفاتورة
              </div>
              <div className="bg-white text-slate-900 rounded-lg shadow-inner p-4 transition-all duration-300">
                <div className="flex justify-between items-center gap-4">
                  <div className="flex-1 text-right">
                    <div className="text-base font-black text-slate-800">
                      {settings.displayName || "اسم المؤسسة"}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                      {settings.address || "العنوان سيظهر هنا..."}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-1 flex gap-2 font-mono">
                      {settings.phone && <span>📞 {settings.phone}</span>}
                      {settings.email && <span>✉️ {settings.email}</span>}
                    </div>
                  </div>
                  <div className="w-16 h-16 border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden bg-slate-50/50 flex-shrink-0">
                    {settings.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={settings.logoUrl}
                        alt="Logo"
                        className="w-full h-full object-contain p-1"
                        onError={(e) => {
                           (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NDBhMWUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjkiIGN5PSI5IiByPSIyIi8+PHBhdGggZD0ibTIxIDE1LTMuMDgtMy4wOGExLjIgMS4yIDAgMCAwLTEuNzEgMGwtNS45IDUuOTAiLz48cGF0aCBkPSJNOSAyMiA4IDE1Ii8+PC9zdmc+';
                        }}
                      />
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">شعار</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
