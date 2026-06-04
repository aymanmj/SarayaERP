import { useTranslation } from "react-i18next";
import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Specialty = {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
  _count?: { doctors: number };
};

export default function SpecialtiesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });

  const { data: specs = [], isLoading: loading } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const res = await apiClient.get<Specialty[]>("/specialties");
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      await apiClient.post("/specialties", data);
    },
    onSuccess: () => {
      toast.success(t("settings.specialties.addedSuccessfully", "تم الإضافة"));
      setShowModal(false);
      setForm({ name: "", code: "" });
      queryClient.invalidateQueries({ queryKey: ["specialties"] });
    },
    onError: () => {
      toast.error(t("settings.specialties.failedToSave", "فشل الحفظ"));
    },
  });

  const handleSave = () => {
    if (!form.name) return;
    saveMutation.mutate(form);
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            {t("settings.specialties.title", "التخصصات الطبية (Specialties)")}
          </h1>
          <p className="text-sm text-slate-400">
            {t("settings.specialties.subtitle", "إدارة التخصصات وتصنيف الأطباء.")}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-bold shadow-lg"
          disabled={loading}
        >
          {t("settings.specialties.newSpecialty", "+ تخصص جديد")}
        </button>
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">{t("settings.specialties.specialtyName", "اسم التخصص")}</th>
              <th className="px-4 py-3">{t("settings.specialties.code", "الكود")}</th>
              <th className="px-4 py-3">{t("settings.specialties.doctorsCount", "عدد الأطباء")}</th>
              <th className="px-4 py-3">{t("settings.specialties.status", "الحالة")}</th>
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
                    {s.isActive ? t("settings.specialties.active", "نشط") : t("settings.specialties.disabled", "معطل")}
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
            <h3 className="text-lg font-bold text-white">{t("settings.specialties.addNewSpecialty", "إضافة تخصص جديد")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("settings.specialties.specialtyName", "اسم التخصص")}
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  placeholder={t("settings.specialties.exampleSurgery", "مثال: جراحة عامة")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("settings.specialties.codeOptional", "الكود (اختياري)")}
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
                {t("settings.specialties.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                {saveMutation.isPending ? "..." : t("settings.specialties.save", "حفظ")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
