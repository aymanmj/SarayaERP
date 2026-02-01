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

export default function SurgeryCaseDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [surgery, setSurgery] = useState<SurgeryCaseDetails | null>(null);
  const [loading, setLoading] = useState(false);

  // Lists for dropdowns
  const [users, setUsers] = useState<UserLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  // Forms
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);

  const [selectedProduct, setSelectedProduct] = useState("");
  const [consumableQty, setConsumableQty] = useState(1);
  const [addingConsumable, setAddingConsumable] = useState(false);

  const loadCase = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SurgeryCaseDetails>(
        `/surgery/cases/${id}`
      );
      setSurgery(res.data);
    } catch {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    apiClient.get("/cashier/users").then((res) => setUsers(res.data));
    // نفترض وجود Endpoint لجلب منتجات مخزن العمليات (أو نجلب الكل ونفلتر)
    // هنا سنستخدم الكتالوج العام للتجربة، يفضل عمل Endpoint خاص لمخزون العمليات
    apiClient.get("/pharmacy/catalog").then((res) => setProducts(res.data));
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

  if (!surgery)
    return <div className="p-6 text-slate-400">جارِ التحميل...</div>;

  const isCompleted =
    surgery.status === "COMPLETED" || surgery.status === "CANCELLED";

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
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
        </div>

        <div className="flex gap-2 items-center">
          <span className="text-sm font-mono text-slate-500 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            {surgery.status}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Team Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            👨‍⚕️ الطاقم الطبي
          </h2>

          <div className="flex-1 overflow-y-auto mb-4 space-y-2">
            {surgery.team.map((t) => (
              <div
                key={t.id}
                className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800"
              >
                <span className="font-semibold text-slate-200">
                  {t.user.fullName}
                </span>
                <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
                  {t.role}
                </span>
              </div>
            ))}
          </div>

          {!isCompleted && (
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="flex flex-col gap-2">
                <select
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <option value="">اختر الموظف...</option>
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
                        {r}
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
    </div>
  );
}
