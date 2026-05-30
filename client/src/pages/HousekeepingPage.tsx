// src/pages/HousekeepingPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Bed = {
  id: number;
  bedNumber: string;
  status: "CLEANING" | "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
  ward: { name: string };
  room: { roomNumber: string };
};

export default function HousekeepingPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [beds, setBeds] = useState<Bed[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDirtyBeds = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<any[]>("/beds/tree");
      const dirtyBeds: Bed[] = [];

      res.data.forEach((ward: any) => {
        ward.rooms.forEach((room: any) => {
          room.beds.forEach((bed: any) => {
            if (bed.status === "CLEANING") {
              dirtyBeds.push({
                ...bed,
                ward: { name: ward.name },
                room: { roomNumber: room.roomNumber },
              });
            }
          });
        });
      });
      setBeds(dirtyBeds);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirtyBeds();
  }, []);

  const handleClean = async (bedId: number) => {
    try {
      await apiClient.post("/beds/mark-clean", { bedId });
      toast.success(t("housekeeping.loadSuccess", "تم تنظيف السرير وأصبح متاحاً."));
      loadDirtyBeds();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("housekeeping.loadError", "فشل التحديث."));
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            {t("housekeeping.title")}
          </h1>
          <p className="text-sm text-slate-400">
            {t("housekeeping.subtitle")}
          </p>
        </div>
        <button
          onClick={loadDirtyBeds}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm"
        >
          {t("housekeeping.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && (
          <div className="col-span-3 text-center text-slate-500">
            {t("housekeeping.loading")}
          </div>
        )}

        {!loading && beds.length === 0 && (
          <div className="col-span-3 text-center py-10 bg-slate-900/50 rounded-2xl border border-slate-800 text-emerald-400">
            {t("housekeeping.emptyState")}
          </div>
        )}

        {beds.map((bed) => (
          <div
            key={bed.id}
            className="bg-amber-900/20 border border-amber-500/40 p-4 rounded-2xl flex justify-between items-center"
          >
            <div>
              <div className="text-lg font-bold text-amber-200">
                {bed.bedNumber}
              </div>
              <div className="text-sm text-slate-400">
                {bed.ward.name} - {t("housekeeping.roomLabel")} {bed.room.roomNumber}
              </div>
            </div>
            <button
              onClick={() => handleClean(bed.id)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg"
            >
              {t("housekeeping.markClean")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
