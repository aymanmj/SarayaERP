// client/src/components/archive/DocumentViewerModal.tsx
import React, { useEffect, useState } from "react";
import { X, Download, FileLock2, FileText } from "lucide-react";
import { toast } from "sonner";
import { archiveService } from "../../services/archive.service";

interface DocumentViewerModalProps {
  open: boolean;
  onClose: () => void;
  documentId: number | null;
  versionId?: number | null;
  title?: string;
  originalName?: string | null;
  mimeType?: string | null;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  open,
  onClose,
  documentId,
  versionId,
  title,
  originalName,
  mimeType,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [resolvedMime, setResolvedMime] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !documentId) {
      setBlobUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const blob = versionId
          ? await archiveService.downloadVersionBlob(documentId, versionId, true)
          : await archiveService.downloadDocumentBlob(documentId, true);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setResolvedMime(blob.type || mimeType || "application/octet-stream");
      } catch {
        if (!cancelled) {
          toast.error("تعذر فك تشفير وعرض الملف المؤرشف.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, documentId, versionId, mimeType]);

  if (!open || !documentId) return null;

  const isPdf = resolvedMime.includes("pdf");
  const isImage = resolvedMime.startsWith("image/");

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = originalName || `document-${documentId}`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden shadow-2xl text-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <FileLock2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-black">{title || "معاينة المستند"}</h3>
              <div className="text-[11px] text-slate-400 font-mono">
                {originalName || `ARC-${documentId}`} • مفكوك التشفير لحظياً (AES-256-GCM)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {blobUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> تنزيل نسخة
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-auto p-4">
          {loading ? (
            <div className="text-sm text-slate-400 animate-pulse">
              جارِ فك التشفير والتحقق من البصمة الأمنية...
            </div>
          ) : !blobUrl ? (
            <div className="text-sm text-rose-400">لا تتوفر معاينة لهذا الملف.</div>
          ) : isPdf ? (
            <iframe
              src={blobUrl}
              title={title || "PDF Preview"}
              className="w-full h-full rounded-xl border border-slate-800 bg-white"
            />
          ) : isImage ? (
            <img
              src={blobUrl}
              alt={title || "Archive Document"}
              className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
            />
          ) : (
            <div className="text-center space-y-4">
              <FileText className="w-16 h-16 text-sky-400 mx-auto" />
              <div className="text-sm font-bold">
                هذا التنسيق ({resolvedMime}) جاهز للتنزيل ولا يُعرض مباشرة داخل المتصفح.
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
              >
                تنزيل الملف الآن
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
