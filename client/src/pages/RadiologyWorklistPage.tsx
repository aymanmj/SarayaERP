// src/pages/RadiologyWorklistPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type PatientLite = { id: number; fullName: string; mrn: string };
type StudyLite = {
  id: number;
  code: string;
  name: string;
  modality?: string | null;
  bodyPart?: string | null;
};
type OrderLite = {
  id: number;
  status: string;
  createdAt: string;
  encounterId: number | null;
};
type RadiologyStatus = "PENDING" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type RadiologyWorklistItem = {
  id: number;
  status: RadiologyStatus;
  reportedAt?: string | null;
  reportText?: string | null;
  order: OrderLite;
  patient?: PatientLite | null;
  study: StudyLite;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RadiologyWorklistPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RadiologyWorklistItem[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<RadiologyWorklistItem[]>(
        "/radiology/worklist",
      );
      setItems(res.data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error("حدث خطأ أثناء تحميل القائمة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return items;
    return items.filter(
      (x) =>
        x.study.name.includes(s) ||
        x.patient?.fullName.includes(s) ||
        x.patient?.mrn.includes(s),
    );
  }, [items, search]);

  const handleStart = async (item: RadiologyWorklistItem) => {
    try {
        await apiClient.post(`/radiology/orders/${item.id}/start`);
        toast.success("✅ تم بدء التصوير وإرسال الطلب (HL7).");
        load();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
        toast.error("فشل بدء التصوير.");
    }
  };

  const handleReport = async (item: RadiologyWorklistItem) => {
    // نافذة بسيطة لكتابة التقرير (يمكن استبدالها بـ Modal لاحقاً)
    const currentReport = item.reportText || "";
    // نستخدم prompt للتجربة السريعة، أو يمكنك عمل Modal مخصص
    const newReport = window.prompt(
      `أدخل تقرير الأشعة للمريض ${item.patient?.fullName}:`,
      currentReport,
    );

    if (newReport === null) return; // Cancelled

    try {
      await apiClient.patch(`/radiology/orders/${item.id}/report`, {
        reportText: newReport || undefined,
      });

      toast.success("تم حفظ التقرير وإكمال الطلب.");
      load(); // تحديث القائمة
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error("فشل الحفظ.");
    }
  };

  const renderStatus = (status: RadiologyStatus) => {
    switch (status) {
      case "PENDING":
        return <span className="text-amber-400">قيد الانتظار</span>;
      case "SCHEDULED":
        return <span className="text-blue-400">مجدول</span>;
      case "IN_PROGRESS":
        return <span className="text-sky-400 animate-pulse">جاري التصوير...</span>;
      case "COMPLETED":
        return <span className="text-emerald-400">مكتمل</span>;
      default:
        return status;
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">قائمة الأشعة (Worklist)</h1>
          <p className="text-sm text-slate-400">
            عرض طلبات الأشعة، إدخال التقارير، وطباعة النتائج.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm"
          />
          <button
            onClick={load}
            className="px-4 py-1.5 rounded-xl bg-slate-800 text-sm hover:bg-slate-700"
          >
            تحديث
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl bg-slate-950/60 border border-slate-800 p-4 overflow-auto">
        <div className="space-y-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="border border-slate-800 bg-slate-900/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-lg">
                    {it.patient?.fullName}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    ({it.patient?.mrn})
                  </span>
                </div>
                <div className="text-sm text-sky-400 font-medium">
                  {it.study.name}
                  {it.study.modality && (
                    <span className="text-slate-500 text-xs ml-1">
                      [{it.study.modality}]
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  تاريخ الطلب: {formatDateTime(it.order.createdAt)} • الحالة:{" "}
                  {renderStatus(it.status)}
                </div>
              </div>

              <div className="flex gap-2 items-center">
                 {/* Start Button */}
                 {(it.status === "PENDING" || it.status === "SCHEDULED") && (
                    <button
                        onClick={() => handleStart(it)}
                        className="px-4 py-2 rounded-xl text-xs flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-lg shadow-indigo-500/20"
                    >
                        <span>⚡ بدء الفحص</span>
                    </button>
                 )}

                {/* Report Button */}
                {(it.status === "IN_PROGRESS" || it.status === "COMPLETED") && (
                    <button
                    onClick={() => handleReport(it)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-600"
                    >
                    {it.status === "COMPLETED"
                        ? "تعديل التقرير"
                        : "إدخال التقرير"}
                    </button>
                )}

                {it.status === "COMPLETED" && (
                  <button
                    onClick={() =>
                      window.open(`/radiology/orders/${it.id}/print`, "_blank")
                    }
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white shadow-lg shadow-emerald-500/20 font-bold flex items-center gap-2"
                  >
                    <span>🖨️</span> طباعة
                  </button>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && !loading && (
            <div className="text-center py-10 text-slate-500">
              لا توجد طلبات.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
