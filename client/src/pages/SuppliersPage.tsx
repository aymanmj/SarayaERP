// src/pages/SuppliersPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Supplier = {
  id: number;
  name: string;
  code?: string | null;
  taxNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export default function SuppliersPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Supplier[]>("/suppliers");
      setSuppliers(res.data);
    } catch (err: any) {
      console.error(err);
      toast.error(t("inventory.suppliers.toast.loadError", "حدث خطأ أثناء تحميل الموردين."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning(t("inventory.suppliers.toast.nameRequired", "اسم المورد مطلوب."));
      return;
    }
    try {
      await apiClient.post("/suppliers", {
        name,
        code: code || undefined,
        taxNumber: taxNumber || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        notes: notes || undefined,
      });
      toast.success(t("inventory.suppliers.toast.successAdd", "تم إضافة المورد بنجاح."));
      setName("");
      setCode("");
      setTaxNumber("");
      setPhone("");
      setEmail("");
      setAddress("");
      setNotes("");
      await loadSuppliers();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      toast.error(
        typeof msg === "string" ? msg : t("inventory.suppliers.toast.errorAdd", "حدث خطأ أثناء إضافة المورد.")
      );
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("inventory.suppliers.title", "الموردون")}</h1>
          <p className="text-sm text-slate-400">
            {t("inventory.suppliers.subtitle", "إدارة قائمة الموردين (الشركات المزودة للأدوية، المستلزمات الطبية، الخدمات...).")}
          </p>
        </div>
        <button
          type="button"
          onClick={loadSuppliers}
          className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700"
        >
          {t("inventory.suppliers.btn.refresh", "تحديث")}
        </button>
      </div>

      {/* فورم إضافة مورد جديد */}
      <form
        onSubmit={handleCreate}
        className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"
      >
        <div className="flex flex-col gap-1">
          <label className="text-slate-300">{t("inventory.suppliers.form.nameLabel", "اسم المورد *")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs ${isRtl ? 'text-right' : 'text-left'}`}
            placeholder={t("inventory.suppliers.form.namePlaceholder", "مثال: شركة الأمل للأدوية")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-300">{t("inventory.suppliers.form.codeLabel", "الكود الداخلي")}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs ${isRtl ? 'text-right' : 'text-left'}`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-300">{t("inventory.suppliers.form.taxLabel", "الرقم الضريبي")}</label>
          <input
            value={taxNumber}
            onChange={(e) => setTaxNumber(e.target.value)}
            className={`bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs ${isRtl ? 'text-right' : 'text-left'}`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-300">{t("inventory.suppliers.form.phoneLabel", "الهاتف")}</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs ${isRtl ? 'text-right' : 'text-left'}`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-300">{t("inventory.suppliers.form.emailLabel", "البريد الإلكتروني")}</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs ${isRtl ? 'text-right' : 'text-left'}`}
          />
        </div>

        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-slate-300">{t("inventory.suppliers.form.addressLabel", "العنوان")}</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={`bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs ${isRtl ? 'text-right' : 'text-left'}`}
          />
        </div>

        <div className="flex flex-col gap-1 md:col-span-3">
          <label className="text-slate-300">{t("inventory.suppliers.form.notesLabel", "ملاحظات")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs min-h-[60px] ${isRtl ? 'text-right' : 'text-left'}`}
          />
        </div>

        <div className="md:col-span-3 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? t("inventory.suppliers.form.savingBtn", "جارِ الحفظ...") : t("inventory.suppliers.form.saveBtn", "حفظ المورد")}
          </button>
        </div>
      </form>

      {/* جدول الموردين */}
      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs overflow-auto">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          {t("inventory.suppliers.tableTitle", "قائمة الموردين")}
        </h2>
        {suppliers.length === 0 ? (
          <div className="text-slate-500 text-xs">
            {t("inventory.suppliers.noSuppliers", "لا توجد موردون مضافة بعد.")}
          </div>
        ) : (
          <table className={`w-full text-[11px] border-separate border-spacing-y-1 ${isRtl ? 'text-right' : 'text-left'}`}>
            <thead className="text-slate-400">
              <tr>
                <th className="px-2 py-1">{t("inventory.suppliers.table.name", "الاسم")}</th>
                <th className="px-2 py-1">{t("inventory.suppliers.table.code", "الكود")}</th>
                <th className="px-2 py-1">{t("inventory.suppliers.table.phone", "الهاتف")}</th>
                <th className="px-2 py-1">{t("inventory.suppliers.table.email", "البريد")}</th>
                <th className="px-2 py-1">{t("inventory.suppliers.table.address", "العنوان")}</th>
                <th className="px-2 py-1">{t("inventory.suppliers.table.notes", "ملاحظات")}</th>
                <th className="px-2 py-1 text-center">{t("inventory.suppliers.table.actions", "إجراءات")}</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr
                  key={s.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl"
                >
                  <td className="px-2 py-1 align-top">{s.name}</td>
                  <td className="px-2 py-1 align-top">{s.code ?? "—"}</td>
                  <td className="px-2 py-1 align-top">{s.phone ?? "—"}</td>
                  <td className="px-2 py-1 align-top">{s.email ?? "—"}</td>
                  <td className="px-2 py-1 align-top">{s.address ?? "—"}</td>
                  <td className="px-2 py-1 align-top max-w-[220px]">
                    <span className="line-clamp-2">{s.notes ?? "—"}</span>
                  </td>
                  <td className="px-2 py-1 align-top text-center">
                    <button
                      type="button"
                      onClick={() => navigate(`/suppliers/${s.id}/statement`)}
                      className="px-3 py-1 rounded-full text-[11px] bg-slate-800 hover:bg-slate-700"
                    >
                      {t("inventory.suppliers.table.actionStatement", "كشف حساب")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
