// src/pages/DepreciationPage.tsx

import { useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";

export default function DepreciationPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [processing, setProcessing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);

  const handleRun = async () => {
    if (
      !confirm(
        "هل أنت متأكد من تشغيل الإهلاك لهذا التاريخ؟ سيتم إنشاء قيود محاسبية."
      )
    )
      return;

    setProcessing(true);
    setResult(null);
    try {
      const res = await apiClient.post("/assets/depreciation/run", { date });
      setResult(res.data);
      toast.success("تم تشغيل الإهلاك بنجاح.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل العملية");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col items-center justify-center space-y-6"
      dir="rtl"
    >
      <div className="max-w-lg w-full bg-slate-900/60 border border-slate-800 p-8 rounded-3xl text-center shadow-2xl">
        <div className="text-4xl mb-4">📉</div>
        <h1 className="text-2xl font-bold mb-2">احتساب الإهلاك الشهري</h1>
        <p className="text-slate-400 text-sm mb-6">
          سيقوم النظام بحساب قسط الإهلاك لجميع الأصول النشطة وإنشاء القيود
          المحاسبية للفترة التي يقع فيها التاريخ المختار.
        </p>

        <div className="flex flex-col gap-4 items-center">
          <div className="w-full">
            <label className="block text-xs text-slate-400 mb-2 text-right">
              تاريخ الاستحقاق (عادة نهاية الشهر)
            </label>
            <DatePicker
              date={date ? new Date(date) : undefined}
              onChange={(d) => setDate(d ? d.toISOString().slice(0, 10) : "")}
              className="w-full bg-slate-950 border-slate-700 text-center text-lg h-12"
            />
          </div>

          <button
            onClick={handleRun}
            disabled={processing}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50"
          >
            {processing ? "جاري المعالجة..." : "بدء الاحتساب"}
          </button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl text-right text-sm space-y-2">
            <div className="font-bold text-emerald-400">✅ اكتملت العملية</div>
            <div>عدد الأصول التي تمت معالجتها: {result.processedCount}</div>
            {result.errors?.length > 0 && (
              <div className="text-rose-400 mt-2 text-xs">
                تنبيه: فشلت المعالجة لـ {result.errors.length} أصل.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
