// src/pages/SurgeryCaseDetailsPage.tsx

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type SurgeryStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "RECOVERY"
  | "COMPLETED"
  | "CANCELLED";

type SurgeryCaseDetails = {
  id: number;
  surgeryName: string;
  status: SurgeryStatus;
  scheduledStart: string;
  actualStart?: string;
  actualEnd?: string;
  surgeonNotes?: string;
  anesthesiaNotes?: string;
  preOpDiagnosis?: string;
  postOpDiagnosis?: string;
  encounter: { patient: { fullName: string; mrn: string } };
  theatre: { name: string };
  team: { id: number; role: string; user: { fullName: string } }[];
  consumables: {
    id: number;
    quantity: string;
    product: { name: string };
    totalPrice: string;
  }[];
};

type UserLite = { id: number; fullName: string };
type ProductLite = { id: number; name: string; stockOnHand: string };

const ROLES = [
  "SURGEON",
  "ASSISTANT_SURGEON",
  "ANESTHETIST",
  "SCRUB_NURSE",
  "CIRCULATING_NURSE",
  "TECHNICIAN",
];

const ROLE_LABELS: Record<string, string> = {
  SURGEON: "جراح رئيسي",
  ASSISTANT_SURGEON: "مساعد جراح",
  ANESTHETIST: "طبيب تخدير",
  TECHNICIAN: "فني تخدير / عمليات",
  SCRUB_NURSE: "ممرضة تعقيم",
  CIRCULATING_NURSE: "ممرضة متجولة",
};

export default function SurgeryCaseDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [surgery, setSurgery] = useState<SurgeryCaseDetails | null>(null);
  const [loading, setLoading] = useState(false);

  // Lists for dropdowns
  const [users, setUsers] = useState<UserLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  // Team form
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);

  // Consumables form
  const [selectedProduct, setSelectedProduct] = useState("");
  const [consumableQty, setConsumableQty] = useState(1);
  const [addingConsumable, setAddingConsumable] = useState(false);

  // Surgical Notes form
  const [surgeonNotes, setSurgeonNotes] = useState("");
  const [anesthesiaNotes, setAnesthesiaNotes] = useState("");
  const [preOpDiagnosis, setPreOpDiagnosis] = useState("");
  const [postOpDiagnosis, setPostOpDiagnosis] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const loadCase = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SurgeryCaseDetails>(
        `/surgery/cases/${id}`
      );
      setSurgery(res.data);
      // Populate notes from server
      setSurgeonNotes(res.data.surgeonNotes || "");
      setAnesthesiaNotes(res.data.anesthesiaNotes || "");
      setPreOpDiagnosis(res.data.preOpDiagnosis || "");
      setPostOpDiagnosis(res.data.postOpDiagnosis || "");
    } catch {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    try {
      const res = await apiClient.get("/users/doctors-list");
      setUsers(res.data);
    } catch (e) {
      console.error("Failed to load users", e);
    }
    try {
      const res = await apiClient.get("/pharmacy/catalog");
      setProducts(res.data);
    } catch (e) {
      console.error("Failed to load products", e);
    }
  };

  useEffect(() => {
    loadCase();
    loadLists();
  }, [id]);

  // Actions
  const updateStatus = async (status: SurgeryStatus) => {
    if (!confirm(`هل أنت متأكد من تغيير الحالة إلى ${status}؟`)) return;
    try {
      await apiClient.post(`/surgery/cases/${id}/status`, { status });
      toast.success("تم تحديث الحالة");
      loadCase();
    } catch {
      toast.error("فشل التحديث");
    }
  };

  const addTeamMember = async () => {
    if (!selectedUser) return;
    try {
      await apiClient.post(`/surgery/cases/${id}/team`, {
        userId: selectedUser,
        role: selectedRole,
      });
      toast.success("تم إضافة العضو");
      loadCase();
    } catch {
      toast.error("فشل الإضافة");
    }
  };

  const addConsumable = async () => {
    if (!selectedProduct || consumableQty <= 0) return;
    setAddingConsumable(true);
    try {
      await apiClient.post(`/surgery/cases/${id}/consumables`, {
        productId: selectedProduct,
        quantity: consumableQty,
      });
      toast.success("تم صرف المستهلك وإضافته للفاتورة");
      loadCase();
      setConsumableQty(1);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "فشل الصرف (تحقق من رصيد مخزن العمليات)"
      );
    } finally {
      setAddingConsumable(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await apiClient.post(`/surgery/cases/${id}/notes`, {
        surgeonNotes,
        anesthesiaNotes,
        preOpDiagnosis,
        postOpDiagnosis,
      });
      toast.success("تم حفظ التقرير بنجاح");
      loadCase();
    } catch {
      toast.error("فشل حفظ التقرير");
    } finally {
      setSavingNotes(false);
    }
  };

  if (!surgery)
    return <div className="p-6 text-slate-400">جارِ التحميل...</div>;

  const isCompleted =
    surgery.status === "COMPLETED" || surgery.status === "CANCELLED";

  const formatDate = (iso?: string) => {
    if (!iso) return "--";
    return new Date(iso).toLocaleString("ar-LY", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6 overflow-auto"
      dir="rtl"
    >
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button
            onClick={() => navigate("/surgery")}
            className="text-xs text-slate-400 hover:text-white mb-2"
          >
            ➜ العودة للجدول
          </button>
          <h1 className="text-2xl font-bold text-white">
            {surgery.surgeryName}
          </h1>
          <div className="text-sm text-slate-400 mt-1">
            المريض:{" "}
            <span className="text-slate-200 font-semibold">
              {surgery.encounter.patient.fullName}
            </span>{" "}
            | الغرفة:{" "}
            <span className="text-sky-400">{surgery.theatre.name}</span>
          </div>
          {/* Timestamps */}
          {surgery.actualStart && (
            <div className="text-xs text-slate-500 mt-2 space-y-1">
              <div>⏱️ بداية العملية: <span className="text-emerald-400 font-mono">{formatDate(surgery.actualStart)}</span></div>
              {surgery.actualEnd && (
                <div>⏱️ نهاية العملية: <span className="text-rose-400 font-mono">{formatDate(surgery.actualEnd)}</span></div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm font-mono text-slate-500 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            {surgery.status === "SCHEDULED" && "مجدولة"}
            {surgery.status === "IN_PROGRESS" && "جارية الآن"}
            {surgery.status === "COMPLETED" && "مكتملة ✅"}
            {surgery.status === "CANCELLED" && "ملغاة"}
            {surgery.status === "RECOVERY" && "في الإفاقة"}
          </span>

          {surgery.status === "SCHEDULED" && (
            <button
              onClick={() => updateStatus("IN_PROGRESS")}
              className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20"
            >
              بدء العملية ▶
            </button>
          )}
          {surgery.status === "IN_PROGRESS" && (
            <button
              onClick={() => updateStatus("COMPLETED")}
              className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-500/20 animate-pulse"
            >
              إنهاء العملية ■
            </button>
          )}
        </div>
      </div>

      {/* Post-Op Hint */}
      {isCompleted && surgery.status === "COMPLETED" && (
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div className="flex-1">
            <p className="text-emerald-300 font-bold text-sm">تم إنهاء العملية بنجاح</p>
            <p className="text-emerald-400/80 text-xs mt-1">
              يُرجى كتابة التقرير الجراحي أدناه ثم نقل المريض إلى غرفة الإفاقة أو قسم الإيواء المناسب.
            </p>
          </div>
          <button
            onClick={() => navigate("/inpatient/active")}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm"
          >
            إدارة الإيواء
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            👨‍⚕️ الطاقم الطبي
          </h2>

          <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1">
            {/* Surgical Team */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider bg-sky-950/30 p-2 rounded border border-sky-900/50">
                فريق الجراحة - Surgical Team
              </h3>
              {surgery.team
                .filter((t) =>
                  ["SURGEON", "ASSISTANT_SURGEON"].includes(t.role)
                )
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                  >
                    <span className="font-semibold text-slate-200">
                      {t.user.fullName}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {ROLE_LABELS[t.role] || t.role}
                    </span>
                  </div>
                ))}
              {surgery.team.filter((t) =>
                ["SURGEON", "ASSISTANT_SURGEON"].includes(t.role)
              ).length === 0 && (
                <div className="text-xs text-slate-600 italic px-2">
                  -- لا يوجد --
                </div>
              )}
            </div>

            {/* Anesthesia Team */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider bg-amber-950/30 p-2 rounded border border-amber-900/50">
                فريق التخدير - Anesthesia Team
              </h3>
              {surgery.team
                .filter((t) => ["ANESTHETIST", "TECHNICIAN"].includes(t.role))
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                  >
                    <span className="font-semibold text-slate-200">
                      {t.user.fullName}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {ROLE_LABELS[t.role] || t.role}
                    </span>
                  </div>
                ))}
            </div>

            {/* Nursing Team */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider bg-emerald-950/30 p-2 rounded border border-emerald-900/50">
                فريق التمريض - Nursing Team
              </h3>
              {surgery.team
                .filter((t) =>
                  ["SCRUB_NURSE", "CIRCULATING_NURSE"].includes(t.role)
                )
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                  >
                    <span className="font-semibold text-slate-200">
                      {t.user.fullName}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {ROLE_LABELS[t.role] || t.role}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Add Team Member — with clear label */}
          {!isCompleted && (
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 mb-2">➕ إضافة عضو للطاقم الطبي</h3>
              <div className="flex flex-col gap-2">
                <select
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <option value="">اختر الطبيب / الممرض...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addTeamMember}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm"
                  >
                    إضافة
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Consumables Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            💉 المستهلكات والأدوية
          </h2>

          <div className="flex-1 overflow-y-auto mb-4">
            <table className="w-full text-sm text-right">
              <thead className="text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="pb-2">الصنف</th>
                  <th className="pb-2">الكمية</th>
                  <th className="pb-2">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {surgery.consumables.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/50">
                    <td className="py-2 text-slate-200">{c.product.name}</td>
                    <td className="py-2 font-mono text-sky-400">
                      {Number(c.quantity).toFixed(2)}
                    </td>
                    <td className="py-2 font-mono text-emerald-400">
                      {Number(c.totalPrice).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isCompleted && (
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="flex flex-col gap-2">
                <select
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  <option value="">اختر المستهلك / الدواء...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-center"
                    value={consumableQty}
                    onChange={(e) => setConsumableQty(Number(e.target.value))}
                  />
                  <button
                    onClick={addConsumable}
                    disabled={addingConsumable}
                    className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {addingConsumable ? "جارِ الصرف..." : "صرف واستهلاك"}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  * سيتم خصم الكمية من مخزون العمليات وإضافتها لفاتورة المريض
                  فوراً.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────── */}
      {/* Surgical Report / Notes Section                  */}
      {/* ──────────────────────────────────────────────── */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-5">
        <h2 className="text-lg font-bold flex items-center gap-2">
          📋 تقرير العملية الجراحية (Operative Note)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pre-Op Diagnosis */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">التشخيص قبل العملية (Pre-Op Diagnosis)</label>
            <textarea
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[80px] resize-y"
              placeholder="مثال: التهاب الزائدة الدودية الحاد..."
              value={preOpDiagnosis}
              onChange={(e) => setPreOpDiagnosis(e.target.value)}
              readOnly={isCompleted && !!surgery.preOpDiagnosis}
            />
          </div>
          {/* Post-Op Diagnosis */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">التشخيص بعد العملية (Post-Op Diagnosis)</label>
            <textarea
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[80px] resize-y"
              placeholder="مثال: استئصال الزائدة الدودية — بدون مضاعفات..."
              value={postOpDiagnosis}
              onChange={(e) => setPostOpDiagnosis(e.target.value)}
            />
          </div>
        </div>

        {/* Surgeon Notes */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">ملاحظات الجراح (Surgeon Notes)</label>
          <textarea
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[120px] resize-y"
            placeholder="وصف تفصيلي لمجريات العملية، الإجراءات المتخذة، والملاحظات..."
            value={surgeonNotes}
            onChange={(e) => setSurgeonNotes(e.target.value)}
          />
        </div>

        {/* Anesthesia Notes */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">ملاحظات التخدير (Anesthesia Notes)</label>
          <textarea
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[80px] resize-y"
            placeholder="نوع التخدير، الجرعة، ملاحظات خاصة..."
            value={anesthesiaNotes}
            onChange={(e) => setAnesthesiaNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50"
          >
            {savingNotes ? "جارِ الحفظ..." : "💾 حفظ التقرير"}
          </button>
        </div>
      </div>
    </div>
  );
}
