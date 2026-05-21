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

const KEY_LABELS: Record<string, string> = {
  'billing.debtLimit': 'حد المديونية المسموح',
  'billing.currency': 'العملة الافتراضية',
  'accounting.allowNegativeStock': 'السحب بالسالب من المخزون',
  'inventory.enableServiceExplosion': 'تفصيل الخدمات المجمعة (Service Bundles)',
  'medical.defaultLanguage': 'لغة التقارير الطبية',
  'mpi.autoLinkEnabled': 'الربط التلقائي بالسجل الوطني',
  'mpi.searchOnRegister': 'البحث عند التسجيل',
  'mpi.shareDataConsent': 'مشاركة البيانات الديموغرافية',
  'otp.enabled': 'تفعيل OTP',
  'otp.channel': 'قناة الإرسال',
  'otp.expiryMinutes': 'مدة الصلاحية (دقائق)',
  'otp.maxAttempts': 'الحد الأقصى للمحاولات',
  'inventory.requireMaterialRequestApproval': 'إلزامية اعتماد طلبات المواد',
  'inventory.autoFefoAllocation': 'السحب التلقائي بنظام (FEFO)',
};

const KEY_DESCRIPTIONS: Record<string, string> = {
  'inventory.requireMaterialRequestApproval': 'عند التفعيل، ستحتاج طلبات صرف المواد من المخزن إلى موافقة مدير المخزن قبل عملية الصرف.',
  'inventory.autoFefoAllocation': 'عند التفعيل، سيقوم النظام تلقائياً بتحديد وصرف التشغيلات (Batches) الأقرب لانتهاء الصلاحية دون تدخّل يدوي.',
  'accounting.allowNegativeStock': 'السماح بصرف كميات غير متوفرة دفترياً، مما ينتج عنه أرصدة سالبة تُسوّى لاحقاً.',
};

export const SystemSettingsPage = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>('MPI');

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
      if (data.length > 0) {
        // Set first available group as active
        const groups = Object.keys(data.reduce((acc, s) => ({ ...acc, [s.group || 'OTHER']: true }), {}));
        const firstGroup = groupOrder.find(g => groups.includes(g)) || groups[0];
        if (firstGroup) setActiveGroup(firstGroup);
      }
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
          className="bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-2 w-full max-w-sm focus:ring-2 focus:ring-sky-500 outline-none transition-all shadow-inner"
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
        className="bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-2 w-full max-w-sm focus:ring-2 focus:ring-sky-500 outline-none transition-all shadow-inner"
        disabled={savingKey === setting.key}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-400">
        <div className="animate-pulse text-xl font-semibold flex items-center gap-3">
          <span className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></span>
          جارِ تحميل الإعدادات...
        </div>
      </div>
    );
  }

  const activeGroupSettings = groupedSettings[activeGroup] || [];
  const activeMeta = GROUP_META[activeGroup] || GROUP_META.OTHER;

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex justify-between items-center mb-8 bg-slate-900/60 p-6 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-sky-500/10 text-sky-400 rounded-xl">⚙️</span>
            إعدادات النظام
          </h1>
          <p className="text-slate-400 text-sm font-medium px-1">إدارة الإعدادات العامة للنظام والتكوينات المتقدمة للمؤسسة</p>
        </div>
        <button
          onClick={fetchSettings}
          className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition-all shadow-lg shadow-sky-900/20 text-sm font-bold border border-sky-500/50 flex items-center gap-2"
        >
          <span>🔄</span> تحديث
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar Navigation */}
        <div className="w-full lg:w-1/4 flex flex-col gap-2 bg-slate-900/40 p-4 rounded-3xl border border-slate-800/80 shadow-lg">
          {sortedGroups.map(([group]) => {
            const meta = GROUP_META[group] || GROUP_META.OTHER;
            const isActive = activeGroup === group;
            return (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={`flex items-center gap-4 w-full text-right px-5 py-3.5 rounded-2xl transition-all duration-300 font-bold ${
                  isActive 
                    ? 'bg-slate-800 text-white shadow-md border border-slate-700/50' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <span className={`text-xl ${isActive ? meta.color : 'opacity-60'}`}>{meta.icon}</span>
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="w-full lg:w-3/4">
          {settings.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-dashed border-slate-700">
              <span className="text-4xl mb-4 block">🛠️</span>
              <p className="text-slate-400 text-lg font-medium">لا توجد إعدادات — يرجى تشغيل سكربت البذور أولاً</p>
            </div>
          ) : (
            <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-800/80">
                <div className={`w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-3xl shadow-inner border border-slate-700/50 ${activeMeta.color}`}>
                  {activeMeta.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white">{activeMeta.label}</h2>
                  <p className="text-slate-400 text-sm mt-1">تخصيص الخيارات المتعلقة بـ {activeMeta.label}</p>
                </div>
              </div>

              <div className="space-y-6">
                {activeGroupSettings.map((setting) => (
                  <div key={setting.key} className="group p-5 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/30 hover:border-slate-600/50 rounded-2xl transition-all duration-300">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                      <div>
                        <label className="block text-base font-bold text-slate-200 mb-1">
                          {KEY_LABELS[setting.key] || setting.key}
                        </label>
                        {(setting.description || KEY_DESCRIPTIONS[setting.key]) && (
                          <p className="text-xs text-slate-400 font-medium max-w-xl leading-relaxed">
                            {setting.description || KEY_DESCRIPTIONS[setting.key]}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
                        {savingKey === setting.key && (
                          <span className="text-xs text-amber-400 animate-pulse font-bold bg-amber-400/10 px-2 py-1 rounded-md">جارِ الحفظ...</span>
                        )}
                        <div className="w-full md:w-auto">{renderInput(setting)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemSettingsPage;
