import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/apiClient";
import PrintLayout from "@/components/print/PrintLayout";
import { formatDate } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface InventoryLine {
  id: number;
  product: { name: string; code: string };
  batchNumber: string | null;
  expiryDate: string | null;
  systemQty: number;
  physicalQty: number | null;
}

interface InventoryCount {
  id: number;
  date: string;
  status: string;
  type: string;
  warehouse: { name: string };
  assignedTo: { fullName: string } | null;
  notes: string | null;
  lines: InventoryLine[];
}

export default function InventoryCountPrintPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { id } = useParams();
  const [count, setCount] = useState<InventoryCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchCount = async () => {
    try {
      const res = await apiClient.get(`/inventory/counts/${id}`);
      setCount(res.data);
    } catch (err) {
      console.error(err);
      setError(t("inventory.count.print.loadFailed", "فشل تحميل بيانات الجرد"));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !count) {
    return (
      <div className="flex h-screen items-center justify-center text-rose-500 font-bold">
        {error || t("inventory.count.print.notFound", "الجرد غير موجود")}
      </div>
    );
  }

  const getSubTitle = (type: string) => {
    switch (type) {
      case 'FULL': return t('inventory.count.type.full', 'جرد شامل');
      case 'SPOT_CHECK': return t('inventory.count.type.spotCheck', 'جرد مفاجئ');
      default: return t('inventory.count.type.periodic', 'جرد دوري');
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "POSTED": return t("inventory.count.status.posted", "مرحل");
      case "DRAFT": return t("inventory.count.status.draft", "مسودة");
      case "REVIEW": return t("inventory.count.status.review", "مراجعة");
      case "IN_PROGRESS": return t("inventory.count.status.inProgress", "قيد التنفيذ");
      default: return status;
    }
  };

  return (
    <PrintLayout
      title={t("inventory.count.print.title", "قائمة جرد مخزني")}
      subtitle={getSubTitle(count.type)}
      documentId={count.id}
      footerNotes={count.notes || t("inventory.count.print.footerNotes", "يرجى تعبئة عمود الجرد الفعلي بدقة والتوقيع.")}
    >
      <div className="grid grid-cols-2 gap-8 mb-8 text-sm" dir={isRtl ? "rtl" : "ltr"}>
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
          <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">{t("inventory.count.print.countData", "بيانات الجرد")}</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">{t("inventory.count.print.dateLabel", "التاريخ:")}</span>
              <span className="font-bold text-slate-900">{formatDate(count.date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t("inventory.count.print.statusLabel", "الحالة:")}</span>
              <span className="font-medium">{getStatusLabel(count.status)}</span>
            </div>
             <div className="flex justify-between">
              <span className="text-slate-500">{t("inventory.count.print.createdByLabel", "تم الإنشاء بواسطة:")}</span>
              <span className="font-medium">{count.assignedTo?.fullName || '-'}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
           <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">{t("inventory.count.print.locationWarehouse", "الموقع / المستودع")}</div>
           <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">{t("inventory.count.print.warehouseLabel", "المخزن:")}</span>
              <span className="font-bold text-slate-900 text-lg">{count.warehouse.name}</span>
            </div>
           </div>
        </div>
      </div>

      <div className="mb-8" dir={isRtl ? "rtl" : "ltr"}>
        <table className={`w-full text-sm border-collapse ${isRtl ? "text-right" : "text-left"}`}>
          <thead>
            <tr className="border-b-2 border-slate-800">
              <th className="py-2 font-bold text-slate-900 w-12">#</th>
              <th className="py-2 font-bold text-slate-900">{t("inventory.count.print.itemCode", "كود الصنف")}</th>
              <th className="py-2 font-bold text-slate-900">{t("inventory.count.print.itemName", "اسم الصنف")}</th>
              <th className="py-2 font-bold text-slate-900">{t("inventory.count.print.batchExpiry", "التشغيلة / الصلاحية")}</th>
              <th className="py-2 text-center font-bold text-slate-900 w-24 bg-slate-100">{t("inventory.count.print.systemQty", "رصيد النظام")}</th>
              <th className="py-2 text-center font-bold text-slate-900 w-32 border-r border-slate-300 pr-4">{t("inventory.count.print.physicalQty", "العد الفعلي")}</th>
              <th className="py-2 font-bold text-slate-900 w-32">{t("inventory.count.print.notes", "ملاحظات")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {count.lines.map((line, idx) => (
              <tr key={line.id}>
                <td className="py-3 text-slate-500">{idx + 1}</td>
                <td className="py-3 font-mono text-slate-600 font-bold">{line.product.code}</td>
                <td className="py-3 font-medium text-slate-800">{line.product.name}</td>
                <td className="py-3 text-xs">
                    {line.batchNumber && (
                        <div className="flex flex-col">
                            <span className="font-mono text-slate-600">BN: {line.batchNumber}</span>
                            {line.expiryDate && <span className="text-slate-400">Exp: {formatDate(line.expiryDate)}</span>}
                        </div>
                    )}
                </td>
                <td className="py-3 text-center font-mono font-bold bg-slate-50">{line.systemQty}</td>
                <td className="py-3 border-r border-slate-300">
                    {/* Empty box for writing */}
                    <div className="h-8 border-b border-slate-300 border-dashed w-full"></div>
                </td>
                 <td className="py-3">
                    <div className="h-8 border-b border-slate-200 w-full"></div>
                 </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-8 mt-16 text-center text-sm font-bold text-slate-900" dir={isRtl ? "rtl" : "ltr"}>
          <div className="pt-8 border-t border-slate-300">
              {t("inventory.count.print.warehouseKeeperSignature", "توقيع أمين المستودع")}
          </div>
          <div className="pt-8 border-t border-slate-300">
              {t("inventory.count.print.inventoryCommitteeSignature", "توقيع لجنة الجرد")}
          </div>
          <div className="pt-8 border-t border-slate-300">
              {t("inventory.count.print.financialManagerSignature", "توقيع المدير المالي / الاعتماد")}
          </div>
      </div>

    </PrintLayout>
  );
}
