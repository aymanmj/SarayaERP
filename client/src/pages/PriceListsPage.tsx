// src/pages/PriceListsPage.tsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type PriceList = {
  id: number;
  name: string;
  code?: string | null;
  isDefault: boolean;
  isActive: boolean;
  _count?: { items: number };
};

export default function PriceListsPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  const loadLists = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PriceList[]>("/price-lists");
      setLists(res.data);
    } catch (err) {
      toast.error("فشل تحميل قوائم الأسعار");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLists();
  }, []);

  const handleCreate = async () => {
    if (!newName) {
      toast.warning("يجب إدخال اسم القائمة");
      return;
    }
    try {
      await apiClient.post("/price-lists", {
        name: newName,
        code: newCode || undefined,
        isDefault: false,
      });
      toast.success("تم إنشاء القائمة بنجاح");
      setShowModal(false);
      setNewName("");
      setNewCode("");
      loadLists();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل الإنشاء");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            قوائم الأسعار (Price Lists)
          </h1>
          <p className="text-sm text-slate-400">
            إدارة لوائح الأسعار المختلفة (نقدي، تأمين، شركات) وتخصيص أسعار
            الخدمات.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg"
        >
          + قائمة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && (
          <div className="col-span-3 text-center text-slate-500">
            جارِ التحميل...
          </div>
        )}

        {!loading &&
          lists.map((list) => (
            <div
              key={list.id}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-sky-500/50 transition relative group"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-white">{list.name}</h3>
                {list.isDefault && (
                  <span className="bg-sky-900/30 text-sky-300 text-[10px] px-2 py-0.5 rounded border border-sky-500/30">
                    افتراضي
                  </span>
                )}
              </div>

              <div className="text-sm text-slate-400 mb-4">
                الكود:{" "}
                <span className="font-mono text-slate-300">
                  {list.code || "—"}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-800 pt-3">
                <span>عدد الخدمات المسعرة: {list._count?.items ?? 0}</span>
                <button
                  onClick={() => navigate(`/price-lists/${list.id}`)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                >
                  إدارة الأسعار ➜
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold">إضافة قائمة أسعار</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  اسم القائمة
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  placeholder="مثال: شركة ليبيا للتأمين - فئة أ"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الكود (اختياري)
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                  placeholder="مثال: INS-A"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
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
