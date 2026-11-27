// client/src/components/hr/BulkImportEmployeesModal.tsx
import React, { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { hrService } from "../../services/hr.service";
import {
  downloadEmployeesImportTemplate,
  parseEmployeesExcelRows,
  type ParsedEmployeeImportRow,
} from "../../utils/hrExport";

interface BulkImportEmployeesModalProps {
  open: boolean;
  onClose: () => void;
  altamamEnabled: boolean;
  mode: "standard" | "altamam";
  onSuccess: () => void;
}

export const BulkImportEmployeesModal: React.FC<BulkImportEmployeesModalProps> = ({
  open,
  onClose,
  altamamEnabled,
  mode,
  onSuccess,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedEmployeeImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  if (!open) return null;

  const isAltamamMode = mode === "altamam";
  const showAltamamCol = altamamEnabled || isAltamamMode;

  const handleReset = () => {
    setParsedRows([]);
    setFileName("");
    setImportErrors([]);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportErrors([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        toast.error("ملف الإكسل لا يحتوي على أي أوراق بيانات.");
        return;
      }
      const ws = wb.Sheets[firstSheet];
      const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const parsed = parseEmployeesExcelRows(rawJson, {
        includeAltamam: altamamEnabled,
        altamamMode: isAltamamMode,
      });
      if (!parsed.length) {
        toast.warning("لم يتم العثور على صفوف موظفين صالحة في الملف.");
        setParsedRows([]);
        return;
      }
      setParsedRows(parsed);
      toast.success(`تمت قراءة ${parsed.length} موظف من الملف بنجاح.`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "تعذر قراءة ملف الإكسل.",
      );
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedRows.length) return;
    setSubmitting(true);
    try {
      const result = await hrService.bulkImportEmployees(
        parsedRows as unknown as Record<string, unknown>[],
      );
      toast.success(
        `اكتمل الاستيراد: جديد ${result.imported} | محدث ${result.updated}`,
      );
      if (result.errors?.length) {
        setImportErrors(result.errors);
        onSuccess();
      } else {
        onSuccess();
        handleClose();
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "فشل استيراد بيانات الموظفين.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isAltamamMode
                  ? "bg-purple-500/15 border-purple-500/40 text-purple-300"
                  : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
              }`}
            >
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {isAltamamMode
                  ? "استيراد موظفي منظومة التمام (Excel)"
                  : "استيراد الموظفين من ملف Excel"}
              </h3>
              <p className="text-xs text-slate-400">
                {isAltamamMode
                  ? "يدعم أعمدة ملفات منظومة التمام وربطها بالرقم الوظيفي في السرايا تلقائياً"
                  : "رفع قائمة الموظفين بالاسم والرقم الوظيفي والأقسام والرواتب بضغطة زر"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs text-slate-300 space-y-1">
              <div className="font-bold text-slate-100">
                1. قم بتنزيل النموذج أو اختيار ملف Excel (.xlsx / .xls / .csv)
              </div>
              <div className="text-slate-400">
                يتم التطابق عبر: رقم السرايا، أو رقم التمام (عند التفعيل)، أو الرقم الوطني لتحديث السجلات القائمة دون تكرار.
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadEmployeesImportTemplate({
                  includeAltamam: altamamEnabled,
                  altamamMode: isAltamamMode,
                })
              }
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-sky-400" />
              تنزيل ملف إكسل نموذجي
            </button>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-700 hover:border-sky-500/60 bg-slate-950/40 rounded-2xl p-8 cursor-pointer transition-colors">
            <Upload className="w-8 h-8 text-sky-400" />
            <span className="text-sm font-bold">
              {fileName ? `الملف المختار: ${fileName}` : "اضغط لاختيار ملف Excel"}
            </span>
            <span className="text-xs text-slate-500">
              الصيغ المدعومة: .xlsx, .xls, .csv (الحد الأقصى 5000 سجل)
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {importErrors.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 text-sm font-bold">
                <AlertTriangle className="w-4 h-4" />
                ملاحظات على بعض الصفوف ({importErrors.length})
              </div>
              <ul className="max-h-36 overflow-y-auto text-xs text-amber-200/90 space-y-1 pr-4 list-disc">
                {importErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  معاينة البيانات المستخرجة ({parsedRows.length} موظف — يُعرض أول 50 صفاً)
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-slate-400 hover:text-rose-400 underline"
                >
                  مسح وإعادة الرفع
                </button>
              </div>
              <div className="border border-slate-800 rounded-2xl overflow-auto max-h-72">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">رقم السرايا</th>
                      {showAltamamCol && <th className="px-3 py-2.5">رقم التمام</th>}
                      <th className="px-3 py-2.5">الاسم الكامل</th>
                      <th className="px-3 py-2.5">الإدارة / القسم</th>
                      <th className="px-3 py-2.5">التصنيف والمسمى</th>
                      <th className="px-3 py-2.5">الراتب الأساسي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {parsedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-sky-300">
                          {r.employeeNo || (
                            <span className="text-slate-500">تلقائي</span>
                          )}
                        </td>
                        {showAltamamCol && (
                          <td className="px-3 py-2">
                            {r.altamamEmployeeNo ? (
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono">
                                {r.altamamEmployeeNo}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2 font-bold text-slate-100">
                          {r.fullName}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {r.departmentName || "القسم العام"}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {r.jobTitle || "—"} ({r.staffCategory || "إداري"})
                        </td>
                        <td className="px-3 py-2 font-mono text-emerald-400">
                          {r.basicSalary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold"
          >
            إغلاق
          </button>
          <button
            type="button"
            disabled={!parsedRows.length || submitting}
            onClick={handleConfirmImport}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black shadow-lg"
          >
            {submitting
              ? "جارِ الاستيراد..."
              : `تأكيد واستيراد (${parsedRows.length}) موظف`}
          </button>
        </div>
      </div>
    </div>
  );
};
