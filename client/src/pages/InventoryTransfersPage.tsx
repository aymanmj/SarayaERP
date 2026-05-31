import { useTranslation } from "react-i18next";
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
    sellPrice: number | string;
  };
};

type TransferItemRow = {
  productId: number | "";
  productName?: string;
  quantity: number;
  currentStock?: number;
};

export default function InventoryTransfersPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

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
  const [sourceProducts, setSourceProducts] = useState<ProductStockRow[]>([]);

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
        toast.error(t("inventory.transfers.toast.loadWhError", "فشل تحميل قائمة المخازن."));
      } finally {
        setLoading(false);
      }
    }
    loadWarehouses();
  }, [t]);

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
      toast.error(t("inventory.transfers.toast.loadStockError", "فشل تحميل أرصدة المخزن."));
    } finally {
      setLoadingStock(false);
    }
  }

  useEffect(() => {
    if (activeTab === "TRANSFER" && fromWhId) {
      setTransferLines([{ productId: "", quantity: 1 }]);
      apiClient
        .get<ProductStockRow[]>(`/inventory/warehouses/${fromWhId}/stock`)
        .then((res) => {
          setSourceProducts(res.data);
        })
        .catch(() => toast.error(t("inventory.transfers.toast.loadSourceError", "تعذر تحميل منتجات المخزن المصدر")));
    } else {
      setSourceProducts([]);
    }
  }, [fromWhId, activeTab, t]);

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
      toast.warning(t("inventory.transfers.toast.selectWhWarning", "اختر المخزن المصدر والمستلم."));
      return;
    }
    if (fromWhId === toWhId) {
      toast.warning(t("inventory.transfers.toast.sameWhWarning", "لا يمكن التحويل لنفس المخزن."));
      return;
    }

    const validItems = transferLines.filter(
      (l) => l.productId && Number(l.quantity) > 0
    );
    if (validItems.length === 0) {
      toast.warning(t("inventory.transfers.toast.oneItemWarning", "أضف صنفاً واحداً على الأقل."));
      return;
    }

    for (const item of validItems) {
      if ((item.currentStock ?? 0) < item.quantity) {
        toast.error(
          t("inventory.transfers.toast.insufficientStock", "الكمية المطلوبة للصنف {{name}} أكبر من الرصيد المتاح ({{qty}})", {
            name: item.productName,
            qty: item.currentStock
          })
        );
        return;
      }
    }

    if (!window.confirm(t("inventory.transfers.toast.confirm", "هل أنت متأكد من إتمام عملية التحويل؟"))) return;

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

      toast.success(t("inventory.transfers.toast.success", "تم التحويل المخزني بنجاح."));
      setTransferLines([{ productId: "", quantity: 1 }]);
      setNotes("");
      if (fromWhId) {
        const res = await apiClient.get<ProductStockRow[]>(
          `/inventory/warehouses/${fromWhId}/stock`
        );
        setSourceProducts(res.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || t("inventory.transfers.toast.error", "فشل عملية التحويل."));
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("inventory.transfers.title", "إدارة المخازن والتحويلات")}</h1>
          <p className="text-sm text-slate-400">
            {t("inventory.transfers.subtitle", "مراقبة أرصدة المخازن المختلفة وإجراء مناقلات داخلية للأدوية والمستلزمات.")}
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
          {t("inventory.transfers.tabStock", "جرد المخازن (الأرصدة)")}
        </button>
        <button
          onClick={() => setActiveTab("TRANSFER")}
          className={`px-4 py-2 text-sm rounded-t-xl transition ${
            activeTab === "TRANSFER"
              ? "bg-slate-800 text-sky-300 border-t border-x border-slate-700 font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {t("inventory.transfers.tabTransfer", "تحويل مخزني (نقل بضاعة)")}
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-b-xl rounded-tr-xl p-6">
        {/* ===================== TAB 1: STOCK BALANCE ===================== */}
        {activeTab === "STOCK" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-300">{t("inventory.transfers.viewStock", "عرض رصيد مخزن:")}</label>
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
                {t("inventory.transfers.loadingStock", "جارِ تحميل الأرصدة...")}
              </div>
            ) : stockList.length === 0 ? (
              <div className="text-center text-slate-500 py-10">
                {t("inventory.transfers.emptyStock", "هذا المخزن فارغ حالياً.")}
              </div>
            ) : (
              <div className="overflow-auto border border-slate-800 rounded-xl">
                <table className={`w-full text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                  <thead className="bg-slate-950 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">{t("inventory.transfers.table.code", "كود المنتج")}</th>
                      <th className="px-4 py-3">{t("inventory.transfers.table.name", "اسم المنتج")}</th>
                      <th className="px-4 py-3">{t("inventory.transfers.table.qty", "الرصيد الحالي")}</th>
                      <th className="px-4 py-3">{t("inventory.transfers.table.price", "سعر البيع")}</th>
                      <th className="px-4 py-3">{t("inventory.transfers.table.total", "القيمة التقديرية")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockList.map((row) => {
                      const sellPrice = Number(row.product.sellPrice ?? 0);
                      const quantity = Number(row.quantity ?? 0);
                      const totalValue = quantity * sellPrice;

                      return (
                        <tr
                          key={row.id}
                          className="border-t border-slate-800 hover:bg-slate-800/40"
                        >
                          <td className={`px-4 py-2 font-mono text-emerald-300 ${isRtl ? 'text-right' : 'text-left'}`}>
                            {row.product.code}
                          </td>
                          <td className={`px-4 py-2 font-semibold ${isRtl ? 'text-right' : 'text-left'}`}>
                            {row.product.name}
                          </td>
                          <td className={`px-4 py-2 text-sky-300 font-bold font-mono ${isRtl ? 'text-right' : 'text-left'}`}>
                            {quantity.toFixed(3)}
                          </td>
                          <td className={`px-4 py-2 text-slate-400 font-mono ${isRtl ? 'text-right' : 'text-left'}`}>
                            {sellPrice.toFixed(3)}
                          </td>
                          <td className={`px-4 py-2 text-slate-400 font-mono ${isRtl ? 'text-right' : 'text-left'}`}>
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
                  {t("inventory.transfers.form.from", "من المخزن (المصدر)")}
                </label>
                <select
                  value={fromWhId}
                  onChange={(e) => setFromWhId(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none"
                >
                  <option value="">{t("inventory.transfers.form.fromPlaceholder", "-- اختر المصدر --")}</option>
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
                  {t("inventory.transfers.form.fromHelp", "سيتم خصم الكميات من هذا المخزن.")}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-emerald-300">
                  {t("inventory.transfers.form.to", "إلى المخزن (المستلم)")}
                </label>
                <select
                  value={toWhId}
                  onChange={(e) => setToWhId(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="">{t("inventory.transfers.form.toPlaceholder", "-- اختر المستلم --")}</option>
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
                  {t("inventory.transfers.form.toHelp", "سيتم إضافة الكميات إلى هذا المخزن.")}
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-semibold mb-3">
                {t("inventory.transfers.form.itemsTitle", "الأصناف المراد نقلها")}
              </h3>

              {!fromWhId ? (
                <div className="text-center text-slate-500 py-4 text-xs">
                  {t("inventory.transfers.form.selectFromWhFirst", "يرجى اختيار المخزن المصدر أولاً لعرض المنتجات المتاحة.")}
                </div>
              ) : (
                <table className={`w-full text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-800">
                      <th className="pb-2 w-1/2">{t("inventory.transfers.form.table.product", "المنتج")}</th>
                      <th className="pb-2">{t("inventory.transfers.form.table.available", "الرصيد المتاح")}</th>
                      <th className="pb-2 w-24 text-center">{t("inventory.transfers.form.table.qty", "الكمية للنقل")}</th>
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
                            <option value="">{t("inventory.transfers.form.table.selectProduct", "-- اختر منتجاً --")}</option>
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
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => removeLine(idx)}
                            className="text-rose-500 hover:bg-rose-900/20 p-1 rounded font-bold"
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
                className="mt-3 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50 font-bold"
              >
                {t("inventory.transfers.form.addBtn", "+ إضافة سطر")}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-300">{t("inventory.transfers.form.notes", "ملاحظات التحويل")}</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("inventory.transfers.form.notesPlaceholder", "مثال: طلبية تغذية للصيدلية رقم 5...")}
                className={`bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 ${isRtl ? 'text-right' : 'text-left'}`}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleTransfer}
                disabled={!fromWhId || !toWhId}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("inventory.transfers.form.confirmBtn", "تأكيد وتنفيذ التحويل")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
