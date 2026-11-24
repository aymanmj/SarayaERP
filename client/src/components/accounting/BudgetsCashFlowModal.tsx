// client/src/components/accounting/BudgetsCashFlowModal.tsx
import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { Money } from "../../utils/money";
import { toast } from "sonner";

interface CashFlowStatement {
  startDate: string;
  endDate: string;
  openingCashBalance: string;
  netCashChange: string;
  closingCashBalance: string;
  reconciliationDifference: string;
  closingCashTafqeet: string;
  operatingActivities: Array<{ description: string; amount: string }>;
  investingActivities: Array<{ description: string; amount: string }>;
  financingActivities: Array<{ description: string; amount: string }>;
}

export function BudgetsCashFlowModal({ onClose }: { onClose: () => void }) {
  const [startDate, setStartDate] = useState(() => `${new Date().getUTCFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statement, setStatement] = useState<CashFlowStatement | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCashFlow = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<CashFlowStatement>(
        "/accounting/corporate/cash-flow",
        { params: { startDate, endDate } },
      );
      setStatement(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "تعذّر إعداد قائمة التدفقات النقدية");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="قائمة التدفقات النقدية والموازنات والتفقيط"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 text-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-sky-300">
              💧 قائمة التدفقات النقدية والموازنات والتفقيط العربي
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              تدفقات الأنشطة التشغيلية والاستثمارية والتمويلية بدقة Money ومطابقة رصيد النقدية والبنوك مع التفقيط العربي.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"
          >
            إغلاق
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={loadCashFlow}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white"
          >
            {loading ? "جاري الاحتساب..." : "عرض قائمة التدفقات النقدية"}
          </button>
        </div>

        {statement && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <div className="text-slate-400">رصيد النقدية الافتتاحي</div>
                <div className="text-base font-bold">{Money.toFixed(statement.openingCashBalance)} LYD</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <div className="text-slate-400">صافي التغيّر النقدي</div>
                <div className="text-base font-bold text-sky-400">{Money.toFixed(statement.netCashChange)} LYD</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <div className="text-slate-400">رصيد النقدية الختامي</div>
                <div className="text-base font-bold text-emerald-400">{Money.toFixed(statement.closingCashBalance)} LYD</div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <div className="text-slate-400">فرق المطابقة</div>
                <div className="text-base font-bold">{Money.toFixed(statement.reconciliationDifference)} LYD</div>
              </div>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-3 text-emerald-300 font-semibold">
              التفقيط: {statement.closingCashTafqeet}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
