// src/pages/settings/NoteTemplatesPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

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

const NOTE_TYPES = [
  { value: "NURSING_ROUTINE", label: "تمريض روتيني" },
  { value: "NURSING_HANDOVER", label: "تسليم تمريض" },
  { value: "DOCTOR_ROUND", label: "جولة طبيب" },
  { value: "DOCTOR_ADMISSION", label: "ملاحظة إدخال" },
  { value: "DOCTOR_DISCHARGE", label: "ملاحظة خروج" },
  { value: "CONSULTATION", label: "استشارة" },
];

const SPECIALTIES = [
  "طب عام",
  "باطنية",
  "جراحة",
  "عيون",
  "أنف وأذن وحنجرة",
  "أطفال",
  "نساء وتوليد",
  "عظام",
  "جلدية",
  "قلب",
  "مسالك بولية",
  "أمراض عصبية",
  "طب أسنان",
  "أخرى",
];

export default function NoteTemplatesPage() {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterSpecialty, setFilterSpecialty] = useState("");

  const [form, setForm] = useState({
    name: "",
    specialty: "",
    noteType: "CONSULTATION",
    content: "",
  });

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterSpecialty) params.specialty = filterSpecialty;
      const res = await apiClient.get<NoteTemplate[]>("/note-templates", { params });
      setTemplates(res.data);
    } catch {
      toast.error("فشل تحميل القوالب");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [filterSpecialty]);

  const handleSave = async () => {
    if (!form.name || !form.content) {
      toast.error("يرجى ملء اسم القالب والمحتوى");
      return;
    }
    try {
      if (editId) {
        await apiClient.patch(`/note-templates/${editId}`, form);
        toast.success("تم تحديث القالب بنجاح");
      } else {
        await apiClient.post("/note-templates", form);
        toast.success("تم إنشاء القالب بنجاح");
      }
      setShowModal(false);
      setEditId(null);
      setForm({ name: "", specialty: "", noteType: "CONSULTATION", content: "" });
      loadTemplates();
    } catch {
      toast.error("فشل حفظ القالب");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا القالب؟")) return;
    try {
      await apiClient.delete(`/note-templates/${id}`);
      toast.success("تم حذف القالب");
      loadTemplates();
    } catch {
      toast.error("فشل حذف القالب");
    }
  };

  const openEdit = (t: NoteTemplate) => {
    setEditId(t.id);
    setForm({
      name: t.name,
      specialty: t.specialty || "",
      noteType: t.noteType,
      content: t.content,
    });
    setShowModal(true);
  };

  return (
    <div className="p-6 text-slate-100 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">قوالب الملاحظات الطبية</h1>
          <p className="text-slate-400 text-sm mt-1">
            قوالب جاهزة لكل تخصص يملأها الطبيب بسرعة
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
          + قالب جديد
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-slate-400">فلترة بالتخصص:</label>
        <select
          value={filterSpecialty}
          onChange={(e) => setFilterSpecialty(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
        >
          <option value="">الكل</option>
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">جاري التحميل...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          لا توجد قوالب {filterSpecialty ? `للتخصص: ${filterSpecialty}` : ""}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-600 transition group"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-white">{t.name}</h3>
                  <div className="flex gap-2 mt-1">
                    {t.specialty && (
                      <span className="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded-full border border-purple-800">
                        {t.specialty}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 bg-sky-900/30 text-sky-400 rounded-full border border-sky-800">
                      {NOTE_TYPES.find((n) => n.value === t.noteType)?.label || t.noteType}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => openEdit(t)}
                    className="p-1.5 text-slate-400 hover:text-sky-400 transition"
                    title="تعديل"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 transition"
                    title="حذف"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="text-sm text-slate-400 line-clamp-3 mb-3 whitespace-pre-wrap">
                {t.content}
              </div>
              <div className="text-xs text-slate-500 flex justify-between">
                <span>بواسطة: {t.createdBy?.fullName}</span>
                <span>{new Date(t.createdAt).toLocaleDateString("ar-LY")}</span>
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
              {editId ? "تعديل القالب" : "قالب جديد"}
            </h2>

            {/* Name */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">اسم القالب *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
                placeholder="مثال: قالب فحص عيون شامل"
              />
            </div>

            {/* Specialty + NoteType */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">التخصص</label>
                <select
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none"
                >
                  <option value="">عام (بدون تخصص)</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">نوع الملاحظة</label>
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
              <label className="text-sm text-slate-400 mb-1 block">محتوى القالب *</label>
              <p className="text-xs text-slate-500 mb-2">
                يمكنك استخدام العناصر النائبة: {"{{patientName}}"}, {"{{date}}"}, {"{{doctorName}}"}
              </p>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-600 outline-none resize-none font-mono"
                placeholder={"الشكوى الرئيسية:\n\nالتاريخ المرضي:\n\nالفحص السريري:\n- حدة البصر:\n- ضغط العين:\n- فحص قاع العين:\n\nالتشخيص:\n\nالخطة العلاجية:"}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowModal(false); setEditId(null); }}
                className="px-5 py-2.5 bg-slate-700 text-slate-300 rounded-xl hover:bg-slate-600 transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-500 transition"
              >
                {editId ? "تحديث" : "إنشاء القالب"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
