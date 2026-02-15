import React, { useEffect, useState } from 'react';
import { SystemSetting, systemSettingsApi } from '../../api/systemSettings';
import { toast } from 'sonner';

export const SystemSettingsPage = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Group settings by their 'group' property
  const groupedSettings = settings.reduce((acc, setting) => {
    const group = setting.group || 'OTHER';
    if (!acc[group]) acc[group] = [];
    acc[group].push(setting);
    return acc;
  }, {} as Record<string, SystemSetting[]>);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await systemSettingsApi.findAll();
      setSettings(data);
    } catch (error) {
      toast.error('Failed to load settings');
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
      toast.success('Setting updated successfully');
      // Update local state
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value } : s))
      );
    } catch (error) {
      toast.error('Failed to update setting');
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
          <span className="ml-3 text-sm font-medium text-slate-300">
            {setting.value === 'true' ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      );
    }

    if (setting.type === 'NUMBER') {
      return (
        <div className="flex gap-2">
          <input
            type="number"
            defaultValue={setting.value}
            onBlur={(e) => {
              if (e.target.value !== setting.value) {
                handleUpdate(setting.key, e.target.value);
              }
            }}
            className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 w-full focus:ring-2 focus:ring-sky-500"
            disabled={savingKey === setting.key}
          />
        </div>
      );
    }

    // Default STRING
    return (
      <input
        type="text"
        defaultValue={setting.value}
        onBlur={(e) => {
          if (e.target.value !== setting.value) {
            handleUpdate(setting.key, e.target.value);
          }
        }}
        className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 w-full focus:ring-2 focus:ring-sky-500"
        disabled={savingKey === setting.key}
      />
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">System Configuration</h1>
          <p className="text-slate-400">Manage global system settings and defaults</p>
        </div>
        <button
          onClick={fetchSettings}
          className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(groupedSettings).map(([group, groupSettings]) => (
          <div
            key={group}
            className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6"
          >
            <h2 className="text-xl font-semibold text-sky-400 mb-6 border-b border-slate-700 pb-2">
              {group} Settings
            </h2>
            <div className="space-y-6">
              {groupSettings.map((setting) => (
                <div key={setting.key} className="group">
                  <div className="flex justify-between items-start mb-2">
                    <label className="block text-sm font-medium text-slate-200">
                      {setting.key}
                    </label>
                    {savingKey === setting.key && (
                      <span className="text-xs text-yellow-500 animate-pulse">Saving...</span>
                    )}
                  </div>
                  <div className="mb-2">{renderInput(setting)}</div>
                  {setting.description && (
                    <p className="text-xs text-slate-500">{setting.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {settings.length === 0 && (
          <div className="col-span-full text-center py-12 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">
            <p className="text-slate-500">No settings found. Please run seed script.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemSettingsPage;
