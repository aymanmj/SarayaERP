// src/pages/ServicesMasterPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type ServiceItem = {
  id: number;
  code: string;
  name: string;
  type: string;
  // قد تأتي string من الـ Backend بسبب Prisma Decimal
  defaultPrice: number | string;
  isActive: boolean;
  category?: { name: string };
};

const SERVICE_TYPES = [
  { label: "كشف (Consultation)", value: "CONSULTATION" },
  { label: "مختبر (Lab)", value: "LAB" },
  { label: "أشعة (Radiology)", value: "RADIOLOGY" },
  { label: "إجراء طبي (Procedure)", value: "PROCEDURE" },
  { label: "إقامة (Bed)", value: "BED" },
  { label: "صيدلية (Pharmacy)", value: "PHARMACY" },
  { label: "أخرى", value: "OTHER" },
];

export default function ServicesMasterPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [search, setSearch] = useState("");

  // حالة التعديل
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState<string>("");

  // حالة الإنشاء
  const [showCreate, setShowCreate] = useState(false);
  const [newService, setNewService] = useState({
    code: "",
    name: "",
    type: "CONSULTATION",
    defaultPrice: "",
  });

  const loadServices = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterType) params.type = filterType;
      const res = await apiClient.get<ServiceItem[]>("/services", { params });
      setServices(res.data);
    } catch (err) {
      toast.error("فشل تحميل الخدمات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [filterType]);

  const handleUpdatePrice = async (id: number) => {
    try {
      await apiClient.patch(`/services/${id}`, {
        defaultPrice: editPrice,
      });
      toast.success("تم تحديث السعر");
      setEditingId(null);
      loadServices();
    } catch (err) {
      toast.error("فشل التحديث");
    }
  };

  const handleCreate = async () => {
    if (!newService.code || !newService.name || !newService.defaultPrice) {
      toast.warning("يرجى ملء كافة الحقول");
      return;
    }
    try {
      await apiClient.post("/services", newService);
      toast.success("تمت إضافة الخدمة");
      setShowCreate(false);
      setNewService({
        code: "",
        name: "",
        type: "CONSULTATION",
        defaultPrice: "",
      });
      loadServices();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل الإضافة");
    }
  };

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">دليل الخدمات والأسعار</h1>
          <p className="text-sm text-slate-400">
            إدارة قائمة الخدمات الطبية وأسعارها.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm"
        >
          + إضافة خدمة جديدة
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
        <input
          type="text"
          placeholder="بحث بالاسم أو الكود..."
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">كل الأنواع</option>
          {SERVICE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="pb-3 px-2">الكود</th>
              <th className="pb-3 px-2">الاسم</th>
              <th className="pb-3 px-2">النوع</th>
              <th className="pb-3 px-2">التصنيف</th>
              <th className="pb-3 px-2">السعر (د.ل)</th>
              <th className="pb-3 px-2">الحالة</th>
              <th className="pb-3 px-2">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredServices.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/40">
                <td className="py-3 px-2 font-mono text-emerald-400">
                  {s.code}
                </td>
                <td className="py-3 px-2 font-semibold">{s.name}</td>
                <td className="py-3 px-2 text-slate-300">{s.type}</td>
                <td className="py-3 px-2 text-slate-400">
                  {s.category?.name ?? "-"}
                </td>

                <td className="py-3 px-2">
                  {editingId === s.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-20 bg-slate-950 border border-emerald-500 rounded px-1 py-0.5 text-center"
                      />
                      <button
                        onClick={() => handleUpdatePrice(s.id)}
                        className="text-emerald-400"
                      >
                        ✔
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-rose-400"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    // ✅ [FIXED] تحويل القيمة لرقم قبل استخدام toFixed
                    <span className="text-amber-300 font-bold">
                      {Number(s.defaultPrice).toFixed(3)}
                    </span>
                  )}
                </td>

                <td className="py-3 px-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      s.isActive
                        ? "bg-emerald-900/30 text-emerald-400"
                        : "bg-rose-900/30 text-rose-400"
                    }`}
                  >
                    {s.isActive ? "نشط" : "معطل"}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <button
                    onClick={() => {
                      setEditingId(s.id);
                      setEditPrice(String(s.defaultPrice));
                    }}
                    className="text-sky-400 hover:text-sky-300 text-xs"
                  >
                    تعديل السعر
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">إضافة خدمة جديدة</h3>

            <div>
              <label className="block text-xs text-slate-400 mb-1">الكود</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                value={newService.code}
                onChange={(e) =>
                  setNewService({ ...newService, code: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">الاسم</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                value={newService.name}
                onChange={(e) =>
                  setNewService({ ...newService, name: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  النوع
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                  value={newService.type}
                  onChange={(e) =>
                    setNewService({ ...newService, type: e.target.value })
                  }
                >
                  {SERVICE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  السعر
                </label>
                <input
                  type="number"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                  value={newService.defaultPrice}
                  onChange={(e) =>
                    setNewService({
                      ...newService,
                      defaultPrice: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
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
