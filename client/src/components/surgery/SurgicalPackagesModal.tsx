// client/src/components/surgery/SurgicalPackagesModal.tsx
import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { Money } from "../../utils/money";
import { toast } from "sonner";

type TabKey = "packages" | "enrollments";

interface PackageRow {
  id: number;
  code: string;
  name: string;
  drgCode: string | null;
  packagePrice: string;
  includedStayDays: number;
}

interface EnrollmentRow {
  id: number;
  encounterId: number;
  status: string;
  packagePriceSnapshot: string;
  actualChargesTotal: string;
  overageAmount: string;
  netBillableTotal: string;
  surgicalPackage?: { code: string; name: string; drgCode: string | null };
  encounter?: { patient?: { fullName: string; mrn: string } };
}

export function SurgicalPackagesModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>("packages");
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [drgCode, setDrgCode] = useState("");
  const [price, setPrice] = useState("3500");
  const [roomCap, setRoomCap] = useState("600");

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, eRes] = await Promise.all([
        apiClient.get("/surgery/packages"),
        apiClient.get("/surgery/packages/enrollments"),
      ]);
      setPackages(Array.isArray(pRes.data) ? pRes.data : []);
      setEnrollments(Array.isArray(eRes.data) ? eRes.data : []);
    } catch {
      toast.error("تعذّر تحميل بيانات الحزم الجراحية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreatePackage = async () => {
    if (!code.trim() || !name.trim() || !price) {
      toast.error("أدخل رمز واسم وسعر الحزمة الجراحية");
      return;
    }
    try {
      await apiClient.post("/surgery/packages", {
        code: code.trim(),
        name: name.trim(),
        drgCode: drgCode.trim() || undefined,
        packagePrice: Number(price),
        includedStayDays: 2,
        inclusions: [
          { category: "SURGERY", coverageMode: "INCLUDED_UNLIMITED" },
          { category: "ANESTHESIA", coverageMode: "INCLUDED_UNLIMITED" },
          {
            category: "ROOM",
            coverageMode: "INCLUDED_CAPPED",
            capAmount: Number(roomCap || 0),
          },
          { category: "RADIOLOGY", coverageMode: "EXCLUDED" },
        ],
      });
      toast.success("تم إنشاء الحزمة الجراحية (DRG) بنجاح");
      setCode("");
      setName("");
      setDrgCode("");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل إنشاء الحزمة");
    }
  };

  const handleSettle = async (id: number) => {
    try {
      await apiClient.post(`/surgery/packages/enrollments/${id}/settle`, {});
      toast.success("تم تسوية وختم الحزمة الجراحية ببصمة SHA-256");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل التسوية");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="الحزم الجراحية والتسعير المجمع DRG"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 text-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-emerald-300">
              📦 الحزم الجراحية والتسعير المجمّع (CAP08 — DRG Bundled Billing)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              تعريف الحزم والسقوف والمستثنيات، احتساب فروقات التجاوز (Overage)، وختم التسوية ببصمة SHA-256.
            </p>
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
            onClick={() => setTab("packages")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "packages" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            1. دليل الحزم الجراحية ({packages.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("enrollments")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "enrollments" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            2. الزيارات المسجّلة والتسوية ({enrollments.length})
          </button>
        </div>

        {loading && <div className="text-xs text-slate-400">جاري التحميل...</div>}

        {tab === "packages" && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                placeholder="رمز الحزمة (PKG-01)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <input
                placeholder="اسم الحزمة الجراحية"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="md:col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="رمز DRG"
                value={drgCode}
                onChange={(e) => setDrgCode(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <input
                placeholder="سعر الحزمة (LYD)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <input
                placeholder="سقف الإقامة (LYD)"
                value={roomCap}
                onChange={(e) => setRoomCap(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleCreatePackage}
                className="md:col-span-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
              >
                حفظ الحزمة الجراحية
              </button>
            </div>

            <div className="space-y-2">
              {packages.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold">
                      {p.code} — {p.name} {p.drgCode ? `(${p.drgCode})` : ""}
                    </div>
                    <div className="text-slate-400">
                      أيام الإقامة المشمولة: {p.includedStayDays}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-emerald-400">
                    {Money.toFixed(p.packagePrice)} LYD
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "enrollments" && (
          <div className="space-y-2">
            {enrollments.map((e) => (
              <div
                key={e.id}
                className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold">
                    زيارة #{e.encounterId} — {e.surgicalPackage?.name ?? "حزمة"} ({e.status})
                  </div>
                  <div className="text-slate-400 font-mono">
                    سعر الحزمة: {Money.toFixed(e.packagePriceSnapshot)} | فروقات: {Money.toFixed(e.overageAmount)} | الصافي: {Money.toFixed(e.netBillableTotal)}
                  </div>
                </div>
                {e.status === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() => handleSettle(e.id)}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold"
                  >
                    تسوية وختم الحزمة
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
