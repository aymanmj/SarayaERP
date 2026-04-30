import React, { useEffect, useState } from 'react';
import { SystemSetting, systemSettingsApi } from '../../api/systemSettings';
import { toast } from 'sonner';

// Group metadata for Arabic labels and icons
const GROUP_META: Record<string, { label: string; icon: string; color: string }> = {
  BILLING: { label: 'الفوترة والمحاسبة', icon: '💰', color: 'text-emerald-400' },
  INVENTORY: { label: 'المخزون', icon: '📦', color: 'text-amber-400' },
  MEDICAL: { label: 'الإعدادات الطبية', icon: '🩺', color: 'text-sky-400' },
  MPI: { label: 'السجل الوطني الموحد (MPI)', icon: '🌐', color: 'text-violet-400' },
  OTP: { label: 'رسائل التحقق (OTP)', icon: '🔐', color: 'text-rose-400' },
  OTHER: { label: 'إعدادات أخرى', icon: '⚙️', color: 'text-slate-400' },
};

// Friendly Arabic labels for setting keys
const KEY_LABELS: Record<string, string> = {
  'billing.debtLimit': 'حد المديونية المسموح',
  'billing.currency': 'العملة الافتراضية',
  'accounting.allowNegativeStock': 'السحب بالسالب من المخزون',
  'medical.defaultLanguage': 'لغة التقارير الطبية',
  'mpi.autoLinkEnabled': 'الربط التلقائي بالسجل الوطني',
  'mpi.searchOnRegister': 'البحث عند التسجيل',
  'mpi.shareDataConsent': 'مشاركة البيانات الديموغرافية',
  'otp.enabled': 'تفعيل OTP',
  'otp.channel': 'قناة الإرسال',
  'otp.expiryMinutes': 'مدة الصلاحية (دقائق)',
  'otp.maxAttempts': 'الحد الأقصى للمحاولات',
};

export const SystemSettingsPage = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const groupedSettings = settings.reduce((acc, setting) => {
    const group = setting.group || 'OTHER';
    if (!acc[group]) acc[group] = [];
    acc[group].push(setting);
    return acc;
  }, {} as Record<string, SystemSetting[]>);

  // Sort groups in desired order
  const groupOrder = ['MPI', 'OTP', 'BILLING', 'INVENTORY', 'MEDICAL', 'OTHER'];
  const sortedGroups = Object.entries(groupedSettings).sort(
    ([a], [b]) => (groupOrder.indexOf(a) === -1 ? 99 : groupOrder.indexOf(a)) - (groupOrder.indexOf(b) === -1 ? 99 : groupOrder.indexOf(b))
  );

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await systemSettingsApi.findAll();
      setSettings(data);
    } catch (error) {
      toast.error('فشل في تحميل الإعدادات');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleUpdate = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      await systemSettingsApi.update(key, value);
      toast.success('تم تحديث الإعداد بنجاح');
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value } : s))
      );
    } catch (error) {
      toast.error('فشل في تحديث الإعداد');
      console.error(error);
    } finally {
      setSavingKey(null);
    }
  };

  const renderInput = (setting: SystemSetting) => {
    if (setting.type === 'BOOLEAN') {
      return (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={setting.value === 'true'}
            onChange={(e) => handleUpdate(setting.key, String(e.target.checked))}
            disabled={savingKey === setting.key}
          />
          <div className="w-11 h-6 bg-slate-700/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
          <span className="mr-3 text-sm font-medium text-slate-300">
            {setting.value === 'true' ? 'مُفعّل' : 'مُعطّل'}
          </span>
        </label>
      );
    }

    if (setting.type === 'NUMBER') {
      return (
        <input
          type="number"
          defaultValue={setting.value}
          onBlur={(e) => {
            if (e.target.value !== setting.value) {
              handleUpdate(setting.key, e.target.value);
            }
          }}
          className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 w-full focus:ring-2 focus:ring-sky-500 outline-none transition-all"
          disabled={savingKey === setting.key}
        />
      );
    }

    return (
      <input
        type="text"
        defaultValue={setting.value}
        onBlur={(e) => {
          if (e.target.value !== setting.value) {
            handleUpdate(setting.key, e.target.value);
          }
        }}
        className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 w-full focus:ring-2 focus:ring-sky-500 outline-none transition-all"
        disabled={savingKey === setting.key}
      />
    );
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="animate-pulse text-xl">⏳ جارِ تحميل الإعدادات...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">⚙️ إعدادات النظام</h1>
          <p className="text-slate-400 text-sm">إدارة الإعدادات العامة للنظام والتكوينات المتقدمة</p>
        </div>
        <button
          onClick={fetchSettings}
          className="px-5 py-2.5 bg-slate-800 text-slate-300 rounded-2xl hover:bg-slate-700 transition-colors text-sm font-bold border border-slate-700"
        >
          🔄 تحديث
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sortedGroups.map(([group, groupSettings]) => {
          const meta = GROUP_META[group] || GROUP_META.OTHER;
          return (
            <div
              key={group}
              className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-3xl p-6 shadow-xl"
            >
              <h2 className={`text-lg font-bold ${meta.color} mb-5 border-b border-slate-800 pb-3 flex items-center gap-2`}>
                <span className="text-xl">{meta.icon}</span>
                {meta.label}
              </h2>
              <div className="space-y-5">
                {groupSettings.map((setting) => (
                  <div key={setting.key} className="group">
                    <div className="flex justify-between items-start mb-2">
                      <label className="block text-sm font-bold text-slate-200">
                        {KEY_LABELS[setting.key] || setting.key}
                      </label>
                      {savingKey === setting.key && (
                        <span className="text-xs text-amber-500 animate-pulse font-bold">جارِ الحفظ...</span>
                      )}
                    </div>
                    <div className="mb-1.5">{renderInput(setting)}</div>
                    {setting.description && (
                      <p className="text-[11px] text-slate-500">{setting.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {settings.length === 0 && (
          <div className="col-span-full text-center py-12 bg-slate-800/30 rounded-3xl border border-dashed border-slate-700">
            <p className="text-slate-500 text-lg">لا توجد إعدادات — يرجى تشغيل سكربت البذور أولاً</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemSettingsPage;
