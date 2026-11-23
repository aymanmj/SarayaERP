import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../../stores/authStore";

interface StaffOption {
  id: number;
  fullName: string;
}

interface CredentialItem {
  id: number;
  userId: number;
  staffCategory: string;
  credentialType: string;
  title: string;
  licenseNumber: string;
  issuingAuthority: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  complianceStatus: string;
  daysUntilExpiry: number;
  createdById: number;
  user?: { id: number; fullName: string };
}

interface AlertsPayload {
  summary: {
    expiredCount: number;
    expiringSoonCount: number;
    suspendedOrRevokedCount: number;
    pendingVerificationCount: number;
    practiceLicenseAlerts: number;
    healthCertificateAlerts: number;
  };
}

interface StaffCredentialsModalProps {
  staffOptions: StaffOption[];
  onClose: () => void;
}

const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  PRACTICE_LICENSE: "إذن مزاولة المهنة",
  HEALTH_CERTIFICATE: "الشهادة الصحية (الخلو من الأمراض)",
  MEDICAL_COUNCIL_CERT: "شهادة القيد بالنقابة / المجلس الطبي",
  SPECIALTY_BOARD_CERT: "شهادة التخصص / الزمالة",
  BLS_ACLS_CERT: "شهادة الإنعاش القلبي (BLS/ACLS)",
  RADIATION_SAFETY_PERMIT: "تصريح الوقاية الإشعاعية",
  OTHER: "وثيقة مهنية أخرى",
};

const STAFF_CATEGORY_LABELS: Record<string, string> = {
  MEDICAL: "الكادر الطبي (أطباء ودكاترة)",
  ALLIED_HEALTH: "الكادر الطبي المساعد (تمريض/صيدلة/مختبر/أشعة)",
  ADMINISTRATIVE_SUPPORT: "إداري / مساند",
};

export const StaffCredentialsModal: React.FC<StaffCredentialsModalProps> = ({
  staffOptions,
  onClose,
}) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id;
  const hasPerm = (perm: string) =>
    Boolean(user?.roles?.includes("ADMIN") || user?.permissions?.includes(perm));

  const canManage = hasPerm("hr:credentials:manage") || hasPerm("hr:manage");
  const canVerify = hasPerm("hr:credentials:verify");

  const [items, setItems] = useState<CredentialItem[]>([]);
  const [alerts, setAlerts] = useState<AlertsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Create form
  const [userId, setUserId] = useState("");
  const [staffCategory, setStaffCategory] = useState("MEDICAL");
  const [credentialType, setCredentialType] = useState("PRACTICE_LICENSE");
  const [title, setTitle] = useState("إذن مزاولة مهنة");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [alertDaysBefore, setAlertDaysBefore] = useState("30");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, alertsRes] = await Promise.all([
        apiClient.get<CredentialItem[]>("/hr/credentials"),
        apiClient.get<AlertsPayload>("/hr/credentials/alerts"),
      ]);
      setItems(listRes.data);
      setAlerts(alertsRes.data);
    } catch {
      toast.error(
        t("hr.credentials.loadFailed", "تعذر تحميل سجل التراخيص والشهادات الصحية."),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (
      !userId ||
      !licenseNumber.trim() ||
      !issuingAuthority.trim() ||
      !issueDate ||
      !expiryDate
    ) {
      toast.warning(
        t(
          "hr.credentials.fillRequired",
          "يرجى تعبئة الموظف ورقم الترخيص والجهة المانحة وتاريخي الإصدار والانتهاء.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await apiClient.post("/hr/credentials", {
        userId: Number(userId),
        staffCategory,
        credentialType,
        title:
          title.trim() || CREDENTIAL_TYPE_LABELS[credentialType] || credentialType,
        licenseNumber: licenseNumber.trim(),
        issuingAuthority: issuingAuthority.trim(),
        issueDate: new Date(issueDate).toISOString(),
        expiryDate: new Date(expiryDate).toISOString(),
        alertDaysBefore: Number(alertDaysBefore) || 30,
        isMandatory: true,
      });
      toast.success(
        t(
          "hr.credentials.created",
          "تم تسجيل الوثيقة بنجاح وهي بانتظار الاعتماد المستقل (4 عيون).",
        ),
      );
      setLicenseNumber("");
      setIssuingAuthority("");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t("hr.credentials.createFailed", "تعذر تسجيل الترخيص أو الشهادة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (id: number) => {
    setBusy(true);
    try {
      await apiClient.post(`/hr/credentials/${id}/verify`, {});
      toast.success(t("hr.credentials.verified", "تم اعتماد الترخيص/الشهادة وتفعيلها."));
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("hr.credentials.verifyFailed", "تعذر اعتماد الوثيقة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async (id: number) => {
    setBusy(true);
    try {
      await apiClient.post(`/hr/credentials/${id}/suspend`, {
        action: "SUSPEND",
        reason: t("hr.credentials.defaultSuspendReason", "تعليق إداري/طبي لحين التجديد"),
      });
      toast.success(
        t("hr.credentials.suspended", "تم تعليق الوثيقة ومنع جدولة الموظف تلقائيًا."),
      );
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("hr.credentials.suspendFailed", "تعذر تعليق الوثيقة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 text-slate-100 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">
              🩺 {t("hr.credentials.modalTitle", "تراخيص الكادر الطبي والطبي المساعد والشهادات الصحية")}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {t(
                "hr.credentials.subtitle",
                "إدارة أذونات المزاولة وشهادات الخلو من الأمراض مع التنبيه الاستباقي ومنع الجدولة تلقائيًا عند الانتهاء.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* Summary KPI Strip */}
        {alerts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-rose-950/40 border border-rose-700/50 rounded-xl p-3">
              <div className="text-rose-300 font-semibold">منتهية الصلاحية</div>
              <div className="text-xl font-bold text-rose-200 mt-1">
                {alerts.summary.expiredCount}
              </div>
            </div>
            <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-3">
              <div className="text-amber-300 font-semibold">تنتهي قريبًا</div>
              <div className="text-xl font-bold text-amber-200 mt-1">
                {alerts.summary.expiringSoonCount}
              </div>
            </div>
            <div className="bg-sky-950/40 border border-sky-700/50 rounded-xl p-3">
              <div className="text-sky-300 font-semibold">تنبيهات إذن المزاولة</div>
              <div className="text-xl font-bold text-sky-200 mt-1">
                {alerts.summary.practiceLicenseAlerts}
              </div>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-xl p-3">
              <div className="text-emerald-300 font-semibold">تنبيهات الشهادات الصحية</div>
              <div className="text-xl font-bold text-emerald-200 mt-1">
                {alerts.summary.healthCertificateAlerts}
              </div>
            </div>
          </div>
        )}

        {/* Create Credential Form */}
        {canManage && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3 text-xs">
            <h4 className="font-bold text-sky-300">
              {t("hr.credentials.addTitle", "تسجيل إذن مزاولة أو شهادة صحية جديدة")}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                aria-label={t("hr.credentials.staff", "الموظف")}
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              >
                <option value="">-- اختر الموظف --</option>
                {staffOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
              <select
                value={staffCategory}
                onChange={(e) => setStaffCategory(e.target.value)}
                aria-label={t("hr.credentials.category", "فئة الكادر")}
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              >
                {Object.entries(STAFF_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={credentialType}
                onChange={(e) => {
                  setCredentialType(e.target.value);
                  setTitle(CREDENTIAL_TYPE_LABELS[e.target.value] || "");
                }}
                aria-label={t("hr.credentials.type", "نوع الوثيقة")}
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              >
                {Object.entries(CREDENTIAL_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="رقم الترخيص / الشهادة"
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              />
              <input
                type="text"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                placeholder="الجهة المانحة (النقابة / مكافحة الأمراض)"
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              />
              <input
                type="number"
                value={alertDaysBefore}
                onChange={(e) => setAlertDaysBefore(e.target.value)}
                placeholder="أيام التنبيه قبل الانتهاء (30)"
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              />
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                aria-label="تاريخ الإصدار"
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              />
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                aria-label="تاريخ الانتهاء"
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-white"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-50"
              >
                + تسجيل الوثيقة
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {t("common.loading", "جارٍ التحميل...")}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((c) => {
              const canVerifyThis =
                c.status === "PENDING_VERIFICATION" &&
                canVerify &&
                currentUserId !== undefined &&
                c.userId !== currentUserId &&
                c.createdById !== currentUserId;
              return (
                <div
                  key={c.id}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex flex-wrap justify-between items-center gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-white">
                      {c.user?.fullName || `#${c.userId}`} —{" "}
                      <span className="text-sky-300">
                        {CREDENTIAL_TYPE_LABELS[c.credentialType] || c.credentialType}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      رقم: <span className="font-mono text-slate-200">{c.licenseNumber}</span> •{" "}
                      {c.issuingAuthority} • ينتهي:{" "}
                      {new Date(c.expiryDate).toLocaleDateString()} ({c.daysUntilExpiry} يوم)
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold border ${
                        c.complianceStatus === "VALID"
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-600/50"
                          : c.complianceStatus === "EXPIRING_SOON"
                            ? "bg-amber-950/60 text-amber-300 border-amber-600/50"
                            : "bg-rose-950/60 text-rose-300 border-rose-600/50"
                      }`}
                    >
                      {c.complianceStatus}
                    </span>
                    {canVerifyThis && (
                      <button
                        type="button"
                        onClick={() => handleVerify(c.id)}
                        disabled={busy}
                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        ✓ اعتماد
                      </button>
                    )}
                    {c.status === "ACTIVE" && canVerify && (
                      <button
                        type="button"
                        onClick={() => handleSuspend(c.id)}
                        disabled={busy}
                        className="px-3 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-bold"
                      >
                        تعليق
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
