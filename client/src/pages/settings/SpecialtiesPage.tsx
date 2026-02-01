// client/src/pages/settings/DepartmentsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type Specialty = {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
  _count?: { doctors: number };
};

export default function SpecialtiesPage() {
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Specialty[]>("/specialties");
      setSpecs(res.data);
    } catch (err) {
      toast.error("فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    if (!form.name) return;
    try {
      await apiClient.post("/specialties", form);
      toast.success("تم الإضافة");
      setShowModal(false);
      setForm({ name: "", code: "" });
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
          <h1 className="text-2xl font-bold mb-1">
            التخصصات الطبية (Specialties)
          </h1>
          <p className="text-sm text-slate-400">
            إدارة التخصصات وتصنيف الأطباء.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-bold shadow-lg"
        >
          + تخصص جديد
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">اسم التخصص</th>
              <th className="px-4 py-3">الكود</th>
              <th className="px-4 py-3">عدد الأطباء</th>
              <th className="px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {specs.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-semibold">{s.name}</td>
                <td className="px-4 py-3 font-mono text-slate-400">
                  {s.code || "—"}
                </td>
                <td className="px-4 py-3">{s._count?.doctors || 0}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] ${s.isActive ? "bg-emerald-900/30 text-emerald-300" : "bg-rose-900/30 text-rose-300"}`}
                  >
                    {s.isActive ? "نشط" : "معطل"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white">إضافة تخصص جديد</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  اسم التخصص
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="مثال: جراحة عامة"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الكود (اختياري)
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="GS"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
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
