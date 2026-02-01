import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

// ✅ [RENAMED] DrugStockItem -> ProductStockItem
type ProductStockItem = {
  id: number;
  code: string | null;
  name: string;
  genericName: string | null;
  strength: string | null;
  form: string | null;
  unitPrice: number; // mapped from sellPrice in backend
  stockOnHand: number;
};

type StockTxnType = "IN" | "ADJUST";

export default function PharmacyStockPage() {
  const [data, setData] = useState<ProductStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [txnType, setTxnType] = useState<StockTxnType>("IN");
  const [quantity, setQuantity] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");

  async function loadData() {
    try {
      setLoading(true);
      // Backend still uses /pharmacy/stock for now, which returns products (drugs)
      const res = await apiClient.get<ProductStockItem[]>("/pharmacy/stock", {
        params: search.trim() ? { q: search.trim() } : undefined,
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء جلب مخزون الأدوية.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setSelectedId(null);
    setTxnType("IN");
    setQuantity("");
    setUnitCost("");
  }

  async function handleSubmit() {
    if (!selectedId) {
      toast.error("يرجى اختيار دواء/منتج.");
      return;
    }

    const q = Number(quantity);
    if (!quantity || isNaN(q)) {
      toast.error("يرجى إدخال كمية صحيحة.");
      return;
    }

    if (txnType === "IN" && q <= 0) {
      toast.error("كمية التوريد يجب أن تكون أكبر من الصفر.");
      return;
    }

    try {
      await apiClient.post("/pharmacy/stock/transactions", {
        // DTO Backend expects drugItemId (mapped to productId)
        drugItemId: selectedId,
        type: txnType,
        quantity: q,
        unitCost: unitCost ? Number(unitCost) : undefined,
      });

      toast.success("تم تسجيل حركة المخزون بنجاح.");
      resetForm();
      await loadData();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ?? "حدث خطأ أثناء تسجيل حركة المخزون.";
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            مخزون الصيدلية (المنتجات)
          </h1>
          <p className="text-sm text-gray-400">
            إدارة رصيد الأدوية والمستلزمات (توريد جديد أو تسوية الكميات).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="بحث باسم الدواء أو الكود..."
            className="px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-100 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                loadData();
              }
            }}
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm text-white disabled:opacity-60"
          >
            {loading ? "جارِ التحديث..." : "بحث / تحديث"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 space-y-4">
        <h2 className="font-semibold text-gray-100 text-lg">
          تسجيل حركة مخزون
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">المنتج</label>
            <select
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
              value={selectedId ?? ""}
              onChange={(e) =>
                setSelectedId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">اختر منتج...</option>
              {data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.strength ? ` (${d.strength})` : ""}{" "}
                  {d.code ? ` - [${d.code}]` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">
              نوع الحركة
            </label>
            <select
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
              value={txnType}
              onChange={(e) => setTxnType(e.target.value as StockTxnType)}
            >
              <option value="IN">توريد إلى المخزون (IN)</option>
              <option value="ADJUST">تسوية رصيد (ADJUST)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">الكمية</label>
            <input
              type="number"
              step="0.001"
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
              placeholder={txnType === "IN" ? "مثال: 50" : "مثال: 10 أو -5"}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">
              تكلفة / سعر الوحدة (اختياري)
            </label>
            <input
              type="number"
              step="0.001"
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
              placeholder="مثال: 5.250"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={resetForm}
            className="px-4 py-2 rounded border border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
          >
            تفريغ الحقول
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm text-white"
          >
            حفظ حركة المخزون
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">
            قائمة المنتجات (الأدوية) ورصيد المخزون
          </h2>
          <span className="text-sm text-gray-400">
            العدد: {data.length.toString()}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-900/60 border-b border-gray-800">
              <tr>
                <th className="px-4 py-2 text-right text-gray-400">المنتج</th>
                <th className="px-4 py-2 text-right text-gray-400">
                  الاسم العلمي
                </th>
                <th className="px-4 py-2 text-right text-gray-400">
                  القوة / الشكل
                </th>
                <th className="px-4 py-2 text-right text-gray-400">
                  سعر الوحدة (بيع)
                </th>
                <th className="px-4 py-2 text-right text-gray-400">
                  رصيد المخزون
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-gray-800/60 hover:bg-gray-800/40"
                >
                  <td className="px-4 py-2 text-right text-gray-200">
                    {d.name}
                    {d.code ? (
                      <span className="text-xs text-gray-400 ml-1">
                        [{d.code}]
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-300">
                    {d.genericName ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-300">
                    {d.strength ?? "-"} {d.form ?? ""}
                  </td>
                  <td className="px-4 py-2 text-right text-emerald-300">
                    {d.unitPrice.toFixed(3)}
                  </td>
                  <td className="px-4 py-2 text-right text-blue-300">
                    {d.stockOnHand.toFixed(3)}
                  </td>
                </tr>
              ))}

              {data.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    لا توجد منتجات مسجلة أو لا توجد نتائج مطابقة للبحث.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-gray-400"
                  >
                    جارِ تحميل البيانات...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
