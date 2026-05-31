import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";

type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE"
  | "CONTRA_ASSET"
  | "CONTRA_REVENUE";

type AccountRow = {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  parentId: number | null;
  isActive: boolean;
  createdAt: string;
};

function formatType(type: AccountType, t: any) {
  switch (type) {
    case "ASSET":
      return t("accounting.chartOfAccounts.origins", "أصول");
    case "LIABILITY":
      return t("accounting.chartOfAccounts.commitments", "التزامات");
    case "EQUITY":
      return t("accounting.chartOfAccounts.ownershipRights", "حقوق ملكية");
    case "REVENUE":
      return t("accounting.chartOfAccounts.revenue", "إيرادات");
    case "EXPENSE":
      return t("accounting.chartOfAccounts.expenses", "مصروفات");
    case "CONTRA_ASSET":
      return t("accounting.chartOfAccounts.negativeAssets", "أصول سالبة");
    case "CONTRA_REVENUE":
      return t("accounting.chartOfAccounts.revenueDeductions", "خصومات إيرادات");
    default:
      return type;
  }
}

export default function ChartOfAccountsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();

  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // نموذج إنشاء/تعديل
  const [editId, setEditId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("ASSET");
  const [parentId, setParentId] = useState<number | "">("");

  const [saving, setSaving] = useState(false);

  const parentOptions = useMemo(() => rows.filter((r) => r.isActive), [rows]);

  const resetForm = () => {
    setEditId(null);
    setCode("");
    setName("");
    setType("ASSET");
    setParentId("");
  };

  const startEdit = (acc: AccountRow) => {
    setEditId(acc.id);
    setCode(acc.code);
    setName(acc.name);
    setType(acc.type);
    setParentId(acc.parentId ?? "");
  };

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<AccountRow[]>("/accounting/accounts");
      setRows(res.data);
     
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        "حدث خطأ أثناء تحميل دليل الحسابات.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("الرجاء إدخال كود الحساب واسم الحساب.");
      return;
    }

    const payload = {
      code: code.trim(),
      name: name.trim(),
      type,
      parentId: parentId === "" ? undefined : Number(parentId),
    };

    try {
      setSaving(true);
      setError(null);
      if (editId) {
        await apiClient.patch(`/accounting/accounts/${editId}`, payload);
      } else {
        await apiClient.post("/accounting/accounts", payload);
      }
      await loadAccounts();
      resetForm();
     
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        "حدث خطأ أثناء حفظ الحساب.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: number) => {
    try {
      setError(null);
      await apiClient.patch(`/accounting/accounts/${id}/toggle-active`);
      await loadAccounts();
     
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        "تعذر تغيير حالة الحساب.";
      setError(msg);
    }
  };

  const getParentName = (parentId: number | null) => {
    if (!parentId) return "—";
    const p = rows.find((r) => r.id === parentId);
    if (!p) return "—";
    return `${p.code} — ${p.name}`;
  };

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-100 text-xs"
          >
            {isRtl ? "← رجوع" : "← Back"}
          </button>
          <div>
            <h1 className="text-2xl font-bold mb-1">{t("accounting.chartOfAccounts.chartOfAccounts", "دليل الحسابات")}</h1>
            <p className="text-sm text-slate-400">
              {t("accounting.chartOfAccounts.chartOfAccountsDesc", "إدارة الحسابات المحاسبية (إضافة / تعديل / تفعيل / تعطيل).")}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-950/40 border border-rose-700/60 rounded-xl px-4 py-2">
          {error}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 flex flex-wrap items-end gap-4 text-sm"
      >
        <div className="flex flex-col gap-1 w-32">
          <label className="text-xs text-slate-400">{t("accounting.chartOfAccounts.accountCode", "كود الحساب")}</label>
          <input
            className="bg-slate-900/70 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs text-slate-400">{t("accounting.chartOfAccounts.accountName", "اسم الحساب")}</label>
          <input
            className="bg-slate-900/70 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs text-slate-400">{t("accounting.chartOfAccounts.accountType", "نوع الحساب")}</label>
          <select
            className="bg-slate-900/70 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            <option value="ASSET">{t("accounting.chartOfAccounts.origins", "أصول")}</option>
            <option value="LIABILITY">{t("accounting.chartOfAccounts.commitments", "التزامات")}</option>
            <option value="EQUITY">{t("accounting.chartOfAccounts.ownershipRights", "حقوق ملكية")}</option>
            <option value="REVENUE">{t("accounting.chartOfAccounts.revenue", "إيرادات")}</option>
            <option value="EXPENSE">{t("accounting.chartOfAccounts.expenses", "مصروفات")}</option>
            <option value="CONTRA_ASSET">{t("accounting.chartOfAccounts.negativeAssets", "أصول سالبة")}</option>
            <option value="CONTRA_REVENUE">{t("accounting.chartOfAccounts.revenueDeductions", "خصومات إيرادات")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 w-64">
          <label className="text-xs text-slate-400">
            {t("accounting.chartOfAccounts.fathersAccountOptional", "الحساب الأب (اختياري)")}
          </label>
          <select
            className="bg-slate-900/70 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs"
            value={parentId}
            onChange={(e) =>
              setParentId(e.target.value === "" ? "" : Number(e.target.value))
            }
          >
            <option value="">{t("accounting.chartOfAccounts.withoutAFather", "— بدون أب —")}</option>
            {parentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-xs"
            >
              {t("accounting.chartOfAccounts.cancelEdit", "إلغاء التعديل")}
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs text-white disabled:opacity-50"
          >
            {saving
              ? t("accounting.chartOfAccounts.saving", "جارٍ الحفظ...")
              : editId
              ? t("accounting.chartOfAccounts.editAccount", "تعديل الحساب")
              : t("accounting.chartOfAccounts.addAccount", "إضافة الحساب")}
          </button>
        </div>
      </form>

      {/* جدول الحسابات */}
      <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 flex-1 flex flex-col">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          {t("accounting.chartOfAccounts.accountsList", "قائمة الحسابات")}
        </h2>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            {t("accounting.chartOfAccounts.loadingAccounts", "جارِ تحميل الحسابات...")}
          </div>
        ) : (
          <div className="overflow-x-auto text-xs flex-1">
            <table className="min-w-full text-right">
              <thead className="text-[11px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2">{t("accounting.chartOfAccounts.code", "كود")}</th>
                  <th className="py-2 px-2">{t("accounting.chartOfAccounts.accountName", "اسم الحساب")}</th>
                  <th className="py-2 px-2">{t("accounting.chartOfAccounts.type", "النوع")}</th>
                  <th className="py-2 px-2">{t("accounting.chartOfAccounts.fathersAccount", "الحساب الأب")}</th>
                  <th className="py-2 px-2">{t("accounting.chartOfAccounts.theCondition", "الحالة")}</th>
                  <th className="py-2 px-2 w-32">{t("accounting.chartOfAccounts.procedures", "إجراءات")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      {t("accounting.chartOfAccounts.noAccountsYet", "لا توجد حسابات بعد.")}
                    </td>
                  </tr>
                )}

                {rows.map((acc) => (
                  <tr
                    key={acc.id}
                    className="border-b border-slate-900/80 hover:bg-slate-900/60"
                  >
                    <td className="py-2 px-2 text-sky-300">{acc.code}</td>
                    <td className="py-2 px-2 text-slate-100">{acc.name}</td>
                    <td className="py-2 px-2 text-slate-200">
                      {formatType(acc.type, t)}
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      {getParentName(acc.parentId)}
                    </td>
                    <td className="py-2 px-2">
                      {acc.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                          {t("accounting.chartOfAccounts.active", "مفعل")}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-700/40 text-slate-300 border border-slate-600/50">
                          {t("accounting.chartOfAccounts.inactive", "معطل")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(acc)}
                          className="px-2 py-1 rounded-full bg-sky-600/80 hover:bg-sky-500 text-[11px]"
                        >
                          {t("accounting.chartOfAccounts.edit", "تعديل")}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(acc.id)}
                          className="px-2 py-1 rounded-full bg-slate-700/80 hover:bg-slate-600 text-[11px]"
                        >
                          {acc.isActive ? t("accounting.chartOfAccounts.disable", "تعطيل") : t("accounting.chartOfAccounts.activation", "تفعيل")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
