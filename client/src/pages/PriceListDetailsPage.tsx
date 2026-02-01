// src/pages/PriceListDetailsPage.tsx

import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type ServiceItem = {
  id: number;
  code: string | null;
  name: string;
  type: string; // CONSULTATION, LAB, RAD...
  defaultPrice: number; // Base Price
  category?: { name: string };
};

type PriceListItem = {
  id: number;
  serviceItemId: number | null;
  price: number;
};

// نوع البيانات المدمجة للعرض
type MergedRow = ServiceItem & {
  customPrice?: number; // السعر الخاص بهذه القائمة (إن وجد)
  isModified?: boolean; // للمساعدة في الواجهة
};

export default function PriceListDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const listId = Number(id);
  const navigate = useNavigate();

  const [listInfo, setListInfo] = useState<{
    name: string;
    code: string;
  } | null>(null);
  const [rows, setRows] = useState<MergedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  // State لتخزين التعديلات المحلية قبل الحفظ
  const [editMap, setEditMap] = useState<Record<number, string>>({}); // serviceId -> price string

  const loadData = async () => {
    if (!listId) return;
    setLoading(true);
    try {
      // 1. نجلب كل الخدمات
      const servicesRes = await apiClient.get<ServiceItem[]>("/services");
      // 2. نجلب الأسعار الخاصة بهذه القائمة
      const itemsRes = await apiClient.get<PriceListItem[]>(
        `/price-lists/${listId}/items`,
      );

      // 3. ندمج البيانات
      const allServices = servicesRes.data;
      const overrides = itemsRes.data;

      // نبحث عن اسم القائمة (يمكن عمل Endpoint خاص لجلب تفاصيل القائمة، أو نفلتر من القائمة الرئيسية، هنا سنفترض وجودها في القائمة لتبسيط الكود أو نجلبها بشكل منفصل. للسرعة سنجلب القوائم ونبحث)
      // *تحسين:* يفضل عمل Endpoint `GET /price-lists/:id` في الباكند. سأفترض وجودها أو التعامل مع البيانات المتاحة.
      // سنجلب القوائم مؤقتاً لمعرفة الاسم
      apiClient.get<any[]>("/price-lists").then((res) => {
        const found = res.data.find((l) => l.id === listId);
        if (found) setListInfo({ name: found.name, code: found.code });
      });

      const merged: MergedRow[] = allServices.map((srv) => {
        const override = overrides.find((o) => o.serviceItemId === srv.id);
        return {
          ...srv,
          customPrice: override ? Number(override.price) : undefined,
        };
      });

      setRows(merged);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [listId]);

  // تصفية الجدول
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch =
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.code?.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "ALL" || r.type === filterType;
      return matchSearch && matchType;
    });
  }, [rows, search, filterType]);

  // عند تغيير السعر في الإدخال
  const handlePriceChange = (serviceId: number, val: string) => {
    setEditMap((prev) => ({ ...prev, [serviceId]: val }));
  };

  // حفظ سعر خدمة معينة
  const handleSaveItem = async (serviceId: number) => {
    const val = editMap[serviceId];
    if (val === undefined) return; // لم يتغير شيء

    const numVal = Number(val);
    if (isNaN(numVal) || numVal < 0) {
      toast.warning("أدخل سعراً صحيحاً");
      return;
    }

    try {
      await apiClient.post(`/price-lists/${listId}/items`, {
        serviceItemId: serviceId,
        price: numVal,
      });

      toast.success("تم الحفظ");

      // تحديث الحالة المحلية
      setRows((prev) =>
        prev.map((r) =>
          r.id === serviceId ? { ...r, customPrice: numVal } : r,
        ),
      );

      // إزالة من خريطة التعديل
      setEditMap((prev) => {
        const copy = { ...prev };
        delete copy[serviceId];
        return copy;
      });
    } catch (err) {
      toast.error("فشل الحفظ");
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-4"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div>
          <button
            onClick={() => navigate("/settings")}
            className="text-xs text-slate-400 hover:text-white mb-1"
          >
            ➜ قوائم الأسعار
          </button>
          <h1 className="text-2xl font-bold">
            {listInfo ? listInfo.name : "..."}
          </h1>
          <p className="text-sm text-sky-400 font-mono">{listInfo?.code}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <input
            placeholder="بحث عن خدمة..."
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm w-64 focus:border-sky-500 outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm w-40 focus:border-sky-500 outline-none"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="ALL">كل الأنواع</option>
            <option value="CONSULTATION">كشف</option>
            <option value="LAB">مختبر</option>
            <option value="RADIOLOGY">أشعة</option>
            <option value="BED">إقامة</option>
            <option value="PROCEDURE">إجراءات</option>
            <option value="PHARMACY">أدوية (عامة)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-1">
        <table className="w-full text-sm text-right border-collapse">
          <thead className="text-slate-400 bg-slate-950 sticky top-0 z-10">
            <tr>
              <th className="p-3 border-b border-slate-800">الكود</th>
              <th className="p-3 border-b border-slate-800">الخدمة</th>
              <th className="p-3 border-b border-slate-800">النوع</th>
              <th className="p-3 border-b border-slate-800 text-center bg-slate-900/50">
                السعر الأساسي
              </th>
              <th className="p-3 border-b border-slate-800 w-32 text-center bg-sky-900/10">
                سعر القائمة
              </th>
              <th className="p-3 border-b border-slate-800 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  جارِ التحميل...
                </td>
              </tr>
            )}

            {!loading &&
              filteredRows.map((row) => {
                // القيمة المعروضة في الحقل: إما القيمة المعدلة حالياً أو السعر المخصص المحفوظ
                const inputValue =
                  editMap[row.id] !== undefined
                    ? editMap[row.id]
                    : (row.customPrice ?? "");
                const isChanged =
                  editMap[row.id] !== undefined &&
                  Number(editMap[row.id]) !== row.customPrice;

                return (
                  <tr key={row.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-mono text-slate-400 text-xs">
                      {row.code || "-"}
                    </td>
                    <td className="p-3 font-semibold text-slate-200">
                      {row.name}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{row.type}</td>

                    {/* السعر الأساسي (Read only) */}
                    <td className="p-3 text-center text-slate-400 bg-slate-900/30">
                      {Number(row.defaultPrice).toFixed(3)}
                    </td>

                    {/* السعر المخصص (Editable) */}
                    <td className="p-3 bg-sky-900/5">
                      <input
                        type="number"
                        step="0.001"
                        className={`w-full text-center rounded-lg px-2 py-1.5 text-sm outline-none border focus:ring-2 transition ${
                          row.customPrice !== undefined
                            ? "bg-emerald-900/20 border-emerald-500/50 text-emerald-300 focus:ring-emerald-500/50"
                            : "bg-slate-950 border-slate-700 text-slate-300 focus:ring-sky-500"
                        }`}
                        placeholder="افتراضي"
                        value={inputValue}
                        onChange={(e) =>
                          handlePriceChange(row.id, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveItem(row.id);
                        }}
                      />
                    </td>

                    {/* زر الحفظ */}
                    <td className="p-3 text-center">
                      {isChanged && (
                        <button
                          onClick={() => handleSaveItem(row.id)}
                          className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded shadow animate-in fade-in"
                        >
                          حفظ
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
