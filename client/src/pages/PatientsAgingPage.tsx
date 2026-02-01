import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";

type PatientAgingRow = {
  patientId: number;
  patientName: string;
  mrn?: string | null;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b91_120: number;
  b121_plus: number;
  total: number;
};

type PatientAgingResponse = {
  asOf: string;
  patients: PatientAgingRow[];
  grandTotals: {
    b0_30: number;
    b31_60: number;
    b61_90: number;
    b91_120: number;
    b121_plus: number;
    total: number;
  };
};

function formatMoney(v: number) {
  return (v ?? 0).toFixed(3);
}

// Local formatDate removed

export default function PatientsAgingPage() {
  const [data, setData] = useState<PatientAgingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PatientAgingResponse>(
        "/accounting/patients-aging"
      );
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const asOf = data ? formatDate(data.asOf) : "";

  return (
    <div className="flex flex-col h-full text-slate-100">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">تحليل أعمار ذمم المرضى</h1>
          <p className="text-sm text-slate-400">
            استعراض أرصدة المرضى (والتأمين المرتبط بهم) مقسمة حسب فترات
            الاستحقاق (0-30، 31-60، 61-90، 91-120، أكثر من 120 يوم).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700"
        >
          تحديث
        </button>
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="text-xs text-slate-400 mb-1">تاريخ التقرير</div>
            <div className="text-lg font-semibold text-slate-100">{asOf}</div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="text-xs text-slate-400 mb-1">
              إجمالي رصيد المرضى
            </div>
            <div className="text-lg font-semibold text-sky-300">
              LYD {formatMoney(data.grandTotals.total)}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
            <div className="text-slate-400 mb-1">توزيع سريع</div>
            <div>0-30: LYD {formatMoney(data.grandTotals.b0_30)}</div>
            <div>31-60: LYD {formatMoney(data.grandTotals.b31_60)}</div>
            <div>61-90: LYD {formatMoney(data.grandTotals.b61_90)}</div>
            <div>91-120: LYD {formatMoney(data.grandTotals.b91_120)}</div>
            <div>&gt;120: LYD {formatMoney(data.grandTotals.b121_plus)}</div>
          </div>
        </div>
      )}

      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs overflow-auto">
        {loading ? (
          <div className="text-slate-500 text-xs">جارِ تحميل البيانات...</div>
        ) : !data || data.patients.length === 0 ? (
          <div className="text-slate-500 text-xs">
            لا توجد أرصدة مستحقة على المرضى حالياً.
          </div>
        ) : (
          <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
            <thead className="text-slate-400">
              <tr>
                <th className="px-2 py-1">المريض</th>
                <th className="px-2 py-1">0 - 30 يوم</th>
                <th className="px-2 py-1">31 - 60 يوم</th>
                <th className="px-2 py-1">61 - 90 يوم</th>
                <th className="px-2 py-1">91 - 120 يوم</th>
                <th className="px-2 py-1">&gt; 120 يوم</th>
                <th className="px-2 py-1">إجمالي الرصيد</th>
                <th className="px-2 py-1">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.patients.map((p) => (
                <tr
                  key={p.patientId}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl"
                >
                  <td className="px-2 py-1 align-top">
                    <div className="font-semibold">{p.patientName}</div>
                    {p.mrn && (
                      <div className="text-[10px] text-slate-400">
                        ملف: {p.mrn}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1 align-top">
                    {formatMoney(p.b0_30)}
                  </td>
                  <td className="px-2 py-1 align-top">
                    {formatMoney(p.b31_60)}
                  </td>
                  <td className="px-2 py-1 align-top">
                    {formatMoney(p.b61_90)}
                  </td>
                  <td className="px-2 py-1 align-top">
                    {formatMoney(p.b91_120)}
                  </td>
                  <td className="px-2 py-1 align-top">
                    {formatMoney(p.b121_plus)}
                  </td>
                  <td className="px-2 py-1 align-top text-sky-300 font-semibold">
                    {formatMoney(p.total)}
                  </td>
                  <td className="px-2 py-1 align-top">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/patients/${p.patientId}/statement`)
                      }
                      className="px-3 py-1 rounded-full text-[11px] bg-slate-800 hover:bg-slate-700"
                    >
                      كشف الحساب
                    </button>
                  </td>
                </tr>
              ))}

              <tr className="bg-slate-900 border border-slate-700 rounded-xl font-semibold">
                <td className="px-2 py-1 align-top">الإجمالي</td>
                <td className="px-2 py-1 align-top">
                  {formatMoney(data.grandTotals.b0_30)}
                </td>
                <td className="px-2 py-1 align-top">
                  {formatMoney(data.grandTotals.b31_60)}
                </td>
                <td className="px-2 py-1 align-top">
                  {formatMoney(data.grandTotals.b61_90)}
                </td>
                <td className="px-2 py-1 align-top">
                  {formatMoney(data.grandTotals.b91_120)}
                </td>
                <td className="px-2 py-1 align-top">
                  {formatMoney(data.grandTotals.b121_plus)}
                </td>
                <td className="px-2 py-1 align-top text-sky-300">
                  {formatMoney(data.grandTotals.total)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
