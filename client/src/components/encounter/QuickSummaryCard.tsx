import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from "../../api/apiClient";

type EncounterStatus = "OPEN" | "CLOSED" | "CANCELLED";

export default function QuickSummaryCard({ encounterId, status }: { encounterId: number; status: EncounterStatus }) {
  const { t } = useTranslation();
   
  const [vitals, setVitals] = useState<any[]>([]);
   
  const [diagnoses, setDiagnoses] = useState<any[]>([]);

  useEffect(() => {
    apiClient
      .get(`/vitals/encounter/${encounterId}`)
      .then((response) => setVitals(response.data))
      .catch(() => {});
    apiClient
      .get(`/diagnosis/encounter/${encounterId}`)
      .then((response) => setDiagnoses(response.data))
      .catch(() => {});
  }, [encounterId]);

  const latestVital = vitals.length > 0 ? vitals[0] : null;
   
  const primaryDx = diagnoses.find((diagnosis: any) => diagnosis.type === "PRIMARY");

  return (
    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
      <h3 className="text-xs font-bold text-slate-300 mb-3 border-b border-slate-800 pb-2">
        {t("encounter.quickSummary.title", "ملخص سريع")}
      </h3>
      <div className="space-y-3 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">{t("encounter.quickSummary.vitals", "العلامات الحيوية:")}</span>
          {latestVital ? (
            <span className="text-emerald-400 font-mono">
              {latestVital.bpSystolic && `${latestVital.bpSystolic}/${latestVital.bpDiastolic}`}
              {latestVital.pulse && ` | HR ${latestVital.pulse}`}
              {latestVital.temperature && ` | ${latestVital.temperature}°`}
              {latestVital.o2Sat && ` | O₂ ${latestVital.o2Sat}%`}
              {!latestVital.bpSystolic &&
                !latestVital.pulse &&
                !latestVital.temperature &&
                !latestVital.o2Sat &&
                t("encounter.quickSummary.recorded", "مسجلة")}
            </span>
          ) : (
            <span className="text-red-400">{t("encounter.quickSummary.noReadings", "لا توجد قراءات")}</span>
          )}
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">{t("encounter.quickSummary.primaryDiagnosis", "التشخيص المبدئي:")}</span>
          {primaryDx ? (
            <span
              className="text-emerald-400 truncate max-w-[180px]"
              title={primaryDx.diagnosisCode?.nameEn}
            >
              {primaryDx.diagnosisCode?.code} —{" "}
              {primaryDx.diagnosisCode?.nameAr || primaryDx.diagnosisCode?.nameEn}
            </span>
          ) : (
            <span className="text-red-400">{t("encounter.quickSummary.notAvailable", "غير متوفر")}</span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">{t("encounter.quickSummary.fileStatus", "حالة الملف:")}</span>
          <span
            className={
              status === "OPEN"
                ? "text-emerald-400"
                : status === "CLOSED"
                  ? "text-slate-500"
                  : "text-red-400"
            }
          >
            {status === "OPEN" ? t("encounter.status.open", "🟢 مفتوح") : status === "CLOSED" ? t("encounter.status.closed", "🔒 مغلق") : t("encounter.status.cancelled", "❌ ملغي")}
          </span>
        </div>
      </div>
    </div>
  );
}
