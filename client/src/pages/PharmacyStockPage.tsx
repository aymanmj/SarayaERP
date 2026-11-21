import { PharmacyAdjustmentForm } from '../components/pharmacy/PharmacyAdjustmentForm';
import { PharmacySourcePolicy } from '../components/pharmacy/PharmacySourcePolicy';
import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type ProductStockItem = {
  id: number;
  code: string | null;
  name: string;
  genericName: string | null;
  strength: string | null;
  form: string | null;
  unitPrice: number;
  stockOnHand: number;
};



export default function PharmacyStockPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [data, setData] = useState<ProductStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  async function loadData() {
    try {
      setLoading(true);
      const res = await apiClient.get<ProductStockItem[]>("/pharmacy/stock", {
        params: search.trim() ? { q: search.trim() } : undefined,
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error(t("inventory.pharmacyStock.toast.loadError", "حدث خطأ أثناء جلب مخزون الأدوية."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <PharmacySourcePolicy />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t("inventory.pharmacyStock.title", "مخزون الصيدلية (المنتجات)")}
          </h1>
          <p className="text-sm text-gray-400">
            {t("inventory.pharmacyStock.subtitle", "إدارة رصيد الأدوية والمستلزمات (توريد جديد أو تسوية الكميات).")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={t("inventory.pharmacyStock.searchPlaceholder", "بحث باسم الدواء أو الكود...")}
            className={`px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-100 w-64 ${isRtl ? 'text-right' : 'text-left'}`}
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
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm text-white disabled:opacity-60 font-bold"
          >
            {loading ? t("inventory.pharmacyStock.btn.searching", "جارِ التحديث...") : t("inventory.pharmacyStock.btn.search", "بحث / تحديث")}
          </button>
        </div>
      </div>

      <PharmacyAdjustmentForm products={data} onPosted={loadData} />

      <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">
            {t("inventory.pharmacyStock.tableTitle", "قائمة المنتجات (الأدوية) ورصيد المخزون")}
          </h2>
          <span className="text-sm text-gray-400">
            {t("inventory.pharmacyStock.tableCount", "العدد: ")}{data.length.toString()}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className={`min-w-full text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
            <thead className="bg-gray-900/60 border-b border-gray-800">
              <tr>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStock.table.product", "المنتج")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStock.table.generic", "الاسم العلمي")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStock.table.strengthForm", "القوة / الشكل")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStock.table.price", "سعر الوحدة (بيع)")}</th>
                <th className={`px-4 py-2 text-gray-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t("inventory.pharmacyStock.table.stock", "رصيد المخزون")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-gray-800/60 hover:bg-gray-800/40"
                >
                  <td className="px-4 py-2 text-gray-200">
                    {d.name}
                    {d.code ? (
                      <span className="text-xs text-gray-400 ml-1">
                        [{d.code}]
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-gray-300">
                    {d.genericName ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-gray-300">
                    {d.strength ?? "-"} {d.form ?? ""}
                  </td>
                  <td className="px-4 py-2 text-emerald-300 font-mono">
                    {d.unitPrice.toFixed(3)}
                  </td>
                  <td className="px-4 py-2 text-blue-300 font-mono">
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
                    {t("inventory.pharmacyStock.table.empty", "لا توجد منتجات مسجلة أو لا توجد نتائج مطابقة للبحث.")}
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-gray-400"
                  >
                    {t("inventory.pharmacyStock.table.loading", "جارِ تحميل البيانات...")}
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
