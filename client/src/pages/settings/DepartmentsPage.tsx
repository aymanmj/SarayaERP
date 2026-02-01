// client/src/pages/settings/DepartmentsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type Department = {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  _count?: { users: number };
};

export default function DepartmentsPage() {
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({ name: "", type: "MEDICAL" });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Department[]>("/departments");
      setDepts(res.data);
    } catch (err) {
      toast.error("فشل تحميل الأقسام");
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
      if (editingId) {
        await apiClient.patch(`/departments/${editingId}`, form);
        toast.success("تم التعديل بنجاح");
      } else {
        await apiClient.post("/departments", form);
        toast.success("تمت الإضافة بنجاح");
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      toast.error("فشل الحفظ");
    }
  };

  const openEdit = (d: Department) => {
    setEditingId(d.id);
    setForm({ name: d.name, type: d.type || "MEDICAL" });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", type: "MEDICAL" });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف القسم؟")) return;
    try {
      await apiClient.delete(`/departments/${id}`);
      toast.success("تم الحذف");
      loadData();
    } catch (err) {
      toast.error("فشل الحذف (قد يكون مرتبطاً ببيانات أخرى)");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">الأقسام (Departments)</h1>
          <p className="text-sm text-slate-400">
            إدارة الأقسام الطبية والإدارية.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg"
        >
          + إضافة قسم
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">اسم القسم</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">عدد الموظفين</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {depts.map((d) => (
              <tr key={d.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-semibold">{d.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${d.type === "MEDICAL" ? "bg-sky-900/30 text-sky-300" : "bg-slate-800 text-slate-300"}`}
                  >
                    {d.type === "MEDICAL"
                      ? "طبي"
                      : d.type === "ADMIN"
                        ? "إداري"
                        : d.type}
                  </span>
                </td>
                <td className="px-4 py-3">{d._count?.users || 0}</td>
                <td className="px-4 py-3">
                  {d.isActive ? (
                    <span className="text-emerald-400 text-xs">نشط</span>
                  ) : (
                    <span className="text-rose-400 text-xs">معطل</span>
                  )}
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button
                    onClick={() => openEdit(d)}
                    className="text-sky-400 hover:text-sky-300 text-xs px-2 py-1 bg-slate-800 rounded"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-slate-800 rounded"
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white">
              {editingId ? "تعديل قسم" : "إضافة قسم جديد"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  اسم القسم
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  النوع
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="MEDICAL">طبي</option>
                  <option value="ADMIN">إداري</option>
                  <option value="SERVICE">خدمي</option>
                </select>
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
