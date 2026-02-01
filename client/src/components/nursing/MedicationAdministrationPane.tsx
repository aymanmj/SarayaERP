// src/components/nursing/MedicationAdministrationPane.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type AdministrationStatus = "GIVEN" | "NOT_GIVEN" | "REFUSED" | "HELD";

type AdministrationRecord = {
  id: number;
  status: AdministrationStatus;
  administeredAt: string;
  notes: string | null;
  performer: { fullName: string };
};

type PrescriptionItem = {
  id: number;
  product: { name: string; strength: string | null; form: string | null };
  dose: string;
  route: string;
  frequency: string;
  notes: string | null;
};

type Prescription = {
  id: number;
  status: string;
  doctor: { fullName: string };
  createdAt: string;
  items: PrescriptionItem[];
};

type MarResponse = {
  prescriptions: Prescription[];
  administrations: (AdministrationRecord & { prescriptionItemId: number })[];
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-LY", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function MedicationAdministrationPane({
  encounterId,
}: {
  encounterId: number;
}) {
  const [data, setData] = useState<MarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);

  const loadMAR = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<MarResponse>(
        `/nursing/encounters/${encounterId}/mar`
      );
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل سجل الأدوية.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMAR();
  }, [encounterId]);

  const handleAdminister = async (
    itemId: number,
    status: AdministrationStatus
  ) => {
    let notes = "";
    if (status !== "GIVEN") {
      const prompt = window.prompt("الرجاء ذكر سبب عدم الإعطاء / التأجيل:");
      if (prompt === null) return; // Cancelled
      notes = prompt;
    }

    setProcessing(itemId);
    try {
      await apiClient.post(
        `/nursing/encounters/${encounterId}/administer-med`,
        {
          prescriptionItemId: itemId,
          status,
          notes,
        }
      );
      toast.success("تم تسجيل الإجراء بنجاح.");
      await loadMAR();
    } catch (err) {
      toast.error("فشل التسجيل.");
    } finally {
      setProcessing(null);
    }
  };

  if (loading && !data)
    return <div className="text-slate-400 text-sm">جارِ التحميل...</div>;

  return (
    <div className="space-y-6">
      {!data || data.prescriptions.length === 0 ? (
        <div className="text-center py-8 text-slate-500 border border-slate-800 rounded-2xl bg-slate-900/50">
          لا توجد وصفات طبية فعالة لهذا المريض.
        </div>
      ) : (
        data.prescriptions.map((pres) => (
          <div
            key={pres.id}
            className="border border-slate-800 bg-slate-900/60 rounded-2xl p-4"
          >
            <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
              <div className="text-xs text-slate-400">
                وصفة د. {pres.doctor?.fullName} (
                {new Date(pres.createdAt).toLocaleDateString()})
              </div>
              <div className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {pres.status}
              </div>
            </div>

            <div className="space-y-4">
              {pres.items.map((item) => {
                // تصفية السجلات الخاصة بهذا الدواء
                const itemHistory = data.administrations.filter(
                  (a) => a.prescriptionItemId === item.id
                );
                const lastAdmin = itemHistory[0]; // لأننا رتبناهم في الباكيند desc

                return (
                  <div
                    key={item.id}
                    className="flex flex-col md:flex-row gap-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800/50"
                  >
                    {/* تفاصيل الدواء */}
                    <div className="flex-1">
                      <div className="font-bold text-slate-200 text-sm">
                        {item.product.name} {item.product.strength}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        الجرعة:{" "}
                        <span className="text-sky-300">{item.dose}</span> |
                        الطريق:{" "}
                        <span className="text-sky-300">{item.route}</span> |
                        التكرار:{" "}
                        <span className="text-sky-300">{item.frequency}</span>
                      </div>
                      {item.notes && (
                        <div className="text-[10px] text-amber-400 mt-1">
                          ملاحظات الطبيب: {item.notes}
                        </div>
                      )}

                      {/* آخر إعطاء */}
                      <div className="mt-2 text-[10px] text-slate-500">
                        آخر جرعة:{" "}
                        {lastAdmin ? (
                          <span
                            className={
                              lastAdmin.status === "GIVEN"
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }
                          >
                            {formatTime(lastAdmin.administeredAt)} (
                            {lastAdmin.performer.fullName}) - {lastAdmin.status}
                          </span>
                        ) : (
                          "لم يعطى بعد"
                        )}
                      </div>
                    </div>

                    {/* أزرار الإجراءات */}
                    <div className="flex flex-col justify-center gap-2 min-w-[120px]">
                      <button
                        onClick={() => handleAdminister(item.id, "GIVEN")}
                        disabled={processing === item.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg font-bold shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                      >
                        ✅ إعطاء الآن
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAdminister(item.id, "REFUSED")}
                          disabled={processing === item.id}
                          className="flex-1 px-2 py-1 bg-rose-900/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 text-[10px] rounded"
                        >
                          رفض
                        </button>
                        <button
                          onClick={() => handleAdminister(item.id, "HELD")}
                          disabled={processing === item.id}
                          className="flex-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-[10px] rounded"
                        >
                          تأجيل
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
