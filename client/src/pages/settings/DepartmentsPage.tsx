import { useTranslation } from "react-i18next";
import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Department = {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  _count?: { users: number };
};

export default function DepartmentsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", type: "MEDICAL" });

  const { data: depts = [], isLoading: loading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await apiClient.get<Department[]>("/departments");
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (editingId) {
        await apiClient.patch(`/departments/${editingId}`, data);
      } else {
        await apiClient.post("/departments", data);
      }
    },
    onSuccess: () => {
      toast.success(editingId ? t("settings.departments.editedSuccessfully", "تم التعديل بنجاح") : t("settings.departments.addedSuccessfully", "تمت الإضافة بنجاح"));
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: () => {
      toast.error(t("settings.departments.failedToSave", "فشل الحفظ"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/departments/${id}`);
    },
    onSuccess: () => {
      toast.success(t("settings.departments.deletedSuccessfully", "تم الحذف"));
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: () => {
      toast.error(t("settings.departments.failedToDelete", "فشل الحذف (قد يكون مرتبطاً ببيانات أخرى)"));
    },
  });

  const handleSave = () => {
    if (!form.name) return;
    saveMutation.mutate(form);
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

  const handleDelete = (id: number) => {
    if (!confirm(t("settings.departments.confirmDelete", "هل أنت متأكد من حذف القسم؟"))) return;
    deleteMutation.mutate(id);
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("settings.departments.title", "الأقسام (Departments)")}</h1>
          <p className="text-sm text-slate-400">
            {t("settings.departments.subtitle", "إدارة الأقسام الطبية والإدارية.")}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg"
          disabled={loading}
        >
          {t("settings.departments.addDepartment", "+ إضافة قسم")}
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">{t("settings.departments.departmentName", "اسم القسم")}</th>
              <th className="px-4 py-3">{t("settings.departments.type", "النوع")}</th>
              <th className="px-4 py-3">{t("settings.departments.employeeCount", "عدد الموظفين")}</th>
              <th className="px-4 py-3">{t("settings.departments.status", "الحالة")}</th>
              <th className="px-4 py-3">{t("settings.departments.actions", "إجراءات")}</th>
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
                      ? t("settings.departments.medical", "طبي")
                      : d.type === "ADMIN"
                        ? t("settings.departments.admin", "إداري")
                        : t("settings.departments.service", "خدمي")}
                  </span>
                </td>
                <td className="px-4 py-3">{d._count?.users || 0}</td>
                <td className="px-4 py-3">
                  {d.isActive ? (
                    <span className="text-emerald-400 text-xs">{t("settings.departments.active", "نشط")}</span>
                  ) : (
                    <span className="text-rose-400 text-xs">{t("settings.departments.disabled", "معطل")}</span>
                  )}
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button
                    onClick={() => openEdit(d)}
                    className="text-sky-400 hover:text-sky-300 text-xs px-2 py-1 bg-slate-800 rounded"
                  >
                    {t("settings.departments.edit", "تعديل")}
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-slate-800 rounded"
                  >
                    {t("settings.departments.delete", "حذف")}
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
              {editingId ? t("settings.departments.editDepartment", "تعديل قسم") : t("settings.departments.addNewDepartment", "إضافة قسم جديد")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("settings.departments.departmentName", "اسم القسم")}
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("settings.departments.type", "النوع")}
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="MEDICAL">{t("settings.departments.medical", "طبي")}</option>
                  <option value="ADMIN">{t("settings.departments.admin", "إداري")}</option>
                  <option value="SERVICE">{t("settings.departments.service", "خدمي")}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm"
              >
                {t("settings.departments.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                {saveMutation.isPending ? "..." : t("settings.departments.save", "حفظ")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
