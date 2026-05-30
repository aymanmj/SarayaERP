import { useState, useEffect } from "react";
import { apiClient } from "../../../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CryoTank, CryoCanister, CryoItem } from "../types";

type Props = {
  patientId: number;
  patientName: string;
};

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  FROZEN: { color: "text-cyan-400", bg: "bg-cyan-950/30 border-cyan-900/50" },
  THAWED: { color: "text-amber-400", bg: "bg-amber-950/30 border-amber-900/50" },
  DISCARDED: { color: "text-red-400", bg: "bg-red-950/30 border-red-900/50" },
  TRANSFERRED_OUT: { color: "text-slate-400", bg: "bg-slate-800 border-slate-700" },
};

const GOBLET_COLORS = ["Red", "Blue", "Green", "Yellow", "White", "Black", "Purple", "Orange"];

export default function CryoBankPanel({ patientId, patientName }: Props) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [tanks, setTanks] = useState<CryoTank[]>([]);
  const [patientItems, setPatientItems] = useState<CryoItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [showFreezeForm, setShowFreezeForm] = useState(false);
  const [showTankForm, setShowTankForm] = useState(false);
  const [showCanisterForm, setShowCanisterForm] = useState(false);

  // Tank form
  const [tankCode, setTankCode] = useState("");
  const [tankName, setTankName] = useState("");
  const [tankLocation, setTankLocation] = useState("");

  // Canister form
  const [canisterTankId, setCanisterTankId] = useState<number | null>(null);
  const [canisterCode, setCanisterCode] = useState("");

  // Freeze form
  const [freezeForm, setFreezeForm] = useState({
    canisterId: 0,
    itemType: "SPERM",
    caneCode: "",
    gobletColor: "",
    visotubeColor: "",
    strawCount: 1,
    description: "",
    freezeDate: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [tanksRes, itemsRes] = await Promise.all([
        apiClient.get("/obgyn/fertility/cryo/tanks"),
        apiClient.get(`/obgyn/fertility/cryo/patient/${patientId}`),
      ]);
      setTanks(tanksRes.data);
      setPatientItems(itemsRes.data);
    } catch {
      // no data yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString(i18n.language === "ar" ? "ar-LY" : "en-US") : "—";

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "FROZEN": return t("andrology.cryo.labels.frozen", "مجمد ❄️");
      case "THAWED": return t("andrology.cryo.labels.thawed", "تمت الإذابة 🌡️");
      case "DISCARDED": return t("andrology.cryo.labels.discarded", "تم الإتلاف 🗑️");
      case "TRANSFERRED_OUT": return t("andrology.cryo.labels.transferredOut", "نُقل ↗️");
      default: return status;
    }
  };

  const itemTypeLabels: Record<string, string> = {
    SPERM: t("andrology.cryo.labels.sperm", "حيوانات منوية (Sperm)"),
    OOCYTES: t("andrology.cryo.labels.oocytes", "بويضات (Oocytes)"),
    EMBRYO_D3: t("andrology.cryo.labels.embryoD3", "أجنة يوم 3 (Embryo D3)"),
    EMBRYO_D5: t("andrology.cryo.labels.embryoD5", "أجنة يوم 5 (Blastocyst)"),
    TESTICULAR_TISSUE: t("andrology.cryo.labels.testicularTissue", "نسيج خصية (Testicular Tissue)"),
  };

  // --- Create Tank ---
  const handleCreateTank = async () => {
    if (!tankCode || !tankName) return;
    try {
      await apiClient.post("/obgyn/fertility/cryo/tanks", { code: tankCode, name: tankName, location: tankLocation || undefined });
      toast.success(t("andrology.cryo.alerts.createTankSuccess", "تم إنشاء التانك بنجاح."));
      setShowTankForm(false);
      setTankCode(""); setTankName(""); setTankLocation("");
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t("andrology.cryo.alerts.createTankError", "فشل إنشاء التانك."));
    }
  };

  // --- Add Canister ---
  const handleAddCanister = async () => {
    if (!canisterTankId || !canisterCode) return;
    try {
      await apiClient.post("/obgyn/fertility/cryo/canisters", { tankId: canisterTankId, code: canisterCode });
      toast.success(t("andrology.cryo.alerts.addCanisterSuccess", "تم إضافة الحاوية بنجاح."));
      setShowCanisterForm(false);
      setCanisterCode(""); setCanisterTankId(null);
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t("andrology.cryo.alerts.addCanisterError", "فشل إضافة الحاوية."));
    }
  };

  // --- Freeze Item ---
  const handleFreeze = async () => {
    if (!freezeForm.canisterId) { toast.error(t("andrology.cryo.alerts.selectCanisterFirst", "اختر الحاوية أولاً.")); return; }
    try {
      await apiClient.post("/obgyn/fertility/cryo/items", { ...freezeForm, patientId });
      toast.success(t("andrology.cryo.alerts.freezeSuccess", "تم تجميد العينة بنجاح! ❄️"));
      setShowFreezeForm(false);
      setFreezeForm({ canisterId: 0, itemType: "SPERM", caneCode: "", gobletColor: "", visotubeColor: "", strawCount: 1, description: "", freezeDate: "" });
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t("andrology.cryo.alerts.freezeError", "فشل تجميد العينة."));
    }
  };

  // --- Thaw Item ---
  const handleThaw = async (itemId: number) => {
    if (!confirm(t("andrology.cryo.alerts.thawConfirm", "هل أنت متأكد من إذابة هذه العينة؟"))) return;
    try {
      await apiClient.patch(`/obgyn/fertility/cryo/items/${itemId}/thaw`, {});
      toast.success(t("andrology.cryo.alerts.thawSuccess", "تمت إذابة العينة بنجاح. 🌡️"));
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t("andrology.cryo.alerts.thawError", "فشل إذابة العينة."));
    }
  };

  // --- Discard Item ---
  const handleDiscard = async (itemId: number) => {
    if (!confirm(t("andrology.cryo.alerts.discardConfirm", "⚠️ هل أنت متأكد من إتلاف هذه العينة؟ هذا الإجراء لا يمكن التراجع عنه."))) return;
    try {
      await apiClient.patch(`/obgyn/fertility/cryo/items/${itemId}/discard`, {});
      toast.success(t("andrology.cryo.alerts.discardSuccess", "تم إتلاف العينة."));
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t("andrology.cryo.alerts.discardError", "فشل إتلاف العينة."));
    }
  };

  // Build canister flat list for dropdown
  const allCanisters: { id: number; label: string }[] = [];
  tanks.forEach(t => {
    t.canisters?.forEach(c => {
      allCanisters.push({ id: c.id, label: `${t.name} (${t.code}) → ${c.code}` });
    });
  });

  const frozenCount = patientItems.filter(i => i.status === "FROZEN").length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header Bar */}
      <div className="flex flex-wrap justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800 gap-3">
        <h3 className="text-base font-bold text-cyan-400 flex items-center gap-2">❄️<span className="mt-0.5">{t("andrology.cryo.title", "بنك التجميد (Cryopreservation Bank)")}</span></h3>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowTankForm(true)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-600">
            {t("andrology.cryo.btn.newTank", "🏗️ تانك جديد")}
          </button>
          <button onClick={() => setShowCanisterForm(true)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-600">
            {t("andrology.cryo.btn.newCanister", "📦 حاوية جديدة")}
          </button>
          <button onClick={() => setShowFreezeForm(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-cyan-900/50 transition-all">
            {t("andrology.cryo.btn.freezeItem", "❄️ تجميد عينة")}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center hover:border-cyan-800 transition-colors">
          <div className="text-3xl mb-2">🧊</div>
          <div className="text-2xl font-black text-cyan-400">{frozenCount}</div>
          <div className="text-xs text-slate-400 mt-1">{t("andrology.cryo.stats.frozenCount", "عينات مجمدة حالياً")}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center hover:border-slate-700 transition-colors">
          <div className="text-3xl mb-2">🌡️</div>
          <div className="text-2xl font-black text-amber-400">{patientItems.filter(i => i.status === "THAWED").length}</div>
          <div className="text-xs text-slate-400 mt-1">{t("andrology.cryo.stats.thawedCount", "تمت إذابتها")}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center hover:border-slate-700 transition-colors">
          <div className="text-3xl mb-2">🗄️</div>
          <div className="text-2xl font-black text-white">{tanks.length}</div>
          <div className="text-xs text-slate-400 mt-1">{t("andrology.cryo.stats.tanksCount", "تانكات نيتروجين")}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center hover:border-slate-700 transition-colors">
          <div className="text-3xl mb-2">📊</div>
          <div className="text-2xl font-black text-white">{patientItems.length}</div>
          <div className="text-xs text-slate-400 mt-1">{t("andrology.cryo.stats.totalCount", "إجمالي العينات")}</div>
        </div>
      </div>

      {/* Patient Cryo Items */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">{t("common.loading", "جارِ التحميل...")}</div>
      ) : patientItems.length === 0 ? (
        <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-3xl border border-slate-800/50 border-dashed">
          <p className="text-5xl mb-4 opacity-50">❄️</p>
          <p className="font-medium">{t("andrology.cryo.emptyState.title", "لا توجد عينات مجمدة لهذا المريض.")}</p>
          <p className="text-xs text-slate-600 mt-2">{t("andrology.cryo.emptyState.subtitle", "اضغط على \"تجميد عينة\" لتسجيل أول عينة.")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-300">{t("andrology.cryo.patientRecords", { defaultValue: "📋 سجل العينات المجمدة للمريض ({{name}})", name: patientName })}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {patientItems.map(item => {
              const statusInfo = STATUS_BADGE[item.status] || STATUS_BADGE.FROZEN;
              const isFrozen = item.status === "FROZEN";
              return (
                <div key={item.id} className={`bg-slate-900/60 border rounded-2xl p-5 relative overflow-hidden transition-all hover:shadow-lg ${isFrozen ? 'border-cyan-800/50 hover:border-cyan-600/60' : 'border-slate-700/60'}`}>
                  {/* Status indicator stripe */}
                  <div className={`absolute top-0 right-0 w-1.5 h-full ${isFrozen ? 'bg-cyan-500' : item.status === 'THAWED' ? 'bg-amber-500' : 'bg-red-500'} rounded-r-2xl`}></div>
                  
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h5 className="text-base font-bold text-white flex items-center gap-2">
                        {itemTypeLabels[item.itemType] || item.itemType}
                      </h5>
                      <span className={`inline-block mt-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusInfo.bg} ${statusInfo.color}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>{t("andrology.cryo.labels.freezeDate", "تجميد: ")}<span className="text-cyan-300 font-mono">{fmtDate(item.freezeDate)}</span></div>
                      {item.thawDate && <div className="mt-1">{t("andrology.cryo.labels.thawDate", "إذابة: ")}<span className="text-amber-300 font-mono">{fmtDate(item.thawDate)}</span></div>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    {item.canister?.tank && <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-md border border-slate-700">📍 {item.canister.tank.name} ({item.canister.tank.code})</span>}
                    {item.caneCode && <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-md border border-slate-700">Cane: {item.caneCode}</span>}
                    {item.gobletColor && <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-md border border-slate-700">Goblet: {item.gobletColor}</span>}
                    <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-md border border-slate-700">Straws: {item.strawCount}</span>
                  </div>

                  {item.description && <div className="mt-3 text-xs text-slate-400 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">{item.description}</div>}

                  {/* Action Buttons */}
                  {isFrozen && (
                    <div className="flex gap-2 mt-4 pt-3 border-t border-slate-800/50">
                      <button onClick={() => handleThaw(item.id)} className="bg-amber-600/80 hover:bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all">
                        {t("andrology.cryo.btn.thaw", "🌡️ إذابة")}
                      </button>
                      <button onClick={() => handleDiscard(item.id)} className="bg-red-900/50 hover:bg-red-800 text-red-300 hover:text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all border border-red-800/50">
                        {t("andrology.cryo.btn.discard", "🗑️ إتلاف")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tank Infrastructure Overview */}
      {tanks.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-300 mb-3">{t("andrology.cryo.labels.tanksOverview", "🗄️ البنية التحتية لبنك التجميد")}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tanks.map(tank => (
              <div key={tank.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors">
                <div className="flex justify-between items-center mb-3">
                  <h5 className="text-sm font-bold text-white flex items-center gap-2">🗄️ {tank.name}</h5>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-900/50">{tank.code}</span>
                </div>
                {tank.location && <div className="text-xs text-slate-400 mb-3">📍 {tank.location}</div>}
                <div className="space-y-2">
                  {tank.canisters?.length > 0 ? tank.canisters.map(c => (
                    <div key={c.id} className="bg-slate-950/80 p-2.5 rounded-xl flex justify-between items-center text-xs border border-slate-800/50">
                      <span className="text-slate-300 font-mono">📦 {c.code}</span>
                      <span className="text-slate-500">{t("andrology.cryo.labels.itemsCount", { defaultValue: "{{count}} عينة", count: c._count?.items ?? 0 })}</span>
                    </div>
                  )) : (
                    <div className="text-xs text-slate-600 text-center py-3 border border-dashed border-slate-800 rounded-xl">{t("andrology.cryo.labels.noCanisters", "لا توجد حاويات")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======== MODALS ======== */}

      {/* Freeze Form Modal */}
      {showFreezeForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-xl font-bold text-cyan-400 mb-6">{t("andrology.cryo.form.freezeTitle", "❄️ تجميد عينة جديدة")}</h3>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.itemType", "نوع العينة *")}</label>
                  <select value={freezeForm.itemType} onChange={e => setFreezeForm(p => ({ ...p, itemType: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500">
                    {Object.entries(itemTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.canister", "الحاوية (Tank → Canister) *")}</label>
                  <select value={freezeForm.canisterId} onChange={e => setFreezeForm(p => ({ ...p, canisterId: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500">
                    <option value={0}>{t("andrology.cryo.form.selectCanister", "— اختر الحاوية —")}</option>
                    {allCanisters.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.caneCode", "رمز العصا (Cane Code)")}</label><input type="text" value={freezeForm.caneCode} onChange={e => setFreezeForm(p => ({ ...p, caneCode: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.gobletColor", "لون الكأس (Goblet Color)")}</label>
                  <select value={freezeForm.gobletColor} onChange={e => setFreezeForm(p => ({ ...p, gobletColor: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500">
                    <option value="">{t("andrology.cryo.form.select", "— اختر —")}</option>
                    {GOBLET_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.visotubeColor", "لون الأنبوب (Visotube Color)")}</label><input type="text" value={freezeForm.visotubeColor} onChange={e => setFreezeForm(p => ({ ...p, visotubeColor: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
                <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.strawCount", "عدد الأنابيب (Straws)")}</label><input type="number" min={1} value={freezeForm.strawCount} onChange={e => setFreezeForm(p => ({ ...p, strawCount: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
                <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.freezeDate", "تاريخ التجميد")}</label><input type="date" value={freezeForm.freezeDate} onChange={e => setFreezeForm(p => ({ ...p, freezeDate: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
                <div className="md:col-span-2"><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.notes", "وصف / ملاحظات")}</label><textarea value={freezeForm.description} onChange={e => setFreezeForm(p => ({ ...p, description: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none h-[70px] focus:border-cyan-500" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowFreezeForm(false)} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">{t("common.cancel", "إلغاء")}</button>
              <button onClick={handleFreeze} disabled={!freezeForm.canisterId} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm">{t("andrology.cryo.btn.freeze", "❄️ تجميد")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tank Form Modal */}
      {showTankForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-lg font-bold text-white mb-4">{t("andrology.cryo.form.newTankTitle", "🏗️ إنشاء تانك نيتروجين جديد")}</h3>
            <div className="space-y-3 text-sm">
              <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.tankCode", "كود التانك *")}</label><input type="text" value={tankCode} onChange={e => setTankCode(e.target.value)} placeholder="مثال: LN2-001" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.tankName", "اسم التانك *")}</label><input type="text" value={tankName} onChange={e => setTankName(e.target.value)} placeholder="مثال: تانك رقم 1 - معمل IVF" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.tankLocation", "الموقع")}</label><input type="text" value={tankLocation} onChange={e => setTankLocation(e.target.value)} placeholder="معمل الأجنة - الطابق 2" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowTankForm(false)} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">{t("common.cancel", "إلغاء")}</button>
              <button onClick={handleCreateTank} disabled={!tankCode || !tankName} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm">{t("andrology.cryo.btn.save", "💾 حفظ")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Canister Form Modal */}
      {showCanisterForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-lg font-bold text-white mb-4">{t("andrology.cryo.form.newCanisterTitle", "📦 إضافة حاوية (Canister)")}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.tank", "التانك *")}</label>
                <select value={canisterTankId ?? ""} onChange={e => setCanisterTankId(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500">
                  <option value="">{t("andrology.cryo.form.selectTank", "— اختر التانك —")}</option>
                  {tanks.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>
              <div><label className="text-slate-400 text-xs mb-1 block">{t("andrology.cryo.form.canisterCode", "كود الحاوية *")}</label><input type="text" value={canisterCode} onChange={e => setCanisterCode(e.target.value)} placeholder="مثال: CAN-A1" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-cyan-500" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCanisterForm(false)} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">{t("common.cancel", "إلغاء")}</button>
              <button onClick={handleAddCanister} disabled={!canisterTankId || !canisterCode} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm">{t("andrology.cryo.btn.save", "💾 حفظ")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
