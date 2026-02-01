import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type CostCenter = {
  id: number;
  code: string;
  name: string;
  type: string;
};

export default function CostCentersPage() {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", type: "BOTH" });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<CostCenter[]>("/accounting/cost-centers");
      setCenters(res.data);
    } catch {
      toast.error("فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.code) return;
    try {
      await apiClient.post("/accounting/cost-centers", form);
      toast.success("تم الحفظ");
      setShowModal(false);
      setForm({ name: "", code: "", type: "BOTH" });
      loadData();
    } catch {
      toast.error("فشل الحفظ");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">مراكز التكلفة (Cost Centers)</h1>
          <p className="text-sm text-slate-400">
            إدارة الأقسام المالية لتحليل الربحية.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
        >
          + مركز جديد
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 overflow-auto">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2">الكود</th>
              <th className="px-4 py-2">الاسم</th>
              <th className="px-4 py-2">النوع</th>
            </tr>
          </thead>
          <tbody>
            {centers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-sky-400">{c.code}</td>
                <td className="px-4 py-3 font-bold">{c.name}</td>
                <td className="px-4 py-3 text-xs">
                  {c.type === "BOTH" ? "إيراد ومصروف" : c.type}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">إضافة مركز تكلفة</h3>
            <div className="space-y-2">
              <input
                placeholder="الاسم (مثال: المختبر)"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                placeholder="الكود (مثال: CC-LAB)"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="BOTH">إيراد ومصروف</option>
                <option value="REVENUE">إيراد فقط (Profit Center)</option>
                <option value="COST">مصروف فقط (Cost Center)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 rounded text-sm font-bold"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
