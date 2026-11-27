// client/src/pages/archive/ArchivePage.tsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FolderArchive,
  FileText,
  Mail,
  Inbox,
  FolderTree,
  Plus,
  Search,
  Star,
  Download,
  Eye,
  Trash2,
  Send,
  History,
  CheckCircle2,
  ShieldAlert,
  FileLock2,
} from "lucide-react";
import {
  archiveService,
  type ArchiveDocumentItem,
  type CorrespondenceItem,
  type CorrespondencePriority,
  type CorrespondenceRoutingItem,
  type CorrespondenceStatus,
  type CorrespondenceType,
} from "../../services/archive.service";
import { DocumentViewerModal } from "../../components/archive/DocumentViewerModal";

type ArchiveTab = "documents" | "correspondence" | "inbox" | "categories";

const CORR_TYPE_LABELS: Record<CorrespondenceType, string> = {
  INCOMING: "وارد",
  OUTGOING: "صادر",
  INTERNAL: "مذكرة داخلية",
};

const CORR_PRIORITY_LABELS: Record<CorrespondencePriority, string> = {
  LOW: "منخفض",
  NORMAL: "عادي",
  HIGH: "مهم",
  URGENT: "عاجل",
};

const CORR_STATUS_LABELS: Record<CorrespondenceStatus, string> = {
  NEW: "جديد",
  IN_PROGRESS: "قيد المتابعة",
  REPLIED: "تم الرد",
  ARCHIVED: "مؤرشف",
  CLOSED: "مغلق",
};

export default function ArchivePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const urlTab = searchParams.get("tab") as ArchiveTab | null;

  const [tab, setTab] = useState<ArchiveTab>(urlTab || "documents");
  useEffect(() => {
    if (
      urlTab &&
      ["documents", "correspondence", "inbox", "categories"].includes(urlTab)
    ) {
      setTab(urlTab);
    }
  }, [urlTab]);

  const switchTab = (next: ArchiveTab) => {
    setTab(next);
    setSearchParams({ tab: next });
  };

  // Filters
  const [docSearch, setDocSearch] = useState("");
  const [docCategoryId, setDocCategoryId] = useState("");
  const [onlyStarred, setOnlyStarred] = useState(false);

  const [corrSearch, setCorrSearch] = useState("");
  const [corrType, setCorrType] = useState("");
  const [corrStatus, setCorrStatus] = useState("");

  // Viewer Modal
  const [viewer, setViewer] = useState<{
    open: boolean;
    documentId: number | null;
    versionId?: number | null;
    title?: string;
    originalName?: string | null;
    mimeType?: string | null;
  }>({ open: false, documentId: null });

  // Create Document Modal
  const [showDocModal, setShowDocModal] = useState(false);
  const [docForm, setDocForm] = useState({
    title: "",
    categoryId: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    tags: "",
  });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);

  // Versions Modal
  const [activeDocForVersions, setActiveDocForVersions] =
    useState<ArchiveDocumentItem | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNotes, setVersionNotes] = useState("");

  // Create Correspondence Modal
  const [showCorrModal, setShowCorrModal] = useState(false);
  const [corrForm, setCorrForm] = useState({
    type: "INCOMING" as CorrespondenceType,
    date: new Date().toISOString().slice(0, 10),
    subject: "",
    senderName: "",
    senderOrg: "",
    receiverName: "",
    receiverOrg: "",
    referenceNo: "",
    priority: "NORMAL" as CorrespondencePriority,
    documentId: "",
    notes: "",
  });

  // Route Correspondence Modal
  const [routeTargetCorr, setRouteTargetCorr] =
    useState<CorrespondenceItem | null>(null);
  const [routeForm, setRouteForm] = useState({
    toUserId: "",
    instructions: "",
  });

  // Acknowledge Inbox Modal
  const [ackTarget, setAckTarget] =
    useState<CorrespondenceRoutingItem | null>(null);
  const [ackForm, setAckForm] = useState({
    actionTaken: "",
    notes: "",
    updateCorrespondenceStatus: "CLOSED" as CorrespondenceStatus,
  });

  // Category Modal
  const [catForm, setCatForm] = useState({
    name: "",
    nameEn: "",
    code: "",
    parentId: "",
  });

  // Queries
  const { data: stats } = useQuery({
    queryKey: ["archive-stats"],
    queryFn: archiveService.getStats,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["archive-categories"],
    queryFn: archiveService.getCategories,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["archive-documents", docSearch, docCategoryId, onlyStarred],
    queryFn: () =>
      archiveService.findAllDocuments({
        search: docSearch.trim() || undefined,
        categoryId: docCategoryId ? Number(docCategoryId) : undefined,
        isStarred: onlyStarred ? "true" : undefined,
      }),
  });

  const { data: correspondenceList = [] } = useQuery({
    queryKey: ["archive-correspondence", corrSearch, corrType, corrStatus],
    queryFn: () =>
      archiveService.findAllCorrespondence({
        search: corrSearch.trim() || undefined,
        type: corrType || undefined,
        status: corrStatus || undefined,
      }),
    enabled: tab === "correspondence",
  });

  const { data: inboxList = [] } = useQuery({
    queryKey: ["archive-inbox"],
    queryFn: () => archiveService.getInbox(false),
    enabled: tab === "inbox",
  });

  const { data: routableUsers = [] } = useQuery({
    queryKey: ["archive-routable-users"],
    queryFn: archiveService.listRoutableUsers,
    enabled: Boolean(routeTargetCorr),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["archive-stats"] });
    queryClient.invalidateQueries({ queryKey: ["archive-categories"] });
    queryClient.invalidateQueries({ queryKey: ["archive-documents"] });
    queryClient.invalidateQueries({ queryKey: ["archive-correspondence"] });
    queryClient.invalidateQueries({ queryKey: ["archive-inbox"] });
  };

  const handleCreateDocument = async () => {
    if (!docForm.title.trim()) {
      toast.warning("أدخل عنوان المستند.");
      return;
    }
    setSavingDoc(true);
    try {
      const fd = new FormData();
      fd.append("title", docForm.title.trim());
      if (docForm.categoryId) fd.append("categoryId", docForm.categoryId);
      if (docForm.description.trim())
        fd.append("description", docForm.description.trim());
      if (docForm.date) fd.append("date", docForm.date);
      if (docForm.tags.trim()) fd.append("tags", docForm.tags.trim());
      if (docFile) fd.append("file", docFile);

      await archiveService.createDocument(fd);
      toast.success("تم حفظ المستند وتشفيره في الأرشيف الإلكتروني بنجاح.");
      setShowDocModal(false);
      setDocForm({
        title: "",
        categoryId: "",
        description: "",
        date: new Date().toISOString().slice(0, 10),
        tags: "",
      });
      setDocFile(null);
      invalidateAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر حفظ المستند.");
    } finally {
      setSavingDoc(false);
    }
  };

  const handleUploadNewVersion = async () => {
    if (!activeDocForVersions || !versionFile) {
      toast.warning("اختر ملف النسخة الجديدة.");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", versionFile);
      if (versionNotes.trim()) fd.append("notes", versionNotes.trim());
      await archiveService.addVersion(activeDocForVersions.id, fd);
      toast.success("تم رفع النسخة الجديدة وتحديث المستند.");
      setVersionFile(null);
      setVersionNotes("");
      const updated = await archiveService.getDocument(activeDocForVersions.id);
      setActiveDocForVersions(updated);
      invalidateAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر رفع النسخة الجديدة.");
    }
  };

  const handleDownloadDirect = async (doc: ArchiveDocumentItem) => {
    try {
      const blob = await archiveService.downloadDocumentBlob(doc.id, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.originalName || `${doc.documentNo}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("تعذر تنزيل الملف.");
    }
  };

  const handleCreateCorrespondence = async () => {
    if (!corrForm.subject.trim()) {
      toast.warning("أدخل موضوع المراسلة.");
      return;
    }
    try {
      await archiveService.createCorrespondence({
        type: corrForm.type,
        date: corrForm.date || undefined,
        subject: corrForm.subject.trim(),
        senderName: corrForm.senderName.trim() || undefined,
        senderOrg: corrForm.senderOrg.trim() || undefined,
        receiverName: corrForm.receiverName.trim() || undefined,
        receiverOrg: corrForm.receiverOrg.trim() || undefined,
        referenceNo: corrForm.referenceNo.trim() || undefined,
        priority: corrForm.priority,
        documentId: corrForm.documentId ? Number(corrForm.documentId) : undefined,
        notes: corrForm.notes.trim() || undefined,
      });
      toast.success("تم قيد المراسلة بنجاح.");
      setShowCorrModal(false);
      setCorrForm({
        type: "INCOMING",
        date: new Date().toISOString().slice(0, 10),
        subject: "",
        senderName: "",
        senderOrg: "",
        receiverName: "",
        receiverOrg: "",
        referenceNo: "",
        priority: "NORMAL",
        documentId: "",
        notes: "",
      });
      invalidateAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر تسجيل المراسلة.");
    }
  };

  const handleRouteSubmit = async () => {
    if (!routeTargetCorr || !routeForm.toUserId) {
      toast.warning("اختر الموظف المحال إليه.");
      return;
    }
    try {
      await archiveService.routeCorrespondence(routeTargetCorr.id, {
        toUserId: Number(routeForm.toUserId),
        instructions: routeForm.instructions.trim() || undefined,
      });
      toast.success("تمت إحالة المراسلة وإرسال إشعار فوري للمستخدم.");
      setRouteTargetCorr(null);
      setRouteForm({ toUserId: "", instructions: "" });
      invalidateAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر إحالة المراسلة.");
    }
  };

  const handleAcknowledgeSubmit = async () => {
    if (!ackTarget) return;
    try {
      await archiveService.acknowledgeRouting(ackTarget.id, {
        actionTaken: ackForm.actionTaken.trim() || undefined,
        notes: ackForm.notes.trim() || undefined,
        updateCorrespondenceStatus: ackForm.updateCorrespondenceStatus,
      });
      toast.success("تم استلام الإحالة وتوثيق الإجراء المتخذ.");
      setAckTarget(null);
      setAckForm({
        actionTaken: "",
        notes: "",
        updateCorrespondenceStatus: "CLOSED",
      });
      invalidateAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر تأكيد الإحالة.");
    }
  };

  const handleCreateCategory = async () => {
    if (!catForm.name.trim()) {
      toast.warning("أدخل اسم التصنيف.");
      return;
    }
    try {
      await archiveService.createCategory({
        name: catForm.name.trim(),
        nameEn: catForm.nameEn.trim() || undefined,
        code: catForm.code.trim() || undefined,
        parentId: catForm.parentId ? Number(catForm.parentId) : undefined,
      });
      toast.success("تمت إضافة التصنيف بنجاح.");
      setCatForm({ name: "", nameEn: "", code: "", parentId: "" });
      invalidateAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر إنشاء التصنيف.");
    }
  };

  return (
    <div className="p-6 text-slate-100 h-full flex flex-col space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-500/15 border border-sky-500/40 text-sky-400">
            <FolderArchive className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black">
              الأرشيف الإلكتروني والصادر والوارد (Archive & DMS)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              حفظ وتوثيق المستندات المؤسسية والإدارية والعقود والمراسلات الرسمية بتشفير AES-256-GCM وفحص أمني ClamAV
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowCorrModal(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2"
          >
            <Mail className="w-4 h-4" /> تسجيل صادر / وارد
          </button>
          <button
            type="button"
            onClick={() => setShowDocModal(true)}
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black flex items-center gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" /> أرشفة مستند جديد
          </button>
        </div>
      </div>

      {/* Governance Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-xs text-amber-200 flex items-center gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>نطاق الحوكمة:</strong> مخصص للأرشيف الإداري والعقود والتراخيص والمراسلات الرسمية للمؤسسة (منفصل تماماً عن السجل الطبي الإلكتروني للمرضى EMR).
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-slate-400">المستندات المؤرشفة</div>
          <div className="text-2xl font-black mt-1 text-white">
            {stats?.totalDocuments ?? 0}
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-slate-400">الوارد الرسمي</div>
          <div className="text-2xl font-black mt-1 text-emerald-400">
            {stats?.incomingCount ?? 0}
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-slate-400">الصادر والمذكرات</div>
          <div className="text-2xl font-black mt-1 text-sky-400">
            {(stats?.outgoingCount ?? 0) + (stats?.internalCount ?? 0)}
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-slate-400">إحالات واردة بانتظار المراجعة</div>
          <div className="text-2xl font-black mt-1 text-rose-400">
            {stats?.unreadInboxCount ?? 0}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2 rounded-2xl border border-slate-800 w-fit">
        {[
          {
            id: "documents",
            label: "المستندات المؤرشفة",
            icon: <FileText className="w-4 h-4" />,
          },
          {
            id: "correspondence",
            label: "الصادر والوارد والمذكرات",
            icon: <Mail className="w-4 h-4" />,
          },
          {
            id: "inbox",
            label: `صندوق الإحالات (${stats?.unreadInboxCount ?? 0})`,
            icon: <Inbox className="w-4 h-4" />,
          },
          {
            id: "categories",
            label: "التصنيفات الشجرية",
            icon: <FolderTree className="w-4 h-4" />,
          },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id as ArchiveTab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              tab === t.id
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: DOCUMENTS */}
      {tab === "documents" && (
        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center text-xs">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="بحث برقم المستند، العنوان، الوسوم..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2"
              />
            </div>
            <select
              value={docCategoryId}
              onChange={(e) => setDocCategoryId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              <option value="">كل التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-slate-950 border border-slate-700">
              <input
                type="checkbox"
                checked={onlyStarred}
                onChange={(e) => setOnlyStarred(e.target.checked)}
              />
              المميزة بنجمة فقط
            </label>
          </div>

          <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-auto shadow-2xl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3.5">الرقم الأرشيفي</th>
                  <th className="px-4 py-3.5">عنوان المستند والوسوم</th>
                  <th className="px-4 py-3.5">التصنيف</th>
                  <th className="px-4 py-3.5">الحماية والإصدارات</th>
                  <th className="px-4 py-3.5">التاريخ</th>
                  <th className="px-4 py-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      لا توجد مستندات مؤرشفة.
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono text-sky-300 font-bold">
                        {doc.documentNo}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-100">
                          {doc.title}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {doc.tags?.map((tg) => (
                            <span
                              key={tg}
                              className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]"
                            >
                              #{tg}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {doc.category?.name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {doc.storagePath && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 text-[10px]">
                              <FileLock2 className="w-3 h-3" /> AES-256
                            </span>
                          )}
                          <span className="text-slate-400 font-mono">
                            v{doc._count?.versions ?? 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono">
                        {doc.date.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await archiveService.toggleStar(doc.id);
                              invalidateAll();
                            }}
                            title="تمييز"
                            className={`p-1.5 rounded-lg bg-slate-800 ${
                              doc.isStarred
                                ? "text-amber-400"
                                : "text-slate-500 hover:text-amber-300"
                            }`}
                          >
                            <Star className="w-4 h-4" />
                          </button>
                          {doc.storagePath && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setViewer({
                                    open: true,
                                    documentId: doc.id,
                                    title: doc.title,
                                    originalName: doc.originalName,
                                    mimeType: doc.mimeType,
                                  })
                                }
                                title="معاينة آمنة"
                                className="p-1.5 rounded-lg bg-slate-800 text-sky-400 hover:bg-sky-500/20"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadDirect(doc)}
                                title="تنزيل"
                                className="p-1.5 rounded-lg bg-slate-800 text-emerald-400 hover:bg-emerald-500/20"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              const full = await archiveService.getDocument(doc.id);
                              setActiveDocForVersions(full);
                            }}
                            title="سجل الإصدارات"
                            className="p-1.5 rounded-lg bg-slate-800 text-indigo-400 hover:bg-indigo-500/20"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`حذف المستند "${doc.title}"؟`)) return;
                              await archiveService.deleteDocument(doc.id);
                              toast.success("تم حذف المستند.");
                              invalidateAll();
                            }}
                            title="حذف"
                            className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-500/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CORRESPONDENCE */}
      {tab === "correspondence" && (
        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 text-xs">
            <input
              value={corrSearch}
              onChange={(e) => setCorrSearch(e.target.value)}
              placeholder="بحث بالرقم، الموضوع، الجهة..."
              className="flex-1 min-w-[220px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <select
              value={corrType}
              onChange={(e) => setCorrType(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              <option value="">كل الأنواع</option>
              <option value="INCOMING">وارد</option>
              <option value="OUTGOING">صادر</option>
              <option value="INTERNAL">مذكرة داخلية</option>
            </select>
            <select
              value={corrStatus}
              onChange={(e) => setCorrStatus(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              <option value="">كل الحالات</option>
              <option value="NEW">جديد</option>
              <option value="IN_PROGRESS">قيد المتابعة</option>
              <option value="REPLIED">تم الرد</option>
              <option value="CLOSED">مغلق</option>
              <option value="ARCHIVED">مؤرشف</option>
            </select>
          </div>

          <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-auto shadow-2xl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3.5">الرقم</th>
                  <th className="px-4 py-3.5">النوع</th>
                  <th className="px-4 py-3.5">الموضوع والجهة</th>
                  <th className="px-4 py-3.5">الأولوية</th>
                  <th className="px-4 py-3.5">الحالة</th>
                  <th className="px-4 py-3.5">المستند المرفق</th>
                  <th className="px-4 py-3.5 text-center">إحالة / إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {correspondenceList.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono font-bold text-sky-300">
                      {c.correspondenceNo}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        {CORR_TYPE_LABELS[c.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100">{c.subject}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {c.senderOrg || c.receiverOrg || "—"} • {c.date.slice(0, 10)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {CORR_PRIORITY_LABELS[c.priority]}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">
                        {CORR_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.document ? (
                        <button
                          type="button"
                          onClick={() =>
                            setViewer({
                              open: true,
                              documentId: c.document!.id,
                              title: c.document!.title,
                              originalName: c.document!.originalName,
                              mimeType: c.document!.mimeType,
                            })
                          }
                          className="text-sky-400 hover:underline font-mono"
                        >
                          {c.document.documentNo}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRouteTargetCorr(c)}
                          className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 font-bold flex items-center gap-1"
                        >
                          <Send className="w-3.5 h-3.5" /> إحالة
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm("حذف المراسلة؟")) return;
                            await archiveService.deleteCorrespondence(c.id);
                            invalidateAll();
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-500/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INBOX */}
      {tab === "inbox" && (
        <div className="space-y-3 text-xs">
          {inboxList.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-slate-900/40 rounded-3xl border border-slate-800">
              صندوق الإحالات فارغ حالياً.
            </div>
          ) : (
            inboxList.map((r) => (
              <div
                key={r.id}
                className={`p-4 rounded-2xl border flex flex-wrap justify-between items-center gap-4 ${
                  r.readAt
                    ? "bg-slate-900/40 border-slate-800"
                    : "bg-sky-950/25 border-sky-500/40"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sky-300">
                      {r.correspondence?.correspondenceNo}
                    </span>
                    <span className="font-bold text-sm text-white">
                      {r.correspondence?.subject}
                    </span>
                    {!r.readAt && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                        جديد
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400">
                    محالة من: {r.fromUser?.fullName || "—"} • {r.sentAt.slice(0, 10)}
                  </div>
                  {r.instructions && (
                    <div className="text-sky-200">التوجيه: {r.instructions}</div>
                  )}
                  {r.actionTaken && (
                    <div className="text-emerald-300">
                      الإجراء المتخذ: {r.actionTaken}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {r.correspondence?.document && (
                    <button
                      type="button"
                      onClick={() =>
                        setViewer({
                          open: true,
                          documentId: r.correspondence!.document!.id,
                          title: r.correspondence!.document!.title,
                          originalName: r.correspondence!.document!.originalName,
                          mimeType: r.correspondence!.document!.mimeType,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" /> المرفق
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAckTarget(r);
                      setAckForm({
                        actionTaken: r.actionTaken || "",
                        notes: r.notes || "",
                        updateCorrespondenceStatus: "CLOSED",
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> استلام وتسجيل الإجراء
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: CATEGORIES */}
      {tab === "categories" && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 items-end">
            <input
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              placeholder="اسم التصنيف *"
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <input
              value={catForm.nameEn}
              onChange={(e) => setCatForm({ ...catForm, nameEn: e.target.value })}
              placeholder="الاسم بالإنجليزية"
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <input
              value={catForm.code}
              onChange={(e) => setCatForm({ ...catForm, code: e.target.value })}
              placeholder="الرمز (CAT-...)"
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
            />
            <select
              value={catForm.parentId}
              onChange={(e) => setCatForm({ ...catForm, parentId: e.target.value })}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              <option value="">تصنيف رئيسي</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  فرعي تحت: {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCreateCategory}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              + إضافة تصنيف
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">الرمز</th>
                  <th className="px-4 py-3">التصنيف</th>
                  <th className="px-4 py-3">يتبع لـ</th>
                  <th className="px-4 py-3 text-center">المستندات</th>
                  <th className="px-4 py-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-sky-300">{c.code}</td>
                    <td className="px-4 py-3 font-bold">
                      {c.name}
                      {c.nameEn && (
                        <div className="text-[11px] text-slate-500">{c.nameEn}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {c.parent?.name || "رئيسي"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {c._count?.documents ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          await archiveService.deleteCategory(c.id);
                          invalidateAll();
                        }}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Document Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg space-y-3 text-xs">
            <h3 className="text-base font-black">أرشفة مستند جديد</h3>
            <input
              value={docForm.title}
              onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
              placeholder="عنوان المستند *"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={docForm.categoryId}
                onChange={(e) =>
                  setDocForm({ ...docForm, categoryId: e.target.value })
                }
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="">اختر التصنيف...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={docForm.date}
                onChange={(e) => setDocForm({ ...docForm, date: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <input
              value={docForm.tags}
              onChange={(e) => setDocForm({ ...docForm, tags: e.target.value })}
              placeholder="الوسوم مفصولة بفاصلة (مثال: ترخيص,2026,رسمي)"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <textarea
              value={docForm.description}
              onChange={(e) =>
                setDocForm({ ...docForm, description: e.target.value })
              }
              placeholder="وصف مختصر"
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <label className="block text-slate-400 mb-1">
                ملف الوثيقة (يُفحص ويُشفّر بـ AES-256-GCM)
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={savingDoc}
                onClick={handleCreateDocument}
                className="px-5 py-2 rounded-xl bg-sky-600 text-white font-bold"
              >
                {savingDoc ? "جارِ التشفير والحفظ..." : "حفظ وأرشفة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {activeDocForVersions && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-2xl space-y-4 text-xs">
            <h3 className="text-base font-black">
              سجل إصدارات المستند: {activeDocForVersions.title}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
              <input
                type="file"
                onChange={(e) => setVersionFile(e.target.files?.[0] ?? null)}
              />
              <input
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                placeholder="ملاحظات الإصدار الجديد"
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5"
              />
              <button
                type="button"
                onClick={handleUploadNewVersion}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold"
              >
                + رفع نسخة جديدة
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(activeDocForVersions.versions || []).map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 flex justify-between items-center"
                >
                  <div>
                    <span className="font-mono font-bold text-sky-300">
                      v{v.versionNumber}
                    </span>{" "}
                    — {v.originalName}
                    {v.notes && (
                      <div className="text-slate-400 mt-0.5">{v.notes}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setViewer({
                        open: true,
                        documentId: activeDocForVersions.id,
                        versionId: v.id,
                        title: `${activeDocForVersions.title} (v${v.versionNumber})`,
                        originalName: v.originalName,
                        mimeType: v.mimeType,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-sky-400 flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> معاينة
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveDocForVersions(null)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Correspondence Modal */}
      {showCorrModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg space-y-3 text-xs">
            <h3 className="text-base font-black">تسجيل مراسلة رسمية (صادر / وارد)</h3>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={corrForm.type}
                onChange={(e) =>
                  setCorrForm({
                    ...corrForm,
                    type: e.target.value as CorrespondenceType,
                  })
                }
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="INCOMING">وارد</option>
                <option value="OUTGOING">صادر</option>
                <option value="INTERNAL">مذكرة داخلية</option>
              </select>
              <select
                value={corrForm.priority}
                onChange={(e) =>
                  setCorrForm({
                    ...corrForm,
                    priority: e.target.value as CorrespondencePriority,
                  })
                }
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="NORMAL">عادي</option>
                <option value="HIGH">مهم</option>
                <option value="URGENT">عاجل</option>
                <option value="LOW">منخفض</option>
              </select>
              <input
                type="date"
                value={corrForm.date}
                onChange={(e) => setCorrForm({ ...corrForm, date: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <input
              value={corrForm.subject}
              onChange={(e) => setCorrForm({ ...corrForm, subject: e.target.value })}
              placeholder="الموضوع *"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={corrForm.senderOrg}
                onChange={(e) =>
                  setCorrForm({ ...corrForm, senderOrg: e.target.value })
                }
                placeholder="الجهة المرسلة"
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
              <input
                value={corrForm.receiverOrg}
                onChange={(e) =>
                  setCorrForm({ ...corrForm, receiverOrg: e.target.value })
                }
                placeholder="الجهة المستلمة"
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={corrForm.referenceNo}
                onChange={(e) =>
                  setCorrForm({ ...corrForm, referenceNo: e.target.value })
                }
                placeholder="الرقم الإشاري الخارجي"
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
              />
              <select
                value={corrForm.documentId}
                onChange={(e) =>
                  setCorrForm({ ...corrForm, documentId: e.target.value })
                }
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="">ربط بمستند مؤرشف (اختياري)</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.documentNo} — {d.title}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={corrForm.notes}
              onChange={(e) => setCorrForm({ ...corrForm, notes: e.target.value })}
              placeholder="ملاحظات"
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCorrModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleCreateCorrespondence}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
              >
                حفظ المراسلة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Route Modal */}
      {routeTargetCorr && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-3 text-xs">
            <h3 className="text-base font-black">
              إحالة المراسلة {routeTargetCorr.correspondenceNo}
            </h3>
            <select
              value={routeForm.toUserId}
              onChange={(e) =>
                setRouteForm({ ...routeForm, toUserId: e.target.value })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              <option value="">اختر الموظف المحال إليه...</option>
              {routableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username})
                </option>
              ))}
            </select>
            <textarea
              value={routeForm.instructions}
              onChange={(e) =>
                setRouteForm({ ...routeForm, instructions: e.target.value })
              }
              placeholder="التوجيهات أو المطلوب تنفيذه"
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRouteTargetCorr(null)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleRouteSubmit}
                className="px-5 py-2 rounded-xl bg-sky-600 text-white font-bold"
              >
                إرسال الإحالة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledge Inbox Modal */}
      {ackTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-3 text-xs">
            <h3 className="text-base font-black">تأكيد الاستلام وتسجيل الإجراء</h3>
            <textarea
              value={ackForm.actionTaken}
              onChange={(e) =>
                setAckForm({ ...ackForm, actionTaken: e.target.value })
              }
              placeholder="الإجراء المتخذ بشأن المراسلة"
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <select
              value={ackForm.updateCorrespondenceStatus}
              onChange={(e) =>
                setAckForm({
                  ...ackForm,
                  updateCorrespondenceStatus: e.target
                    .value as CorrespondenceStatus,
                })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              <option value="IN_PROGRESS">تحديث الحالة: قيد المتابعة</option>
              <option value="REPLIED">تحديث الحالة: تم الرد</option>
              <option value="CLOSED">تحديث الحالة: مغلق / منجز</option>
              <option value="ARCHIVED">تحديث الحالة: مؤرشف</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAckTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleAcknowledgeSubmit}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold"
              >
                حفظ وتأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentViewerModal
        open={viewer.open}
        onClose={() => setViewer({ open: false, documentId: null })}
        documentId={viewer.documentId}
        versionId={viewer.versionId}
        title={viewer.title}
        originalName={viewer.originalName}
        mimeType={viewer.mimeType}
      />
    </div>
  );
}
