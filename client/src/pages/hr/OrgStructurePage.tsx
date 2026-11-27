// client/src/pages/hr/OrgStructurePage.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Briefcase, Plus, Trash2, Settings } from "lucide-react";
import { hrService } from "../../services/hr.service";

export default function OrgStructurePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"sections" | "jobTitles">("sections");
  const [filterDeptId, setFilterDeptId] = useState<string>("");

  const [sectionForm, setSectionForm] = useState({
    departmentId: "",
    name: "",
    nameEn: "",
    code: "",
  });

  const [jobTitleForm, setJobTitleForm] = useState({
    name: "",
    nameEn: "",
    code: "",
    level: "",
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: hrService.listDepartments,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["hr-sections", filterDeptId],
    queryFn: () =>
      hrService.listSections(filterDeptId ? Number(filterDeptId) : undefined),
  });

  const { data: jobTitles = [] } = useQuery({
    queryKey: ["hr-job-titles"],
    queryFn: hrService.listJobTitles,
  });

  const handleCreateSection = async () => {
    if (!sectionForm.departmentId || !sectionForm.name.trim()) {
      toast.warning("اختر القسم وأدخل اسم الشعبة.");
      return;
    }
    try {
      await hrService.createSection({
        departmentId: Number(sectionForm.departmentId),
        name: sectionForm.name.trim(),
        nameEn: sectionForm.nameEn.trim() || undefined,
        code: sectionForm.code.trim() || undefined,
      });
      toast.success("تمت إضافة الشعبة بنجاح.");
      setSectionForm({ departmentId: "", name: "", nameEn: "", code: "" });
      queryClient.invalidateQueries({ queryKey: ["hr-sections"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر إضافة الشعبة.");
    }
  };

  const handleCreateJobTitle = async () => {
    if (!jobTitleForm.name.trim()) {
      toast.warning("أدخل اسم المسمى الوظيفي.");
      return;
    }
    try {
      await hrService.createJobTitle({
        name: jobTitleForm.name.trim(),
        nameEn: jobTitleForm.nameEn.trim() || undefined,
        code: jobTitleForm.code.trim() || undefined,
        level: jobTitleForm.level ? Number(jobTitleForm.level) : undefined,
      });
      toast.success("تمت إضافة المسمى الوظيفي.");
      setJobTitleForm({ name: "", nameEn: "", code: "", level: "" });
      queryClient.invalidateQueries({ queryKey: ["hr-job-titles"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر إضافة المسمى.");
    }
  };

  return (
    <div className="p-6 text-slate-100 max-w-6xl mx-auto space-y-6" dir="rtl">
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black">
              الهيكل الوظيفي والشُعب والمسميات
            </h1>
            <p className="text-xs text-slate-400">
              تنظيم الشُعب الفرعية التابعة للإدارات والأقسام وتعريف المسميات الوظيفية المعتمدة
            </p>
          </div>
        </div>
        <Link
          to="/settings/departments"
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-2"
        >
          <Settings className="w-4 h-4 text-sky-400" />
          إدارة الأقسام الرئيسية
        </Link>
      </div>

      <div className="flex gap-2 bg-slate-900/40 p-2 rounded-2xl border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setTab("sections")}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${
            tab === "sections"
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Building2 className="w-4 h-4" />
          الشُعب والوحدات ({sections.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("jobTitles")}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${
            tab === "jobTitles"
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          المسميات الوظيفية ({jobTitles.length})
        </button>
      </div>

      {tab === "sections" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 items-end text-xs">
            <div>
              <label className="text-slate-400 block mb-1">القسم / الإدارة *</label>
              <select
                value={sectionForm.departmentId}
                onChange={(e) =>
                  setSectionForm({ ...sectionForm, departmentId: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="">اختر القسم...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">اسم الشعبة *</label>
              <input
                value={sectionForm.name}
                onChange={(e) =>
                  setSectionForm({ ...sectionForm, name: e.target.value })
                }
                placeholder="مثال: وحدة العناية المركزة ب"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">الاسم بالإنجليزية</label>
              <input
                value={sectionForm.nameEn}
                onChange={(e) =>
                  setSectionForm({ ...sectionForm, nameEn: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">الرمز</label>
              <input
                value={sectionForm.code}
                onChange={(e) =>
                  setSectionForm({ ...sectionForm, code: e.target.value })
                }
                placeholder="SEC-ICU"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleCreateSection}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> إضافة شعبة
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center gap-3 text-xs">
              <span className="text-slate-400">تصفية حسب القسم:</span>
              <select
                value={filterDeptId}
                onChange={(e) => setFilterDeptId(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5"
              >
                <option value="">كل الأقسام</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">الرمز</th>
                  <th className="px-4 py-3">الشعبة</th>
                  <th className="px-4 py-3">القسم التابع له</th>
                  <th className="px-4 py-3 text-center">الموظفون</th>
                  <th className="px-4 py-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sections.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-sky-300">
                      {s.code || "—"}
                    </td>
                    <td className="px-4 py-3 font-bold">
                      {s.name}
                      {s.nameEn && (
                        <div className="text-[11px] text-slate-500">{s.nameEn}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {s.department?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {s._count?.employees ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          await hrService.deleteSection(s.id);
                          toast.success("تم إلغاء تفعيل الشعبة.");
                          queryClient.invalidateQueries({ queryKey: ["hr-sections"] });
                        }}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 items-end text-xs">
            <div>
              <label className="text-slate-400 block mb-1">المسمى الوظيفي *</label>
              <input
                value={jobTitleForm.name}
                onChange={(e) =>
                  setJobTitleForm({ ...jobTitleForm, name: e.target.value })
                }
                placeholder="مثال: استشاري جراحة عامة"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">الاسم بالإنجليزية</label>
              <input
                value={jobTitleForm.nameEn}
                onChange={(e) =>
                  setJobTitleForm({ ...jobTitleForm, nameEn: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">الرمز</label>
              <input
                value={jobTitleForm.code}
                onChange={(e) =>
                  setJobTitleForm({ ...jobTitleForm, code: e.target.value })
                }
                placeholder="JT-CONS"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">المستوى (1-20)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={jobTitleForm.level}
                onChange={(e) =>
                  setJobTitleForm({ ...jobTitleForm, level: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleCreateJobTitle}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> إضافة مسمى
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">الرمز</th>
                  <th className="px-4 py-3">المسمى الوظيفي</th>
                  <th className="px-4 py-3 text-center">المستوى</th>
                  <th className="px-4 py-3 text-center">الموظفون</th>
                  <th className="px-4 py-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {jobTitles.map((jt) => (
                  <tr key={jt.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-sky-300">
                      {jt.code || "—"}
                    </td>
                    <td className="px-4 py-3 font-bold">
                      {jt.name}
                      {jt.nameEn && (
                        <div className="text-[11px] text-slate-500">{jt.nameEn}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {jt.level ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {jt._count?.employees ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          await hrService.deleteJobTitle(jt.id);
                          toast.success("تم إلغاء تفعيل المسمى.");
                          queryClient.invalidateQueries({ queryKey: ["hr-job-titles"] });
                        }}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
