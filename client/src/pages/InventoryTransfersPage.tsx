// src/pages/InventoryTransfersPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type Warehouse = {
  id: number;
  name: string;
  code: string | null;
};

type ProductStockRow = {
  id: number; // ProductStock ID
  quantity: string; // Decimal from backend
  product: {
    id: number;
    code: string;
    name: string;
    // ✅ [FIX] قد تأتي string من الـ Backend بسبب Prisma Decimal
    sellPrice: number | string;
  };
};

type TransferItemRow = {
  productId: number | "";
  productName?: string;
  quantity: number;
  currentStock?: number; // للعرض فقط (الرصيد في المخزن المصدر)
};

export default function InventoryTransfersPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);

  // --- تبويبات ---
  const [activeTab, setActiveTab] = useState<"STOCK" | "TRANSFER">("STOCK");

  // --- حالة "عرض الأرصدة" ---
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">(
    ""
  );
  const [stockList, setStockList] = useState<ProductStockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  // --- حالة "التحويل" ---
  const [fromWhId, setFromWhId] = useState<number | "">("");
  const [toWhId, setToWhId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [transferLines, setTransferLines] = useState<TransferItemRow[]>([
    { productId: "", quantity: 1 },
  ]);
  const [sourceProducts, setSourceProducts] = useState<ProductStockRow[]>([]); // المنتجات المتاحة في المصدر

  // تحميل المخازن عند البدء
  useEffect(() => {
    async function loadWarehouses() {
      setLoading(true);
      try {
        const res = await apiClient.get<Warehouse[]>("/inventory/warehouses");
        setWarehouses(res.data);
        if (res.data.length > 0) {
          setSelectedWarehouseId(res.data[0].id);
        }
      } catch (err) {
        console.error(err);
        toast.error("فشل تحميل قائمة المخازن.");
      } finally {
        setLoading(false);
      }
    }
    loadWarehouses();
  }, []);

  // --- دوال تبويب الأرصدة ---
  useEffect(() => {
    if (activeTab === "STOCK" && selectedWarehouseId) {
      loadStock(Number(selectedWarehouseId));
    }
  }, [selectedWarehouseId, activeTab]);

  async function loadStock(whId: number) {
    setLoadingStock(true);
    try {
      const res = await apiClient.get<ProductStockRow[]>(
        `/inventory/warehouses/${whId}/stock`
      );
      setStockList(res.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل أرصدة المخزن.");
    } finally {
      setLoadingStock(false);
    }
  }

  // --- دوال تبويب التحويل ---
  // عند تغيير "من المخزن"، نحمل منتجاته لنعرضها في القائمة
  useEffect(() => {
    if (activeTab === "TRANSFER" && fromWhId) {
      // تفريغ الجدول القديم لتجنب الخطأ
      setTransferLines([{ productId: "", quantity: 1 }]);

      // جلب منتجات المصدر
      apiClient
        .get<ProductStockRow[]>(`/inventory/warehouses/${fromWhId}/stock`)
        .then((res) => {
          setSourceProducts(res.data);
        })
        .catch(() => toast.error("تعذر تحميل منتجات المخزن المصدر"));
    } else {
      setSourceProducts([]);
    }
  }, [fromWhId, activeTab]);

  const addLine = () => {
    setTransferLines([...transferLines, { productId: "", quantity: 1 }]);
  };

  const removeLine = (index: number) => {
    setTransferLines(transferLines.filter((_, i) => i !== index));
  };

  const updateLine = (
    index: number,
    field: keyof TransferItemRow,
    val: any
  ) => {
    setTransferLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;

        const updated = { ...line, [field]: val };

        // لو اخترنا منتج، نجلب رصيده الحالي للعرض
        if (field === "productId" && val) {
          const stockRow = sourceProducts.find(
            (s) => s.product.id === Number(val)
          );
          if (stockRow) {
            updated.productName = stockRow.product.name;
            updated.currentStock = Number(stockRow.quantity);
          }
        }
        return updated;
      })
    );
  };

  const handleTransfer = async () => {
    if (!fromWhId || !toWhId) {
      toast.warning("اختر المخزن المصدر والمستلم.");
      return;
    }
    if (fromWhId === toWhId) {
      toast.warning("لا يمكن التحويل لنفس المخزن.");
      return;
    }

    const validItems = transferLines.filter(
      (l) => l.productId && Number(l.quantity) > 0
    );
    if (validItems.length === 0) {
      toast.warning("أضف صنفاً واحداً على الأقل.");
      return;
    }

    // التحقق المبدئي من الرصيد
    for (const item of validItems) {
      if ((item.currentStock ?? 0) < item.quantity) {
        toast.error(
          `الكمية المطلوبة للصنف ${item.productName} أكبر من الرصيد المتاح (${item.currentStock})`
        );
        return;
      }
    }

    if (!window.confirm("هل أنت متأكد من إتمام عملية التحويل؟")) return;

    try {
      await apiClient.post("/inventory/transfer", {
        fromWarehouseId: Number(fromWhId),
        toWarehouseId: Number(toWhId),
        notes,
        items: validItems.map((l) => ({
          productId: Number(l.productId),
          quantity: Number(l.quantity),
        })),
      });

      toast.success("تم التحويل المخزني بنجاح.");
      // إعادة تعيين
      setTransferLines([{ productId: "", quantity: 1 }]);
      setNotes("");
      // تحديث قائمة المصدر
      if (fromWhId) {
        const res = await apiClient.get<ProductStockRow[]>(
          `/inventory/warehouses/${fromWhId}/stock`
        );
        setSourceProducts(res.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || "فشل عملية التحويل.");
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">إدارة المخازن والتحويلات</h1>
          <p className="text-sm text-slate-400">
            مراقبة أرصدة المخازن المختلفة وإجراء مناقلات داخلية للأدوية
            والمستلزمات.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab("STOCK")}
          className={`px-4 py-2 text-sm rounded-t-xl transition ${
            activeTab === "STOCK"
              ? "bg-slate-800 text-sky-300 border-t border-x border-slate-700 font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          جرد المخازن (الأرصدة)
        </button>
        <button
          onClick={() => setActiveTab("TRANSFER")}
          className={`px-4 py-2 text-sm rounded-t-xl transition ${
            activeTab === "TRANSFER"
              ? "bg-slate-800 text-sky-300 border-t border-x border-slate-700 font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          تحويل مخزني (نقل بضاعة)
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-b-xl rounded-tr-xl p-6">
        {/* ===================== TAB 1: STOCK BALANCE ===================== */}
        {activeTab === "STOCK" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-300">عرض رصيد مخزن:</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {loadingStock ? (
              <div className="text-center text-slate-500 py-10">
                جارِ تحميل الأرصدة...
              </div>
            ) : stockList.length === 0 ? (
              <div className="text-center text-slate-500 py-10">
                هذا المخزن فارغ حالياً.
              </div>
            ) : (
              <div className="overflow-auto border border-slate-800 rounded-xl">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-950 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">كود المنتج</th>
                      <th className="px-4 py-3">اسم المنتج</th>
                      <th className="px-4 py-3">الرصيد الحالي</th>
                      <th className="px-4 py-3">سعر البيع</th>
                      <th className="px-4 py-3">القيمة التقديرية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockList.map((row) => {
                      // ✅ [FIX] تحويل السعر والكمية إلى أرقام لتجنب الخطأ
                      const sellPrice = Number(row.product.sellPrice ?? 0);
                      const quantity = Number(row.quantity ?? 0);
                      const totalValue = quantity * sellPrice;

                      return (
                        <tr
                          key={row.id}
                          className="border-t border-slate-800 hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-2 font-mono text-emerald-300">
                            {row.product.code}
                          </td>
                          <td className="px-4 py-2 font-semibold">
                            {row.product.name}
                          </td>
                          <td className="px-4 py-2 text-sky-300 font-bold">
                            {quantity.toFixed(3)}
                          </td>
                          <td className="px-4 py-2 text-slate-400">
                            {sellPrice.toFixed(3)}
                          </td>
                          <td className="px-4 py-2 text-slate-400">
                            {totalValue.toFixed(3)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 2: TRANSFER ===================== */}
        {activeTab === "TRANSFER" && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="grid grid-cols-2 gap-6 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-rose-300">
                  من المخزن (المصدر)
                </label>
                <select
                  value={fromWhId}
                  onChange={(e) => setFromWhId(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none"
                >
                  <option value="">-- اختر المصدر --</option>
                  {warehouses.map((w) => (
                    <option
                      key={w.id}
                      value={w.id}
                      disabled={w.id === Number(toWhId)}
                    >
                      {w.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  سيتم خصم الكميات من هذا المخزن.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-emerald-300">
                  إلى المخزن (المستلم)
                </label>
                <select
                  value={toWhId}
                  onChange={(e) => setToWhId(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="">-- اختر المستلم --</option>
                  {warehouses.map((w) => (
                    <option
                      key={w.id}
                      value={w.id}
                      disabled={w.id === Number(fromWhId)}
                    >
                      {w.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  سيتم إضافة الكميات إلى هذا المخزن.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-semibold mb-3">
                الأصناف المراد نقلها
              </h3>

              {!fromWhId ? (
                <div className="text-center text-slate-500 py-4 text-xs">
                  يرجى اختيار المخزن المصدر أولاً لعرض المنتجات المتاحة.
                </div>
              ) : (
                <table className="w-full text-sm text-right">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-800">
                      <th className="pb-2 w-1/2">المنتج</th>
                      <th className="pb-2">الرصيد المتاح</th>
                      <th className="pb-2 w-24">الكمية للنقل</th>
                      <th className="pb-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="space-y-2">
                    {transferLines.map((line, idx) => (
                      <tr key={idx} className="group">
                        <td className="py-2 pl-2">
                          <select
                            value={line.productId}
                            onChange={(e) =>
                              updateLine(idx, "productId", e.target.value)
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                          >
                            <option value="">-- اختر منتجاً --</option>
                            {sourceProducts.map((sp) => (
                              <option key={sp.product.id} value={sp.product.id}>
                                {sp.product.name} ({sp.product.code})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 text-sky-400 font-mono text-xs">
                          {line.productId ? line.currentStock?.toFixed(3) : "-"}
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min={0.001}
                            step={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(idx, "quantity", e.target.value)
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-xs"
                          />
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => removeLine(idx)}
                            className="text-rose-500 hover:bg-rose-900/20 p-1 rounded"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button
                onClick={addLine}
                disabled={!fromWhId}
                className="mt-3 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
              >
                + إضافة سطر
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-300">ملاحظات التحويل</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: طلبية تغذية للصيدلية رقم 5..."
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleTransfer}
                disabled={!fromWhId || !toWhId}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                تأكيد وتنفيذ التحويل
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
