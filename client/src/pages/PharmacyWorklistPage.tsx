// src/pages/PharmacyWorklistPage.tsx

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

// Enums & Types
type PrescriptionStatus =
  | "DRAFT"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "PARTIALLY_COMPLETED";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER";
type EncounterType = "OPD" | "ER" | "IPD"; // أنواع الحالات

type ProductItemLite = {
  id: number;
  code: string | null;
  name: string;
  genericName: string | null;
  strength: string | null;
  form: string | null;
  unitPrice: number;
  stockOnHand: number;
};

type PrescriptionItemLite = {
  id: number;
  dose: string;
  route: string;
  frequency: string;
  durationDays: number;
  quantity: number;
  notes: string | null;
  drugItem: ProductItemLite | null;
};

type WorklistPrescription = {
  id: number;
  status: PrescriptionStatus;
  createdAt: string;
  encounterId: number | null;
  encounter?: { type: EncounterType }; // ✅ نحتاج نوع الحالة لتمييز المنطق
  patient: { id: number; fullName: string; mrn: string };
  doctor: { id: number; fullName: string };
  items: PrescriptionItemLite[];
};

function formatDateTime(value: string) {
  const d = new Date(value);
  return d.toLocaleString("ar-LY");
}

function formatMoney(value: number) {
  return `LYD ${value.toFixed(3)}`;
}

export default function PharmacyWorklistPage() {
  const [data, setData] = useState<WorklistPrescription[]>([]);
  const [loading, setLoading] = useState(false);

  // Catalog Data
  const [catalog, setCatalog] = useState<ProductItemLite[]>([]);

  // Selection & Modal State
  const [selectedPrescription, setSelectedPrescription] =
    useState<WorklistPrescription | null>(null);
  const [showDispenseModal, setShowDispenseModal] = useState(false);

  // Dispense Form State
  const [qtyMap, setQtyMap] = useState<Record<number, number>>({});
  const [subMap, setSubMap] = useState<Record<number, number>>({}); // OriginalItemId -> SelectedProductId
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [processing, setProcessing] = useState(false);

  // Load Data
  async function loadData() {
    try {
      setLoading(true);
      const res =
        await apiClient.get<WorklistPrescription[]>("/pharmacy/worklist");
      setData(res.data);
    } catch (err) {
      toast.error("فشل تحميل القائمة.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    try {
      const res = await apiClient.get<ProductItemLite[]>("/pharmacy/stock");
      setCatalog(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadData();
    loadCatalog();
  }, []);

  // فتح المودال وتجهيز القيم
  const openDispenseModal = (p: WorklistPrescription) => {
    const initialQty: Record<number, number> = {};
    const initialSub: Record<number, number> = {};

    p.items.forEach((it) => {
      initialQty[it.id] = it.quantity;
      if (it.drugItem) initialSub[it.id] = it.drugItem.id;
    });

    setQtyMap(initialQty);
    setSubMap(initialSub);
    setSelectedPrescription(p);

    // تصفير خيارات الدفع
    setPaymentMethod("CASH");
    setAmountPaid(""); // سيتم تعبئتها تلقائياً بالإجمالي لاحقاً

    setShowDispenseModal(true);
  };

  // حساب الإجمالي الحي
  const currentTotal = useMemo(() => {
    if (!selectedPrescription) return 0;
    return selectedPrescription.items.reduce((sum, it) => {
      const qty = qtyMap[it.id] ?? 0;
      const productId = subMap[it.id];
      const product = catalog.find((p) => p.id === productId);
      const price = product ? product.unitPrice : (it.drugItem?.unitPrice ?? 0);
      return sum + qty * price;
    }, 0);
  }, [selectedPrescription, qtyMap, subMap, catalog]);

  // تحديث المبلغ المدفوع تلقائياً عند تغير الإجمالي (للراحة)
  useEffect(() => {
    if (showDispenseModal && currentTotal > 0) {
      setAmountPaid(currentTotal.toFixed(3));
    }
  }, [currentTotal, showDispenseModal]);

  // تنفيذ العملية (المنطق الذكي)
  const handleDispenseAction = async () => {
    if (!selectedPrescription) return;

    // تحديد نوع الحالة
    const isInpatient = selectedPrescription.encounter?.type === "IPD";

    setProcessing(true);
    try {
      const pId = selectedPrescription.id;

      // تجهيز البنود
      const itemsPayload = selectedPrescription.items
        .map((it) => ({
          prescriptionItemId: it.id,
          quantity: qtyMap[it.id] ?? 0,
          dispensedDrugItemId: subMap[it.id],
        }))
        .filter((x) => x.quantity > 0);

      if (isInpatient) {
        // ✅ سيناريو الإيواء: صرف فقط (إضافة للفاتورة المفتوحة)
        await apiClient.post(`/pharmacy/prescriptions/${pId}/dispense`, {
          items: itemsPayload,
          notes: "صرف للعنبر (IPD Dispense)",
        });
        toast.success("تم صرف الأدوية وإرسالها للعنبر.");
      } else {
        // ✅ سيناريو الخارجي: صرف + دفع فوري
        await apiClient.post(`/pharmacy/prescriptions/${pId}/dispense-pay`, {
          paymentMethod,
          amountPaid: Number(amountPaid),
          items: itemsPayload,
          notes: "صرف مباشر (POS)",
        });
        toast.success("تم الصرف والدفع بنجاح.");
      }

      setShowDispenseModal(false);
      setSelectedPrescription(null);

      // تحديث القائمة
      setData((prev) => prev.filter((x) => x.id !== pId));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || "فشل العملية.");
    } finally {
      setProcessing(false);
    }
  };

  // Helper to determine mode text
  const isIPD = selectedPrescription?.encounter?.type === "IPD";

  return (
    <div
      className="p-6 space-y-6 text-slate-100 h-full flex flex-col"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">صرف الوصفات (الصيدلية)</h1>
          <p className="text-sm text-slate-400">قائمة الوصفات المعلقة للصرف.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
          >
            تحديث
          </button>
          <a
            href="/pharmacy/stock"
            target="_blank"
            className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-sm text-white"
          >
            المخزون
          </a>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">رقم الوصفة</th>
              <th className="px-4 py-3">نوع المريض</th>
              <th className="px-4 py-3">المريض</th>
              <th className="px-4 py-3">الطبيب</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">عدد الأصناف</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => {
              const isIPD = p.encounter?.type === "IPD";
              return (
                <tr
                  key={p.id}
                  className="border-b border-slate-800/60 hover:bg-slate-800/40 align-top"
                >
                  <td className="px-4 py-3 font-mono text-sky-400">#{p.id}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        isIPD
                          ? "bg-purple-900/40 text-purple-300 border border-purple-500/30"
                          : "bg-emerald-900/40 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {isIPD ? "إيواء (منوم)" : "خارجي / طوارئ"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {p.patient.fullName}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      ({p.patient.mrn})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {p.doctor.fullName}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {formatDateTime(p.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{p.items.length}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDispenseModal(p)}
                      className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-lg"
                    >
                      عرض وصرف
                    </button>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  لا توجد وصفات في الانتظار.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dispense Modal */}
      {showDispenseModal && selectedPrescription && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  صرف الوصفة #{selectedPrescription.id}
                  {isIPD && (
                    <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full">
                      مريض إيواء
                    </span>
                  )}
                </h3>
                <div className="text-xs text-slate-400">
                  المريض: {selectedPrescription.patient.fullName}
                </div>
              </div>
              <button
                onClick={() => setShowDispenseModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2 border border-slate-800 w-1/3">
                      الدواء الموصوف
                    </th>
                    <th className="p-2 border border-slate-800 w-1/3">
                      البديل / المصروف فعلياً
                    </th>
                    <th className="p-2 border border-slate-800 w-20 text-center">
                      الكمية
                    </th>
                    <th className="p-2 border border-slate-800 w-24 text-center">
                      السعر
                    </th>
                    <th className="p-2 border border-slate-800 w-24 text-center">
                      الإجمالي
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPrescription.items.map((it) => {
                    const selectedId = subMap[it.id];
                    const selectedProduct = catalog.find(
                      (c) => c.id === selectedId,
                    );
                    const price = selectedProduct?.unitPrice ?? 0;
                    const qty = qtyMap[it.id] ?? 0;
                    const lineTotal = price * qty;
                    const similarDrugs = catalog.filter(
                      (c) =>
                        c.genericName &&
                        c.genericName.toLowerCase() ===
                          it.drugItem?.genericName?.toLowerCase(),
                    );

                    return (
                      <tr key={it.id} className="hover:bg-slate-900/50">
                        <td className="p-2 border border-slate-800 align-top">
                          <div className="font-bold text-slate-200">
                            {it.drugItem?.name}
                          </div>
                          <div className="text-slate-500">
                            {it.drugItem?.strength} | {it.drugItem?.form}
                          </div>
                          <div className="text-[10px] text-sky-400 mt-1">
                            {it.dose} - {it.frequency}
                          </div>
                        </td>
                        <td className="p-2 border border-slate-800 align-top">
                          <select
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs outline-none focus:border-sky-500"
                            value={selectedId ?? ""}
                            onChange={(e) =>
                              setSubMap((prev) => ({
                                ...prev,
                                [it.id]: Number(e.target.value),
                              }))
                            }
                          >
                            {it.drugItem && (
                              <option value={it.drugItem.id}>
                                {it.drugItem.name} ({it.drugItem.strength}) -{" "}
                                {formatMoney(it.drugItem.unitPrice)}
                              </option>
                            )}
                            <optgroup label="بدائل بنفس الاسم العلمي">
                              {similarDrugs
                                .filter((d) => d.id !== it.drugItem?.id)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} ({d.strength}) -{" "}
                                    {formatMoney(d.unitPrice)} (رصيد:{" "}
                                    {d.stockOnHand})
                                  </option>
                                ))}
                            </optgroup>
                            <optgroup label="كل الأدوية">
                              {catalog
                                .filter(
                                  (d) =>
                                    !similarDrugs.includes(d) &&
                                    d.id !== it.drugItem?.id,
                                )
                                .slice(0, 50)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} - {formatMoney(d.unitPrice)}
                                  </option>
                                ))}
                            </optgroup>
                          </select>
                          {selectedProduct?.stockOnHand !== undefined &&
                            selectedProduct.stockOnHand < qty && (
                              <div className="text-rose-500 text-[10px] mt-1">
                                ⚠️ الرصيد غير كافٍ (
                                {selectedProduct.stockOnHand})
                              </div>
                            )}
                        </td>
                        <td className="p-2 border border-slate-800 align-top">
                          <input
                            type="number"
                            min={0}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-center text-xs"
                            value={qty}
                            onChange={(e) =>
                              setQtyMap((prev) => ({
                                ...prev,
                                [it.id]: Number(e.target.value),
                              }))
                            }
                          />
                        </td>
                        <td className="p-2 border border-slate-800 text-center align-top text-slate-400">
                          {formatMoney(price)}
                        </td>
                        <td className="p-2 border border-slate-800 text-center align-top font-bold text-emerald-400">
                          {formatMoney(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Action Area */}
            <div
              className={`p-4 border-t border-slate-800 rounded-b-2xl ${
                isIPD ? "bg-purple-900/20" : "bg-slate-900"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-slate-300 mb-1">
                    الإجمالي المطلوب:
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {formatMoney(currentTotal)}
                  </div>
                </div>

                {/* خيارات الدفع تظهر فقط للمرضى غير المنومين */}
                {!isIPD && (
                  <div className="flex gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        طريقة الدفع
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) =>
                          setPaymentMethod(e.target.value as PaymentMethod)
                        }
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs outline-none w-32"
                      >
                        <option value="CASH">نقداً</option>
                        <option value="CARD">بطاقة</option>
                        <option value="INSURANCE">تأمين</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        المبلغ المستلم
                      </label>
                      <input
                        type="number"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs outline-none w-24 text-center font-bold text-emerald-400"
                      />
                    </div>
                  </div>
                )}

                {isIPD && (
                  <div className="bg-purple-900/30 border border-purple-500/30 p-3 rounded-xl max-w-xs text-xs text-purple-200">
                    ℹ️ هذا المريض في حالة <b>إيواء (Inpatient)</b>.
                    <br />
                    سيتم صرف الأدوية وإضافتها للفاتورة المفتوحة (Charge) دون دفع
                    فوري.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDispenseModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
                  disabled={processing}
                >
                  إلغاء
                </button>

                <button
                  onClick={handleDispenseAction}
                  disabled={processing || currentTotal <= 0}
                  className={`px-8 py-2 rounded-xl text-white text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    isIPD
                      ? "bg-purple-600 hover:bg-purple-500 shadow-purple-500/20"
                      : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20"
                  }`}
                >
                  {processing
                    ? "جارِ التنفيذ..."
                    : isIPD
                      ? "تأكيد الصرف للعنبر"
                      : "تأكيد الصرف والدفع"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
