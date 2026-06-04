import { useTranslation } from "react-i18next";
import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface NoteTemplate {
  id: number;
  name: string;
  specialty: string | null;
  noteType: string;
  content: string;
  isActive: boolean;
  createdBy: { id: number; fullName: string };
  createdAt: string;
}

export default function NoteTemplatesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const queryClient = useQueryClient();

  // Moved inside component to fix module-level t() bug
  const NOTE_TYPES = [
    { value: "NURSING_ROUTINE", label: t("settings.noteTemplates.routineNursing", "تمريض روتيني") },
    { value: "NURSING_HANDOVER", label: t("settings.noteTemplates.nursingDelivery", "تسليم تمريض") },
    { value: "DOCTOR_ROUND", label: t("settings.noteTemplates.doctorTour", "جولة طبيب") },
    { value: "DOCTOR_ADMISSION", label: t("settings.noteTemplates.entryNote", "ملاحظة إدخال") },
    { value: "DOCTOR_DISCHARGE", label: t("settings.noteTemplates.exitNote", "ملاحظة خروج") },
    { value: "CONSULTATION", label: t("settings.noteTemplates.consultation", "استشارة") },
  ];

  const SPECIALTIES = [
    t("settings.noteTemplates.generalMedicine", "طب عام"),
    t("settings.noteTemplates.esotericism", "باطنية"),
    t("settings.noteTemplates.surgery", "جراحة"),
    t("settings.noteTemplates.eyes", "عيون"),
    t("settings.noteTemplates.earNoseAndThroat", "أنف وأذن وحنجرة"),
    t("settings.noteTemplates.children", "أطفال"),
    t("settings.noteTemplates.gynecologyAndObstetrics", "نساء وتوليد"),
    t("settings.noteTemplates.bones", "عظام"),
    t("settings.noteTemplates.leather", "جلدية"),
    t("settings.noteTemplates.heart", "قلب"),
    t("settings.noteTemplates.urinaryTract", "مسالك بولية"),
    t("settings.noteTemplates.neurologicalDiseases", "أمراض عصبية"),
    t("settings.noteTemplates.dentistry", "طب أسنان"),
    t("settings.noteTemplates.other", "أخرى"),
  ];

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterSpecialty, setFilterSpecialty] = useState("");

  const [form, setForm] = useState({
    name: "",
    specialty: "",
    noteType: "CONSULTATION",
    content: "",
  });

  const { data: templates = [], isLoading: loading } = useQuery({
    queryKey: ["noteTemplates", filterSpecialty],
    queryFn: async () => {
      const params: any = {};
      if (filterSpecialty) params.specialty = filterSpecialty;
      const res = await apiClient.get<NoteTemplate[]>("/note-templates", { params });
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        return apiClient.patch(`/note-templates/${editId}`, form);
      } else {
        return apiClient.post("/note-templates", form);
      }
    },
    onSuccess: () => {
      toast.success(editId
        ? t("settings.noteTemplates.theTemplateHasBeenUpdatedSuccessfully", "تم تحديث القالب بنجاح")
        : t("settings.noteTemplates.theTemplateWasCreatedSuccessfully", "تم إنشاء القالب بنجاح"));
      setShowModal(false);
      setEditId(null);
      setForm({ name: "", specialty: "", noteType: "CONSULTATION", content: "" });
      queryClient.invalidateQueries({ queryKey: ["noteTemplates"] });
    },
    onError: () => {
      toast.error(t("settings.noteTemplates.failedToSaveTemplate", "فشل حفظ القالب"));
    },
  });

  const handleSave = () => {
    if (!form.name || !form.content) {
      toast.error(t("settings.noteTemplates.pleaseFillInTheTemplateNameAndContent", "يرجى ملء اسم القالب والمحتوى"));
      return;
    }
    saveMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiClient.delete(`/note-templates/${id}`),
    onSuccess: () => {
      toast.success(t("settings.noteTemplates.theTemplateHasBeenDeleted", "تم حذف القالب"));
      queryClient.invalidateQueries({ queryKey: ["noteTemplates"] });
    },
    onError: () => {
      toast.error(t("settings.noteTemplates.failedToDeleteTemplate", "فشل حذف القالب"));
    },
  });

  const handleDelete = (id: number) => {
    if (!confirm(t("settings.noteTemplates.areYouSureYouWantToDeleteThisTemplate", "هل أنت متأكد من حذف هذا القالب؟"))) return;
    deleteMutation.mutate(id);
  };

  const openEdit = (tmpl: NoteTemplate) => {
    setEditId(tmpl.id);
    setForm({
      name: tmpl.name,
      specialty: tmpl.specialty || "",
      noteType: tmpl.noteType,
      content: tmpl.content,
    });
    setShowModal(true);
  };

  return (
    <div className="p-6 text-slate-100 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t("settings.noteTemplates.medicalNotesTemplates", "قوالب الملاحظات الطبية")}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {t("settings.noteTemplates.subtitle", "قوالب جاهزة لكل تخصص يملأها الطبيب بسرعة")}
          </p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm({ name: "", specialty: "", noteType: "CONSULTATION", content: "" });
            setShowModal(true);
          }}
          className="px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/30"
        >
          {t("settings.noteTemplates.newTemplateBtn", "+ قالب جديد")}
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-slate-400">{t("settings.noteTemplates.filterBySpecialty", "فلترة بالتخصص:")}</label>
        <select
          value={filterSpecialty}
          onChange={(e) => setFilterSpecialty(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
        >
          <option value="">{t("settings.noteTemplates.everyone", "الكل")}</option>
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">{t("settings.noteTemplates.loading", "جاري التحميل...")}</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          {t("settings.noteTemplates.noTemplates", "لا توجد قوالب")} {filterSpecialty ? t("settings.noteTemplates.forSpecializationFilterspecialty", `للتخصص: ${filterSpecialty}`) : ""}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-600 transition group"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-white">{tmpl.name}</h3>
                  <div className="flex gap-2 mt-1">
                    {tmpl.specialty && (
                      <span className="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded-full border border-purple-800">
                        {tmpl.specialty}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 bg-sky-900/30 text-sky-400 rounded-full border border-sky-800">
                      {NOTE_TYPES.find((n) => n.value === tmpl.noteType)?.label || tmpl.noteType}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => openEdit(tmpl)}
                    className="p-1.5 text-slate-400 hover:text-sky-400 transition"
                    title={t("settings.noteTemplates.amendment", "تعديل")}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(tmpl.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 transition"
                    title={t("settings.noteTemplates.delete", "حذف")}
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="text-sm text-slate-400 line-clamp-3 mb-3 whitespace-pre-wrap">
                {tmpl.content}
              </div>
              <div className="text-xs text-slate-500 flex justify-between">
                <span>{t("settings.noteTemplates.createdBy", "بواسطة:")} {tmpl.createdBy?.fullName}</span>
                <span>{new Date(tmpl.createdAt).toLocaleDateString("ar-LY")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xl shadow-2xl">
            <h2 className="text-xl font-bold mb-5">
              {editId ? t("settings.noteTemplates.modifyTheTemplate", "تعديل القالب") : t("settings.noteTemplates.newTemplate", "قالب جديد")}
            </h2>

            {/* Name */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">{t("settings.noteTemplates.templateName", "اسم القالب *")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
                placeholder={t("settings.noteTemplates.exampleComprehensiveEyeExaminationTempla", "مثال: قالب فحص عيون شامل")}
              />
            </div>

            {/* Specialty + NoteType */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">{t("settings.noteTemplates.specialization", "التخصص")}</label>
                <select
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
                >
                  <option value="">{t("settings.noteTemplates.generalNoSpecialization", "عام (بدون تخصص)")}</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">{t("settings.noteTemplates.noteType", "نوع الملاحظة")}</label>
                <select
                  value={form.noteType}
                  onChange={(e) => setForm({ ...form, noteType: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
                >
                  {NOTE_TYPES.map((n) => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Content */}
            <div className="mb-5">
              <label className="text-sm text-slate-400 mb-1 block">{t("settings.noteTemplates.templateContent", "محتوى القالب *")}</label>
              <p className="text-xs text-slate-500 mb-2">
                {t("settings.noteTemplates.placeholdersNote", "يمكنك استخدام العناصر النائبة:")} {"{{patientName}}"}, {"{{date}}"}, {"{{doctorName}}"}
              </p>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none resize-none font-mono"
                placeholder={t("settings.noteTemplates.chiefComplaintnnsickHistorynnclinicalExa", "الشكوى الرئيسية:\n\nالتاريخ المرضي:\n\nالفحص السريري:\n- حدة البصر:\n- ضغط العين:\n- فحص قاع العين:\n\nالتشخيص:\n\nالخطة العلاجية:")}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowModal(false); setEditId(null); }}
                className="px-5 py-2.5 bg-slate-700 text-slate-300 rounded-xl hover:bg-slate-600 transition"
              >
                {t("settings.noteTemplates.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-500 transition flex items-center gap-2"
              >
                {saveMutation.isPending && (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                )}
                {editId ? t("settings.noteTemplates.toUpdate", "تحديث") : t("settings.noteTemplates.textKey", "إنشاء القالب")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
