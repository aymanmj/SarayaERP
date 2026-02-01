// src/pages/AssetsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type AssetStatus = "IN_SERVICE" | "UNDER_MAINTENANCE" | "RETIRED" | "SOLD";

type Asset = {
  id: number;
  name: string;
  tagNumber: string;
  serialNumber: string | null;
  purchaseCost: string;
  purchaseDate: string;
  usefulLifeYears: number;
  currentValue: string;
  status: AssetStatus;
  department?: { name: string };
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  IN_SERVICE: "في الخدمة",
  UNDER_MAINTENANCE: "تحت الصيانة",
  RETIRED: "تالف / مكهن",
  SOLD: "مباع",
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: "",
    tagNumber: "",
    serialNumber: "",
    purchaseDate: "",
    purchaseCost: "",
    usefulLifeYears: "5",
    salvageValue: "0",
  });

  const loadAssets = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Asset[]>("/assets", {
        params: { q: search || undefined },
      });
      setAssets(res.data);
    } catch (err) {
      toast.error("فشل تحميل الأصول");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [search]);

  const handleCreate = async () => {
    if (!form.name || !form.tagNumber || !form.purchaseCost) {
      toast.warning("يرجى ملء الحقول الأساسية");
      return;
    }
    try {
      await apiClient.post("/assets", {
        ...form,
        purchaseCost: Number(form.purchaseCost),
        usefulLifeYears: Number(form.usefulLifeYears),
        salvageValue: Number(form.salvageValue),
      });
      toast.success("تم تسجيل الأصل بنجاح");
      setShowModal(false);
      setForm({
        name: "",
        tagNumber: "",
        serialNumber: "",
        purchaseDate: "",
        purchaseCost: "",
        usefulLifeYears: "5",
        salvageValue: "0",
      });
      loadAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل الحفظ");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">سجل الأصول الثابتة</h1>
          <p className="text-sm text-slate-400">
            إدارة الأجهزة والمعدات والمباني.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-bold text-white shadow-lg"
        >
          + تسجيل أصل جديد
        </button>
      </div>

      {/* Search */}
      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
        <input
          className="bg-transparent w-full outline-none text-sm text-slate-200 placeholder:text-slate-500"
          placeholder="بحث برقم الأصل (Tag) أو الاسم..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">رقم الأصل (Tag)</th>
              <th className="px-4 py-3">الاسم</th>
              <th className="px-4 py-3">الرقم التسلسلي</th>
              <th className="px-4 py-3">تاريخ الشراء</th>
              <th className="px-4 py-3">التكلفة</th>
              <th className="px-4 py-3">القيمة الحالية</th>
              <th className="px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {assets.map((a) => (
              <tr key={a.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-sky-400">
                  {a.tagNumber}
                </td>
                <td className="px-4 py-3 font-semibold">{a.name}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                  {a.serialNumber || "-"}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {formatDate(a.purchaseDate)}
                </td>
                <td className="px-4 py-3 text-amber-300">
                  {Number(a.purchaseCost).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-emerald-300 font-bold">
                  {Number(a.currentValue).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-[10px] border ${
                      a.status === "IN_SERVICE"
                        ? "bg-emerald-900/30 text-emerald-300 border-emerald-500/30"
                        : a.status === "UNDER_MAINTENANCE"
                        ? "bg-rose-900/30 text-rose-300 border-rose-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-600"
                    }`}
                  >
                    {STATUS_LABELS[a.status]}
                  </span>
                </td>
              </tr>
            ))}
            {assets.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  لا توجد أصول مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl space-y-4">
            <h2 className="text-lg font-bold">تسجيل أصل جديد</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">اسم الأصل *</label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">
                  رقم الأصل (Tag/Barcode) *
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.tagNumber}
                  onChange={(e) =>
                    setForm({ ...form, tagNumber: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">
                  الرقم التسلسلي (Serial)
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.serialNumber}
                  onChange={(e) =>
                    setForm({ ...form, serialNumber: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">تاريخ الشراء *</label>
                <DatePicker
                  date={form.purchaseDate ? new Date(form.purchaseDate) : undefined}
                  onChange={(d) =>
                    setForm({ ...form, purchaseDate: d ? d.toISOString().slice(0, 10) : "" })
                  }
                  className="w-full bg-slate-900 border-slate-700 h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">تكلفة الشراء *</label>
                <input
                  type="number"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.purchaseCost}
                  onChange={(e) =>
                    setForm({ ...form, purchaseCost: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">
                  العمر الافتراضي (سنوات) *
                </label>
                <input
                  type="number"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.usefulLifeYears}
                  onChange={(e) =>
                    setForm({ ...form, usefulLifeYears: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">
                  قيمة الخردة (Salvage)
                </label>
                <input
                  type="number"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  value={form.salvageValue}
                  onChange={(e) =>
                    setForm({ ...form, salvageValue: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-sm hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
