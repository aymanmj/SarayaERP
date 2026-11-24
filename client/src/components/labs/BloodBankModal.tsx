import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

interface BloodUnitRow {
  id: number;
  unitNumber: string;
  componentType: string;
  bloodGroup: string;
  volumeMl: number;
  donorReference: string | null;
  collectedAt: string;
  expiresAt: string;
  storageLocation: string | null;
  screeningStatus: string;
  status: string;
}

interface InventorySummary {
  totalUnits: number;
  availableUnits: number;
  expiringSoonUnits: number;
  expiredAvailableUnits: number;
  quarantinedUnits: number;
  crossmatchedUnits: number;
  issuedUnits: number;
}

interface CrossmatchRow {
  id: number;
  patientBloodGroup: string;
  antibodyScreen: string;
  crossmatchResult: string;
  status: string;
  validUntil: string;
  verifiedById: number | null;
  patient: { id: number; fullName: string; mrn: string };
  bloodUnit: {
    id: number;
    unitNumber: string;
    componentType: string;
    bloodGroup: string;
  };
}

interface TransfusionRow {
  id: number;
  status: string;
  bedsideVerifier1Id: number | null;
  bedsideVerifier2Id: number | null;
  hasReaction: boolean;
  reactionType: string | null;
  reactionSeverity: string | null;
  patient: { id: number; fullName: string; mrn: string };
  bloodUnit: {
    id: number;
    unitNumber: string;
    componentType: string;
    bloodGroup: string;
  };
  clinicalIncident: {
    id: number;
    incidentNumber: string;
    severity: string;
  } | null;
}

interface BloodBankModalProps {
  open: boolean;
  onClose: () => void;
}

const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"] as const;

const COMPONENT_LABELS: Record<string, string> = {
  PRBC: "كريات دم حمراء مكدّسة (PRBC)",
  WHOLE_BLOOD: "دم كامل",
  FFP: "بلازما طازجة مجمدة (FFP)",
  PLATELETS: "صفائح دموية",
  CRYOPRECIPITATE: "راسب قري",
};

export function BloodBankModal({ open, onClose }: BloodBankModalProps) {
  const [activeTab, setActiveTab] = useState<
    "inventory" | "crossmatch" | "transfusion"
  >("inventory");
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [units, setUnits] = useState<BloodUnitRow[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [crossmatches, setCrossmatches] = useState<CrossmatchRow[]>([]);
  const [transfusions, setTransfusions] = useState<TransfusionRow[]>([]);

  // Register Unit form
  const [unitNumber, setUnitNumber] = useState("");
  const [componentType, setComponentType] = useState("PRBC");
  const [bloodGroup, setBloodGroup] = useState("O-");
  const [volumeMl, setVolumeMl] = useState(350);
  const [collectedDate, setCollectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [expiryDate, setExpiryDate] = useState(() =>
    new Date(Date.now() + 35 * 86_400_000).toISOString().slice(0, 10),
  );
  const [storageLocation, setStorageLocation] = useState("FRIDGE-A1 (2-6°C)");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, cmRes, trRes] = await Promise.all([
        apiClient.get<{ units: BloodUnitRow[]; summary: InventorySummary }>(
          "/blood-bank/inventory",
        ),
        apiClient.get<CrossmatchRow[]>("/blood-bank/crossmatches"),
        apiClient.get<TransfusionRow[]>("/blood-bank/transfusions"),
      ]);
      setUnits(invRes.data?.units || []);
      setSummary(invRes.data?.summary || null);
      setCrossmatches(cmRes.data || []);
      setTransfusions(trRes.data || []);
    } catch {
      toast.error("تعذر تحميل بيانات بنك الدم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadData();
    }
  }, [open, loadData]);

  if (!open) return null;

  const handleRegisterUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction("register-unit");
    try {
      await apiClient.post("/blood-bank/units", {
        unitNumber: unitNumber.trim().toUpperCase(),
        componentType,
        bloodGroup,
        volumeMl: Number(volumeMl),
        collectedAt: `${collectedDate}T08:00:00.000Z`,
        expiresAt: `${expiryDate}T23:59:59.000Z`,
        storageLocation: storageLocation.trim() || undefined,
      });
      toast.success("تم تسجيل وحدة الدم تحت الحجر لحين إتمام الفحص المصلي");
      setUnitNumber("");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر تسجيل وحدة الدم";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleScreenClear = async (unitId: number) => {
    setBusyAction(`screen-${unitId}`);
    try {
      await apiClient.post(`/blood-bank/units/${unitId}/screen`, {
        screeningStatus: "CLEARED",
        screeningNotes: "سلبية الفحوصات المصلية (HBV/HCV/HIV/Syphilis)",
      });
      toast.success("تمت إجازة وحدة الدم وإتاحتها للصرف");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر اعتماد الفحص المصلي";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleVerifyCrossmatch = async (cmId: number) => {
    setBusyAction(`verify-cm-${cmId}`);
    try {
      await apiClient.post(`/blood-bank/crossmatches/${cmId}/verify`);
      toast.success("تم اعتماد فحص التوافق برقابة 4 عيون");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر اعتماد فحص التوافق";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleIssueUnit = async (cmId: number) => {
    setBusyAction(`issue-cm-${cmId}`);
    try {
      await apiClient.post(`/blood-bank/crossmatches/${cmId}/issue`);
      toast.success("تم صرف وحدة الدم إلى القسم؛ يلزم التحقق المزدوج بجانب السرير");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر صرف وحدة الدم";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartTransfusion = async (trId: number) => {
    setBusyAction(`start-tr-${trId}`);
    try {
      await apiClient.post(`/blood-bank/transfusions/${trId}/start`);
      toast.success("تم بدء نقل الدم بعد اكتمال التحقق المزدوج");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر بدء نقل الدم";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      dir="rtl"
      role="dialog"
      aria-label="بنك الدم وسلامة نقل الدم"
    >
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl border border-rose-900/50 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-white">
              بنك الدم وسلامة نقل الدم واليقظة الدموية (CAP04)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              مخزون الفصائل (ABO/Rh)، الفحص المصلي، فحص التوافق (4 عيون)، والتحقق المزدوج بجانب السرير وتصعيد تفاعلات النقل
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("inventory")}
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                activeTab === "inventory"
                  ? "bg-rose-700 border-rose-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              المخزون ({units.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("crossmatch")}
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                activeTab === "crossmatch"
                  ? "bg-sky-700 border-sky-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              التوافق ({crossmatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transfusion")}
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                activeTab === "transfusion"
                  ? "bg-emerald-700 border-emerald-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              نقل الدم واليقظة ({transfusions.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
            >
              إغلاق
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-3">
              <div className="text-slate-400">وحدات متاحة</div>
              <div className="text-2xl font-black text-emerald-400">
                {summary.availableUnits}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-3">
              <div className="text-slate-400">قارب انتهاؤها</div>
              <div className="text-2xl font-black text-amber-400">
                {summary.expiringSoonUnits}
              </div>
            </div>
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-3">
              <div className="text-slate-400">تحت الحجر المصلي/تفاعل</div>
              <div className="text-2xl font-black text-rose-400">
                {summary.quarantinedUnits}
              </div>
            </div>
            <div className="rounded-2xl border border-sky-500/30 bg-sky-950/30 p-3">
              <div className="text-slate-400">محجوزة بالتوافق</div>
              <div className="text-2xl font-black text-sky-400">
                {summary.crossmatchedUnits}
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-3">
              <div className="text-slate-400">مصروفة للأقسام</div>
              <div className="text-2xl font-black text-indigo-400">
                {summary.issuedUnits}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-6 text-sm text-slate-400">
            جاري تحميل بيانات بنك الدم...
          </div>
        )}

        {!loading && activeTab === "inventory" && (
          <div className="space-y-5">
            <form
              onSubmit={handleRegisterUnit}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs"
            >
              <input
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="رقم/باركود الوحدة (ISBT-128)"
                required
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <select
                value={componentType}
                onChange={(e) => setComponentType(e.target.value)}
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              >
                {Object.entries(COMPONENT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono font-bold"
              >
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={10}
                max={2000}
                value={volumeMl}
                onChange={(e) => setVolumeMl(Number(e.target.value))}
                placeholder="الحجم (مل)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
              />
              <input
                type="date"
                value={collectedDate}
                onChange={(e) => setCollectedDate(e.target.value)}
                title="تاريخ السحب"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                title="تاريخ الانتهاء"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
              <input
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="موقع الحفظ (ثلاجة)"
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
              />
              <button
                type="submit"
                disabled={busyAction === "register-unit"}
                className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold"
              >
                + استلام وحدة دم جديدة
              </button>
            </form>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-3">رقم الوحدة</th>
                    <th className="p-3">المكوّن</th>
                    <th className="p-3">الفصيلة</th>
                    <th className="p-3">الحجم</th>
                    <th className="p-3">الانتهاء</th>
                    <th className="p-3">الفحص المصلي</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {units.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/50">
                      <td className="p-3 font-mono font-bold text-white">
                        {u.unitNumber}
                      </td>
                      <td className="p-3">
                        {COMPONENT_LABELS[u.componentType] || u.componentType}
                      </td>
                      <td className="p-3 font-mono font-black text-rose-400">
                        {u.bloodGroup}
                      </td>
                      <td className="p-3 font-mono">{u.volumeMl} ml</td>
                      <td className="p-3 font-mono">
                        {u.expiresAt.slice(0, 10)}
                      </td>
                      <td className="p-3">{u.screeningStatus}</td>
                      <td className="p-3">{u.status}</td>
                      <td className="p-3">
                        {u.status === "QUARANTINED" &&
                          u.screeningStatus === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => handleScreenClear(u.id)}
                              disabled={busyAction === `screen-${u.id}`}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                            >
                              إجازة الفحص المصلي
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                  {units.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        لا توجد وحدات دم مسجلة في المخزون بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === "crossmatch" && (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-3">المريض</th>
                  <th className="p-3">فصيلة المريض</th>
                  <th className="p-3">الوحدة / الفصيلة</th>
                  <th className="p-3">النتيجة</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {crossmatches.map((cm) => (
                  <tr key={cm.id}>
                    <td className="p-3 font-bold text-white">
                      {cm.patient.fullName} ({cm.patient.mrn})
                    </td>
                    <td className="p-3 font-mono text-rose-300">
                      {cm.patientBloodGroup}
                    </td>
                    <td className="p-3 font-mono">
                      {cm.bloodUnit.unitNumber} ({cm.bloodUnit.bloodGroup})
                    </td>
                    <td className="p-3 text-emerald-400">
                      {cm.crossmatchResult}
                    </td>
                    <td className="p-3">{cm.status}</td>
                    <td className="p-3 flex gap-2">
                      {cm.status === "ACTIVE" && !cm.verifiedById && (
                        <button
                          type="button"
                          onClick={() => handleVerifyCrossmatch(cm.id)}
                          disabled={busyAction === `verify-cm-${cm.id}`}
                          className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold"
                        >
                          اعتماد التوافق (4 عيون)
                        </button>
                      )}
                      {cm.status === "ACTIVE" && cm.verifiedById && (
                        <button
                          type="button"
                          onClick={() => handleIssueUnit(cm.id)}
                          disabled={busyAction === `issue-cm-${cm.id}`}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                          صرف للقسم
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {crossmatches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      لا توجد فحوصات توافق مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === "transfusion" && (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-3">المريض</th>
                  <th className="p-3">الوحدة</th>
                  <th className="p-3">التحقق المزدوج بجانب السرير</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">اليقظة الدموية</th>
                  <th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transfusions.map((tr) => (
                  <tr key={tr.id}>
                    <td className="p-3 font-bold text-white">
                      {tr.patient.fullName} ({tr.patient.mrn})
                    </td>
                    <td className="p-3 font-mono">
                      {tr.bloodUnit.unitNumber} ({tr.bloodUnit.bloodGroup})
                    </td>
                    <td className="p-3">
                      {tr.bedsideVerifier1Id && tr.bedsideVerifier2Id
                        ? "مكتمل (2 ممرضين + باركود)"
                        : tr.bedsideVerifier1Id
                          ? "التحقق الأول مكتمل — بانتظار الممرض الثاني"
                          : "بانتظار التحقق المزدوج"}
                    </td>
                    <td className="p-3">{tr.status}</td>
                    <td className="p-3">
                      {tr.hasReaction ? (
                        <span className="px-2 py-0.5 rounded-lg bg-rose-950/70 text-rose-300 border border-rose-500/50">
                          تفاعل ({tr.reactionSeverity}) — حادثة{" "}
                          {tr.clinicalIncident?.incidentNumber || "مسجلة"}
                        </span>
                      ) : (
                        <span className="text-slate-400">لا توجد تفاعلات</span>
                      )}
                    </td>
                    <td className="p-3">
                      {tr.status === "VERIFIED_BEDSIDE" && (
                        <button
                          type="button"
                          onClick={() => handleStartTransfusion(tr.id)}
                          disabled={busyAction === `start-tr-${tr.id}`}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                          بدء نقل الدم
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {transfusions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      لا توجد عمليات نقل دم مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
