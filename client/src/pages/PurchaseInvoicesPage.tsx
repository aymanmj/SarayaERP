// src/pages/PurchaseInvoicesPage.tsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type SupplierLite = {
  id: number;
  name: string;
};

type PurchaseInvoiceRow = {
  id: number;
  supplier: SupplierLite;
  invoiceNumber?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  status: "DRAFT" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  totalAmount: string;
  discountAmount: string;
  vatAmount: string;
  netAmount: string;
  paidAmount: string;
  currency: string;
};

type Supplier = {
  id: number;
  name: string;
};

type ProductLite = {
  id: number;
  code: string;
  name: string;
  sellPrice: number;
};

type Warehouse = {
  id: number;
  name: string;
};

// ✅ [UPDATED] إضافة حقول التشغيلة والصلاحية
type LineFormRow = {
  productId?: number | "";
  description: string;
  quantity: number;
  unitPrice: number;
  batchNumber?: string;
  expiryDate?: string;
};

// Local formatDate removed

function formatMoney(val: string | number | null | undefined) {
  const num = Number(val ?? 0);
  return num.toFixed(3);
}

export default function PurchaseInvoicesPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);

  const [invoices, setInvoices] = useState<PurchaseInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // ---- حالة فورم إنشاء الفاتورة ----
  const [supplierId, setSupplierId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<string>(today);
  const [dueDate, setDueDate] = useState<string>("");
  const [currency, setCurrency] = useState<string>("LYD");
  const [discountAmount, setDiscountAmount] = useState<string>("0.000");
  const [vatAmount, setVatAmount] = useState<string>("0.000");
  const [notes, setNotes] = useState<string>("");

  // ✅ [UPDATED] تهيئة السطور بالحقول الجديدة
  const [lines, setLines] = useState<LineFormRow[]>([
    {
      productId: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      batchNumber: "",
      expiryDate: "",
    },
  ]);

  const [savingInvoice, setSavingInvoice] = useState(false);

  // ===== تحميل البيانات الأولية =====

  const loadInitialData = async () => {
    setLoadingInitial(true);
    try {
      const [supRes, prodRes, whRes] = await Promise.all([
        apiClient.get<Supplier[]>("/suppliers"),
        apiClient.get<ProductLite[]>("/pharmacy/catalog"),
        apiClient.get<Warehouse[]>("/inventory/warehouses"),
      ]);
      setSuppliers(supRes.data);
      setProducts(prodRes.data);
      setWarehouses(whRes.data);

      if (whRes.data.length > 0) {
        setWarehouseId(String(whRes.data[0].id));
      }
    } catch (err: any) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل البيانات الأولية.");
    } finally {
      setLoadingInitial(false);
    }
  };

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const res = await apiClient.get<PurchaseInvoiceRow[]>(
        "/purchases/invoices",
      );
      setInvoices(res.data);
    } catch (err: any) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل فواتير الشراء.");
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadInvoices();
  }, []);

  // ===== حساب الإجماليات للفورم =====

  const totalAmount = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const qty = Number(l.quantity || 0);
        const price = Number(l.unitPrice || 0);
        return sum + qty * price;
      }, 0),
    [lines],
  );

  const discountNum = useMemo(
    () => Number(discountAmount || 0),
    [discountAmount],
  );
  const vatNum = useMemo(() => Number(vatAmount || 0), [vatAmount]);

  const netAmount = useMemo(
    () => totalAmount - discountNum + vatNum,
    [totalAmount, discountNum, vatNum],
  );

  // ===== إدارة بنود الفاتورة =====

  const updateLine = (index: number, field: keyof LineFormRow, value: any) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, [field]: value };

        if (field === "productId" && value) {
          const prod = products.find((p) => p.id === Number(value));
          if (prod) {
            if (!updated.description) updated.description = prod.name;
          }
        }
        return updated;
      }),
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        batchNumber: "",
        expiryDate: "",
      },
    ]);
  };

  const removeLine = (index: number) => {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
  };

  // ===== حفظ فاتورة شراء جديدة =====

  const handleSaveInvoice = async (e: any) => {
    e.preventDefault();

    if (!supplierId) {
      toast.warning("اختر المورد أولاً.");
      return;
    }

    if (!warehouseId) {
      toast.warning("اختر المخزن الذي ستدخل إليه البضاعة.");
      return;
    }

    if (!invoiceDate) {
      toast.warning("تاريخ الفاتورة مطلوب.");
      return;
    }

    const validLines = lines.filter(
      (l) => (l.description.trim() || l.productId) && Number(l.quantity) > 0,
    );

    if (validLines.length === 0) {
      toast.warning("يجب إضافة بند واحد على الأقل.");
      return;
    }

    try {
      setSavingInvoice(true);

      await apiClient.post("/purchases/invoices", {
        supplierId: Number(supplierId),
        warehouseId: Number(warehouseId),
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate,
        dueDate: dueDate || undefined,
        currency: currency || "LYD",
        discountAmount: Number(discountAmount || 0),
        vatAmount: Number(vatAmount || 0),
        notes: notes || undefined,
        lines: validLines.map((l) => ({
          description: l.description || "بند شراء",
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          drugItemId: l.productId ? Number(l.productId) : undefined,
          // ✅ [UPDATED] إرسال بيانات التشغيلة
          batchNumber: l.batchNumber || undefined,
          expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined,
        })),
      });

      toast.success("تم حفظ فاتورة الشراء بنجاح.");

      // إعادة ضبط الفورم
      setInvoiceNumber("");
      setInvoiceDate(today);
      setDueDate("");
      setDiscountAmount("0.000");
      setVatAmount("0.000");
      setNotes("");
      setLines([
        {
          productId: "",
          description: "",
          quantity: 1,
          unitPrice: 0,
          batchNumber: "",
          expiryDate: "",
        },
      ]);

      await loadInvoices();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      toast.error(
        typeof msg === "string" ? msg : "حدث خطأ أثناء حفظ فاتورة الشراء.",
      );
    } finally {
      setSavingInvoice(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100" dir="rtl">
      {/* العنوان العلوي */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">فواتير الشراء (توريد)</h1>
          <p className="text-sm text-slate-400">
            إنشاء فواتير الشراء وإدخال المخزون (بالتشغيلات وتواريخ الصلاحية).
          </p>
        </div>
        <button
          type="button"
          onClick={loadInvoices}
          className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700"
        >
          تحديث القائمة
        </button>
      </div>

      {/* بطاقة إنشاء فاتورة جديدة */}
      <form
        onSubmit={handleSaveInvoice}
        className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 space-y-4 text-xs"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-200">
            إنشاء فاتورة شراء جديدة
          </div>
          {loadingInitial && (
            <span className="text-[11px] text-slate-500">
              جارِ تحميل البيانات الأولية...
            </span>
          )}
        </div>

        {/* الصف الأول */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">
              المورد <span className="text-rose-400">*</span>
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs"
            >
              <option value="">اختر المورد...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-300">
              المخزن المستلم <span className="text-rose-400">*</span>
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs"
            >
              <option value="">اختر المخزن...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-300">رقم الفاتورة (من المورد)</label>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs"
              placeholder="مثال: INV-2025-001"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-300">
              تاريخ الفاتورة <span className="text-rose-400">*</span>
            </label>
            <DatePicker
              date={invoiceDate ? new Date(invoiceDate) : undefined}
              onChange={(d) => setInvoiceDate(d ? d.toISOString().slice(0, 10) : "")}
              className="w-full bg-slate-900 border-slate-700"
            />
          </div>
        </div>

        {/* الصف الثاني */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">تاريخ الاستحقاق</label>
            <DatePicker
              date={dueDate ? new Date(dueDate) : undefined}
              onChange={(d) => setDueDate(d ? d.toISOString().slice(0, 10) : "")}
              className="w-full bg-slate-900 border-slate-700"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-300">العملة</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-300">قيمة الخصم</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-300">قيمة الضريبة (VAT)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={vatAmount}
              onChange={(e) => setVatAmount(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-300">ملاحظات مختصرة</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs"
            placeholder="مثال: فاتورة عن مستلزمات شهر 11"
          />
        </div>

        {/* جدول بنود الفاتورة */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-slate-300 text-sm">
              بنود الفاتورة (الأصناف)
            </div>
            <button
              type="button"
              onClick={addLine}
              className="px-3 py-1.5 rounded-full text-[11px] bg-slate-800 hover:bg-slate-700"
            >
              + إضافة بند
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-right border-separate border-spacing-y-1 min-w-[900px]">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 w-64">المنتج (للمخزون)</th>
                  <th className="px-2 py-1">الوصف</th>
                  <th className="px-2 py-1 w-24">رقم التشغيلة</th>
                  <th className="px-2 py-1 w-28">ت. الانتهاء</th>
                  <th className="px-2 py-1 w-20">الكمية</th>
                  <th className="px-2 py-1 w-24">السعر</th>
                  <th className="px-2 py-1 w-24">الإجمالي</th>
                  <th className="px-2 py-1 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const lineTotal =
                    Number(line.quantity || 0) * Number(line.unitPrice || 0);
                  return (
                    <tr
                      key={idx}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl"
                    >
                      {/* المنتج */}
                      <td className="px-2 py-1 align-top">
                        <select
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1"
                          value={line.productId}
                          onChange={(e) =>
                            updateLine(idx, "productId", e.target.value)
                          }
                        >
                          <option value="">(بدون منتج - مصروف)</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.code ? `[${p.code}]` : ""}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* الوصف */}
                      <td className="px-2 py-1 align-top">
                        <input
                          value={line.description}
                          onChange={(e) =>
                            updateLine(idx, "description", e.target.value)
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1"
                          placeholder="وصف البند"
                        />
                      </td>

                      {/* رقم التشغيلة (Batch) */}
                      <td className="px-2 py-1 align-top">
                        <input
                          value={line.batchNumber}
                          onChange={(e) =>
                            updateLine(idx, "batchNumber", e.target.value)
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1"
                          placeholder="Batch No"
                        />
                      </td>

                      {/* تاريخ الصلاحية */}
                      <td className="px-2 py-1 align-top">
                        <DatePicker
                          date={line.expiryDate ? new Date(line.expiryDate) : undefined}
                          onChange={(d) =>
                            updateLine(idx, "expiryDate", d ? d.toISOString().slice(0, 10) : "")
                          }
                          className="w-full bg-slate-900 border-slate-700 h-8"
                        />
                      </td>

                      {/* الكمية */}
                      <td className="px-2 py-1 align-top">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(idx, "quantity", e.target.value)
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-center"
                        />
                      </td>

                      {/* السعر */}
                      <td className="px-2 py-1 align-top">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(idx, "unitPrice", e.target.value)
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-center"
                        />
                      </td>

                      {/* الإجمالي */}
                      <td className="px-2 py-1 align-top text-emerald-300 pt-2 text-center">
                        {formatMoney(lineTotal)} {currency}
                      </td>

                      {/* حذف */}
                      <td className="px-2 py-1 align-top text-center pt-1">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="px-2 py-1 rounded-full text-[10px] bg-rose-700/80 hover:bg-rose-600"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ملخص الأرقام */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-slate-400 mb-1">إجمالي البنود</div>
              <div className="text-sm font-semibold text-emerald-300">
                {formatMoney(totalAmount)} {currency}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-slate-400 mb-1">إجمالي الخصم</div>
              <div className="text-sm font-semibold text-amber-300">
                {formatMoney(discountNum)} {currency}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-slate-400 mb-1">إجمالي الضريبة (VAT)</div>
              <div className="text-sm font-semibold text-amber-300">
                {formatMoney(vatNum)} {currency}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-700 bg-emerald-950/40 p-3">
              <div className="text-emerald-200 mb-1">الصافي (الواجب دفعه)</div>
              <div className="text-sm font-bold text-emerald-300">
                {formatMoney(netAmount)} {currency}
              </div>
            </div>
          </div>
        </div>

        {/* زر حفظ الفاتورة */}
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={savingInvoice}
            className="px-4 py-2 rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60"
          >
            {savingInvoice ? "جارِ الحفظ..." : "حفظ فاتورة الشراء"}
          </button>
        </div>
      </form>

      {/* قائمة فواتير الشراء */}
      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs overflow-auto">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          سجل فواتير الشراء
        </h2>

        {invoicesLoading ? (
          <div className="text-slate-500 text-xs">جارِ تحميل البيانات...</div>
        ) : invoices.length === 0 ? (
          <div className="text-slate-500 text-xs">
            لا توجد فواتير شراء مضافة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-right">رقم</th>
                  <th className="px-2 py-1 text-right">المورد</th>
                  <th className="px-2 py-1 text-right">رقم الفاتورة</th>
                  <th className="px-2 py-1 text-right">تاريخ الفاتورة</th>
                  <th className="px-2 py-1 text-right">تاريخ الاستحقاق</th>
                  <th className="px-2 py-1 text-right">الحالة</th>
                  <th className="px-2 py-1 text-right">الصافي</th>
                  <th className="px-2 py-1 text-right">المدفوع</th>
                  <th className="px-2 py-1 text-right">المتبقي</th>
                  <th className="px-2 py-1 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const net = Number(inv.netAmount ?? 0);
                  const paid = Number(inv.paidAmount ?? 0);
                  const remaining = net - paid;

                  return (
                    <tr
                      key={inv.id}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl"
                    >
                      <td className="px-2 py-1 align-top">#{inv.id}</td>
                      <td className="px-2 py-1 align-top">
                        {inv.supplier?.name ?? "—"}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {inv.invoiceNumber ?? "—"}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {formatDate(inv.invoiceDate)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {formatDate(inv.dueDate)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <span className="uppercase">{inv.status}</span>
                      </td>
                      <td className="px-2 py-1 align-top text-emerald-300">
                        {formatMoney(inv.netAmount)} {inv.currency}
                      </td>
                      <td className="px-2 py-1 align-top text-amber-300">
                        {formatMoney(inv.paidAmount)} {inv.currency}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {formatMoney(remaining)} {inv.currency}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/purchases/invoices/${inv.id}`)
                          }
                          className="px-3 py-1 rounded-full text-[10px] bg-slate-800 hover:bg-slate-700"
                        >
                          تفاصيل
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
