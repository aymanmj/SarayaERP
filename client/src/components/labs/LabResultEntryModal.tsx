import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

export interface LabOrderResultRow {
  id?: number;
  parameterId?: number | null;
  parameterName: string;
  value: string;
  unit?: string | null;
  range?: string | null;
  flag?: string | null;
}

export interface PendingCriticalNotif {
  id: number;
  parameterName: string;
  criticalValue: string;
  flag: string;
  status: string;
  slaDeadline: string;
}

export interface LabWorklistOrderForModal {
  id: number;
  resultStatus: string;
  resultValue?: string | null;
  resultUnit?: string | null;
  referenceRange?: string | null;
  isVerified?: boolean;
  isAmended?: boolean;
  lastAmendmentReason?: string | null;
  results?: LabOrderResultRow[];
  pendingCriticalNotifications?: PendingCriticalNotif[];
  patient?: { id: number; fullName: string; mrn: string } | null;
  test: {
    id: number;
    code: string;
    name: string;
    unit?: string | null;
    parameters?: Array<{
      id: number;
      code: string;
      name: string;
      unit?: string | null;
      refRange?: string | null;
    }>;
  };
}

interface LabResultEntryModalProps {
  item: LabWorklistOrderForModal;
  onClose: () => void;
  onSaved: () => void;
}

export function LabResultEntryModal({
  item,
  onClose,
  onSaved,
}: LabResultEntryModalProps) {
  const hasParameters =
    (item.test.parameters && item.test.parameters.length > 0) ||
    (item.results && item.results.length > 0);

  const [resultValue, setResultValue] = useState(item.resultValue || "");
  const [resultUnit, setResultUnit] = useState(
    item.resultUnit || item.test.unit || "",
  );
  const [referenceRange, setReferenceRange] = useState(
    item.referenceRange || "",
  );
  const [verifyImmediately, setVerifyImmediately] = useState(true);
  const [amendReason, setAmendReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [paramRows, setParamRows] = useState<LabOrderResultRow[]>(() => {
    if (item.results && item.results.length > 0) {
      return item.results.map((r) => ({
        parameterId: r.parameterId,
        parameterName: r.parameterName,
        value: r.value,
        unit: r.unit || "",
        range: r.range || "",
        flag: r.flag || "",
      }));
    }
    if (item.test.parameters && item.test.parameters.length > 0) {
      return item.test.parameters.map((p) => ({
        parameterId: p.id,
        parameterName: p.name,
        value: "",
        unit: p.unit || "",
        range: p.refRange || "",
        flag: "",
      }));
    }
    return [];
  });

  // JCI Read-Back state
  const [clinicianName, setClinicianName] = useState("");
  const [readBackMethod, setReadBackMethod] = useState<
    "PHONE" | "IN_PERSON" | "SYSTEM_ALERT"
  >("PHONE");
  const [readBackValue, setReadBackValue] = useState("");
  const [readBackConfirmed, setReadBackConfirmed] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const filledParams = paramRows
        .filter((p) => p.value.trim() !== "")
        .map((p) => ({
          parameterId: p.parameterId ?? undefined,
          parameterName: p.parameterName,
          value: p.value.trim(),
          unit: p.unit?.trim() || undefined,
          range: p.range?.trim() || undefined,
          flag: p.flag?.trim() || undefined,
        }));

      if (item.isVerified) {
        if (!amendReason.trim()) {
          toast.error("يجب توضيح سبب التصحيح المعتمد (Amendment Reason)");
          setSubmitting(false);
          return;
        }
        await apiClient.post(`/lab/orders/${item.id}/amend`, {
          reason: amendReason.trim(),
          ...(hasParameters
            ? { parameters: filledParams }
            : {
                resultValue: resultValue.trim(),
                resultUnit: resultUnit.trim() || undefined,
                referenceRange: referenceRange.trim() || undefined,
              }),
        });
        toast.success("تم حفظ التصحيح المعتمد وتحديث بصمة التحقق SHA-256");
      } else {
        await apiClient.patch(`/lab/orders/${item.id}/complete`, {
          ...(hasParameters
            ? { parameters: filledParams }
            : {
                resultValue: resultValue.trim(),
                resultUnit: resultUnit.trim() || undefined,
                referenceRange: referenceRange.trim() || undefined,
              }),
          verifyImmediately,
        });
        toast.success(
          verifyImmediately
            ? "تم إدخال النتيجة واعتمادها نهائيًا ببصمة SHA-256"
            : "تم حفظ النتيجة كمسودة مبدئية بانتظار الاعتماد النهائي",
        );
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر حفظ النتيجة المخبرية";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReadBack = async (notifId: number) => {
    setSubmitting(true);
    try {
      await apiClient.post(`/lab/critical-notifications/${notifId}/read-back`, {
        notifiedClinicianName: clinicianName.trim(),
        notificationMethod: readBackMethod,
        readBackConfirmed,
        readBackValue: readBackValue.trim(),
      });
      toast.success("تم توثيق إبلاغ وإعادة قراءة القيمة الحرجة (JCI IPSG.2)");
      onSaved();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر توثيق إعادة القراءة للقيمة الحرجة";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      dir="rtl"
      role="dialog"
      aria-label="إدخال واعتماد نتائج المختبر"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-black text-white">
              {item.isVerified
                ? "تصحيح معتمد لنتيجة مخبرية (Amendment)"
                : "إدخال واعتماد نتائج التحليل المخبري"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {item.test.name} ({item.test.code}) — المريض:{" "}
              {item.patient?.fullName || "—"} ({item.patient?.mrn || "—"})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold"
          >
            إغلاق
          </button>
        </div>

        {/* Pending Critical Value Read-Back Section (JCI IPSG.2) */}
        {item.pendingCriticalNotifications &&
          item.pendingCriticalNotifications.length > 0 && (
            <div className="rounded-2xl border border-rose-500/60 bg-rose-950/40 p-4 space-y-3 text-xs">
              <div className="font-black text-rose-300">
                تنبيه قيمة حرجة معلّق (JCI IPSG.2 — يلزم توثيق الإبلاغ وإعادة القراءة Read-Back)
              </div>
              {item.pendingCriticalNotifications.map((cn) => (
                <div
                  key={cn.id}
                  className="rounded-xl border border-rose-800 bg-slate-950/70 p-3 space-y-2"
                >
                  <div className="flex justify-between font-bold">
                    <span>
                      {cn.parameterName}:{" "}
                      <span className="font-mono text-rose-400">
                        {cn.criticalValue} ({cn.flag})
                      </span>
                    </span>
                    <span className="text-amber-300">
                      المهلة: {cn.slaDeadline.slice(11, 16)} UTC
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      value={clinicianName}
                      onChange={(e) => setClinicianName(e.target.value)}
                      placeholder="اسم الطبيب/الممرض المبلَّغ"
                      className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5"
                    />
                    <select
                      value={readBackMethod}
                      onChange={(e) =>
                        setReadBackMethod(
                          e.target.value as "PHONE" | "IN_PERSON" | "SYSTEM_ALERT",
                        )
                      }
                      className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5"
                    >
                      <option value="PHONE">اتصال هاتفي</option>
                      <option value="IN_PERSON">إبلاغ مباشر</option>
                      <option value="SYSTEM_ALERT">تنبيه نظام</option>
                    </select>
                    <input
                      value={readBackValue}
                      onChange={(e) => setReadBackValue(e.target.value)}
                      placeholder="القيمة المعاد قراءتها"
                      className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={readBackConfirmed}
                        onChange={(e) => setReadBackConfirmed(e.target.checked)}
                      />
                      أؤكد قيام الطبيب المبلَّغ بإعادة قراءة القيمة الحرجة حرفيًا (Read-Back)
                    </label>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleReadBack(cn.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                    >
                      توثيق Read-Back
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        <form onSubmit={handleSave} className="space-y-4">
          {hasParameters ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2.5">البراميتر</th>
                    <th className="p-2.5">القيمة</th>
                    <th className="p-2.5">الوحدة</th>
                    <th className="p-2.5">النطاق المرجعي</th>
                    <th className="p-2.5">العلم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {paramRows.map((row, idx) => (
                    <tr key={`${row.parameterName}-${idx}`}>
                      <td className="p-2.5 font-bold text-white">
                        {row.parameterName}
                      </td>
                      <td className="p-2">
                        <input
                          value={row.value}
                          onChange={(e) => {
                            const next = [...paramRows];
                            next[idx] = { ...next[idx], value: e.target.value };
                            setParamRows(next);
                          }}
                          placeholder="أدخل القيمة"
                          className="w-28 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono"
                        />
                      </td>
                      <td className="p-2 text-slate-400 font-mono">
                        {row.unit || "—"}
                      </td>
                      <td className="p-2 text-slate-400 font-mono">
                        {row.range || "تلقائي (عمر/جنس)"}
                      </td>
                      <td className="p-2 font-mono font-bold text-amber-300">
                        {row.flag || "تلقائي"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">القيمة المخبرية</label>
                <input
                  value={resultValue}
                  onChange={(e) => setResultValue(e.target.value)}
                  required
                  placeholder="مثال: 13.8"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">الوحدة</label>
                <input
                  value={resultUnit}
                  onChange={(e) => setResultUnit(e.target.value)}
                  placeholder="مثال: g/dL"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">النطاق المرجعي</label>
                <input
                  value={referenceRange}
                  onChange={(e) => setReferenceRange(e.target.value)}
                  placeholder="تلقائي حسب العمر والجنس"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 font-mono"
                />
              </div>
            </div>
          )}

          {item.isVerified ? (
            <div className="text-xs">
              <label className="block text-amber-300 font-bold mb-1">
                سبب التصحيح المعتمد (إلزامي لحفظ سجل LabResultAmendment):
              </label>
              <input
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                required
                placeholder="مثال: إعادة فحص العينة بعد استبعاد انحلال الدم"
                className="w-full rounded-xl bg-slate-900 border border-amber-500/50 px-3 py-2"
              />
            </div>
          ) : (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={verifyImmediately}
                onChange={(e) => setVerifyImmediately(e.target.checked)}
              />
              اعتماد النتيجة نهائيًا وقفلها ببصمة تشفير SHA-256 فور الحفظ
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              {item.isVerified ? "حفظ التصحيح المعتمد" : "حفظ النتائج"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
