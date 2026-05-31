// src/pages/PharmacyStockReportPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { useTranslation } from "react-i18next";

type StockTxnType = "IN" | "OUT" | "ADJUST";
type StockTxnFilterType = "ALL" | StockTxnType;

type ProductOption = {
  id: number;
  name: string;
  code: string | null;
  strength: string | null;
  form: string | null;
};

type StockTxnRow = {
  id: number;
  createdAt: string;
  type: StockTxnType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  drug: {
    id: number;
    code: string | null;
    name: string;
    strength: string | null;
    form: string | null;
  };
  createdBy: {
    id: number;
    fullName: string;
  };
  dispenseRecordId: number | null;
};

function formatDateTime(dt: string, isRtl: boolean) {
  const d = new Date(dt);
  return d.toLocaleString(isRtl ? "ar-LY" : "en-US");
}

export default function PharmacyStockReportPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [txns, setTxns] = useState<StockTxnRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [searchProduct, setSearchProduct] = useState("");

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null
  );
  const [typeFilter, setTypeFilter] = useState<StockTxnFilterType>("ALL");

  async function loadProducts() {
    try {
      const res = await apiClient.get<
        {
          id: number;
          code: string | null;
          name: string;
          strength: string | null;
          form: string | null;
        }[]
      >("/pharmacy/stock", {
        params: searchProduct.trim() ? { q: searchProduct.trim() } : undefined,
      });

      const options: ProductOption[] = res.data.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        strength: d.strength,
        form: d.form,
      }));

      setProducts(options);
    } catch (err) {
      console.error(err);
      toast.error(t("inventory.pharmacyStockReport.toast.productsLoadError", "حدث خطأ أثناء جلب قائمة المنتجات."));
    }
  }

  async function loadReport() {
    try {
      setLoading(true);

      const params: any = {};
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      if (selectedProductId) params.drugItemId = selectedProductId;
      if (typeFilter !== "ALL") params.type = typeFilter;

      const res = await apiClient.get<StockTxnRow[]>(
        "/pharmacy/stock/transactions",
        { params }
      );

      setTxns(res.data);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ??
        t("inventory.pharmacyStockReport.toast.reportLoadError", "حدث خطأ أثناء جلب تقرير حركات المخزون.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const d2 = new Date();
    d2.setDate(d2.getDate() - 2);
    const isoFrom = d2.toISOString().slice(0, 10);
    setFromDate(isoFrom);
    setToDate(isoToday);

    loadProducts();
    setTimeout(() => {
      loadReport();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    let totalInQty = 0;
    let totalOutQty = 0;
    let totalAdjustQty = 0;
    let totalCostIn = 0;
    let totalCostOut = 0;

    for (const t of txns) {
      if (t.type === "IN") {
        totalInQty += t.quantity;
        totalCostIn += t.totalCost;
      } else if (t.type === "OUT") {
        totalOutQty += t.quantity;
        totalCostOut += t.totalCost;
      } else if (t.type === "ADJUST") {
        totalAdjustQty += t.quantity;
      }
    }

    const netQty = totalInQty + totalAdjustQty + totalOutQty;

    return {
      totalInQty,
      totalOutQty,
      totalAdjustQty,
      totalCostIn,
      totalCostOut,
      netQty,
    };
  }, [txns]);

  return (
    <div className="p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t("inventory.pharmacyStockReport.title", "تقرير حركات مخزون الصيدلية")}
          </h1>
          <p className="text-sm text-gray-400">
            {t("inventory.pharmacyStockReport.subtitle", "عرض وتحليل حركات توريد وصرف المنتجات الدوائية.")}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 space-y-4">
        <h2 className="font-semibold text-gray-100 text-lg">{t("inventory.pharmacyStockReport.filters.title", "الفلاتر")}</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">{t("inventory.pharmacyStockReport.filters.from", "من تاريخ")}</label>
            <DatePicker
              date={fromDate ? new Date(fromDate) : undefined}
              onChange={(d) => setFromDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-gray-950 border-gray-700 h-9 text-sm text-gray-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">
              {t("inventory.pharmacyStockReport.filters.to", "إلى تاريخ")}
            </label>
            <DatePicker
              date={toDate ? new Date(toDate) : undefined}
              onChange={(d) => setToDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-gray-950 border-gray-700 h-9 text-sm text-gray-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">
              {t("inventory.pharmacyStockReport.filters.type", "نوع الحركة")}
            </label>
            <select
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as StockTxnFilterType)
              }
            >
              <option value="ALL">{t("inventory.pharmacyStockReport.filters.typeAll", "الكل")}</option>
              <option value="IN">{t("inventory.pharmacyStockReport.filters.typeIn", "توريد (IN)")}</option>
              <option value="OUT">{t("inventory.pharmacyStockReport.filters.typeOut", "صرف (OUT)")}</option>
              <option value="ADJUST">{t("inventory.pharmacyStockReport.filters.typeAdjust", "تسوية (ADJUST)")}</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-400 mb-1">
              {t("inventory.pharmacyStockReport.filters.product", "منتج محدد (اختياري)")}
            </label>
            <select
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100"
              value={selectedProductId ?? ""}
              onChange={(e) =>
                setSelectedProductId(
                  e.target.value ? Number(e.target.value) : null
                )
              }
            >
              <option value="">{t("inventory.pharmacyStockReport.filters.allProducts", "كل المنتجات")}</option>
              {products.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.strength ? ` (${d.strength})` : ""}{" "}
                  {d.code ? ` - [${d.code}]` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1 md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">
              {t("inventory.pharmacyStockReport.filters.searchProduct", "بحث في المنتجات (لتصفية القائمة)")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className={`flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm text-gray-100 ${isRtl ? 'text-right' : 'text-left'}`}
                placeholder={t("inventory.pharmacyStockReport.filters.searchProductPlaceholder", "اكتب جزء من اسم المنتج...")}
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    loadProducts();
                  }
                }}
              />
              <button
                onClick={loadProducts}
                className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-100 font-bold"
              >
                {t("inventory.pharmacyStockReport.filters.updateProductList", "تحديث القائمة")}
              </button>
            </div>
          </div>

          <div className="flex items-end justify-end gap-3">
            <button
              onClick={loadReport}
              disabled={loading}
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm text-white disabled:opacity-60 font-bold"
            >
              {loading ? t("inventory.pharmacyStockReport.filters.loadingReport", "جارِ تحميل التقرير...") : t("inventory.pharmacyStockReport.filters.showReport", "عرض التقرير")}
            </button>
          </div>
        </div>
      </div>

      {/* ملخص */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs md:text-sm">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <h3 className="text-xs text-gray-400 mb-2">{t("inventory.pharmacyStockReport.summary.inTitle", "توريد (IN)")}</h3>
          <div className="text-lg font-semibold text-emerald-300 font-mono">
            {t("inventory.pharmacyStockReport.summary.qtyTotal", "إجمالي الكمية: ")}{summary.totalInQty.toFixed(3)}
          </div>
          <div className="text-sm text-gray-300 font-mono">
            {t("inventory.pharmacyStockReport.summary.costTotal", "إجمالي التكلفة: ")}{summary.totalCostIn.toFixed(3)}
          </div>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <h3 className="text-xs text-gray-400 mb-2">{t("inventory.pharmacyStockReport.summary.outTitle", "صرف (OUT)")}</h3>
          <div className="text-lg font-semibold text-rose-300 font-mono">
            {t("inventory.pharmacyStockReport.summary.qtyTotal", "إجمالي الكمية: ")}{summary.totalOutQty.toFixed(3)}
          </div>
          <div className="text-sm text-gray-300 font-mono">
            {t("inventory.pharmacyStockReport.summary.costTotal", "إجمالي التكلفة: ")}{summary.totalCostOut.toFixed(3)}
          </div>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <h3 className="text-xs text-gray-400 mb-2">{t("inventory.pharmacyStockReport.summary.adjustTitle", "تسويات (ADJUST)")}</h3>
          <div className="text-lg font-semibold text-blue-300 font-mono">
            {t("inventory.pharmacyStockReport.summary.adjustNet", "صافي كمية التسويات: ")}{summary.totalAdjustQty.toFixed(3)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">{t("inventory.pharmacyStockReport.tableTitle", "حركات مخزون الصيدلية")}</h2>
          <span className="text-sm text-gray-400">
            {t("inventory.pharmacyStockReport.tableCount", "عدد الحركات: ")}{txns.length.toString()}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className={`min-w-full text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
            <thead className="bg-gray-900/60 border-b border-gray-800">
              <tr>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.dateTime", "التاريخ / الوقت")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.type", "نوع")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.product", "المنتج")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.qty", "الكمية")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.costUnit", "تكلفة الوحدة")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.costTotal", "إجمالي التكلفة")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.createdBy", "تم بواسطة")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStockReport.table.source", "المصدر")}</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((tRow) => {
                let typeLabel = "";
                let typeClass = "";
                if (tRow.type === "IN") {
                  typeLabel = t("inventory.pharmacyStockReport.types.in", "توريد (IN)");
                  typeClass = "text-emerald-300";
                } else if (tRow.type === "OUT") {
                  typeLabel = t("inventory.pharmacyStockReport.types.out", "صرف (OUT)");
                  typeClass = "text-rose-300";
                } else {
                  typeLabel = t("inventory.pharmacyStockReport.types.adjust", "تسوية (ADJUST)");
                  typeClass = "text-blue-300";
                }

                return (
                  <tr
                    key={tRow.id}
                    className="border-b border-gray-800/60 hover:bg-gray-800/40"
                  >
                    <td className="px-4 py-2 text-gray-200">
                      {formatDateTime(tRow.createdAt, isRtl)}
                    </td>
                    <td
                      className={`px-4 py-2 font-semibold ${typeClass}`}
                    >
                      {typeLabel}
                    </td>
                    <td className="px-4 py-2 text-gray-200">
                      {tRow.drug.name}
                      {tRow.drug.strength ? ` (${tRow.drug.strength})` : ""}{" "}
                      {tRow.drug.code ? (
                        <span className="text-xs text-gray-400 ml-1">
                          [{tRow.drug.code}]
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-gray-200 font-mono">
                      {tRow.quantity.toFixed(3)}
                    </td>
                    <td className="px-4 py-2 text-gray-200 font-mono">
                      {tRow.unitCost.toFixed(3)}
                    </td>
                    <td className="px-4 py-2 text-gray-100 font-mono">
                      {tRow.totalCost.toFixed(3)}
                    </td>
                    <td className="px-4 py-2 text-gray-300">
                      {tRow.createdBy.fullName}
                    </td>
                    <td className="px-4 py-2 text-gray-300">
                      {tRow.dispenseRecordId ? t("inventory.pharmacyStockReport.table.sourceDispense", "وصفة طبية") : t("inventory.pharmacyStockReport.table.sourceManual", "حركة يدوية")}
                    </td>
                  </tr>
                );
              })}

              {txns.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    {t("inventory.pharmacyStockReport.table.empty", "لا توجد حركات مخزون ضمن نطاق الفلاتر المحدد.")}
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-gray-400"
                  >
                    {t("inventory.pharmacyStockReport.table.loading", "جارِ تحميل التقرير...")}
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
