// src/pages/IntegrationPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

// Types
type DeviceType = "LAB" | "RADIOLOGY";

type Device = {
  id: number;
  name: string;
  type: DeviceType;
  protocol: string;
  ipAddress: string;
  port: number;
  isActive: boolean;
  _count?: { mappings: number };
};

type Mapping = {
  id: number;
  deviceTestCode: string;
  labTest: { id: number; name: string; code: string };
};

type Log = {
  id: number;
  direction: "INBOUND" | "OUTBOUND";
  messageType: string;
  rawMessage: string;
  status: string;
  createdAt: string;
  device: { name: string };
};

type LabTestLite = { id: number; name: string; code: string };

export default function IntegrationPage() {
  const [activeTab, setActiveTab] = useState<"DEVICES" | "LOGS">("DEVICES");

  // Devices State
  const [devices, setDevices] = useState<Device[]>([]);
  const [showDeviceModal, setShowDeviceModal] = useState(false);

  // Form State for Device (Create/Edit)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    name: "",
    type: "LAB" as DeviceType,
    ipAddress: "127.0.0.1",
    port: 6661,
    isActive: true,
  });

  // Mapping State
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [labTests, setLabTests] = useState<LabTestLite[]>([]);
  const [newMapping, setNewMapping] = useState({
    labTestId: "",
    deviceCode: "",
  });

  // Logs State
  const [logs, setLogs] = useState<Log[]>([]);

  // Loaders
  const loadDevices = async () => {
    try {
      const res = await apiClient.get<Device[]>("/integration/devices");
      setDevices(res.data);
    } catch {
      toast.error("فشل تحميل الأجهزة");
    }
  };

  const loadLogs = async () => {
    try {
      const res = await apiClient.get<Log[]>("/integration/logs");
      setLogs(res.data);
    } catch {
      toast.error("فشل تحميل السجلات");
    }
  };

  const loadMappings = async (devId: number) => {
    try {
      const res = await apiClient.get<Mapping[]>(
        `/integration/devices/${devId}/mappings`,
      );
      setMappings(res.data);
      // Load lab catalog for dropdown
      if (labTests.length === 0) {
        const cat = await apiClient.get<LabTestLite[]>("/lab/catalog");
        setLabTests(cat.data);
      }
    } catch {
      toast.error("فشل تحميل التعيينات");
    }
  };

  useEffect(() => {
    if (activeTab === "DEVICES") loadDevices();
    if (activeTab === "LOGS") loadLogs();
  }, [activeTab]);

  useEffect(() => {
    if (selectedDeviceId) loadMappings(selectedDeviceId);
  }, [selectedDeviceId]);

  // Actions: Device
  const openCreateModal = () => {
    setEditingDevice(null);
    setDeviceForm({
      name: "",
      type: "LAB",
      ipAddress: "127.0.0.1",
      port: 6662,
      isActive: true,
    });
    setShowDeviceModal(true);
  };

  const openEditModal = (dev: Device) => {
    setEditingDevice(dev);
    setDeviceForm({
      name: dev.name,
      type: dev.type,
      ipAddress: dev.ipAddress,
      port: dev.port,
      isActive: dev.isActive,
    });
    setShowDeviceModal(true);
  };

  const handleSaveDevice = async () => {
    if (!deviceForm.name || !deviceForm.port) {
      toast.warning("يرجى إدخال الاسم والمنفذ");
      return;
    }

    try {
      if (editingDevice) {
        // Edit
        await apiClient.patch(
          `/integration/devices/${editingDevice.id}`,
          deviceForm,
        );
        toast.success("تم تحديث الجهاز");
      } else {
        // Create
        await apiClient.post("/integration/devices", deviceForm);
        toast.success("تم إضافة الجهاز");
      }
      setShowDeviceModal(false);
      loadDevices();
    } catch {
      toast.error("فشل الحفظ");
    }
  };

  const handleDeleteDevice = async (id: number) => {
    if (
      !confirm(
        "هل أنت متأكد من حذف هذا الجهاز؟ سيتم حذف جميع الإعدادات المرتبطة.",
      )
    )
      return;
    try {
      await apiClient.delete(`/integration/devices/${id}`);
      toast.success("تم حذف الجهاز");
      if (selectedDeviceId === id) setSelectedDeviceId(null);
      loadDevices();
    } catch {
      toast.error("فشل الحذف");
    }
  };

  // Actions: Mapping
  const handleAddMapping = async () => {
    if (!selectedDeviceId || !newMapping.labTestId || !newMapping.deviceCode)
      return;
    try {
      await apiClient.post(
        `/integration/devices/${selectedDeviceId}/mappings`,
        newMapping,
      );
      toast.success("تم الربط");
      setNewMapping({ labTestId: "", deviceCode: "" });
      loadMappings(selectedDeviceId);
      loadDevices(); // لتحديث العداد
    } catch {
      toast.error("فشل الربط (ربما موجود مسبقاً)");
    }
  };

  const handleDeleteMapping = async (mappingId: number) => {
    if (!confirm("هل أنت متأكد من إلغاء هذا الربط؟")) return;
    try {
      await apiClient.delete(`/integration/mappings/${mappingId}`);
      toast.success("تم الحذف بنجاح");
      if (selectedDeviceId) loadMappings(selectedDeviceId);
    } catch (err) {
      console.error(err);
      toast.error("فشل عملية الحذف");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            الربط والتكامل (LIS/PACS Integration)
          </h1>
          <p className="text-sm text-slate-400">
            إدارة أجهزة المختبر والأشعة وربط الأكواد ومراقبة الرسائل (HL7).
          </p>
        </div>
        <div className="flex bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("DEVICES")}
            className={`px-4 py-1.5 rounded-md text-sm transition ${activeTab === "DEVICES" ? "bg-slate-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            الأجهزة والإعدادات
          </button>
          <button
            onClick={() => setActiveTab("LOGS")}
            className={`px-4 py-1.5 rounded-md text-sm transition ${activeTab === "LOGS" ? "bg-slate-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            سجل الرسائل (Logs)
          </button>
        </div>
      </div>

      {activeTab === "DEVICES" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* قائمة الأجهزة */}
          <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-200">الأجهزة المعرفة</h3>
              <button
                onClick={openCreateModal}
                className="text-xs bg-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-500 font-bold transition text-white"
              >
                + جديد
              </button>
            </div>

            <div className="flex-1 overflow-auto space-y-3">
              {devices.length === 0 && (
                <div className="text-center text-slate-500 text-xs py-10">
                  لا توجد أجهزة مضافة.
                </div>
              )}

              {devices.map((dev) => (
                <div
                  key={dev.id}
                  onClick={() => setSelectedDeviceId(dev.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition relative group ${selectedDeviceId === dev.id ? "bg-sky-900/20 border-sky-500 shadow-md" : "bg-slate-950/50 border-slate-800 hover:border-slate-600"}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">
                          {dev.name}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${dev.type === "LAB" ? "bg-purple-900/30 text-purple-300 border-purple-500/30" : "bg-orange-900/30 text-orange-300 border-orange-500/30"}`}
                        >
                          {dev.type}
                        </span>
                      </div>
                      <div
                        className="text-xs text-slate-400 mt-1 font-mono"
                        dir="ltr"
                      >
                        {dev.ipAddress}:{dev.port}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${dev.isActive ? "bg-emerald-900/40 text-emerald-400" : "bg-rose-900/40 text-rose-400"}`}
                    >
                      {dev.isActive ? "نشط" : "متوقف"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-800/50">
                    <span className="text-[10px] text-slate-500">
                      عدد التحاليل المربوطة: {dev._count?.mappings ?? 0}
                    </span>

                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(dev);
                        }}
                        className="text-xs text-sky-400 hover:text-sky-300"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDevice(dev.id);
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* إعدادات المابينج للجهاز المختار */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col">
            {!selectedDeviceId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                <div className="text-4xl opacity-20">🖥️</div>
                <div>اختر جهازاً من القائمة لإدارة الأكواد الخاصة به.</div>
              </div>
            ) : (
              <>
                <h3 className="font-semibold mb-4 text-sky-400 flex items-center gap-2">
                  <span>ربط الأكواد (Code Mapping)</span>
                  <span className="text-xs text-slate-500 font-normal">
                    - {devices.find((d) => d.id === selectedDeviceId)?.name}
                  </span>
                </h3>

                {/* فورم الإضافة */}
                <div className="flex flex-wrap gap-3 mb-4 bg-slate-950 p-4 rounded-xl border border-slate-800 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[11px] text-slate-400 block mb-1">
                      التحليل في النظام
                    </label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                      value={newMapping.labTestId}
                      onChange={(e) =>
                        setNewMapping({
                          ...newMapping,
                          labTestId: e.target.value,
                        })
                      }
                    >
                      <option value="">-- اختر التحليل --</option>
                      {labTests.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-48">
                    <label className="text-[11px] text-slate-400 block mb-1">
                      كود الجهاز (Device Code)
                    </label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                      placeholder="e.g. GLU"
                      value={newMapping.deviceCode}
                      onChange={(e) =>
                        setNewMapping({
                          ...newMapping,
                          deviceCode: e.target.value,
                        })
                      }
                    />
                  </div>
                  <button
                    onClick={handleAddMapping}
                    className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-sky-500/20"
                  >
                    ربط
                  </button>
                </div>

                {/* الجدول */}
                <div className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-950/30">
                  <table className="w-full text-sm text-right">
                    <thead className="text-slate-400 bg-slate-900/80 sticky top-0">
                      <tr>
                        <th className="p-3 font-medium">التحليل (System)</th>
                        <th className="p-3 font-medium">كود الجهاز (Device)</th>
                        <th className="p-3 w-20 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {mappings.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="p-8 text-center text-slate-500 text-xs"
                          >
                            لا توجد أكواد مربوطة لهذا الجهاز.
                          </td>
                        </tr>
                      )}
                      {mappings.map((m) => (
                        <tr
                          key={m.id}
                          className="hover:bg-slate-800/30 transition"
                        >
                          <td className="p-3 text-slate-200">
                            {m.labTest.name}
                            <span className="text-xs text-slate-500 mr-2 font-mono bg-slate-900 px-1.5 py-0.5 rounded">
                              {m.labTest.code}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-emerald-400 font-bold">
                            {m.deviceTestCode}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleDeleteMapping(m.id)}
                              className="text-rose-400 hover:text-rose-300 text-xs bg-rose-900/10 px-2 py-1 rounded hover:bg-rose-900/20"
                            >
                              حذف
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "LOGS" && (
        <div className="flex-1 bg-black rounded-2xl border border-slate-800 p-4 font-mono text-xs overflow-auto shadow-inner">
          <table className="w-full text-left border-collapse">
            <thead className="text-slate-500 border-b border-slate-800 bg-slate-900/50 sticky top-0">
              <tr>
                <th className="p-3 w-32">Time</th>
                <th className="p-3 w-40">Device</th>
                <th className="p-3 w-24">Dir</th>
                <th className="p-3 w-24">Type</th>
                <th className="p-3 w-24">Status</th>
                <th className="p-3">Raw Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-900 transition group"
                >
                  <td className="p-3 text-slate-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3 text-sky-300 font-semibold">
                    {log.device.name}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${log.direction === "INBOUND" ? "bg-emerald-900/40 text-emerald-400" : "bg-blue-900/40 text-blue-400"}`}
                    >
                      {log.direction}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300">{log.messageType}</td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] ${log.status === "ERROR" ? "text-rose-500 font-bold" : "text-slate-400"}`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 break-all group-hover:text-slate-300 transition">
                    {log.rawMessage.replace(/\r/g, "↵ ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal إضافة/تعديل جهاز */}
      {showDeviceModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg text-white">
              {editingDevice ? "تعديل بيانات الجهاز" : "إضافة جهاز جديد"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  اسم الجهاز
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
                  placeholder="مثال: Cobas 6000"
                  value={deviceForm.name}
                  onChange={(e) =>
                    setDeviceForm({ ...deviceForm, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  النوع
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
                  value={deviceForm.type}
                  onChange={(e) =>
                    setDeviceForm({
                      ...deviceForm,
                      type: e.target.value as DeviceType,
                    })
                  }
                >
                  <option value="LAB">مختبر (Lab)</option>
                  <option value="RADIOLOGY">أشعة (Radiology)</option>
                </select>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">
                    IP Address
                  </label>
                  <input
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-center focus:border-sky-500 outline-none"
                    placeholder="127.0.0.1"
                    value={deviceForm.ipAddress}
                    onChange={(e) =>
                      setDeviceForm({
                        ...deviceForm,
                        ipAddress: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-slate-400 block mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-center focus:border-sky-500 outline-none"
                    placeholder="6661"
                    value={deviceForm.port}
                    onChange={(e) =>
                      setDeviceForm({
                        ...deviceForm,
                        port: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={deviceForm.isActive}
                  onChange={(e) =>
                    setDeviceForm({ ...deviceForm, isActive: e.target.checked })
                  }
                  className="w-4 h-4 bg-slate-800 border-slate-600 rounded"
                />
                <label htmlFor="isActive" className="text-sm text-slate-300">
                  الجهاز نشط (Active)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setShowDeviceModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveDevice}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
