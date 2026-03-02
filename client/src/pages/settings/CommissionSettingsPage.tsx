import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";

const SERVICE_TYPES = [
  { key: "CONSULTATION", label: "استشارة طبية", icon: "🩺" },
  { key: "PROCEDURE", label: "إجراء / عملية", icon: "🔪" },
  { key: "LAB", label: "مختبر", icon: "🧪" },
  { key: "RADIOLOGY", label: "أشعة", icon: "📡" },
  { key: "PHARMACY", label: "صيدلية", icon: "💊" },
  { key: "BED", label: "إيواء / أسرّة", icon: "🛏️" },
  { key: "OTHER", label: "أخرى", icon: "📋" },
];

type CommissionRule = {
  id: number;
  serviceType: string;
  doctorId: number | null;
  doctorRate: number;
  hospitalRate: number;
  doctor?: { id: number; fullName: string } | null;
};

type Doctor = { id: number; fullName: string };

export default function CommissionSettingsPage() {
  const qc = useQueryClient();

  // Default rates (doctorId = null)
  const [defaults, setDefaults] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Doctor-specific overrides
  const [showDoctorSection, setShowDoctorSection] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [doctorOverrides, setDoctorOverrides] = useState<Record<string, number>>({});

  const { data: rules = [], isLoading } = useQuery<CommissionRule[]>({
    queryKey: ["commission-rules"],
    queryFn: async () => {
      const res = await apiClient.get("/commission-rules");
      return res.data;
    },
  });

  const { data: doctors = [] } = useQuery<Doctor[]>({
    queryKey: ["doctors-list"],
    queryFn: async () => {
      const res = await apiClient.get("/users/doctors-list");
      return res.data;
    },
  });

  // Initialize defaults from API data
  useEffect(() => {
    const defaultRules: Record<string, number> = {};
    SERVICE_TYPES.forEach((st) => {
      const rule = rules.find(
        (r) => r.serviceType === st.key && r.doctorId === null
      );
      defaultRules[st.key] = rule ? Number(rule.doctorRate) : 0;
    });
    setDefaults(defaultRules);
  }, [rules]);

  // Load doctor-specific overrides when doctor selected
  useEffect(() => {
    if (!selectedDoctorId) return;
    const overrides: Record<string, number> = {};
    SERVICE_TYPES.forEach((st) => {
      const rule = rules.find(
        (r) => r.serviceType === st.key && r.doctorId === selectedDoctorId
      );
      overrides[st.key] = rule ? Number(rule.doctorRate) : -1; // -1 = use default
    });
    setDoctorOverrides(overrides);
  }, [selectedDoctorId, rules]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { rules: any[] }) => {
      await apiClient.post("/commission-rules/bulk", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission-rules"] });
      setSaving(false);
    },
  });

  const handleSaveDefaults = () => {
    setSaving(true);
    const rulesPayload = SERVICE_TYPES.map((st) => ({
      serviceType: st.key,
      doctorId: null,
      doctorRate: defaults[st.key] || 0,
    }));
    saveMutation.mutate({ rules: rulesPayload });
  };

  const handleSaveDoctorOverrides = () => {
    if (!selectedDoctorId) return;
    setSaving(true);
    const rulesPayload = SERVICE_TYPES.filter(
      (st) => doctorOverrides[st.key] !== undefined && doctorOverrides[st.key] >= 0
    ).map((st) => ({
      serviceType: st.key,
      doctorId: selectedDoctorId,
      doctorRate: doctorOverrides[st.key],
    }));
    saveMutation.mutate({ rules: rulesPayload });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/commission-rules/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-rules"] }),
  });

  if (isLoading) {
    return (
      <div className="text-center py-20 text-slate-500 animate-pulse">
        جارِ تحميل الإعدادات...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-slate-100" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          ⚙️ إعدادات العمولات وتوزيع الإيرادات
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          تحديد نسب توزيع الإيرادات بين المستشفى والأطباء حسب نوع الخدمة
        </p>
      </div>

      {/* Default Rates Section */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-1">
          📊 النسب الافتراضية (لجميع الأطباء)
        </h2>
        <p className="text-xs text-slate-500 mb-5">
          هذه النسب تُطبّق على جميع الأطباء ما لم يتم تحديد نسبة مخصصة
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {SERVICE_TYPES.map((st) => {
            const doctorPct = defaults[st.key] ?? 0;
            const hospitalPct = Math.round((100 - doctorPct) * 100) / 100;

            return (
              <div
                key={st.key}
                className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{st.icon}</span>
                  <span className="font-bold text-sm text-slate-200">
                    {st.label}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">
                      حصة الطبيب %
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-emerald-400 font-mono outline-none focus:border-sky-500"
                      value={doctorPct}
                      onChange={(e) =>
                        setDefaults({
                          ...defaults,
                          [st.key]: Math.min(100, Math.max(0, Number(e.target.value))),
                        })
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">
                      حصة المستشفى %
                    </label>
                    <div className="w-full bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-sm text-sky-400 font-mono">
                      {hospitalPct}%
                    </div>
                  </div>
                </div>

                {/* Mini progress bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${doctorPct}%` }}
                  />
                  <div
                    className="h-full bg-sky-500 transition-all"
                    style={{ width: `${hospitalPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600">
                  <span>🩺 طبيب</span>
                  <span>🏥 مستشفى</span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSaveDefaults}
          disabled={saving}
          className="mt-5 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50"
        >
          {saving ? "جارِ الحفظ..." : "💾 حفظ النسب الافتراضية"}
        </button>
      </div>

      {/* Doctor-Specific Overrides */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">
              👨‍⚕️ نسب مخصصة لطبيب معين
            </h2>
            <p className="text-xs text-slate-500">
              تجاوز النسب الافتراضية لطبيب محدد (الأولوية الأعلى)
            </p>
          </div>
          <button
            onClick={() => setShowDoctorSection(!showDoctorSection)}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition"
          >
            {showDoctorSection ? "إخفاء" : "+ إضافة نسبة مخصصة"}
          </button>
        </div>

        {showDoctorSection && (
          <div className="space-y-4">
            {/* Doctor Selector */}
            <select
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-sky-500 w-full max-w-xs"
              value={selectedDoctorId || ""}
              onChange={(e) =>
                setSelectedDoctorId(Number(e.target.value) || null)
              }
            >
              <option value="">-- اختر طبيباً --</option>
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.fullName}
                </option>
              ))}
            </select>

            {selectedDoctorId && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {SERVICE_TYPES.map((st) => {
                    const val = doctorOverrides[st.key] ?? -1;
                    const isUsingDefault = val < 0;
                    const effectiveRate = isUsingDefault
                      ? defaults[st.key] || 0
                      : val;

                    return (
                      <div
                        key={st.key}
                        className={`border rounded-xl p-3 flex flex-col gap-2 ${
                          isUsingDefault
                            ? "bg-slate-950/30 border-slate-800/50 opacity-60"
                            : "bg-slate-950/60 border-amber-800/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300">
                            {st.icon} {st.label}
                          </span>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              className="accent-amber-500"
                              checked={!isUsingDefault}
                              onChange={(e) => {
                                setDoctorOverrides({
                                  ...doctorOverrides,
                                  [st.key]: e.target.checked
                                    ? defaults[st.key] || 0
                                    : -1,
                                });
                              }}
                            />
                            <span className="text-[9px] text-slate-500">
                              تخصيص
                            </span>
                          </label>
                        </div>

                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={isUsingDefault}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-amber-400 font-mono outline-none focus:border-amber-500 disabled:opacity-40"
                          value={effectiveRate}
                          onChange={(e) =>
                            setDoctorOverrides({
                              ...doctorOverrides,
                              [st.key]: Math.min(
                                100,
                                Math.max(0, Number(e.target.value))
                              ),
                            })
                          }
                        />
                        <span className="text-[9px] text-slate-600">
                          {isUsingDefault
                            ? "يستخدم النسبة الافتراضية"
                            : `مخصص: ${effectiveRate}% طبيب / ${100 - effectiveRate}% مستشفى`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleSaveDoctorOverrides}
                  disabled={saving}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50"
                >
                  {saving ? "جارِ الحفظ..." : "💾 حفظ النسب المخصصة"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Existing overrides list */}
        {rules.filter((r) => r.doctorId !== null).length > 0 && (
          <div className="mt-5 border-t border-slate-800 pt-4">
            <h3 className="text-sm font-bold text-slate-400 mb-3">
              القواعد المخصصة الحالية:
            </h3>
            <div className="space-y-2">
              {rules
                .filter((r) => r.doctorId !== null)
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between bg-slate-950/40 border border-slate-800 rounded-lg px-4 py-2"
                  >
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-slate-200">
                        {r.doctor?.fullName}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">
                        {SERVICE_TYPES.find((s) => s.key === r.serviceType)
                          ?.label || r.serviceType}
                      </span>
                      <span className="text-emerald-400 font-mono">
                        {Number(r.doctorRate)}%
                      </span>
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(r.id)}
                      className="text-red-500 hover:text-red-400 text-xs font-bold"
                    >
                      حذف
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
