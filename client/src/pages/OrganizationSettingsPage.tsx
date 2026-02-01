// src/pages/OrganizationSettingsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
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
};

export default function OrganizationSettingsPage() {
  const [settings, setSettings] = useState<OrganizationSettings>(emptySettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // تحميل الإعدادات من الـ API
  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<OrganizationSettings>(
        "/settings/organization"
      );
      setSettings(res.data);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل بيانات المستشفى.");
    } finally {
      setLoading(false);
    }
  };

  // حفظ الإعدادات
  const saveSettings = async () => {
    if (!settings.displayName.trim()) {
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
      await loadSettings(); // عشان يعيد تحميل القيم من الـ API بعد الحفظ
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
    <div className="flex flex-col h-full text-slate-100">
      {/* الهيدر */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            إعدادات المستشفى / المنشأة
          </h1>
          <p className="text-sm text-slate-400">
            ضبط بيانات المستشفى العامة، الشعار، وطرق التواصل. هذه البيانات
            ستُستخدم في الفواتير، الإيصالات، والتقارير.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadSettings}
            className="px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-xs"
            disabled={loading || saving}
          >
            {loading ? "جارِ التحديث..." : "إعادة تحميل"}
          </button>
          <button
            type="button"
            onClick={saveSettings}
            className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs text-white disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "جارِ الحفظ..." : "حفظ الإعدادات"}
          </button>
        </div>
      </div>

      {/* المحتوى */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* البيانات الأساسية */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">
            البيانات الأساسية للمستشفى
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-300">
                الاسم الظاهر <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={settings.displayName}
                onChange={handleChange("displayName")}
                className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="مثال: مستشفى السرايا التخصصي"
              />
              <p className="text-[11px] text-slate-500">
                هذا الاسم سيظهر في الفواتير والإيصالات والتقارير.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-300">الاسم القانوني (إن وجد)</label>
              <input
                type="text"
                value={settings.legalName}
                onChange={handleChange("legalName")}
                className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="مثال: شركة السرايا للتقنية الطبية المساهمة"
              />
            </div>

            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-slate-300">العنوان</label>
              <textarea
                value={settings.address}
                onChange={handleChange("address")}
                className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60 min-h-[70px]"
                placeholder="مثال: طرابلس، طريق السواني، بجوار..."
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-300">رقم الهاتف الرئيسي</label>
              <input
                type="text"
                value={settings.phone}
                onChange={handleChange("phone")}
                className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="مثال: 021-XXXXXXX / 091-XXXXXXX"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-300">البريد الإلكتروني</label>
              <input
                type="email"
                value={settings.email}
                onChange={handleChange("email")}
                className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="مثال: info@hospital.ly"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-300">الموقع الإلكتروني</label>
              <input
                type="text"
                value={settings.website}
                onChange={handleChange("website")}
                className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="مثال: https://hospital.ly"
              />
            </div>
          </div>
        </div>

        {/* الشعار / المعاينة */}
        <div className="lg:col-span-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">
            الشعار ومعاينة الفاتورة
          </h2>

          <div className="flex flex-col gap-2 text-xs">
            <label className="text-slate-300">
              رابط صورة الشعار (Logo URL)
            </label>
            <input
              type="text"
              value={settings.logoUrl ?? ""}
              onChange={handleChange("logoUrl")}
              className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              placeholder="مثال: https://example.com/logo.png"
            />
            <p className="text-[11px] text-slate-500">
              لاحقاً ممكن نضيف رفع صورة فعليًا (upload) ونتخزن في السيرفر.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-200 mb-2">
              إعدادات الطباعة (للفواتير والتقارير)
            </h3>
            <label className="flex items-start gap-3 cursor-pointer group bg-slate-900/50 p-3 rounded-xl border border-slate-800 hover:border-sky-500/50 transition">
              <div className="relative flex items-center pt-1">
                <input
                  type="checkbox"
                  checked={settings.printHeaderFooter !== false}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      printHeaderFooter: e.target.checked,
                    }))
                  }
                  className="peer sr-only"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[6px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium text-slate-200 group-hover:text-white">
                  طباعة الترويسة والتذييل (Header & Footer)
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  فعّل هذا الخيار إذا كنت تستخدم ورقاً أبيض عادي.<br/>
                  عطّل الخيار إذا كنت تستخدم <strong>ورقاً رسمياً مطبوعاً مسبقاً (Pre-printed)</strong> لطباعة المحتوى فقط.
                </p>
              </div>
            </label>
          </div>

          <div className="mt-4 border border-slate-800 rounded-2xl bg-slate-900/70 p-3">
            <div className="text-[11px] text-slate-400 mb-2">
              معاينة سريعة كيف يبان الهيدر في الفواتير:
            </div>
            <div className="bg-white text-slate-900 rounded-xl shadow p-3">
              <div className="flex justify-between items-center gap-3">
                <div className="flex-1 text-right">
                  <div className="text-sm font-bold">
                    {settings.displayName || "اسم المستشفى / العيادة"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {settings.address || "العنوان سيظهر هنا..."}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {settings.phone && <span>📞 {settings.phone} </span>}
                    {settings.email && <span> • ✉️ {settings.email} </span>}
                  </div>
                </div>
                <div className="w-16 h-16 border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden bg-slate-50">
                  {settings.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={settings.logoUrl}
                      alt="Logo"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">Logo</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 mt-2">
            * سيتم استخدام هذه البيانات في رأس الفواتير وإيصالات الدفع
            والتقارير، ويمكن تعديلها في أي وقت من هذه الصفحة.
          </div>
        </div>
      </div>
    </div>
  );
}
