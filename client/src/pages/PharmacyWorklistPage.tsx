import { PharmacySourcePolicy } from '../components/pharmacy/PharmacySourcePolicy';
// src/pages/PharmacyWorklistPage.tsx

import { Money } from "../utils/money";
import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";

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
  unitPrice: number | string;
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
  prepaidInvoiceId?: number | null;
  partialClosureEligible?: boolean;
  pharmacistVerificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  status: PrescriptionStatus;
  createdAt: string;
  encounterId: number | null;
  encounter?: { type: EncounterType }; // ✅ نحتاج نوع الحالة لتمييز المنطق
  patient: { id: number; fullName: string; mrn: string };
  doctor: { id: number; fullName: string };
  items: PrescriptionItemLite[];
};

function formatDateTime(value: string, locale: string = "ar-LY") {
  const d = new Date(value);
  return d.toLocaleString(locale);
}

function formatMoney(value: number | string, currency: string = "LYD") {
  return `${currency} ${Money.toFixed(value)}`;
}

export default function PharmacyWorklistPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const dateLocale = isRtl ? "ar-LY" : "en-US";
  const currencyLabel = t("common.currency.lyd", "LYD");

  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const worklistKey = ["pharmacy-worklist", user?.hospitalId, user?.id];
  const canVerify = user?.roles.some((role) => role === "PHARMACIST" || role === "ADMIN")
    && user.permissions.includes("pharmacy:manage");

  // Selection & Modal State
  const [selectedPrescription, setSelectedPrescription] =
    useState<WorklistPrescription | null>(null);
  const isPrepaid = selectedPrescription?.prepaidInvoiceId != null;
  const [showDispenseModal, setShowDispenseModal] = useState(false);

  // Dispense Form State
  const [qtyMap, setQtyMap] = useState<Record<number, number>>({});
  const [finalPartial, setFinalPartial] = useState(false);
  const [closureReason, setClosureReason] = useState("");
  const [subMap, setSubMap] = useState<Record<number, number>>({}); // OriginalItemId -> SelectedProductId
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [processing, setProcessing] = useState(false);

  // Load Data
  const {
    data: dataRaw,
    isLoading: loading,
    refetch: loadData,
  } = useQuery({
    queryKey: worklistKey,
    enabled: Boolean(user),
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<any>("/pharmacy/worklist");
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
    meta: {
      errorMessage: t("pharmacy.loadFailed", "فشل تحميل القائمة."),
    },
  });
  const data = dataRaw || [];

  // Catalog Data
  const { data: catalog = [] } = useQuery({
    queryKey: ["pharmacy-stock"],
    queryFn: async () => {
      const res = await apiClient.get<ProductItemLite[]>("/pharmacy/stock");
      return res.data;
    },
  });

  // فتح المودال وتجهيز القيم
  const openDispenseModal = (p: WorklistPrescription) => {
    const initialQty: Record<number, number> = {};
    const initialSub: Record<number, number> = {};

    p.items.forEach((it) => {
      initialQty[it.id] = it.quantity;
      if (it.drugItem) initialSub[it.id] = it.drugItem.id;
    });

    setQtyMap(initialQty);
    setFinalPartial(false);
    setClosureReason("");
    setSubMap(initialSub);
    setSelectedPrescription(p);

    // تصفير خيارات الدفع
    setPaymentMethod("CASH");
    setAmountPaid(""); // سيتم تعبئتها تلقائياً بالإجمالي لاحقاً

    setShowDispenseModal(true);
  };

  // حساب الإجمالي الحي
  const currentTotal = useMemo(() => {
    if (!selectedPrescription) return "0.000";
    const lines = selectedPrescription.items.map((it) => {
      const product = catalog.find((p) => p.id === subMap[it.id]);
      const price = isPrepaid ? it.drugItem?.unitPrice : product?.unitPrice ?? it.drugItem?.unitPrice;
      return Money.decimal(price ?? 0).times(qtyMap[it.id] ?? 0);
    });
    return Money.toDbString(Money.sumPosted(...lines));
  }, [selectedPrescription, qtyMap, subMap, catalog, isPrepaid]);

  useEffect(() => {
    if (showDispenseModal && !isPrepaid) setAmountPaid(currentTotal);
  }, [currentTotal, showDispenseModal, isPrepaid]);

  // تنفيذ العملية (المنطق الذكي)
  const verifyPrescription = async () => {
    if (!selectedPrescription) return;
    setProcessing(true);
    try {
      await apiClient.post(`/pharmacy/prescriptions/${selectedPrescription.id}/verify`);
      setSelectedPrescription({ ...selectedPrescription, pharmacistVerificationStatus: "VERIFIED" });
      await loadData();
      toast.success(t("pharmacy.verificationSuccess", "تم اعتماد المراجعة الصيدلية."));
    } catch {
      toast.error(t("pharmacy.verificationFailed", "تعذر اعتماد الوصفة. راجع تنبيهات السلامة وحالة المريض قبل المحاولة مجددًا."));
    } finally {
      setProcessing(false);
    }
  };

  const partialReady = selectedPrescription?.partialClosureEligible &&
    closureReason.trim().length >= 5 && Money.decimal(currentTotal).gt(0) &&
    selectedPrescription.items.some((item) => (qtyMap[item.id] ?? 0) < item.quantity) &&
    selectedPrescription.items.every((item) => {
      const quantity = qtyMap[item.id] ?? 0;
      return Number.isInteger(quantity) && quantity >= 0 && quantity <= item.quantity;
    });

  const handleDispenseAction = async () => {
    if (!selectedPrescription) return;
    if (finalPartial && (!partialReady || !window.confirm(t("pharmacy.confirmFinalPartial")))) return;
    if (selectedPrescription.pharmacistVerificationStatus !== "VERIFIED") {
      toast.error(t("pharmacy.verificationRequired", "تجب مراجعة الوصفة واعتمادها من الصيدلي قبل الصرف."));
      return;
    }

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
        .filter((x) => finalPartial || x.quantity > 0);

      if (isPrepaid || isInpatient) {
        // ✅ سيناريو الإيواء: صرف فقط (إضافة للفاتورة المفتوحة)
        await apiClient.post(`/pharmacy/prescriptions/${pId}/dispense`, {
          items: itemsPayload,
          ...(finalPartial && { partialClosureReason: closureReason.trim() }),
          notes: isPrepaid ? undefined : t("pharmacy.notes.ipdDispense", "صرف للعنبر (IPD Dispense)"),
        });
        toast.success(finalPartial ? t("pharmacy.partialClosed") : isPrepaid ? t("pharmacy.success.prepaidDispensed", "تم صرف الوصفة.") : t("pharmacy.success.ipdDispensed", "تم صرف الأدوية وإرسالها للعنبر."));
      } else {
        // ✅ سيناريو الخارجي: صرف + دفع فوري
        await apiClient.post(`/pharmacy/prescriptions/${pId}/dispense-pay`, {
          paymentMethod,
          amountPaid: Number(amountPaid),
          items: itemsPayload,
          notes: t("pharmacy.notes.posDispense", "صرف مباشر (POS)"),
        });
        toast.success(t("pharmacy.success.dispensePaid", "تم الصرف والدفع بنجاح."));
      }

      setShowDispenseModal(false);
      setSelectedPrescription(null);

      // تحديث القائمة
      queryClient.setQueryData<WorklistPrescription[]>(worklistKey, (prev) =>
        prev ? prev.filter((x) => x.id !== pId) : []
      );
     
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || t("pharmacy.operationFailed", "فشل العملية."));
    } finally {
      setProcessing(false);
    }
  };

  // Helper to determine mode text
  const isIPD = selectedPrescription?.encounter?.type === "IPD";

  return (
    <div
      className="p-6 space-y-6 text-slate-100 h-full flex flex-col"
      dir={isRtl ? "rtl" : "ltr"}
      data-testid="pharmacy-page"
    >
      <PharmacySourcePolicy />
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("pharmacy.title", "صرف الوصفات (الصيدلية)")}</h1>
          <p className="text-sm text-slate-400">{t("pharmacy.subtitle", "قائمة الوصفات المعلقة للصرف.")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadData()}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
          >
            {t("common.refresh", "تحديث")}
          </button>
          <a
            href="/pharmacy/stock"
            target="_blank"
            className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-sm text-white"
          >
            {t("pharmacy.stockLink", "المخزون")}
          </a>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">{t("pharmacy.table.prescriptionNo", "رقم الوصفة")}</th>
              <th className="px-4 py-3">{t("pharmacy.table.patientType", "نوع المريض")}</th>
              <th className="px-4 py-3">{t("pharmacy.table.patient", "المريض")}</th>
              <th className="px-4 py-3">{t("pharmacy.table.doctor", "الطبيب")}</th>
              <th className="px-4 py-3">{t("pharmacy.table.date", "التاريخ")}</th>
              <th className="px-4 py-3">{t("pharmacy.table.itemCount", "عدد الأصناف")}</th>
              <th className="px-4 py-3">{t("pharmacy.table.actions", "إجراءات")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => {
              const isIPD = p.encounter?.type === "IPD";
              return (
                <tr
                  key={p.id}
                  data-testid={`pharmacy-prescription-row-${p.id}`}
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
                      {isIPD ? t("pharmacy.patientType.inpatient", "إيواء (منوم)") : t("pharmacy.patientType.outpatient", "خارجي / طوارئ")}
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
                    {formatDateTime(p.createdAt, dateLocale)}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{p.items.length}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDispenseModal(p)}
                      data-testid={`dispense-prescription-${p.id}`}
                      className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-lg"
                    >
                      {t("pharmacy.viewAndDispense", "عرض وصرف")}
                    </button>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  {t("pharmacy.emptyState", "لا توجد وصفات في الانتظار.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dispense Modal */}
      {showDispenseModal && selectedPrescription && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          data-testid="pharmacy-dispense-modal"
        >
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  {t("pharmacy.modal.dispenseTitle", "صرف الوصفة #")}{selectedPrescription.id}
                  {isIPD && (
                    <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full">
                      {t("pharmacy.modal.inpatientBadge", "مريض إيواء")}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-slate-400">
                  {t("pharmacy.modal.patientLabel", "المريض:")} {selectedPrescription.patient.fullName}
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
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-700 p-3 text-sm">
                <span>
                  {selectedPrescription.pharmacistVerificationStatus === "VERIFIED"
                    ? t("pharmacy.verified", "المراجعة الصيدلية معتمدة")
                    : t("pharmacy.reviewRequired", "راجع الأدوية والجرعات وحالة المريض ثم اعتمد الوصفة قبل الصرف.")}
                </span>
                {canVerify && selectedPrescription.pharmacistVerificationStatus !== "VERIFIED" && (
                  <button type="button" onClick={verifyPrescription} disabled={processing}
                    data-testid="pharmacy-verify-prescription"
                    className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-white disabled:opacity-50">
                    {t("pharmacy.verifyPrescription", "اعتماد المراجعة الصيدلية")}
                  </button>
                )}
              </div>
              <p className="mb-3 text-xs text-amber-300">{t("pharmacy.approvedItemsOnly", "يُصرف الصنف والكمية المعتمدان فقط. البدائل والصرف الجزئي يحتاجان دورة اعتماد مستقلة.")}</p>
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2 border border-slate-800 w-1/3">
                      {t("pharmacy.modal.prescribedDrug", "الدواء الموصوف")}
                    </th>
                    <th className="p-2 border border-slate-800 w-1/3">
                      {t("pharmacy.modal.substitute", "البديل / المصروف فعلياً")}
                    </th>
                    <th className="p-2 border border-slate-800 w-20 text-center">
                      {t("pharmacy.modal.quantity", "الكمية")}
                    </th>
                    <th className="p-2 border border-slate-800 w-24 text-center">
                      {t("pharmacy.modal.price", "السعر")}
                    </th>
                    <th className="p-2 border border-slate-800 w-24 text-center">
                      {t("pharmacy.modal.total", "الإجمالي")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPrescription.items.map((it) => {
                    const selectedId = subMap[it.id];
                    const selectedProduct = catalog.find(
                      (c) => c.id === selectedId,
                    );
                    const price = (isPrepaid ? it.drugItem?.unitPrice : selectedProduct?.unitPrice ?? it.drugItem?.unitPrice) ?? 0;
                    const qty = qtyMap[it.id] ?? 0;
                    const lineTotal = Money.decimal(price).times(qty).toFixed(3);
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
                            data-testid={`dispense-product-${it.id}`}
                            disabled
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
                                {formatMoney(it.drugItem.unitPrice, currencyLabel)}
                              </option>
                            )}
                            <optgroup label={t("pharmacy.modal.sameGenericGroup", "بدائل بنفس الاسم العلمي")}>
                              {similarDrugs
                                .filter((d) => d.id !== it.drugItem?.id)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} ({d.strength}) -{" "}
                                    {formatMoney(d.unitPrice, currencyLabel)} ({t("pharmacy.modal.stockLabel", "رصيد:")}{" "}
                                    {d.stockOnHand})
                                  </option>
                                ))}
                            </optgroup>
                            <optgroup label={t("pharmacy.modal.allDrugsGroup", "كل الأدوية")}>
                              {catalog
                                .filter(
                                  (d) =>
                                    !similarDrugs.includes(d) &&
                                    d.id !== it.drugItem?.id,
                                )
                                .slice(0, 50)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} - {formatMoney(d.unitPrice, currencyLabel)}
                                  </option>
                                ))}
                            </optgroup>
                          </select>
                          {selectedProduct?.stockOnHand !== undefined &&
                            selectedProduct.stockOnHand < qty && (
                              <div className="text-rose-500 text-[10px] mt-1">
                                {t("pharmacy.modal.insufficientStock", "⚠️ الرصيد غير كافٍ")} (
                                {selectedProduct.stockOnHand})
                              </div>
                            )}
                        </td>
                        <td className="p-2 border border-slate-800 align-top">
                          <input
                            type="number"
                            min={0}
                            max={it.quantity}
                            step={1}
                            aria-label={t("pharmacy.modal.quantity", "الكمية") + " " + (it.drugItem?.name ?? it.id)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-center text-xs"
                            value={qty}
                            data-testid={`dispense-qty-${it.id}`}
                            readOnly={!finalPartial}
                            onChange={(e) =>
                              setQtyMap((prev) => ({
                                ...prev,
                                [it.id]: Number(e.target.value),
                              }))
                            }
                          />
                        </td>
                        <td className="p-2 border border-slate-800 text-center align-top text-slate-400">
                          {formatMoney(price, currencyLabel)}
                        </td>
                        <td className="p-2 border border-slate-800 text-center align-top font-bold text-emerald-400">
                          {formatMoney(lineTotal, currencyLabel)}
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
              {selectedPrescription.partialClosureEligible && selectedPrescription.pharmacistVerificationStatus === "VERIFIED" && (
                <div className="mb-4 space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={finalPartial} disabled={processing} onChange={(event) => {
                      setFinalPartial(event.target.checked);
                      if (!event.target.checked) {
                        setClosureReason("");
                        setQtyMap(Object.fromEntries(selectedPrescription.items.map((item) => [item.id, item.quantity])));
                      }
                    }} />
                    {t("pharmacy.finalPartial")}
                  </label>
                  {finalPartial && <label className="block">{t("pharmacy.partialClosureReason")}
                    <textarea value={closureReason} minLength={5} maxLength={1000} disabled={processing}
                      onChange={(event) => setClosureReason(event.target.value)}
                      className="block w-full rounded border border-slate-700 bg-slate-900 p-2" />
                  </label>}
                </div>
              )}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-slate-300 mb-1">
                    {finalPartial ? t("pharmacy.partialDispensedTotal") : isPrepaid ? t("pharmacy.modal.prepaidTotal", "إجمالي الوصفة المثبت") : t("pharmacy.modal.totalRequired", "الإجمالي المطلوب:")}
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {formatMoney(currentTotal, currencyLabel)}
                  </div>
                </div>

                {isPrepaid && (
                  <div className="text-sm">
                    <p className="text-emerald-300">
                      {t("pharmacy.modal.cashierSettled", "فاتورة الخزينة مسوّاة. الصرف فقط.")}
                    </p>
                    <p className="text-slate-300">
                      {t("pharmacy.modal.cashierInvoiceNumber", "رقم فاتورة الخزينة")}{" "}
                      <bdi>#{selectedPrescription.prepaidInvoiceId}</bdi>
                    </p>
                  </div>
                )}
                {/* خيارات الدفع تظهر فقط للمرضى غير المنومين */}
                {!isIPD && !isPrepaid && <p className="text-xs text-amber-300">{t("pharmacy.fullPaymentRequired", "الدفع الفوري يتطلب المبلغ كاملًا وجلسة صندوق مفتوحة. التأمين يُعالج عبر دورة فوترة مستقلة.")}</p>}
                {!isIPD && !isPrepaid && (
                  <div className="flex gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {t("pharmacy.modal.paymentMethod", "طريقة الدفع")}
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) =>
                          setPaymentMethod(e.target.value as PaymentMethod)
                        }
                        data-testid="pharmacy-payment-method"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs outline-none w-32"
                      >
                        <option value="CASH">{t("pharmacy.payment.cash", "نقداً")}</option>
                        <option value="CARD">{t("pharmacy.payment.card", "بطاقة")}</option>
                        <option value="TRANSFER">{t("pharmacy.payment.transfer", "تحويل")}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {t("pharmacy.modal.amountReceived", "المبلغ المستلم")}
                      </label>
                      <input
                        type="number"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        data-testid="pharmacy-amount-paid"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs outline-none w-24 text-center font-bold text-emerald-400"
                      />
                    </div>
                  </div>
                )}

                {isIPD && !isPrepaid && (
                  <div className="bg-purple-900/30 border border-purple-500/30 p-3 rounded-xl max-w-xs text-xs text-purple-200">
                    {t("pharmacy.modal.ipdInfoTitle", "ℹ️ هذا المريض في حالة إيواء (Inpatient).")}
                    <br />
                    {t("pharmacy.modal.ipdInfoBody", "سيتم صرف الأدوية وإضافتها للفاتورة المفتوحة (Charge) دون دفع فوري.")}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDispenseModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
                  disabled={processing}
                >
                  {t("common.cancel", "إلغاء")}
                </button>

                <button
                  onClick={handleDispenseAction}
                  disabled={processing || (finalPartial && !partialReady) || (!isPrepaid && !Money.decimal(currentTotal).gt(0)) || selectedPrescription.pharmacistVerificationStatus !== "VERIFIED"}
                  data-testid="pharmacy-confirm-dispense"
                  className={`px-8 py-2 rounded-xl text-white text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    isIPD
                      ? "bg-purple-600 hover:bg-purple-500 shadow-purple-500/20"
                      : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20"
                  }`}
                >
                  {processing
                    ? t("pharmacy.processing", "جارِ التنفيذ...")
                    : finalPartial ? t("pharmacy.finalPartial") : isPrepaid
                      ? t("pharmacy.confirmPrepaidDispense", "تأكيد الصرف")
                      : isIPD
                      ? t("pharmacy.confirmDispenseIPD", "تأكيد الصرف للعنبر")
                      : t("pharmacy.confirmDispenseAndPay", "تأكيد الصرف والدفع")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
