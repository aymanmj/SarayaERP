// client/src/components/hr/BiometricDevicesModal.tsx
import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type TabKey = "devices" | "punches" | "holidays";

interface BiometricDeviceRow {
  id: number;
  name: string;
  brand: string;
  model: string | null;
  serialNumber: string;
  ipAddress: string;
  port: number;
  connectionMode: string;
  location: string | null;
  isActive: boolean;
  isOnlineAdms: boolean;
  lastSyncAt: string | null;
}

interface PunchLogRow {
  id: number;
  biometricId: string;
  punchTime: string;
  punchType: string;
  verifyMode: string | null;
  source: string;
  processed: boolean;
  device?: { name: string; serialNumber: string } | null;
  user?: { id: number; fullName: string } | null;
}

interface HolidayRow {
  id: number;
  name: string;
  nameEn: string | null;
  date: string;
  isAnnual: boolean;
}

export function BiometricDevicesModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>("devices");
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<BiometricDeviceRow[]>([]);
  const [punches, setPunches] = useState<PunchLogRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);

  // New Device form
  const [devName, setDevName] = useState("");
  const [devSn, setDevSn] = useState("");
  const [devIp, setDevIp] = useState("192.168.1.201");
  const [devLocation, setDevLocation] = useState("");

  // New Holiday form
  const [holName, setHolName] = useState("");
  const [holDate, setHolDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [holAnnual, setHolAnnual] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [devRes, pRes, hRes] = await Promise.all([
        apiClient.get("/attendance/biometric/devices"),
        apiClient.get("/attendance/biometric/punches"),
        apiClient.get("/attendance/biometric/holidays"),
      ]);
      setDevices(Array.isArray(devRes.data) ? devRes.data : []);
      setPunches(Array.isArray(pRes.data) ? pRes.data : []);
      setHolidays(Array.isArray(hRes.data) ? hRes.data : []);
    } catch {
      toast.error("تعذّر تحميل بيانات أجهزة البصمة والعطلات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreateDevice = async () => {
    if (!devName.trim() || !devSn.trim() || !devIp.trim()) {
      toast.error("أدخل اسم الجهاز والرقم التسلسلي وعنوان IP المحلي");
      return;
    }
    try {
      await apiClient.post("/attendance/biometric/devices", {
        name: devName.trim(),
        serialNumber: devSn.trim(),
        ipAddress: devIp.trim(),
        location: devLocation.trim() || undefined,
        connectionMode: "ADMS",
      });
      toast.success("تم تسجيل جهاز البصمة بنجاح");
      setDevName("");
      setDevSn("");
      setDevLocation("");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل تسجيل جهاز البصمة");
    }
  };

  const handleCreateHoliday = async () => {
    if (!holName.trim() || !holDate) {
      toast.error("أدخل اسم وتاريخ العطلة الرسمية");
      return;
    }
    try {
      await apiClient.post("/attendance/biometric/holidays", {
        name: holName.trim(),
        date: holDate,
        isAnnual: holAnnual,
      });
      toast.success("تم حفظ العطلة الرسمية بنجاح");
      setHolName("");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل حفظ العطلة الرسمية");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="إدارة أجهزة البصمة ZKTeco ADMS والعطلات الرسمية"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 text-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-sky-300">
              🖥️ أجهزة البصمة (ZKTeco ADMS) وسجل البصمات الخام والعطلات الرسمية
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              استقبال فوري لبصمات الأجهزة عبر بروتوكول السحابة (/iclock/cdata) بعزل كامل لكل منشأة وسجل غير قابل للتعديل.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"
          >
            إغلاق
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setTab("devices")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "devices" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            1. أجهزة البصمة ({devices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("punches")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "punches" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            2. سجل البصمات الخام ({punches.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("holidays")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "holidays" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            3. العطلات الرسمية ({holidays.length})
          </button>
        </div>

        {loading && <div className="text-xs text-slate-400">جاري التحميل...</div>}

        {tab === "devices" && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                placeholder="اسم الجهاز (مثلاً: بوابة الطوارئ)"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="الرقم التسلسلي (SN)"
                value={devSn}
                onChange={(e) => setDevSn(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <input
                placeholder="عنوان IP المحلي"
                value={devIp}
                onChange={(e) => setDevIp(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <input
                placeholder="الموقع / القسم"
                value={devLocation}
                onChange={(e) => setDevLocation(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleCreateDevice}
                className="md:col-span-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white"
              >
                تسجيل جهاز بصمة ADMS
              </button>
            </div>

            <div className="space-y-2">
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold">
                      {d.name} <span className="font-mono text-sky-400">({d.serialNumber})</span>
                    </div>
                    <div className="text-slate-400 font-mono">
                      IP: {d.ipAddress}:{d.port} | {d.connectionMode} | {d.location ?? "عام"}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full font-bold ${d.isOnlineAdms ? "bg-emerald-900/50 text-emerald-300" : "bg-slate-800 text-slate-400"}`}
                  >
                    {d.isOnlineAdms ? "متصل ADMS" : "بانتظار نبضة"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "punches" && (
          <div className="space-y-2">
            {punches.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                لا توجد بصمات خام مسجلة حاليًا.
              </div>
            ) : (
              punches.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono"
                >
                  <div>
                    Badge #{p.biometricId} — {p.user?.fullName ?? "غير مربوط بموظف"} ({p.punchType})
                  </div>
                  <div className="text-slate-400">
                    {new Date(p.punchTime).toLocaleString()} | {p.source}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "holidays" && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
              <input
                placeholder="اسم العطلة الرسمية"
                value={holName}
                onChange={(e) => setHolName(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                type="date"
                value={holDate}
                onChange={(e) => setHolDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={holAnnual}
                  onChange={(e) => setHolAnnual(e.target.checked)}
                />
                عطلة سنوية متكررة
              </label>
              <button
                type="button"
                onClick={handleCreateHoliday}
                className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
              >
                إضافة عطلة رسمية
              </button>
            </div>

            <div className="space-y-2">
              {holidays.map((h) => (
                <div
                  key={h.id}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div className="font-bold">{h.name}</div>
                  <div className="font-mono text-slate-400">
                    {h.date.slice(0, 10)} {h.isAnnual ? "• سنوية" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
