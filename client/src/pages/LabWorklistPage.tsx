// src/pages/LabWorklistPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type PatientLite = { id: number; fullName: string; mrn: string };
type TestLite = {
  id: number;
  code: string;
  name: string;
  category?: string | null;
  unit?: string | null;
};
type OrderLite = {
  id: number;
  status: string;
  // ✅ [NEW] Payment Status
  paymentStatus: "PENDING" | "PAID" | "WAIVED";
  createdAt: string;
  encounterId: number | null;
};
type LabWorklistItem = {
  id: number;
  resultStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  resultDate?: string | null;
  order: OrderLite;
  patient?: PatientLite | null;
  test: TestLite;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LabWorklistPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LabWorklistItem[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<LabWorklistItem[]>("/lab/worklist");
      setItems(res.data);
    } catch (err) {
      toast.error("حدث خطأ أثناء تحميل القائمة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return items;
    return items.filter(
      (x) =>
        x.test.name.includes(s) ||
        x.patient?.fullName.includes(s) ||
        x.patient?.mrn.includes(s) ||
        (x.order.encounterId && String(x.order.encounterId) === s),
    );
  }, [items, search]);

  const handleComplete = async (item: LabWorklistItem) => {
    // ✅ [PAYWALL] منع الإدخال لغير المدفوع
    if (item.order.paymentStatus === "PENDING") {
      toast.error("⚠️ لا يمكن إدخال النتيجة قبل سداد الرسوم.");
      return;
    }

    // هذه طريقة مبسطة، يفضل استخدام Modal
    const val = window.prompt(
      `إدخال نتيجة (${item.test.name}) للمريض ${item.patient?.fullName ?? ""}:`,
      undefined, // Default value should be empty or existing value if editing, but simplest is empty for now
    );
    // Note: If resultValue exists, maybe pre-fill?
    
    if (val === null) return; // User cancelled

    const unit =
      window.prompt("وحدة القياس (اختياري):", item.test.unit ?? "") ??
      undefined;
    const ref = window.prompt("المعدل المرجعي (اختياري):", "") ?? undefined;

    // CDSS Check logic... (simplified for brevity as in original)
    // ...

    try {
      await apiClient.patch(`/lab/orders/${item.id}/complete`, {
        resultValue: val || undefined,
        resultUnit: unit || undefined,
        referenceRange: ref || undefined,
      });

      toast.success("تم الحفظ.");
      load(); // تحديث
    } catch (err: any) {
      toast.error("فشل الحفظ.");
    }
  };

  const renderPaymentStatus = (status: string) => {
    if (status === "PAID")
      return (
        <span className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
          تم الدفع
        </span>
      );
    if (status === "WAIVED")
      return (
        <span className="text-[10px] bg-sky-900/30 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded font-mono">
          معفى
        </span>
      );
    return (
      <span className="text-[10px] bg-rose-900/30 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-bold">
        غير مدفوع
      </span>
    );
  };

  const handleStart = async (item: LabWorklistItem) => {
    if (item.order.paymentStatus === "PENDING") {
      toast.error("⚠️ يجب سداد الرسوم قبل بدء التحليل.");
      return;
    }

    try {
        await apiClient.post(`/lab/orders/${item.id}/start`);
        toast.success("✅ تم إرسال الطلب للجهاز (HL7).");
        load();
    } catch (err) {
        toast.error("فشل بدء التحليل.");
    }
  };

  const renderStatus = (status: string) => {
    if (status === "COMPLETED")
      return <span className="text-emerald-400">مكتمل</span>;
    if (status === "IN_PROGRESS")
      return <span className="text-sky-400 animate-pulse">جاري التحليل...</span>;
    if (status === "PENDING")
      return <span className="text-amber-400">انتظار</span>;
    return status;
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">قائمة المعمل</h1>
          <p className="text-sm text-slate-400">
            إدخال النتائج وطباعة التقارير المجمعة.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-sky-500 transition-colors"
          />
          <button
            onClick={load}
            className="px-4 py-1.5 rounded-xl bg-slate-800 text-sm hover:bg-slate-700 transition"
          >
            تحديث
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl bg-slate-950/60 border border-slate-800 p-4 overflow-auto">
        <div className="space-y-3">
          {filtered.map((it) => (
            <div
              key={it.id}
              className={`border rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors ${
                it.order.paymentStatus === "PENDING"
                  ? "bg-slate-900/40 border-slate-800/60 opacity-80" // Dim unpaid items slightly
                  : "bg-slate-900/60 border-slate-800"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-lg">
                    {it.patient?.fullName}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    ({it.patient?.mrn})
                  </span>
                  <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
                    Encounter #{it.order.encounterId}
                  </span>
                </div>
                <div className="text-sm text-sky-400 font-medium flex items-center gap-2">
                  {it.test.name}
                  {it.test.code && (
                    <span className="text-slate-500 text-xs">
                      [{it.test.code}]
                    </span>
                  )}
                  {/* Payment Badge */}
                  {renderPaymentStatus(it.order.paymentStatus)}
                </div>
                <div className="text-xs text-slate-500">
                  تاريخ الطلب: {formatDateTime(it.order.createdAt)} • الحالة:{" "}
                  {renderStatus(it.resultStatus)}
                </div>
              </div>

                <div className="flex gap-2 items-center">
                {/* 1. زر البدء (يظهر فقط عند الانتظار) */}
                {it.resultStatus === "PENDING" && (
                    <button
                        onClick={() => handleStart(it)}
                        disabled={it.order.paymentStatus === "PENDING"}
                        className={`px-4 py-2 rounded-xl text-xs border transition flex items-center gap-2 ${
                            it.order.paymentStatus === "PENDING"
                            ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20"
                        }`}
                    >
                        {it.order.paymentStatus === "PENDING" && <span>🔒</span>}
                        <span>⚡ بدء التحليل</span>
                    </button>
                )}

                {/* 2. زر الإكمال (يظهر عند البدء أو الاكتمال) */}
                {(it.resultStatus === "IN_PROGRESS" || it.resultStatus === "COMPLETED") && (
                <button
                  onClick={() => handleComplete(it)}
                  disabled={it.order.paymentStatus === "PENDING"} // ✅ Disable invalid interactions
                  className={`px-4 py-2 rounded-xl text-xs border transition ${
                    it.order.paymentStatus === "PENDING"
                      ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600"
                  }`}
                >
                  {it.order.paymentStatus === "PENDING" && (
                    <span className="ml-1">🔒</span>
                  )}
                  {it.resultStatus === "COMPLETED"
                    ? "تعديل النتيجة"
                    : "إدخال النتيجة"}
                </button>
                )}

                {/* ✅ زر طباعة التقرير المجمع */}
                {it.resultStatus === "COMPLETED" && it.order.encounterId && (
                  <button
                    onClick={() =>
                      window.open(
                        `/lab/encounters/${it.order.encounterId}/print`,
                        "_blank",
                      )
                    }
                    className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-xs text-white shadow-lg font-bold flex items-center gap-2"
                  >
                    <span>🖨️</span> تقرير مجمع
                  </button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-10 text-slate-500">
              لا توجد طلبات.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
