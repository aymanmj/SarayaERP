import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type UserLite = { id: number; fullName: string };

type ChecklistRow = {
  id: number;
  phase: "SIGN_IN" | "TIME_OUT" | "SIGN_OUT";
  siteMarked: boolean;
  consentConfirmed: boolean;
  allergyChecked: boolean;
  antibioticProphylaxisGiven: boolean;
  imagingDisplayed: boolean;
  signedAt: string;
  signatureHash: string;
  performedBy?: UserLite | null;
  verifiedBy?: UserLite | null;
};

type CountItemRow = {
  id: number;
  category: "SPONGE" | "SHARP" | "INSTRUMENT" | "NEEDLE" | "OTHER";
  itemName: string;
  initialCount: number;
  addedCount: number;
  finalCount: number | null;
  status:
    | "OPEN"
    | "MATCHED"
    | "DISCREPANCY"
    | "RESOLVED_WITH_XRAY"
    | "ESCALATED_INCIDENT";
  resolutionNotes?: string | null;
  scrubNurse?: UserLite | null;
  circulatingNurse?: UserLite | null;
  incident?: { id: number; incidentNumber: string; severity: string } | null;
};

type AnesthesiaRow = {
  id: number;
  asaClass: string;
  isEmergency: boolean;
  anesthesiaType: string;
  airwayManagement?: string | null;
  fluidsInMl: number;
  estimatedBloodLossMl: number;
  urineOutputMl: number;
  pacuAldreteScore?: number | null;
  complications?: string | null;
  status: "DRAFT" | "SIGNED";
  signedAt?: string | null;
  signatureHash?: string | null;
  anesthesiologist?: UserLite | null;
  signedBy?: UserLite | null;
};

type SafetySummary = {
  surgeryCaseId: number;
  surgeryName: string;
  status: string;
  checklists: ChecklistRow[];
  countItems: CountItemRow[];
  anesthesiaRecord: AnesthesiaRow | null;
  readiness: {
    signInDone: boolean;
    timeOutDone: boolean;
    signOutDone: boolean;
    anesthesiaSigned: boolean;
    unresolvedCountItems: number;
    discrepancyCountItems: number;
    canStartIncision: boolean;
    canCloseAndComplete: boolean;
  };
};

interface Props {
  surgeryCaseId: number;
  users: UserLite[];
  onClose: () => void;
}

export function SurgicalSafetyModal({ surgeryCaseId, users, onClose }: Props) {
  const [tab, setTab] = useState<"WHO" | "COUNT" | "ANESTHESIA">("WHO");
  const [summary, setSummary] = useState<SafetySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // WHO Checklist form
  const [phase, setPhase] = useState<"SIGN_IN" | "TIME_OUT" | "SIGN_OUT">(
    "SIGN_IN",
  );
  const [siteMarked, setSiteMarked] = useState(true);
  const [consentConfirmed, setConsentConfirmed] = useState(true);
  const [allergyChecked, setAllergyChecked] = useState(true);
  const [antibioticGiven, setAntibioticGiven] = useState(true);
  const [imagingDisplayed, setImagingDisplayed] = useState(true);
  const [verifiedById, setVerifiedById] = useState<string>("");
  const [whoNotes, setWhoNotes] = useState("");

  // Surgical Count form
  const [countCategory, setCountCategory] = useState<
    "SPONGE" | "SHARP" | "INSTRUMENT" | "NEEDLE" | "OTHER"
  >("SPONGE");
  const [countItemName, setCountItemName] = useState("");
  const [initialCount, setInitialCount] = useState("10");
  const [finalCountInputs, setFinalCountInputs] = useState<
    Record<number, string>
  >({});
  const [resolveNotesInputs, setResolveNotesInputs] = useState<
    Record<number, string>
  >({});

  // Anesthesia Record form
  const [asaClass, setAsaClass] = useState("ASA_2");
  const [isEmergency, setIsEmergency] = useState(false);
  const [anesthesiaType, setAnesthesiaType] = useState("GENERAL");
  const [airwayManagement, setAirwayManagement] = useState("ETT 7.5 cuffed");
  const [fluidsInMl, setFluidsInMl] = useState("1000");
  const [eblMl, setEblMl] = useState("150");
  const [urineMl, setUrineMl] = useState("200");
  const [aldreteScore, setAldreteScore] = useState("9");
  const [complications, setComplications] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SafetySummary>(
        `/surgery/safety/cases/${surgeryCaseId}/summary`,
      );
      setSummary(res.data);
      const a = res.data.anesthesiaRecord;
      if (a) {
        setAsaClass(a.asaClass);
        setIsEmergency(a.isEmergency);
        setAnesthesiaType(a.anesthesiaType);
        setAirwayManagement(a.airwayManagement ?? "");
        setFluidsInMl(String(a.fluidsInMl));
        setEblMl(String(a.estimatedBloodLossMl));
        setUrineMl(String(a.urineOutputMl));
        setAldreteScore(
          a.pacuAldreteScore != null ? String(a.pacuAldreteScore) : "",
        );
        setComplications(a.complications ?? "");
      }
      if (!res.data.readiness.signInDone) setPhase("SIGN_IN");
      else if (!res.data.readiness.timeOutDone) setPhase("TIME_OUT");
      else setPhase("SIGN_OUT");
    } catch {
      toast.error("فشل تحميل بيانات سلامة الجراحة.");
    } finally {
      setLoading(false);
    }
  }, [surgeryCaseId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleSignChecklist = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/surgery/safety/cases/${surgeryCaseId}/checklist`, {
        phase,
        checklistItems: {
          siteMarked,
          consentConfirmed,
          allergyChecked,
          antibioticProphylaxisGiven: antibioticGiven,
          imagingDisplayed,
        },
        siteMarked,
        consentConfirmed,
        allergyChecked,
        antibioticProphylaxisGiven: antibioticGiven,
        imagingDisplayed,
        ...(verifiedById ? { verifiedById: Number(verifiedById) } : {}),
        ...(whoNotes.trim() ? { notes: whoNotes.trim() } : {}),
      });
      toast.success(`تم توثيق وتوقيع مرحلة ${phase} (SHA-256).`);
      setWhoNotes("");
      await loadSummary();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذّر توثيق قائمة التحقق.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleAddCountItem = async () => {
    if (countItemName.trim().length < 2) {
      toast.error("أدخل اسم الصنف الجراحي (مثال: شاش بطن / إبر خياطة).");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/surgery/safety/cases/${surgeryCaseId}/counts`, {
        category: countCategory,
        itemName: countItemName.trim(),
        initialCount: Number(initialCount) || 0,
      });
      toast.success("تم فتح بند العدّ الجراحي.");
      setCountItemName("");
      await loadSummary();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل فتح بند العدّ.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCount = async (itemId: number) => {
    const raw = finalCountInputs[itemId];
    if (raw === undefined || raw === "") {
      toast.error("أدخل العدد النهائي أولًا.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post<CountItemRow>(
        `/surgery/safety/counts/${itemId}/verify`,
        { finalCount: Number(raw) },
      );
      if (res.data.status === "DISCREPANCY") {
        toast.error("🚨 تم رصد تباين في العدّ الجراحي! يلزم الفحص والتسوية.");
      } else {
        toast.success("✅ تمت المطابقة المزدوجة للعدّ الجراحي بنجاح.");
      }
      await loadSummary();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل التحقق المزدوج من العدّ.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleResolveDiscrepancy = async (
    itemId: number,
    resolutionStatus: "RESOLVED_WITH_XRAY" | "ESCALATED_INCIDENT",
  ) => {
    const notes = (resolveNotesInputs[itemId] ?? "").trim();
    if (notes.length < 5) {
      toast.error("أدخل ملاحظات التسوية أو إجراء الأشعة (5 أحرف على الأقل).");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/surgery/safety/counts/${itemId}/resolve`, {
        resolutionStatus,
        resolutionNotes: notes,
      });
      toast.success(
        resolutionStatus === "ESCALATED_INCIDENT"
          ? "تم تصعيد التباين كحادثة سريرية حرجة (SENTINEL)."
          : "تمت تسوية التباين وتوثيق الأشعة.",
      );
      await loadSummary();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل تسوية التباين.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAnesthesia = async (signAfter = false) => {
    setBusy(true);
    try {
      await apiClient.put(`/surgery/safety/cases/${surgeryCaseId}/anesthesia`, {
        asaClass,
        isEmergency,
        anesthesiaType,
        airwayManagement: airwayManagement || undefined,
        fluidsInMl: Number(fluidsInMl) || 0,
        estimatedBloodLossMl: Number(eblMl) || 0,
        urineOutputMl: Number(urineMl) || 0,
        ...(aldreteScore !== "" ? { pacuAldreteScore: Number(aldreteScore) } : {}),
        complications: complications || undefined,
      });
      if (signAfter) {
        await apiClient.post(
          `/surgery/safety/cases/${surgeryCaseId}/anesthesia/sign`,
        );
        toast.success("🔒 تم توقيع وإقفال سجل التخدير إلكترونيًا (SHA-256).");
      } else {
        toast.success("تم حفظ مسودة سجل التخدير.");
      }
      await loadSummary();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل حفظ سجل التخدير.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const anesthSigned = summary?.anesthesiaRecord?.status === "SIGNED";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="حوكمة وسلامة العمليات والتخدير والعد الجراحي"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 text-slate-100 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-emerald-300">
              🛡️ سلامة الجراحة والعدّ الجراحي وسجل التخدير (WHO / CAP05)
            </h2>
            {summary && (
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span
                  className={`px-2 py-0.5 rounded-full border ${
                    summary.readiness.signInDone
                      ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  SIGN_IN {summary.readiness.signInDone ? "✅" : "⏳"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full border ${
                    summary.readiness.timeOutDone
                      ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  TIME_OUT {summary.readiness.timeOutDone ? "✅" : "⏳"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full border ${
                    summary.readiness.signOutDone
                      ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  SIGN_OUT {summary.readiness.signOutDone ? "✅" : "⏳"}
                </span>
                {summary.readiness.discrepancyCountItems > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-600 text-rose-300 font-bold">
                    🚨 تباين عدّ جراحي ({summary.readiness.discrepancyCountItems})
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"
          >
            إغلاق
          </button>
        </div>

        <div className="flex gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setTab("WHO")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "WHO"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            1. قائمة WHO الجراحية
          </button>
          <button
            type="button"
            onClick={() => setTab("COUNT")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "COUNT"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            2. العدّ الجراحي المزدوج ({summary?.countItems.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTab("ANESTHESIA")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "ANESTHESIA"
                ? "bg-violet-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            3. سجل التخدير المقفل {anesthSigned ? "🔒" : ""}
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            جاري تحميل بيانات السلامة...
          </div>
        ) : (
          <>
            {tab === "WHO" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(summary?.checklists ?? []).map((chk) => (
                    <div
                      key={chk.id}
                      className="rounded-xl bg-emerald-950/30 border border-emerald-800/50 p-3 text-xs space-y-1"
                    >
                      <div className="font-bold text-emerald-300">
                        🔒 {chk.phase}
                      </div>
                      <div>المُوثِّق: {chk.performedBy?.fullName ?? "—"}</div>
                      {chk.verifiedBy && (
                        <div>المُراجِع (4 عيون): {chk.verifiedBy.fullName}</div>
                      )}
                      <div className="font-mono text-[10px] text-emerald-400/80 break-all">
                        SHA-256: {chk.signatureHash.slice(0, 24)}…
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1" htmlFor="who-phase">
                        المرحلة (WHO Phase)
                      </label>
                      <select
                        id="who-phase"
                        value={phase}
                        onChange={(e) =>
                          setPhase(
                            e.target.value as
                              | "SIGN_IN"
                              | "TIME_OUT"
                              | "SIGN_OUT",
                          )
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="SIGN_IN">SIGN_IN (قبل التخدير)</option>
                        <option value="TIME_OUT">
                          TIME_OUT (قبل الشق الجراحي — 4 عيون)
                        </option>
                        <option value="SIGN_OUT">
                          SIGN_OUT (قبل مغادرة الغرفة — 4 عيون)
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1" htmlFor="who-verifier">
                        المراجع المستقل (إلزامي لـ TIME_OUT وSIGN_OUT)
                      </label>
                      <select
                        id="who-verifier"
                        value={verifiedById}
                        onChange={(e) => setVerifiedById(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="">-- اختر عضو فريق مستقل --</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={siteMarked}
                        onChange={(e) => setSiteMarked(e.target.checked)}
                      />
                      تحديد موضع الجراحة
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={consentConfirmed}
                        onChange={(e) => setConsentConfirmed(e.target.checked)}
                      />
                      التحقق من الإقرار الطبي
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allergyChecked}
                        onChange={(e) => setAllergyChecked(e.target.checked)}
                      />
                      فحص الحساسية ومجرى الهواء
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={antibioticGiven}
                        onChange={(e) => setAntibioticGiven(e.target.checked)}
                      />
                      المضاد الحيوي الوقائي (&lt;60 د)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={imagingDisplayed}
                        onChange={(e) => setImagingDisplayed(e.target.checked)}
                      />
                      عرض صور الأشعة اللازمة
                    </label>
                  </div>

                  <input
                    type="text"
                    placeholder="ملاحظات المرحلة..."
                    value={whoNotes}
                    onChange={(e) => setWhoNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSignChecklist}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                    >
                      توقيع وإقفال مرحلة {phase}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "COUNT" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <select
                    aria-label="فئة الصنف"
                    value={countCategory}
                    onChange={(e) =>
                      setCountCategory(
                        e.target.value as
                          | "SPONGE"
                          | "SHARP"
                          | "INSTRUMENT"
                          | "NEEDLE"
                          | "OTHER",
                      )
                    }
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs"
                  >
                    <option value="SPONGE">شاش وفوط (SPONGE)</option>
                    <option value="NEEDLE">إبر جراحية (NEEDLE)</option>
                    <option value="SHARP">مشارط وحادة (SHARP)</option>
                    <option value="INSTRUMENT">آلات جراحية (INSTRUMENT)</option>
                  </select>
                  <input
                    type="text"
                    placeholder="اسم الصنف (مثال: شاش بطن 4x4)"
                    value={countItemName}
                    onChange={(e) => setCountItemName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs md:col-span-1"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="العدد الابتدائي"
                    value={initialCount}
                    onChange={(e) => setInitialCount(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleAddCountItem}
                    className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white"
                  >
                    + فتح بند عدّ
                  </button>
                </div>

                <div className="space-y-2">
                  {(summary?.countItems ?? []).map((item) => {
                    const expected = item.initialCount + item.addedCount;
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-slate-200">
                            [{item.category}] {item.itemName} — ابتدائي:{" "}
                            {item.initialCount} + مضاف: {item.addedCount} ={" "}
                            <span className="text-sky-300">
                              المتوقع {expected}
                            </span>
                            {item.finalCount !== null &&
                              ` | النهائي: ${item.finalCount}`}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold ${
                              item.status === "MATCHED"
                                ? "bg-emerald-950 text-emerald-300"
                                : item.status === "DISCREPANCY"
                                  ? "bg-rose-950 text-rose-300"
                                  : "bg-slate-800 text-amber-300"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>

                        {item.status === "OPEN" && (
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              min={0}
                              placeholder="العدد النهائي للتحقق المزدوج"
                              value={finalCountInputs[item.id] ?? ""}
                              onChange={(e) =>
                                setFinalCountInputs((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs w-48"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleVerifyCount(item.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                            >
                              تحقق مزدوج (Circulating Nurse)
                            </button>
                          </div>
                        )}

                        {item.status === "DISCREPANCY" && (
                          <div className="rounded-lg bg-rose-950/40 border border-rose-700/60 p-3 space-y-2">
                            <div className="text-rose-300 font-bold">
                              🚨 تباين في العدّ! يلزم إجراء أشعة مقطعية/متنقلة أو تصعيد حادثة SENTINEL
                            </div>
                            <input
                              type="text"
                              placeholder="توثيق نتيجة الأشعة أو الإجراء الفوري..."
                              value={resolveNotesInputs[item.id] ?? ""}
                              onChange={(e) =>
                                setResolveNotesInputs((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="w-full bg-slate-900 border border-rose-700 rounded-lg px-2.5 py-1.5 text-xs"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  handleResolveDiscrepancy(
                                    item.id,
                                    "RESOLVED_WITH_XRAY",
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
                              >
                                تسوية بأشعة سلبية
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  handleResolveDiscrepancy(
                                    item.id,
                                    "ESCALATED_INCIDENT",
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white"
                              >
                                تصعيد حادثة SENTINEL
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "ANESTHESIA" && (
              <div className="space-y-4">
                {anesthSigned && summary?.anesthesiaRecord && (
                  <div className="rounded-xl bg-emerald-950/40 border border-emerald-700/60 p-3 text-xs space-y-1">
                    <div className="font-bold text-emerald-300">
                      🔒 سجل التخدير موقّع ومقفل إلكترونيًا
                    </div>
                    <div className="font-mono text-[10px] text-emerald-400 break-all">
                      SHA-256: {summary.anesthesiaRecord.signatureHash}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1" htmlFor="anesth-asa">
                      تصنيف ASA
                    </label>
                    <select
                      id="anesth-asa"
                      disabled={anesthSigned}
                      value={asaClass}
                      onChange={(e) => setAsaClass(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                    >
                      <option value="ASA_1">ASA I</option>
                      <option value="ASA_2">ASA II</option>
                      <option value="ASA_3">ASA III</option>
                      <option value="ASA_4">ASA IV</option>
                      <option value="ASA_5">ASA V</option>
                      <option value="ASA_6">ASA VI</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1" htmlFor="anesth-type">
                      نوع التخدير
                    </label>
                    <select
                      id="anesth-type"
                      disabled={anesthSigned}
                      value={anesthesiaType}
                      onChange={(e) => setAnesthesiaType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                    >
                      <option value="GENERAL">تخدير عام (GENERAL)</option>
                      <option value="SPINAL">تخدير نصفي (SPINAL)</option>
                      <option value="EPIDURAL">فوق الجافية (EPIDURAL)</option>
                      <option value="COMBINED_SPINAL_EPIDURAL">مشترك (CSE)</option>
                      <option value="REGIONAL_BLOCK">موضعي/ناحي</option>
                      <option value="MAC_SEDATION">تهدئة (MAC)</option>
                      <option value="LOCAL">موضعي (LOCAL)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1" htmlFor="anesth-airway">
                      إدارة مجرى الهواء
                    </label>
                    <input
                      id="anesth-airway"
                      type="text"
                      disabled={anesthSigned}
                      value={airwayManagement}
                      onChange={(e) => setAirwayManagement(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1" htmlFor="anesth-fluids">
                      السوائل المعطاة (mL)
                    </label>
                    <input
                      id="anesth-fluids"
                      type="number"
                      min={0}
                      disabled={anesthSigned}
                      value={fluidsInMl}
                      onChange={(e) => setFluidsInMl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1" htmlFor="anesth-ebl">
                      فقدان الدم المقدّر EBL (mL)
                    </label>
                    <input
                      id="anesth-ebl"
                      type="number"
                      min={0}
                      disabled={anesthSigned}
                      value={eblMl}
                      onChange={(e) => setEblMl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1" htmlFor="anesth-aldrete">
                      درجة الإفاقة PACU Aldrete (0–10)
                    </label>
                    <input
                      id="anesth-aldrete"
                      type="number"
                      min={0}
                      max={10}
                      disabled={anesthSigned}
                      value={aldreteScore}
                      onChange={(e) => setAldreteScore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={anesthSigned}
                      checked={isEmergency}
                      onChange={(e) => setIsEmergency(e.target.checked)}
                    />
                    عملية طارئة (ASA-E)
                  </label>
                  <input
                    type="text"
                    disabled={anesthSigned}
                    placeholder="إخراج البول (mL)"
                    value={urineMl}
                    onChange={(e) => setUrineMl(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 w-36"
                  />
                </div>
                <textarea
                  rows={2}
                  disabled={anesthSigned}
                  placeholder="ملاحظات أو مضاعفات التخدير..."
                  value={complications}
                  onChange={(e) => setComplications(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs"
                />
                {!anesthSigned && (
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveAnesthesia(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium"
                    >
                      حفظ مسودة
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveAnesthesia(true)}
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-bold text-white"
                    >
                      توقيع وإقفال سجل التخدير
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
