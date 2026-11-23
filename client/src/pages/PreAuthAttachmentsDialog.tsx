import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { apiClient } from "../api/apiClient";

const MAX_PREAUTH_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ATTACHMENT_CATEGORIES = [
  "MEDICAL_REPORT",
  "LAB_RESULT",
  "IMAGING",
  "PRESCRIPTION",
  "REFERRAL",
  "ID_DOCUMENT",
  "OTHER",
] as const;

type AttachmentItem = {
  id: number;
  category: string;
  title: string | null;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  retiredAt: string | null;
  retireReason: string | null;
  uploadedBy?: { id: number; fullName: string | null; username: string } | null;
};

type Props = {
  auth: { id: number; status: string };
  onClose: () => void;
};

export function PreAuthAttachmentsDialog({ auth, onClose }: Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>("MEDICAL_REPORT");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [retireTargetId, setRetireTargetId] = useState<number | null>(null);
  const [retireReason, setRetireReason] = useState("");
  const [retiring, setRetiring] = useState(false);

  const loadAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<AttachmentItem[]>(
        `/insurance/pre-auth/${auth.id}/attachments`,
      );
      setAttachments(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error(
        t("preAuth.attachments.loadFailed", "تعذر تحميل مرفقات الموافقة المسبقة"),
      );
    } finally {
      setLoading(false);
    }
  }, [auth.id, t]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.warning(
        t("preAuth.attachments.fileRequired", "يرجى اختيار ملف أولاً"),
      );
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error(
        t(
          "preAuth.attachments.invalidType",
          "نوع الملف غير مدعوم (يُسمح فقط بـ PDF أو JPEG أو PNG)",
        ),
      );
      return;
    }
    if (file.size <= 0 || file.size > MAX_PREAUTH_FILE_BYTES) {
      toast.error(
        t(
          "preAuth.attachments.fileTooLarge",
          "حجم الملف غير صالح أو يتجاوز 10 ميجابايت",
        ),
      );
      return;
    }

    const formData = new FormData();
    formData.append("category", category);
    if (title.trim()) {
      formData.append("title", title.trim());
    }
    formData.append("file", file);

    setUploading(true);
    try {
      await apiClient.post(`/insurance/pre-auth/${auth.id}/attachments`, formData);
      toast.success(t("preAuth.attachments.uploaded", "تم رفع المرفق بنجاح"));
      setTitle("");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadAttachments();
    } catch (error) {
      const message = (
        error as { response?: { data?: { message?: unknown } } }
      ).response?.data?.message;
      toast.error(
        typeof message === "string"
          ? message
          : t("preAuth.attachments.actionFailed", "تعذر تنفيذ العملية على المرفق"),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (item: AttachmentItem) => {
    try {
      const res = await apiClient.get<Blob>(
        `/insurance/pre-auth/${auth.id}/attachments/${item.id}/download`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(res.data);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = item.originalFileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.URL.revokeObjectURL(url);
      }
    } catch {
      toast.error(
        t("preAuth.attachments.actionFailed", "تعذر تحميل ملف المرفق"),
      );
    }
  };

  const handleRetire = async (attachmentId: number) => {
    if (retireReason.trim().length < 5) {
      toast.warning(
        t(
          "preAuth.attachments.reasonTooShort",
          "أدخل سبب سحب المرفق بخمسة أحرف على الأقل",
        ),
      );
      return;
    }

    setRetiring(true);
    try {
      await apiClient.post(
        `/insurance/pre-auth/${auth.id}/attachments/${attachmentId}/retire`,
        { reason: retireReason.trim() },
      );
      toast.success(
        t("preAuth.attachments.retiredSuccess", "تم سحب المرفق مع حفظ سجله"),
      );
      setRetireTargetId(null);
      setRetireReason("");
      await loadAttachments();
    } catch (error) {
      const message = (
        error as { response?: { data?: { message?: unknown } } }
      ).response?.data?.message;
      toast.error(
        typeof message === "string"
          ? message
          : t("preAuth.attachments.actionFailed", "تعذر سحب المرفق"),
      );
    } finally {
      setRetiring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-sky-400">
            {t("preAuth.attachments.title", "مرفقات الموافقة المسبقة")} #{auth.id}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            {t("preAuth.attachments.close", "إغلاق")}
          </button>
        </div>

        {auth.status === "PENDING" && (
          <form
            onSubmit={handleUpload}
            className="mb-5 space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("preAuth.attachments.categoryLabel", "تصنيف المستند")}
                </label>
                <select
                  aria-label={t(
                    "preAuth.attachments.categoryLabel",
                    "تصنيف المستند",
                  )}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
                >
                  {ATTACHMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {t(`preAuth.attachments.categories.${cat}`, cat)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("preAuth.attachments.titleLabel", "وصف أو عنوان (اختياري)")}
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t(
                    "preAuth.attachments.titlePlaceholder",
                    "مثال: تقرير أشعة الرنين",
                  )}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">
                {t("preAuth.attachments.file", "الملف (PDF, JPEG, PNG - حد 10MB)")}
              </label>
              <input
                ref={fileInputRef}
                aria-label={t("preAuth.attachments.file", "ملف المرفق")}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={uploading}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {t("preAuth.attachments.upload", "رفع المرفق")}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {loading && (
            <p className="py-6 text-center text-xs text-slate-400">
              {t("common.loading", "جارِ التحميل...")}
            </p>
          )}
          {!loading && attachments.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500">
              {t("preAuth.attachments.empty", "لا توجد مرفقات لهذا الطلب.")}
            </p>
          )}
          {!loading &&
            attachments.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-100">
                      <span>{item.originalFileName}</span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-sky-300">
                        {t(
                          `preAuth.attachments.categories.${item.category}`,
                          item.category,
                        )}
                      </span>
                      {item.retiredAt && (
                        <span className="rounded bg-rose-950 px-2 py-0.5 text-[10px] text-rose-300">
                          {t("preAuth.attachments.retired", "مسحوب")}
                        </span>
                      )}
                    </div>
                    {item.title && (
                      <p className="mt-0.5 text-slate-300">{item.title}</p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {Math.max(1, Math.round(item.sizeBytes / 1024))} KB ·{" "}
                      {item.uploadedBy?.fullName ||
                        item.uploadedBy?.username ||
                        "—"}{" "}
                      · {formatDate(item.createdAt)}
                    </p>
                    {item.retiredAt && item.retireReason && (
                      <p className="mt-1 text-[11px] text-rose-300">
                        {item.retireReason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-300 hover:bg-sky-500/20"
                    >
                      {t("preAuth.attachments.download", "تنزيل")}
                    </button>
                    {auth.status === "PENDING" && !item.retiredAt && (
                      <button
                        type="button"
                        onClick={() => {
                          setRetireTargetId(
                            retireTargetId === item.id ? null : item.id,
                          );
                          setRetireReason("");
                        }}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                      >
                        {t("preAuth.attachments.retire", "سحب")}
                      </button>
                    )}
                  </div>
                </div>

                {retireTargetId === item.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                    <input
                      type="text"
                      value={retireReason}
                      onChange={(e) => setRetireReason(e.target.value)}
                      placeholder={t(
                        "preAuth.attachments.retireReason",
                        "سبب سحب المرفق (5 أحرف على الأقل)",
                      )}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      disabled={retiring}
                      onClick={() => handleRetire(item.id)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                    >
                      {t("common.confirm", "تأكيد")}
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
