// src/pages/ServicesMasterPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type ServiceCategory = { id: number; name: string; description?: string };

type ServiceItem = {
  id: number;
  code: string;
  name: string;
  type: string;
  defaultPrice: number | string;
  isActive: boolean;
  category?: { id: number; name: string };
};

const SERVICE_TYPES = [
  { label: "كشف (Consultation)", value: "CONSULTATION" },
  { label: "عملية جراحية (Surgery)", value: "SURGERY" },
  { label: "مختبر (Lab)", value: "LAB" },
  { label: "أشعة (Radiology)", value: "RADIOLOGY" },
  { label: "إجراء طبي (Procedure)", value: "PROCEDURE" },
  { label: "إقامة (Bed)", value: "BED" },
  { label: "صيدلية (Pharmacy)", value: "PHARMACY" },
  { label: "أخرى", value: "OTHER" },
];

export default function ServicesMasterPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
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
    categoryId: "",
    defaultPrice: "",
  });

  // حالة إدارة الفئات
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterType) params.type = filterType;
      
      const [resSrv, resCat] = await Promise.all([
        apiClient.get<ServiceItem[]>("/services", { params }),
        apiClient.get<ServiceCategory[]>("/services/categories")
      ]);

      setServices(resSrv.data);
      setCategories(resCat.data);
    } catch (err) {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterType]);

  const handleUpdatePrice = async (id: number) => {
    try {
      await apiClient.patch(`/services/${id}`, {
        defaultPrice: editPrice,
      });
      toast.success("تم تحديث السعر");
      setEditingId(null);
      loadData();
    } catch (err) {
      toast.error("فشل التحديث");
    }
  };

  const handleCreate = async () => {
    if (!newService.code || !newService.name || !newService.defaultPrice) {
      toast.warning("يرجى ملء الحقول الإجبارية");
      return;
    }
    try {
      await apiClient.post("/services", {
        ...newService,
        categoryId: newService.categoryId ? Number(newService.categoryId) : undefined
      });
      toast.success("تمت إضافة الخدمة");
      setShowCreate(false);
      setNewService({
        code: "",
        name: "",
        type: "CONSULTATION",
        categoryId: "",
        defaultPrice: "",
      });
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل الإضافة");
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await apiClient.post("/services/categories", { name: newCategoryName });
      toast.success("تم إضافة الفئة بنجاح");
      setNewCategoryName("");
      // Refresh categories
      const resCat = await apiClient.get<ServiceCategory[]>("/services/categories");
      setCategories(resCat.data);
    } catch (err) {
      toast.error("فشل إضافة الفئة");
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
            إدارة قائمة الخدمات الطبية وتصنيفاتها وأسعارها.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCategoriesModal(true)}
            className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 rounded-xl text-sm transition"
          >
            إدارة الفئات (Categories)
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm shadow-lg transition"
          >
            + إضافة خدمة جديدة
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
        <input
          type="text"
          placeholder="بحث بالاسم أو الكود..."
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm flex-1 focus:border-sky-500 outline-none transition"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none transition"
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
                <td className="py-3 px-2 text-slate-300">
                  <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                    {s.type}
                  </span>
                </td>
                <td className="py-3 px-2 text-purple-300 font-medium">
                  {s.category?.name || <span className="text-slate-600">—</span>}
                </td>

                <td className="py-3 px-2">
                  {editingId === s.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-20 bg-slate-950 border border-emerald-500 rounded px-1 py-0.5 text-center outline-none"
                      />
                      <button
                        onClick={() => handleUpdatePrice(s.id)}
                        className="text-emerald-400 font-bold hover:scale-110 transition"
                      >
                        ✔
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-rose-400 font-bold hover:scale-110 transition"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
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
            {loading && (
              <tr><td colSpan={7} className="text-center py-6 text-slate-500">جارِ التحميل...</td></tr>
            )}
            {!loading && filteredServices.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-slate-500">لا توجد خدمات مطابقة.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm shadow-2xl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4 animate-in zoom-in-95">
            <h3 className="text-lg font-bold">إضافة خدمة جديدة</h3>

            <div>
              <label className="block text-xs text-slate-400 mb-1">الكود <span className="text-rose-500">*</span></label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                value={newService.code}
                onChange={(e) =>
                  setNewService({ ...newService, code: e.target.value })
                }
                placeholder="مثال: LAB-001"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">الاسم <span className="text-rose-500">*</span></label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                value={newService.name}
                onChange={(e) =>
                  setNewService({ ...newService, name: e.target.value })
                }
                placeholder="اسم الخدمة..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  النوع
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500"
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
                  الفئة (التصنيف)
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                  value={newService.categoryId}
                  onChange={(e) =>
                    setNewService({ ...newService, categoryId: e.target.value })
                  }
                >
                  <option value="">-- بدون فئة --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                السعر (د.ل) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                value={newService.defaultPrice}
                onChange={(e) =>
                  setNewService({
                    ...newService,
                    defaultPrice: e.target.value,
                  })
                }
                placeholder="0.000"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 mt-2"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 mt-2 shadow-lg"
              >
                حفظ الخدمة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories Modal */}
      {showCategoriesModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm shadow-2xl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-bold text-lg text-purple-300">إدارة فئات الخدمات</h3>
              <button onClick={() => setShowCategoriesModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-4 flex-1 overflow-auto bg-slate-900/50">
              {categories.length === 0 ? (
                <div className="text-center text-slate-500 py-6 text-sm">
                  لا توجد فئات حالياً.
                </div>
              ) : (
                <ul className="space-y-2">
                  {categories.map(c => (
                    <li key={c.id} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                      <span className="font-bold text-slate-200">{c.name}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded">ID: {c.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950">
              <label className="block text-xs text-slate-400 mb-1">إضافة فئة جديدة</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                  placeholder="اسم الفئة (مثال: فحوصات مخبرية، أشعة سينية...)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-purple-500 text-sm"
                />
                <button 
                  disabled={!newCategoryName.trim()}
                  onClick={handleCreateCategory}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition"
                >
                  إضافة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
